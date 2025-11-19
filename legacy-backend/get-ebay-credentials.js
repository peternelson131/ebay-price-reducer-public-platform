#!/usr/bin/env node

/**
 * Script to retrieve eBay credentials from Supabase
 * This will help us test the OAuth flow with real credentials
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function getEbayCredentials() {
  try {
    console.log('Fetching eBay credentials from Supabase...\n');

    // First, get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      // If no authenticated user, try to get the first user with eBay credentials
      console.log('No authenticated user, fetching any user with eBay credentials...');

      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, email, ebay_app_id, ebay_cert_id, ebay_dev_id, ebay_redirect_uri')
        .not('ebay_app_id', 'is', null)
        .limit(1)
        .single();

      if (usersError) {
        console.error('Error fetching users:', usersError);
        return;
      }

      if (!users) {
        console.log('No users found with eBay credentials');
        return;
      }

      console.log('Found user with eBay credentials:');
      console.log('- User ID:', users.id);
      console.log('- Email:', users.email);
      console.log('- App ID (Client ID):', users.ebay_app_id);
      console.log('- Cert ID (Client Secret):', users.ebay_cert_id);
      console.log('- Dev ID:', users.ebay_dev_id);
      console.log('- Redirect URI:', users.ebay_redirect_uri);

      // Export to environment
      console.log('\n=== Add these to your .env file or export them: ===');
      console.log(`export EBAY_CLIENT_ID="${users.ebay_app_id}"`);
      console.log(`export EBAY_CLIENT_SECRET="${users.ebay_cert_id}"`);
      console.log(`export EBAY_DEV_ID="${users.ebay_dev_id}"`);
      console.log(`export EBAY_REDIRECT_URI="${users.ebay_redirect_uri}"`);
      console.log(`export EBAY_USER_ID="${users.id}"`);

      return users;
    }

    // Get credentials for authenticated user
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (userError) {
      console.error('Error fetching user data:', userError);
      return;
    }

    console.log('eBay Credentials for authenticated user:');
    console.log('- User ID:', userData.id);
    console.log('- Email:', userData.email);
    console.log('- App ID:', userData.ebay_app_id);
    console.log('- Cert ID:', userData.ebay_cert_id);
    console.log('- Dev ID:', userData.ebay_dev_id);
    console.log('- Redirect URI:', userData.ebay_redirect_uri);

    return userData;

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the script
getEbayCredentials();