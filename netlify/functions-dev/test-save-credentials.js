// Test version of save-ebay-credentials that doesn't require auth

exports.handler = async (event, context) => {
  console.log('Test save credentials handler called');
  console.log('Method:', event.httpMethod);
  console.log('Headers:', Object.keys(event.headers));

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
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

  // Test endpoint to check environment
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Test save credentials function is working',
        env: {
          hasSupabaseUrl: !!process.env.SUPABASE_URL,
          hasSupabaseAnonKey: !!process.env.SUPABASE_ANON_KEY,
          hasSupabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          hasEbayAppId: !!process.env.EBAY_APP_ID,
          hasEbayCertId: !!process.env.EBAY_CERT_ID,
          hasEbayRedirectUri: !!process.env.EBAY_REDIRECT_URI
        },
        timestamp: new Date().toISOString()
      })
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
    // Parse request body
    const body = event.body ? JSON.parse(event.body) : {};
    console.log('Request body:', body);

    const { app_id, cert_id, dev_id } = body;

    // Validate required fields
    if (!app_id || !cert_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'App ID and Cert ID are required',
          received: { app_id: !!app_id, cert_id: !!cert_id, dev_id: !!dev_id }
        })
      };
    }

    // For testing, just return success without actually saving
    console.log('Test mode: Would save credentials:', {
      app_id: app_id.substring(0, 10) + '...',
      cert_id: cert_id.substring(0, 10) + '...',
      dev_id: dev_id ? dev_id.substring(0, 10) + '...' : null
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Test mode: Credentials would be saved',
        data: {
          app_id: app_id.substring(0, 10) + '...',
          cert_id: cert_id.substring(0, 10) + '...',
          dev_id: dev_id ? dev_id.substring(0, 10) + '...' : null
        }
      })
    };
  } catch (error) {
    console.error('Error in test save credentials:', error);
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