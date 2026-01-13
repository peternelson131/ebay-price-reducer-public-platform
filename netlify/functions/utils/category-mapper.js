/**
 * Category Mapper v3
 * 
 * Uses eBay Taxonomy API for category detection.
 * No more custom mapping tables - eBay tells us the right category.
 */

const fetch = require('node-fetch');
const { decrypt } = require('./encryption');

// eBay API base URL - switch based on environment
const IS_SANDBOX = process.env.EBAY_ENVIRONMENT === 'sandbox';
const EBAY_API_BASE = IS_SANDBOX ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';

/**
 * Get eBay category for a product using Taxonomy API
 * @param {Object} supabase - Supabase client
 * @param {Object} keepaProduct - Product data from Keepa
 * @param {string} userId - User ID for getting eBay token
 * @returns {Object} - { categoryId, categoryName, matchType }
 */
async function getEbayCategory(supabase, keepaProduct, userId) {
  const title = keepaProduct.title || '';
  
  if (!title) {
    return {
      categoryId: '99',
      categoryName: 'Everything Else',
      matchType: 'default'
    };
  }

  try {
    // Get eBay access token
    const accessToken = await getAccessToken(supabase, userId);
    
    // Call Taxonomy API
    const query = title.substring(0, 100); // Max 100 chars
    const url = `${EBAY_API_BASE}/commerce/taxonomy/v1/category_tree/0/get_category_suggestions?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      console.log('Taxonomy API error:', response.status);
      return {
        categoryId: '99',
        categoryName: 'Everything Else',
        matchType: 'api_error'
      };
    }

    const data = await response.json();
    
    if (data.categorySuggestions && data.categorySuggestions.length > 0) {
      const suggestion = data.categorySuggestions[0];
      return {
        categoryId: suggestion.category.categoryId,
        categoryName: suggestion.category.categoryName,
        matchType: 'exact',
        confidence: suggestion.categoryTreeNodeLevel
      };
    }

    return {
      categoryId: '99',
      categoryName: 'Everything Else',
      matchType: 'no_match'
    };

  } catch (error) {
    console.error('Category detection error:', error.message);
    return {
      categoryId: '99',
      categoryName: 'Everything Else',
      matchType: 'error'
    };
  }
}

/**
 * Get valid eBay access token (with refresh if needed)
 */
async function getAccessToken(supabase, userId) {
  // Use platform-level eBay App credentials from environment
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('eBay platform credentials not configured');
  }

  const { data: user } = await supabase
    .from('users')
    .select('ebay_access_token, ebay_refresh_token, ebay_token_expires_at')
    .eq('id', userId)
    .single();

  if (!user?.ebay_refresh_token) {
    throw new Error('eBay not connected');
  }

  const refreshToken = decrypt(user.ebay_refresh_token);
  let accessToken = decrypt(user.ebay_access_token);

  // Check if token expired
  const expiresAt = user.ebay_token_expires_at ? new Date(user.ebay_token_expires_at) : new Date(0);
  const now = new Date();

  if (!accessToken || expiresAt.getTime() - 300000 < now.getTime()) {
    // Refresh token
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch(`${EBAY_API_BASE}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${creds}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: 'https://api.ebay.com/oauth/api_scope'
      })
    });

    const tokens = await response.json();
    if (tokens.access_token) {
      accessToken = tokens.access_token;
      // Note: Could store updated token here, but getValidAccessToken in ebay-oauth.js handles this
    }
  }

  return accessToken;
}

module.exports = {
  getEbayCategory
};
