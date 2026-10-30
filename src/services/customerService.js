/**
 * Customer Data Service for Gaurav Autocare
 * Handles lookup and extraction of customer details (name and phone).
 * Supports in-memory cache, Google Sheets, and Supabase.
 */

// In-memory customer directory
const customerRegistry = {};

/**
 * Normalizes phone number to last 10 digits for clean lookup
 * @param {string} phone
 * @returns {string}
 */
function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

/**
 * Extract customer information by phone number and WhatsApp webhook context
 * @param {string} phone - Sender phone number from WhatsApp
 * @param {object} waMessagePayload - Meta webhook payload object (may include contacts array)
 * @param {object|null} existingCustomer - Pre-fetched customer object from DB or Sheets
 * @returns {object} { name, phone, company, isRegistered }
 */
function extractCustomerInfo(phone, waMessagePayload = {}, existingCustomer = null) {
  const normPhone = normalizePhone(phone);
  const formattedPhone = phone ? (phone.startsWith('+') ? phone : `+${phone}`) : 'N/A';

  // 1. Explicitly passed pre-fetched customer (e.g. from Sheets or Supabase)
  if (existingCustomer && (existingCustomer.name || existingCustomer.company_name)) {
    const cust = {
      name: existingCustomer.name || existingCustomer.company_name || 'Valued Customer',
      phone: existingCustomer.phone || formattedPhone,
      company: existingCustomer.company_name || existingCustomer.company || '',
      isRegistered: true,
    };
    if (normPhone) customerRegistry[normPhone] = cust;
    return cust;
  }

  // 2. Check local customer registry
  if (normPhone && customerRegistry[normPhone]) {
    const reg = customerRegistry[normPhone];
    return {
      name: reg.name || 'Valued Customer',
      phone: reg.phone || formattedPhone,
      company: reg.company || '',
      isRegistered: true,
    };
  }

  // 3. Extract profile name provided by WhatsApp in webhook contacts
  const contactProfileName = waMessagePayload.contacts?.[0]?.profile?.name;

  return {
    name: contactProfileName || 'Valued Customer',
    phone: formattedPhone,
    company: '',
    isRegistered: false,
  };
}

/**
 * Register or update customer records in local memory
 * @param {Array|object} data - Array of customer objects or key-value object
 */
function registerCustomers(data) {
  if (Array.isArray(data)) {
    for (const item of data) {
      const key = normalizePhone(item.phone || item.mobile);
      if (key) {
        customerRegistry[key] = {
          name: item.name || item.customerName || 'Customer',
          phone: item.phone || item.mobile || key,
          company: item.company || item.company_name || '',
          isRegistered: true,
        };
      }
    }
  } else if (typeof data === 'object' && data !== null) {
    for (const [key, val] of Object.entries(data)) {
      const norm = normalizePhone(key);
      if (norm) {
        customerRegistry[norm] =
          typeof val === 'string'
            ? { name: val, phone: key, isRegistered: true }
            : { ...val, isRegistered: true };
      }
    }
  }
}

/**
 * Fetch and cache customer from Supabase if available
 */
async function fetchCustomerFromDb(phone, supabaseClient) {
  if (!supabaseClient || !phone) return null;
  try {
    const norm = normalizePhone(phone);
    const { data, error } = await supabaseClient
      .from('customers')
      .select('*')
      .ilike('phone', `%${norm}%`)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      customerRegistry[norm] = {
        name: data.name,
        phone: data.phone,
        company: data.company_name || '',
        isRegistered: true,
      };
      return customerRegistry[norm];
    }
  } catch {
    // Graceful fallback
  }
  return null;
}

module.exports = {
  extractCustomerInfo,
  fetchCustomerFromDb,
  registerCustomers,
  customerRegistry,
  normalizePhone,
};
