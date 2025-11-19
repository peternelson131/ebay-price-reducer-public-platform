const { Handler } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');

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

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const limit = parseInt(queryParams.limit) || 50;
    const days = parseInt(queryParams.days) || 30;

    // Calculate date threshold
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);

    // Get listings with recent price reductions
    const { data: recentChanges, error: queryError } = await supabase
      .from('listings')
      .select(`
        id,
        ebay_item_id,
        title,
        current_price,
        original_price,
        minimum_price,
        currency,
        last_price_reduction,
        next_price_reduction,
        reduction_percentage,
        reduction_strategy,
        image_urls,
        listing_status
      `)
      .eq('user_id', user.id)
      .not('last_price_reduction', 'is', null)
      .gte('last_price_reduction', dateThreshold.toISOString())
      .order('last_price_reduction', { ascending: false })
      .limit(limit);

    if (queryError) {
      throw queryError;
    }

    // Calculate statistics
    const stats = {
      totalReductions: recentChanges.length,
      totalSavings: 0,
      averageReduction: 0,
      periodDays: days
    };

    recentChanges.forEach(listing => {
      if (listing.original_price && listing.current_price) {
        stats.totalSavings += (listing.original_price - listing.current_price);
      }
    });

    if (recentChanges.length > 0) {
      stats.averageReduction = (stats.totalSavings / recentChanges.length).toFixed(2);
    }

    // Format response
    const formattedChanges = recentChanges.map(listing => ({
      id: listing.id,
      ebayItemId: listing.ebay_item_id,
      title: listing.title,
      currentPrice: parseFloat(listing.current_price),
      originalPrice: parseFloat(listing.original_price),
      minimumPrice: parseFloat(listing.minimum_price),
      currency: listing.currency,
      reduction: listing.original_price && listing.current_price
        ? (listing.original_price - listing.current_price).toFixed(2)
        : null,
      reductionPercentage: listing.original_price && listing.current_price
        ? (((listing.original_price - listing.current_price) / listing.original_price) * 100).toFixed(1)
        : null,
      lastReduction: listing.last_price_reduction,
      nextReduction: listing.next_price_reduction,
      strategy: listing.reduction_strategy,
      configuredReductionPct: listing.reduction_percentage,
      imageUrl: listing.image_urls && listing.image_urls.length > 0 ? listing.image_urls[0] : null,
      status: listing.listing_status
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        changes: formattedChanges,
        stats,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Failed to fetch price changes:', error);
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
