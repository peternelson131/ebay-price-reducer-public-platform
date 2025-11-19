const { createClient } = require('@supabase/supabase-js');
const { EbayApiClient } = require('./utils/ebay-api-client');
const { TokenError } = require('./utils/ebay-token-service');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // 1. Validate Supabase JWT (standard pattern)
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: 'Unauthorized',
          code: 'NO_AUTH_TOKEN'
        })
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    const user = userData?.user;

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: 'Invalid token',
          code: 'INVALID_AUTH_TOKEN'
        })
      };
    }

    console.log(`📥 Manual sync triggered for user: ${user.email}`);

    // 2. Initialize eBay client (handles token refresh automatically)
    const ebayClient = new EbayApiClient(user.id);
    await ebayClient.initialize();

    // 3. Fetch ALL listings from eBay with pagination
    console.log('📥 Fetching listings from eBay with pagination...');
    const allListings = [];
    const entriesPerPage = 200; // Maximum allowed by eBay
    let currentPage = 1;
    let totalPages = 1;
    let totalEntries = 0;
    const startTime = Date.now();

    do {
      console.log(`📄 Fetching page ${currentPage}...`);

      const ebayData = await ebayClient.getActiveListings(currentPage, entriesPerPage);

      // Extract pagination metadata on first page
      if (currentPage === 1) {
        const paginationResult = ebayData.ActiveList?.PaginationResult;
        totalPages = parseInt(paginationResult?.TotalNumberOfPages || 1);
        totalEntries = parseInt(paginationResult?.TotalNumberOfEntries || 0);
        console.log(`📊 Total listings: ${totalEntries}, Total pages: ${totalPages}`);

        // Debug: Log first listing's image structure
        const firstPageItems = ebayData.ActiveList?.ItemArray?.Item || [];
        const normalizedFirstPage = Array.isArray(firstPageItems) ? firstPageItems : [firstPageItems];
        if (normalizedFirstPage.length > 0) {
          console.log('📸 First listing image debug:', {
            hasPictureDetails: !!normalizedFirstPage[0].PictureDetails,
            pictureDetailsKeys: normalizedFirstPage[0].PictureDetails ? Object.keys(normalizedFirstPage[0].PictureDetails) : [],
            fullPictureDetails: normalizedFirstPage[0].PictureDetails
          });
        }
      }

      // Extract and accumulate listings
      const pageListings = ebayData.ActiveList?.ItemArray?.Item || [];
      const normalizedListings = Array.isArray(pageListings) ? pageListings : [pageListings];
      allListings.push(...normalizedListings);

      console.log(`✓ Page ${currentPage}/${totalPages} - ${normalizedListings.length} items (${allListings.length}/${totalEntries} total)`);

      // Safety check: prevent infinite loops
      if (currentPage >= 125) {
        console.warn('⚠️ Reached maximum page limit (125 pages / 25,000 listings)');
        break;
      }

      // Safety check: function execution time (20 second safety margin for 26s timeout)
      const executionTime = Date.now() - startTime;
      if (executionTime > 20000) {
        console.warn('⚠️ Approaching function timeout, stopping pagination');
        break;
      }

      currentPage++;

      // Rate limiting: Small delay between pages
      if (currentPage <= totalPages) {
        await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
      }

    } while (currentPage <= totalPages);

    const listings = allListings;
    console.log(`✅ Fetched ${listings.length} listings across ${currentPage - 1} page(s) in ${(Date.now() - startTime) / 1000}s`);

    if (listings.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No listings found in eBay account',
          count: 0
        })
      };
    }

    // 4. Get existing listings to preserve manual 'Ended' status and minimum_price
    const { data: existingListings } = await supabase
      .from('listings')
      .select('ebay_item_id, listing_status, minimum_price')
      .eq('user_id', user.id);

    // Create maps of existing statuses and minimum prices
    const existingStatusMap = new Map();
    const existingMinPriceMap = new Map();
    if (existingListings) {
      existingListings.forEach(listing => {
        existingStatusMap.set(listing.ebay_item_id, listing.listing_status);
        existingMinPriceMap.set(listing.ebay_item_id, listing.minimum_price);
      });
    }

    // 5. Prepare listings for upsert (simplified format from Trading API)
    const listingsToUpsert = listings.map(item => {
      // Extract image URLs - handle both single URL and array of URLs
      let imageUrls = [];
      if (item.PictureDetails?.PictureURL) {
        imageUrls = Array.isArray(item.PictureDetails.PictureURL)
          ? item.PictureDetails.PictureURL
          : [item.PictureDetails.PictureURL];
      } else if (item.PictureDetails?.GalleryURL) {
        // GalleryURL is inside PictureDetails
        imageUrls = Array.isArray(item.PictureDetails.GalleryURL)
          ? item.PictureDetails.GalleryURL
          : [item.PictureDetails.GalleryURL];
      } else if (item.PictureURL) {
        // Sometimes it's directly on the item
        imageUrls = Array.isArray(item.PictureURL) ? item.PictureURL : [item.PictureURL];
      } else if (item.GalleryURL) {
        // Fallback to gallery image directly on item
        imageUrls = [item.GalleryURL];
      }

      // Extract quantity
      const quantity = parseInt(item.Quantity) || 0;

      // Determine listing status from eBay
      let ebayStatus = item.SellingStatus?.ListingStatus || 'Active';

      // Map eBay status to our status
      let listing_status = ebayStatus;

      // Auto-mark sold-out listings as 'Ended' regardless of eBay status
      if (quantity === 0) {
        listing_status = 'Ended';
      }

      // Preserve manual 'Ended' status if it was manually set
      const existingStatus = existingStatusMap.get(item.ItemID);
      if (existingStatus === 'Ended') {
        listing_status = 'Ended';
      }

      // Parse prices
      const currentPriceRaw = item.SellingStatus?.CurrentPrice?._ || item.SellingStatus?.CurrentPrice;
      const current_price = parseFloat(currentPriceRaw) || 0;
      const originalPriceRaw = item.StartPrice?._ || item.StartPrice || currentPriceRaw;
      const original_price = parseFloat(originalPriceRaw) || current_price;

      // Preserve existing minimum_price or default to 70% of current price
      const existingMinPrice = existingMinPriceMap.get(item.ItemID);
      const minimum_price = existingMinPrice || (current_price * 0.7);

      return {
        user_id: user.id,
        ebay_item_id: item.ItemID,
        sku: item.SKU || null,
        title: item.Title,
        description: item.Description || null,
        current_price: current_price,
        original_price: original_price,
        minimum_price: minimum_price,
        currency: item.SellingStatus?.CurrentPrice?.currencyID || 'USD',
        quantity: quantity,
        quantity_available: parseInt(item.QuantityAvailable || item.Quantity) || 0,
        image_urls: imageUrls,
        primary_image_url: imageUrls[0] || null,
        condition: item.ConditionDisplayName || 'Used',
        category_id: item.PrimaryCategory?.CategoryID || null,
        category: item.PrimaryCategory?.CategoryName || null,
        listing_status: listing_status,
        listing_format: item.ListingType || 'FixedPriceItem',
        start_time: item.ListingDetails?.StartTime || null,
        end_time: item.ListingDetails?.EndTime || null,
        view_count: parseInt(item.HitCount) || 0,
        watch_count: parseInt(item.WatchCount) || 0,
        hit_count: parseInt(item.HitCount) || 0,
        listing_url: item.ListingDetails?.ViewItemURL || `https://www.ebay.com/itm/${item.ItemID}`,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    });

    // 6. Upsert to database
    const { data, error } = await supabase
      .from('listings')
      .upsert(listingsToUpsert, {
        onConflict: 'user_id,ebay_item_id',
        ignoreDuplicates: false
      });

    if (error) {
      console.error('❌ Failed to upsert listings:', error);
      throw error;
    }

    console.log(`✅ Successfully synced ${listingsToUpsert.length} listings to database`);

    // 6b. Mark listings as 'Ended' if they were in our DB but NOT returned by eBay
    // (This handles listings deleted on eBay)
    const ebayItemIds = listings.map(item => item.ItemID).filter(id => id);

    if (ebayItemIds.length > 0 && existingListings && existingListings.length > 0) {
      // Find listings in DB that weren't in eBay response
      const missingListings = existingListings.filter(
        existing => existing.ebay_item_id && !ebayItemIds.includes(existing.ebay_item_id)
      );

      if (missingListings.length > 0) {
        console.log(`📦 Found ${missingListings.length} listings deleted from eBay, marking as Ended...`);

        // Only mark as Ended if they were previously Active
        const activeToEnd = missingListings.filter(l => l.listing_status === 'Active');

        if (activeToEnd.length > 0) {
          const itemIdsToEnd = activeToEnd.map(l => l.ebay_item_id);

          const { error: updateError } = await supabase
            .from('listings')
            .update({
              listing_status: 'Ended',
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)
            .in('ebay_item_id', itemIdsToEnd);

          if (updateError) {
            console.error(`⚠️ Failed to mark deleted listings as Ended:`, updateError);
          } else {
            console.log(`✅ Marked ${activeToEnd.length} deleted listings as Ended`);
          }
        }
      }
    }

    // 7. Trigger competitive pricing analysis for newly synced listings
    try {
      console.log('🔍 Triggering competitive pricing analysis...');

      // Import the analysis handler directly and invoke it
      const { handler: analyzeHandler } = require('./analyze-competitive-pricing');

      // Call analysis in background (don't await to avoid blocking)
      analyzeHandler(
        {
          httpMethod: 'POST',
          headers: event.headers,
          body: null
        },
        context
      ).then(result => {
        console.log('✅ Pricing analysis triggered:', result.statusCode);
      }).catch(err => {
        console.error('❌ Failed to trigger pricing analysis:', err.message);
      });

    } catch (analysisError) {
      console.error('❌ Error triggering pricing analysis:', analysisError);
      // Don't fail the sync if analysis fails
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Sync completed successfully',
        count: listingsToUpsert.length,
        pricingAnalysisTriggered: true,
        listings: listingsToUpsert.map(l => ({
          sku: l.sku,
          title: l.title,
          price: l.current_price,
          views: l.view_count,
          watchers: l.watch_count
        }))
      })
    };

  } catch (error) {
    console.error('Sync failed:', error);

    // Handle TokenError with detailed error response (standard pattern)
    if (error instanceof TokenError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: error.message,
          code: error.code,
          action: error.action
        })
      };
    }

    // Handle other errors
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Sync failed',
        message: error.message,
        code: 'UNKNOWN_ERROR'
      })
    };
  }
};
