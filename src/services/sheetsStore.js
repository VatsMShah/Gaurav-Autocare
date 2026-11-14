const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const config = require('../config');
const logger = require('../utils/logger');

let docPromise = null;

// In-memory cache for fast read responses without delaying WhatsApp turns
const rateCache = {
  data: {
    Diesel: 98.18,
    Petrol: 111.55,
    XP95: 120.58,
    CNG: 90.00,
  },
  lastFetched: 0,
  ttl: 10 * 60 * 1000, // 10 minutes cache
};

const customerCache = new Map();

/**
 * Lazily authenticates and loads the spreadsheet once, then reuses it.
 */
function getDoc() {
  if (!config.google?.isConfigured) {
    throw new Error(
      'Google Sheets is not configured in .env. Please provide either GOOGLE_SHEET_WEBHOOK_URL or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY.'
    );
  }
  if (!docPromise) {
    const auth = new JWT({
      email: config.google.serviceAccountEmail,
      key: config.google.privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(config.google.sheetId, auth);
    docPromise = doc.loadInfo().then(() => doc);
  }
  return docPromise;
}

/**
 * Gets sheet tab, or automatically creates it with headers if it does not exist
 */
async function getSheet(tabTitle, defaultHeaders = []) {
  const doc = await getDoc();
  let sheet = doc.sheetsByTitle[tabTitle];

  if (!sheet) {
    if (doc.sheetCount === 1 && doc.sheetsByIndex[0]?.title === 'Sheet1') {
      sheet = doc.sheetsByIndex[0];
      await sheet.updateProperties({ title: tabTitle });
      if (defaultHeaders.length > 0) {
        await sheet.setHeaderRow(defaultHeaders);
      }
      logger.info(`Renamed initial Sheet1 to "${tabTitle}" with headers.`);
    } else {
      sheet = await doc.addSheet({ title: tabTitle, headerValues: defaultHeaders });
      logger.info(`Created new sheet tab "${tabTitle}".`);
    }
  }

  return sheet;
}

/**
 * Helper to call Google Apps Script Webhook safely with timeout
 */
async function callAppsScript(payload, timeoutMs = 15000) {
  if (!config.google?.webhookUrl) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(config.google.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      logger.warn(`Google Sheet Webhook returned HTTP ${res.status}`);
      return null;
    }

    const data = await res.json().catch(() => null);
    return data;
  } catch (err) {
    clearTimeout(timer);
    logger.warn('Google Sheet Webhook call failed:', err.message);
    return null;
  }
}

/**
 * Fetches daily fuel rates from Google Sheet (with 10-minute caching)
 */
async function getFuelRates() {
  const now = Date.now();
  if (now - rateCache.lastFetched < rateCache.ttl) {
    return rateCache.data;
  }

  // 1. Try Apps Script Webhook
  if (config.google?.webhookUrl) {
    try {
      const res = await callAppsScript({ action: 'get_rates' }, 6000);
      if (res && res.status === 'success' && res.rates) {
        rateCache.data = {
          Diesel: parseFloat(res.rates.Diesel) || 98.18,
          Petrol: parseFloat(res.rates.Petrol) || 111.55,
          XP95: parseFloat(res.rates.XP95) || 120.58,
          CNG: parseFloat(res.rates.CNG) || 90.00,
        };
        rateCache.lastFetched = now;
        logger.info('⛽ Refreshed live fuel rates from Google Sheet:', rateCache.data);
        return rateCache.data;
      }
    } catch (e) {
      logger.debug('Rates fetch via webhook error: ' + e.message);
    }
  }

  // 2. Try direct Google Sheets API (if configured)
  if (config.google?.serviceAccountEmail && config.google?.privateKey) {
    try {
      const sheet = await getSheet('fuel_rates', ['Fuel Type', 'Rate per Litre (₹)']);
      const rows = await sheet.getRows();
      for (const row of rows) {
        const type = String(row.get('Fuel Type') || '').trim().toLowerCase();
        const rate = parseFloat(row.get('Rate per Litre (₹)') || row.get('rate_per_litre')) || 0;
        if (rate > 0) {
          if (type.includes('xp95')) rateCache.data.XP95 = rate;
          else if (type.includes('diesel') || type.includes('hsd')) rateCache.data.Diesel = rate;
          else if (type.includes('petrol') || type.includes('ms')) rateCache.data.Petrol = rate;
          else if (type.includes('cng')) rateCache.data.CNG = rate;
        }
      }
      rateCache.lastFetched = now;
      return rateCache.data;
    } catch (err) {
      logger.debug('Direct sheets API rates fetch error: ' + err.message);
    }
  }

  return rateCache.data;
}

/**
 * Look up customer details by phone number from Google Sheet (cached)
 */
async function getCustomerByPhone(phone) {
  if (!phone) return null;
  const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);

  if (customerCache.has(cleanPhone)) {
    return customerCache.get(cleanPhone);
  }

  // 1. Try Apps Script Webhook (2s fast timeout)
  if (config.google?.webhookUrl) {
    try {
      const res = await callAppsScript({ action: 'get_customer', phone: cleanPhone }, 2000);
      if (res && res.status === 'success' && res.customer) {
        customerCache.set(cleanPhone, res.customer);
        logger.info('👥 Identified registered customer from Google Sheet:', res.customer.name);
        return res.customer;
      }
    } catch (e) {
      logger.debug('Customer lookup via webhook error: ' + e.message);
    }
  }

  // 2. Try direct Google Sheets API
  if (config.google?.serviceAccountEmail && config.google?.privateKey) {
    try {
      const sheet = await getSheet('customers', ['Phone Number', 'Customer / Fleet Name']);
      const rows = await sheet.getRows();
      for (const row of rows) {
        const rowPhone = String(row.get('Phone Number') || row.get('phone') || '').replace(/\D/g, '').slice(-10);
        if (rowPhone === cleanPhone) {
          const cust = {
            phone: row.get('Phone Number') || row.get('phone'),
            name: row.get('Customer / Fleet Name') || row.get('name'),
            company_name: row.get('Company Name') || row.get('company_name') || '',
            gstin: row.get('GSTIN') || row.get('gstin') || '',
            group_ids: row.get('Group IDs') || row.get('group_ids') || '',
          };
          customerCache.set(cleanPhone, cust);
          return cust;
        }
      }
    } catch (err) {
      logger.debug('Direct sheets API customer lookup error: ' + err.message);
    }
  }

  // Cache negative result for 2 minutes to prevent repeated slow webhook calls
  customerCache.set(cleanPhone, null);
  setTimeout(() => customerCache.delete(cleanPhone), 2 * 60 * 1000);
  return null;
}

/**
 * Filter rows where column equals value
 */
async function findRows(tabTitle, column, value) {
  // Option 1: Webhook Mode
  if (config.google?.webhookUrl) {
    const res = await callAppsScript({
      action: 'find',
      tabTitle,
      matchColumn: column,
      value,
    });
    if (res && res.status === 'success' && Array.isArray(res.rows)) {
      return res.rows;
    }
    return [];
  }

  // Option 2: Direct Google Sheets API
  const sheet = await getSheet(tabTitle, [column]);
  try {
    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();
    return rows.filter((r) => String(r.get(column) ?? '') === String(value ?? ''));
  } catch (err) {
    logger.warn(`Could not load header row for ${tabTitle}:`, err.message);
    return [];
  }
}

/**
 * Append or update a row in Google Sheet
 */
async function upsertRow(tabTitle, matchColumn, data) {
  // Option 1: Fast Webhook Sync (via Google Apps Script)
  if (config.google?.webhookUrl) {
    const res = await callAppsScript({
      action: 'upsert',
      tabTitle,
      matchColumn,
      data,
      sheetId: config.google.sheetId,
    });

    if (res && res.status === 'success') {
      logger.info(`✅ Auto-synced row to Google Sheet (via Webhook) in "${tabTitle}"`, {
        [matchColumn]: data[matchColumn],
      });
      return data;
    }
    return data;
  }

  // Option 2: Direct Google Sheets API (via Service Account)
  const headers = Object.keys(data).filter((k) => typeof data[k] !== 'function');
  const sheet = await getSheet(tabTitle, headers);

  let headerValues = [];
  try {
    await sheet.loadHeaderRow();
    headerValues = sheet.headerValues || [];
  } catch {
    await sheet.setHeaderRow(headers);
    headerValues = headers;
  }

  const missingHeaders = headers.filter((h) => !headerValues.includes(h));
  if (missingHeaders.length > 0) {
    const updatedHeaders = [...headerValues, ...missingHeaders];
    await sheet.setHeaderRow(updatedHeaders);
  }

  const rows = await sheet.getRows();
  const matchValue = String(data[matchColumn] ?? '');
  const existing = rows.find((r) => String(r.get(matchColumn) ?? '') === matchValue);

  if (existing) {
    for (const [key, value] of Object.entries(data)) {
      existing.set(key, value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : value);
    }
    await existing.save();
    logger.info(`✅ Updated row in Google Sheet "${tabTitle}"`, { [matchColumn]: matchValue });
    return existing.toObject();
  }

  const cleanData = {};
  for (const [k, v] of Object.entries(data)) {
    cleanData[k] = v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : v;
  }

  const newRow = await sheet.addRow(cleanData);
  logger.info(`✅ Appended row in Google Sheet "${tabTitle}"`, { [matchColumn]: matchValue });
  return newRow.toObject();
}

const managerPhoneCache = {
  data: new Set(['9323265076', '9820500159']),
  lastFetched: 0,
  ttl: 5 * 60 * 1000, // 5 minutes cache
};

/**
 * Fetch Manager access phone numbers directly from Google Sheets 'customers' tab (Column B)
 */
async function getManagerPhones() {
  const now = Date.now();
  if (managerPhoneCache.data.size > 0 && (now - managerPhoneCache.lastFetched) < managerPhoneCache.ttl) {
    return managerPhoneCache.data;
  }

  if (!config.google?.webhookUrl && (!config.google?.serviceAccountEmail || !config.google?.privateKey)) {
    return managerPhoneCache.data;
  }

  try {
    const rows = await findRows('customers', 'Company Name', 'Sheetal Parivahan');
    if (Array.isArray(rows) && rows.length > 0) {
      const newSet = new Set();
      for (const row of rows) {
        const raw = String(
          row['Manager access Phone Numbers'] ||
          row['manager_access_phone_numbers'] ||
          row['manager_phones'] ||
          ''
        );
        const matches = raw.match(/\d{10,12}/g) || [];
        for (const m of matches) {
          newSet.add(m.slice(-10));
        }
        const singleClean = raw.replace(/\D/g, '');
        if (singleClean.length >= 10) {
          newSet.add(singleClean.slice(-10));
        }
      }

      if (newSet.size > 0) {
        managerPhoneCache.data = newSet;
        managerPhoneCache.lastFetched = now;
        logger.info('👥 Synced Manager Phones from Google Sheet Column B:', Array.from(newSet));
      }
    }
  } catch (err) {
    logger.warn('Failed to fetch manager phones from Google Sheet, using cache/fallback:', err.message);
  }

  return managerPhoneCache.data;
}

const DEFAULT_MANAGER_PHONES = '9323265076';
const DEFAULT_AUTH_PHONES = '9076021348, 7400062501, 9324993903, 7738022509, 8291083855, 9920981780, 7777030315, 9594780757, 9324983249, 9833611124, 7985916674, 9820500159, 9820216600, 9867025711, 8976976900, 9323265076';

/**
 * Add a new vehicle to fleet_vehicles tab and update customers tab
 */
async function addVehicle(vehicleNo, companyName = 'Sheetal Parivahan') {
  const clean = String(vehicleNo || '').toUpperCase().replace(/[\s-]/g, '');
  const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  // Invalidate in-memory cache
  customerCache.clear();

  // 1. Save to fleet_vehicles tab
  await upsertRow('fleet_vehicles', 'Vehicle No', {
    'Company Name': companyName,
    'Vehicle No': clean,
    'Last Updated (IST)': nowStr,
  });

  // 2. Update customers tab Column D while strictly preserving Columns B and C
  try {
    const custRows = await findRows('customers', 'Company Name', companyName);
    const existing = custRows && custRows.length > 0 ? custRows[0] : {};
    let currentVehicles = String(existing['Vehicle Numbers'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!currentVehicles.includes(clean)) {
      currentVehicles.push(clean);
    }

    const mgrPhones = existing['Manager access Phone Numbers'] || DEFAULT_MANAGER_PHONES;
    const authPhones = existing['Authorized Phone Numbers'] || DEFAULT_AUTH_PHONES;

    await upsertRow('customers', 'Company Name', {
      'Company Name': companyName,
      'Manager access Phone Numbers': mgrPhones,
      'Authorized Phone Numbers': authPhones,
      'Vehicle Numbers': currentVehicles.join(', '),
      'Last Updated (IST)': nowStr,
    });
  } catch (err) {
    logger.warn('Failed to update customers tab with new vehicle:', err.message);
  }

  customerCache.clear();
  return { success: true, vehicleNo: clean };
}

/**
 * Edit an existing vehicle in fleet_vehicles and customers tab
 */
async function editVehicle(oldVehicleNo, newVehicleNo, companyName = 'Sheetal Parivahan') {
  const cleanOld = String(oldVehicleNo || '').toUpperCase().replace(/[\s-]/g, '');
  const cleanNew = String(newVehicleNo || '').toUpperCase().replace(/[\s-]/g, '');
  const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  // Invalidate in-memory cache
  customerCache.clear();

  // 1. Try atomic Apps Script action (updates fleet_vehicles row and customers Column D in one step)
  if (config.google?.webhookUrl) {
    try {
      const res = await callAppsScript({
        action: 'edit_vehicle',
        oldVehicleNo: cleanOld,
        newVehicleNo: cleanNew,
        companyName,
      }, 15000);
      if (res && res.status === 'success' && (res.updatedFleet || res.updatedCust)) {
        logger.info(`✅ Atomic edit_vehicle succeeded: ${cleanOld} -> ${cleanNew}`);
        customerCache.clear();
        return { success: true, oldVehicleNo: cleanOld, newVehicleNo: cleanNew };
      }
    } catch (e) {
      logger.warn('Atomic edit_vehicle call failed, falling back:', e.message);
    }
  }

  // 2. Fallback: Update fleet_vehicles tab
  await upsertRow('fleet_vehicles', 'Vehicle No', {
    'Company Name': companyName,
    'Vehicle No': cleanNew,
    'Last Updated (IST)': nowStr,
  });

  // 3. Update customers tab Column D while strictly preserving Columns B and C
  try {
    const custRows = await findRows('customers', 'Company Name', companyName);
    const existing = custRows && custRows.length > 0 ? custRows[0] : {};
    let currentVehicles = String(existing['Vehicle Numbers'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    currentVehicles = currentVehicles.map((v) => (v === cleanOld ? cleanNew : v));
    if (!currentVehicles.includes(cleanNew)) {
      currentVehicles.push(cleanNew);
    }

    const mgrPhones = existing['Manager access Phone Numbers'] || DEFAULT_MANAGER_PHONES;
    const authPhones = existing['Authorized Phone Numbers'] || DEFAULT_AUTH_PHONES;

    await upsertRow('customers', 'Company Name', {
      'Company Name': companyName,
      'Manager access Phone Numbers': mgrPhones,
      'Authorized Phone Numbers': authPhones,
      'Vehicle Numbers': currentVehicles.join(', '),
      'Last Updated (IST)': nowStr,
    });
  } catch (err) {
    logger.warn('Failed to update customers tab on edit vehicle:', err.message);
  }

  customerCache.clear();
  return { success: true, oldVehicleNo: cleanOld, newVehicleNo: cleanNew };
}

/**
 * Delete / Deactivate a vehicle from fleet_vehicles and customers tab
 */
async function deleteVehicle(vehicleNo, companyName = 'Sheetal Parivahan') {
  const clean = String(vehicleNo || '').toUpperCase().replace(/[\s-]/g, '');
  const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  // Invalidate in-memory cache
  customerCache.clear();

  // 1. Try atomic Apps Script action (updates fleet_vehicles row and customers Column D in one step)
  if (config.google?.webhookUrl) {
    try {
      const res = await callAppsScript({
        action: 'delete_vehicle',
        vehicleNo: clean,
        companyName,
      }, 15000);
      if (res && res.status === 'success' && (res.deletedFleet || res.deletedCust)) {
        logger.info(`✅ Atomic delete_vehicle succeeded: ${clean}`);
        customerCache.clear();
        return { success: true, vehicleNo: clean };
      }
    } catch (e) {
      logger.warn('Atomic delete_vehicle call failed, falling back:', e.message);
    }
  }

  // 2. Fallback: Soft delete in fleet_vehicles: mark inactive
  await upsertRow('fleet_vehicles', 'Vehicle No', {
    'Company Name': companyName,
    'Vehicle No': clean + ' (INACTIVE)',
    'Last Updated (IST)': nowStr,
  });

  // 3. Remove from customers tab Column D while strictly preserving Columns B and C
  try {
    const custRows = await findRows('customers', 'Company Name', companyName);
    const existing = custRows && custRows.length > 0 ? custRows[0] : {};
    let currentVehicles = String(existing['Vehicle Numbers'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    currentVehicles = currentVehicles.filter((v) => v !== clean);

    const mgrPhones = existing['Manager access Phone Numbers'] || DEFAULT_MANAGER_PHONES;
    const authPhones = existing['Authorized Phone Numbers'] || DEFAULT_AUTH_PHONES;

    await upsertRow('customers', 'Company Name', {
      'Company Name': companyName,
      'Manager access Phone Numbers': mgrPhones,
      'Authorized Phone Numbers': authPhones,
      'Vehicle Numbers': currentVehicles.join(', '),
      'Last Updated (IST)': nowStr,
    });
  } catch (err) {
    logger.warn('Failed to update customers tab on delete vehicle:', err.message);
  }

  customerCache.clear();
  return { success: true, vehicleNo: clean };
}

/**
 * Add a new manager phone number to customers tab Column B
 */
async function addManager(phone, companyName = 'Sheetal Parivahan') {
  const clean = String(phone || '').replace(/\D/g, '').slice(-10);
  if (!clean || clean.length !== 10 || !/^[6-9]\d{9}$/.test(clean)) {
    return { success: false, invalid: true, phone };
  }

  const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  try {
    const custRows = await findRows('customers', 'Company Name', companyName);
    const existing = custRows && custRows.length > 0 ? custRows[0] : {};

    const rawManagers = String(
      existing['Manager access Phone Numbers'] ||
      existing['manager_access_phone_numbers'] ||
      DEFAULT_MANAGER_PHONES
    );

    let currentManagers = (rawManagers.match(/\d{10,12}/g) || []).map((m) => m.slice(-10));
    if (currentManagers.length === 0) {
      currentManagers = rawManagers
        .split(',')
        .map((s) => s.replace(/\D/g, '').slice(-10))
        .filter((s) => s.length === 10);
    }

    if (currentManagers.includes(clean)) {
      return { success: true, alreadyExists: true, phone: clean, managers: currentManagers };
    }

    currentManagers.push(clean);

    const authPhones = existing['Authorized Phone Numbers'] || DEFAULT_AUTH_PHONES;
    const vehicles = existing['Vehicle Numbers'] || '';

    await upsertRow('customers', 'Company Name', {
      'Company Name': companyName,
      'Manager access Phone Numbers': currentManagers.join(', '),
      'Authorized Phone Numbers': authPhones,
      'Vehicle Numbers': vehicles,
      'Last Updated (IST)': nowStr,
    });

    managerPhoneCache.data.add(clean);
    managerPhoneCache.lastFetched = Date.now();
    customerCache.clear();
    logger.info(`✅ Added manager ${clean} to Google Sheet and in-memory cache`);

    return { success: true, added: true, phone: clean, managers: currentManagers };
  } catch (err) {
    logger.warn('Failed to add manager to customers tab:', err.message);
    throw err;
  }
}

/**
 * Remove a manager phone number from customers tab Column B
 */
async function deleteManager(phone, companyName = 'Sheetal Parivahan') {
  const clean = String(phone || '').replace(/\D/g, '').slice(-10);
  const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  try {
    const custRows = await findRows('customers', 'Company Name', companyName);
    const existing = custRows && custRows.length > 0 ? custRows[0] : {};

    const rawManagers = String(
      existing['Manager access Phone Numbers'] ||
      existing['manager_access_phone_numbers'] ||
      DEFAULT_MANAGER_PHONES
    );

    let currentManagers = (rawManagers.match(/\d{10,12}/g) || []).map((m) => m.slice(-10));
    if (currentManagers.length === 0) {
      currentManagers = rawManagers
        .split(',')
        .map((s) => s.replace(/\D/g, '').slice(-10))
        .filter((s) => s.length === 10);
    }

    if (!currentManagers.includes(clean)) {
      return { success: false, notFound: true, phone: clean, managers: currentManagers };
    }

    // Edge Case: Do not allow deleting the last remaining manager
    if (currentManagers.length <= 1) {
      return {
        success: false,
        isLastManager: true,
        message: 'Cannot delete the only remaining active manager.',
        managers: currentManagers,
      };
    }

    currentManagers = currentManagers.filter((p) => p !== clean);

    const authPhones = existing['Authorized Phone Numbers'] || DEFAULT_AUTH_PHONES;
    const vehicles = existing['Vehicle Numbers'] || '';

    await upsertRow('customers', 'Company Name', {
      'Company Name': companyName,
      'Manager access Phone Numbers': currentManagers.join(', '),
      'Authorized Phone Numbers': authPhones,
      'Vehicle Numbers': vehicles,
      'Last Updated (IST)': nowStr,
    });

    managerPhoneCache.data.delete(clean);
    managerPhoneCache.lastFetched = Date.now();
    customerCache.clear();
    logger.info(`✅ Removed manager ${clean} from Google Sheet and in-memory cache`);

    return { success: true, deleted: true, phone: clean, managers: currentManagers };
  } catch (err) {
    logger.warn('Failed to delete manager from customers tab:', err.message);
    throw err;
  }
}

module.exports = {
  getDoc,
  findRows,
  upsertRow,
  getFuelRates,
  getCustomerByPhone,
  getManagerPhones,
  addVehicle,
  editVehicle,
  deleteVehicle,
  addManager,
  deleteManager,
};
