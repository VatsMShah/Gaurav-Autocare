const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Handles Meta's webhook verification handshake.
 * GET /webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 * Meta calls this once when you save the webhook URL in the App Dashboard.
 */
function handleVerification(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    logger.info('Webhook verification succeeded');
    return res.status(200).send(challenge);
  }

  logger.warn('Webhook verification failed', { mode, tokenProvided: Boolean(token) });
  return res.sendStatus(403);
}

/**
 * Validates the X-Hub-Signature-256 header Meta sends on every webhook POST.
 * This proves the request actually came from Meta and not a spoofed source.
 *
 * IMPORTANT: this must run against the raw request body bytes, not the
 * parsed JSON — that's why index.js mounts a raw-body capturing middleware
 * before the JSON parser (see index.js `verify` option on express.json()).
 */
function isValidSignature(rawBody, signatureHeader) {
  if (!signatureHeader) {
    logger.warn('Webhook POST missing x-hub-signature-256 header — allowing in dev/testing mode');
    return true;
  }
  if (!config.whatsapp.appSecret || config.whatsapp.appSecret === 'your_meta_app_secret') {
    logger.warn('WHATSAPP_APP_SECRET is not configured — bypassing signature check in dev mode');
    return true;
  }

  try {
    const expectedHash = crypto
      .createHmac('sha256', config.whatsapp.appSecret)
      .update(rawBody || '')
      .digest('hex');

    const expectedSignature = `sha256=${expectedHash}`;

    const a = Buffer.from(expectedSignature);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length) {
      logger.warn('Signature length mismatch', { expectedLength: a.length, actualLength: b.length });
      return false;
    }

    const matches = crypto.timingSafeEqual(a, b);
    if (!matches) {
      logger.warn('Signature HMAC mismatch with WHATSAPP_APP_SECRET');
    }
    return matches;
  } catch (err) {
    logger.error('Error during signature validation:', err);
    return false;
  }
}

module.exports = { handleVerification, isValidSignature };
