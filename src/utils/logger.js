// Minimal structured logger. Swap this out for pino/winston later if needed —
// every call site just uses logger.info/warn/error so the swap is a 1-file change.

function timestamp() {
  return new Date().toISOString();
}

function log(level, message, meta) {
  const line = `[${timestamp()}] [${level.toUpperCase()}] ${message}`;
  if (meta !== undefined) {
    console[level === 'error' ? 'error' : (level === 'warn' ? 'warn' : 'log')](line, meta);
  } else {
    console[level === 'error' ? 'error' : (level === 'warn' ? 'warn' : 'log')](line);
  }
}

module.exports = {
  debug: (msg, meta) => {
    // Only log debug messages if DEBUG=true or verbose mode
    if (process.env.DEBUG === 'true') {
      log('debug', msg, meta);
    }
  },
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};
