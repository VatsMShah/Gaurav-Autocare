const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const config = require('../config');
const logger = require('../utils/logger');

let docPromise = null;

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
    // If the default sheet is 'Sheet1' and unused, rename it
    if (doc.sheetCount === 1 && doc.sheetsByIndex[0]?.title === 'Sheet1') {
      sheet = doc.sheetsByIndex[0];
      await sheet.updateProperties({ title: tabTitle });
      if (defaultHeaders.length > 0) {
        await sheet.setHeaderRow(defaultHeaders);
      }
      logger.info(`Renamed initial Sheet1 to "${tabTitle}" with headers.`);
    } else {
      // Add a new tab
      sheet = await doc.addSheet({ title: tabTitle, headerValues: defaultHeaders });
      logger.info(`Created new sheet tab "${tabTitle}".`);
    }
  }

  return sheet;
}

/**
 * Filter rows where column equals value
 */
async function findRows(tabTitle, column, value) {
  if (config.google?.webhookUrl) {
    // Webhook mode: rows handled by Google Apps Script
    return [];
  }

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
    try {
      await fetch(config.google.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert',
          tabTitle,
          matchColumn,
          data,
          sheetId: config.google.sheetId,
        }),
      });
      logger.info(`✅ Auto-synced row to Google Sheet (via Webhook) in "${tabTitle}"`, { [matchColumn]: data[matchColumn] });
      return data;
    } catch (webhookErr) {
      logger.warn('Google Sheet Webhook sync failed:', webhookErr.message);
      return data;
    }
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

  // Ensure any new columns are added to header row
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

module.exports = { getDoc, findRows, upsertRow };
