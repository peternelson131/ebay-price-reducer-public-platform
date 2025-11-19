const crypto = require('crypto');
const { getCorsHeaders } = require('./utils/cors');
const { encrypt } = require('./utils/ebay-oauth-helpers');

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

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
    console.log('Using localStorage authentication mode for save credentials');
    // For localStorage mode, we'll use a simple user ID
    return {
      id: 'local-user-1',
      email: 'user@example.com',
      isLocalStorageAuth: true
    };
  }

  // Check if this is a mock token (for demo mode)
  if (token.startsWith('mock-auth-token-')) {
    console.log('Using mock authentication mode for save credentials');
    return {
      id: 'demo-user-id',
      email: 'demo@example.com',
      isMockAuth: true
    };
  }

  // Try Supabase authentication if configured
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.log('Supabase not configured, accepting any token in development mode for save credentials');
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
  console.log('Save eBay credentials handler called');
  console.log('Method:', event.httpMethod);

  // CORS headers
  const headers = getCorsHeaders(event);

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
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

    // Parse request body
    const { app_id, cert_id, dev_id } = JSON.parse(event.body);

    // Validate required fields
    if (!app_id || !cert_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'App ID and Cert ID are required' })
      };
    }

    console.log(`Saving credentials for user ${authUser.id}`);

    // For localStorage/mock/development auth, just return success without saving to database
    if (authUser.isLocalStorageAuth || authUser.isMockAuth || authUser.isDevelopmentAuth) {
      console.log('localStorage/demo mode - simulating credential save');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'eBay credentials saved successfully (localStorage mode)',
          user_id: authUser.id
        })
      };
    }

    // First, check if user record exists (use service key to bypass RLS)
    const existingUsers = await supabaseRequest(
      `users?id=eq.${authUser.id}`,
      'GET',
      null,
      {},
      true // Use service key
    );

    // Encrypt cert_id before storing
    const encryptedCertId = encrypt(cert_id);

    if (!existingUsers || existingUsers.length === 0) {
      // Create user record if it doesn't exist
      console.log('Creating new user record');
      await supabaseRequest(
        'users',
        'POST',
        {
          id: authUser.id,
          ebay_app_id: app_id,
          ebay_cert_id_encrypted: encryptedCertId,
          ebay_dev_id: dev_id || null
        },
        {},
        true // Use service key for protected table
      );
    } else {
      // Update existing user record
      console.log('Updating existing user record');

      // Check if App ID is changing (which would cause token mismatch)
      const existingAppId = existingUsers[0]?.ebay_app_id;
      const credentialsChanged = existingAppId && existingAppId !== app_id;

      if (credentialsChanged) {
        console.log('⚠️ App ID changed - clearing OAuth tokens to prevent mismatch');
        console.log(`Old App ID: ${existingAppId.substring(0, 20)}...`);
        console.log(`New App ID: ${app_id.substring(0, 20)}...`);
      }

      await supabaseRequest(
        `users?id=eq.${authUser.id}`,
        'PATCH',
        {
          ebay_app_id: app_id,
          ebay_cert_id_encrypted: encryptedCertId,
          ebay_dev_id: dev_id || null,
          // If credentials changed, clear OAuth tokens to force re-authorization
          ...(credentialsChanged && {
            ebay_refresh_token: null,
            ebay_connection_status: 'disconnected',
            ebay_connected_at: null,
            ebay_user_id: null
          })
        },
        {},
        true // Use service key for protected table
      );
    }

    console.log('Credentials saved successfully');

    // Check if we need to warn about reconnection
    const needsReconnect = existingUsers && existingUsers.length > 0 &&
                           existingUsers[0]?.ebay_app_id &&
                           existingUsers[0].ebay_app_id !== app_id;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: needsReconnect
          ? 'eBay credentials updated. Your eBay connection has been disconnected - please reconnect to continue using price reduction features.'
          : 'eBay credentials saved successfully',
        needsReconnect: needsReconnect
      })
    };
  } catch (error) {
    console.error('Error saving eBay credentials:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};