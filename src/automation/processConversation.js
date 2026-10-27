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
 * Generates the welcome message text
 */
function generateWelcomeMessage(customer) {
  return (
    `🙏 *Hii, Welcome to Gaurav Autocare* ⛽🚛\n\n` +
    `👤 *Customer Name:* ${customer.name}\n` +
    `📱 *Mobile Number:* ${customer.phone}\n\n` +
    `Welcome to our automated Fuel Truck Ordering service!\n\n` +
    `👉 Please tap the *📋 Order Fuel Truck* button below to specify:\n` +
    `• Vehicle Number\n` +
    `• Fuel Type (Petrol / Diesel)\n` +
    `• Litres & Amount`
  );
}

/**
 * Main conversation processor for Gaurav Autocare WhatsApp Bot.
 *
 * @param {object} waMessagePayload - Meta webhook payload (value)
 * @param {object[]} [masterRows] - Optional database rows (if any)
 * @returns {object} output state and response
 */
function processConversation(waMessagePayload, masterRows = []) {
  const chat = waMessagePayload || {};
  const msg = chat.messages?.[0];
  const phone = msg?.from || 'unknown_user';

  // 1. Extract customer name and number (from customerService/Meta contacts)
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
    }
  }

  const lowerText = textBody.toLowerCase();
  const isGreeting =
    !flowResponse &&
    (['hi', 'hii', 'hello', 'hey', 'start', 'restart', 'order', 'menu', 'help'].includes(lowerText) ||
      textBody.length === 0 ||
      !memorySessions.has(phone));

  // Retrieve or initialize session state
  const previousSession = memorySessions.get(phone) || {};

  // Case A: User completed the WhatsApp Flow Form (nfm_reply)
  if (flowResponse && (flowResponse.vehicle_number || flowResponse.fuel_type || flowResponse.litres)) {
    const ticketId = `GA-${Date.now().toString().slice(-6)}`;
    const orderDetails = {
      vehicle_number: (flowResponse.vehicle_number || 'N/A').trim(),
      fuel_type: (flowResponse.fuel_type || 'Diesel').trim(),
      litres: (flowResponse.litres || '0').trim(),
      amount: (flowResponse.amount || '0').trim(),
    };

    const ticketText = generateOrderTicket({ ticketId, customer, orderDetails });

    const sessionData = {
      ticketId,
      customer,
      orderDetails,
      completedAt: new Date().toISOString(),
    };

    memorySessions.set(phone, {
      state: 'order_confirmed',
      lastOrder: sessionData,
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
      data: JSON.stringify(sessionData),
      updated_at: new Date().toISOString(),
    };
  }

  // Case B: User sends Hi, Hello, or starts conversation
  if (isGreeting || previousSession.state === 'order_confirmed') {
    const welcomeText = generateWelcomeMessage(customer);

    memorySessions.set(phone, {
      state: 'awaiting_order_form',
      customer,
      updated_at: new Date().toISOString(),
    });

    return {
      user_id: `${phone}_${Date.now()}`,
      phone,
      customer,
      state: 'awaiting_order_form',
      action: 'send_fuel_flow',
      flowType: 'fuel_order',
      response: welcomeText,
      data: JSON.stringify({ customer }),
      updated_at: new Date().toISOString(),
    };
  }

  // Case C: User sent a random text while awaiting form submission
  const reminderText =
    `Hello ${customer.name}!\n\n` +
    `Please tap the *📋 Order Fuel Truck* button above to complete your vehicle number, fuel type, litres, and amount.\n\n` +
    `Or send *Hi* to receive a new order form.`;

  return {
    user_id: `${phone}_${Date.now()}`,
    phone,
    customer,
    state: 'awaiting_order_form',
    action: 'send_text',
    flowType: 'fuel_order',
    response: reminderText,
    data: JSON.stringify({ customer }),
    updated_at: new Date().toISOString(),
  };
}

module.exports = {
  processConversation,
  generateOrderTicket,
  generateWelcomeMessage,
  memorySessions,
};
