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
    .createMenu('⛽ Gaurav Auto Care')
    .addItem('⚡ Create / Format All Database Tabs', 'setupDatabaseTabs')
    .addItem('📊 Create / Refresh KPI Dashboard', 'setupDashboardTab')
    .addItem('🔄 Populate Initial Fuel Rates', 'populateDefaultRates')
    .addItem('⚡ Load Sheetal Parivahan & Lube Master', 'initSheetalParivahanData')
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

  var todayStr = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
  var nowIST = formatToIST(new Date());

  var ratesData = [
    ['Diesel', 98.18, todayStr, nowIST],
    ['Petrol', 111.55, todayStr, nowIST],
    ['XP95', 120.58, todayStr, nowIST],
    ['CNG', 90.00, todayStr, nowIST]
  ];

  if (sheet.getLastRow() <= 1) {
    sheet.getRange(2, 1, ratesData.length, 4).setValues(ratesData);
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
    if (action === 'setup_sheetal_and_lubes') {
      return initSheetalParivahanData();
    }

    if (action === 'get_rates') {
      var ratesSheet = ss.getSheetByName('fuel_rates');
      var rates = { Diesel: 98.18, Petrol: 111.55, XP95: 120.58, CNG: 90.00 };
      if (ratesSheet && ratesSheet.getLastRow() > 1) {
        var data = ratesSheet.getRange(2, 1, ratesSheet.getLastRow() - 1, 2).getValues();
        for (var i = 0; i < data.length; i++) {
          var fType = String(data[i][0]).trim().toLowerCase();
          var fRate = parseFloat(data[i][1]) || 0;
          if (fRate > 0) {
            if (fType.indexOf('xp95') !== -1) rates.XP95 = fRate;
            else if (fType.indexOf('diesel') !== -1 || fType.indexOf('hsd') !== -1) rates.Diesel = fRate;
            else if (fType.indexOf('petrol') !== -1 || fType.indexOf('ms') !== -1) rates.Petrol = fRate;
            else if (fType.indexOf('cng') !== -1) rates.CNG = fRate;
          }
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
        var numCols = Math.max(custSheet.getLastColumn(), 4);
        var cData = custSheet.getRange(2, 1, custSheet.getLastRow() - 1, numCols).getValues();
        for (var j = 0; j < cData.length; j++) {
          var colA = String(cData[j][0] || '').trim();
          var colB = String(cData[j][1] || '').trim();
          var colC = String(cData[j][2] || '').trim();

          // Check if searchPhone matches Column B (comma-separated authorized numbers)
          // or Column A (legacy single phone format)
          var isMatch = false;
          var companyName = '';
          var vehicleList = '';

          if (colB && colB.indexOf(searchPhone) !== -1) {
            isMatch = true;
            companyName = colA;
            vehicleList = colC;
          } else if (colA && colA.replace(/\D/g, '').slice(-10) === searchPhone) {
            isMatch = true;
            companyName = String(cData[j][2] || colA);
            vehicleList = String(cData[j][5] || cData[j][3] || '');
          }

          if (isMatch) {
            customer = {
              phone: payload.phone,
              name: companyName,
              company_name: companyName,
              vehicles: vehicleList,
              isRegistered: true
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
    name: 'Gaurav Auto Care Google Sheets Database Sync',
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
  if (lowerH.indexOf('full tank') !== -1) return data.is_full_tank || data.isFullTank || 'No';
  if (lowerH.indexOf('quantity') !== -1 || lowerH.indexOf('litres') !== -1) return data.litres !== undefined ? data.litres : 0;
  if (lowerH.indexOf('rate') !== -1) return parseFloat(data.rate_per_litre || data.rate) || 0;
  if (lowerH.indexOf('amount') !== -1) return data.estimated_amount !== undefined ? data.estimated_amount : (data.amount !== undefined ? data.amount : 0);
  if (lowerH.indexOf('enroute') !== -1) return data.is_enroute || data.isEnroute || 'No';
  if (lowerH.indexOf('oil') !== -1 || lowerH.indexOf('lube') !== -1) return data.oil_material || data.oilMaterial || 'None';
  if (lowerH.indexOf('remark') !== -1) return data.remarks || '';
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

/**
 * One-click function to populate Sheetal Parivahan fleet & Lube Master list
 * and remove legacy placeholder logistics companies.
 */
function initSheetalParivahanData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nowIST = formatToIST(new Date());

  // 1. SETUP & POPULATE 'customers' TAB
  var custSheet = ss.getSheetByName('customers');
  if (!custSheet) {
    custSheet = ss.insertSheet('customers');
  }

  // Clear existing data (removes the 2 old logistics companies)
  custSheet.clear();

  // Set modern 1-row-per-company headers
  var custHeaders = ['Company Name', 'Authorized Phone Numbers', 'Vehicle Numbers', 'Last Updated (IST)'];
  custSheet.getRange(1, 1, 1, custHeaders.length).setValues([custHeaders]);
  var custHeaderRange = custSheet.getRange(1, 1, 1, custHeaders.length);
  custHeaderRange.setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1E3A8A');
  custSheet.setFrozenRows(1);

  // Sheetal Parivahan Data
  var sheetalRow = [
    'Sheetal Parivahan',
    '9076021348, 7400062501, 9324993903, 7738022509, 8291083855, 9920981780, 7777030315, 9594780757, 9324983249, 9833611124, 7985916674, 9820500159, 9820216600, 9867025711, 8976976900',
    'MH04MR4948, MH04HD4966, MH04LE8785, MH04LE7253, MH04KU4997, MH04MR0335, MH04LE2426, MH04KU6559, MH04MH4846, MH04LY7394, MH04LE2427, MH04LY8816, MH04LQ9782, MH04LY0661, MH04LE7556, MH04LY0668, MH04LQ9780, MH04MR4942, MH04LE7558, MH04KF2512, MH04KF2524, MH04HS1078, MH04LY6794, MH04MR0331, MH04MR0595, MH04KF2367, MH04KU5008, MH04KU4998, MH04KU5012, MH04KF2374, MH04LY8806, MH04LY7397, MH04LQ0667, MH04KF5807, MH04KF3632, MH04LQ0568, MH04KF7908, MH04JU8012, MH04KF5769, MH04KU6557, MH04JK8821, MH04JU1978, MH04MR7663, MH04LY8801, MH04LY0263, MH04LY0657, MH04LE7552, MH04LY0264, MH04LQ0255, MH04LQ0669, MH04JU0645, MH04KF5806, MH04JU8948, MH04JU0643, MH04MH4857, MH04JU4812, MH04HY1028, MH04MR0334, MH04LY1107, MH04KF2766, MH04MH4850, MH04LY1624, MH04MH4838, MH04MH4834, MH04LE1229, MH04JU0657, MH04KF5768, MH04LE7550, MH04LQ0569, MH04KF2091, MH04JU9505, MH04MH5421, MH04LE1225, MH04LY6779, MH04KF3607, MH04LQ8318, MH04LE1226, MH04KF5238, MH04JU8950, MH04MR0268, MH04LQ0257, MH04LQ9775, MH04LY6792, MH04LE8791, MH04MR4945, MH04MR3207, MH04MH5437, MH04LQ0573, MH04LE7029, MH04KF2517, MH04JU4809, MH04JU9489, MH04MH4836, MH04JU0659, MH04LE1228, MH04MH4840, MH04JU8956, MH04LY6801, MH04LE8794, MH04KU5710, MH04JU9496, MH04MR3211, MH04LE8792, MH04LE7312, MH04MH5440, MH04MH4844, MH04LY6783, MH04JU4811, MH04MH4833, MH04JU9498, MH04LY6809, MH04LY6763, MH04LE2353, MH04MR7662, MH04LQ8870, MH04LE1883, MH04MH4964, MH04LQ9778, MH04JU4512, MH04KF5608, MH04MR5179, MH04LY6778, MH04LQ4291, MH04LQ7716, MH04LQ7715, MH04KF7447, MH04MH5439, MH04JK8814, MH04JU8006, MH04MH4967, MH04JK8816, MH04LY6797, MH04MH4842, MH04LQ4290, MH04LY6785, MH04HS1079, MH04JU8954, MH04JU0644, MH04MR5180, MH04LQ0668, MH04LE6589, MH04KF8229, MH04MR3208, MH04LQ9773, MH04JU1974, MH04LY8803, MH04LQ8873, MH04LY0656, MH04KU5003, MH04MR0332, MH04KF2366, MH04NB0952, MH04LE7554, MH04KU6554, MH04KF5770, MH04JU3570, MH04JU4810, MH04LE8796, MH04JU3542, MH04LY6793, MH04LQ4289, MH04JU1982, MH04JU0658, MH04LY6803, MH04KU5014, MH04LY0266, MH04KF5810, MH04HD5188, MH04MR7664, MH04JK8815, MH04JU0642, MH04HS1076, MH04HS1067, MH04LQ0249, MH04JU6153, MH04MH4858, MH04MR4909, MH04KF2368, MH04MR7665, MH04LY8804, MH04LY0655, MH04LY0662, MH04MH4961, MH04LY6807, MH04LY6774, MH04LY8810, MH04LY7399, MH04JU4814, MH04HD4963, MH04LE6592, MH04LY6782, MH04LE7315, MH04LQ0258, MH04MH4965, MH04LY9766, MH04JU0641, MH04LQ4297, MH04LE7316, MH04LQ8036, MH04LE7247, MH04JK8812, MH04HY9325, MH04LE1232, MH04JU9506, MH04LE7248, MH04MR8422, MH04LE7031, MH04LQ0664, MH04LQ0665, MH04MR3210, MH04LY8796, MH04HD5192, MH04LY8795, MH04LY8815, MH04KU5564, MH04MH4837, MH04JU8957, MH04JU8007, MH04MH5450, MH04LY8812, MH04LE1231, MH04JU1979, MH04JK8817, MH04KF3613, MH04LE1224, MH04JU8951, MH04MR2290, MH04JU3571, MH04KF5816, MH04LE1235, MH04JU3566, MH04LY7392, MH04JU1976, MH04LE7540, MH04MR4947, MH04LQ8872, MH04LY7395, MH04LQ4286, MH04KF5813, MH04KU5704, MH04JU4226, MH04MH4855, MH04LE7557, MH04MH4963',
    nowIST
  ];
  custSheet.appendRow(sheetalRow);
  custSheet.getRange('A2:D2').setVerticalAlignment('middle').setWrap(true);
  custSheet.setColumnWidth(1, 180);
  custSheet.setColumnWidth(2, 300);
  custSheet.setColumnWidth(3, 400);
  custSheet.setColumnWidth(4, 160);

  // 2. SETUP & POPULATE 'lube_master' TAB
  var lubeSheet = ss.getSheetByName('lube_master');
  if (!lubeSheet) {
    lubeSheet = ss.insertSheet('lube_master');
  }
  lubeSheet.clear();

  var lubeHeaders = ['Lube Code', 'Lube Name', 'Last Updated (IST)'];
  lubeSheet.getRange(1, 1, 1, lubeHeaders.length).setValues([lubeHeaders]);
  var lubeHeaderRange = lubeSheet.getRange(1, 1, 1, lubeHeaders.length);
  lubeHeaderRange.setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#1E3A8A');
  lubeSheet.setFrozenRows(1);

  var lubeRows = [
    ['059', 'SERVO 20W50 SPERMILE', nowIST],
    ['058', 'TATA DEF 10 LTR', nowIST],
    ['103', '15W40 HYPERTORQ 15 LTR', nowIST],
    ['102', '15W40 HYPERTORQ 5 LTR', nowIST],
    ['101', 'SERVO DEF 10 LTR', nowIST],
    ['204', 'GREASE 2 KG', nowIST],
    ['203', 'CNG 500 ML', nowIST],
    ['202', 'CNG 1 LTR', nowIST],
    ['201', 'LONG LIFE GREASE - 182 KG', nowIST],
    ['57', 'CF4 15W40 26 LTR', nowIST],
    ['56', 'SYSTEM 46 210 LTR', nowIST],
    ['055', 'ADBLUE 20 LTR', nowIST],
    ['54', '4T ZOOM', nowIST],
    ['53', 'DEF', nowIST],
    ['52', 'ADDON PETROL - 0.5 ML', nowIST],
    ['51', 'ADDON DIESEL -  10 ML', nowIST],
    ['050', 'GREASE - 1/2 KG', nowIST],
    ['49', 'ULTRA  10W  210 LTR', nowIST],
    ['48', 'SERVO GEM EP 1 182 KG', nowIST],
    ['47', 'FLEET CF4 3 LTR', nowIST],
    ['46', 'CF4 15W40 1LTR', nowIST],
    ['45', 'TATA D.E.F 20 LTR', nowIST],
    ['44', 'GEAR OIL 210 LTR', nowIST],
    ['43', '10W - 30', nowIST],
    ['42', '5W 30', nowIST],
    ['41', 'ULTRA 10 W 210', nowIST],
    ['40', 'ACID 1 LTR', nowIST],
    ['39', 'D W  1 LTR', nowIST],
    ['38', 'D W  5 LTR', nowIST],
    ['037', 'TQ 500 ML', nowIST],
    ['036', 'SERVO D.E.F 20 LTR', nowIST],
    ['035', 'HYDRAULIC 210 LTR', nowIST],
    ['034', 'HYDRAULIC 50 LTR', nowIST],
    ['033', 'HYDRAULIC 26 LTR', nowIST],
    ['032', 'HYDRAULIC 20 LTR', nowIST],
    ['031', 'HYDRAULIC 5 LTR', nowIST],
    ['030', 'GREASE 20 KG', nowIST],
    ['029', 'GREASE 3 KG', nowIST],
    ['028', 'GREASE 1 KG', nowIST],
    ['027', 'GEAR 1 LTR', nowIST],
    ['026', 'GEAR 5 LTR', nowIST],
    ['025', 'GEAR 20 LTR', nowIST],
    ['024', 'TQ  5 LTR', nowIST],
    ['023', 'TQ 1 LTR', nowIST],
    ['022', 'ADDON SUPER D 250 ML', nowIST],
    ['021', 'ADDON SUPER D 100 ML', nowIST],
    ['020', 'ADDON D 100 ML', nowIST],
    ['019', 'ADDON D 40 ML', nowIST],
    ['018', 'ADDON D 20 ML', nowIST],
    ['017', 'COOLANT 500ML', nowIST],
    ['016', 'COOLANT 1 LTR', nowIST],
    ['015', 'BREAK 250 ML', nowIST],
    ['014', 'BREAK 500 ML', nowIST],
    ['013', '4T 1 LTR', nowIST],
    ['012', '2T 40ML POUCH', nowIST],
    ['011', 'MG 20W40 20 LTR', nowIST],
    ['010', 'MG 20W40 5 LTR', nowIST],
    ['009', 'MG 20W40 1 LTR', nowIST],
    ['008', 'MG 20W40 500 ML', nowIST],
    ['007', '15W40 210 LTR', nowIST],
    ['006', '15W40 50 LTR', nowIST],
    ['005', '15W40 20 LTR', nowIST],
    ['004', '15W40 15 LTR', nowIST],
    ['003', '15W40 5 LTR', nowIST],
    ['002', '15W40 3 LTR', nowIST],
    ['001', '15W40 1 LTR', nowIST]
  ];

  if (lubeRows.length > 0) {
    lubeSheet.getRange(2, 1, lubeRows.length, 3).setValues(lubeRows);
  }
  lubeSheet.autoResizeColumns(1, 3);
  lubeSheet.setColumnWidth(1, 100);
  lubeSheet.setColumnWidth(2, 280);
  lubeSheet.setColumnWidth(3, 160);

  return respondJson({
    status: 'success',
    message: 'Sheetal Parivahan (12 numbers, 244 vehicles) and 66 Lube products added successfully!'
  });
}
