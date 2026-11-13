const config = require('../config');
const { processConversation } = require('../automation/processConversation');
const db = require('../services/supabase');
const sheets = require('../services/sheets');
const whatsapp = require('../services/whatsapp');
const groupBridge = require('../services/groupBridge');
const logger = require('../utils/logger');

// Fast in-memory session cache to avoid database roundtrip latency on chat turns
const memorySessionStore = new Map();

/**
 * Safely parses the JSON `data` blob
 */
function safeParseData(jsonString) {
  try {
    return JSON.parse(jsonString || '{}');
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------
// Legacy Handlers (preserved for backward compatibility)
// ---------------------------------------------------------------------
async function persistBookVehicle(output) {
  const data = safeParseData(output.data);
  const existing = await db.getBookVehicleRow(output.user_id);
  const row = {
    user_id: output.user_id,
    state: output.state,
    updated_at: output.updated_at,
    loadingPin: data.loadingPin || existing.loadingPin || '',
    unloadingPin: data.unloadingPin || existing.unloadingPin || '',
    cargoType: data.cargoType || existing.cargoType || '',
    vehicleType: data.vehicleType || existing.vehicleType || '',
    vehicleSubType: data.vehicleSubType || existing.vehicleSubType || '',
    material: data.material || existing.material || '',
    loadingDate: data.loadingDate || existing.loadingDate || '',
    loadingTime: data.loadingTime || existing.timeSlot || '',
    company: data.company || existing.company || '',
    contactName: data.contactName || existing.contactName || '',
    phone: data.phone || existing.phone || '',
    email: data.email || existing.email || '',
    alternatePhone: data.alternatePhone || existing.alternatePhone || '',
    website: data.website || existing.website || '',
    fclType: data.fclType || existing.fclType || '',
    containerType: data.containerType || existing.containerType || '',
    shippingLine: data.shippingLine || existing.shippingLine || '',
    loadingYard: data.loadingYard || existing.loadingYard || '',
    unloadingAddress: data.unloadingAddress || existing.unloadingAddress || '',
    emptyYard: data.emptyYard || existing.emptyYard || '',
    stuffingAddress: data.stuffingAddress || existing.stuffingAddress || '',
    portCfs: data.portCfs || existing.portCfs || '',
    bodyType: data.bodyType || existing.bodyType || '',
    openClose: data.openClose || existing.openClose || '',
    trailerBedType: data.trailerBedType || existing.trailerBedType || '',
    trailerDimType: data.trailerDimType || existing.trailerDimType || '',
    dimensions: data.dimensions || existing.dimensions || '',
    remarks: data.remarks || existing.remarks || '',
    weight: data.weight || existing.weight || '',
  };
  await db.saveBookVehicleRow(row);
}

async function persistProvideVehicle(output) {
  const data = safeParseData(output.data);
  const existing = await db.getProvideVehicleRow(output.user_id);
  const row = {
    user_id: output.user_id,
    state: output.state,
    updated_at: output.updated_at,
    vehicleType: data.provider_vehicleType || existing.vehicleType || '',
    vehicleNumber: data.provider_vehicleNumber || existing.vehicleNumber || '',
    driverName: data.provider_driverName || existing.driverName || '',
    capacity: data.provider_capacity || existing.capacity || '',
    routePreference: data.provider_routes || existing.routePreference || '',
    availability: data.provider_availability || existing.availability || '',
    driverPhone: data.provider_driverPhone || existing.driverPhone || '',
    currentLocation: data.provider_currentLocation || existing.currentLocation || '',
    notes: data.provider_capacity || existing.notes || '',
    documents: data.provider_documents || existing.documents || '',
  };
  await db.saveProvideVehicleRow(row);
}

async function persistSupport(output) {
  await db.saveSupportRow({
    user_id: output.user_id,
    updated_at: output.updated_at,
  });
}

// ---------------------------------------------------------------------
// ACTIVE GAURAV AUTOCARE WEBHOOK CONTROLLER
// ---------------------------------------------------------------------

/**
 * Main entrypoint — handles incoming WhatsApp messages and interactive Flow submissions
 * for Gaurav Autocare Fuel Truck Ordering.
 *
 * @param {object} value - `entry[0].changes[0].value` from Meta's webhook body
 */
async function handleIncomingMessage(value) {
  // Skip status updates (delivered, read, sent)
  if (!value?.messages?.length) {
    logger.info('Webhook payload had no messages (likely a status update) — skipping');
    return;
  }

  const incomingMsg = value.messages[0];
  const phone = incomingMsg?.from;
  const messageId = incomingMsg?.id;

  // 1. INSTANT BLUE TICK + TYPING ANIMATION (Fire immediately, non-blocking)
  if (messageId) {
    whatsapp.markAsReadAndTyping(messageId).catch((err) => {
      logger.debug('Blue tick / typing note: ' + err.message);
    });
  }

  // 2. Fetch live fuel rates (cached in memory)
  let activeRates = null;
  try {
    activeRates = await sheets.getFuelRates();
  } catch (rateErr) {
    logger.debug('Rates fetch fallback: ' + rateErr.message);
  }

  // 3. Look up customer profile & manager phones (cached in memory)
  let preloadedCustomer = null;
  let dynamicManagerPhones = null;
  try {
    preloadedCustomer = await sheets.getCustomerByPhone(phone);
  } catch (custErr) {
    logger.debug('Sheet customer lookup fallback: ' + custErr.message);
  }
  try {
    dynamicManagerPhones = await sheets.getManagerPhones();
  } catch (mgrErr) {
    logger.debug('Sheet manager lookup fallback: ' + mgrErr.message);
  }

  // 4. Fast session lookup (Memory cache first, Supabase fallback)
  let sessionRecord = memorySessionStore.get(phone) || null;
  if (!sessionRecord && phone && config.supabase?.key && !config.supabase.key.startsWith('your_')) {
    try {
      const client = db.getClient();
      const { data } = await client
        .from('bot_sessions')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();
      if (data) {
        sessionRecord = data;
        memorySessionStore.set(phone, data);
      }

      // If customer not yet resolved from sheets, try Supabase
      if (!preloadedCustomer) {
        const { data: dbCust } = await client
          .from('customers')
          .select('*')
          .ilike('phone', `%${phone.replace(/\D/g, '').slice(-10)}%`)
          .maybeSingle();
        if (dbCust) preloadedCustomer = dbCust;
      }
    } catch (dbErr) {
      logger.debug('Bot session fetch info: ' + dbErr.message);
    }
  }

  // 5. Process Conversation & State Machine (< 1ms in memory)
  const output = processConversation(
    value,
    sessionRecord ? [sessionRecord] : [],
    activeRates,
    preloadedCustomer,
    dynamicManagerPhones
  );

  // Update in-memory session store immediately
  memorySessionStore.set(output.phone, {
    phone: output.phone,
    state: output.state,
    data: output.data,
    customer: output.customer,
  });

  const sessionData = {
    customer: output.customer,
    orderDetails: output.orderDetails,
  };

  const parsedSession = safeParseData(output.data);
  const orderRecord = output.action === 'send_ticket' && output.orderDetails
    ? {
        ticketId: parsedSession.ticketId,
        customerName: output.customer?.company_name || output.customer?.name || 'Sheetal Parivahan',
        phone: output.phone,
        vehicleNumber: output.orderDetails.vehicle_number,
        fuelType: output.orderDetails.fuel_type,
        litres: output.orderDetails.litres,
        amount: output.orderDetails.amount,
        ratePerLitre: output.orderDetails.rate_per_litre,
        isFullTank: output.orderDetails.is_full_tank,
        driverName: output.orderDetails.driver_name,
        driverNumber: output.orderDetails.driver_number,
        isEnroute: output.orderDetails.is_enroute,
        oilMaterial: output.orderDetails.oil_material,
        remarks: output.orderDetails.remarks,
        orderStatus: 'Confirmed',
        paymentStatus: 'Pending',
        source: output.flowType === 'whatsapp_flow' ? 'whatsapp_flow' : 'whatsapp_bot',
      }
    : null;

  // 6. DISPATCH OUTBOUND WHATSAPP RESPONSE FIRST (< 500ms)
  // Respond immediately so user experiences near-instant replies!
  const hasValidFlowId =
    Boolean(config.whatsapp.flowId) &&
    config.whatsapp.flowId !== 'your_flow_id_here' &&
    config.whatsapp.flowId !== '';

  if (output.action === 'send_vehicle_list') {
    try {
      await whatsapp.sendInteractiveList(
        output.phone,
        output.header,
        output.response,
        output.footer,
        output.buttonLabel,
        output.sections
      );
      logger.info('Sent Interactive Vehicle List to ' + output.phone);
    } catch (listErr) {
      logger.warn('Failed to send interactive list, falling back to text', listErr);
      await whatsapp.sendText(output.phone, output.response);
    }
  } else if (
    output.action === 'send_fuel_buttons' ||
    output.action === 'send_litres_buttons' ||
    output.action === 'send_manager_menu' ||
    output.action === 'send_vehicle_menu'
  ) {
    try {
      await whatsapp.sendInteractiveButtons(
        output.phone,
        output.header,
        output.response,
        output.footer,
        output.buttons
      );
      logger.info(`Sent Interactive Buttons (${output.action}) to ` + output.phone);
    } catch (btnErr) {
      logger.warn('Failed to send interactive buttons, falling back to text', btnErr);
      await whatsapp.sendText(output.phone, output.response);
    }
  } else if (output.action === 'send_add_vehicle_flow') {
    try {
      await whatsapp.sendAddVehicleFlow(output.phone, config.whatsapp.addVehicleFlowId, output.customer);
      logger.info('Sent WhatsApp Add Vehicle Flow to ' + output.phone);
    } catch (flowErr) {
      logger.warn('Failed to send Add Vehicle Flow, falling back to text', flowErr);
      await whatsapp.sendText(output.phone, output.response);
    }
  } else if (output.action === 'send_edit_vehicle_flow') {
    try {
      await whatsapp.sendEditVehicleFlow(output.phone, config.whatsapp.editVehicleFlowId, output.customer);
      logger.info('Sent WhatsApp Edit Vehicle Flow to ' + output.phone);
    } catch (flowErr) {
      logger.warn('Failed to send Edit Vehicle Flow, falling back to text', flowErr);
      await whatsapp.sendText(output.phone, output.response);
    }
  } else if (output.action === 'send_delete_vehicle_flow') {
    try {
      await whatsapp.sendDeleteVehicleFlow(output.phone, config.whatsapp.deleteVehicleFlowId, output.customer);
      logger.info('Sent WhatsApp Delete Vehicle Flow to ' + output.phone);
    } catch (flowErr) {
      logger.warn('Failed to send Delete Vehicle Flow, falling back to text', flowErr);
      await whatsapp.sendText(output.phone, output.response);
    }
  } else if (
    output.action === 'save_and_confirm_add_vehicle' ||
    output.action === 'save_and_confirm_edit_vehicle' ||
    output.action === 'save_and_confirm_delete_vehicle'
  ) {
    try {
      await whatsapp.sendInteractiveButtons(
        output.phone,
        output.header || 'Gaurav Auto Care',
        output.response,
        output.footer || 'Gaurav Auto Care Fleet Manager',
        output.buttons || [
          { id: 'btn_book_fuel', title: '📋 Book Fuel' },
          { id: 'btn_modify_vehicle', title: '🚛 Modify Vehicle' },
        ]
      );
      logger.info(`Sent confirmation buttons (${output.action}) to ` + output.phone);
    } catch (btnErr) {
      logger.warn('Failed to send confirmation buttons, falling back to text', btnErr);
      await whatsapp.sendText(output.phone, output.response);
    }
  } else if (output.action === 'send_fuel_flow' || output.action === 'send_welcome') {
    if (hasValidFlowId) {
      try {
        await whatsapp.sendFuelOrderFlow(output.phone, config.whatsapp.flowId, output.customer);
        logger.info('Sent WhatsApp Fuel Order Flow to ' + output.phone);
      } catch (flowErr) {
        logger.warn('Failed to send WhatsApp Flow, falling back to text message', flowErr);
        await whatsapp.sendText(output.phone, output.response);
      }
    } else {
      logger.info('No flowId configured, sending welcome text to ' + output.phone);
      await whatsapp.sendText(output.phone, output.response);
    }
  } else if (output.action === 'send_ticket') {
    try {
      await whatsapp.sendInteractiveButtons(
        output.phone,
        'Gaurav Auto Care',
        output.response,
        'Thank you for your order!',
        [
          { id: 'btn_new_order', title: '📋 Order Another' },
          { id: 'btn_support', title: '📞 Support' },
        ]
      );
    } catch (ticketErr) {
      await whatsapp.sendText(output.phone, output.response);
    }

    // Group Bridge: Dispatch ticket to client WhatsApp group(s) for ₹0.00
    try {
      const targetGroups = output.customer?.group_ids
        ? String(output.customer.group_ids).split(',').map((s) => s.trim())
        : [];
      await groupBridge.broadcastOrderTicket(output.response, targetGroups);
    } catch (bridgeErr) {
      logger.warn('[Group Bridge] Failed to broadcast ticket to groups:', bridgeErr.message);
    }
  } else if (output.response) {
    await whatsapp.sendText(output.phone, output.response);
  }

  logger.info('⚡ Sent reply to WhatsApp user', {
    phone: output.phone,
    state: output.state,
    action: output.action,
  });

  // 7. BACKGROUND ASYNC PERSISTENCE (Runs in parallel, zero user wait time)
  (async () => {
    // Save to Google Sheets
    if (sheets.isConfigured()) {
      try {
        await sheets.saveBotSession(output.phone, output.state, sessionData);
        if (orderRecord) {
          await sheets.saveFuelTruckOrder(orderRecord);
          logger.info(`✅ Order #${orderRecord.ticketId} saved to Google Sheet`);
        }
        if (output.action === 'save_and_confirm_add_vehicle' && output.vehicleNumber) {
          await sheets.addVehicle(output.vehicleNumber, output.customer?.company_name || 'Sheetal Parivahan');
          logger.info(`✅ Registered new vehicle ${output.vehicleNumber} in Google Sheet`);
        } else if (output.action === 'save_and_confirm_edit_vehicle' && output.oldVehicleNumber && output.newVehicleNumber) {
          await sheets.editVehicle(output.oldVehicleNumber, output.newVehicleNumber, output.customer?.company_name || 'Sheetal Parivahan');
          logger.info(`✅ Updated vehicle ${output.oldVehicleNumber} -> ${output.newVehicleNumber} in Google Sheet`);
        } else if (output.action === 'save_and_confirm_delete_vehicle' && output.vehicleNumber) {
          await sheets.deleteVehicle(output.vehicleNumber, output.customer?.company_name || 'Sheetal Parivahan');
          logger.info(`✅ Removed vehicle ${output.vehicleNumber} from Google Sheet`);
        }
      } catch (sheetErr) {
        logger.warn('Google Sheet persist error:', sheetErr.message);
      }
    }

    // Save to Supabase
    if (config.supabase?.key && !config.supabase.key.startsWith('your_')) {
      try {
        await db.upsertBotSession(output.phone, output.state, sessionData);
        if (orderRecord) {
          await db.saveFuelTruckOrder(orderRecord);
          logger.info(`✅ Order #${orderRecord.ticketId} saved to Supabase`);
        }
      } catch (dbErr) {
        logger.warn('Supabase persist error:', dbErr.message);
      }
    }
  })().catch((err) => logger.warn('Background persistence error:', err));
}

module.exports = {
  handleIncomingMessage,
  persistBookVehicle,
  persistProvideVehicle,
  persistSupport,
};
