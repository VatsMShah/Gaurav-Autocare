const config = require('../config');
const { processConversation } = require('../automation/processConversation');
const db = require('../services/supabase');
const whatsapp = require('../services/whatsapp');
const logger = require('../utils/logger');

/**
 * Safely parses the JSON `data` blob stored on the master row / process
 * output. Mirrors the `JSON.parse(x || "{}")` pattern used throughout the
 * original n8n expressions.
 */
function safeParseData(jsonString) {
  try {
    return JSON.parse(jsonString || '{}');
  } catch {
    return {};
  }
}

/**
 * Equivalent of "BookVehicleGetRows" -> "BookVehicleAppendUpdateRow".
 * Each field prefers the freshly-collected value from this turn's `data`,
 * falling back to whatever was already in the BookVehicle sheet row.
 */
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

/**
 * Equivalent of "ProvideVehicleGetRows" -> "ProvideVehicleAppendUpdateRow1".
 *
 * NOTE: the original n8n node mapped the "notes" column from
 * `provider_capacity` instead of `provider_notes` — almost certainly a
 * copy-paste bug in the source workflow. We replicate it as-is here for
 * exact functional parity; flip the line below to `data.provider_notes`
 * once you've confirmed with the business which behavior is correct.
 */
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
    // Replicated from original workflow — see NOTE above.
    notes: data.provider_capacity || existing.notes || '',
    documents: data.provider_documents || existing.documents || '',
  };

  await db.saveProvideVehicleRow(row);
}

/** Equivalent of "SupportGetRows" -> "SupportAppendUpdateRow". */
async function persistSupport(output) {
  await db.saveSupportRow({
    user_id: output.user_id,
    updated_at: output.updated_at,
  });
}

/**
 * Equivalent of the n8n "Switch" node (branch on flowType) feeding into
 * the per-flow sheet + the shared "Send message1-summary" node.
 */
async function persistToFlowSheet(output) {
  switch (output.flowType) {
    case 'book':
      // Only persist to book_vehicle if the order is completed (state === 'cta_menu')
      // Partial/in-progress chats remain in users_master (Live Bot Sessions)
      if (output.state === 'cta_menu') {
        return persistBookVehicle(output);
      }
      return null;
    case 'provider':
      return persistProvideVehicle(output);
    case 'support':
      return persistSupport(output);
    default:
      // Matches the Switch node's fallback output — no sheet write, just send the reply.
      return null;
  }
}

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

  const phone = value.messages[0]?.from;

  // Safe database fetch (if Supabase credentials are configured; otherwise fallback gracefully)
  let masterRows = [];
  try {
    if (phone && config.supabase?.key && !config.supabase.key.startsWith('your_')) {
      masterRows = await db.getMasterRowsByPhone(phone);
    }
  } catch (dbErr) {
    logger.info('Supabase not queried (standalone flow mode): ' + dbErr.message);
  }

  // Process Conversation & State Machine
  const output = processConversation(value, masterRows);

  // Safe database persist (if configured)
  try {
    if (config.supabase?.key && !config.supabase.key.startsWith('your_')) {
      await db.upsertBotSession(output.phone, output.state, {
        customer: output.customer,
        orderDetails: output.orderDetails,
      });

      // If user placed a fuel truck order, save to fuel_truck_orders table
      if (output.action === 'send_ticket' && output.orderDetails) {
        const parsedSession = JSON.parse(output.data || '{}');
        await db.saveFuelTruckOrder({
          ticketId: parsedSession.ticketId,
          customerName: output.customer?.name,
          phone: output.phone,
          vehicleNumber: output.orderDetails.vehicle_number,
          fuelType: output.orderDetails.fuel_type,
          litres: output.orderDetails.litres,
          amount: output.orderDetails.amount,
          orderStatus: 'confirmed',
          paymentStatus: 'pending',
        });
      }
    }
  } catch (persistErr) {
    logger.info('Supabase persist skipped (standalone flow mode): ' + persistErr.message);
  }

  // Handle Response / Flow Action
  if (output.action === 'send_fuel_flow') {
    if (config.whatsapp.flowId) {
      try {
        await whatsapp.sendFuelOrderFlow(output.phone, config.whatsapp.flowId, output.customer);
        logger.info('Sent WhatsApp Fuel Order Flow to ' + output.phone);
      } catch (flowErr) {
        logger.warn('Failed to send WhatsApp Flow, falling back to text message', flowErr);
        await whatsapp.sendText(output.phone, output.response);
      }
    } else {
      // If WHATSAPP_FLOW_ID is not configured yet in .env, send the welcome text
      await whatsapp.sendText(output.phone, output.response);
    }
  } else if (output.response) {
    await whatsapp.sendText(output.phone, output.response);
  }

  logger.info('Processed message for Gaurav Autocare', {
    phone: output.phone,
    state: output.state,
    action: output.action,
  });
}

module.exports = { handleIncomingMessage };
