/**
 * Update Price via Trading API
 * 
 * Task 4: Update listing price using eBay Trading API (XML)
 * - Build ReviseFixedPriceItem XML
 * - Call Trading API to update price
 * - Update DB after success
 */

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { getValidAccessToken } = require('./utils/ebay-oauth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Environment detection
const IS_SANDBOX = process.env.EBAY_ENVIRONMENT === 'sandbox';
const TRADING_API_URL = IS_SANDBOX
  ? 'https://api.sandbox.ebay.com/ws/api.dll'
  : 'https://api.ebay.com/ws/api.dll';

const COMPATIBILITY_LEVEL = 967;

/**
 * Build ReviseFixedPriceItem XML request
 */
function buildReviseFixedPriceItemRequest(itemId, newPrice) {
  return `<?xml version="1.0" encoding="utf-8"?>
<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <ItemID>${itemId}</ItemID>
    <StartPrice>${newPrice.toFixed(2)}</StartPrice>
  </Item>
</ReviseFixedPriceItemRequest>`;
}

/**
 * Parse ReviseFixedPriceItem response
 */
function parseReviseResponse(xmlText) {
  // Check for Ack
  const ackMatch = xmlText.match(/<Ack>([^<]+)<\/Ack>/);
  const ack = ackMatch ? ackMatch[1] : 'Unknown';
  
  // Check for errors
  const errorMatch = xmlText.match(/<ShortMessage>([^<]+)<\/ShortMessage>/);
  const longErrorMatch = xmlText.match(/<LongMessage>([^<]+)<\/LongMessage>/);
  
  // Extract item ID
  const itemIdMatch = xmlText.match(/<ItemID>([^<]+)<\/ItemID>/);
  
  // Extract fees if any
  const feesMatch = xmlText.match(/<TotalFee[^>]*>([^<]+)<\/TotalFee>/);
  
  return {
    success: ack === 'Success' || ack === 'Warning',
    ack,
    itemId: itemIdMatch ? itemIdMatch[1] : null,
    error: ack === 'Failure' ? (longErrorMatch?.[1] || errorMatch?.[1] || 'Unknown error') : null,
    fees: feesMatch ? parseFloat(feesMatch[1]) : 0
  };
}

/**
 * Call Trading API to revise item
 */
async function callTradingApi(accessToken, requestXml) {
  const response = await fetch(TRADING_API_URL, {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'ReviseFixedPriceItem',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': String(COMPATIBILITY_LEVEL),
      'X-EBAY-API-IAF-TOKEN': accessToken,
      'Content-Type': 'text/xml'
    },
    body: requestXml
  });
  
  const responseText = await response.text();
  
  if (!response.ok) {
    console.error('Trading API HTTP error:', response.status, responseText.substring(0, 500));
    throw new Error(`Trading API HTTP error: ${response.status}`);
  }
  
  return parseReviseResponse(responseText);
}

/**
 * Update listing price in eBay via Trading API
 * Exported for use by other functions (e.g., process-price-reductions)
 */
async function updatePriceTradingApi(accessToken, listing, newPrice) {
  if (!listing.ebay_item_id) {
    throw new Error('Listing has no ebay_item_id');
  }
  
  console.log(`📝 Updating Trading API listing ${listing.ebay_item_id} to $${newPrice}`);
  
  const requestXml = buildReviseFixedPriceItemRequest(listing.ebay_item_id, newPrice);
  const result = await callTradingApi(accessToken, requestXml);
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to update price');
  }
  
  return result;
}

exports.updatePriceTradingApi = updatePriceTradingApi;

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    console.log('💰 update-price-trading-api started');
    console.log(`Environment: ${IS_SANDBOX ? 'SANDBOX' : 'PRODUCTION'}`);

    // Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    console.log(`✅ User authenticated: ${user.id}`);

    // Parse request body
    const { listingId, newPrice } = JSON.parse(event.body);
    
    if (!listingId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'listingId is required' })
      };
    }
    
    if (typeof newPrice !== 'number' || newPrice <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'newPrice must be a positive number' })
      };
    }

    // Get the listing from database
    const { data: listing, error: fetchError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !listing) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Listing not found' })
      };
    }

    if (!listing.ebay_item_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Listing has no eBay Item ID' })
      };
    }

    if (listing.source !== 'trading_api') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'This function is for Trading API listings only',
          source: listing.source
        })
      };
    }

    // Check minimum price
    if (listing.minimum_price && newPrice < listing.minimum_price) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'New price is below minimum price',
          minimumPrice: listing.minimum_price,
          requestedPrice: newPrice
        })
      };
    }

    // Get valid eBay access token
    const accessToken = await getValidAccessToken(supabase, user.id);
    console.log('✅ Got valid eBay access token');

    // Update price on eBay
    const result = await updatePriceTradingApi(accessToken, listing, newPrice);
    console.log('✅ Price updated on eBay:', result);

    // Update price in database
    const { error: updateError } = await supabase
      .from('listings')
      .update({
        current_price: newPrice,
        last_price_reduction: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', listingId);

    if (updateError) {
      console.error('Warning: Failed to update DB after eBay update:', updateError);
      // Don't fail - eBay was updated successfully
    }

    // Log price reduction
    try {
      await supabase.from('price_reduction_log').insert({
        listing_id: listingId,
        user_id: user.id,
        ebay_item_id: listing.ebay_item_id || listing.ebay_listing_id || 'unknown',
        sku: listing.ebay_sku,
        title: listing.title,
        original_price: listing.current_price,
        reduced_price: newPrice,
        reduction_amount: listing.current_price - newPrice,
        reduction_percentage: ((listing.current_price - newPrice) / listing.current_price * 100).toFixed(2),
        reduction_type: 'manual',
        reduction_method: 'dollar', // Manual updates are explicit dollar amounts
        triggered_by: user.id,
        created_at: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Failed to log price reduction:', e.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        environment: IS_SANDBOX ? 'sandbox' : 'production',
        listing: {
          id: listingId,
          ebay_item_id: listing.ebay_item_id,
          oldPrice: listing.current_price,
          newPrice: newPrice
        },
        fees: result.fees
      })
    };

  } catch (error) {
    console.error('❌ update-price-trading-api error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to update price',
        message: error.message
      })
    };
  }
};
