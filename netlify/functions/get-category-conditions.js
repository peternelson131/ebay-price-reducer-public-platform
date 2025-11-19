const { getCorsHeaders } = require('./utils/cors');
const { createClient } = require('@supabase/supabase-js');
const { EbayInventoryClient } = require('./utils/ebay-inventory-client');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Netlify Function: Get valid condition IDs for a specific eBay category
 *
 * GET /.netlify/functions/get-category-conditions?categoryId=12345
 *
 * Returns:
 * {
 *   categoryId: "12345",
 *   conditionRequired: true,
 *   allowedConditions: [
 *     { conditionId: "1000", conditionDisplayName: "New" },
 *     { conditionId: "3000", conditionDisplayName: "Used" }
 *   ]
 * }
 */
exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // 1. Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    // 2. Get categoryId from query params
    const categoryId = event.queryStringParameters?.categoryId;

    if (!categoryId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required parameter: categoryId',
          usage: 'GET /get-category-conditions?categoryId=12345'
        })
      };
    }

    console.log(`Fetching condition policies for category ${categoryId}, user: ${user.id}`);

    // 3. Initialize eBay client
    const ebayClient = new EbayInventoryClient(user.id);
    await ebayClient.initialize();

    // 4. Get condition policies for category
    const conditionPolicies = await ebayClient.getCategoryConditionPolicies(categoryId);

    // 5. Return policies
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        categoryId,
        conditionRequired: conditionPolicies.conditionRequired,
        allowedConditions: conditionPolicies.allowedConditions
      })
    };

  } catch (error) {
    console.error('Get category conditions error:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to fetch category condition policies',
        message: error.message
      })
    };
  }
};
