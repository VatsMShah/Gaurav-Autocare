require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    // We don't throw here at import-time for every var (so `npm start` gives
    // one clean error instead of crashing on the first missing var during
    // early local setup) — but we do warn loudly.
    console.warn(`⚠️  Missing environment variable: ${name}`);
  }
  return value;
}

module.exports = {
  port: process.env.PORT || 3000,

  whatsapp: {
    verifyToken: required('WHATSAPP_VERIFY_TOKEN'),
    appSecret: required('WHATSAPP_APP_SECRET'),
    accessToken: required('WHATSAPP_ACCESS_TOKEN'),
    phoneNumberId: required('WHATSAPP_PHONE_NUMBER_ID'),
    graphApiVersion: process.env.WHATSAPP_GRAPH_API_VERSION || 'v20.0',
    flowId: process.env.WHATSAPP_FLOW_ID || '',
  },
  supabase: {
    url: required('SUPABASE_URL'),
    key: required('SUPABASE_KEY'),
  },
  google: {
    sheetId: process.env.GOOGLE_SHEET_ID || '1IdG2oaGPdGDzY4H5JwPa0eeHKdXzivMNwkhBslJ5ZUI',
    webhookUrl: process.env.GOOGLE_SHEET_WEBHOOK_URL || '',
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    privateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    tabs: {
      master: process.env.GOOGLE_TAB_MASTER || 'users_master',
      book: process.env.GOOGLE_TAB_BOOK || 'BookVehicle',
      provider: process.env.GOOGLE_TAB_PROVIDER || 'ProvideVehicle',
      support: process.env.GOOGLE_TAB_SUPPORT || 'Support',
    },
    isConfigured: Boolean(
      process.env.GOOGLE_SHEET_WEBHOOK_URL ||
      (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
    ),
  },
};
