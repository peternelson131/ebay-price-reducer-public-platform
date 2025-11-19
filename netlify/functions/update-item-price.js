const { Handler } = require('@netlify/functions');
const { EbayApiClient } = require('./utils/ebay-api-client');
const { createClient } = require('@supabase/supabase-js');

const handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
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

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: 'Method not allowed',
        message: 'Only POST requests are supported'
      })
    };
  }

  try {
    // Get authorization header
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
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

    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');
    const { itemId, newPrice } = requestBody;

    // Validate required parameters
    if (!itemId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required parameter',
          message: 'itemId is required'
        })
      };
    }

    if (!newPrice || isNaN(parseFloat(newPrice))) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid price',
          message: 'newPrice must be a valid number'
        })
      };
    }

    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Verify user authentication
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Invalid authentication token',
          message: 'Please log in again'
        })
      };
    }

    // Initialize eBay client
    const ebayClient = new EbayApiClient(user.id);

    try {
      await ebayClient.initialize();
    } catch (initError) {
      if (initError.code === 'NOT_CONNECTED') {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'eBay account not connected',
            message: 'Please connect your eBay account first',
            redirectTo: '/ebay-setup'
          })
        };
      }
      throw initError;
    }

    // Format price properly (2 decimal places)
    const formattedPrice = parseFloat(newPrice).toFixed(2);

    // Update item price using ReviseItem API
    const response = await ebayClient.updateItemPrice(itemId, formattedPrice);

    // Check for eBay API errors in response
    if (response && response.Ack && response.Ack !== 'Success') {
      const errorMessage = response.Errors
        ? (Array.isArray(response.Errors) ? response.Errors[0].LongMessage : response.Errors.LongMessage)
        : 'Unknown eBay API error';

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'eBay API Error',
          message: errorMessage,
          ebayResponse: response
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Successfully updated price for item ${itemId}`,
        itemId: itemId,
        newPrice: formattedPrice,
        ebayResponse: {
          ack: response.Ack,
          timestamp: response.Timestamp,
          itemId: response.ItemID
        },
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Failed to update item price:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: 'Failed to update item price',
        timestamp: new Date().toISOString()
      })
    };
  }
};

module.exports = { handler };