/**
 * Customer Data Service for Gaurav Autocare
 * Handles lookup and extraction of customer details (name and phone).
 * Ready to be connected to further customer records, sheets, or APIs.
 */

// In-memory customer directory. Add/extend records as needed.
const customerRegistry = {
  // Example entries:
  // '9876543210': { name: 'Rajesh Transport', phone: '+91 98765 43210', company: 'Rajesh Fleet' },
};

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
 * @returns {object} { name, phone, company, isRegistered }
 */
function extractCustomerInfo(phone, waMessagePayload = {}) {
  const normPhone = normalizePhone(phone);

  // 1. Check local customer registry
  if (normPhone && customerRegistry[normPhone]) {
    const reg = customerRegistry[normPhone];
    return {
      name: reg.name || 'Valued Customer',
      phone: reg.phone || (phone.startsWith('+') ? phone : `+${phone}`),
      company: reg.company || '',
      isRegistered: true,
    };
  }

  // 2. Extract profile name provided by WhatsApp in webhook contacts
  const contactProfileName = waMessagePayload.contacts?.[0]?.profile?.name;

  return {
    name: contactProfileName || 'Valued Customer',
    phone: phone ? (phone.startsWith('+') ? phone : `+${phone}`) : 'N/A',
    company: '',
    isRegistered: false,
  };
}

/**
 * Register or update customer records
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
          company: item.company || '',
        };
      }
    }
  } else if (typeof data === 'object' && data !== null) {
    for (const [key, val] of Object.entries(data)) {
      const norm = normalizePhone(key);
      if (norm) {
        customerRegistry[norm] = typeof val === 'string' ? { name: val, phone: key } : val;
      }
    }
  }
}

/**
 * Fetch and cache customer from Supabase if available
 */
async function fetchCustomerFromDb(phone, supabaseClient) {
  if (!supabaseClient) return null;
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
      };
      return customerRegistry[norm];
    }
  } catch {
    // Graceful fallback to local registry
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
