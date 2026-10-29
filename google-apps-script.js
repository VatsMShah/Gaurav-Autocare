/**
 * =========================================================================
 * GAURAV AUTOCARE - GOOGLE SHEETS DATABASE CONNECTOR
 * =========================================================================
 * This script connects your Google Sheet with Gaurav Autocare WhatsApp Bot
 * and mirrors the exact Supabase database schema and all live order data.
 *
 * HOW TO INSTALL IN 1 MINUTE:
 * 1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/17o_4BWcnvoOmv_zl2Io3M8tTxtFsx3y7vwZbUZIJZXw/edit
 * 2. In the top menu, click Extensions > Apps Script
 * 3. Delete any code in the editor, and paste this entire script.
 * 4. Click the "Save" icon (Floppy disk).
 * 5. Run the function "setupDatabaseTabs" once from the dropdown to create all tables and format headers!
 * 6. Click Deploy > New deployment:
 *    - Select type: "Web app"
 *    - Description: "Gaurav Autocare Live Sync"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 *    - Click "Deploy" and copy the Web App URL (starts with https://script.google.com/macros/s/...)
 * 7. Paste that Web App URL into your .env file as GOOGLE_SHEET_WEBHOOK_URL
 * =========================================================================
 */

// Define exact tables and columns matching Supabase
var SCHEMA = {
  fuel_truck_orders: [
    'ticket_id',
    'customer_name',
    'phone',
    'vehicle_number',
    'fuel_type',
    'litres',
    'estimated_amount',
    'order_status',
    'payment_status',
    'source',
    'created_at',
    'updated_at'
  ],
  customers: [
    'phone',
    'name',
    'company_name',
    'email',
    'gstin',
    'created_at',
    'updated_at'
  ],
  fuel_rates: [
    'fuel_type',
    'rate_per_litre',
    'effective_date',
    'updated_at'
  ],
  bot_sessions: [
    'phone',
    'state',
    'flow_type',
    'session_data',
    'updated_at'
  ]
};

/**
 * Adds a custom menu when opening the Google Sheet
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⛽ Gaurav Autocare')
    .addItem('⚡ Create / Format Database Tables', 'setupDatabaseTabs')
    .addItem('🔄 Populate Initial Fuel Rates', 'populateDefaultRates')
    .addToUi();
}

/**
 * Creates all 4 tables matching Supabase with professional header styling
 */
function setupDatabaseTabs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  for (var tabTitle in SCHEMA) {
    var headers = SCHEMA[tabTitle];
    var sheet = ss.getSheetByName(tabTitle);
    
    if (!sheet) {
      // If Sheet1 exists and is empty, rename it
      var firstSheet = ss.getSheets()[0];
      if (ss.getSheets().length === 1 && firstSheet.getName() === 'Sheet1') {
        sheet = firstSheet;
        sheet.setName(tabTitle);
      } else {
        sheet = ss.insertSheet(tabTitle);
      }
    }
    
    // Set Header row
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Format header style: Dark Blue background, bold white text
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setBackground('#1E3A8A'); // Indigo / Navy Blue
    headerRange.setHorizontalAlignment('center');
    headerRange.setVerticalAlignment('middle');
    sheet.setRowHeight(1, 36);
    sheet.setFrozenRows(1);
    
    // Auto-fit column widths
    for (var col = 1; col <= headers.length; col++) {
      sheet.autoResizeColumn(col);
      var width = sheet.getColumnWidth(col);
      if (width < 140) sheet.setColumnWidth(col, 140);
    }
  }
  
  populateDefaultRates();
  SpreadsheetApp.getActiveSpreadsheet().toast('✅ All 4 Gaurav Autocare database tables created successfully!', 'Setup Complete');
}

/**
 * Populates current fuel rates (Petrol & Diesel)
 */
function populateDefaultRates() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('fuel_rates');
  if (!sheet) return;
  
  if (sheet.getLastRow() <= 1) {
    var now = new Date().toISOString();
    sheet.appendRow(['Petrol', 104.50, '2026-10-27', now]);
    sheet.appendRow(['Diesel', 92.80, '2026-10-27', now]);
  }
}

/**
 * Webhook handler for incoming HTTP POST requests from the Node.js bot
 */
function doPost(e) {
  try {
    var contents = e.postData ? e.postData.contents : '{}';
    var payload = JSON.parse(contents);
    var action = payload.action || 'upsert';
    var tabTitle = payload.tabTitle || 'fuel_truck_orders';
    var matchColumn = payload.matchColumn || 'ticket_id';
    var data = payload.data || {};
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(tabTitle);
    
    if (!sheet) {
      setupDatabaseTabs();
      sheet = ss.getSheetByName(tabTitle);
    }
    
    if (action === 'bulk_sync' && Array.isArray(payload.rows)) {
      var syncCount = 0;
      for (var i = 0; i < payload.rows.length; i++) {
        upsertSingleRow(sheet, matchColumn, payload.rows[i]);
        syncCount++;
      }
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        action: 'bulk_sync',
        tabTitle: tabTitle,
        syncedCount: syncCount
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Default single upsert
    var resultRow = upsertSingleRow(sheet, matchColumn, data);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      action: 'upsert',
      tabTitle: tabTitle,
      row: resultRow
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Helper to upsert a row based on matchColumn
 */
function upsertSingleRow(sheet, matchColumn, data) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var matchColIdx = headers.indexOf(matchColumn);
  
  if (matchColIdx === -1) {
    // Column missing in headers, append it
    matchColIdx = headers.length;
    headers.push(matchColumn);
    sheet.getRange(1, headers.length).setValue(matchColumn);
  }
  
  var matchValue = String(data[matchColumn] || '');
  var lastRow = sheet.getLastRow();
  var foundRowIdx = -1;
  
  if (lastRow > 1 && matchValue !== '') {
    var colValues = sheet.getRange(2, matchColIdx + 1, lastRow - 1, 1).getValues();
    for (var r = 0; r < colValues.length; r++) {
      if (String(colValues[r][0]) === matchValue) {
        foundRowIdx = r + 2;
        break;
      }
    }
  }
  
  // Construct row values in header order
  var rowValues = [];
  for (var c = 0; c < headers.length; c++) {
    var key = headers[c];
    var val = data[key];
    if (val === undefined || val === null) {
      val = '';
    } else if (typeof val === 'object') {
      val = JSON.stringify(val);
    }
    rowValues.push(val);
  }
  
  if (foundRowIdx > 0) {
    sheet.getRange(foundRowIdx, 1, 1, rowValues.length).setValues([rowValues]);
    return foundRowIdx;
  } else {
    sheet.appendRow(rowValues);
    return sheet.getLastRow();
  }
}

/**
 * Health check endpoint for testing deployment
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'active',
    name: 'Gaurav Autocare Google Sheets Database Sync',
    time: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}
