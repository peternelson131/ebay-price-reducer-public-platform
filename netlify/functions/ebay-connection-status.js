const { createClient } = require('@supabase/supabase-js');
const { EbayTokenService } = require('./utils/ebay-token-service');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Get eBay connection status for authenticated user
 * Returns detailed status including connectivity, credentials, and actionable issues
 */
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Validate Supabase JWT
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

    console.log(`📊 Checking eBay connection status for user: ${user.email}`);

    // Get connection status using token service
    const tokenService = new EbayTokenService(user.id);
    const status = await tokenService.getConnectionStatus();

    console.log(`✅ Connection status check complete:`, {
      userId: user.id,
      connected: status.connected,
      hasCredentials: status.hasCredentials,
      canSync: status.canSync,
      issuesCount: status.issues.length
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(status)
    };

  } catch (error) {
    console.error('❌ Status check failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to check connection status',
        message: error.message
      })
    };
  }
};
