const config = require('../config');
const logger = require('../utils/logger');

function graphUrl() {
  return `https://graph.facebook.com/${config.whatsapp.graphApiVersion}/${config.whatsapp.phoneNumberId}/messages`;
}

async function callGraphApi(body) {
  const res = await fetch(graphUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    logger.error('WhatsApp Graph API call failed', { status: res.status, data });
    throw new Error(`WhatsApp API error (${res.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

/**
 * Equivalent of the n8n "Send message1-summary" WhatsApp node —
 * sends a plain text reply.
 */
async function sendText(to, text) {
  return callGraphApi({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  });
}

/**
 * Equivalent of the n8n "HTTP Request" node — sends the 3-button
 * interactive CTA menu shown after a flow completes (state === "cta_menu").
 */
async function sendCtaButtons(to) {
  return callGraphApi({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: '👉 What would you like to do next?' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'cta_new', title: 'Post New Order' } },
          { type: 'reply', reply: { id: 'cta_ai', title: 'Know About Traket' } },
          { type: 'reply', reply: { id: 'cta_support', title: 'Support' } },
        ],
      },
    },
  });
}

/**
 * Sends a native WhatsApp Flow with in-app DatePicker calendar.
 */
async function sendFlowDatePicker(to, flowId, minDate) {
  const today = minDate || new Date().toISOString().split('T')[0];
  return callGraphApi({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: {
        type: 'text',
        text: '📅 Loading Date',
      },
      body: {
        text: 'Tap below to open the calendar and choose your vehicle loading date:',
      },
      footer: {
        text: 'Traket Transport',
      },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: `flow_${to}_${Date.now()}`,
          flow_id: flowId,
          flow_cta: '📅 Select Date',
          flow_action: 'navigate',
          flow_action_payload: {
            screen: 'DATE_SELECTION',
            data: {
              min_date: today,
            },
          },
        },
      },
    },
  });
}

/**
 * Sends the Gaurav Autocare native WhatsApp Flow form for Fuel Truck Orders.
 */
async function sendFuelOrderFlow(to, flowId, customerInfo = {}) {
  const customerName = customerInfo.name || 'Valued Customer';
  const customerPhone = customerInfo.phone || (to ? `+${to}` : '');

  return callGraphApi({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: {
        type: 'text',
        text: '⛽ Gaurav Autocare',
      },
      body: {
        text:
          `🙏 *Hii, Welcome to Gaurav Autocare*\n\n` +
          `👤 *Customer Name:* ${customerName}\n` +
          `📱 *Mobile Number:* ${customerPhone}\n\n` +
          `Please tap the button below to fill your Fuel Truck order details (Vehicle number, Petrol/Diesel, Litres & Amount):`,
      },
      footer: {
        text: 'Gaurav Autocare Fuel Truck Desk',
      },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: `fuel_${to}_${Date.now()}`,
          flow_id: flowId,
          flow_cta: '📋 Order Fuel Truck',
          flow_action: 'navigate',
          flow_action_payload: {
            screen: 'FUEL_ORDER_FORM',
            data: {
              customer_name: customerName,
              customer_phone: customerPhone,
            },
          },
        },
      },
    },
  });
}

/**
 * Sends a native WhatsApp interactive button message (up to 3 buttons).
 */
async function sendInteractiveButtons(to, headerText, bodyText, footerText, buttons) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map((btn) => ({
          type: 'reply',
          reply: { id: btn.id, title: btn.title },
        })),
      },
    },
  };

  if (headerText) {
    payload.interactive.header = { type: 'text', text: headerText };
  }
  if (footerText) {
    payload.interactive.footer = { text: footerText };
  }

  return callGraphApi(payload);
}

/**
 * Sends a native WhatsApp interactive list menu (like in user screenshot).
 */
async function sendInteractiveList(to, headerText, bodyText, footerText, buttonLabel, sections) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonLabel,
        sections,
      },
    },
  };

  if (headerText) {
    payload.interactive.header = { type: 'text', text: headerText };
  }
  if (footerText) {
    payload.interactive.footer = { text: footerText };
  }

  return callGraphApi(payload);
}

module.exports = {
  sendText,
  sendCtaButtons,
  sendFlowDatePicker,
  sendFuelOrderFlow,
  sendInteractiveButtons,
  sendInteractiveList,
};
