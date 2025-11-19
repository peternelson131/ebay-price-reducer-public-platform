/**
 * Debug endpoint to test eBay OAuth flow step by step
 * This helps us understand exactly where the flow is failing
 */

exports.handler = async (event, context) => {
  const { httpMethod, headers, queryStringParameters, body } = event;

  // Handle CORS preflight
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  // Only allow POST
  if (httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse request body
    const { action, ...params } = JSON.parse(body || '{}');

    console.log('Debug action:', action);
    console.log('Debug params:', params);

    let result = {};

    switch (action) {
      case 'test-token-exchange':
        result = await testTokenExchange(params);
        break;

      case 'test-api-with-token':
        result = await testApiWithToken(params);
        break;

      case 'get-stored-tokens':
        result = await getStoredTokens(params);
        break;

      default:
        result = { error: 'Unknown action: ' + action };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify(result, null, 2)
    };

  } catch (error) {
    console.error('Debug error:', error);
    console.error('Stack:', error.stack);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: error.message,
        stack: error.stack
      })
    };
  }
};

async function testTokenExchange({ code, client_id, client_secret, redirect_uri }) {
  try {
    console.log('Testing token exchange with provided credentials...');

    if (!code || !client_id || !client_secret || !redirect_uri) {
      return {
        success: false,
        error: 'Missing required parameters',
        required: ['code', 'client_id', 'client_secret', 'redirect_uri'],
        received: {
          code: !!code,
          client_id: !!client_id,
          client_secret: !!client_secret,
          redirect_uri: !!redirect_uri
        }
      };
    }

    const decodedCode = decodeURIComponent(code);
    const authCredentials = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

    const tokenParams = {
      grant_type: 'authorization_code',
      code: decodedCode,
      redirect_uri: redirect_uri
    };

    console.log('Token params:', tokenParams);

    const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authCredentials}`
      },
      body: new URLSearchParams(tokenParams)
    });

    const responseText = await response.text();
    let data;

    try {
      data = JSON.parse(responseText);
    } catch (e) {
      return {
        success: false,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        rawResponse: responseText,
        parseError: e.message
      };
    }

    return {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data: data,
      analysis: {
        has_access_token: !!data.access_token,
        has_refresh_token: !!data.refresh_token,
        token_type: data.token_type,
        expires_in: data.expires_in,
        refresh_token_expires_in: data.refresh_token_expires_in,
        error: data.error,
        error_description: data.error_description
      }
    };
  } catch (error) {
    console.error('testTokenExchange error:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

async function testApiWithToken({ access_token }) {
  console.log('Testing various eBay API endpoints with token...');

  const results = [];

  // Test 1: User consent status (simplest endpoint)
  try {
    const response = await fetch('https://api.ebay.com/sell/compliance/v1/listing_violation_summary', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = text;
    }

    results.push({
      endpoint: '/sell/compliance/v1/listing_violation_summary',
      status: response.status,
      statusText: response.statusText,
      success: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
      data: data
    });
  } catch (error) {
    results.push({
      endpoint: '/sell/compliance/v1/listing_violation_summary',
      error: error.message
    });
  }

  // Test 2: Seller privileges
  try {
    const response = await fetch('https://api.ebay.com/sell/account/v1/privilege', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = text;
    }

    results.push({
      endpoint: '/sell/account/v1/privilege',
      status: response.status,
      statusText: response.statusText,
      success: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
      data: data
    });
  } catch (error) {
    results.push({
      endpoint: '/sell/account/v1/privilege',
      error: error.message
    });
  }

  // Test 3: Try Inventory API (what we actually need)
  try {
    const response = await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item?limit=1', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = text;
    }

    results.push({
      endpoint: '/sell/inventory/v1/inventory_item',
      status: response.status,
      statusText: response.statusText,
      success: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
      data: data
    });
  } catch (error) {
    results.push({
      endpoint: '/sell/inventory/v1/inventory_item',
      error: error.message
    });
  }

  return {
    token_provided: !!access_token,
    token_length: access_token?.length,
    token_prefix: access_token?.substring(0, 20) + '...',
    test_results: results
  };
}

async function getStoredTokens({ user_id }) {
  return {
    error: 'This function requires Supabase environment variables to be set in Netlify.',
    note: 'Please check tokens using the main application or set SUPABASE_URL and SUPABASE_ANON_KEY in Netlify environment variables.'
  };
}