const { createClient } = require('@supabase/supabase-js');
const { decrypt } = require('./ebay-oauth-helpers');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Custom error class for token operations
 */
class TokenError extends Error {
  constructor(code, message, action = null) {
    super(message);
    this.name = 'TokenError';
    this.code = code;
    this.action = action;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      action: this.action
    };
  }
}

/**
 * Unified eBay Token Management Service
 * Single source of truth for all eBay token operations
 */
class EbayTokenService {
  constructor(userId) {
    this.userId = userId;
    // In-memory cache for access tokens
    // Note: This is per-instance, so works for serverless but not across invocations
    this.cache = new Map();
  }

  // ============================================================================
  // CORE METHODS (Public API)
  // ============================================================================

  /**
   * Get a valid eBay access token (refresh if needed)
   * @returns {Promise<string>} Valid access token
   */
  async getAccessToken() {
    // 1. Check cache for valid access token
    const cached = this.cache.get(this.userId);
    if (cached && cached.expiresAt > Date.now() + 60000) { // 1 min buffer
      console.log('✓ Using cached access token', { userId: this.userId });
      return cached.accessToken;
    }

    // 2. Get credentials from database
    const credentials = await this.getCredentials();

    // 3. Validate credentials
    this.validateCredentials(credentials);

    // 4. Exchange refresh token for access token
    const tokenData = await this.exchangeRefreshToken(credentials);

    // 5. Cache access token
    this.cache.set(this.userId, {
      accessToken: tokenData.access_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000)
    });

    return tokenData.access_token;
  }

  /**
   * Get user's eBay credentials (app credentials + refresh token)
   * @returns {Promise<Object>} { appId, certId, refreshToken, ebayUserId }
   */
  async getCredentials() {
    // Single RPC call to get all credentials
    const { data, error } = await supabase.rpc('get_user_ebay_credentials_complete', {
      user_uuid: this.userId
    });

    if (error) {
      throw new TokenError('CREDENTIALS_FETCH_FAILED', `Failed to fetch credentials: ${error.message}`);
    }

    if (!data || data.length === 0) {
      throw new TokenError('USER_NOT_FOUND', 'User not found in database');
    }

    const creds = data[0];

    // Check if user has configured app credentials
    if (!creds.ebay_app_id || !creds.ebay_cert_id_encrypted) {
      throw new TokenError('CREDENTIALS_NOT_CONFIGURED',
        'eBay App ID and Cert ID not configured. Please add credentials in Admin Settings.',
        'GO_TO_ADMIN_SETTINGS');
    }

    // Check if user has connected eBay account (refresh token)
    if (!creds.ebay_refresh_token) {
      throw new TokenError('NOT_CONNECTED',
        'eBay account not connected. Please complete OAuth flow.',
        'CONNECT_EBAY');
    }

    return {
      appId: creds.ebay_app_id,
      certId: this.decryptCertId(creds.ebay_cert_id_encrypted),
      refreshToken: this.decryptRefreshToken(creds.ebay_refresh_token),
      ebayUserId: creds.ebay_user_id,
      connectionStatus: creds.ebay_connection_status,
      connectedAt: creds.ebay_connected_at
    };
  }

  /**
   * Get connection status for user
   * @returns {Promise<Object>} { connected, hasCredentials, canSync, issues }
   */
  async getConnectionStatus() {
    try {
      const credentials = await this.getCredentials();

      // Try to get access token to verify connectivity
      try {
        await this.getAccessToken();
        return {
          connected: true,
          hasCredentials: true,
          canSync: true,
          ebayUserId: credentials.ebayUserId,
          connectedAt: credentials.connectedAt,
          issues: []
        };
      } catch (error) {
        // Connected but token refresh failed
        return {
          connected: false,
          hasCredentials: true,
          canSync: false,
          issues: [{
            code: error.code,
            message: error.message,
            action: error.action
          }]
        };
      }
    } catch (error) {
      if (error.code === 'CREDENTIALS_NOT_CONFIGURED') {
        return {
          connected: false,
          hasCredentials: false,
          canSync: false,
          ebayUserId: null,
          connectedAt: null,
          issues: [{
            code: 'CREDENTIALS_NOT_CONFIGURED',
            message: 'eBay App ID and Cert ID not configured',
            action: 'GO_TO_ADMIN_SETTINGS'
          }]
        };
      } else if (error.code === 'NOT_CONNECTED') {
        return {
          connected: false,
          hasCredentials: true,
          canSync: false,
          ebayUserId: null,
          connectedAt: null,
          issues: [{
            code: 'NOT_CONNECTED',
            message: 'eBay account not connected via OAuth',
            action: 'CONNECT_EBAY'
          }]
        };
      } else {
        return {
          connected: false,
          hasCredentials: false,
          canSync: false,
          ebayUserId: null,
          connectedAt: null,
          issues: [{
            code: 'UNKNOWN_ERROR',
            message: error.message,
            action: 'CONTACT_SUPPORT'
          }]
        };
      }
    }
  }

  /**
   * Disconnect eBay account (clear refresh token)
   * @returns {Promise<void>}
   */
  async disconnect() {
    const { error } = await supabase
      .from('users')
      .update({
        ebay_refresh_token: null,
        ebay_user_id: null,
        ebay_connection_status: 'disconnected',
        ebay_connected_at: null
      })
      .eq('id', this.userId);

    if (error) {
      throw new TokenError('DISCONNECT_FAILED', `Failed to disconnect: ${error.message}`);
    }

    // Clear cache
    this.cache.delete(this.userId);
  }

  // ============================================================================
  // INTERNAL METHODS (Private)
  // ============================================================================

  /**
   * Validate credentials format and content
   */
  validateCredentials(credentials) {
    // Validate App ID format
    if (!credentials.appId || credentials.appId.length < 10) {
      throw new TokenError('INVALID_APP_ID',
        'Invalid App ID format. Expected format: username-appname-env-random',
        'DISCONNECT_AND_RECONNECT');
    }

    // Validate Cert ID format (should be hex string after decryption)
    if (!credentials.certId || credentials.certId.length < 32) {
      throw new TokenError('INVALID_CERT_ID',
        'Invalid Cert ID format. Expected 32+ character hex string',
        'DISCONNECT_AND_RECONNECT');
    }

    // Validate refresh token format
    if (!credentials.refreshToken || credentials.refreshToken.length < 50) {
      throw new TokenError('INVALID_REFRESH_TOKEN',
        'Invalid refresh token format',
        'DISCONNECT_AND_RECONNECT');
    }
  }

  /**
   * Decrypt Cert ID (with validation)
   */
  decryptCertId(encryptedCertId) {
    // Null check
    if (!encryptedCertId) {
      throw new TokenError('CREDENTIALS_NOT_CONFIGURED',
        'Cert ID not configured',
        'GO_TO_ADMIN_SETTINGS');
    }

    // Check for migration marker
    if (encryptedCertId.startsWith('NEEDS_MIGRATION:')) {
      throw new TokenError('NEEDS_MIGRATION',
        'Credentials need migration. Please disconnect and reconnect your eBay account.',
        'DISCONNECT_AND_RECONNECT');
    }

    // Validate encryption format (hex:hex)
    if (!/^[0-9a-f]+:[0-9a-f]+$/i.test(encryptedCertId)) {
      throw new TokenError('INVALID_ENCRYPTION_FORMAT',
        `Invalid encryption format. Expected hex:hex, got: ${encryptedCertId.substring(0, 20)}...`,
        'DISCONNECT_AND_RECONNECT');
    }

    // Decrypt
    try {
      return decrypt(encryptedCertId);
    } catch (error) {
      throw new TokenError('DECRYPTION_FAILED',
        `Failed to decrypt Cert ID: ${error.message}`,
        'DISCONNECT_AND_RECONNECT');
    }
  }

  /**
   * Decrypt Refresh Token (with validation)
   */
  decryptRefreshToken(encryptedToken) {
    // Null check
    if (!encryptedToken) {
      throw new TokenError('NOT_CONNECTED',
        'Refresh token not found. Please connect your eBay account.',
        'CONNECT_EBAY');
    }

    // Check for migration marker
    if (encryptedToken.startsWith('NEEDS_MIGRATION:')) {
      throw new TokenError('NEEDS_MIGRATION',
        'Credentials need migration. Please disconnect and reconnect your eBay account.',
        'DISCONNECT_AND_RECONNECT');
    }

    // Validate encryption format (hex:hex)
    if (!/^[0-9a-f]+:[0-9a-f]+$/i.test(encryptedToken)) {
      throw new TokenError('INVALID_ENCRYPTION_FORMAT',
        `Invalid refresh token encryption format. Expected hex:hex, got: ${encryptedToken.substring(0, 20)}...`,
        'DISCONNECT_AND_RECONNECT');
    }

    // Decrypt
    try {
      return decrypt(encryptedToken);
    } catch (error) {
      throw new TokenError('DECRYPTION_FAILED',
        `Failed to decrypt refresh token: ${error.message}`,
        'DISCONNECT_AND_RECONNECT');
    }
  }

  /**
   * Exchange refresh token for access token
   */
  async exchangeRefreshToken(credentials) {
    const credentialsBase64 = Buffer.from(`${credentials.appId}:${credentials.certId}`).toString('base64');

    console.log('🔄 Exchanging refresh token for access token', {
      userId: this.userId,
      appIdPreview: credentials.appId.substring(0, 10) + '...',
      certIdLength: credentials.certId.length
    });

    const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentialsBase64}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const ebayError = data.error_description || data.error || 'Unknown eBay error';

      console.error('❌ eBay token refresh rejected:', {
        status: response.status,
        error: ebayError,
        userId: this.userId
      });

      // Determine error type and action
      if (response.status === 401) {
        throw new TokenError('EBAY_AUTH_FAILED',
          `eBay rejected credentials: ${ebayError}. Your credentials may be invalid or expired.`,
          'DISCONNECT_AND_RECONNECT');
      } else if (response.status === 400) {
        throw new TokenError('EBAY_INVALID_REQUEST',
          `eBay rejected request: ${ebayError}`,
          'DISCONNECT_AND_RECONNECT');
      } else {
        throw new TokenError('EBAY_API_ERROR',
          `eBay API error (${response.status}): ${ebayError}`,
          'TRY_AGAIN_LATER');
      }
    }

    console.log('✅ Access token obtained successfully', {
      expiresIn: data.expires_in,
      userId: this.userId
    });

    return data;
  }

  /**
   * Attempt automatic error recovery
   * @param {TokenError} error - The error to recover from
   * @returns {Promise<boolean>} - True if recovery successful
   */
  async attemptRecovery(error) {
    console.log(`🔧 Attempting recovery for error: ${error.code}`);

    switch (error.code) {
      case 'NEEDS_MIGRATION':
      case 'INVALID_ENCRYPTION_FORMAT':
      case 'DECRYPTION_FAILED':
        // These require user action (disconnect/reconnect)
        return false;

      case 'EBAY_AUTH_FAILED':
        // Check if refresh token is expired (18 months)
        try {
          const credentials = await this.getCredentials();
          if (credentials.connectedAt) {
            const ageInMonths = (Date.now() - new Date(credentials.connectedAt).getTime()) / (30 * 24 * 60 * 60 * 1000);
            if (ageInMonths > 18) {
              // Token expired, mark as such
              await supabase
                .from('users')
                .update({ ebay_connection_status: 'expired' })
                .eq('id', this.userId);
              return false;
            }
          }
        } catch (err) {
          // Ignore errors during recovery attempt
        }
        return false;

      case 'EBAY_API_ERROR':
        // Retry once after 1 second delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          await this.getAccessToken();
          return true;
        } catch (retryError) {
          return false;
        }

      default:
        return false;
    }
  }
}

module.exports = { EbayTokenService, TokenError };
