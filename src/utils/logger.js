class Logger {
  static info(message, meta = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ℹ️  INFO: ${message}`, Object.keys(meta).length ? JSON.stringify(meta) : '');
  }

  static warn(message, meta = {}) {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] ⚠️  WARN: ${message}`, Object.keys(meta).length ? JSON.stringify(meta) : '');
  }

  static error(message, error = {}) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ ERROR: ${message}`, error.stack || error.message || error);
  }

  static http(message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 🌐 HTTP: ${message.trim()}`);
  }
}

module.exports = Logger;
