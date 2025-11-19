const crypto = require('crypto');

/**
 * Shared encryption/decryption helpers for eBay OAuth tokens and credentials
 *
 * Used across:
 * - ebay-oauth.js (OAuth flow)
 * - ebay-oauth-callback.js (callback handling)
 * - save-ebay-credentials.js (credential storage)
 * - user-ebay-client.js (token refresh)
 * - enhanced-ebay-client.js (token refresh)
 */

// Encryption key management
const getEncryptionKey = () => {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required. ' +
      'Generate with: openssl rand -hex 32'
    );
  }

  const key = process.env.ENCRYPTION_KEY;
  // If it's a hex string, convert it properly
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, 'hex');
  }

  // Otherwise, hash it to get consistent 32 bytes
  return crypto.createHash('sha256').update(key).digest();
};

const ENCRYPTION_KEY = getEncryptionKey();
const IV_LENGTH = 16;

/**
 * Encrypt sensitive text using AES-256-CBC
 * @param {string} text - Text to encrypt
 * @returns {string} Encrypted text in format "iv:encryptedData"
 */
function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

/**
 * Decrypt encrypted text using AES-256-CBC
 * @param {string} text - Encrypted text in format "iv:encryptedData"
 * @returns {string} Decrypted text
 */
function decrypt(text) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

module.exports = {
  encrypt,
  decrypt,
  getEncryptionKey
};
