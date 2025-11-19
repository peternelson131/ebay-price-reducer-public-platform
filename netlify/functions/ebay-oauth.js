const crypto = require('crypto');
const { getCorsHeaders } = require('./utils/cors');
const { encrypt, decrypt } = require('./utils/ebay-oauth-helpers');

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

// PKCE helper functions for OAuth security

// Base64url encoding polyfill for Node < 15 compatibility
function toBase64Url(buffer) {
  try {
    return buffer.toString('base64url');
  } catch (e) {
    // Fallback for Node < 15
    return buffer.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
}

function generateCodeVerifier() {
  return toBase64Url(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier) {
  return toBase64Url(
    crypto.createHash('sha256').update(verifier).digest()
  );
}

// Helper function to make Supabase API calls
async function supabaseRequest(endpoint, method = 'GET', body = null, headers = {}, useServiceKey = false) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  // Use service key for write operations on protected tables
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
    console.log('Auth failed: No bearer token in header');
    return null;
  }

  const token = authHeader.substring(7);

  // Check if this is a localStorage token (starts with 'localStorage-auth-token-')
  if (token.startsWith('localStorage-auth-token-')) {
    console.log('Using localStorage authentication mode');
    // For localStorage mode, we'll use a simple user ID
    // In a real system, you might want to store and validate these tokens
    return {
      id: 'local-user-1',
      email: 'user@example.com',
      isLocalStorageAuth: true
    };
  }

  // Check if this is a mock token (for demo mode)
  if (token.startsWith('mock-auth-token-')) {
    console.log('Using mock authentication mode');
    return {
      id: 'demo-user-id',
      email: 'demo@example.com',
      isMockAuth: true
    };
  }

  // Try Supabase authentication if configured
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.log('Supabase not configured, accepting any token in development mode');
    return {
      id: 'local-user-1',
      email: 'user@example.com',
      isDevelopmentAuth: true
    };
  }

  console.log('Attempting to validate token with Supabase');

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('Supabase auth response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Supabase auth failed:', errorText);
      return null;
    }

    const user = await response.json();
    console.log('User authenticated successfully:', user.id);
    return user;
  } catch (error) {
    console.error('Error validating token:', error);
    return null;
  }
}

exports.handler = async (event, context) => {
  console.log('eBay OAuth handler called');
  console.log('Method:', event.httpMethod);
  console.log('Path:', event.path);
  console.log('Query params:', event.queryStringParameters);

  // Get CORS headers from shared utility
  const headers = getCorsHeaders(event);

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    const { action, code, state } = event.queryStringParameters || {};

    // If we receive a code and state without an action, this is the OAuth callback
    if (code && state && !action) {
      console.log('OAuth callback detected, forwarding to callback handler');
      // Import and call the callback handler directly
      const callbackHandler = require('./ebay-oauth-callback');
      return callbackHandler.handler(event, context);
    }

    // Test endpoint - doesn't require auth
    if (action === 'test') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'eBay OAuth function is working',
          env: {
            hasSupabaseUrl: !!SUPABASE_URL,
            hasSupabaseKey: !!SUPABASE_ANON_KEY,
            hasEbayAppId: !!process.env.EBAY_APP_ID,
            hasEbayCertId: !!process.env.EBAY_CERT_ID,
            hasEbayRedirectUri: !!process.env.EBAY_REDIRECT_URI,
            hasEncryptionKey: !!process.env.ENCRYPTION_KEY
          },
          timestamp: new Date().toISOString()
        })
      };
    }

    // Check for authenticated user
    // Netlify lowercases headers, so check both
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const authUser = await getAuthUser(authHeader);
    if (!authUser) {
      console.log('Authentication failed - no valid user found');
      console.log('Headers received:', Object.keys(event.headers));
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    // Handle different OAuth actions
    if (action === 'initiate') {
      // For localStorage/mock/development auth, we'll need to handle credentials differently
      if (authUser.isLocalStorageAuth || authUser.isMockAuth || authUser.isDevelopmentAuth) {
        console.log('OAuth initiate for localStorage/demo mode user');

        // For localStorage mode, temporarily show an informative message about needing real Supabase setup
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Feature requires database setup',
            message: 'OAuth flow requires Supabase database setup to store user credentials. Currently running in localStorage mode.',
            needsRealSetup: true
          })
        };
      }

      // First, get the user's eBay credentials (use service key to bypass RLS)
      const users = await supabaseRequest(
        `users?id=eq.${authUser.id}`,
        'GET',
        null,
        {},
        true // Use service key to bypass RLS policies
      );

      if (!users || users.length === 0) {
        // User record doesn't exist - they need to save credentials first
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'User not found',
            message: 'Please save your eBay credentials first'
          })
        };
      }

      const user = users[0];

      // Decrypt cert_id if encrypted
      if (user.ebay_cert_id_encrypted) {
        user.ebay_cert_id = decrypt(user.ebay_cert_id_encrypted);
      }

      // Check if user has configured their eBay credentials
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

      // Generate PKCE values
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      // Generate OAuth state
      const oauthState = crypto.randomBytes(32).toString('hex');
      console.log('Generated OAuth state:', oauthState);

      // Store state AND code_verifier in database (use service key if needed)
      await supabaseRequest(
        'oauth_states',
        'POST',
        {
          state: oauthState,
          user_id: authUser.id,
          code_verifier: codeVerifier,
          created_at: new Date().toISOString()
        },
        {},
        true // Use service key for protected table
      );

      // Return eBay OAuth URL using USER'S credentials with PKCE
      // Use the main ebay-oauth endpoint as redirect URI since eBay sends callback there
      const redirectUri = process.env.EBAY_REDIRECT_URI || 'https://dainty-horse-49c336.netlify.app/.netlify/functions/ebay-oauth';
      const ebayAuthUrl = `https://auth.ebay.com/oauth2/authorize?` +
        `client_id=${user.ebay_app_id}&` +
        `response_type=code&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.marketing.readonly https://api.ebay.com/oauth/api_scope/sell.marketing https://api.ebay.com/oauth/api_scope/sell.inventory.readonly https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account.readonly https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly https://api.ebay.com/oauth/api_scope/sell.fulfillment https://api.ebay.com/oauth/api_scope/sell.analytics.readonly')}&` +
        `state=${oauthState}&` +
        `code_challenge=${codeChallenge}&` +
        `code_challenge_method=S256`;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          authUrl: ebayAuthUrl,
          state: oauthState,
          usingUserCredentials: true
        })
      };
    }

    if (action === 'callback') {
      if (!code || !state) {
        throw new Error('Missing code or state parameter');
      }

      // Validate state
      const stateRecords = await supabaseRequest(
        `oauth_states?state=eq.${state}&user_id=eq.${authUser.id}`,
        'GET'
      );

      if (!stateRecords || stateRecords.length === 0) {
        throw new Error('Invalid OAuth state');
      }

      // Get user's eBay credentials (use service key to bypass RLS)
      const users = await supabaseRequest(
        `users?id=eq.${authUser.id}`,
        'GET',
        null,
        {},
        true // Use service key to bypass RLS policies
      );

      const user = users[0];

      // Decrypt cert_id if encrypted
      if (user && user.ebay_cert_id_encrypted) {
        user.ebay_cert_id = decrypt(user.ebay_cert_id_encrypted);
      }

      if (!users || users.length === 0 || !user.ebay_app_id || !user.ebay_cert_id) {
        throw new Error('User eBay credentials not configured');
      }

      // Delete used state (use service key for protected table)
      await supabaseRequest(
        `oauth_states?state=eq.${state}`,
        'DELETE',
        null,
        {},
        true // Use service key for protected table
      );

      // Exchange code for tokens using USER'S credentials
      const tokenUrl = 'https://api.ebay.com/identity/v1/oauth2/token';
      const decodedCode = decodeURIComponent(code);
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code: decodedCode,
        redirect_uri: process.env.EBAY_REDIRECT_URI
      });

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${user.ebay_app_id}:${user.ebay_cert_id}`).toString('base64')
        },
        body: tokenParams
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Token exchange failed:', errorText);
        throw new Error(`Token exchange failed: ${errorText}`);
      }

      const tokenData = await tokenResponse.json();
      console.log('Token exchange successful');

      // Encrypt and store refresh token
      if (tokenData.refresh_token) {
        const encryptedToken = encrypt(tokenData.refresh_token);

        // Update user record with encrypted refresh token (use service key for protected table)
        await supabaseRequest(
          `users?id=eq.${authUser.id}`,
          'PATCH',
          {
            ebay_refresh_token: encryptedToken,
            ebay_token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
          },
          {},
          true // Use service key for protected table
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'eBay account connected successfully',
            hasRefreshToken: true
          })
        };
      } else {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'No refresh token received',
            tokenData: tokenData
          })
        };
      }
    }

    if (action === 'get-credentials') {
      // For localStorage/mock/development auth, we still need to check user credentials in Supabase
      // but with a simpler approach for demo/localStorage mode
      if (authUser.isLocalStorageAuth || authUser.isMockAuth || authUser.isDevelopmentAuth) {
        console.log('Getting credentials for localStorage/demo mode user');

        // For localStorage mode, use a hardcoded user ID or return minimal demo credentials
        if (authUser.isLocalStorageAuth || authUser.isDevelopmentAuth) {
          // Check if user has credentials saved, otherwise return empty
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              hasAppId: false,
              hasCertId: false,
              hasDevId: false,
              hasRefreshToken: false,
              appId: null,
              certId: null,
              devId: null,
              needsCredentials: true
            })
          };
        }

        // For demo mode, show sample credentials
        if (authUser.isMockAuth) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              hasAppId: true,
              hasCertId: true,
              hasDevId: true,
              hasRefreshToken: false,
              appId: 'DemoApp123...',
              certId: 'DemoCert456...',
              devId: 'DemoDev789...',
              needsCredentials: false
            })
          };
        }
      }

      // Get user's eBay credentials (use service key to bypass RLS)
      try {
        const users = await supabaseRequest(
          `users?id=eq.${authUser.id}`,
          'GET',
          null,
          {},
          true // Use service key to bypass RLS policies
        );

        if (!users || users.length === 0) {
          // User not found - return empty credentials
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              hasAppId: false,
              hasCertId: false,
              hasDevId: false,
              hasRefreshToken: false,
              appId: null,
              certId: null,
              devId: null
            })
          };
        }

        const user = users[0];

        // Decrypt cert_id if encrypted (for status display)
        if (user.ebay_cert_id_encrypted) {
          user.ebay_cert_id = decrypt(user.ebay_cert_id_encrypted);
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            hasAppId: !!user.ebay_app_id,
            hasCertId: !!user.ebay_cert_id || !!user.ebay_cert_id_encrypted,
            hasDevId: !!user.ebay_dev_id,
            hasRefreshToken: !!user.ebay_refresh_token,
            appId: user.ebay_app_id || null,
            certId: user.ebay_cert_id || null,
            devId: user.ebay_dev_id || null
          })
        };
      } catch (error) {
        console.error('Error getting credentials:', error);
        // Return empty credentials on error
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            hasAppId: false,
            hasCertId: false,
            hasDevId: false,
            hasRefreshToken: false,
            appId: null,
            certId: null,
            devId: null,
            error: error.message
          })
        };
      }
    }

    if (action === 'status') {
      console.log('Status action triggered for user:', authUser.id);

      // For localStorage/mock/development auth, return basic status
      if (authUser.isLocalStorageAuth || authUser.isMockAuth || authUser.isDevelopmentAuth) {
        console.log('Getting status for non-Supabase auth');
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            connected: false,
            message: 'Status check for localStorage/demo mode',
            tokenValid: false,
            tokenExpiresAt: null,
            refreshTokenExpiresAt: null,
            userId: authUser.id
          })
        };
      }

      try {
        // Get user data from Supabase with both token expiration fields
        const userData = await supabaseRequest(
          `users?id=eq.${authUser.id}&select=ebay_refresh_token,ebay_user_id,ebay_token_expires_at,ebay_refresh_token_expires_at,ebay_connection_status`,
          'GET',
          null,
          {},
          true // Use service key
        );

        if (!userData || userData.length === 0) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              connected: false,
              message: 'User not found in database',
              tokenValid: false,
              tokenExpiresAt: null,
              refreshTokenExpiresAt: null
            })
          };
        }

        const user = userData[0];
        const hasRefreshToken = !!user.ebay_refresh_token;
        const isTokenValid = user.ebay_token_expires_at ?
          new Date(user.ebay_token_expires_at) > new Date() : false;
        const isRefreshTokenValid = user.ebay_refresh_token_expires_at ?
          new Date(user.ebay_refresh_token_expires_at) > new Date() : false;

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            connected: hasRefreshToken && isRefreshTokenValid,
            message: hasRefreshToken ? 'eBay account connected' : 'eBay account not connected',
            tokenValid: isTokenValid,
            tokenExpiresAt: user.ebay_token_expires_at,
            refreshTokenExpiresAt: user.ebay_refresh_token_expires_at, // Use refresh token expiration
            userId: user.ebay_user_id,
            connectionStatus: user.ebay_connection_status
          })
        };
      } catch (error) {
        console.error('Error getting connection status:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Failed to get connection status',
            message: error.message
          })
        };
      }
    }

    if (action === 'refresh-token') {
      console.log('Refresh token action triggered for user:', authUser.id);

      // For localStorage/mock/development auth, return mock success
      if (authUser.isLocalStorageAuth || authUser.isMockAuth || authUser.isDevelopmentAuth) {
        console.log('Handling token refresh for non-Supabase auth');
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Token refreshed (localStorage mode)',
            tokenExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
          })
        };
      }

      try {
        // Get user's eBay credentials and refresh token
        const users = await supabaseRequest(
          `users?id=eq.${authUser.id}`,
          'GET',
          null,
          {},
          true // Use service key
        );

        if (!users || users.length === 0) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'User not found'
            })
          };
        }

        const user = users[0];

        // Decrypt cert_id if encrypted
        if (user.ebay_cert_id_encrypted) {
          user.ebay_cert_id = decrypt(user.ebay_cert_id_encrypted);
        }

        // Check if user has required credentials
        if (!user.ebay_app_id || !user.ebay_cert_id) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'eBay credentials not configured'
            })
          };
        }

        // Check if user has a refresh token
        if (!user.ebay_refresh_token) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'No refresh token found. Please reconnect your eBay account.',
              needsReconnect: true
            })
          };
        }

        // Decrypt the refresh token
        let decryptedRefreshToken;
        try {
          decryptedRefreshToken = decrypt(user.ebay_refresh_token);
        } catch (error) {
          console.error('Failed to decrypt refresh token:', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'Failed to decrypt refresh token',
              needsReconnect: true
            })
          };
        }

        // Call eBay's token refresh endpoint
        const tokenUrl = 'https://api.ebay.com/identity/v1/oauth2/token';
        const tokenParams = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: decryptedRefreshToken,
          scope: 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.marketing.readonly https://api.ebay.com/oauth/api_scope/sell.marketing https://api.ebay.com/oauth/api_scope/sell.inventory.readonly https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account.readonly https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly https://api.ebay.com/oauth/api_scope/sell.fulfillment https://api.ebay.com/oauth/api_scope/sell.analytics.readonly'
        });

        console.log('Calling eBay token refresh endpoint...');

        const tokenResponse = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${user.ebay_app_id}:${user.ebay_cert_id}`).toString('base64')
          },
          body: tokenParams
        });

        const responseText = await tokenResponse.text();
        console.log('Token refresh response status:', tokenResponse.status);

        if (!tokenResponse.ok) {
          console.error('Token refresh failed:', responseText);

          let errorMessage = 'Token refresh failed';
          let needsReconnect = false;

          try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.error_description || errorData.error || errorMessage;

            // Check if refresh token is invalid/expired
            if (errorData.error === 'invalid_grant' || errorMessage.includes('expired') || errorMessage.includes('invalid')) {
              needsReconnect = true;
              errorMessage = 'Refresh token has expired or been revoked. Please reconnect your eBay account.';
            }
          } catch (e) {
            errorMessage = responseText || errorMessage;
          }

          return {
            statusCode: tokenResponse.status,
            headers,
            body: JSON.stringify({
              success: false,
              error: errorMessage,
              needsReconnect
            })
          };
        }

        const tokenData = JSON.parse(responseText);
        console.log('Token refresh successful:', {
          has_access_token: !!tokenData.access_token,
          expires_in: tokenData.expires_in
        });

        // Update the access token expiry time in database
        // Note: We don't store the access token itself, only the expiry time
        const accessTokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000);

        await supabaseRequest(
          `users?id=eq.${authUser.id}`,
          'PATCH',
          {
            ebay_token_expires_at: accessTokenExpiry.toISOString(),
            ebay_connection_status: 'connected'
          },
          {},
          true // Use service key
        );

        console.log('Token expiry updated successfully');

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Access token refreshed successfully',
            tokenExpiresAt: accessTokenExpiry.toISOString(),
            expiresIn: tokenData.expires_in
          })
        };
      } catch (error) {
        console.error('Error refreshing token:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Failed to refresh token',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
          })
        };
      }
    }

    if (action === 'disconnect') {
      console.log('Disconnect action triggered for user:', authUser.id);

      // For localStorage/mock/development auth, just return success
      if (authUser.isLocalStorageAuth || authUser.isMockAuth || authUser.isDevelopmentAuth) {
        console.log('Handling disconnect for non-Supabase auth');
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'eBay account disconnected (localStorage mode)'
          })
        };
      }

      // Disconnect eBay - remove OAuth tokens but keep credentials
      try {
        console.log('Fetching user record to verify existence');
        const users = await supabaseRequest(
          `users?id=eq.${authUser.id}&select=*`,
          'GET',
          null,
          {},
          true // Use service key
        );

        console.log('Users found:', users ? users.length : 0);

        if (!users || users.length === 0) {
          console.error('User not found in database:', authUser.id);
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
              error: 'User not found'
            })
          };
        }

        const currentUser = users[0];
        console.log('Current user has refresh token:', !!currentUser.ebay_refresh_token);
        console.log('Current user eBay user ID:', currentUser.ebay_user_id);
        console.log('Current connection status:', currentUser.ebay_connection_status);

        // Clear only OAuth-related fields, keep app credentials
        // Use empty string instead of null for better REST API compatibility
        console.log('Clearing OAuth fields for user:', authUser.id);

        // Clear OAuth tokens but keep app credentials
        const updateResult = await supabaseRequest(
          `users?id=eq.${authUser.id}&select=*`,
          'PATCH',
          {
            ebay_refresh_token: null,
            ebay_user_id: null,
            ebay_connection_status: 'disconnected',
            ebay_connected_at: null
            // Keep: ebay_app_id, ebay_cert_id_encrypted, ebay_dev_id
          },
          {
            'Prefer': 'return=representation'
          },
          true // Use service key
        );

        console.log('Update result:', updateResult);

        // Verify the update worked
        if (updateResult && updateResult.length > 0) {
          const updatedUser = updateResult[0];
          console.log('After update - refresh token cleared:', !updatedUser.ebay_refresh_token);
          console.log('After update - user ID cleared:', !updatedUser.ebay_user_id);
          console.log('After update - connection status:', updatedUser.ebay_connection_status);
          console.log('After update - app_id preserved:', !!updatedUser.ebay_app_id);
          console.log('After update - cert_id_encrypted preserved:', !!updatedUser.ebay_cert_id_encrypted);
        }

        console.log('eBay OAuth disconnected successfully for user:', authUser.id);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'eBay account disconnected successfully',
            cleared: {
              refreshToken: true,
              userId: true,
              expiresAt: true
            }
          })
        };
      } catch (error) {
        console.error('Error disconnecting eBay:', error);
        console.error('Error stack:', error.stack);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Failed to disconnect eBay account',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
          })
        };
      }
    }

    // Default response
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid action' })
    };
  } catch (error) {
    console.error('Error in eBay OAuth handler:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};