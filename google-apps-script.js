/**
 * =========================================================================
 * GAURAV AUTOCARE — PROFESSIONAL GOOGLE SHEETS DATABASE CONNECTOR (v2.0)
 * =========================================================================
 * Connects Gaurav Autocare WhatsApp Bot with Google Sheets as a primary,
 * real-time, two-way database with concurrency locks, auto-formatting,
 * data validation dropdowns, and an automated KPI Dashboard.
 *
 * HOW TO INSTALL IN 1 MINUTE:
 * 1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/17o_4BWcnvoOmv_zl2Io3M8tTxtFsx3y7vwZbUZIJZXw/edit
 * 2. In the top menu, click Extensions > Apps Script.
 * 3. Delete any code in the editor, and paste this entire file.
 * 4. Click Save (disk icon).
 * 5. In the toolbar function dropdown, select "setupDatabaseTabs" and click "Run".
 * 6. Click Deploy > Manage deployments > Edit > New version > Deploy!
 * =========================================================================
 */

// Field definitions with clean business labels and technical mappings
var TABLE_CONFIG = {
  fuel_truck_orders: {
    title: 'fuel_truck_orders',
    headers: [
      'Ticket ID',
      'Date & Time (IST)',
      'Customer Name',
      'Phone Number',
      'Vehicle Number',
      'Fuel Type',
      'Quantity (L)',
      'Rate (₹/L)',
      'Total Amount (₹)',
      'Order Status',
      'Payment Status',
      'Source',
      'Updated At (IST)'
    ],
    keys: [
      'ticket_id',
      'created_at',
      'customer_name',
      'phone',
      'vehicle_number',
      'fuel_type',
      'litres',
      'rate_per_litre',
      'estimated_amount',
      'order_status',
      'payment_status',
      'source',
      'updated_at'
    ],
    matchKey: 'ticket_id'
  },
  customers: {
    title: 'customers',
    headers: [
      'Phone Number',
      'Customer / Fleet Name',
      'Company Name',
      'Email',
      'GSTIN',
      'Created At (IST)',
      'Updated At (IST)'
    ],
    keys: [
      'phone',
      'name',
      'company_name',
      'email',
      'gstin',
      'created_at',
      'updated_at'
    ],
    matchKey: 'phone'
  },
  fuel_rates: {
    title: 'fuel_rates',
    headers: [
      'Fuel Type',
      'Rate per Litre (₹)',
      'Effective Date',
      'Last Updated (IST)'
    ],
    keys: [
      'fuel_type',
      'rate_per_litre',
      'effective_date',
      'updated_at'
    ],
    matchKey: 'fuel_type'
  },
  bot_sessions: {
    title: 'bot_sessions',
    headers: [
      'Phone Number',
      'Bot State',
      'Flow Type',
      'Session Data',
      'Last Active (IST)'
    ],
    keys: [
      'phone',
      'state',
      'flow_type',
      'session_data',
      'updated_at'
    ],
    matchKey: 'phone'
  }
};

/**
 * Format timestamp to clean Indian Standard Time (IST)
 */
function formatToIST(dateObj) {
  var d = dateObj ? new Date(dateObj) : new Date();
  if (isNaN(d.getTime())) d = new Date();
  return Utilities.formatDate(d, 'Asia/Kolkata', 'dd-MMM-yyyy hh:mm a');
}

/**
 * Custom Menu inside Google Sheets UI
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⛽ Gaurav Autocare')
    .addItem('⚡ Create / Format All Database Tabs', 'setupDatabaseTabs')
    .addItem('📊 Create / Refresh KPI Dashboard', 'setupDashboardTab')
    .addItem('🔄 Populate Initial Fuel Rates', 'populateDefaultRates')
    .addToUi();
}

/**
 * Creates and formats all tables matching industry standards
 */
function setupDatabaseTabs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  for (var tableId in TABLE_CONFIG) {
    var conf = TABLE_CONFIG[tableId];
    var sheet = ss.getSheetByName(conf.title);

    if (!sheet) {
      var firstSheet = ss.getSheets()[0];
      if (ss.getSheets().length === 1 && firstSheet.getName() === 'Sheet1') {
        sheet = firstSheet;
        sheet.setName(conf.title);
      } else {
        sheet = ss.insertSheet(conf.title);
      }
    }

    // Set clean business headers on row 1
    sheet.getRange(1, 1, 1, conf.headers.length).setValues([conf.headers]);

    // Professional Navy Header Styling
    var headerRange = sheet.getRange(1, 1, 1, conf.headers.length);
    headerRange.setFontWeight('bold');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setBackground('#1E3A8A'); // Navy blue
    headerRange.setHorizontalAlignment('center');
    headerRange.setVerticalAlignment('middle');
    sheet.setRowHeight(1, 38);
    sheet.setFrozenRows(1);

    // Apply specific table formatting
    if (tableId === 'fuel_truck_orders') {
      applyOrdersFormatting(sheet);
    } else if (tableId === 'fuel_rates') {
      applyRatesFormatting(sheet);
    }

    // Auto-fit column widths with minimum 130px
    for (var col = 1; col <= conf.headers.length; col++) {
      sheet.autoResizeColumn(col);
      if (sheet.getColumnWidth(col) < 130) {
        sheet.setColumnWidth(col, 140);
      }
    }
  }

  populateDefaultRates();
  setupDashboardTab();
  ss.toast('✅ Database tabs and Dashboard configured with formatting!', 'Setup Complete');
}

/**
 * Formats fuel_truck_orders with dropdowns, currency, and conditional colors
 */
function applyOrdersFormatting(sheet) {
  // Col 7 (Quantity): Number format #,##0.00
  sheet.getRange('G2:G1000').setNumberFormat('#,##0.00');

  // Col 8 (Rate): Currency format ₹#,##0.00
  sheet.getRange('H2:H1000').setNumberFormat('₹#,##0.00');

  // Col 9 (Amount): Currency format ₹#,##0.00
  sheet.getRange('I2:I1000').setNumberFormat('₹#,##0.00');

  // Col 10: Order Status Dropdown (Confirmed, Fueling, Completed, Cancelled)
  var orderStatusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Confirmed', 'Fueling', 'Completed', 'Cancelled'], true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange('J2:J1000').setDataValidation(orderStatusRule);

  // Col 11: Payment Status Dropdown (Pending, Paid, Credit Account)
  var paymentStatusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Pending', 'Paid', 'Credit Account'], true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange('K2:K1000').setDataValidation(paymentStatusRule);

  // Conditional Formatting: Soft Green for Completed / Paid, Soft Amber for Confirmed, Soft Red for Cancelled
  var rules = sheet.getConditionalFormatRules() || [];
  
  var greenRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Completed')
    .setBackground('#D1FAE5')
    .setFontColor('#065F46')
    .setRanges([sheet.getRange('J2:J1000')])
    .build();

  var amberRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Confirmed')
    .setBackground('#FEF3C7')
    .setFontColor('#92400E')
    .setRanges([sheet.getRange('J2:J1000')])
    .build();

  var paidRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Paid')
    .setBackground('#D1FAE5')
    .setFontColor('#065F46')
    .setRanges([sheet.getRange('K2:K1000')])
    .build();

  var pendingRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Pending')
    .setBackground('#FEE2E2')
    .setFontColor('#991B1B')
    .setRanges([sheet.getRange('K2:K1000')])
    .build();

  rules.push(greenRule, amberRule, paidRule, pendingRule);
  sheet.setConditionalFormatRules(rules);
}

/**
 * Formats fuel_rates with currency and number formats
 */
function applyRatesFormatting(sheet) {
  sheet.getRange('B2:B20').setNumberFormat('₹#,##0.00');
}

/**
 * Creates an executive KPI Dashboard tab
 */
function setupDashboardTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dash = ss.getSheetByName('📊 Dashboard');
  if (!dash) {
    dash = ss.insertSheet('📊 Dashboard', 0);
  }

  dash.clear();
  dash.setTabColor('#1E3A8A');

  // Title Banner
  dash.getRange('A1:F2').merge();
  dash.getRange('A1').setValue('⛽ GAURAV AUTOCARE — LIVE FLEET FUEL DASHBOARD');
  dash.getRange('A1').setFontSize(16).setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1E3A8A')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');

  // KPI Card Headers
  var kpis = [
    ['Total Orders Placed', '=COUNTA(fuel_truck_orders!A2:A)', 'B4:B5', '#3B82F6'],
    ['Total Litres Dispensed', '=SUM(fuel_truck_orders!G2:G)', 'C4:C5', '#10B981'],
    ['Total Revenue (₹)', '=SUM(fuel_truck_orders!I2:I)', 'D4:D5', '#F59E0B'],
    ['Diesel Volume (L)', '=SUMIF(fuel_truck_orders!F2:F, "*Diesel*", fuel_truck_orders!G2:G)', 'E4:E5', '#6366F1'],
    ['Petrol Volume (L)', '=SUMIF(fuel_truck_orders!F2:F, "*Petrol*", fuel_truck_orders!G2:G)', 'F4:F5', '#EC4899']
  ];

  for (var i = 0; i < kpis.length; i++) {
    var colLetter = String.fromCharCode(66 + i); // B, C, D, E, F
    dash.getRange(colLetter + '4').setValue(kpis[i][0]).setFontSize(10).setFontWeight('bold')
      .setFontColor('#6B7280').setHorizontalAlignment('center');
    dash.getRange(colLetter + '5').setFormula(kpis[i][1]).setFontSize(18).setFontWeight('bold')
      .setFontColor(kpis[i][3]).setHorizontalAlignment('center');
    dash.getRange(colLetter + '4:' + colLetter + '5').setBorder(true, true, true, true, false, false, '#E5E7EB', SpreadsheetApp.BorderStyle.SOLID);
  }

  dash.getRange('C5').setNumberFormat('#,##0.00 "L"');
  dash.getRange('D5').setNumberFormat('₹#,##0.00');
  dash.getRange('E5').setNumberFormat('#,##0.00 "L"');
  dash.getRange('F5').setNumberFormat('#,##0.00 "L"');

  // Live Fuel Rates Notice
  dash.getRange('B7:F7').merge();
  dash.getRange('B7').setValue('📢 CURRENT PUMP RATES (Auto-read by WhatsApp Bot)');
  dash.getRange('B7').setFontWeight('bold').setBackground('#F3F4F6').setHorizontalAlignment('center');

  dash.getRange('B8').setValue('Diesel (HSD):').setFontWeight('bold');
  dash.getRange('C8').setFormula('=VLOOKUP("Diesel", fuel_rates!A:B, 2, FALSE)').setNumberFormat('₹#,##0.00').setFontWeight('bold').setFontColor('#059669');
  dash.getRange('E8').setValue('Petrol (MS):').setFontWeight('bold');
  dash.getRange('F8').setFormula('=VLOOKUP("Petrol", fuel_rates!A:B, 2, FALSE)').setNumberFormat('₹#,##0.00').setFontWeight('bold').setFontColor('#2563EB');

  dash.autoResizeColumns(1, 7);
  dash.setColumnWidth(1, 40);
  dash.setColumnWidth(2, 160);
  dash.setColumnWidth(3, 160);
  dash.setColumnWidth(4, 180);
  dash.setColumnWidth(5, 160);
  dash.setColumnWidth(6, 160);
}

/**
 * Populates initial default fuel rates if empty
 */
function populateDefaultRates() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('fuel_rates');
  if (!sheet) return;

  if (sheet.getLastRow() <= 1) {
    var todayStr = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
    var nowIST = formatToIST(new Date());
    sheet.appendRow(['Diesel', 92.80, todayStr, nowIST]);
    sheet.appendRow(['Petrol', 104.50, todayStr, nowIST]);
  }
}

/**
 * Handle HTTP POST requests with LockService concurrency protection
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // Acquire lock (wait up to 15 seconds) to prevent concurrent overwrite
    lock.waitLock(15000);

    var contents = e.postData ? e.postData.contents : '{}';
    var payload = JSON.parse(contents);
    var action = payload.action || 'upsert';

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ACTION: get_rates (Bot reads current fuel rates from sheet)
    if (action === 'get_rates') {
      var ratesSheet = ss.getSheetByName('fuel_rates');
      var rates = { Diesel: 92.80, Petrol: 104.50 };
      if (ratesSheet && ratesSheet.getLastRow() > 1) {
        var data = ratesSheet.getRange(2, 1, ratesSheet.getLastRow() - 1, 2).getValues();
        for (var i = 0; i < data.length; i++) {
          var fType = String(data[i][0]).trim();
          var fRate = parseFloat(data[i][1]) || 0;
          if (/diesel/i.test(fType)) rates.Diesel = fRate;
          if (/petrol/i.test(fType)) rates.Petrol = fRate;
        }
      }
      return respondJson({ status: 'success', rates: rates });
    }

    // ACTION: get_customer (Bot looks up customer by phone)
    if (action === 'get_customer') {
      var searchPhone = String(payload.phone || '').replace(/\D/g, '').slice(-10);
      var custSheet = ss.getSheetByName('customers');
      var customer = null;
      if (custSheet && custSheet.getLastRow() > 1) {
        var cData = custSheet.getRange(2, 1, custSheet.getLastRow() - 1, 5).getValues();
        for (var j = 0; j < cData.length; j++) {
          var rowPhone = String(cData[j][0] || '').replace(/\D/g, '').slice(-10);
          if (rowPhone && rowPhone === searchPhone) {
            customer = {
              phone: String(cData[j][0]),
              name: String(cData[j][1] || ''),
              company_name: String(cData[j][2] || ''),
              email: String(cData[j][3] || ''),
              gstin: String(cData[j][4] || '')
            };
            break;
          }
        }
      }
      return respondJson({ status: 'success', customer: customer });
    }

    // ACTION: find (Generic lookup)
    if (action === 'find') {
      var fSheet = ss.getSheetByName(payload.tabTitle || 'fuel_truck_orders');
      var foundRows = [];
      if (fSheet && fSheet.getLastRow() > 1) {
        var headerRow = fSheet.getRange(1, 1, 1, fSheet.getLastColumn()).getValues()[0];
        var matchIdx = findColumnIndex(fSheet, payload.matchColumn || payload.column);
        if (matchIdx !== -1) {
          var allData = fSheet.getRange(2, 1, fSheet.getLastRow() - 1, headerRow.length).getValues();
          var searchVal = String(payload.value || '');
          for (var k = 0; k < allData.length; k++) {
            if (String(allData[k][matchIdx]) === searchVal) {
              foundRows.push(rowToMap(headerRow, allData[k]));
            }
          }
        }
      }
      return respondJson({ status: 'success', rows: foundRows });
    }

    // ACTION: upsert (Standard single-row save)
    var tabTitle = payload.tabTitle || 'fuel_truck_orders';
    var sheet = ss.getSheetByName(tabTitle);
    if (!sheet) {
      setupDatabaseTabs();
      sheet = ss.getSheetByName(tabTitle);
    }

    var resultRow = upsertSingleRow(sheet, tabTitle, payload.matchColumn, payload.data || {});
    return respondJson({ status: 'success', action: 'upsert', tabTitle: tabTitle, row: resultRow });

  } catch (err) {
    return respondJson({ status: 'error', message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

/**
 * HTTP GET endpoint (for health checks and fast read requests)
 */
function doGet(e) {
  var action = e.parameter ? e.parameter.action : null;
  if (action === 'get_rates') {
    return doPost({ postData: { contents: JSON.stringify({ action: 'get_rates' }) } });
  }
  return respondJson({
    status: 'active',
    name: 'Gaurav Autocare Google Sheets Database Sync',
    time: formatToIST(new Date())
  });
}

/**
 * Upserts a row with IST date formatting and mapped column order
 */
function upsertSingleRow(sheet, tabTitle, matchColumn, data) {
  var conf = TABLE_CONFIG[tabTitle] || null;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var matchColIdx = findColumnIndex(sheet, matchColumn);

  if (matchColIdx === -1) {
    matchColIdx = headers.length;
    headers.push(matchColumn);
    sheet.getRange(1, headers.length).setValue(matchColumn);
  }

  var matchValue = String(data[matchColumn] || data[conf ? conf.matchKey : ''] || '');
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

  // Build row values matching sheet header order
  var rowValues = [];
  var existingRowData = foundRowIdx > 0 ? sheet.getRange(foundRowIdx, 1, 1, headers.length).getValues()[0] : null;

  for (var c = 0; c < headers.length; c++) {
    var hName = headers[c];
    var val = resolveValue(data, hName, conf, existingRowData ? existingRowData[c] : null);
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
 * Resolves a field value from data payload by checking business labels and technical keys
 */
function resolveValue(data, headerName, conf, existingVal) {
  var lowerH = headerName.toLowerCase();

  // If updating and it's created_at, PRESERVE original created_at!
  if ((lowerH.indexOf('date & time') !== -1 || lowerH.indexOf('created') !== -1) && existingVal) {
    return existingVal;
  }

  // Direct match in data
  if (data[headerName] !== undefined && data[headerName] !== null) return formatVal(data[headerName]);

  // Key-to-header mapping via TABLE_CONFIG
  if (conf && conf.headers && conf.keys) {
    var hIdx = conf.headers.indexOf(headerName);
    if (hIdx !== -1) {
      var k = conf.keys[hIdx];
      if (data[k] !== undefined && data[k] !== null) return formatVal(data[k]);
    }
  }

  // Common heuristic fallbacks
  if (lowerH.indexOf('ticket') !== -1) return data.ticket_id || data.ticketId || '';
  if (lowerH.indexOf('customer') !== -1 || lowerH.indexOf('name') !== -1) return data.customer_name || data.customerName || data.name || '';
  if (lowerH.indexOf('phone') !== -1 || lowerH.indexOf('mobile') !== -1) return data.phone || '';
  if (lowerH.indexOf('vehicle') !== -1) return String(data.vehicle_number || data.vehicleNumber || '').toUpperCase();
  if (lowerH.indexOf('fuel') !== -1) return data.fuel_type || data.fuelType || '';
  if (lowerH.indexOf('quantity') !== -1 || lowerH.indexOf('litres') !== -1) return parseFloat(data.litres) || 0;
  if (lowerH.indexOf('rate') !== -1) return parseFloat(data.rate_per_litre || data.rate) || 0;
  if (lowerH.indexOf('amount') !== -1) return parseFloat(data.estimated_amount || data.amount) || 0;
  if (lowerH.indexOf('order status') !== -1) return capitalize(data.order_status || data.orderStatus || 'Confirmed');
  if (lowerH.indexOf('payment') !== -1) return capitalize(data.payment_status || data.paymentStatus || 'Pending');
  if (lowerH.indexOf('source') !== -1) return data.source || 'whatsapp_bot';
  if (lowerH.indexOf('updated') !== -1 || lowerH.indexOf('active') !== -1) return formatToIST(new Date());
  if (lowerH.indexOf('date') !== -1 || lowerH.indexOf('created') !== -1) return formatToIST(data.created_at || new Date());
  if (lowerH.indexOf('session') !== -1) return typeof data.session_data === 'object' ? JSON.stringify(data.session_data) : String(data.session_data || '');

  return existingVal !== undefined && existingVal !== null ? existingVal : '';
}

function formatVal(v) {
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function capitalize(s) {
  s = String(s || '');
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function findColumnIndex(sheet, colName) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var target = String(colName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (h === target || h.indexOf(target) !== -1 || target.indexOf(h) !== -1) {
      return i;
    }
  }
  return -1;
}

function rowToMap(headers, rowValues) {
  var obj = {};
  for (var i = 0; i < headers.length; i++) {
    obj[headers[i]] = rowValues[i];
  }
  return obj;
}

function respondJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
