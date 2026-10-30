const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const config = require('../config');
const logger = require('../utils/logger');

let docPromise = null;

// In-memory cache for fast read responses without delaying WhatsApp turns
const rateCache = {
  data: { Diesel: 92.80, Petrol: 104.50 },
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
async function callAppsScript(payload, timeoutMs = 7500) {
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
      const res = await callAppsScript({ action: 'get_rates' }, 7500);
      if (res && res.status === 'success' && res.rates) {
        rateCache.data = {
          Diesel: parseFloat(res.rates.Diesel) || 92.80,
          Petrol: parseFloat(res.rates.Petrol) || 104.50,
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
        const type = String(row.get('Fuel Type') || '').trim();
        const rate = parseFloat(row.get('Rate per Litre (₹)') || row.get('rate_per_litre')) || 0;
        if (/diesel/i.test(type) && rate > 0) rateCache.data.Diesel = rate;
        if (/petrol/i.test(type) && rate > 0) rateCache.data.Petrol = rate;
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

  // 1. Try Apps Script Webhook
  if (config.google?.webhookUrl) {
    try {
      const res = await callAppsScript({ action: 'get_customer', phone: cleanPhone }, 7500);
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
          };
          customerCache.set(cleanPhone, cust);
          return cust;
        }
      }
    } catch (err) {
      logger.debug('Direct sheets API customer lookup error: ' + err.message);
    }
  }

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

module.exports = {
  getDoc,
  findRows,
  upsertRow,
  getFuelRates,
  getCustomerByPhone,
};
