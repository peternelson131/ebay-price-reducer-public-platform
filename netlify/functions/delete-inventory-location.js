const { getCorsHeaders } = require('./utils/cors');
const { createClient } = require('@supabase/supabase-js');
const { EbayInventoryClient } = require('./utils/ebay-inventory-client');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Delete inventory location to allow creating a new one with different address
 * WARNING: Only works if no active inventory items are using this location
 */
exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'DELETE') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed. Use DELETE.' })
    };
  }

  try {
    // Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    // Initialize eBay client
    const ebayClient = new EbayInventoryClient(user.id);
    await ebayClient.initialize();

    // Generate the same merchant location key used in create-listing
    const merchantLocationKey = `loc-${user.id.substring(0, 32)}`;

    console.log(`Attempting to delete inventory location: ${merchantLocationKey}`);

    // Try to delete the location
    const result = await ebayClient.deleteInventoryLocation(merchantLocationKey);

    if (result.deleted) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Inventory location deleted successfully',
          merchantLocationKey,
          note: 'You can now create a new listing with your updated address'
        })
      };
    } else if (result.notFound) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Location not found (may already be deleted)',
          merchantLocationKey
        })
      };
    } else {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Unknown result from delete operation',
          result
        })
      };
    }

  } catch (error) {
    console.error('Delete location error:', error);

    // Check if it's an eBay error about active inventory
    if (error.ebayErrorResponse?.errors?.[0]?.message?.includes('active')) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Cannot delete location - active inventory items are using it',
          solution: 'End all active listings first, then try again',
          ebayError: error.message
        })
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message,
        details: 'Failed to delete inventory location'
      })
    };
  }
};
