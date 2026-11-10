const { extractCustomerInfo } = require('../services/customerService');
const logger = require('../utils/logger');

// Authorized mobile numbers for Sheetal Parivahan (commercial fleet booking)
const AUTHORIZED_PHONES = new Set([
  '9076021348',
  '7400062501',
  '9324993903',
  '7738022509',
  '8291083855',
  '9920981780',
  '7777030315',
  '9594780757',
  '9324983249',
  '9833611124',
  '7985916674',
  '9820500159',
  '9820216600',
  '9867025711',
  '8976976900',
]);

// In-memory session store so bot works without database setup
const memorySessions = new Map();

// Client Petrol Pump Daily Active Rates (Gaurav Autocare)
const DEFAULT_RATES = {
  Diesel: 98.18,   // ₹98.18 / Litre
  Petrol: 111.55,  // ₹111.55 / Litre (MS)
  XP95: 120.58,    // ₹120.58 / Litre (Premium Petrol)
  CNG: 90.00,      // ₹90.00 / KG
};

/**
 * Safely parse JSON string
 */
function safeJsonParse(str, fallback = {}) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * Generates a clean, professional Fuel Truck Order ticket string (Option 3: Streamlined Single-Block)
 */
function generateOrderTicket({ ticketId, customer, orderDetails }) {
  const now = new Date();
  const dateTimeStr = now.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const isCng = /cng/i.test(orderDetails.fuel_type || '');
  const unitLabel = isCng ? 'KG' : 'L';
  const unitRateLabel = isCng
    ? `₹${Number(orderDetails.rate_per_litre).toFixed(2)}/KG`
    : `₹${Number(orderDetails.rate_per_litre).toFixed(2)}/L`;

  const rateDisplay = orderDetails.rate_per_litre
    ? ` (${unitRateLabel})`
    : '';

  const isFullTank = String(orderDetails.is_full_tank || '').toLowerCase() === 'yes';
  const qtyDisplay = isFullTank ? 'Full Tank (Dispenser Cut-off)' : `${orderDetails.litres} ${unitLabel}`;
  const amtDisplay = isFullTank ? 'As Per Cut-Off Reading' : (orderDetails.amount_display || `₹${Number(orderDetails.amount).toFixed(2)}`);

  const remarksLine = (orderDetails.remarks && orderDetails.remarks !== 'N/A')
    ? `• *Remarks:* ${orderDetails.remarks}\n\n`
    : `\n`;

  return (
    `*FUEL ORDER CONFIRMATION*\n` +
    `Ticket #${ticketId} | ${dateTimeStr}\n\n` +
    `• *Company:* ${customer.company_name || customer.company || customer.name || 'Sheetal Parivahan'}\n` +
    `• *Manager Mobile:* ${customer.phone}\n` +
    `• *Vehicle Number:* ${String(orderDetails.vehicle_number || '').toUpperCase()}\n` +
    `• *Fuel Grade:* ${orderDetails.fuel_type || 'HSD (Diesel)'}${rateDisplay}\n` +
    `• *Full Tank:* ${orderDetails.is_full_tank || (isFullTank ? 'Yes' : 'No')}\n` +
    `• *Quantity:* ${qtyDisplay}\n` +
    `• *Estimated Amount:* ${amtDisplay}\n` +
    `• *Enroute Fueling:* ${orderDetails.is_enroute || 'No'}\n` +
    `• *Oil / Lubricant:* ${orderDetails.oil_material || 'None'}\n` +
    remarksLine +
    `*Status:* Confirmed & Dispatched\n\n` +
    `Your fuel order has been registered in real time.\n` +
    `To place another order, simply reply *Hi*.`
  );
}

/**
 * Generates the welcome message text
 */
function generateWelcomeMessage(customer) {
  const company = customer.company_name || customer.company || customer.name || 'Sheetal Parivahan';
  const phone = customer.phone || 'N/A';

  return (
    `🙏 *Welcome to Gaurav Auto Care* ⛽🚛\n\n` +
    `🏢 *Your Company Name:* ${company}\n` +
    `📱 *Your Number:* ${phone}\n\n` +
    `Please tap the button below to book fuel for your vehicle:`
  );
}

/**
 * Validates and parses user single-message input with dynamic daily rates
 */
function validateAndParseFuelOrder(text, activeRates = DEFAULT_RATES) {
  const clean = String(text || '').trim();
  const lower = clean.toLowerCase();
  const errors = [];

  const dieselRate = parseFloat(activeRates.Diesel) || DEFAULT_RATES.Diesel;
  const petrolRate = parseFloat(activeRates.Petrol) || DEFAULT_RATES.Petrol;
  const xp95Rate = parseFloat(activeRates.XP95) || DEFAULT_RATES.XP95;
  const cngRate = parseFloat(activeRates.CNG) || DEFAULT_RATES.CNG;

  // 1. Vehicle Number Validation
  const plateMatch = clean.match(/\b([A-Z]{2}[-\s]?[0-9]{1,2}[-\s]?[A-Z]{0,3}[-\s]?[0-9]{3,4})\b/i);
  let vehicleNumber = '';
  if (plateMatch) {
    vehicleNumber = plateMatch[1].replace(/[-\s]/g, '').toUpperCase();
  } else {
    errors.push('❌ *Vehicle Number Invalid:* Please provide a valid vehicle registration number (e.g. *MH04XZ1212* or *MH05678*).');
  }

  // 2. Fuel Type Validation
  let fuelType = null;
  let rate = dieselRate;
  const hasDiesel = /\b(diesel|hsd)\b/i.test(lower);
  const hasXP95 = /\b(xp95|xp 95|speed|extra premium)\b/i.test(lower);
  const hasPetrol = /\b(petrol|ms)\b/i.test(lower) && !hasXP95;
  const hasCng = /\b(cng|gas)\b/i.test(lower);

  const matchedGrades = [hasDiesel, hasPetrol, hasXP95, hasCng].filter(Boolean).length;
  if (matchedGrades > 1) {
    errors.push('❌ *Conflicting Fuel Type:* Please choose only one fuel type (*Diesel*, *Petrol*, *XP95*, or *CNG*).');
  } else if (hasXP95) {
    fuelType = 'XP95 (Petrol)';
    rate = xp95Rate;
  } else if (hasDiesel) {
    fuelType = 'HSD (Diesel)';
    rate = dieselRate;
  } else if (hasPetrol) {
    fuelType = 'MS (Petrol)';
    rate = petrolRate;
  } else if (hasCng) {
    fuelType = 'CNG';
    rate = cngRate;
  } else {
    errors.push('❌ *Fuel Type Invalid:* Please specify fuel grade (*Diesel*, *Petrol*, *XP95*, or *CNG*).');
  }

  // 3. Quantity (Litres / KG) OR Price (Rupees) Validation
  const amountMatch =
    clean.match(/(?:₹|rs\.?|inr|rupees|amount|price)\s*(\d[\d,]*(?:\.\d+)?)/i) ||
    clean.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:rs|inr|rupees)/i);

  const qtyMatch = clean.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:litres?|liters?|ltrs?|ltr|l|kg|kgs)\b/i);

  let litres = 0;
  let amount = 0;

  if (amountMatch && qtyMatch) {
    litres = Math.round(parseFloat(qtyMatch[1].replace(/,/g, '')) * 100) / 100;
    amount = Math.round(parseFloat(amountMatch[1].replace(/,/g, '')) * 100) / 100;
  } else if (amountMatch) {
    amount = Math.round(parseFloat(amountMatch[1].replace(/,/g, '')) * 100) / 100;
    litres = Math.round((amount / rate) * 100) / 100;
  } else if (qtyMatch) {
    litres = Math.round(parseFloat(qtyMatch[1].replace(/,/g, '')) * 100) / 100;
    amount = Math.round(litres * rate * 100) / 100;
  } else {
    let textWithoutPlate = clean;
    if (plateMatch) {
      textWithoutPlate = textWithoutPlate.replace(plateMatch[0], '');
    }
    const rawNumbers = textWithoutPlate.match(/\b\d+(?:\.\d+)?\b/g) || [];
    if (rawNumbers.length > 0) {
      const nakedNum = rawNumbers[rawNumbers.length - 1];
      errors.push(`❌ *Unit Missing for "${nakedNum}":* Please specify whether *${nakedNum}* is *Litres / KG* (e.g. *${nakedNum} Litres*) OR *Rupees* (e.g. *${nakedNum} Rupees*).`);
    } else {
      errors.push('❌ *Quantity or Price Missing:* Please enter either quantity in litres (e.g. *1000 Litres*) OR price (e.g. *2500 Rupees*).');
    }
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      recorrectionMessage:
        `⚠️ *Order Details Incomplete / Need Correction:*\n\n` +
        errors.join('\n\n') +
        `\n\n👉 *Please send your order again in this format:*\n` +
        `MH04XZ1212\n` +
        `Diesel\n` +
        `1000 Litres\n\n` +
        `_or_\n\n` +
        `MH04XZ1212\n` +
        `Petrol\n` +
        `2500 Rupees`,
    };
  }

  return {
    isValid: true,
    orderDetails: {
      vehicle_number: vehicleNumber,
      fuel_type: fuelType,
      litres: litres.toFixed(2),
      amount: amount.toFixed(2),
      rate_per_litre: rate,
    },
  };
}

/**
 * Main conversation processor for Gaurav Autocare WhatsApp Bot.
 * @param {object} waMessagePayload - Meta incoming webhook payload
 * @param {Array} masterRows - Previous session state row if any
 * @param {object|null} currentRates - Live daily rates { Diesel, Petrol } from Sheets
 * @param {object|null} preloadedCustomer - Customer info from Sheets/DB if resolved
 */
function processConversation(waMessagePayload, masterRows = [], currentRates = null, preloadedCustomer = null) {
  const chat = waMessagePayload || {};
  const msg = chat.messages?.[0];
  const phone = msg?.from || 'unknown_user';

  const activeRates = currentRates || DEFAULT_RATES;

  // 1. Extract customer name and number (with preloaded customer support)
  const customer = extractCustomerInfo(phone, chat, preloadedCustomer);

  // Phone clean 10 digits
  const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);

  // Strict Sheetal Parivahan Authorization Check
  const isSheetRegistered = Boolean(preloadedCustomer && preloadedCustomer.isRegistered);
  const isAuthorized =
    !phone ||
    phone === 'unknown_user' ||
    cleanPhone.startsWith('000') ||
    AUTHORIZED_PHONES.has(cleanPhone) ||
    isSheetRegistered;

  if (isAuthorized) {
    if (!customer.company_name || customer.company_name === 'Valued Customer' || customer.company_name === 'Valued Fleet Partner') {
      customer.company_name = preloadedCustomer?.company_name || 'Sheetal Parivahan';
      customer.name = customer.company_name;
    }
  } else {
    logger.warn(`Unauthorized access attempt from phone: ${phone} (${cleanPhone})`);
    return {
      user_id: `${phone}_${Date.now()}`,
      phone,
      customer,
      state: 'access_denied',
      action: 'send_text',
      response:
        `🚫 *Access Restricted: Gaurav Auto Care*\n\n` +
        `Your mobile number (*+91 ${cleanPhone}*) is not authorized to place fuel orders.\n\n` +
        `Only authorized fleet managers from registered partners (such as *Sheetal Parivahan*) are permitted to book fuel.\n\n` +
        `📞 To authorize your number, please contact Gaurav Auto Care Support: *+91 93232 65076*`,
      updated_at: new Date().toISOString(),
    };
  }

  // 2. Identify message type and content
  let textBody = '';
  let flowResponse = null;
  let buttonId = '';
  let buttonTitle = '';

  if (msg?.type === 'text') {
    textBody = (msg.text?.body || '').trim();
  } else if (msg?.type === 'interactive') {
    if (msg.interactive?.type === 'nfm_reply' || msg.interactive?.nfm_reply) {
      const responseJsonStr = msg.interactive.nfm_reply?.response_json || '{}';
      flowResponse = safeJsonParse(responseJsonStr, null);
    } else if (msg.interactive?.button_reply) {
      buttonId = msg.interactive.button_reply.id || '';
      buttonTitle = msg.interactive.button_reply.title || '';
      textBody = (buttonId || buttonTitle).trim();
    } else if (msg.interactive?.list_reply) {
      textBody = (msg.interactive.list_reply.title || msg.interactive.list_reply.id || '').trim();
    }
  } else if (msg?.type === 'button') {
    buttonId = msg.button?.payload || '';
    buttonTitle = msg.button?.text || '';
    textBody = (buttonId || buttonTitle).trim();
  }

  const cleanText = textBody.toLowerCase().trim();
  const normalizedText = cleanText.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '').trim();

  // Handle "Order Another", new order, restart, or greeting
  const isNewOrder =
    !flowResponse &&
    (
      buttonId === 'btn_new_order' ||
      buttonTitle.toLowerCase().includes('order another') ||
      buttonTitle.toLowerCase().includes('new order') ||
      normalizedText === 'btn_new_order' ||
      normalizedText.includes('order another') ||
      normalizedText.includes('another order') ||
      normalizedText.includes('new order') ||
      normalizedText.includes('order again') ||
      normalizedText.includes('start again') ||
      normalizedText.includes('reorder') ||
      normalizedText === 'another' ||
      normalizedText === 'order' ||
      ['hi', 'hii', 'hello', 'hey', 'start', 'restart', 'menu', 'reset'].includes(normalizedText)
    );

  // Handle "Support" button
  const isSupport =
    !flowResponse &&
    (
      buttonId === 'btn_support' ||
      buttonTitle.toLowerCase().includes('support') ||
      normalizedText === 'btn_support' ||
      normalizedText.includes('support') ||
      normalizedText.includes('help') ||
      normalizedText.includes('contact')
    );

  if (isSupport) {
    return {
      user_id: `${phone}_${Date.now()}`,
      phone,
      customer,
      state: 'awaiting_details',
      action: 'send_text',
      response:
        `📞 *Gaurav Auto Care Support & Dispatch Desk:*\n\n` +
        `• Phone / WhatsApp: +91 93232 65076\n` +
        `• Email: admin@gauravauto.com\n` +
        `• Operating Hours: 24/7 Bulk Fuel Dispatch\n\n` +
        `Reply *Order Another* or *Hi* anytime to place a fuel truck order! ⛽🚛`,
      updated_at: new Date().toISOString(),
    };
  }

  // Retrieve previous session state
  const previousSession = (masterRows && masterRows[0]) || memorySessions.get(phone) || {};
  const currentState = isNewOrder ? 'initial' : previousSession.state || 'initial';

  // Case A: User completed the WhatsApp Flow Form (nfm_reply)
  if (
    flowResponse &&
    (flowResponse.vehicle_series ||
      flowResponse.vehicle_number ||
      flowResponse.vehicle_ly ||
      flowResponse.vehicle_ju ||
      flowResponse.vehicle_le ||
      flowResponse.vehicle_lq ||
      flowResponse.vehicle_kf ||
      flowResponse.vehicle_mr ||
      flowResponse.vehicle_mh ||
      flowResponse.vehicle_ku ||
      flowResponse.vehicle_other ||
      flowResponse.fuel_type ||
      flowResponse.is_full_tank)
  ) {
    const ticketId = `GA-${Date.now().toString().slice(-6)}`;
    const rawFuel = String(flowResponse.fuel_type || 'HSD (Diesel)').trim();

    // Resolve rate according to the selected fuel grade
    let rate = parseFloat(activeRates.Diesel) || DEFAULT_RATES.Diesel;
    const lowerFuel = rawFuel.toLowerCase();
    const isCng = lowerFuel.includes('cng');
    const unitLabel = isCng ? 'KG' : 'L';

    if (lowerFuel.includes('xp95')) {
      rate = parseFloat(activeRates.XP95) || DEFAULT_RATES.XP95;
    } else if (lowerFuel.includes('ms') || lowerFuel.includes('petrol')) {
      rate = parseFloat(activeRates.Petrol) || DEFAULT_RATES.Petrol;
    } else if (lowerFuel.includes('cng')) {
      rate = parseFloat(activeRates.CNG) || DEFAULT_RATES.CNG;
    } else if (lowerFuel.includes('hsd') || lowerFuel.includes('diesel')) {
      rate = parseFloat(activeRates.Diesel) || DEFAULT_RATES.Diesel;
    }

    const resolvedVehicle = (
      flowResponse.vehicle_ly ||
      flowResponse.vehicle_ju ||
      flowResponse.vehicle_le ||
      flowResponse.vehicle_lq ||
      flowResponse.vehicle_kf ||
      flowResponse.vehicle_mr ||
      flowResponse.vehicle_mh ||
      flowResponse.vehicle_ku ||
      flowResponse.vehicle_other ||
      flowResponse.vehicle_number ||
      'N/A'
    ).toUpperCase().trim();

    const isFullTank = String(flowResponse.is_full_tank || '').toLowerCase() === 'yes';
    let litresDisplay = 'Full Tank';
    let amountDisplay = 'Dispenser Cut-off';
    let litresVal = 0;
    let amountVal = 0;

    if (!isFullTank) {
      const inputLitres = parseFloat(flowResponse.litres || '0') || 0;
      const inputAmount = parseFloat(flowResponse.amount || '0') || 0;

      if (inputLitres > 0) {
        // User entered Quantity: round to 2 decimals
        litresVal = Math.round(inputLitres * 100) / 100;
        // Total Amount = Quantity * Rate, rounded to 2 decimals (paise)
        amountVal = Math.round(litresVal * rate * 100) / 100;
      } else if (inputAmount > 0) {
        // User entered Amount: round to 2 decimals
        amountVal = Math.round(inputAmount * 100) / 100;
        // Total Quantity = Amount / Rate, rounded to 2 decimals
        litresVal = Math.round((amountVal / rate) * 100) / 100;
      } else {
        // Fallback default if neither provided
        litresVal = 50.00;
        amountVal = Math.round(litresVal * rate * 100) / 100;
      }

      litresDisplay = `${litresVal.toFixed(2)} ${unitLabel}`;
      amountDisplay = `₹${amountVal.toFixed(2)}`;
    }

    const orderDetails = {
      vehicle_number: resolvedVehicle,
      fuel_type: rawFuel,
      is_full_tank: isFullTank ? 'Yes' : 'No',
      litres: isFullTank ? 'Full Tank' : litresVal.toFixed(2),
      amount: isFullTank ? 'Cut-Off' : amountVal.toFixed(2),
      litres_display: litresDisplay,
      amount_display: amountDisplay,
      rate_per_litre: rate,
      is_enroute: String(flowResponse.is_enroute || 'no').toLowerCase() === 'yes' ? 'Yes' : 'No',
      oil_material: flowResponse.oil_material || 'None',
      remarks: (flowResponse.remarks || '').trim() || 'N/A',
    };

    const ticketText = generateOrderTicket({ ticketId, customer, orderDetails });
    const completedSession = { ticketId, customer, orderDetails, completedAt: new Date().toISOString() };

    memorySessions.set(phone, { state: 'order_confirmed', data: completedSession, updated_at: new Date().toISOString() });

    return {
      user_id: `${phone}_${Date.now()}`,
      phone,
      customer,
      state: 'order_confirmed',
      action: 'send_ticket',
      flowType: 'fuel_order',
      response: ticketText,
      orderDetails,
      data: JSON.stringify(completedSession),
      updated_at: new Date().toISOString(),
    };
  }

  // Text 1 (Bot): User sends Hi or clicks Order Another -> Send Welcome Text
  if (currentState === 'initial' || isNewOrder) {
    const welcomeText = generateWelcomeMessage(customer, activeRates);

    memorySessions.set(phone, {
      state: 'awaiting_details',
      data: { customer },
      updated_at: new Date().toISOString(),
    });

    return {
      user_id: `${phone}_${Date.now()}`,
      phone,
      customer,
      state: 'awaiting_details',
      action: 'send_fuel_flow',
      response: welcomeText,
      data: JSON.stringify({ customer }),
      updated_at: new Date().toISOString(),
    };
  }

  // Text 2 (User sends details) -> Validate!
  if (currentState === 'awaiting_details' || currentState === 'order_confirmed') {
    const validation = validateAndParseFuelOrder(textBody, activeRates);

    // If validation fails -> Send recorrection message!
    if (!validation.isValid) {
      memorySessions.set(phone, {
        state: 'awaiting_details',
        data: { customer },
        updated_at: new Date().toISOString(),
      });

      return {
        user_id: `${phone}_${Date.now()}`,
        phone,
        customer,
        state: 'awaiting_details',
        action: 'send_text',
        response: validation.recorrectionMessage,
        updated_at: new Date().toISOString(),
      };
    }

    // Validation PASSED -> Generate Ticket & Confirm Order!
    const { orderDetails } = validation;
    const ticketId = `GA-${Date.now().toString().slice(-6)}`;

    const ticketText = generateOrderTicket({ ticketId, customer, orderDetails });
    const completedSession = { ticketId, customer, orderDetails, completedAt: new Date().toISOString() };

    memorySessions.set(phone, {
      state: 'order_confirmed',
      data: completedSession,
      updated_at: new Date().toISOString(),
    });

    return {
      user_id: `${phone}_${Date.now()}`,
      phone,
      customer,
      state: 'order_confirmed',
      action: 'send_ticket',
      flowType: 'fuel_order',
      response: ticketText,
      orderDetails,
      data: JSON.stringify(completedSession),
      updated_at: new Date().toISOString(),
    };
  }

  // Fallback
  return {
    user_id: `${phone}_${Date.now()}`,
    phone,
    customer,
    state: 'awaiting_details',
    action: 'send_welcome',
    response: generateWelcomeMessage(customer, activeRates),
    updated_at: new Date().toISOString(),
  };
}

module.exports = {
  processConversation,
  generateOrderTicket,
  generateWelcomeMessage,
  validateAndParseFuelOrder,
  memorySessions,
  DEFAULT_RATES,
};
