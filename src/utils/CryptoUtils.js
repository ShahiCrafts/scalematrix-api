const crypto = require('crypto');
const env = require('../config/env');

class CryptoUtils {
  static getEncryptionKey() {
    return crypto.createHash('sha256').update(env.TOKEN_ENCRYPTION_KEY).digest();
  }

  /**
   * Encrypt sensitive string data (e.g. access tokens) using AES-256-GCM
   */
  static encrypt(text) {
    if (!text) return '';
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${tag}:${encrypted}`;
  }

  /**
   * Decrypt AES-256-GCM encrypted text
   */
  static decrypt(encryptedText) {
    if (!encryptedText) return '';
    const parts = encryptedText.split(':');
    if (parts.length !== 3) return encryptedText; // return as-is if unencrypted fallback
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Generate HMAC SHA256 appsecret_proof for Meta Graph API calls
   */
  static generateAppSecretProof(accessToken, appSecret) {
    if (!accessToken || !appSecret) return '';
    return crypto
      .createHmac('sha256', appSecret)
      .update(accessToken)
      .digest('hex');
  }

  /**
   * Verify Meta Webhook X-Hub-Signature-256
   */
  static verifyWebhookSignature(rawBody, signatureHeader, appSecret) {
    if (!rawBody || !signatureHeader || !appSecret) return false;
    const parts = signatureHeader.split('=');
    if (parts.length !== 2 || parts[0] !== 'sha256') return false;
    const expectedSignature = parts[1];
    const actualSignature = crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(actualSignature));
  }
}

module.exports = CryptoUtils;
