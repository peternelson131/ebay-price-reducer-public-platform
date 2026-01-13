/**
 * Manual Price Reduction Trigger
 * 
 * HTTP endpoint for manually triggering price reductions
 * Use this for testing since scheduled functions can't be invoked via HTTP
 * 
 * POST /trigger-price-reduction
 * Body: { "testSecret": "uat-test-2026", "dryRun": true/false }
 */

const https = require('https');

function httpsPost(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const startTime = Date.now();
  console.log('🔧 Manual price reduction trigger at', new Date().toISOString());
  
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    
    // Require test secret for manual triggers
    if (body.testSecret !== 'uat-test-2026') {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid test secret' })
      };
    }
    
    const dryRun = body.dryRun !== false; // Default to dry run for safety
    const limit = body.limit || null; // Optional limit for testing
    
    // Get the site URL from environment
    const siteUrl = process.env.URL || 'https://dainty-horse-49c336.netlify.app';
    const functionUrl = `${siteUrl}/.netlify/functions/process-price-reductions`;
    
    console.log(`📡 Calling ${functionUrl} (dryRun: ${dryRun})`);
    
    // Call process-price-reductions
    const response = await httpsPost(functionUrl, {
      internalScheduled: 'netlify-scheduled-function',
      dryRun: dryRun,
      limit: limit
    });
    
    let result;
    try {
      result = JSON.parse(response.body);
    } catch (e) {
      result = { raw: response.body.substring(0, 500) };
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    return {
      statusCode: response.status,
      headers,
      body: JSON.stringify({
        triggered: true,
        dryRun: dryRun,
        duration: `${duration}s`,
        stats: result.stats,
        success: response.status === 200
      })
    };
    
  } catch (error) {
    console.error('❌ Manual trigger failed:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
