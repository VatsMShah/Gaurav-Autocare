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
async function sendFuelOrderFlow(to, flowId, customerInfo = {}, vehicleOptions = []) {
  const companyName = customerInfo.company_name || customerInfo.company || customerInfo.name || 'Valued Fleet Partner';
  const managerPhone = customerInfo.phone || (to ? `+${to}` : '');

  // Default fallback vehicle list (can be overridden dynamically from Sheets)
  const defaultVehicles = [
    { id: 'MH 04 AB 1234', title: 'MH 04 AB 1234' },
    { id: 'MH 04 CD 5678', title: 'MH 04 CD 5678' },
    { id: 'MH 04 EF 9012', title: 'MH 04 EF 9012' },
    { id: 'OTHER', title: 'Other Vehicle (Specify in Remarks)' },
  ];

  const vehicles = Array.isArray(vehicleOptions) && vehicleOptions.length > 0 ? vehicleOptions : defaultVehicles;

  return callGraphApi({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: {
        type: 'text',
        text: 'Gaurav Auto Care',
      },
      body: {
        text:
          `🙏 *Welcome to Gaurav Auto Care*\n\n` +
          `🏢 *Your company name:* ${companyName}\n` +
          `📱 *Your Number:* ${managerPhone}\n\n` +
          `Please tap the button below to book fuel for your vehicle:`,
      },
      footer: {
        text: 'Gaurav Auto Care Fuel Desk',
      },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: `fuel_${to}_${Date.now()}`,
          flow_id: flowId,
          flow_cta: '📋 Book Fuel',
          flow_action: 'navigate',
          flow_action_payload: {
            screen: 'FUEL_ORDER_FORM',
            data: {
              company_name: companyName,
              manager_phone: managerPhone,
              vehicles,
            },
          },
        },
      },
    },
  });
}

/**
 * Sends the Add Vehicle Flow
 */
async function sendAddVehicleFlow(to, flowId, customerInfo = {}) {
  const companyName = customerInfo.company_name || customerInfo.company || 'Sheetal Parivahan';
  return callGraphApi({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: { type: 'text', text: 'Gaurav Auto Care' },
      body: {
        text:
          `🚛 *Vehicle Management — Add Vehicle*\n\n` +
          `🏢 *Fleet Partner:* ${companyName}\n\n` +
          `Please tap below to register a new commercial truck to your active fleet:`,
      },
      footer: { text: 'Gaurav Auto Care Fleet Desk' },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: `add_veh_${to}_${Date.now()}`,
          flow_id: flowId,
          flow_cta: '➕ Add Vehicle',
          flow_action: 'navigate',
          flow_action_payload: {
            screen: 'ADD_VEHICLE',
            data: { company_name: companyName },
          },
        },
      },
    },
  });
}

/**
 * Sends the Edit Vehicle Flow
 */
async function sendEditVehicleFlow(to, flowId, customerInfo = {}) {
  const companyName = customerInfo.company_name || customerInfo.company || 'Sheetal Parivahan';
  return callGraphApi({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: { type: 'text', text: 'Gaurav Auto Care' },
      body: {
        text:
          `🚛 *Vehicle Management — Edit Vehicle*\n\n` +
          `🏢 *Fleet Partner:* ${companyName}\n\n` +
          `Please tap below to select and correct an existing vehicle number:`,
      },
      footer: { text: 'Gaurav Auto Care Fleet Desk' },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: `edit_veh_${to}_${Date.now()}`,
          flow_id: flowId,
          flow_cta: '✏️ Edit Vehicle',
          flow_action: 'navigate',
          flow_action_payload: {
            screen: 'EDIT_VEHICLE',
            data: { company_name: companyName },
          },
        },
      },
    },
  });
}

/**
 * Sends the Delete Vehicle Flow
 */
async function sendDeleteVehicleFlow(to, flowId, customerInfo = {}) {
  const companyName = customerInfo.company_name || customerInfo.company || 'Sheetal Parivahan';
  return callGraphApi({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: { type: 'text', text: 'Gaurav Auto Care' },
      body: {
        text:
          `🚛 *Vehicle Management — Delete Vehicle*\n\n` +
          `🏢 *Fleet Partner:* ${companyName}\n\n` +
          `Please tap below to select a vehicle to remove from active fleet booking:`,
      },
      footer: { text: 'Gaurav Auto Care Fleet Desk' },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: `del_veh_${to}_${Date.now()}`,
          flow_id: flowId,
          flow_cta: '🗑️ Delete Vehicle',
          flow_action: 'navigate',
          flow_action_payload: {
            screen: 'DELETE_VEHICLE',
            data: { company_name: companyName },
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

/**
 * Marks incoming message as read (Blue Tick) and triggers the "typing..." animation.
 * @param {string} messageId - The wamid ID of the received user message
 */
async function markAsReadAndTyping(messageId) {
  if (!messageId) return null;
  try {
    return await callGraphApi({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
      typing_indicator: {
        type: 'text',
      },
    });
  } catch (err) {
    logger.debug('Typing indicator call note: ' + err.message);
    try {
      return await callGraphApi({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      });
    } catch (fallbackErr) {
      logger.debug('Mark as read fallback note: ' + fallbackErr.message);
      return null;
    }
  }
}

/**
 * Sends the Add Manager Flow
 */
async function sendAddManagerFlow(to, flowId, customerInfo = {}) {
  const companyName = customerInfo.company_name || customerInfo.company || 'Sheetal Parivahan';
  return callGraphApi({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: { type: 'text', text: 'Gaurav Auto Care' },
      body: {
        text:
          `👥 *Manager Management — Add Manager*\n\n` +
          `🏢 *Fleet Partner:* ${companyName}\n\n` +
          `Please tap below to authorize a new manager mobile number:`,
      },
      footer: { text: 'Gaurav Auto Care Manager Desk' },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: `add_mgr_${to}_${Date.now()}`,
          flow_id: flowId,
          flow_cta: '➕ Add Manager',
          flow_action: 'navigate',
          flow_action_payload: {
            screen: 'ADD_MANAGER',
            data: { company_name: companyName },
          },
        },
      },
    },
  });
}

/**
 * Sends the Delete Manager Flow
 */
async function sendDeleteManagerFlow(to, flowId, customerInfo = {}) {
  const companyName = customerInfo.company_name || customerInfo.company || 'Sheetal Parivahan';
  return callGraphApi({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: { type: 'text', text: 'Gaurav Auto Care' },
      body: {
        text:
          `👥 *Manager Management — Delete Manager*\n\n` +
          `🏢 *Fleet Partner:* ${companyName}\n\n` +
          `Please tap below to select a manager number to revoke privileges:`,
      },
      footer: { text: 'Gaurav Auto Care Manager Desk' },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: `del_mgr_${to}_${Date.now()}`,
          flow_id: flowId,
          flow_cta: '🗑️ Delete Manager',
          flow_action: 'navigate',
          flow_action_payload: {
            screen: 'DELETE_MANAGER',
            data: { company_name: companyName },
          },
        },
      },
    },
  });
}

module.exports = {
  sendText,
  sendCtaButtons,
  sendFlowDatePicker,
  sendFuelOrderFlow,
  sendAddVehicleFlow,
  sendEditVehicleFlow,
  sendDeleteVehicleFlow,
  sendAddManagerFlow,
  sendDeleteManagerFlow,
  sendInteractiveButtons,
  sendInteractiveList,
  markAsReadAndTyping,
};
