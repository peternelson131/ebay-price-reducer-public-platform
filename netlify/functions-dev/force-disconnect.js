const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Force disconnect eBay account - clears OAuth tokens but preserves App credentials
 * This is useful when the normal disconnect flow fails
 */
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
    // Get authenticated user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    const user = userData?.user;

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    console.log(`🔌 Force disconnecting eBay account for user: ${user.email}`);

    // Clear OAuth tokens but keep App credentials (app_id, cert_id)
    const { error: updateError } = await supabase
      .from('users')
      .update({
        ebay_refresh_token: null,
        ebay_user_id: null,
        ebay_connected_at: null,
        ebay_connection_status: 'disconnected'
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to disconnect:', updateError);
      throw new Error(`Failed to disconnect: ${updateError.message}`);
    }

    console.log('✅ Successfully disconnected eBay account');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'eBay account disconnected successfully',
        note: 'App credentials (App ID, Cert ID) have been preserved. You can now reconnect.'
      })
    };

  } catch (error) {
    console.error('Force disconnect failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Force disconnect failed',
        message: error.message
      })
    };
  }
};
