const { createClient } = require('@supabase/supabase-js');
const { EbayInventoryClient } = require('./utils/ebay-inventory-client');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Scheduled function to refresh popular category aspects
 * Runs daily at 2 AM UTC
 */
exports.handler = async (event, context) => {
  console.log('Starting scheduled aspect cache refresh');

  try {
    // Get top 100 most-used categories from last 30 days
    const { data: popularCategories, error: statsError } = await supabase
      .from('ebay_category_aspect_stats')
      .select('category_id, usage_count')
      .gte('last_used_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('usage_count', { ascending: false })
      .limit(100);

    if (statsError) {
      throw statsError;
    }

    if (!popularCategories || popularCategories.length === 0) {
      console.log('No popular categories to refresh');
      return { statusCode: 200, body: JSON.stringify({ message: 'No categories to refresh' }) };
    }

    console.log(`Found ${popularCategories.length} popular categories to refresh`);

    // Get a user ID to use for eBay API calls (need credentials)
    // Use the most recently active user with valid credentials
    const { data: activeUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .not('ebay_refresh_token', 'is', null)
      .order('last_sign_in_at', { ascending: false })
      .limit(1)
      .single();

    if (userError || !activeUser) {
      console.error('No active user found for eBay API calls');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'No active user available for refresh' })
      };
    }

    console.log(`Using user ${activeUser.id} for eBay API calls`);

    // Initialize eBay client
    const ebayClient = new EbayInventoryClient(activeUser.id);
    await ebayClient.initialize();

    // Refresh each category's aspects
    let refreshed = 0;
    let errors = 0;

    for (const category of popularCategories) {
      try {
        console.log(`Refreshing category ${category.category_id}`);

        // Force refresh by passing forceRefresh=true
        await ebayClient.getCachedCategoryAspects(category.category_id, true);

        refreshed++;

        // Rate limiting: small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to refresh category ${category.category_id}:`, error.message);
        errors++;
      }
    }

    console.log(`Aspect refresh complete: ${refreshed} refreshed, ${errors} errors`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        categoriesProcessed: popularCategories.length,
        refreshed,
        errors
      })
    };

  } catch (error) {
    console.error('Aspect refresh job failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Aspect refresh failed',
        message: error.message
      })
    };
  }
};
