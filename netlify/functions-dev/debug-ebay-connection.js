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

// Decrypt function
function decrypt(encryptedData) {
  try {
    if (typeof encryptedData === 'object' && encryptedData !== null) {
      if (encryptedData.iv && encryptedData.encrypted) {
        const iv = Buffer.from(encryptedData.iv, 'hex');
        const encryptedText = Buffer.from(encryptedData.encrypted, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
      }
      throw new Error('Invalid encrypted object format');
    } else if (typeof encryptedData === 'string') {
      const textParts = encryptedData.split(':');
      if (textParts.length < 2) {
        // Maybe it's not encrypted at all
        return encryptedData;
      }
      const iv = Buffer.from(textParts.shift(), 'hex');
      const encryptedText = Buffer.from(textParts.join(':'), 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString();
    } else {
      throw new Error(`Unexpected encrypted data type: ${typeof encryptedData}`);
    }
  } catch (error) {
    console.error('Decryption error:', error.message);
    throw new Error(`Failed to decrypt: ${error.message}`);
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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

    const userId = authUser.id;
    console.log('Debug: Checking eBay connection for user:', userId);

    // Get user profile with eBay credentials
    const users = await supabaseRequest(
      `users?id=eq.${userId}&select=*`,
      'GET',
      null,
      {},
      true
    );

    if (!users || users.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          connected: false,
          error: 'User not found',
          message: 'User profile not found in database'
        })
      };
    }

    const user = users[0];
    const debugInfo = {
      userId: userId,
      hasAppId: !!user.ebay_app_id,
      hasCertId: !!user.ebay_cert_id,
      hasRefreshToken: !!user.ebay_refresh_token,
      refreshTokenType: typeof user.ebay_refresh_token,
      encryptionKeyPresent: !!process.env.ENCRYPTION_KEY
    };

    console.log('Debug info:', debugInfo);

    // Check if eBay credentials exist
    if (!user.ebay_app_id || !user.ebay_cert_id || !user.ebay_refresh_token) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          connected: false,
          error: 'eBay not connected',
          message: 'Please connect your eBay account in Account Settings',
          debugInfo
        })
      };
    }

    // Try to decrypt refresh token
    let refreshToken;
    try {
      refreshToken = decrypt(user.ebay_refresh_token);
      debugInfo.decryptionSuccess = true;
      debugInfo.refreshTokenLength = refreshToken ? refreshToken.length : 0;
    } catch (error) {
      console.error('Failed to decrypt refresh token:', error.message);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          connected: false,
          error: 'Decryption failed',
          message: 'Failed to decrypt eBay credentials. Please reconnect your eBay account.',
          debugInfo: {
            ...debugInfo,
            decryptionError: error.message
          }
        })
      };
    }

    // Try to get access token
    const tokenUrl = 'https://api.ebay.com/identity/v1/oauth2/token';
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.marketing.readonly https://api.ebay.com/oauth/api_scope/sell.marketing https://api.ebay.com/oauth/api_scope/sell.inventory.readonly https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account.readonly https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly https://api.ebay.com/oauth/api_scope/sell.fulfillment https://api.ebay.com/oauth/api_scope/sell.analytics.readonly'
    });

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${user.ebay_app_id}:${user.ebay_cert_id}`).toString('base64')
        },
        body: params
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorObj;
        try {
          errorObj = JSON.parse(errorText);
        } catch (e) {
          errorObj = { error: errorText };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            connected: false,
            error: 'Token refresh failed',
            message: 'Failed to refresh eBay access token. Please reconnect your eBay account.',
            debugInfo: {
              ...debugInfo,
              tokenError: errorObj.error || 'Unknown error',
              tokenErrorDescription: errorObj.error_description || errorText,
              statusCode: response.status
            }
          })
        };
      }

      const tokenData = await response.json();
      debugInfo.tokenRefreshSuccess = true;
      debugInfo.hasAccessToken = !!tokenData.access_token;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          connected: true,
          message: 'eBay connection is working',
          debugInfo
        })
      };

    } catch (error) {
      console.error('Token refresh error:', error);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          connected: false,
          error: 'Network error',
          message: 'Failed to connect to eBay API',
          debugInfo: {
            ...debugInfo,
            networkError: error.message
          }
        })
      };
    }

  } catch (error) {
    console.error('Debug error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Debug failed',
        message: error.message
      })
    };
  }
};