const { schedule } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');
const { EbayInventoryClient } = require('./utils/ebay-inventory-client');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Scheduled function to refresh eBay category aspect metadata
 * Runs weekly on Sunday at 2 AM UTC
 *
 * Purpose: Proactively refresh category aspects to keep cache fresh
 * and reduce API calls during listing creation
 */
const handler = async (event) => {
  console.log('🔄 Starting category aspect refresh at', new Date().toISOString());

  try {
    // 1. Get all unique categories from active listings
    const { data: listings, error: listingsError } = await supabase
      .from('listings')
      .select('category_id, category')
      .not('category_id', 'is', null)
      .eq('listing_status', 'Active');

    if (listingsError) throw listingsError;

    // Deduplicate by category_id
    const uniqueCategories = [...new Map(
      listings.map(l => [l.category_id, { id: l.category_id, name: l.category }])
    ).values()];

    console.log(`📋 Found ${uniqueCategories.length} unique categories to refresh`);

    // 2. Get a user with valid eBay credentials (needed for API access)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .not('ebay_refresh_token', 'is', null)
      .limit(1)
      .single();

    if (userError || !user) {
      console.log('⚠️ No users with eBay credentials, skipping refresh');
      return {
        statusCode: 200,
        body: JSON.stringify({
          skipped: true,
          reason: 'No users with eBay credentials found'
        })
      };
    }

    // 3. Initialize eBay client
    const ebayClient = new EbayInventoryClient(user.id);
    await ebayClient.initialize();

    console.log('✓ eBay client initialized');

    // 4. Refresh each category's aspects
    const results = {
      total: uniqueCategories.length,
      success: 0,
      failed: 0,
      errors: []
    };

    for (const category of uniqueCategories) {
      try {
        // Force refresh from eBay API (skip cache)
        await ebayClient.getCachedCategoryAspects(category.id, true);

        // Update category name if we have it
        if (category.name) {
          await ebayClient.updateCachedCategoryName(category.id, category.name);
        }

        results.success++;
        console.log(`✓ Refreshed aspects for ${category.name || category.id}`);

      } catch (error) {
        console.error(`❌ Failed to refresh category ${category.id}:`, error.message);
        results.failed++;
        results.errors.push({
          categoryId: category.id,
          categoryName: category.name,
          error: error.message
        });
      }

      // Rate limit: 200ms between categories (avoid eBay API rate limits)
      await delay(200);
    }

    console.log('✅ Category aspect refresh complete:', results);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        results,
        completedAt: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('💥 Category refresh job failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run weekly on Sunday at 2 AM UTC
exports.handler = schedule('0 2 * * 0', handler);
