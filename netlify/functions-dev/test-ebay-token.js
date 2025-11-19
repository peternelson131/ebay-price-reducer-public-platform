/**
 * Test function to debug eBay token exchange
 * This will help us see exactly what eBay returns
 */

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { code, client_id, client_secret, redirect_uri } = JSON.parse(event.body);

    if (!code || !client_id || !client_secret || !redirect_uri) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Missing required parameters',
          required: ['code', 'client_id', 'client_secret', 'redirect_uri']
        })
      };
    }

    console.log('Testing eBay token exchange...');
    console.log('Code length:', code.length);
    console.log('Redirect URI:', redirect_uri);

    // Test 1: With URL decoding
    const decodedCode = decodeURIComponent(code);
    const authCredentials = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

    console.log('Code decoded?', code !== decodedCode);

    // Prepare request - NO scope parameter per eBay docs
    const tokenParams = {
      grant_type: 'authorization_code',
      code: decodedCode,
      redirect_uri: redirect_uri
    };

    console.log('Request params:', {
      grant_type: tokenParams.grant_type,
      code: tokenParams.code.substring(0, 20) + '...',
      redirect_uri: tokenParams.redirect_uri
    });

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
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to parse eBay response',
          response: responseText
        })
      };
    }

    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data));

    // Return the full response for analysis
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: response.ok,
        status: response.status,
        data: data,
        analysis: {
          has_access_token: !!data.access_token,
          has_refresh_token: !!data.refresh_token,
          token_type: data.token_type,
          expires_in: data.expires_in,
          refresh_token_expires_in: data.refresh_token_expires_in,
          all_properties: Object.keys(data),
          code_was_decoded: code !== decodedCode
        }
      }, null, 2)
    };

  } catch (error) {
    console.error('Test error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Test failed',
        message: error.message
      })
    };
  }
};