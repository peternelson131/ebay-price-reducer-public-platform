// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

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
    console.log('Auth failed: No bearer token in header');
    return null;
  }

  const token = authHeader.substring(7);

  // Check if this is a localStorage token
  if (token.startsWith('localStorage-auth-token-')) {
    console.log('Using localStorage authentication mode for test connection');
    return {
      id: 'local-user-1',
      email: 'user@example.com',
      isLocalStorageAuth: true
    };
  }

  // Check if this is a mock token (for demo mode)
  if (token.startsWith('mock-auth-token-')) {
    console.log('Using mock authentication mode for test connection');
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

// Simple eBay API test using OAuth 2.0
async function testEbayOAuthConnection(refreshToken) {
  try {
    console.log('Testing eBay OAuth connection with refresh token');

    // Get access token using refresh token
    const tokenUrl = 'https://api.ebay.com/identity/v1/oauth2/token';
    const authString = Buffer.from(`${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`).toString('base64');

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authString}`
      },
      body: new URLSearchParams({
        'grant_type': 'refresh_token',
        'refresh_token': refreshToken,
        'scope': 'https://api.ebay.com/oauth/api_scope/sell.inventory'
      })
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Failed to get access token:', error);
      return {
        success: false,
        message: 'Failed to get access token from refresh token',
        error: error
      };
    }

    const tokenData = await tokenResponse.json();
    console.log('Successfully got access token');

    // Now test the access token with a simple API call
    const apiResponse = await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item?limit=1', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('eBay API test response status:', apiResponse.status);

    if (apiResponse.ok) {
      const data = await apiResponse.json();
      return {
        success: true,
        message: 'eBay API connection successful',
        totalItems: data.total || 0,
        statusCode: apiResponse.status
      };
    } else {
      return {
        success: false,
        message: 'eBay API test failed',
        statusCode: apiResponse.status
      };
    }
  } catch (error) {
    console.error('Error testing eBay connection:', error);
    return {
      success: false,
      message: 'Connection test failed',
      error: error.message
    };
  }
}

exports.handler = async (event, context) => {
  console.log('Test eBay connection handler called');

  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    // Get authorization header
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const authUser = await getAuthUser(authHeader);

    if (!authUser) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
          message: 'Please provide a valid authentication token'
        })
      };
    }

    // For non-Supabase auth modes, return appropriate messages
    if (authUser.isLocalStorageAuth || authUser.isMockAuth || authUser.isDevelopmentAuth) {
      const mode = authUser.isLocalStorageAuth ? 'localStorage' :
                  authUser.isMockAuth ? 'demo' : 'development';

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Test connection successful (${mode} mode)`,
          ebayUserId: `${mode} User`,
          activeListings: mode === 'demo' ? 5 : 0,
          environment: {
            mode: mode,
            message: mode === 'localStorage' ?
              'Full eBay integration requires database setup with credentials' :
              mode === 'demo' ?
              'This is a simulated connection for demonstration' :
              'Supabase configuration required for production'
          },
          timestamp: new Date().toISOString()
        })
      };
    }

    // For real Supabase users, check if they have eBay credentials
    console.log('Checking eBay credentials for user:', authUser.id);

    try {
      // Get user's eBay credentials from database
      const userData = await supabaseRequest(
        `users?id=eq.${authUser.id}&select=ebay_refresh_token,ebay_user_id,ebay_app_id,ebay_cert_id,ebay_connection_status`,
        'GET',
        null,
        {},
        true // Use service key
      );

      if (!userData || userData.length === 0) {
        console.log('User not found in database');
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'User profile not found',
            needsSetup: true,
            timestamp: new Date().toISOString()
          })
        };
      }

      const user = userData[0];
      console.log('User eBay status:', user.ebay_connection_status);

      // Check if user has eBay credentials
      if (!user.ebay_app_id || !user.ebay_cert_id) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'eBay credentials not configured',
            needsCredentials: true,
            hint: 'Please add your eBay App ID and Cert ID in Admin Settings',
            timestamp: new Date().toISOString()
          })
        };
      }

      // Check if user has connected their eBay account (has refresh token)
      if (!user.ebay_refresh_token) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'eBay account not connected',
            hasCredentials: true,
            needsConnection: true,
            hint: 'Please click "Connect to eBay" to authorize your account',
            timestamp: new Date().toISOString()
          })
        };
      }

      // User has credentials and refresh token, let's test the connection
      console.log('Testing eBay API connection for user');

      // Set environment variables for the test (if not already set)
      if (!process.env.EBAY_APP_ID && user.ebay_app_id) {
        process.env.EBAY_APP_ID = user.ebay_app_id;
      }
      if (!process.env.EBAY_CERT_ID && user.ebay_cert_id) {
        process.env.EBAY_CERT_ID = user.ebay_cert_id;
      }

      const testResult = await testEbayOAuthConnection(user.ebay_refresh_token);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ...testResult,
          ebayUserId: user.ebay_user_id || 'Connected User',
          connectionStatus: user.ebay_connection_status,
          activeListings: testResult.totalItems || 0,
          timestamp: new Date().toISOString()
        })
      };

    } catch (dbError) {
      console.error('Database error:', dbError);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Database error while checking credentials',
          error: dbError.message,
          timestamp: new Date().toISOString()
        })
      };
    }

  } catch (error) {
    console.error('Test connection failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: 'Test connection failed',
        timestamp: new Date().toISOString()
      })
    };
  }
};