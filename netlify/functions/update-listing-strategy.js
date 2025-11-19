const { Handler } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: 'Method not allowed',
        message: 'Only POST requests are supported'
      })
    };
  }

  try {
    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');
    const { listingId, strategyId, userId } = requestBody;

    // Validate required parameters
    if (!listingId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required parameter',
          message: 'listingId is required'
        })
      };
    }

    if (!strategyId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required parameter',
          message: 'strategyId is required'
        })
      };
    }

    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required parameter',
          message: 'userId is required'
        })
      };
    }

    // Get the strategy details to find frequency_days
    const { data: strategy, error: strategyError } = await supabase
      .from('strategies')
      .select('*')
      .eq('id', strategyId)
      .single();

    if (strategyError || !strategy) {
      console.error('Error fetching strategy:', strategyError);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: 'Strategy not found',
          message: 'Could not find the specified strategy'
        })
      };
    }

    // Check if listing exists and belongs to user
    const { data: listing, error: fetchError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !listing) {
      console.error('Error fetching listing:', fetchError);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          error: 'Listing not found',
          message: 'Could not find listing for this user'
        })
      };
    }

    // Calculate new next_price_reduction based on strategy frequency
    const nextReduction = new Date();
    const interval = strategy.frequency_days || 7;
    nextReduction.setDate(nextReduction.getDate() + interval);

    // Update the listing with new strategy, interval, and next_price_reduction date
    const updateData = {
      strategy_id: strategyId,
      reduction_strategy: strategyId, // Also update old field for compatibility
      reduction_interval: interval,
      next_price_reduction: listing.price_reduction_enabled ? nextReduction.toISOString() : listing.next_price_reduction,
      updated_at: new Date().toISOString()
    };

    console.log(`Updating strategy for ${listing.title}:`);
    console.log(`- New strategy: ${strategy.name}`);
    console.log(`- Interval: ${interval} days`);
    console.log(`- Next reduction: ${listing.price_reduction_enabled ? nextReduction.toISOString() : 'N/A (disabled)'}`);

    const { data: updatedListing, error: updateError } = await supabase
      .from('listings')
      .update(updateData)
      .eq('id', listingId)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating listing:', updateError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Update failed',
          message: 'Failed to update listing strategy'
        })
      };
    }

    console.log(`✅ Strategy updated for listing ${listing.id} (${listing.title})`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Strategy updated to ${strategy.name}`,
        listing: {
          id: updatedListing.id,
          title: updatedListing.title,
          strategyId: updatedListing.strategy_id,
          reductionInterval: updatedListing.reduction_interval,
          nextPriceReduction: updatedListing.next_price_reduction,
          updatedAt: updatedListing.updated_at
        },
        strategy: {
          id: strategy.id,
          name: strategy.name,
          frequencyDays: strategy.frequency_days
        },
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Failed to update listing strategy:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: 'Failed to update listing strategy',
        timestamp: new Date().toISOString()
      })
    };
  }
};

module.exports = { handler };
