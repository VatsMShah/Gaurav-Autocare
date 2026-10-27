require('dotenv').config();
const db = require('./services/supabase');
const sheets = require('./services/sheets');
const logger = require('./utils/logger');

async function syncAllToSheet() {
  logger.info('Starting full sync from Supabase database to Google Sheet...');
  try {
    const client = db.getClient();

    // 1. Fetch completed bookings
    const { data: bookings, error: bErr } = await client
      .from('book_vehicle')
      .select('*')
      .order('updated_at', { ascending: false });

    if (bErr) {
      logger.error('Failed to fetch bookings from Supabase:', bErr);
      return;
    }

    logger.info(`Found ${bookings.length} freight bookings in database. Syncing to Google Sheet...`);
    let count = 0;
    for (const b of bookings) {
      try {
        await sheets.saveBookVehicleRow(b);
        count++;
        if (count % 10 === 0) {
          logger.info(`Synced ${count}/${bookings.length} bookings...`);
        }
      } catch (err) {
        logger.warn(`Failed to sync booking ${b.user_id}:`, err.message);
      }
    }

    logger.info(`🎉 Finished sync! Successfully backed up ${count} bookings to Google Sheet.`);
  } catch (err) {
    logger.error('Sync failed:', err);
  }
}

syncAllToSheet().then(() => {
  logger.info('Done.');
  process.exit(0);
});
