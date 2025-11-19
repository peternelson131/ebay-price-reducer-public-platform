const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

    // Get user's credentials
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('ebay_app_id, ebay_cert_id_encrypted, ebay_refresh_token, ebay_connection_status, ebay_connected_at')
      .eq('id', user.id)
      .single();

    if (userError) {
      throw new Error(`Failed to fetch user: ${userError.message}`);
    }

    const diagnosis = {
      hasAppId: !!userRecord.ebay_app_id,
      hasCertId: !!userRecord.ebay_cert_id_encrypted,
      hasRefreshToken: !!userRecord.ebay_refresh_token,
      connectionStatus: userRecord.ebay_connection_status,
      connectedAt: userRecord.ebay_connected_at,
      appIdPreview: userRecord.ebay_app_id ? `${userRecord.ebay_app_id.substring(0, 10)}...` : null,
      certIdFormat: null,
      certIdLength: null,
      issues: []
    };

    // Check cert_id format
    if (userRecord.ebay_cert_id_encrypted) {
      const encrypted = userRecord.ebay_cert_id_encrypted;
      diagnosis.certIdLength = encrypted.length;

      if (encrypted.startsWith('NEEDS_MIGRATION:')) {
        diagnosis.certIdFormat = 'NEEDS_MIGRATION';
        diagnosis.issues.push('Credentials need migration. Please disconnect and reconnect your eBay account.');
      } else if (!/^[0-9a-f]+:[0-9a-f]+$/i.test(encrypted)) {
        diagnosis.certIdFormat = 'INVALID_FORMAT';
        diagnosis.issues.push(`Invalid encryption format. Expected hex:hex, got: ${encrypted.substring(0, 20)}...`);
      } else {
        diagnosis.certIdFormat = 'VALID_HEX';
        diagnosis.issues.push('Encryption format is valid.');
      }
    } else {
      diagnosis.issues.push('No Cert ID found. Please configure your eBay credentials in Admin Settings.');
    }

    // Check refresh token
    if (!userRecord.ebay_refresh_token) {
      diagnosis.issues.push('No refresh token found. Please connect your eBay account.');
    }

    // Check if credentials are configured but not connected
    if (userRecord.ebay_app_id && userRecord.ebay_cert_id_encrypted && !userRecord.ebay_refresh_token) {
      diagnosis.issues.push('Credentials configured but not connected. Please complete OAuth flow.');
    }

    // Overall status
    diagnosis.canSync =
      diagnosis.hasAppId &&
      diagnosis.hasCertId &&
      diagnosis.hasRefreshToken &&
      diagnosis.certIdFormat === 'VALID_HEX';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(diagnosis, null, 2)
    };

  } catch (error) {
    console.error('Credential check failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Credential check failed',
        message: error.message
      })
    };
  }
};
