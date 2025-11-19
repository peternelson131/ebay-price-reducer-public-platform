const { Handler } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');
const { EbayApiClient } = require('./utils/ebay-api-client');
const { getCorsHeaders } = require('./utils/cors');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Manual trigger for price reduction (for testing)
 * This bypasses the time check and runs immediately
 */
const handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Require authentication
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

  const now = new Date();
  console.log('🔧 Manual price reduction triggered at', now.toISOString());
  console.log('👤 Triggered by user:', user.email);

  try {
    // Get all users with eBay connections (or just current user if specified)
    const queryParams = event.queryStringParameters || {};
    const currentUserOnly = queryParams.currentUserOnly === 'true';

    let users;
    if (currentUserOnly) {
      // Only process current authenticated user
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, email')
        .eq('id', user.id)
        .not('ebay_refresh_token', 'is', null)
        .single();

      if (userError || !userData) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'No eBay connection found',
            message: 'Please connect your eBay account first'
          })
        };
      }

      users = [userData];
    } else {
      // Process all users (admin only)
      const { data: allUsers, error: usersError } = await supabase
        .from('users')
        .select('id, email')
        .not('ebay_refresh_token', 'is', null);

      if (usersError) {
        throw usersError;
      }

      users = allUsers || [];
    }

    if (users.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No users with eBay connections found',
          results: { total: 0, success: 0, failed: 0 }
        })
      };
    }

    console.log(`Processing ${users.length} user(s)`);

    const results = {
      totalUsers: users.length,
      usersProcessed: 0,
      totalListingsChecked: 0,
      totalPricesReduced: 0,
      errors: [],
      details: []
    };

    // Process each user's listings
    for (const userToProcess of users) {
      try {
        const userResult = await processUserPriceReductions(userToProcess, user.id);
        results.usersProcessed++;
        results.totalListingsChecked += userResult.listingsChecked;
        results.totalPricesReduced += userResult.pricesReduced;
        results.details.push({
          userId: userToProcess.id,
          email: userToProcess.email,
          listingsChecked: userResult.listingsChecked,
          pricesReduced: userResult.pricesReduced,
          status: 'success'
        });

        if (userResult.pricesReduced > 0) {
          console.log(`✅ Reduced ${userResult.pricesReduced} prices for user ${userToProcess.email}`);
        }
      } catch (error) {
        console.error(`❌ Failed to process user ${userToProcess.email}:`, error);
        results.errors.push({
          userId: userToProcess.id,
          email: userToProcess.email,
          error: error.message
        });
        results.details.push({
          userId: userToProcess.id,
          email: userToProcess.email,
          status: 'failed',
          error: error.message
        });
      }

      // Add small delay between users to avoid rate limits
      await delay(1000);
    }

    console.log('🎉 Manual price reduction complete:', {
      usersProcessed: results.usersProcessed,
      totalListingsChecked: results.totalListingsChecked,
      totalPricesReduced: results.totalPricesReduced,
      errors: results.errors.length
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Manual price reduction completed',
        timestamp: new Date().toISOString(),
        results
      })
    };
  } catch (error) {
    console.error('💥 Manual price reduction failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Manual price reduction failed',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

/**
 * Process price reductions for a single user
 */
async function processUserPriceReductions(user, triggeredBy = null) {
  console.log(`🔍 Checking price reductions for user ${user.email}...`);

  // Initialize eBay client
  const ebayClient = new EbayApiClient(user.id);

  try {
    await ebayClient.initialize();
  } catch (initError) {
    console.error(`⚠️ Failed to initialize eBay client for ${user.email}:`, initError.message);
    return { listingsChecked: 0, pricesReduced: 0 };
  }

  // Get listings that might need price reduction
  // Include listings where next_price_reduction is NULL (never reduced before)
  // OR where next_price_reduction date has passed
  const now = new Date().toISOString();
  const { data: allListings, error: fetchError } = await supabase
    .from('listings')
    .select('*')
    .eq('user_id', user.id)
    .eq('price_reduction_enabled', true)
    .eq('listing_status', 'Active')
    .or(`next_price_reduction.lte.${now},next_price_reduction.is.null`);

  if (fetchError) {
    throw new Error(`Failed to fetch listings: ${fetchError.message}`);
  }

  if (!allListings || allListings.length === 0) {
    console.log(`No eligible listings for user ${user.email}`);
    return { listingsChecked: 0, pricesReduced: 0 };
  }

  // Filter to only listings where current_price > minimum_price
  const listings = allListings.filter(listing => {
    const currentPrice = parseFloat(listing.current_price);
    const minimumPrice = parseFloat(listing.minimum_price);
    return currentPrice > minimumPrice;
  });

  if (listings.length === 0) {
    console.log(`No listings above minimum price for user ${user.email}`);
    return { listingsChecked: allListings.length, pricesReduced: 0 };
  }

  console.log(`Found ${listings.length} eligible listings for user ${user.email}`);

  let pricesReduced = 0;

  for (const listing of listings) {
    try {
      // Calculate new price
      const currentPrice = parseFloat(listing.current_price);
      const minimumPrice = parseFloat(listing.minimum_price);
      const reductionPct = parseFloat(listing.reduction_percentage || 5);

      // Validate minimum price is set
      if (!listing.minimum_price || minimumPrice <= 0) {
        console.log(`⚠️ Skipping ${listing.ebay_item_id}: minimum_price not set`);
        continue;
      }

      const reductionAmount = currentPrice * (reductionPct / 100);
      let newPrice = currentPrice - reductionAmount;
      newPrice = Math.max(newPrice, minimumPrice);
      newPrice = Math.round(newPrice * 100) / 100;

      // Check if reduction is meaningful
      if (newPrice >= currentPrice) {
        console.log(`⚠️ Skipping ${listing.ebay_item_id}: new price not lower than current`);
        continue;
      }

      // Update price on eBay
      console.log(`💰 Reducing price for ${listing.ebay_item_id}: $${currentPrice} → $${newPrice}`);

      try {
        await ebayClient.updateItemPrice(listing.ebay_item_id, newPrice);

        // Calculate next reduction date
        const nextReduction = new Date();
        nextReduction.setDate(nextReduction.getDate() + (listing.reduction_interval || 7));

        // Update database
        await supabase
          .from('listings')
          .update({
            current_price: newPrice,
            last_price_reduction: new Date().toISOString(),
            next_price_reduction: nextReduction.toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', listing.id);

        // Log the successful price reduction
        const reductionAmountCalc = currentPrice - newPrice;
        const reductionPercentageCalc = ((reductionAmountCalc / currentPrice) * 100).toFixed(2);

        await supabase
          .from('price_reduction_log')
          .insert({
            user_id: user.id,
            listing_id: listing.id,
            ebay_item_id: listing.ebay_item_id,
            sku: listing.sku,
            title: listing.title,
            original_price: currentPrice,
            reduced_price: newPrice,
            reduction_amount: reductionAmountCalc,
            reduction_percentage: reductionPercentageCalc,
            reduction_type: 'manual',
            reduction_strategy: listing.reduction_strategy || 'fixed_percentage',
            triggered_by: triggeredBy
          });

        pricesReduced++;

        console.log(`✅ Successfully reduced price for ${listing.ebay_item_id}`);

      } catch (ebayError) {
        console.error(`❌ Failed to update eBay price for ${listing.ebay_item_id}:`, ebayError.message);
        // Continue to next listing
      }

    } catch (itemError) {
      console.error(`❌ Error processing listing ${listing.ebay_item_id}:`, itemError.message);
      // Continue to next listing
    }
  }

  return { listingsChecked: listings.length, pricesReduced };
}

/**
 * Utility: Delay execution
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { handler };
