const { createClient } = require('@supabase/supabase-js');
const { decrypt } = require('./ebay-oauth-helpers');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * User-specific eBay API Client
 * Handles eBay API calls using user's own tokens
 */
class UserEbayClient {
  constructor(userId) {
    this.userId = userId;
    this.accessToken = null;
    this.ebayUserId = null;
    this.appId = null; // Store user's App ID for API calls
  }

  /**
   * Initialize client with user's eBay credentials
   */
  async initialize() {
    try {
      console.log('🔍 UserEbayClient.initialize() - User ID:', this.userId);

      const { data, error } = await supabase.rpc('get_user_ebay_credentials', {
        user_uuid: this.userId
      });

      console.log('🔍 RPC Response - Error:', error);
      console.log('🔍 RPC Response - Data:', data ? `${data.length} rows` : 'null');

      if (error) {
        console.error('❌ RPC Error:', error);
        throw new Error(`Failed to get eBay credentials: ${error.message}`);
      }

      if (!data || data.length === 0) {
        console.error('❌ No credentials found for user:', this.userId);
        throw new Error('User has not connected their eBay account');
      }

      const credentials = data[0];
      console.log('🔍 Credentials check - Has refresh_token:', !!credentials.refresh_token);
      console.log('🔍 Credentials check - Has ebay_user_id:', !!credentials.ebay_user_id);

      if (!credentials.refresh_token) {
        console.error('❌ Refresh token is null or empty');
        throw new Error('User has not connected their eBay account');
      }

      this.ebayUserId = credentials.ebay_user_id;

      // Always get fresh access token by exchanging refresh token
      console.log('🔍 Calling refreshToken()...');
      const refreshResult = await this.refreshToken();
      if (!refreshResult) {
        throw new Error('Failed to obtain eBay access token');
      }

      console.log('✅ UserEbayClient.initialize() completed successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing eBay client:', error);
      throw error;
    }
  }

  /**
   * Refresh the user's eBay access token
   */
  async refreshToken() {
    try {
      console.log('🔍 Token refresh started', { userId: this.userId });

      // 1. Get refresh token via existing RPC
      const { data: tokenData, error: tokenError } = await supabase.rpc(
        'get_user_ebay_credentials',
        { user_uuid: this.userId }
      );

      if (tokenError) {
        throw new Error(`Failed to fetch refresh token: ${tokenError.message}`);
      }

      if (!tokenData || !tokenData[0]?.refresh_token) {
        throw new Error('No refresh token found. User has not connected their eBay account.');
      }

      const refreshToken = tokenData[0].refresh_token;
      console.log('✓ Refresh token retrieved');
      console.log('→ Refresh token (first 10 chars):', refreshToken ? refreshToken.substring(0, 10) + '...' : 'NULL');
      console.log('→ Refresh token (last 10 chars):', refreshToken ? '...' + refreshToken.substring(refreshToken.length - 10) : 'NULL');

      // 2. Get app credentials via NEW RPC function
      const { data: appCreds, error: appError } = await supabase.rpc(
        'get_user_ebay_app_credentials',
        { user_uuid: this.userId }
      );

      let clientId, clientSecret;

      if (appCreds && appCreds[0]?.ebay_app_id && appCreds[0]?.ebay_cert_id_encrypted) {
        // User has custom credentials
        console.log('✓ Using user-specific eBay app credentials');
        clientId = appCreds[0].ebay_app_id;
        this.appId = clientId; // Store for later use in API calls

        // Validate encryption format before decrypt
        const encrypted = appCreds[0].ebay_cert_id_encrypted;

        if (encrypted.startsWith('NEEDS_MIGRATION:')) {
          throw new Error(
            'eBay credentials need migration. Please disconnect and reconnect your eBay account.'
          );
        }

        if (!/^[0-9a-f]+:[0-9a-f]+$/i.test(encrypted)) {
          throw new Error(
            `Invalid credential encryption format. Expected hex:hex, got: ${encrypted.substring(0, 20)}...`
          );
        }

        try {
          clientSecret = decrypt(encrypted);
          console.log('✓ Credential decryption successful');
        } catch (decryptError) {
          throw new Error(`Credential decryption failed: ${decryptError.message}`);
        }
      } else {
        // Fall back to environment variables
        console.log('→ Using global eBay credentials from environment');
        clientId = process.env.EBAY_APP_ID;
        this.appId = clientId; // Store for later use in API calls
        clientSecret = process.env.EBAY_CERT_ID;

        if (!clientId || !clientSecret) {
          throw new Error(
            'No eBay app credentials configured. ' +
            'Set EBAY_APP_ID and EBAY_CERT_ID in Netlify environment variables, ' +
            'or save custom credentials in your account settings.'
          );
        }
      }

      // 3. Exchange refresh token for access token
      console.log('→ Calling eBay OAuth API...');
      console.log('→ Using App ID (full):', clientId);
      console.log('→ Using Cert ID (first 10):', clientSecret ? clientSecret.substring(0, 10) + '...' : 'MISSING');
      console.log('→ Cert ID length:', clientSecret ? clientSecret.length : 'MISSING');
      const credentialsBase64 = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentialsBase64}`
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // Log detailed eBay error
        const ebayError = data.error_description || data.error || 'Unknown eBay error';
        console.error('❌ eBay token refresh rejected:', {
          status: response.status,
          error: ebayError,
          userId: this.userId
        });

        // Return descriptive error without auto-disconnecting
        // Let users manually reconnect if needed
        throw new Error(`eBay API error (${response.status}): ${ebayError}`);
      }

      // Success!
      this.accessToken = data.access_token;
      console.log('✓ Access token obtained successfully, expires in:', data.expires_in, 'seconds');
      return true;

    } catch (error) {
      console.error('💥 Token refresh failed:', {
        userId: this.userId,
        error: error.message,
        stack: error.stack
      });

      // Re-throw with context instead of returning false
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Make authenticated eBay API call
   */
  async makeApiCall(endpoint, method = 'GET', data = null, apiType = 'trading') {
    if (!this.accessToken) {
      throw new Error('eBay client not initialized. Call initialize() first.');
    }

    const baseUrls = {
      trading: 'https://api.ebay.com/ws/api.dll',
      finding: 'https://svcs.ebay.com/services/search/FindingService/v1',
      sell: 'https://api.ebay.com/sell'
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`
    };

    // Add API-specific headers
    if (apiType === 'trading') {
      headers['X-EBAY-API-SITEID'] = '0';
      headers['X-EBAY-API-COMPATIBILITY-LEVEL'] = '967';
      headers['X-EBAY-API-CALL-NAME'] = endpoint;
    }

    try {
      const startTime = Date.now();
      const url = apiType === 'trading' ? baseUrls.trading : `${baseUrls[apiType]}${endpoint}`;

      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined
      });

      const responseTime = Date.now() - startTime;
      const responseData = await response.json();

      // Log API call for monitoring
      await this.logApiCall(endpoint, method, response.status, responseTime,
                           response.ok ? null : responseData.error?.message);

      if (!response.ok) {
        throw new Error(`eBay API Error: ${responseData.error?.message || 'Unknown error'}`);
      }

      return responseData;

    } catch (error) {
      console.error(`eBay API call failed (${endpoint}):`, error);
      throw error;
    }
  }

  /**
   * Get user's active listings
   */
  async getActiveListings(page = 1, limit = 50) {
    const requestData = {
      RequesterCredentials: {
        eBayAuthToken: this.accessToken
      },
      Pagination: {
        EntriesPerPage: limit,
        PageNumber: page
      },
      DetailLevel: 'ReturnAll',
      StartTimeFrom: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // Last 90 days
      StartTimeTo: new Date().toISOString()
    };

    return await this.makeApiCall('GetMyeBaySelling', 'POST', requestData, 'trading');
  }

  /**
   * Get specific item details
   */
  async getItemDetails(itemId) {
    const requestData = {
      RequesterCredentials: {
        eBayAuthToken: this.accessToken
      },
      ItemID: itemId,
      DetailLevel: 'ReturnAll'
    };

    return await this.makeApiCall('GetItem', 'POST', requestData, 'trading');
  }

  /**
   * Update item price
   */
  async updateItemPrice(itemId, newPrice) {
    const requestData = {
      RequesterCredentials: {
        eBayAuthToken: this.accessToken
      },
      Item: {
        ItemID: itemId,
        StartPrice: newPrice
      }
    };

    return await this.makeApiCall('ReviseItem', 'POST', requestData, 'trading');
  }

  /**
   * End an eBay listing
   */
  async endListing(itemId, reason = 'NotAvailable') {
    const requestData = {
      RequesterCredentials: {
        eBayAuthToken: this.accessToken
      },
      ItemID: itemId,
      EndingReason: reason
    };

    return await this.makeApiCall('EndItem', 'POST', requestData, 'trading');
  }

  /**
   * Search for similar items (for competitive pricing)
   */
  async searchSimilarItems(keywords, category = null, maxResults = 10) {
    // Use user's App ID if available, otherwise fall back to environment variable
    const appId = this.appId || process.env.EBAY_APP_ID;

    if (!appId) {
      throw new Error('eBay App ID not configured. Please initialize the client first or set EBAY_APP_ID environment variable.');
    }

    const params = new URLSearchParams({
      'OPERATION-NAME': 'findItemsAdvanced',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': appId,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'keywords': keywords,
      'paginationInput.entriesPerPage': maxResults.toString(),
      'sortOrder': 'PricePlusShipping'
    });

    if (category) {
      params.append('categoryId', category);
    }

    const url = `https://svcs.ebay.com/services/search/FindingService/v1?${params}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error('Finding API call failed');
      }

      return data;

    } catch (error) {
      console.error('Error searching similar items:', error);
      throw error;
    }
  }

  /**
   * Log API call for monitoring and rate limiting
   */
  async logApiCall(endpoint, method, statusCode, responseTime, errorMessage = null) {
    try {
      // Log API call details to console for monitoring
      const logData = {
        timestamp: new Date().toISOString(),
        user_id: this.userId,
        api_call: endpoint,
        endpoint: endpoint,
        method: method,
        status_code: statusCode,
        response_time_ms: responseTime,
        error_message: errorMessage
      };

      if (errorMessage) {
        console.error('eBay API Call Failed:', logData);
      } else {
        console.log('eBay API Call Success:', logData);
      }
    } catch (error) {
      console.error('Error logging API call:', error);
      // Don't throw error here to avoid breaking the main flow
    }
  }

  /**
   * Get user's API usage statistics
   */
  async getApiUsageStats(timeframe = '24h') {
    const timeframeMappings = {
      '1h': 1,
      '24h': 24,
      '7d': 24 * 7,
      '30d': 24 * 30
    };

    const hours = timeframeMappings[timeframe] || 24;
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    try {
      // Since ebay_api_logs table no longer exists, return default stats
      // In the future, implement in-memory or alternative logging if needed
      console.log(`API usage stats requested for timeframe: ${timeframe}, user: ${this.userId}`);

      const stats = {
        totalCalls: 0,
        successfulCalls: 0,
        errorCalls: 0,
        averageResponseTime: 0,
        callsByEndpoint: {},
        message: 'API logging temporarily disabled - stats unavailable'
      };

      return stats;

    } catch (error) {
      console.error('Error getting API usage stats:', error);
      throw error;
    }
  }

  /**
   * Check if user is within rate limits
   */
  async checkRateLimit() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    try {
      // Since ebay_api_logs table no longer exists, assume user is within limits
      // In the future, implement in-memory rate limiting or alternative tracking
      console.log(`Rate limit check for user: ${this.userId} - assuming within limits (no logging table)`);

      const rateLimit = 5000; // eBay's typical hourly limit

      return {
        withinLimit: true,
        callsUsed: 0,
        callsRemaining: rateLimit,
        resetTime: new Date(Date.now() + 60 * 60 * 1000),
        message: 'Rate limiting temporarily disabled - assuming within limits'
      };

    } catch (error) {
      console.error('Error checking rate limit:', error);
      return {
        withinLimit: true,
        callsUsed: 0,
        callsRemaining: 5000,
        resetTime: new Date(Date.now() + 60 * 60 * 1000)
      };
    }
  }
}

module.exports = { UserEbayClient };