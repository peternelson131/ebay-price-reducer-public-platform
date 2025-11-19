const { getCorsHeaders } = require('./utils/cors');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    // Get user's listing settings
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, email, listing_settings')
      .eq('id', user.id)
      .single();

    if (userError) {
      throw userError;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        userId: userData.id,
        email: userData.email,
        listingSettings: userData.listing_settings,
        defaultLocation: userData.listing_settings?.defaultLocation,
        defaultLocationAddress: userData.listing_settings?.defaultLocation?.address,
        postalCode: userData.listing_settings?.defaultLocation?.address?.postalCode,
        message: 'Raw settings from database'
      }, null, 2)
    };

  } catch (error) {
    console.error('Debug settings error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
