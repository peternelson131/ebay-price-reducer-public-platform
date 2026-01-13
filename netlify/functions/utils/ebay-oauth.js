/**
 * eBay OAuth utilities
 * Handles token exchange, refresh, and API authentication
 * 
 * eBay OAuth Flow:
 * 1. User enters Client ID + Client Secret in our app
 * 2. We redirect user to eBay authorization URL
 * 3. User logs in to eBay and grants permission
 * 4. eBay redirects back with authorization code
 * 5. We exchange code for access_token + refresh_token
 * 6. Store tokens encrypted in user's database row
 * 7. Use access_token for API calls (refresh when expired)
 */

const fetch = require('node-fetch');
const { encrypt, decrypt } = require('./encryption');

// eBay API endpoints - switch based on environment
const IS_SANDBOX = process.env.EBAY_ENVIRONMENT === 'sandbox';
const EBAY_AUTH_URL = IS_SANDBOX 
  ? 'https://auth.sandbox.ebay.com/oauth2/authorize'
  : 'https://auth.ebay.com/oauth2/authorize';
const EBAY_TOKEN_URL = IS_SANDBOX
  ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
  : 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_API_BASE = IS_SANDBOX
  ? 'https://api.sandbox.ebay.com'
  : 'https://api.ebay.com';

// Required OAuth scopes for selling
// Note: These must be enabled in the eBay Developer Console for your app
// 
// Scopes needed for full listing flow:
// - api_scope: Base scope (always required)
// - sell.inventory: Create/manage inventory items & offers
// - sell.account: Access business policies (fulfillment, payment, return)
const EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account'
].join(' ');

/**
 * Generate the eBay authorization URL for user to visit
 * @param {string} clientId - User's eBay App Client ID
 * @param {string} redirectUri - Our callback URL
 * @param {string} state - CSRF protection state (user ID + random)
 * @returns {string} - Full authorization URL
 */
function generateAuthUrl(clientId, redirectUri, state) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: EBAY_SCOPES,
    state: state
  });

  return `${EBAY_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from eBay callback
 * @param {string} clientId - User's eBay App Client ID
 * @param {string} clientSecret - User's eBay App Client Secret
 * @param {string} redirectUri - Our callback URL (must match)
 * @returns {Promise<Object>} - { access_token, refresh_token, expires_in }
 */
async function exchangeCodeForTokens(code, clientId, clientSecret, redirectUri) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(EBAY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('eBay token exchange failed:', data);
    throw new Error(data.error_description || data.error || 'Token exchange failed');
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in, // seconds until expiry (typically 7200 = 2 hours)
    token_type: data.token_type
  };
}

/**
 * Refresh an expired access token
 * @param {string} refreshToken - The refresh token
 * @param {string} clientId - User's eBay App Client ID
 * @param {string} clientSecret - User's eBay App Client Secret
 * @returns {Promise<Object>} - { access_token, expires_in }
 */
async function refreshAccessToken(refreshToken, clientId, clientSecret) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(EBAY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: EBAY_SCOPES
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('eBay token refresh failed:', data);
    throw new Error(data.error_description || data.error || 'Token refresh failed');
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires_in
  };
}

/**
 * Get a valid access token for a user, refreshing if necessary
 * @param {Object} supabase - Supabase client
 * @param {string} userId - User ID
 * @returns {Promise<string>} - Valid access token
 */
async function getValidAccessToken(supabase, userId) {
  // Use platform-level eBay App credentials from environment
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('eBay platform credentials not configured. Contact support.');
  }

  // Get user's eBay tokens (per-user, stored in database)
  const { data: user, error } = await supabase
    .from('users')
    .select('ebay_access_token, ebay_refresh_token, ebay_token_expires_at')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw new Error('User not found');
  }

  if (!user.ebay_refresh_token) {
    throw new Error('eBay account not connected. Please connect your eBay account in API Keys.');
  }

  // Decrypt user tokens
  const refreshToken = decrypt(user.ebay_refresh_token);
  let accessToken = decrypt(user.ebay_access_token);

  if (!refreshToken) {
    throw new Error('eBay connection expired. Please reconnect your eBay account.');
  }

  // Check if access token is expired (with 5 minute buffer)
  const expiresAt = user.ebay_token_expires_at ? new Date(user.ebay_token_expires_at) : new Date(0);
  const now = new Date();
  const bufferMs = 5 * 60 * 1000; // 5 minutes

  if (!accessToken || expiresAt.getTime() - bufferMs < now.getTime()) {
    // Token expired or about to expire, refresh it
    console.log(`Refreshing eBay token for user ${userId}`);
    
    const newTokens = await refreshAccessToken(refreshToken, clientId, clientSecret);
    accessToken = newTokens.access_token;

    // Calculate new expiry time
    const newExpiresAt = new Date(now.getTime() + newTokens.expires_in * 1000);

    // Store new access token (encrypted)
    const { error: updateError } = await supabase
      .from('users')
      .update({
        ebay_access_token: encrypt(accessToken),
        ebay_token_expires_at: newExpiresAt.toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Failed to store refreshed token:', updateError);
      // Continue anyway, token is still valid for this request
    }
  }

  return accessToken;
}

/**
 * Make an authenticated request to eBay API
 * @param {string} accessToken - Valid access token
 * @param {string} endpoint - API endpoint path (e.g., '/sell/inventory/v1/inventory_item/SKU123')
 * @param {Object} options - Fetch options (method, body, etc.)
 * @returns {Promise<Object>} - API response
 */
async function ebayApiRequest(accessToken, endpoint, options = {}) {
  const url = `${EBAY_API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-Language': 'en-US',
      ...options.headers
    }
  });

  // Handle different response types
  const contentType = response.headers.get('content-type');
  let data;
  
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    console.error(`eBay API error (${response.status}):`, data);
    const errorMessage = typeof data === 'object' 
      ? (data.errors?.[0]?.message || data.message || JSON.stringify(data))
      : data;
    throw new Error(`eBay API error: ${errorMessage}`);
  }

  return data;
}

module.exports = {
  generateAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getValidAccessToken,
  ebayApiRequest,
  EBAY_SCOPES
};
