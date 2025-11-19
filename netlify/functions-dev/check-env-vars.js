/**
 * Development function to check environment variable configuration
 *
 * This function verifies that all required environment variables are set
 * in the Netlify environment. Use this to debug missing configuration issues.
 *
 * Usage:
 *   curl https://your-site.netlify.app/.netlify/functions-dev/check-env-vars
 */

exports.handler = async (event, context) => {
  const requiredVars = [
    'EBAY_APP_ID',
    'EBAY_CERT_ID',
    'ENCRYPTION_KEY',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'EBAY_REDIRECT_URI'
  ];

  const status = {};
  const details = {};

  requiredVars.forEach(varName => {
    const value = process.env[varName];
    const isSet = !!value;

    status[varName] = isSet ? '✓ SET' : '✗ MISSING';

    if (isSet) {
      // Show first/last 4 chars for verification (don't expose full value)
      const masked = value.length > 8
        ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
        : '****';
      details[varName] = {
        status: 'SET',
        length: value.length,
        preview: masked
      };
    } else {
      details[varName] = {
        status: 'MISSING',
        required: true
      };
    }
  });

  // Check overall status
  const allSet = Object.values(status).every(s => s === '✓ SET');
  const missingCount = Object.values(status).filter(s => s === '✗ MISSING').length;

  return {
    statusCode: allSet ? 200 : 500,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      overall: allSet ? '✓ ALL CONFIGURED' : `✗ ${missingCount} MISSING`,
      summary: status,
      details: details,
      timestamp: new Date().toISOString(),
      note: missingCount > 0
        ? 'Set missing variables in Netlify Dashboard → Site Settings → Environment Variables'
        : 'All required environment variables are configured'
    }, null, 2)
  };
};
