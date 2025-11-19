const { Handler } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { EbayApiClient } = require('./utils/ebay-api-client');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
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

    // Fetch listings from eBay using user's credentials
    const ebayResponse = await ebayClient.getActiveListings(1, 200);

    let syncedCount = 0;
    let errorCount = 0;
    const errors = [];

    // Get existing listings to preserve manual 'Ended' status, minimum_price, and track deletions
    const { data: existingListings } = await supabase
      .from('listings')
      .select('ebay_item_id, listing_status, minimum_price')
      .eq('user_id', user.id);

    const ebayItemIds = []; // Track eBay item IDs from sync

    if (ebayResponse.ActiveList?.ItemArray?.Item) {
      const items = Array.isArray(ebayResponse.ActiveList.ItemArray.Item)
        ? ebayResponse.ActiveList.ItemArray.Item
        : [ebayResponse.ActiveList.ItemArray.Item];

      for (const item of items) {
        try {
          // Track this item ID
          ebayItemIds.push(item.ItemID);

          // Parse price data
          const priceData = item.SellingStatus?.CurrentPrice;
          const currentPriceRaw = priceData?._ || priceData;
          const currentPrice = parseFloat(currentPriceRaw);
          const currency = priceData?.currencyID || 'USD';
          const quantity = parseInt(item.Quantity) || 0;

          // Validate price - skip if invalid
          if (!currentPriceRaw || isNaN(currentPrice) || currentPrice <= 0) {
            errors.push(`Item ${item.ItemID}: Invalid price (${currentPriceRaw})`);
            errorCount++;
            continue;
          }

          // Get start price for original_price
          const startPriceRaw = item.StartPrice?._ || item.StartPrice || item.BuyItNowPrice?._ || item.BuyItNowPrice;
          const originalPrice = parseFloat(startPriceRaw) || currentPrice;

          // Determine listing status
          let listing_status = 'Active';
          if (quantity === 0) {
            listing_status = 'Ended'; // Auto-mark sold-out as Ended
          }

          // Preserve manual 'Ended' status if it was manually set
          const existingStatus = existingListings?.find(l => l.ebay_item_id === item.ItemID)?.listing_status;
          if (existingStatus === 'Ended') {
            listing_status = 'Ended';
          }

          // Get existing listing to preserve minimum_price if it exists
          const existingListing = existingListings?.find(l => l.ebay_item_id === item.ItemID);

          // Calculate minimum price (default to 70% of current price if not set)
          const minimumPrice = existingListing?.minimum_price || (currentPrice * 0.7);

          // Upsert listing to database
          const { error: upsertError } = await supabase
            .from('listings')
            .upsert({
              user_id: user.id,
              ebay_item_id: item.ItemID,
              title: item.Title,
              current_price: currentPrice,
              original_price: originalPrice,
              minimum_price: minimumPrice,
              currency: currency,
              quantity: quantity,
              listing_status: listing_status,
              listing_type: item.ListingType,
              category_id: item.PrimaryCategory?.CategoryID,
              category_name: item.PrimaryCategory?.CategoryName,
              end_time: item.EndTime,
              watch_count: parseInt(item.WatchCount) || 0,
              hit_count: parseInt(item.HitCount) || 0,
              listing_url: item.ListingDetails?.ViewItemURL,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'user_id,ebay_item_id'
            });

          if (upsertError) {
            errors.push(`Item ${item.ItemID}: ${upsertError.message}`);
            errorCount++;
          } else {
            syncedCount++;
          }
        } catch (itemError) {
          errors.push(`Item ${item.ItemID}: ${itemError.message}`);
          errorCount++;
        }
      }
    }

    // Mark listings as 'Ended' if they were in our DB but NOT returned by eBay
    if (ebayItemIds.length > 0 && existingListings && existingListings.length > 0) {
      const missingListings = existingListings.filter(
        existing => existing.ebay_item_id && !ebayItemIds.includes(existing.ebay_item_id)
      );

      if (missingListings.length > 0) {
        console.log(`📦 Found ${missingListings.length} listings deleted from eBay, marking as Ended...`);

        const activeToEnd = missingListings.filter(l => l.listing_status === 'Active');

        if (activeToEnd.length > 0) {
          const itemIdsToEnd = activeToEnd.map(l => l.ebay_item_id);

          const { error: updateError } = await supabase
            .from('listings')
            .update({
              listing_status: 'Ended',
              quantity: 0,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .in('ebay_item_id', itemIdsToEnd);

          if (updateError) {
            console.error(`⚠️ Failed to mark deleted listings as Ended:`, updateError);
            errors.push(`Failed to mark deleted listings: ${updateError.message}`);
            errorCount++;
          } else {
            console.log(`✅ Marked ${activeToEnd.length} deleted listings as Ended`);
          }
        }
      }
    }

    // Log sync results to console (sync_errors table removed)
    console.log('Sync operation completed:', {
      user_id: user.id,
      operation: 'sync_listings',
      success_count: syncedCount,
      error_count: errorCount,
      errors: errors.slice(0, 10),
      timestamp: new Date().toISOString()
    });

    if (errorCount > 0) {
      console.error('Sync errors encountered:', errors.slice(0, 10));
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        syncedCount,
        errorCount,
        errors: errors.slice(0, 5), // Return first 5 errors
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Sync failed:', error);

    // Log critical error to console (sync_errors table removed)
    console.error('Critical sync error:', {
      user_id: user?.id || 'unknown',
      operation: 'sync_listings',
      success_count: 0,
      error_count: 1,
      errors: [error.message],
      timestamp: new Date().toISOString()
    });

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

module.exports = { handler };