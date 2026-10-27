const store = require('./sheetsStore');
const config = require('../config');
const logger = require('../utils/logger');

const TABS = config.google?.tabs || {
  master: 'users_master',
  book: 'BookVehicle',
  provider: 'ProvideVehicle',
  support: 'Support',
};

function isConfigured() {
  return Boolean(config.google?.isConfigured);
}

// ---------------------------------------------------------------------
// users_master  (equivalent of "Get Master Row" / "Save Master Session")
// ---------------------------------------------------------------------

/** Equivalent of "Get Master Row" — filters users_master by exact phone match. */
async function getMasterRowsByPhone(phone) {
  if (!isConfigured()) return [];
  try {
    const rows = await store.findRows(TABS.master, 'phone', phone);
    return rows.map((r) => r.toObject());
  } catch (err) {
    logger.warn('Google Sheets getMasterRowsByPhone failed:', err.message);
    return [];
  }
}

/** Equivalent of "Save Master Session" — upsert keyed on user_id. */
async function saveMasterSession(row) {
  if (!isConfigured()) return row;
  try {
    return await store.upsertRow(TABS.master, 'user_id', {
      user_id: row.user_id,
      state: row.state,
      updated_at: row.updated_at,
      flowType: row.flowType,
      phone: row.phone,
      data: row.data,
    });
  } catch (err) {
    logger.warn('Google Sheets saveMasterSession failed:', err.message);
    return row;
  }
}

// ---------------------------------------------------------------------
// BookVehicle  (equivalent of "BookVehicleGetRows" / "BookVehicleAppendUpdateRow")
// ---------------------------------------------------------------------

async function getBookVehicleRow(userId) {
  if (!isConfigured()) return {};
  try {
    const rows = await store.findRows(TABS.book, 'user_id', userId);
    return rows.length > 0 ? rows[0].toObject() : {};
  } catch (err) {
    logger.warn('Google Sheets getBookVehicleRow failed:', err.message);
    return {};
  }
}

async function saveBookVehicleRow(row) {
  if (!isConfigured()) return row;
  try {
    const formattedRow = {
      user_id: row.user_id,
      phone: row.phone || '',
      loadingDate: row.loadingDate || row.loading_date || '',
      loadingTime: row.loadingTime || row.time_slot || '',
      origin: row.origin || row.loadingYard || row.stuffingAddress || row.loadingPin || '',
      destination: row.destination || row.unloadingAddress || row.portCfs || row.unloadingPin || '',
      cargoType: row.cargoType || row.cargo_type || '',
      vehicleType: row.vehicleType || row.vehicle_or_container || '',
      vehicleSubType: row.vehicleSubType || '',
      weight: row.weight || '',
      material: row.material || row.shippingLine || row.material_or_line || '',
      company: row.company || row.company_name || '',
      contactName: row.contactName || row.contact_name || '',
      email: row.email || '',
      remarks: row.remarks || '',
      updated_at: row.updated_at || new Date().toISOString(),
    };
    return await store.upsertRow(TABS.book, 'user_id', formattedRow);
  } catch (err) {
    logger.warn('Google Sheets saveBookVehicleRow failed:', err.message);
    return row;
  }
}

// ---------------------------------------------------------------------
// ProvideVehicle  (equivalent of "ProvideVehicleGetRows" / "ProvideVehicleAppendUpdateRow1")
// ---------------------------------------------------------------------

async function getProvideVehicleRow(userId) {
  if (!isConfigured()) return {};
  try {
    const rows = await store.findRows(TABS.provider, 'user_id', userId);
    return rows.length > 0 ? rows[0].toObject() : {};
  } catch (err) {
    logger.warn('Google Sheets getProvideVehicleRow failed:', err.message);
    return {};
  }
}

async function saveProvideVehicleRow(row) {
  if (!isConfigured()) return row;
  try {
    return await store.upsertRow(TABS.provider, 'user_id', row);
  } catch (err) {
    logger.warn('Google Sheets saveProvideVehicleRow failed:', err.message);
    return row;
  }
}

// ---------------------------------------------------------------------
// Support  (equivalent of "SupportGetRows" / "SupportAppendUpdateRow")
// ---------------------------------------------------------------------

async function getSupportRow(userId) {
  if (!isConfigured()) return {};
  try {
    const rows = await store.findRows(TABS.support, 'user_id', userId);
    return rows.length > 0 ? rows[0].toObject() : {};
  } catch (err) {
    logger.warn('Google Sheets getSupportRow failed:', err.message);
    return {};
  }
}

async function saveSupportRow(row) {
  if (!isConfigured()) return row;
  try {
    return await store.upsertRow(TABS.support, 'user_id', row);
  } catch (err) {
    logger.warn('Google Sheets saveSupportRow failed:', err.message);
    return row;
  }
}

/**
 * Bulk sync an array of bookings to Google Sheets
 */
async function syncAllBookingsToSheets(bookings) {
  if (!isConfigured()) {
    throw new Error('Google Sheets is not configured. Please add GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_SHEET_ID in .env');
  }
  let count = 0;
  for (const b of bookings) {
    try {
      await saveBookVehicleRow(b);
      count++;
    } catch (e) {
      logger.warn(`Failed to sync booking ${b.user_id} to sheet:`, e.message);
    }
  }
  return { syncedCount: count, total: bookings.length };
}

module.exports = {
  isConfigured,
  getMasterRowsByPhone,
  saveMasterSession,
  getBookVehicleRow,
  saveBookVehicleRow,
  getProvideVehicleRow,
  saveProvideVehicleRow,
  getSupportRow,
  saveSupportRow,
  syncAllBookingsToSheets,
};
