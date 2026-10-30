const store = require('./sheetsStore');
const config = require('../config');
const logger = require('../utils/logger');

const TABS = {
  orders: 'fuel_truck_orders',
  customers: 'customers',
  rates: 'fuel_rates',
  sessions: 'bot_sessions',
};

function isConfigured() {
  return Boolean(config.google?.isConfigured);
}

/**
 * Format timestamp to Indian Standard Time (IST)
 */
function toISTString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ---------------------------------------------------------------------
// GAURAV AUTOCARE TABLES: fuel_truck_orders, customers, fuel_rates, bot_sessions
// ---------------------------------------------------------------------

/**
 * Save / Update fuel truck order in Google Sheets
 */
async function saveFuelTruckOrder(order) {
  if (!isConfigured()) return order;
  try {
    const formattedRow = {
      ticket_id: order.ticketId || order.ticket_id,
      created_at: order.created_at || order.createdAt || toISTString(),
      customer_name: order.customerName || order.customer_name || 'Valued Customer',
      phone: order.phone || '',
      vehicle_number: (order.vehicleNumber || order.vehicle_number || '').toUpperCase(),
      fuel_type: order.fuelType || order.fuel_type || 'Diesel',
      litres: parseFloat(order.litres) || 0,
      rate_per_litre: parseFloat(order.ratePerLitre || order.rate_per_litre) || 0,
      estimated_amount: parseFloat(order.amount || order.estimated_amount) || 0,
      order_status: order.orderStatus || order.order_status || 'Confirmed',
      payment_status: order.paymentStatus || order.payment_status || 'Pending',
      source: order.source || 'whatsapp_bot',
      updated_at: toISTString(),
    };
    return await store.upsertRow(TABS.orders, 'ticket_id', formattedRow);
  } catch (err) {
    logger.warn('Google Sheets saveFuelTruckOrder failed:', err.message);
    return order;
  }
}

/**
 * Fetch live fuel rates from Google Sheet
 */
async function getFuelRates() {
  if (!isConfigured()) {
    return { Diesel: 92.80, Petrol: 104.50 };
  }
  return store.getFuelRates();
}

/**
 * Fetch registered customer from Google Sheet
 */
async function getCustomerByPhone(phone) {
  if (!isConfigured() || !phone) return null;
  return store.getCustomerByPhone(phone);
}

/**
 * Save / Update customer in Google Sheets
 */
async function saveCustomer(customer) {
  if (!isConfigured()) return customer;
  try {
    const formattedRow = {
      phone: customer.phone,
      name: customer.name,
      company_name: customer.company_name || customer.company || '',
      email: customer.email || '',
      gstin: customer.gstin || '',
      created_at: customer.created_at || toISTString(),
      updated_at: toISTString(),
    };
    return await store.upsertRow(TABS.customers, 'phone', formattedRow);
  } catch (err) {
    logger.warn('Google Sheets saveCustomer failed:', err.message);
    return customer;
  }
}

/**
 * Save / Update fuel rate in Google Sheets
 */
async function saveFuelRate(rate) {
  if (!isConfigured()) return rate;
  try {
    const formattedRow = {
      fuel_type: rate.fuel_type,
      rate_per_litre: parseFloat(rate.rate_per_litre) || 0,
      effective_date: rate.effective_date || new Date().toISOString().split('T')[0],
      updated_at: toISTString(),
    };
    return await store.upsertRow(TABS.rates, 'fuel_type', formattedRow);
  } catch (err) {
    logger.warn('Google Sheets saveFuelRate failed:', err.message);
    return rate;
  }
}

/**
 * Save / Update WhatsApp bot session in Google Sheets
 */
async function saveBotSession(phone, state, sessionData = {}) {
  if (!isConfigured()) return null;
  try {
    const formattedRow = {
      phone,
      state,
      flow_type: 'fuel_order',
      session_data: typeof sessionData === 'object' ? JSON.stringify(sessionData) : sessionData,
      updated_at: toISTString(),
    };
    return await store.upsertRow(TABS.sessions, 'phone', formattedRow);
  } catch (err) {
    logger.warn('Google Sheets saveBotSession failed:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------
// Legacy Handlers (preserved for backward compatibility)
// ---------------------------------------------------------------------

async function getMasterRowsByPhone(phone) {
  if (!isConfigured()) return [];
  try {
    const rows = await store.findRows('users_master', 'phone', phone);
    return rows.map((r) => (typeof r.toObject === 'function' ? r.toObject() : r));
  } catch (err) {
    return [];
  }
}

async function saveMasterSession(row) {
  if (!isConfigured()) return row;
  return store.upsertRow('users_master', 'user_id', row);
}

async function getBookVehicleRow(userId) {
  if (!isConfigured()) return {};
  try {
    const rows = await store.findRows('BookVehicle', 'user_id', userId);
    return rows.length > 0 ? (typeof rows[0].toObject === 'function' ? rows[0].toObject() : rows[0]) : {};
  } catch {
    return {};
  }
}

async function saveBookVehicleRow(row) {
  if (!isConfigured()) return row;
  return store.upsertRow('BookVehicle', 'user_id', row);
}

async function getProvideVehicleRow(userId) {
  if (!isConfigured()) return {};
  try {
    const rows = await store.findRows('ProvideVehicle', 'user_id', userId);
    return rows.length > 0 ? (typeof rows[0].toObject === 'function' ? rows[0].toObject() : rows[0]) : {};
  } catch {
    return {};
  }
}

async function saveProvideVehicleRow(row) {
  if (!isConfigured()) return row;
  return store.upsertRow('ProvideVehicle', 'user_id', row);
}

async function getSupportRow(userId) {
  if (!isConfigured()) return {};
  try {
    const rows = await store.findRows('Support', 'user_id', userId);
    return rows.length > 0 ? (typeof rows[0].toObject === 'function' ? rows[0].toObject() : rows[0]) : {};
  } catch {
    return {};
  }
}

async function saveSupportRow(row) {
  if (!isConfigured()) return row;
  return store.upsertRow('Support', 'user_id', row);
}

module.exports = {
  isConfigured,
  saveFuelTruckOrder,
  getFuelRates,
  getCustomerByPhone,
  saveCustomer,
  saveFuelRate,
  saveBotSession,
  getMasterRowsByPhone,
  saveMasterSession,
  getBookVehicleRow,
  saveBookVehicleRow,
  getProvideVehicleRow,
  saveProvideVehicleRow,
  getSupportRow,
  saveSupportRow,
};
