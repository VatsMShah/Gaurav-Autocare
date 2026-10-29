const { extractCustomerInfo } = require('../services/customerService');
const logger = require('../utils/logger');

// In-memory session store so bot works without database setup
const memorySessions = new Map();

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

  return (
    `=================================\n` +
    `   🎫 *GAURAV AUTOCARE* ⛽\n` +
    `   *FUEL TRUCK ORDER CONFIRMATION*\n` +
    `=================================\n\n` +
    `📌 *Ticket ID:* #${ticketId}\n` +
    `📅 *Date & Time:* ${dateTimeStr}\n\n` +
    `👤 *CUSTOMER DETAILS:*\n` +
    `• *Name:* ${customer.name}\n` +
    `• *Mobile:* ${customer.phone}\n\n` +
    `🚛 *FUEL TRUCK ORDER DETAILS:*\n` +
    `• *Vehicle Number:* ${String(orderDetails.vehicle_number || '').toUpperCase()}\n` +
    `• *Fuel Type:* ${orderDetails.fuel_type || 'Diesel'}\n` +
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
function generateWelcomeMessage(customer) {
  return (
    `🙏 *Hii, Welcome to Gaurav Autocare* ⛽🚛\n\n` +
    `👤 *Customer Name:* ${customer.name}\n` +
    `📱 *Mobile Number:* ${customer.phone}\n\n` +
    `Welcome to our automated Fuel Truck Ordering service!\n\n` +
    `Please reply with your Fuel Truck order details:\n` +
    `• *Vehicle Number:* (e.g. MH04AB1234)\n` +
    `• *Fuel Type:* Petrol or Diesel\n` +
    `• *Quantity or Price:* (e.g. 1000 Litres or ₹50,000)\n\n` +
    `💡 *Example format:*\n` +
    `\`MH04AB1234, Diesel, 1000 Litres\`\n` +
    `_or_\n` +
    `\`MH05678, Petrol, 500 Litres\``
  );
}

/**
 * Parses user single-message input containing vehicle number, fuel type, and litres/price
 */
function parseFuelOrderText(text) {
  const clean = String(text || '').trim();
  const lower = clean.toLowerCase();

  // 1. Detect Fuel Type (Petrol or Diesel)
  let fuelType = 'Diesel';
  let rate = 92.80;
  if (lower.includes('petrol') || lower.includes('ms')) {
    fuelType = 'Petrol';
    rate = 104.50;
  }

  // 2. Detect Litres or Amount/Price
  let litres = 0;
  let amount = 0;

  // Check for price/amount: e.g. "₹50000", "50000 rs", "rs 50000", "price 50000", "amount 50000"
  const amountMatch =
    clean.match(/(?:₹|rs\.?|inr|amount|price)\s*(\d[\d,]*)/i) ||
    clean.match(/(\d[\d,]*)\s*(?:rs|inr|rupees)/i);

  // Check for litres: e.g. "1000 litres", "1000 ltr", "1000L", "1000 l"
  const litresMatch = clean.match(/(\d[\d,]*)\s*(?:litres?|liters?|ltrs?|ltr|l)\b/i);

  if (amountMatch) {
    amount = parseInt(amountMatch[1].replace(/,/g, ''), 10);
    litres = Math.round(amount / rate);
  } else if (litresMatch) {
    litres = parseInt(litresMatch[1].replace(/,/g, ''), 10);
    amount = Math.round(litres * rate);
  } else {
    // Look for any standalone quantity number (e.g. 100, 500, 1000)
    const numbers = clean.match(/\b\d{2,6}\b/g) || [];
    if (numbers.length > 0) {
      const num = parseInt(numbers[numbers.length - 1], 10);
      if (num >= 50 && num <= 50000) {
        litres = num;
        amount = Math.round(litres * rate);
      } else {
        litres = 500;
        amount = Math.round(litres * rate);
      }
    } else {
      litres = 500;
      amount = Math.round(litres * rate);
    }
  }

  // 3. Detect Vehicle Number
  // Format: MH04AB1234, MH05678, DL01AB1234, GJ01CD5678, etc.
  const plateMatch = clean.match(/[A-Z]{2}[-\s]?[0-9]{1,2}[-\s]?[A-Z]{0,3}[-\s]?[0-9]{3,4}/i);
  let vehicleNumber = '';
  if (plateMatch) {
    vehicleNumber = plateMatch[0].replace(/[-\s]/g, '').toUpperCase();
  } else {
    const parts = clean.split(/[,;\n\s]+/);
    vehicleNumber = (parts[0] || 'MH04AB1234').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }

  return {
    vehicle_number: vehicleNumber || 'MH04AB1234',
    fuel_type: fuelType,
    litres: String(litres),
    amount: String(amount),
  };
}

/**
 * Main conversation processor for Gaurav Autocare WhatsApp Bot.
 * Streamlined 3-text flow:
 * Text 1 (Bot): Welcome message with vehicle, petrol/diesel, litres/price prompt
 * Text 2 (User): User replies with details (e.g. MH04AB1234, Diesel, 1000 Litres)
 * Text 3 (Bot): Bot sends confirmed Ticket
 */
function processConversation(waMessagePayload, masterRows = []) {
  const chat = waMessagePayload || {};
  const msg = chat.messages?.[0];
  const phone = msg?.from || 'unknown_user';

  // 1. Extract customer name and number
  const customer = extractCustomerInfo(phone, chat);

  // 2. Identify message type and content
  let textBody = '';
  let flowResponse = null;

  if (msg?.type === 'text') {
    textBody = (msg.text?.body || '').trim();
  } else if (msg?.type === 'interactive') {
    if (msg.interactive?.type === 'nfm_reply' || msg.interactive?.nfm_reply) {
      const responseJsonStr = msg.interactive.nfm_reply?.response_json || '{}';
      flowResponse = safeJsonParse(responseJsonStr, null);
    } else if (msg.interactive?.button_reply) {
      textBody = (msg.interactive.button_reply.id || msg.interactive.button_reply.title || '').trim();
    } else if (msg.interactive?.list_reply) {
      textBody = (msg.interactive.list_reply.title || msg.interactive.list_reply.id || '').trim();
    }
  }

  const lowerText = textBody.toLowerCase();
  const isGreeting =
    !flowResponse &&
    ['hi', 'hii', 'hello', 'hey', 'start', 'restart', 'menu', 'reset'].includes(lowerText);

  // Retrieve previous session state
  const previousSession = memorySessions.get(phone) || {};
  const currentState = isGreeting ? 'initial' : previousSession.state || 'initial';

  // Case A: User completed the WhatsApp Flow Form (nfm_reply)
  if (flowResponse && (flowResponse.vehicle_number || flowResponse.fuel_type || flowResponse.litres || flowResponse.amount)) {
    const ticketId = `GA-${Date.now().toString().slice(-6)}`;
    const fuelType = (flowResponse.fuel_type || 'Diesel').trim();
    const rate = fuelType.toLowerCase() === 'petrol' ? 104.50 : 92.80;

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

  // Text 1 (Bot): User sends Hi or starts conversation -> Send Welcome Text with prompt
  if (currentState === 'initial' || isGreeting) {
    const welcomeText = generateWelcomeMessage(customer);

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

  // Text 2 (User sends details) -> Text 3 (Bot sends Ticket)
  if (currentState === 'awaiting_details' || currentState === 'order_confirmed') {
    // Parse vehicle number, petrol/diesel, and litres/price from user text
    const orderDetails = parseFuelOrderText(textBody);
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
    response: generateWelcomeMessage(customer),
    updated_at: new Date().toISOString(),
  };
}

module.exports = {
  processConversation,
  generateOrderTicket,
  generateWelcomeMessage,
  memorySessions,
};
