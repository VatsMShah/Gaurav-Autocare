const express = require('express');
const config = require('./config');
const logger = require('./utils/logger');
const { handleVerification, isValidSignature } = require('./webhook/verify');
const { handleIncomingMessage } = require('./webhook/handler');

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
});
