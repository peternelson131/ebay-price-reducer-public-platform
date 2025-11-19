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
    const { itemId, userId, enabled } = requestBody;

    // Validate required parameters
    if (!itemId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required parameter',
          message: 'itemId is required'
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

    if (typeof enabled !== 'boolean') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid parameter',
          message: 'enabled must be a boolean value'
        })
      };
    }

    // Check if listing exists and belongs to user
    const { data: listing, error: fetchError } = await supabase
      .from('listings')
      .select('*')
      .eq('ebay_item_id', itemId)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
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

    // Update the price reduction setting
    // When enabling: calculate next_price_reduction based on reduction_interval
    // When disabling: clear next_price_reduction
    const updateData = {
      price_reduction_enabled: enabled,
      updated_at: new Date().toISOString()
    };

    if (enabled) {
      // Enable: Calculate next reduction date based on reduction_interval (default 7 days)
      const nextReduction = new Date();
      const interval = listing.reduction_interval || 7;
      nextReduction.setDate(nextReduction.getDate() + interval);
      updateData.next_price_reduction = nextReduction.toISOString();
      console.log(`Enabling price reduction for ${listing.title} - next reduction: ${nextReduction.toISOString()} (${interval} days from now)`);
    } else {
      // Disable: Clear next_price_reduction
      updateData.next_price_reduction = null;
      console.log(`Disabling price reduction for ${listing.title}`);
    }

    const { data: updatedListing, error: updateError } = await supabase
      .from('listings')
      .update(updateData)
      .eq('ebay_item_id', itemId)
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
          message: 'Failed to update price reduction setting'
        })
      };
    }

    // Log the change (price_history table removed)
    console.log(`Price reduction ${enabled ? 'enabled' : 'disabled'} for listing ${listing.id} (${listing.title})`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Price reduction ${enabled ? 'enabled' : 'disabled'} for item ${itemId}`,
        listing: {
          id: updatedListing.id,
          itemId: updatedListing.ebay_item_id,
          title: updatedListing.title,
          priceReductionEnabled: updatedListing.price_reduction_enabled,
          updatedAt: updatedListing.updated_at
        },
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Failed to toggle price reduction:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: 'Failed to toggle price reduction setting',
        timestamp: new Date().toISOString()
      })
    };
  }
};

module.exports = { handler };