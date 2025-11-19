const { schedule } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');
const { EbayApiClient } = require('./utils/ebay-api-client');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Scheduled function that runs price reductions for eligible listings
 * Runs daily at 1:10 AM Central Time (year-round, accounting for DST)
 *
 * Note: This runs at both 6:10 AM and 7:10 AM UTC to cover both CST and CDT,
 * but only executes if it's actually 1:10 AM Central Time.
 */
const handler = async (event) => {
  const now = new Date();
  console.log('🕐 Scheduled price reduction triggered at', now.toISOString());

  // Check if it's 1:10 AM Central Time
  const centralTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const centralHour = centralTime.getHours();
  const centralMinute = centralTime.getMinutes();

  if (centralHour !== 1 || centralMinute !== 10) {
    console.log(`⏭️ Skipping execution - Current Central Time is ${centralHour}:${centralMinute.toString().padStart(2, '0')}, not 1:10 AM`);
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Skipped - not 1:10 AM Central Time',
        currentCentralTime: `${centralHour}:${centralMinute.toString().padStart(2, '0')}`,
        timestamp: now.toISOString()
      })
    };
  }

  // Check if we already ran today (prevent double execution)
  const dateKey = centralTime.toISOString().split('T')[0]; // YYYY-MM-DD
  const { data: lastRun, error: checkError } = await supabase
    .from('system_state')
    .select('value, updated_at')
    .eq('key', 'last_price_reduction_date')
    .single();

  if (!checkError && lastRun && lastRun.value === dateKey) {
    console.log('⏭️ Already ran today - skipping to prevent duplicate execution');
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Already executed today',
        lastRun: lastRun.updated_at,
        timestamp: now.toISOString()
      })
    };
  }

  console.log('✅ Executing price reduction at 1:10 AM Central Time');

  try {
    // Get all users with eBay connections and price reduction enabled listings
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email')
      .not('ebay_refresh_token', 'is', null);

    if (usersError) {
      console.error('Failed to fetch users:', usersError);
      throw usersError;
    }

    if (!users || users.length === 0) {
      console.log('No users with eBay connections found');
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'No users to process',
          results: { total: 0, success: 0, failed: 0 }
        })
      };
    }

    console.log(`Found ${users.length} users to check for price reductions`);

    const results = {
      totalUsers: users.length,
      usersProcessed: 0,
      totalListingsChecked: 0,
      totalPricesReduced: 0,
      errors: [],
      details: []
    };

    // Process each user's listings
    for (const user of users) {
      try {
        const userResult = await processUserPriceReductions(user);
        results.usersProcessed++;
        results.totalListingsChecked += userResult.listingsChecked;
        results.totalPricesReduced += userResult.pricesReduced;
        results.details.push({
          userId: user.id,
          email: user.email,
          listingsChecked: userResult.listingsChecked,
          pricesReduced: userResult.pricesReduced,
          status: 'success'
        });

        if (userResult.pricesReduced > 0) {
          console.log(`✅ Reduced ${userResult.pricesReduced} prices for user ${user.email}`);
        }
      } catch (error) {
        console.error(`❌ Failed to process user ${user.email}:`, error);
        results.errors.push({
          userId: user.id,
          email: user.email,
          error: error.message
        });
        results.details.push({
          userId: user.id,
          email: user.email,
          status: 'failed',
          error: error.message
        });
      }

      // Add small delay between users to avoid rate limits
      await delay(1000);
    }

    console.log('🎉 Scheduled price reduction complete:', {
      usersProcessed: results.usersProcessed,
      totalListingsChecked: results.totalListingsChecked,
      totalPricesReduced: results.totalPricesReduced,
      errors: results.errors.length
    });

    // Clean up old price reduction logs (older than 10 days)
    try {
      const { data: cleanupResult, error: cleanupError } = await supabase
        .rpc('cleanup_old_price_reduction_logs');

      if (!cleanupError && cleanupResult !== null) {
        console.log(`🧹 Cleaned up ${cleanupResult} old price reduction log entries`);
      }
    } catch (cleanupErr) {
      console.warn('⚠️ Failed to clean up old logs:', cleanupErr.message);
      // Don't fail the entire job if cleanup fails
    }

    // Mark today as completed to prevent duplicate execution
    await supabase
      .from('system_state')
      .upsert({
        key: 'last_price_reduction_date',
        value: dateKey,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'key'
      });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Scheduled price reduction completed',
        timestamp: new Date().toISOString(),
        results
      })
    };
  } catch (error) {
    console.error('💥 Scheduled price reduction failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Scheduled price reduction failed',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

/**
 * Process price reductions for a single user
 */
async function processUserPriceReductions(user) {
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
            reduction_type: 'scheduled',
            reduction_strategy: listing.reduction_strategy || 'fixed_percentage',
            triggered_by: null // Scheduled runs have no user trigger
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

// Schedule to run at both 6:10 AM and 7:10 AM UTC to cover DST changes
// Cron expression: '10 6,7 * * *' = At 6:10 AM and 7:10 AM UTC every day
// - 6:10 AM UTC = 1:10 AM CDT (summer, UTC-5)
// - 7:10 AM UTC = 1:10 AM CST (winter, UTC-6)
// The function checks Central Time and only executes at 1:10 AM, preventing duplicates
exports.handler = schedule('10 6,7 * * *', handler);
