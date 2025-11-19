const { supabase } = require('./utils/supabase');
const { EbayApiClient } = require('./utils/ebay-api-client');

/**
 * End a listing on eBay
 * This closes the listing on eBay and updates the database status to 'Ended'
 *
 * @param {Object} event - Netlify function event
 * @returns {Object} Response with status and message
 */
exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Get user from authorization header
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Missing or invalid authorization header' })
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid or expired token' })
      };
    }

    // Parse request body
    const { listingId } = JSON.parse(event.body || '{}');

    if (!listingId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing listingId in request body' })
      };
    }

    // Get listing from database
    const { data: listing, error: fetchError } = await supabase
      .from('listings')
      .select('id, ebay_item_id, title, quantity, listing_status')
      .eq('id', listingId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !listing) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Listing not found or does not belong to user' })
      };
    }

    // Allow closing if:
    // 1. Quantity is 0 (sold out), OR
    // 2. Listing status is 'Ended' (already ended on eBay)
    if (listing.quantity !== 0 && listing.listing_status !== 'Ended') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Can only close sold-out (quantity=0) or already-ended listings. Current quantity: ' + listing.quantity + ', status: ' + listing.listing_status
        })
      };
    }

    // Initialize eBay API client
    const ebayClient = new EbayApiClient(user.id);
    await ebayClient.initialize();

    // End the listing on eBay
    try {
      const endResponse = await ebayClient.endListing(listing.ebay_item_id, 'NotAvailable');

      console.log(`Successfully ended listing ${listing.ebay_item_id} on eBay:`, endResponse);

      // Update database to mark listing as Ended AND hidden (manually closed)
      const { error: updateError } = await supabase
        .from('listings')
        .update({
          listing_status: 'Ended',
          hidden: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', listingId)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Failed to update listing status in database:', updateError);
        // Don't fail the request - listing was ended on eBay successfully
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'Listing ended successfully on eBay',
          listing: {
            id: listing.id,
            title: listing.title,
            ebay_item_id: listing.ebay_item_id
          }
        })
      };

    } catch (ebayError) {
      console.error('eBay API error when ending listing:', ebayError);
      const errorMsg = ebayError.message || '';

      // Check if listing is already ended or no longer exists
      // eBay error codes/messages for already-ended listings:
      // - "The auction has already been closed"
      // - "Item status is invalid"
      // - "already ended"
      // - "The item is closed"
      const isAlreadyClosed =
        errorMsg.toLowerCase().includes('already') ||
        errorMsg.toLowerCase().includes('closed') ||
        errorMsg.toLowerCase().includes('ended') ||
        errorMsg.toLowerCase().includes('invalid') ||
        errorMsg.toLowerCase().includes('not exist') ||
        errorMsg.toLowerCase().includes('not found');

      if (isAlreadyClosed) {
        // Update database anyway - treat as success, mark as hidden (manually closed)
        await supabase
          .from('listings')
          .update({
            listing_status: 'Ended',
            hidden: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', listingId)
          .eq('user_id', user.id);

        console.log(`✅ Listing ${listing.ebay_item_id} was already ended on eBay, updated database`);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            message: 'Listing was already ended on eBay (marked as ended in database)',
            listing: {
              id: listing.id,
              title: listing.title,
              ebay_item_id: listing.ebay_item_id
            }
          })
        };
      }

      // Different error - return as failure
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Failed to end listing on eBay',
          message: ebayError.message,
          ebay_item_id: listing.ebay_item_id
        })
      };
    }

  } catch (error) {
    console.error('Unexpected error in end-listing function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error: ' + error.message })
    };
  }
};
