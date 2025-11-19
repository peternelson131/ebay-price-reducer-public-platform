const crypto = require('crypto');

// Environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

// Function to get encryption key
const getEncryptionKey = () => {
  if (process.env.ENCRYPTION_KEY) {
    const key = process.env.ENCRYPTION_KEY;
    if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
      return Buffer.from(key, 'hex');
    }
    return crypto.createHash('sha256').update(key).digest();
  }
  const seed = process.env.SUPABASE_URL || 'default-seed';
  return crypto.createHash('sha256').update(seed).digest();
};

const ENCRYPTION_KEY = getEncryptionKey();

// Encrypt function
function encrypt(text) {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (error) {
    console.error('Encryption error:', error.message);
    throw error;
  }
}

// Helper function to parse JWT token
function parseJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    const payload = Buffer.from(parts[1], 'base64').toString('utf8');
    return JSON.parse(payload);
  } catch (error) {
    console.error('JWT parse error:', error);
    return null;
  }
}

// Helper function to make Supabase API calls
async function supabaseRequest(endpoint, method = 'GET', body = null, headers = {}, useServiceKey = false) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const apiKey = useServiceKey && SUPABASE_SERVICE_KEY ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;

  const options = {
    method,
    headers: {
      'apikey': apiKey,
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...headers
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Supabase error: ${response.status} - ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

// Helper function to get authenticated user
async function getAuthUser(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY
      }
    });

    if (!response.ok) {
      return null;
    }

    const userData = await response.json();
    return userData;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight' })
    };
  }

  // This endpoint requires POST method
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Get user from auth header
    const authUser = await getAuthUser(event.headers.authorization);

    if (!authUser) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: 'Unauthorized',
          message: 'Please log in first'
        })
      };
    }

    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { refreshToken } = body;

    if (!refreshToken) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing refresh token',
          message: 'Please provide a valid eBay refresh token'
        })
      };
    }

    const userId = authUser.id;
    console.log('Fixing token for user:', userId);

    // Validate the provided token
    let tokenType = 'unknown';
    let isValid = false;
    let tokenInfo = {};

    // Check if it's a JWT token (access token)
    if (refreshToken.includes('.') && refreshToken.split('.').length === 3) {
      tokenType = 'jwt';
      const payload = parseJWT(refreshToken);
      if (payload) {
        tokenInfo = {
          exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'No expiration',
          expired: payload.exp ? Date.now() > payload.exp * 1000 : 'Unknown'
        };
        isValid = false; // JWT tokens are not valid refresh tokens
      }
    } else if (refreshToken.startsWith('v^1#i^1#')) {
      // This is an eBay OAuth token format
      tokenType = 'ebay_oauth';
      // We can't fully validate without trying to use it
      // But refresh tokens typically have specific patterns
      if (refreshToken.includes('A21AAI') || refreshToken.includes('A23AA')) {
        tokenType = 'ebay_refresh';
        isValid = true;
      } else {
        tokenType = 'ebay_access';
        isValid = false;
      }
    }

    if (!isValid && tokenType !== 'ebay_oauth') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid token',
          message: `The provided token appears to be a ${tokenType} token, not a refresh token`,
          tokenInfo
        })
      };
    }

    // Get user's eBay credentials
    const users = await supabaseRequest(
      `users?id=eq.${userId}&select=*`,
      'GET',
      null,
      {},
      true
    );

    if (!users || users.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: 'User not found',
          message: 'User profile not found in database'
        })
      };
    }

    const user = users[0];

    if (!user.ebay_app_id || !user.ebay_cert_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'eBay credentials not configured',
          message: 'Please configure your eBay App ID and Cert ID first'
        })
      };
    }

    // Test the refresh token by trying to get an access token
    console.log('Testing refresh token...');
    const tokenUrl = 'https://api.ebay.com/identity/v1/oauth2/token';
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.marketing.readonly https://api.ebay.com/oauth/api_scope/sell.marketing https://api.ebay.com/oauth/api_scope/sell.inventory.readonly https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account.readonly https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly https://api.ebay.com/oauth/api_scope/sell.fulfillment https://api.ebay.com/oauth/api_scope/sell.analytics.readonly'
    });

    const testResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${user.ebay_app_id}:${user.ebay_cert_id}`).toString('base64')
      },
      body: params
    });

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      let errorMsg = 'Token validation failed';
      try {
        const errorData = JSON.parse(errorText);
        errorMsg = errorData.error_description || errorData.error || errorMsg;
      } catch (e) {
        errorMsg = errorText || errorMsg;
      }

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid refresh token',
          message: `The token could not be validated: ${errorMsg}`,
          tokenType
        })
      };
    }

    const tokenData = await testResponse.json();
    console.log('Token validated successfully');

    // Encrypt and store the new refresh token
    const encryptedToken = encrypt(refreshToken);

    // Update user record with encrypted refresh token
    await supabaseRequest(
      `users?id=eq.${userId}`,
      'PATCH',
      {
        ebay_refresh_token: encryptedToken,
        ebay_token_expires_at: new Date(Date.now() + (tokenData.expires_in || 7200) * 1000).toISOString(),
        ebay_access_token: null // Clear any stored access token
      },
      {},
      true
    );

    console.log('Refresh token updated successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'eBay refresh token updated successfully',
        tokenType,
        expiresIn: tokenData.expires_in,
        testResult: 'Token is valid and working'
      })
    };

  } catch (error) {
    console.error('Fix token error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Fix failed',
        message: error.message
      })
    };
  }
};