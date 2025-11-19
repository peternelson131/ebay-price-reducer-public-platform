// Test function to debug OAuth flow
const crypto = require('crypto');

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Helper function to make Supabase API calls
async function supabaseRequest(endpoint, method = 'GET', body = null, headers = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const options = {
    method,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
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
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    return null;
  }
}

exports.handler = async (event, context) => {
  console.log('Test OAuth Flow handler called');
  console.log('Method:', event.httpMethod);
  console.log('Query params:', event.queryStringParameters);

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    const { action } = event.queryStringParameters || {};
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const authUser = await getAuthUser(authHeader);

    if (action === 'test-env') {
      // Test environment variables
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          env: {
            hasSupabaseUrl: !!SUPABASE_URL,
            hasSupabaseAnonKey: !!SUPABASE_ANON_KEY,
            hasEbayAppId: !!process.env.EBAY_APP_ID,
            hasEbayCertId: !!process.env.EBAY_CERT_ID,
            hasEbayRedirectUri: !!process.env.EBAY_REDIRECT_URI,
            redirectUri: process.env.EBAY_REDIRECT_URI || 'Not set',
            hasEncryptionKey: !!process.env.ENCRYPTION_KEY
          }
        })
      };
    }

    if (action === 'test-state') {
      // Test creating and retrieving state from database
      if (!authUser) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Authentication required' })
        };
      }

      const testState = crypto.randomBytes(32).toString('hex');
      console.log('Creating test state:', testState);

      // Try to create state
      try {
        const created = await supabaseRequest(
          'oauth_states',
          'POST',
          {
            state: testState,
            user_id: authUser.id,
            created_at: new Date().toISOString()
          }
        );
        console.log('State created:', created);

        // Try to retrieve state
        const retrieved = await supabaseRequest(
          `oauth_states?state=eq.${testState}`,
          'GET'
        );
        console.log('State retrieved:', retrieved);

        // Clean up
        await supabaseRequest(
          `oauth_states?state=eq.${testState}`,
          'DELETE'
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'State creation and retrieval successful',
            created: created,
            retrieved: retrieved
          })
        };
      } catch (error) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'State operation failed',
            message: error.message,
            hint: 'Check if oauth_states table exists in Supabase'
          })
        };
      }
    }

    if (action === 'test-token-exchange') {
      // Test token exchange with eBay (simulated)
      const testCode = 'v^1.1#i^1#p^3#r^1...'; // Simulated auth code

      const tokenUrl = 'https://api.ebay.com/identity/v1/oauth2/token';
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code: testCode,
        redirect_uri: process.env.EBAY_REDIRECT_URI
      });

      console.log('Testing token exchange with:');
      console.log('- App ID:', process.env.EBAY_APP_ID ? 'Set' : 'Missing');
      console.log('- Cert ID:', process.env.EBAY_CERT_ID ? 'Set' : 'Missing');
      console.log('- Redirect URI:', process.env.EBAY_REDIRECT_URI);

      // We can't actually exchange a fake code, but we can test the setup
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Token exchange configuration',
          config: {
            tokenUrl: tokenUrl,
            hasAppId: !!process.env.EBAY_APP_ID,
            hasCertId: !!process.env.EBAY_CERT_ID,
            redirectUri: process.env.EBAY_REDIRECT_URI,
            authHeader: process.env.EBAY_APP_ID && process.env.EBAY_CERT_ID
              ? 'Basic auth configured'
              : 'Missing credentials'
          },
          note: 'Cannot test actual token exchange without valid authorization code from eBay'
        })
      };
    }

    if (action === 'test-full-flow') {
      // Generate test OAuth URL
      if (!authUser) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Authentication required' })
        };
      }

      const oauthState = crypto.randomBytes(32).toString('hex');

      // Store state
      await supabaseRequest(
        'oauth_states',
        'POST',
        {
          state: oauthState,
          user_id: authUser.id,
          created_at: new Date().toISOString()
        }
      );

      // Generate OAuth URL
      const ebayAuthUrl = `https://auth.ebay.com/oauth2/authorize?` +
        `client_id=${process.env.EBAY_APP_ID}&` +
        `response_type=code&` +
        `redirect_uri=${encodeURIComponent(process.env.EBAY_REDIRECT_URI)}&` +
        `scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account')}&` +
        `state=${oauthState}`;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'OAuth flow test initiated',
          authUrl: ebayAuthUrl,
          state: oauthState,
          redirectUri: process.env.EBAY_REDIRECT_URI,
          instructions: [
            '1. Open the authUrl in a browser',
            '2. Log in to eBay and authorize',
            '3. eBay will redirect to our callback handler',
            '4. Callback handler will exchange code for tokens',
            '5. Check the browser console and network tab for details'
          ]
        })
      };
    }

    // Default - show available tests
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'OAuth Flow Test Function',
        availableTests: {
          'test-env': 'Check environment variables',
          'test-state': 'Test state creation and retrieval (requires auth)',
          'test-token-exchange': 'Check token exchange configuration',
          'test-full-flow': 'Generate OAuth URL for manual testing (requires auth)'
        },
        usage: 'Add ?action=<test-name> to run a specific test'
      })
    };
  } catch (error) {
    console.error('Error in test OAuth flow:', error);
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