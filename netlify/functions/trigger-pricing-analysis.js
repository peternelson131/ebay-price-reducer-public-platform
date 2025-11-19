const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Manual trigger for pricing analysis
 * This is a simple endpoint to manually trigger pricing analysis
 */
exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Authentication required' })
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid authentication' })
      };
    }

    console.log('🔍 Manual trigger: Starting pricing analysis for user:', user.id);

    // Import and call the analysis function
    const { handler: analyzeHandler } = require('./analyze-competitive-pricing');

    const result = await analyzeHandler(
      {
        httpMethod: 'POST',
        headers: event.headers,
        body: null
      },
      context
    );

    console.log('✅ Analysis completed:', result.statusCode);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Pricing analysis triggered',
        analysisResult: JSON.parse(result.body)
      })
    };

  } catch (error) {
    console.error('❌ Failed to trigger analysis:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to trigger pricing analysis',
        message: error.message
      })
    };
  }
};
