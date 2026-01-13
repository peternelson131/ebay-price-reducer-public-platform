/**
 * Encryption utilities for secure credential storage
 * Uses AES-256-CBC encryption with the ENCRYPTION_KEY env var
 * 
 * NOTE: We read ENCRYPTION_KEY at execution time (not module load time)
 * to ensure it's available in serverless function cold starts.
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Get the encryption key (read at execution time, not module load)
 */
function getEncryptionKey() {
  return process.env.ENCRYPTION_KEY || '';
}

/**
 * Encrypt a string value
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted string in format "iv:encryptedData" (hex encoded)
 */
function encrypt(text) {
  const encryptionKey = getEncryptionKey();
  
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable not set');
  }
  
  if (!text) {
    return null;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    ALGORITHM, 
    Buffer.from(encryptionKey, 'hex'), 
    iv
  );
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Return as iv:encryptedData
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt an encrypted string
 * @param {string} encryptedText - Encrypted string in format "iv:encryptedData"
 * @returns {string|null} - Decrypted plain text, or null if decryption fails
 */
function decrypt(encryptedText) {
  const encryptionKey = getEncryptionKey();
  
  if (!encryptionKey || !encryptedText) {
    return null;
  }

  try {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encrypted = Buffer.from(parts.join(':'), 'hex');
    
    const decipher = crypto.createDecipheriv(
      ALGORITHM, 
      Buffer.from(encryptionKey, 'hex'), 
      iv
    );
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Decryption error:', error.message);
    return null;
  }
}

/**
 * Check if encryption is properly configured
 * @returns {boolean}
 */
function isEncryptionConfigured() {
  const encryptionKey = getEncryptionKey();
  return !!encryptionKey && encryptionKey.length === 64; // 32 bytes = 64 hex chars
}

module.exports = {
  encrypt,
  decrypt,
  isEncryptionConfigured
};
