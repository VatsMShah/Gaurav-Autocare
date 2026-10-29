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
  const sessionData = previousSession.data || {};

  // Case A: User completed the native WhatsApp Flow Form (nfm_reply)
  if (flowResponse && (flowResponse.vehicle_number || flowResponse.fuel_type || flowResponse.litres)) {
    const ticketId = `GA-${Date.now().toString().slice(-6)}`;
    const orderDetails = {
      vehicle_number: (flowResponse.vehicle_number || 'N/A').trim(),
      fuel_type: (flowResponse.fuel_type || 'Diesel').trim(),
      litres: (flowResponse.litres || '0').trim(),
      amount: (flowResponse.amount || '0').trim(),
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

  // Case B: Initial / Greeting -> Send Interactive Vehicle List Menu (as in screenshot)
  if (currentState === 'initial' || isGreeting) {
    memorySessions.set(phone, {
      state: 'awaiting_vehicle',
      data: { customer },
      updated_at: new Date().toISOString(),
    });

    return {
      user_id: `${phone}_${Date.now()}`,
      phone,
      customer,
      state: 'awaiting_vehicle',
      action: 'send_vehicle_list',
      header: '🚚 Select Vehicle Type:',
      response:
        `🙏 *Hii, Welcome to Gaurav Autocare* ⛽🚛\n\n` +
        `👤 *Customer Name:* ${customer.name}\n` +
        `📱 *Mobile Number:* ${customer.phone}\n\n` +
        `Please tap *Choose Vehicle* below to select your vehicle category, or simply type your vehicle number directly (e.g. *MH05678*):`,
      footer: 'Gaurav Autocare Fuel Truck Desk',
      buttonLabel: 'Choose Vehicle',
      sections: [
        {
          title: 'Commercial Vehicles',
          rows: [
            { id: 'v_truck', title: 'Heavy Truck', description: '10-22 Wheeler Commercial Truck' },
            { id: 'v_tanker', title: 'Tanker / Bowser', description: 'Bulk Fuel Logistics' },
            { id: 'v_trailer', title: 'Trailer / Container', description: 'Prime Mover Trailer' },
          ],
        },
        {
          title: 'Fleet & Others',
          rows: [
            { id: 'v_lcv', title: 'LCV / Mini Truck', description: 'Tata 407, Pickup, etc.' },
            { id: 'v_bus', title: 'Bus / Fleet', description: 'Staff or Travel Fleet' },
            { id: 'v_custom', title: 'Other Vehicle', description: 'Type Registration Number Directly' },
          ],
        },
      ],
      data: JSON.stringify({ customer }),
      updated_at: new Date().toISOString(),
    };
  }

  // Case C: User selected or typed vehicle number
  if (currentState === 'awaiting_vehicle') {
    let vehicleNumber = textBody;
    if (textBody === 'v_custom' || textBody.toLowerCase() === 'other vehicle') {
      return {
        user_id: `${phone}_${Date.now()}`,
        phone,
        customer,
        state: 'awaiting_vehicle',
        action: 'send_text',
        response: `👉 Please type your vehicle registration number (e.g. *MH05678* or *DL01AB1234*):`,
        updated_at: new Date().toISOString(),
      };
    }

    // Clean vehicle name
    vehicleNumber = vehicleNumber.replace(/^v_/, '').toUpperCase();

    const updatedData = { ...sessionData, vehicle_number: vehicleNumber };
    memorySessions.set(phone, {
      state: 'awaiting_fuel_type',
      data: updatedData,
      updated_at: new Date().toISOString(),
    });

    return {
      user_id: `${phone}_${Date.now()}`,
      phone,
      customer,
      state: 'awaiting_fuel_type',
      action: 'send_fuel_buttons',
      header: '⛽ Select Fuel Type',
      response:
        `🚛 *Vehicle Recorded:* ${vehicleNumber}\n\n` +
        `Please select the required fuel type for your vehicle:`,
      footer: 'Gaurav Autocare Daily Rates',
      buttons: [
        { id: 'fuel_diesel', title: '⛽ Diesel (₹92.80)' },
        { id: 'fuel_petrol', title: '🚗 Petrol (₹104.50)' },
      ],
      data: JSON.stringify(updatedData),
      updated_at: new Date().toISOString(),
    };
  }

  // Case D: User selected fuel type
  if (currentState === 'awaiting_fuel_type') {
    const isPetrol = lowerText.includes('petrol');
    const fuelType = isPetrol ? 'Petrol' : 'Diesel';
    const rate = isPetrol ? 104.50 : 92.80;

    const updatedData = { ...sessionData, fuel_type: fuelType, rate_per_litre: rate };
    memorySessions.set(phone, {
      state: 'awaiting_litres',
      data: updatedData,
      updated_at: new Date().toISOString(),
    });

    return {
      user_id: `${phone}_${Date.now()}`,
      phone,
      customer,
      state: 'awaiting_litres',
      action: 'send_litres_buttons',
      header: '💧 Select Quantity (Litres)',
      response:
        `🚛 *Vehicle:* ${updatedData.vehicle_number || 'Registered Vehicle'}\n` +
        `⛽ *Fuel Type:* ${fuelType} (₹${rate.toFixed(2)}/L)\n\n` +
        `Please tap a quick quantity below or type any custom litres (e.g. *1200*):`,
      footer: 'Minimum order: 100 Litres',
      buttons: [
        { id: 'litres_500', title: '500 Litres' },
        { id: 'litres_1000', title: '1,000 Litres' },
        { id: 'litres_2000', title: '2,000 Litres' },
      ],
      data: JSON.stringify(updatedData),
      updated_at: new Date().toISOString(),
    };
  }

  // Case E: User selected or typed quantity in litres -> Generate & Confirm Ticket
  if (currentState === 'awaiting_litres') {
    // Extract numbers from text (e.g. '1,000 Litres' -> 1000, or '500' -> 500)
    const match = textBody.replace(/,/g, '').match(/\d+/);
    const litres = match ? parseInt(match[0], 10) : 500;
    const rate = sessionData.rate_per_litre || 92.80;
    const totalAmount = Math.round(litres * rate);

    const ticketId = `GA-${Date.now().toString().slice(-6)}`;
    const orderDetails = {
      vehicle_number: sessionData.vehicle_number || 'MH05678',
      fuel_type: sessionData.fuel_type || 'Diesel',
      litres: String(litres),
      amount: String(totalAmount),
    };

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
    state: 'awaiting_vehicle',
    action: 'send_text',
    response: `Hello ${customer.name}! Reply *Hi* anytime to start a new Fuel Truck order.`,
    updated_at: new Date().toISOString(),
  };
}

module.exports = {
  processConversation,
  generateOrderTicket,
  generateWelcomeMessage,
  memorySessions,
};
