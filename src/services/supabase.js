const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const logger = require('../utils/logger');
const sheets = require('./sheets');

let supabase = null;

function getClient() {
  if (!supabase) {
    const rawUrl = config.supabase.url;
    const url = rawUrl ? rawUrl.replace(/\/rest\/v1\/?$/, '') : rawUrl;
    const key = config.supabase.key;
    if (!url || !key || url.startsWith('your_') || key.startsWith('your_')) {
      logger.error('Supabase credentials are not configured or are still placeholders. Please update .env.');
      throw new Error('Supabase credentials not configured');
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

// =====================================================================
// MAPPINGS: JS CamelCase <-> DB SnakeCase
// =====================================================================

function mapMasterToJS(dbRow) {
  if (!dbRow) return null;
  return {
    user_id: dbRow.user_id,
    phone: dbRow.phone,
    state: dbRow.state,
    updated_at: dbRow.updated_at,
    flowType: dbRow.flow_type,
    // data is stored as JSONB in DB, but the state machine expects a JSON string
    data: dbRow.data ? JSON.stringify(dbRow.data) : '{}',
  };
}

function mapMasterToDB(jsRow) {
  let parsedData = {};
  try {
    parsedData = typeof jsRow.data === 'string' ? JSON.parse(jsRow.data) : jsRow.data || {};
  } catch (err) {
    logger.warn('Failed to parse session data string, storing empty object', err);
  }

  return {
    user_id: jsRow.user_id,
    phone: jsRow.phone,
    state: jsRow.state,
    updated_at: jsRow.updated_at || new Date().toISOString(),
    flow_type: jsRow.flowType || '',
    data: parsedData,
  };
}

function mapBookToJS(dbRow) {
  if (!dbRow) return {};
  const flow = dbRow.flow_data || {};
  return {
    user_id: dbRow.user_id,
    phone: dbRow.phone,
    state: dbRow.state,
    cargoType: dbRow.cargo_type,
    origin: dbRow.origin,
    destination: dbRow.destination,
    vehicleOrContainer: dbRow.vehicle_or_container,
    materialOrLine: dbRow.material_or_line,
    weight: dbRow.weight,
    loadingDate: dbRow.loading_date,
    timeSlot: dbRow.time_slot,
    company: dbRow.company_name,
    contactName: dbRow.contact_name,
    email: dbRow.email,
    alternatePhone: flow.alternate_phone || dbRow.alternate_phone || '',
    remarks: dbRow.remarks,
    updated_at: dbRow.updated_at,
    loadingPin: flow.loading_pin || dbRow.origin,
    unloadingPin: flow.unloading_pin || dbRow.destination,
    vehicleType: flow.vehicle_type || dbRow.vehicle_or_container,
    vehicleSubType: flow.vehicle_sub_type,
    material: flow.material || dbRow.material_or_line,
    fclType: flow.fcl_type,
    containerType: flow.container_type,
    shippingLine: flow.shipping_line || dbRow.material_or_line,
    loadingYard: flow.loading_yard || dbRow.origin,
    unloadingAddress: flow.unloading_address || dbRow.destination,
    emptyYard: flow.empty_yard,
    stuffingAddress: flow.stuffing_address || dbRow.origin,
    portCfs: flow.port_cfs || dbRow.destination,
    bodyType: flow.body_type,
    openClose: flow.open_close,
    trailerBedType: flow.trailer_bed_type,
    trailerDimType: flow.trailer_dim_type,
  };
}

function mapBookToDB(jsRow) {
  const origin = jsRow.loadingYard || jsRow.stuffingAddress || jsRow.loadingPin || '';
  const destination = jsRow.unloadingAddress || jsRow.portCfs || jsRow.unloadingPin || '';

  let vehicleOrContainer = '';
  if (jsRow.fclType) {
    vehicleOrContainer = `${jsRow.fclType}${jsRow.containerType ? ` (${jsRow.containerType})` : ''}`;
  } else if (jsRow.vehicleType) {
    vehicleOrContainer = jsRow.vehicleType;
    if (jsRow.vehicleSubType) vehicleOrContainer += ` – ${jsRow.vehicleSubType}`;
    if (jsRow.bodyType) vehicleOrContainer += ` (${jsRow.bodyType})`;
  }

  const materialOrLine = jsRow.shippingLine || jsRow.material || '';

  let remarks = jsRow.remarks || '';
  if (jsRow.emptyYard && !remarks.includes(jsRow.emptyYard)) {
    remarks = remarks ? `Empty Yard: ${jsRow.emptyYard} | ${remarks}` : `Empty Yard: ${jsRow.emptyYard}`;
  }
  if (jsRow.alternatePhone && !remarks.includes(jsRow.alternatePhone)) {
    remarks = remarks ? `Alt Phone: ${jsRow.alternatePhone} | ${remarks}` : `Alt Phone: ${jsRow.alternatePhone}`;
  }

  return {
    user_id: jsRow.user_id,
    phone: jsRow.phone || '',
    state: jsRow.state || '',
    cargo_type: jsRow.cargoType || '',
    origin: origin,
    destination: destination,
    vehicle_or_container: vehicleOrContainer,
    material_or_line: materialOrLine,
    weight: jsRow.weight || '',
    loading_date: jsRow.loadingDate || '',
    time_slot: jsRow.loadingTime || '',
    company_name: jsRow.company || '',
    contact_name: jsRow.contactName || '',
    email: jsRow.email || '',
    remarks: remarks,
    flow_data: {
      loading_pin: jsRow.loadingPin || '',
      unloading_pin: jsRow.unloadingPin || '',
      vehicle_type: jsRow.vehicleType || '',
      vehicle_sub_type: jsRow.vehicleSubType || '',
      body_type: jsRow.bodyType || '',
      open_close: jsRow.openClose || '',
      trailer_bed_type: jsRow.trailerBedType || '',
      trailer_dim_type: jsRow.trailerDimType || '',
      fcl_type: jsRow.fclType || '',
      container_type: jsRow.containerType || '',
      shipping_line: jsRow.shippingLine || '',
      loading_yard: jsRow.loadingYard || '',
      unloading_address: jsRow.unloadingAddress || '',
      empty_yard: jsRow.emptyYard || '',
      stuffing_address: jsRow.stuffingAddress || '',
      port_cfs: jsRow.portCfs || '',
      cargo_dimensions: jsRow.dimensions || '',
      alternate_phone: jsRow.alternatePhone || '',
      website: jsRow.website || '',
    },
    updated_at: jsRow.updated_at || new Date().toISOString(),
  };
}

function mapProvideToJS(dbRow) {
  if (!dbRow) return {};
  return {
    user_id: dbRow.user_id,
    state: dbRow.state,
    updated_at: dbRow.updated_at,
    vehicleType: dbRow.vehicle_type,
    vehicleNumber: dbRow.vehicle_number,
    driverName: dbRow.driver_name,
    capacity: dbRow.capacity,
    routePreference: dbRow.route_preference,
    availability: dbRow.availability,
    driverPhone: dbRow.driver_phone,
    currentLocation: dbRow.current_location,
    notes: dbRow.notes,
    documents: dbRow.documents,
  };
}

function mapProvideToDB(jsRow) {
  return {
    user_id: jsRow.user_id,
    state: jsRow.state,
    updated_at: jsRow.updated_at || new Date().toISOString(),
    vehicle_type: jsRow.vehicleType || '',
    vehicle_number: jsRow.vehicleNumber || '',
    driver_name: jsRow.driverName || '',
    capacity: jsRow.capacity || '',
    route_preference: jsRow.routePreference || '',
    availability: jsRow.availability || '',
    driver_phone: jsRow.driverPhone || '',
    current_location: jsRow.currentLocation || '',
    notes: jsRow.notes || '',
    documents: jsRow.documents || '',
  };
}

function mapSupportToJS(dbRow) {
  if (!dbRow) return {};
  return {
    user_id: dbRow.user_id,
    updated_at: dbRow.updated_at,
  };
}

function mapSupportToDB(jsRow) {
  return {
    user_id: jsRow.user_id,
    updated_at: jsRow.updated_at || new Date().toISOString(),
  };
}

// =====================================================================
// API INTERFACE (Mirrors sheets.js)
// In-memory fallback stores when Supabase is unreachable or paused
const memoryStore = {
  users_master: new Map(),
  book_vehicle: new Map(),
  provide_vehicle: new Map(),
  support: new Map(),
};

// =====================================================================
// API INTERFACE (Mirrors sheets.js)
// =====================================================================

/** Get all master session rows by phone number */
async function getMasterRowsByPhone(phone) {
  try {
    const client = getClient();
    const { data, error } = await client
      .from('users_master')
      .select('*')
      .eq('phone', phone);

    if (error) throw error;
    return (data || []).map(mapMasterToJS);
  } catch (err) {
    logger.warn('Supabase getMasterRowsByPhone failed, using memory fallback:', err.message || err);
    const rows = [];
    for (const row of memoryStore.users_master.values()) {
      if (row.phone === phone) {
        rows.push(row);
      }
    }
    return rows;
  }
}

/** Save or update master session row */
async function saveMasterSession(row) {
  memoryStore.users_master.set(row.user_id, row);

  // Automatically mirror to Google Sheets in background
  sheets.saveMasterSession(row).catch((e) =>
    logger.warn('Background Sheets sync for master session failed:', e.message)
  );

  try {
    const client = getClient();
    const dbRow = mapMasterToDB(row);

    const { data, error } = await client
      .from('users_master')
      .upsert(dbRow)
      .select();

    if (error) throw error;

    logger.info('Saved master session in Supabase', { user_id: row.user_id });
    return data && data.length > 0 ? mapMasterToJS(data[0]) : row;
  } catch (err) {
    logger.warn('Supabase saveMasterSession failed, saved to memory store:', err.message || err);
    return row;
  }
}

/** Get BookVehicle row */
async function getBookVehicleRow(userId) {
  try {
    const client = getClient();
    const { data, error } = await client
      .from('book_vehicle')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (data) return mapBookToJS(data);
  } catch (err) {
    logger.warn('Supabase getBookVehicleRow failed, using memory fallback:', err.message || err);
  }

  return memoryStore.book_vehicle.get(userId) || {};
}

/** Save or update BookVehicle row */
async function saveBookVehicleRow(row) {
  memoryStore.book_vehicle.set(row.user_id, row);

  // Automatically mirror to Google Sheets in background
  sheets.saveBookVehicleRow(row).catch((e) =>
    logger.warn('Background Sheets sync for BookVehicle failed:', e.message)
  );

  try {
    const client = getClient();
    const dbRow = mapBookToDB(row);

    const { data, error } = await client
      .from('book_vehicle')
      .upsert(dbRow)
      .select();

    if (error) throw error;

    logger.info('Saved book vehicle row in Supabase', { user_id: row.user_id });
    return data && data.length > 0 ? mapBookToJS(data[0]) : row;
  } catch (err) {
    logger.warn('Supabase saveBookVehicleRow failed, saved to memory store:', err.message || err);
    return row;
  }
}

/** Get ProvideVehicle row */
async function getProvideVehicleRow(userId) {
  try {
    const client = getClient();
    const { data, error } = await client
      .from('provide_vehicle')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return mapProvideToJS(data);
  } catch (err) {
    logger.warn('Supabase getProvideVehicleRow failed, using memory fallback:', err.message || err);
    return memoryStore.provide_vehicle.get(userId) || {};
  }
}

/** Save or update ProvideVehicle row */
async function saveProvideVehicleRow(row) {
  memoryStore.provide_vehicle.set(row.user_id, row);

  // Automatically mirror to Google Sheets in background
  sheets.saveProvideVehicleRow(row).catch((e) =>
    logger.warn('Background Sheets sync for ProvideVehicle failed:', e.message)
  );

  try {
    const client = getClient();
    const dbRow = mapProvideToDB(row);

    const { data, error } = await client
      .from('provide_vehicle')
      .upsert(dbRow)
      .select();

    if (error) throw error;

    logger.info('Saved provide vehicle row in Supabase', { user_id: row.user_id });
    return data && data.length > 0 ? mapProvideToJS(data[0]) : row;
  } catch (err) {
    logger.warn('Supabase saveProvideVehicleRow failed, saved to memory store:', err.message || err);
    return row;
  }
}

/** Get Support row */
async function getSupportRow(userId) {
  try {
    const client = getClient();
    const { data, error } = await client
      .from('support')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return mapSupportToJS(data);
  } catch (err) {
    logger.warn('Supabase getSupportRow failed, using memory fallback:', err.message || err);
    return memoryStore.support.get(userId) || {};
  }
}

/** Save or update Support row */
async function saveSupportRow(row) {
  memoryStore.support.set(row.user_id, row);

  // Automatically mirror to Google Sheets in background
  sheets.saveSupportRow(row).catch((e) =>
    logger.warn('Background Sheets sync for support failed:', e.message)
  );

  try {
    const client = getClient();
    const dbRow = mapSupportToDB(row);

    const { data, error } = await client
      .from('support')
      .upsert(dbRow)
      .select();

    if (error) throw error;

    logger.info('Saved support row in Supabase', { user_id: row.user_id });
    return data && data.length > 0 ? mapSupportToDB(data[0]) : row;
  } catch (err) {
    logger.warn('Supabase saveSupportRow failed, saved to memory store:', err.message || err);
    return row;
  }
}

/** Save fuel truck order placed via WhatsApp Flow */
async function saveFuelTruckOrder(order) {
  try {
    const client = getClient();
    const { data, error } = await client
      .from('fuel_truck_orders')
      .upsert(
        {
          ticket_id: order.ticketId || order.ticket_id,
          customer_name: order.customerName || order.customer_name || 'Valued Customer',
          phone: order.phone,
          vehicle_number: (order.vehicleNumber || order.vehicle_number || '').toUpperCase(),
          fuel_type: order.fuelType || order.fuel_type || 'Diesel',
          litres: parseFloat(order.litres) || 0,
          estimated_amount: parseFloat(order.amount || order.estimated_amount) || 0,
          order_status: order.orderStatus || 'confirmed',
          payment_status: order.paymentStatus || 'pending',
          source: 'whatsapp_flow',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'ticket_id' }
      )
      .select();

    if (error) throw error;
    logger.info('Saved fuel truck order to Supabase', { ticket_id: order.ticketId });
    return data?.[0] || order;
  } catch (err) {
    logger.warn('Supabase saveFuelTruckOrder failed:', err.message || err);
    return order;
  }
}

/** Get customer details by phone number */
async function getCustomerByPhone(phone) {
  try {
    const client = getClient();
    const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
    const { data, error } = await client
      .from('customers')
      .select('*')
      .ilike('phone', `%${cleanPhone}%`)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (err) {
    logger.warn('Supabase getCustomerByPhone failed:', err.message || err);
    return null;
  }
}

/** Create or update customer record */
async function saveCustomer(customer) {
  try {
    const client = getClient();
    const { data, error } = await client
      .from('customers')
      .upsert(
        {
          phone: customer.phone,
          name: customer.name,
          company_name: customer.company || customer.company_name || null,
          email: customer.email || null,
          gstin: customer.gstin || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'phone' }
      )
      .select();

    if (error) throw error;
    return data?.[0] || customer;
  } catch (err) {
    logger.warn('Supabase saveCustomer failed:', err.message || err);
    return customer;
  }
}

/** Get current fuel rates for Petrol and Diesel */
async function getFuelRates() {
  try {
    const client = getClient();
    const { data, error } = await client
      .from('fuel_rates')
      .select('*');

    if (error) throw error;
    return data || [];
  } catch (err) {
    logger.warn('Supabase getFuelRates failed:', err.message || err);
    return [
      { fuel_type: 'Petrol', rate_per_litre: 104.50 },
      { fuel_type: 'Diesel', rate_per_litre: 92.80 },
    ];
  }
}

/** Upsert WhatsApp bot session state */
async function upsertBotSession(phone, state, sessionData = {}) {
  try {
    const client = getClient();
    const { data, error } = await client
      .from('bot_sessions')
      .upsert(
        {
          phone,
          state,
          flow_type: 'fuel_order',
          session_data: sessionData,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'phone' }
      )
      .select();

    if (error) throw error;
    return data?.[0];
  } catch (err) {
    logger.warn('Supabase upsertBotSession failed:', err.message || err);
    return null;
  }
}

module.exports = {
  getClient,
  saveFuelTruckOrder,
  getCustomerByPhone,
  saveCustomer,
  getFuelRates,
  upsertBotSession,
  getMasterRowsByPhone,
  saveMasterSession,
  getBookVehicleRow,
  saveBookVehicleRow,
  getProvideVehicleRow,
  saveProvideVehicleRow,
  getSupportRow,
  saveSupportRow,
};
