const dns = require('dns');
// Ensure IPv4 first to avoid macOS IPv6 connection timeouts on Google/Meta APIs
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const express = require('express');
const config = require('./config');
const logger = require('./utils/logger');
const { handleVerification, isValidSignature } = require('./webhook/verify');
const { handleIncomingMessage } = require('./webhook/handler');
const groupBridge = require('./services/groupBridge');

const app = express();

// Enable CORS for CRM Dashboard & local clients
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Capture the raw request body bytes (needed for HMAC signature validation)
// while still giving us the parsed JSON body for normal use.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.get('/health', (_req, res) => res.status(200).send('ok'));

// Privacy Policy page
app.get('/privacy', (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Gaurav Autocare - Privacy Policy</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6;">
      <h1>Privacy Policy - Gaurav Autocare WhatsApp Bot</h1>
      <p><strong>Effective Date:</strong> October 28, 2026</p>
      <p>Gaurav Autocare operates an automated fuel truck ordering system via WhatsApp. We collect only necessary details (user name, phone number, vehicle registration number, and fuel requirements) to process and deliver your fuel orders.</p>
      <h2>Data Usage</h2>
      <p>Your information is used solely to generate order confirmation tickets and dispatch fuel trucks. We do not sell or share personal data with third parties.</p>
      <h2>User Data Deletion</h2>
      <p>To request permanent deletion of your data, send an email to <a href="mailto:admin@gauravauto.com">admin@gauravauto.com</a> with your WhatsApp phone number.</p>
    </body>
    </html>
  `);
});

// Terms of Service page
app.get('/terms', (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Gaurav Autocare - Terms of Service</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6;">
      <h1>Terms of Service - Gaurav Autocare</h1>
      <p><strong>Effective Date:</strong> October 28, 2026</p>
      <p>By using the Gaurav Autocare WhatsApp ordering bot, you agree to submit accurate order details for vehicle fuel delivery. Fuel rates are based on published daily pump prices.</p>
      <h2>Contact</h2>
      <p>For questions or cancellations, contact <a href="mailto:admin@gauravauto.com">admin@gauravauto.com</a>.</p>
    </body>
    </html>
  `);
});

// Data Deletion Instructions page
app.get('/data-deletion', (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Data Deletion - Gaurav Autocare</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6;">
      <h1>User Data Deletion Instructions</h1>
      <p>To delete your WhatsApp conversation history and profile records from Gaurav Autocare, email <a href="mailto:admin@gauravauto.com">admin@gauravauto.com</a> with your registered phone number. All records will be removed within 48 hours.</p>
    </body>
    </html>
  `);
});

// WhatsApp Group Bridge - QR Code Page for Linking Device
app.get('/qr', (_req, res) => {
  const status = groupBridge.getStatus();

  if (status.isConnected) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Gaurav Autocare - WhatsApp Bridge Active</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
          .card { background: #1e293b; padding: 2.5rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.3); text-align: center; max-width: 460px; width: 90%; }
          .badge { display: inline-block; padding: 0.35rem 0.85rem; border-radius: 9999px; background: #10b981; color: white; font-weight: bold; font-size: 0.85rem; margin-bottom: 1rem; }
          h1 { margin: 0 0 0.5rem; font-size: 1.5rem; }
          p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }
          .info-box { background: #0f172a; border-radius: 0.5rem; padding: 0.85rem; margin: 1.25rem 0; font-family: monospace; color: #38bdf8; font-size: 0.9rem; word-break: break-all; }
          .btn { display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #2563eb; color: white; text-decoration: none; border-radius: 0.5rem; font-weight: 500; font-size: 0.95rem; }
          .btn:hover { background: #1d4ed8; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">● CONNECTED</div>
          <h1>WhatsApp Group Bridge is Active</h1>
          <p>This phone number is now linked to post fuel order confirmations to your client WhatsApp groups for <strong>₹0.00</strong>!</p>
          <div class="info-box">Logged in ID: ${status.connectedUser || 'Connected'}</div>
          <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
            <a href="/groups" class="btn">View All Joined Groups</a>
            <a href="/logout" class="btn" style="background: #dc2626;" onclick="return confirm('Disconnect this number and scan a new QR code?')">Disconnect & Scan New Number</a>
          </div>
        </div>
      </body>
      </html>
    `);
  }

  if (!status.hasQr) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Gaurav Autocare - Initializing Bridge...</title>
        <meta http-equiv="refresh" content="3">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; text-align: center; }
        </style>
      </head>
      <body>
        <div>
          <h2>🔄 Initializing WhatsApp Bridge...</h2>
          <p style="color: #94a3b8;">Generating QR code. Auto-refreshing in 3 seconds...</p>
        </div>
      </body>
      </html>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Gaurav Autocare - Link WhatsApp Bridge</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta http-equiv="refresh" content="20">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
        .card { background: #1e293b; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.3); text-align: center; max-width: 440px; width: 90%; }
        h1 { margin: 0 0 0.5rem; font-size: 1.4rem; }
        p { color: #94a3b8; font-size: 0.9rem; line-height: 1.5; margin-bottom: 1.25rem; }
        .qr-box { background: white; padding: 1rem; border-radius: 0.75rem; display: inline-block; margin-bottom: 1rem; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
        .qr-box img { display: block; max-width: 250px; height: auto; }
        ol { text-align: left; color: #cbd5e1; font-size: 0.85rem; padding-left: 1.25rem; margin: 1rem 0; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Link WhatsApp Group Bridge</h1>
        <p>Scan with WhatsApp to dispatch fuel order tickets directly to client WhatsApp groups for ₹0.</p>
        <div class="qr-box">
          <img src="${status.qrDataUrl}" alt="WhatsApp QR Code" />
        </div>
        <ol>
          <li>Open <strong>WhatsApp</strong> on your phone</li>
          <li>Tap <strong>Settings / ⋮ Menu</strong> &gt; <strong>Linked Devices</strong></li>
          <li>Tap <strong>Link a Device</strong> and point your camera at this QR</li>
        </ol>
        <small style="color: #64748b;">Page refreshes every 20 seconds</small>
      </div>
    </body>
    </html>
  `);
});

// Endpoint to view all groups the bridge number is currently added to
app.get('/groups', async (_req, res) => {
  try {
    const groups = await groupBridge.getGroups();
    res.json({
      success: true,
      count: groups.length,
      groups,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bridge status endpoint
app.get('/bridge-status', (_req, res) => {
  res.json(groupBridge.getStatus());
});

// Logout endpoint to clear session and re-generate QR code
app.get('/logout', async (_req, res) => {
  try {
    await groupBridge.logout();
    res.redirect('/qr');
  } catch (err) {
    res.status(500).send('Logout failed: ' + err.message);
  }
});

// Manual test endpoint to trigger a test group notification
app.post('/test-group-send', async (req, res) => {
  const { groupId, message } = req.body || {};
  if (!groupId || !message) {
    return res.status(400).json({ error: 'Please provide groupId and message in JSON body' });
  }
  try {
    await groupBridge.sendGroupMessage(groupId, message);
    res.json({ success: true, message: `Dispatched to group ${groupId}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Meta's webhook verification handshake.
app.get('/webhook', handleVerification);

// Meta's actual webhook events (incoming messages, delivery statuses, etc.)
app.post('/webhook', async (req, res) => {
  const signature = req.header('x-hub-signature-256');

  logger.info('📥 Webhook POST received from Meta', {
    hasSignature: Boolean(signature),
    hasBody: Boolean(req.body),
    entriesCount: req.body?.entry?.length || 0,
  });

  const valid = isValidSignature(req.rawBody, signature);
  if (!valid) {
    if (process.env.NODE_ENV === 'production') {
      logger.warn('Rejected webhook POST in production — invalid signature');
      return res.sendStatus(401);
    }
    logger.warn('⚠️ Webhook signature mismatch — allowing in development mode for live testing');
  }

  // Respond to Meta immediately — Meta expects a fast 200 and will retry
  // (and eventually disable the webhook) if you take too long or throw.
  res.sendStatus(200);

  try {
    const entries = req.body?.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        logger.info('Processing webhook change event', {
          field: change.field,
          hasValue: Boolean(change.value),
        });
        await handleIncomingMessage(change.value);
      }
    }
  } catch (err) {
    logger.error('Error while processing webhook payload', err);
  }
});

app.listen(config.port, () => {
  logger.info(`Gaurav Autocare WhatsApp bot listening on port ${config.port}`);
  logger.info(`Webhook URL (local): http://localhost:${config.port}/webhook`);
  logger.info(`WhatsApp Group Bridge QR page: http://localhost:${config.port}/qr`);

  // Initialize the WhatsApp Web Group Bridge
  groupBridge.init().catch((err) => {
    logger.error('Failed to initialize Group Bridge on startup:', err);
  });
});
