const { Handler } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Get price reduction logs for the authenticated user
 * Shows recent price reductions with details
 */
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
    const limit = parseInt(queryParams.limit) || 100;
    const days = parseInt(queryParams.days) || 10;
    const type = queryParams.type; // Optional: 'manual', 'scheduled', or undefined for all

    // Calculate date threshold
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);

    // Build query
    let query = supabase
      .from('price_reduction_log')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', dateThreshold.toISOString())
      .order('created_at', { ascending: false })
      .limit(limit);

    // Filter by type if specified
    if (type && ['manual', 'scheduled', 'automated'].includes(type)) {
      query = query.eq('reduction_type', type);
    }

    const { data: logs, error: queryError } = await query;

    if (queryError) {
      throw queryError;
    }

    // Calculate statistics
    const stats = {
      totalReductions: logs.length,
      totalSavings: 0,
      averageSavings: 0,
      byType: {
        manual: 0,
        scheduled: 0,
        automated: 0
      },
      byStrategy: {}
    };

    logs.forEach(log => {
      stats.totalSavings += parseFloat(log.reduction_amount || 0);
      stats.byType[log.reduction_type] = (stats.byType[log.reduction_type] || 0) + 1;

      if (log.reduction_strategy) {
        stats.byStrategy[log.reduction_strategy] = (stats.byStrategy[log.reduction_strategy] || 0) + 1;
      }
    });

    if (logs.length > 0) {
      stats.averageSavings = (stats.totalSavings / logs.length).toFixed(2);
      stats.totalSavings = stats.totalSavings.toFixed(2);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        logs: logs.map(log => ({
          id: log.id,
          ebayItemId: log.ebay_item_id,
          sku: log.sku,
          title: log.title,
          originalPrice: parseFloat(log.original_price),
          reducedPrice: parseFloat(log.reduced_price),
          reductionAmount: parseFloat(log.reduction_amount),
          reductionPercentage: parseFloat(log.reduction_percentage),
          type: log.reduction_type,
          strategy: log.reduction_strategy,
          createdAt: log.created_at
        })),
        stats,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Failed to fetch price reduction logs:', error);
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
