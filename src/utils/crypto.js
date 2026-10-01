const crypto = require('crypto');

/**
 * Generate cryptographically secure 6-digit numeric OTP
 * @returns {string} 6-digit string (e.g. "482910")
 */
const generateNumericOTP = () => {
  const number = crypto.randomInt(100000, 999999);
  return number.toString();
};

/**
 * Compute SHA-256 hash of a string
 * @param {string} text 
 * @returns {string} Hex hash string
 */
const hashString = (text) => {
  return crypto.createHash('sha256').update(text).digest('hex');
};

module.exports = {
  generateNumericOTP,
  hashString,
};
