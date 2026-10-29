require('dotenv').config();
const db = require('./services/supabase');
const sheets = require('./services/sheets');
const logger = require('./utils/logger');

async function syncAllToSheet() {
  logger.info('🚀 Starting full sync from Supabase database to Google Sheet...');

  if (!sheets.isConfigured()) {
    logger.error('❌ Google Sheets is not configured in .env!');
    logger.error('Please add GOOGLE_SHEET_WEBHOOK_URL or GOOGLE_SERVICE_ACCOUNT_EMAIL to .env');
    process.exit(1);
  }

  try {
    const client = db.getClient();

    // 1. Sync Fuel Truck Orders
    const { data: orders, error: oErr } = await client
      .from('fuel_truck_orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (oErr) {
      logger.error('Failed to fetch fuel_truck_orders from Supabase:', oErr);
    } else {
      logger.info(`📦 Syncing ${orders.length} fuel truck orders to Google Sheet...`);
      for (const order of orders) {
        await sheets.saveFuelTruckOrder(order);
      }
      logger.info(`✅ Synced ${orders.length} fuel truck orders.`);
    }

    // 2. Sync Customers
    const { data: customers, error: cErr } = await client
      .from('customers')
      .select('*');

    if (cErr) {
      logger.error('Failed to fetch customers from Supabase:', cErr);
    } else if (customers?.length) {
      logger.info(`👥 Syncing ${customers.length} customers to Google Sheet...`);
      for (const customer of customers) {
        await sheets.saveCustomer(customer);
      }
      logger.info(`✅ Synced ${customers.length} customers.`);
    }

    // 3. Sync Fuel Rates
    const { data: rates, error: rErr } = await client
      .from('fuel_rates')
      .select('*');

    if (rErr) {
      logger.error('Failed to fetch fuel_rates from Supabase:', rErr);
    } else if (rates?.length) {
      logger.info(`⛽ Syncing ${rates.length} fuel rates to Google Sheet...`);
      for (const rate of rates) {
        await sheets.saveFuelRate(rate);
      }
      logger.info(`✅ Synced ${rates.length} fuel rates.`);
    }

    // 4. Sync Bot Sessions
    const { data: sessions, error: sErr } = await client
      .from('bot_sessions')
      .select('*');

    if (sErr) {
      logger.error('Failed to fetch bot_sessions from Supabase:', sErr);
    } else if (sessions?.length) {
      logger.info(`💬 Syncing ${sessions.length} bot sessions to Google Sheet...`);
      for (const session of sessions) {
        await sheets.saveBotSession(session.phone, session.state, session.session_data);
      }
      logger.info(`✅ Synced ${sessions.length} bot sessions.`);
    }

    logger.info('🎉 All Gaurav Autocare data successfully synced to Google Sheet!');
  } catch (err) {
    logger.error('Full sync failed:', err);
  }
}

syncAllToSheet().then(() => {
  process.exit(0);
});
