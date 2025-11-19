const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { EbayInventoryClient } = require('./utils/ebay-inventory-client');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Manual trigger function for refreshing category aspects
 *
 * POST /.netlify/functions/trigger-category-refresh
 * Body: { categoryId: "optional-specific-category-id" }
 *
 * If categoryId provided: Refreshes that specific category
 * If no categoryId: Refreshes all cached categories
 */
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
    // Authenticate user (any authenticated user can trigger refresh)
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    const { categoryId } = JSON.parse(event.body || '{}');

    // Initialize eBay client
    const ebayClient = new EbayInventoryClient(user.id);
    await ebayClient.initialize();

    if (categoryId) {
      // Refresh specific category
      console.log(`🔄 Manual refresh requested for category ${categoryId} by user ${user.id}`);

      await ebayClient.getCachedCategoryAspects(categoryId, true);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Category ${categoryId} aspects refreshed`,
          categoryId,
          timestamp: new Date().toISOString()
        })
      };
    } else {
      // Refresh all categories
      console.log(`🔄 Manual refresh requested for ALL categories by user ${user.id}`);

      const { data: categories } = await supabase
        .from('ebay_category_aspects')
        .select('category_id, category_name');

      const results = { total: categories?.length || 0, success: 0, failed: 0 };

      for (const category of categories || []) {
        try {
          await ebayClient.getCachedCategoryAspects(category.category_id, true);
          results.success++;
        } catch (error) {
          console.error(`Failed to refresh ${category.category_id}:`, error);
          results.failed++;
        }
        // Rate limit
        await new Promise(r => setTimeout(r, 200));
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'All categories refreshed',
          results,
          timestamp: new Date().toISOString()
        })
      };
    }

  } catch (error) {
    console.error('Manual refresh error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to refresh category aspects',
        message: error.message
      })
    };
  }
};
