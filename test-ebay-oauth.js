#!/usr/bin/env node

/**
 * Test script to debug eBay OAuth token exchange
 * This will help us understand why we're not getting a refresh token
 */

const fetch = require('node-fetch');
require('dotenv').config();

// Test configuration
const TEST_CONFIG = {
  // We'll need to get these from the user's database
  CLIENT_ID: process.env.EBAY_CLIENT_ID || '',
  CLIENT_SECRET: process.env.EBAY_CLIENT_SECRET || '',
  REDIRECT_URI: process.env.EBAY_REDIRECT_URI || 'https://dainty-horse-49c336.netlify.app/.netlify/functions/ebay-oauth',

  // eBay OAuth endpoints
  AUTH_URL: 'https://auth.ebay.com/oauth2/authorize',
  TOKEN_URL: 'https://api.ebay.com/identity/v1/oauth2/token',

  // Test with different scope combinations
  SCOPE_SETS: {
    // Set 1: With root scope (should work)
    withRoot: [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly'
    ],

    // Set 2: Without root scope (might not get refresh token)
    withoutRoot: [
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly'
    ],

    // Set 3: Only root scope
    onlyRoot: [
      'https://api.ebay.com/oauth/api_scope'
    ],

    // Set 4: Different combination
    alternative: [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.account',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment'
    ]
  }
};

/**
 * Generate the authorization URL for manual testing
 */
function generateAuthUrl(scopeSet = 'withRoot') {
  const scopes = TEST_CONFIG.SCOPE_SETS[scopeSet];
  const scope = scopes.join(' ');

  const params = new URLSearchParams({
    client_id: TEST_CONFIG.CLIENT_ID,
    response_type: 'code',
    redirect_uri: TEST_CONFIG.REDIRECT_URI,
    scope: scope,
    state: 'test_state_12345'
  });

  const authUrl = `${TEST_CONFIG.AUTH_URL}?${params.toString()}`;

  console.log('\n=== Authorization URL ===');
  console.log('Scope Set:', scopeSet);
  console.log('Scopes:', scopes);
  console.log('\nVisit this URL to authorize:');
  console.log(authUrl);
  console.log('\nAfter authorization, copy the "code" parameter from the callback URL');

  return authUrl;
}

/**
 * Test token exchange with different configurations
 */
async function testTokenExchange(authorizationCode, options = {}) {
  const {
    useScope = true,
    decodeCode = false,
    scopeSet = 'withRoot'
  } = options;

  console.log('\n=== Testing Token Exchange ===');
  console.log('Configuration:');
  console.log('- Use scope in request:', useScope);
  console.log('- Decode authorization code:', decodeCode);
  console.log('- Scope set:', scopeSet);

  const code = decodeCode ? decodeURIComponent(authorizationCode) : authorizationCode;
  const scopes = TEST_CONFIG.SCOPE_SETS[scopeSet];
  const scope = scopes.join(' ');

  // Prepare request body
  const bodyParams = {
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: TEST_CONFIG.REDIRECT_URI
  };

  if (useScope) {
    bodyParams.scope = scope;
  }

  // Create authorization header
  const authCredentials = Buffer.from(
    `${TEST_CONFIG.CLIENT_ID}:${TEST_CONFIG.CLIENT_SECRET}`
  ).toString('base64');

  console.log('\nRequest details:');
  console.log('- Token URL:', TEST_CONFIG.TOKEN_URL);
  console.log('- Authorization: Basic [HIDDEN]');
  console.log('- Body params:', {
    ...bodyParams,
    code: bodyParams.code.substring(0, 20) + '...'
  });

  try {
    const response = await fetch(TEST_CONFIG.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authCredentials}`
      },
      body: new URLSearchParams(bodyParams)
    });

    const responseText = await response.text();
    let data;

    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse response as JSON:', responseText);
      return;
    }

    console.log('\nResponse Status:', response.status);
    console.log('Response Headers:', Object.fromEntries(response.headers.entries()));

    if (response.ok) {
      console.log('\n✅ SUCCESS! Token exchange successful');
      console.log('\nToken Response:');
      console.log('- Access Token:', data.access_token ? `${data.access_token.substring(0, 30)}...` : 'NOT RECEIVED');
      console.log('- Refresh Token:', data.refresh_token ? `${data.refresh_token.substring(0, 30)}...` : '❌ NOT RECEIVED');
      console.log('- Token Type:', data.token_type);
      console.log('- Expires In:', data.expires_in, 'seconds');
      console.log('- Refresh Token Expires In:', data.refresh_token_expires_in, 'seconds');

      if (!data.refresh_token) {
        console.log('\n⚠️  WARNING: No refresh token received!');
        console.log('This means the OAuth flow is not properly configured.');
        console.log('Possible reasons:');
        console.log('1. Missing or incorrect scopes');
        console.log('2. Application not configured for refresh tokens in eBay');
        console.log('3. Redirect URI mismatch');
        console.log('4. Authorization code already used');
      }

      return data;
    } else {
      console.log('\n❌ ERROR: Token exchange failed');
      console.log('Error Response:', data);

      if (data.error === 'invalid_grant') {
        console.log('\nThe authorization code is invalid or expired.');
        console.log('Please generate a new authorization code and try again.');
      } else if (data.error === 'invalid_client') {
        console.log('\nInvalid client credentials.');
        console.log('Check your CLIENT_ID and CLIENT_SECRET.');
      } else if (data.error === 'invalid_request') {
        console.log('\nThe request is missing required parameters.');
        console.log('Check the redirect URI matches exactly.');
      }
    }
  } catch (error) {
    console.error('\n❌ Request failed:', error.message);
  }
}

/**
 * Test refreshing an access token
 */
async function testRefreshToken(refreshToken) {
  console.log('\n=== Testing Refresh Token ===');

  const authCredentials = Buffer.from(
    `${TEST_CONFIG.CLIENT_ID}:${TEST_CONFIG.CLIENT_SECRET}`
  ).toString('base64');

  const bodyParams = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  };

  try {
    const response = await fetch(TEST_CONFIG.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authCredentials}`
      },
      body: new URLSearchParams(bodyParams)
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Refresh successful!');
      console.log('New Access Token:', data.access_token ? `${data.access_token.substring(0, 30)}...` : 'NOT RECEIVED');
      console.log('Expires In:', data.expires_in, 'seconds');
    } else {
      console.log('❌ Refresh failed:', data);
    }
  } catch (error) {
    console.error('Request failed:', error.message);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  console.log('eBay OAuth Token Exchange Test Tool');
  console.log('====================================\n');

  // Check if we have credentials
  if (!TEST_CONFIG.CLIENT_ID || !TEST_CONFIG.CLIENT_SECRET) {
    console.log('⚠️  Missing eBay credentials!');
    console.log('Please set the following environment variables:');
    console.log('- EBAY_CLIENT_ID');
    console.log('- EBAY_CLIENT_SECRET');
    console.log('\nOr update the TEST_CONFIG in this script with your credentials.');
    process.exit(1);
  }

  if (command === 'auth') {
    // Generate authorization URL
    const scopeSet = args[1] || 'withRoot';
    generateAuthUrl(scopeSet);

  } else if (command === 'exchange') {
    // Test token exchange
    const authCode = args[1];

    if (!authCode) {
      console.log('Usage: node test-ebay-oauth.js exchange <authorization_code>');
      console.log('\nFirst run: node test-ebay-oauth.js auth');
      console.log('Then visit the URL and copy the authorization code from the callback.');
      process.exit(1);
    }

    // Test different configurations
    console.log('Testing multiple configurations...\n');

    // Test 1: With scope parameter (should work)
    await testTokenExchange(authCode, {
      useScope: true,
      decodeCode: false,
      scopeSet: 'withRoot'
    });

    // If first test didn't get refresh token, try other configs
    console.log('\n' + '='.repeat(50));

    // Test 2: Without scope parameter
    await testTokenExchange(authCode, {
      useScope: false,
      decodeCode: false,
      scopeSet: 'withRoot'
    });

  } else if (command === 'refresh') {
    // Test refresh token
    const refreshToken = args[1];

    if (!refreshToken) {
      console.log('Usage: node test-ebay-oauth.js refresh <refresh_token>');
      process.exit(1);
    }

    await testRefreshToken(refreshToken);

  } else {
    console.log('Available commands:');
    console.log('\n1. Generate authorization URL:');
    console.log('   node test-ebay-oauth.js auth [scopeSet]');
    console.log('   scopeSet: withRoot (default), withoutRoot, onlyRoot, alternative');
    console.log('\n2. Test token exchange:');
    console.log('   node test-ebay-oauth.js exchange <authorization_code>');
    console.log('\n3. Test refresh token:');
    console.log('   node test-ebay-oauth.js refresh <refresh_token>');
    console.log('\nExample workflow:');
    console.log('1. node test-ebay-oauth.js auth');
    console.log('2. Visit the URL and authorize');
    console.log('3. Copy the "code" parameter from the callback URL');
    console.log('4. node test-ebay-oauth.js exchange <code>');
  }
}

// Run the test
main().catch(console.error);