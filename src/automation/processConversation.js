const { extractCustomerInfo } = require('../services/customerService');
const logger = require('../utils/logger');

// In-memory session store so bot works without database setup
const memorySessions = new Map();

// Default fallback pump rates
const DEFAULT_RATES = {
  Diesel: 92.80,
  Petrol: 104.50,
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
 * Generates a clean, professional Fuel Truck Order ticket string
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

  const formattedAmount = Number(orderDetails.amount)
    ? `₹${Number(orderDetails.amount).toLocaleString('en-IN')}`
    : `₹${orderDetails.amount}`;

  const rateDisplay = orderDetails.rate_per_litre
    ? ` (₹${Number(orderDetails.rate_per_litre).toFixed(2)}/L)`
    : '';

  return (
    `=================================\n` +
    `   🎫 *GAURAV AUTOCARE* ⛽\n` +
    `   *FUEL TRUCK ORDER CONFIRMATION*\n` +
    `=================================\n\n` +
    `📌 *Ticket ID:* #${ticketId}\n` +
    `📅 *Date & Time:* ${dateTimeStr}\n\n` +
    `👤 *CUSTOMER DETAILS:*\n` +
    `• *Name:* ${customer.name}\n` +
    `• *Mobile:* ${customer.phone}\n` +
    (customer.company ? `• *Company:* ${customer.company}\n\n` : `\n`) +
    `🚛 *FUEL TRUCK ORDER DETAILS:*\n` +
    `• *Vehicle Number:* ${String(orderDetails.vehicle_number || '').toUpperCase()}\n` +
    `• *Fuel Type:* ${orderDetails.fuel_type || 'Diesel'}${rateDisplay}\n` +
    `• *Quantity:* ${orderDetails.litres} Litres\n` +
    `• *Estimated Amount:* ${formattedAmount}\n\n` +
    `📊 *Status:* ✅ *CONFIRMED & SCHEDULED*\n` +
    `---------------------------------\n` +
    `Your fuel truck order has been logged successfully! Our dispatch team is processing your request.\n\n` +
    `Need another order or assistance? Just reply *Hi* anytime.\n` +
    `Thank you for choosing *Gaurav Autocare*! ⛽🚛`
  );
}

/**
 * Generates the welcome message text asking for all 3 details in one go
 */
function generateWelcomeMessage(customer, activeRates = DEFAULT_RATES) {
  const dRate = (activeRates.Diesel || DEFAULT_RATES.Diesel).toFixed(2);
  const pRate = (activeRates.Petrol || DEFAULT_RATES.Petrol).toFixed(2);

  return (
    `🙏 *Hii, Welcome to Gaurav Autocare* ⛽🚛\n\n` +
    `👤 *Customer Name:* ${customer.name}\n` +
    `📱 *Mobile Number:* ${customer.phone}\n` +
    (customer.company ? `🏢 *Company:* ${customer.company}\n\n` : `\n`) +
    `⛽ *Today's Rates:* Diesel ₹${dRate}/L | Petrol ₹${pRate}/L\n\n` +
    `Please reply with your Fuel Truck order in this exact 3-line format:\n\n` +
    `*Vehicle Number*\n` +
    `*Diesel or Petrol*\n` +
    `*Quantity (Litres) OR Price (Rupees)* _(Please enter only one)_\n\n` +
    `📝 *Example 1 (By Quantity):*\n` +
    `MH04XZ1212\n` +
    `Diesel\n` +
    `1000 Litres\n\n` +
    `📝 *Example 2 (By Price):*\n` +
    `MH04XZ1212\n` +
    `Petrol\n` +
    `2200 Rupees`
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
  const hasPetrol = /\b(petrol|ms)\b/i.test(lower);

  if (hasDiesel && !hasPetrol) {
    fuelType = 'Diesel';
    rate = dieselRate;
  } else if (hasPetrol && !hasDiesel) {
    fuelType = 'Petrol';
    rate = petrolRate;
  } else if (hasDiesel && hasPetrol) {
    errors.push('❌ *Conflicting Fuel Type:* Please choose only *Diesel* OR *Petrol*, not both.');
  } else {
    errors.push('❌ *Fuel Type Invalid:* Please specify either *Diesel* or *Petrol*. (Other fuel types are not supported).');
  }

  // 3. Quantity (Litres) OR Price (Rupees) Validation
  const amountMatch =
    clean.match(/(?:₹|rs\.?|inr|rupees|amount|price)\s*(\d[\d,]*)/i) ||
    clean.match(/(\d[\d,]*)\s*(?:rs|inr|rupees)/i);

  const litresMatch = clean.match(/(\d[\d,]*)\s*(?:litres?|liters?|ltrs?|ltr|l)\b/i);

  let litres = 0;
  let amount = 0;

  if (amountMatch && litresMatch) {
    litres = parseInt(litresMatch[1].replace(/,/g, ''), 10);
    amount = parseInt(amountMatch[1].replace(/,/g, ''), 10);
  } else if (amountMatch) {
    amount = parseInt(amountMatch[1].replace(/,/g, ''), 10);
    litres = Math.round(amount / rate);
  } else if (litresMatch) {
    litres = parseInt(litresMatch[1].replace(/,/g, ''), 10);
    amount = Math.round(litres * rate);
  } else {
    let textWithoutPlate = clean;
    if (plateMatch) {
      textWithoutPlate = textWithoutPlate.replace(plateMatch[0], '');
    }
    const rawNumbers = textWithoutPlate.match(/\b\d+\b/g) || [];
    if (rawNumbers.length > 0) {
      const nakedNum = rawNumbers[rawNumbers.length - 1];
      errors.push(`❌ *Unit Missing for "${nakedNum}":* Please specify whether *${nakedNum}* is *Litres* (e.g. *${nakedNum} Litres*) OR *Rupees* (e.g. *${nakedNum} Rupees*).`);
    } else {
      errors.push('❌ *Quantity or Price Missing:* Please enter either quantity in litres (e.g. *1000 Litres*) OR price (e.g. *2200 Rupees*).');
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
        `2200 Rupees`,
    };
  }

  return {
    isValid: true,
    orderDetails: {
      vehicle_number: vehicleNumber,
      fuel_type: fuelType,
      litres: String(litres),
      amount: String(amount),
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
        `📞 *Gaurav Autocare Support & Dispatch Desk:*\n\n` +
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
  if (flowResponse && (flowResponse.vehicle_number || flowResponse.fuel_type || flowResponse.litres || flowResponse.amount)) {
    const ticketId = `GA-${Date.now().toString().slice(-6)}`;
    const fuelType = (flowResponse.fuel_type || 'Diesel').trim();
    const rate = fuelType.toLowerCase() === 'petrol'
      ? (activeRates.Petrol || DEFAULT_RATES.Petrol)
      : (activeRates.Diesel || DEFAULT_RATES.Diesel);

    let litres = parseFloat(flowResponse.litres || '0') || 0;
    let amount = parseFloat(flowResponse.amount || '0') || 0;

    if (litres > 0 && amount === 0) {
      amount = Math.round(litres * rate);
    } else if (amount > 0 && litres === 0) {
      litres = Math.round(amount / rate);
    } else if (litres === 0 && amount === 0) {
      litres = 500;
      amount = Math.round(litres * rate);
    }

    const orderDetails = {
      vehicle_number: (flowResponse.vehicle_number || 'N/A').toUpperCase().trim(),
      fuel_type: fuelType,
      litres: String(litres),
      amount: String(amount),
      rate_per_litre: rate,
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
      action: 'send_welcome',
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
