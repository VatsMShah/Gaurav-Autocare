const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

class GroupBridge {
  constructor() {
    this.sock = null;
    this.qrRaw = null;
    this.qrDataUrl = null;
    this.connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
    this.connectedUser = null;
    this.authDir = path.join(process.cwd(), 'auth_baileys');
    this.reconnectTimeout = null;
    this.isInitializing = false;
  }

  async init() {
    if (this.isInitializing) return;
    this.isInitializing = true;

    try {
      if (!fs.existsSync(this.authDir)) {
        fs.mkdirSync(this.authDir, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

      this.connectionStatus = 'connecting';
      logger.info('🔄 Initializing WhatsApp Group Bridge (Baileys)...');

      this.sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        browser: ['Gaurav Autocare Bot', 'Chrome', '1.0.0'],
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrRaw = qr;
          try {
            this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
            logger.info('📱 [Group Bridge] New QR Code generated! Open /qr in your browser to scan.');
          } catch (qrErr) {
            logger.warn('Failed to generate QR data URL:', qrErr.message);
          }
        }

        if (connection === 'close') {
          this.connectionStatus = 'disconnected';
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;

          logger.warn(`⚠️ [Group Bridge] Connection closed (code: ${statusCode}). Reconnecting: ${!isLoggedOut}`);

          if (isLoggedOut) {
            logger.info('🗑️ [Group Bridge] Device logged out. Resetting auth credentials...');
            try {
              fs.rmSync(this.authDir, { recursive: true, force: true });
            } catch (rmErr) {
              logger.warn('Failed to delete auth directory:', rmErr.message);
            }
          }

          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = setTimeout(() => {
            this.isInitializing = false;
            this.init().catch((err) => logger.error('Reconnection failed:', err));
          }, 3000);
        } else if (connection === 'open') {
          this.connectionStatus = 'connected';
          this.connectedUser = this.sock.user?.id || 'Connected';
          this.qrRaw = null;
          this.qrDataUrl = null;
          this.isInitializing = false;
          logger.info(`✅ [Group Bridge] WhatsApp Connected! Logged in as: ${this.connectedUser}`);
        }
      });
    } catch (err) {
      this.isInitializing = false;
      this.connectionStatus = 'disconnected';
      logger.error('Failed to initialize WhatsApp Group Bridge:', err);
    }
  }

  getStatus() {
    return {
      status: this.connectionStatus,
      isConnected: this.connectionStatus === 'connected',
      connectedUser: this.connectedUser,
      hasQr: Boolean(this.qrDataUrl),
      qrDataUrl: this.qrDataUrl,
    };
  }

  /**
   * Log out current session and reset auth state to allow scanning a new phone.
   */
  async logout() {
    logger.info('🔌 [Group Bridge] Logging out current WhatsApp session...');
    try {
      if (this.sock) {
        await this.sock.logout().catch(() => {});
        this.sock.end(undefined);
      }
    } catch (err) {
      logger.debug('Logout error: ' + err.message);
    }

    try {
      fs.rmSync(this.authDir, { recursive: true, force: true });
    } catch (rmErr) {
      logger.warn('Failed to delete auth dir on logout: ' + rmErr.message);
    }

    this.sock = null;
    this.connectedUser = null;
    this.connectionStatus = 'disconnected';
    this.qrRaw = null;
    this.qrDataUrl = null;
    this.isInitializing = false;
    clearTimeout(this.reconnectTimeout);

    // Immediately trigger init to generate new QR
    await this.init();
  }

  /**
   * Fetch all groups the connected WhatsApp number is a member of.
   */
  async getGroups() {
    if (!this.sock || this.connectionStatus !== 'connected') {
      return [];
    }

    try {
      const groups = await this.sock.groupFetchAllParticipating();
      return Object.values(groups).map((g) => ({
        id: g.id,
        subject: g.subject,
        creation: g.creation,
        participantsCount: g.participants?.length || 0,
      }));
    } catch (err) {
      logger.error('Failed to fetch WhatsApp groups:', err);
      return [];
    }
  }

  /**
   * Send a text message to a specific WhatsApp Group.
   * @param {string} groupId - e.g. "120363048293847291@g.us"
   * @param {string} text - Message text
   */
  async sendGroupMessage(groupId, text) {
    if (!this.sock || this.connectionStatus !== 'connected') {
      throw new Error('WhatsApp Group Bridge is not connected');
    }

    let targetJid = groupId.trim();
    if (!targetJid.includes('@')) {
      targetJid = `${targetJid}@g.us`;
    }

    return await this.sock.sendMessage(targetJid, { text });
  }

  /**
   * Broadcast an order confirmation ticket to assigned fleet groups.
   * @param {string} ticketMessage - The formatted ticket string
   * @param {string[]} [targetGroupIds] - Optional list of group IDs
   */
  async broadcastOrderTicket(ticketMessage, targetGroupIds = []) {
    if (this.connectionStatus !== 'connected') {
      logger.warn('[Group Bridge] Cannot broadcast ticket: Bridge is not connected yet.');
      return { success: false, reason: 'bridge_not_connected' };
    }

    // Merge provided target groups with any default notification group in .env
    const defaultGroup = process.env.DEFAULT_NOTIFICATION_GROUP_ID;
    const allGroups = new Set([
      ...(Array.isArray(targetGroupIds) ? targetGroupIds : []),
      ...(defaultGroup ? defaultGroup.split(',').map((id) => id.trim()) : []),
    ]);

    const activeGroupIds = Array.from(allGroups).filter(Boolean);

    if (activeGroupIds.length === 0) {
      logger.info('[Group Bridge] No fleet groups configured for this order. Skipping group broadcast.');
      return { success: true, count: 0 };
    }

    logger.info(`📢 [Group Bridge] Broadcasting order ticket to ${activeGroupIds.length} group(s)...`);

    const results = await Promise.allSettled(
      activeGroupIds.map(async (jid) => {
        await this.sendGroupMessage(jid, ticketMessage);
        return jid;
      })
    );

    const successful = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    const failed = results.filter((r) => r.status === 'rejected').map((r) => r.reason?.message);

    logger.info(`✅ [Group Bridge] Dispatched to ${successful.length} groups. Failed: ${failed.length}`);

    return {
      success: successful.length > 0,
      successful,
      failed,
    };
  }
}

module.exports = new GroupBridge();

