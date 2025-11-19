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
    } else if (typeof encryptedData === 'string') {
      const textParts = encryptedData.split(':');
      if (textParts.length < 2) {
        return encryptedData;
      }
      const iv = Buffer.from(textParts.shift(), 'hex');
      const encryptedText = Buffer.from(textParts.join(':'), 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString();
    }
  } catch (error) {
    console.error('Decryption error:', error.message);
    return null;
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
    console.log('Checking stored token for user:', userId);

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
          error: 'User not found',
          message: 'User profile not found in database'
        })
      };
    }

    const user = users[0];
    const result = {
      userId: userId,
      hasAppId: !!user.ebay_app_id,
      hasCertId: !!user.ebay_cert_id,
      hasRefreshToken: !!user.ebay_refresh_token,
      hasAccessToken: !!user.ebay_access_token,
      refreshTokenType: typeof user.ebay_refresh_token,
      accessTokenType: typeof user.ebay_access_token,
      tokenAnalysis: {}
    };

    // Check what's stored in ebay_refresh_token field
    if (user.ebay_refresh_token) {
      let decryptedToken = null;

      try {
        decryptedToken = decrypt(user.ebay_refresh_token);
        result.decryptionSuccess = true;
      } catch (error) {
        result.decryptionSuccess = false;
        result.decryptionError = error.message;
      }

      if (decryptedToken) {
        // Check if it's a JWT token (has three parts separated by dots)
        if (decryptedToken.includes('.') && decryptedToken.split('.').length === 3) {
          result.tokenAnalysis.type = 'JWT Token (likely an access token, not refresh token!)';

          // Parse the JWT to check expiration
          const payload = parseJWT(decryptedToken);
          if (payload) {
            result.tokenAnalysis.jwtPayload = {
              exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'No expiration',
              iat: payload.iat ? new Date(payload.iat * 1000).toISOString() : 'No issued time',
              scope: payload.scope || 'No scope',
              user_name: payload.user_name || 'No username',
              expired: payload.exp ? Date.now() > payload.exp * 1000 : 'Unknown'
            };

            if (payload.exp && Date.now() > payload.exp * 1000) {
              result.tokenAnalysis.status = '❌ TOKEN EXPIRED';
              const expirationDate = new Date(payload.exp * 1000);
              const hoursAgo = Math.floor((Date.now() - expirationDate) / (1000 * 60 * 60));
              result.tokenAnalysis.expiredHoursAgo = hoursAgo;
            } else if (payload.exp) {
              result.tokenAnalysis.status = '✅ Token still valid';
              const expirationDate = new Date(payload.exp * 1000);
              const hoursLeft = Math.floor((expirationDate - Date.now()) / (1000 * 60 * 60));
              result.tokenAnalysis.hoursUntilExpiration = hoursLeft;
            }
          }
        } else if (decryptedToken.startsWith('v^1#i^1#')) {
          // This is an eBay OAuth token format
          result.tokenAnalysis.type = 'eBay OAuth Token (could be access or refresh)';
          result.tokenAnalysis.tokenPrefix = decryptedToken.substring(0, 20) + '...';

          // eBay refresh tokens typically start with specific patterns
          if (decryptedToken.includes('A21AAI') || decryptedToken.includes('A23AA')) {
            result.tokenAnalysis.likelyType = 'Looks like an eBay refresh token';
          } else {
            result.tokenAnalysis.likelyType = 'Might be an eBay access token';
          }
        } else {
          result.tokenAnalysis.type = 'Unknown token format';
          result.tokenAnalysis.tokenLength = decryptedToken.length;
          result.tokenAnalysis.tokenPrefix = decryptedToken.substring(0, 20) + '...';
        }
      }
    }

    // Check what's stored in ebay_access_token field (if exists)
    if (user.ebay_access_token) {
      result.separateAccessToken = true;

      try {
        const decryptedAccess = decrypt(user.ebay_access_token);
        if (decryptedAccess && decryptedAccess.includes('.')) {
          const payload = parseJWT(decryptedAccess);
          if (payload && payload.exp) {
            result.accessTokenExpired = Date.now() > payload.exp * 1000;
            result.accessTokenExpiration = new Date(payload.exp * 1000).toISOString();
          }
        }
      } catch (error) {
        result.accessTokenDecryptError = error.message;
      }
    }

    // Provide diagnosis
    if (result.tokenAnalysis.status === '❌ TOKEN EXPIRED') {
      result.diagnosis = 'PROBLEM FOUND: You have an expired ACCESS token stored as a refresh token. This is why authentication fails.';
      result.solution = 'You need to reconnect your eBay account to get a proper refresh token.';
    } else if (result.tokenAnalysis.type === 'JWT Token (likely an access token, not refresh token!)') {
      result.diagnosis = 'PROBLEM FOUND: An access token is stored where the refresh token should be.';
      result.solution = 'Access tokens expire quickly (usually 2 hours). You need a refresh token for long-term access.';
    } else if (!user.ebay_refresh_token) {
      result.diagnosis = 'No eBay token stored';
      result.solution = 'Connect your eBay account to get started.';
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('Check error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Check failed',
        message: error.message
      })
    };
  }
};