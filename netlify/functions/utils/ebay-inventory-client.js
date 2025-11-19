const fetch = require('node-fetch');
const { EbayTokenService } = require('./ebay-token-service');

class EbayInventoryClient {
  constructor(userId) {
    this.userId = userId;
    this.tokenService = new EbayTokenService(userId);
    this.accessToken = null;
  }

  /**
   * Initialize client by getting access token
   */
  async initialize() {
    this.accessToken = await this.tokenService.getAccessToken();
  }

  /**
   * Make API call to eBay REST endpoints with retry logic
   */
  async makeApiCall(endpoint, method = 'GET', data = null, apiFamily = 'inventory', attempt = 0) {
    const MAX_RETRIES = 3;

    if (!this.accessToken) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    const baseUrls = {
      inventory: 'https://api.ebay.com/sell/inventory/v1',
      account: 'https://api.ebay.com/sell/account/v1',
      taxonomy: 'https://api.ebay.com/commerce/taxonomy/v1',
      metadata: 'https://api.ebay.com/sell/metadata/v1'
    };

    const url = `${baseUrls[apiFamily]}${endpoint}`;

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Content-Language': 'en-US',
        'Accept': 'application/json'
      }
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);

      // Retry on rate limit or server error
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        const backoffTime = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10 seconds
        console.log(`⏳ Retrying after ${backoffTime}ms (attempt ${attempt + 1}/${MAX_RETRIES}) - Status: ${response.status}`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        return this.makeApiCall(endpoint, method, data, apiFamily, attempt + 1);
      }

      // Handle 204 No Content (successful PUT requests)
      if (response.status === 204) {
        return { success: true };
      }

      const responseData = await response.json();

      if (!response.ok) {
        const errorMsg = responseData.errors?.[0]?.message ||
                        responseData.error?.message ||
                        'Unknown eBay API error';

        console.error('❌ eBay API Error Response:', JSON.stringify(responseData, null, 2));

        const error = new Error(`eBay API Error (${response.status}): ${errorMsg}`);
        // Attach full eBay error response for debugging
        error.ebayErrorResponse = responseData;
        error.ebayStatusCode = response.status;
        throw error;
      }

      return responseData;

    } catch (error) {
      // Network error - retry
      if (attempt < MAX_RETRIES && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED')) {
        const backoffTime = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.log(`⏳ Network error, retrying after ${backoffTime}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        return this.makeApiCall(endpoint, method, data, apiFamily, attempt + 1);
      }

      console.error(`eBay API call failed (${method} ${endpoint}):`, error);
      throw error;
    }
  }

  // ============ TAXONOMY API ============

  /**
   * Get category suggestions based on product keywords/title
   */
  async getCategorySuggestions(query) {
    const endpoint = `/category_tree/0/get_category_suggestions?q=${encodeURIComponent(query)}`;
    return await this.makeApiCall(endpoint, 'GET', null, 'taxonomy');
  }

  /**
   * Get required and recommended item aspects for a category
   */
  async getItemAspectsForCategory(categoryId) {
    const endpoint = `/category_tree/0/get_item_aspects_for_category?category_id=${categoryId}`;
    return await this.makeApiCall(endpoint, 'GET', null, 'taxonomy');
  }

  /**
   * Validate category and check if it's a leaf category
   */
  async validateCategory(categoryId) {
    const endpoint = `/category_tree/0/get_category_subtree?category_id=${categoryId}`;
    const data = await this.makeApiCall(endpoint, 'GET', null, 'taxonomy');

    const category = data.categorySubtree;

    if (category.childCategoryTreeNodes && category.childCategoryTreeNodes.length > 0) {
      throw new Error(`Category "${category.categoryName}" is not specific enough. Please select a subcategory.`);
    }

    return category;
  }

  /**
   * Get category aspects with database caching
   * @param {string} categoryId - eBay category ID
   * @param {boolean} forceRefresh - Force refresh from eBay API (skip cache)
   * @returns {Object} - { aspects: [], fromCache: boolean, lastFetched: timestamp }
   */
  async getCachedCategoryAspects(categoryId, forceRefresh = false) {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (!forceRefresh) {
      // Check cache first
      const { data: cached, error } = await supabase
        .from('ebay_category_aspects')
        .select('*')
        .eq('category_id', categoryId)
        .gt('expires_at', new Date().toISOString())  // Not expired
        .single();

      if (!error && cached) {
        console.log(`✓ Using cached aspects for category ${categoryId} (expires: ${cached.expires_at})`);
        return {
          aspects: cached.aspects.aspects || cached.aspects,  // Handle nested structure
          fromCache: true,
          lastFetched: cached.last_fetched_at
        };
      }
    }

    // Cache miss or force refresh - fetch from eBay API
    console.log(`⟳ Fetching fresh aspects from eBay API for category ${categoryId}`);
    const aspectsData = await this.getItemAspectsForCategory(categoryId);

    // Cache in database
    const requiredAspectNames = aspectsData.aspects
      ?.filter(a => a.aspectConstraint?.aspectRequired === true)
      .map(a => a.localizedAspectName) || [];

    await supabase
      .from('ebay_category_aspects')
      .upsert({
        category_id: categoryId,
        category_name: '',  // Will be updated by caller if available
        aspects: aspectsData,
        required_aspects: requiredAspectNames,
        last_fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()  // 7 days
      }, {
        onConflict: 'category_id'
      });

    console.log(`✓ Cached aspects for category ${categoryId} (expires in 7 days)`);

    return {
      aspects: aspectsData.aspects,
      fromCache: false,
      lastFetched: new Date().toISOString()
    };
  }

  /**
   * Update cached category name
   * @param {string} categoryId - eBay category ID
   * @param {string} categoryName - Category name
   */
  async updateCachedCategoryName(categoryId, categoryName) {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    await supabase
      .from('ebay_category_aspects')
      .update({ category_name: categoryName })
      .eq('category_id', categoryId);
  }

  /**
   * Get item condition policies for a category (with caching)
   * Returns allowed condition IDs and whether condition is required
   * @param {string} categoryId - eBay category ID
   * @param {string} marketplaceId - eBay marketplace (default: EBAY_US)
   * @returns {Object} - { conditionRequired, allowedConditions: [{conditionId, conditionDisplayName}] }
   */
  async getCategoryConditionPolicies(categoryId, marketplaceId = 'EBAY_US') {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Check if we have cached condition data (handle case where columns don't exist yet)
    try {
      const { data: cached, error } = await supabase
        .from('ebay_category_aspects')
        .select('allowed_conditions, condition_required')
        .eq('category_id', categoryId)
        .single();

      if (!error && cached && cached.allowed_conditions) {
        console.log(`✓ Using cached condition policies for category ${categoryId}`);
        return {
          conditionRequired: cached.condition_required || false,
          allowedConditions: cached.allowed_conditions
        };
      }
    } catch (cacheError) {
      console.warn(`⚠️ Cache lookup failed (columns may not exist yet):`, cacheError.message);
      // Continue to fetch from API
    }

    // Fetch from eBay Metadata API
    console.log(`⟳ Fetching condition policies from eBay for category ${categoryId}`);
    const endpoint = `/marketplace/${marketplaceId}/get_item_condition_policies?filter=categoryIds:{${categoryId}}`;
    const response = await this.makeApiCall(endpoint, 'GET', null, 'metadata');

    if (!response?.itemConditionPolicies || response.itemConditionPolicies.length === 0) {
      console.warn(`⚠️ No condition policies found for category ${categoryId}`);
      return { conditionRequired: false, allowedConditions: [] };
    }

    const policy = response.itemConditionPolicies[0];
    const conditionRequired = policy.categoryTreeNodeId ? true : false;

    // Extract allowed conditions - ensure conditionId is a string
    const allowedConditions = policy.itemConditions?.map(cond => ({
      conditionId: String(cond.conditionId),  // Ensure string format
      conditionDisplayName: cond.conditionDisplayName
    })) || [];

    // Try to update cache in database (may fail if columns don't exist)
    try {
      await supabase
        .from('ebay_category_aspects')
        .update({
          allowed_conditions: allowedConditions,
          condition_required: conditionRequired
        })
        .eq('category_id', categoryId);

      console.log(`✓ Cached condition policies for category ${categoryId}: ${allowedConditions.length} allowed conditions`);
    } catch (updateError) {
      console.warn(`⚠️ Could not cache condition policies (migration may not be applied):`, updateError.message);
      // Non-fatal - continue with the fetched data
    }

    return { conditionRequired, allowedConditions };
  }

  // ============ ACCOUNT API (Business Policies) ============

  /**
   * Get user's fulfillment/shipping policies
   */
  async getFulfillmentPolicies(marketplaceId = 'EBAY_US') {
    const endpoint = `/fulfillment_policy?marketplace_id=${marketplaceId}`;
    return await this.makeApiCall(endpoint, 'GET', null, 'account');
  }

  /**
   * Get user's payment policies
   */
  async getPaymentPolicies(marketplaceId = 'EBAY_US') {
    const endpoint = `/payment_policy?marketplace_id=${marketplaceId}`;
    return await this.makeApiCall(endpoint, 'GET', null, 'account');
  }

  /**
   * Get user's return policies
   */
  async getReturnPolicies(marketplaceId = 'EBAY_US') {
    const endpoint = `/return_policy?marketplace_id=${marketplaceId}`;
    return await this.makeApiCall(endpoint, 'GET', null, 'account');
  }

  // ============ INVENTORY API ============

  /**
   * Create or replace inventory item
   */
  async createOrReplaceInventoryItem(sku, itemData) {
    const endpoint = `/inventory_item/${sku}`;
    return await this.makeApiCall(endpoint, 'PUT', itemData, 'inventory');
  }

  /**
   * Get offers by SKU
   */
  async getOffersBySku(sku) {
    const endpoint = `/offer?sku=${encodeURIComponent(sku)}`;
    return await this.makeApiCall(endpoint, 'GET', null, 'inventory');
  }

  /**
   * Update existing offer
   */
  async updateOffer(offerId, offerData) {
    const endpoint = `/offer/${offerId}`;
    return await this.makeApiCall(endpoint, 'PUT', offerData, 'inventory');
  }

  /**
   * Create offer
   */
  async createOffer(offerData) {
    return await this.makeApiCall('/offer', 'POST', offerData, 'inventory');
  }

  /**
   * Publish offer to create live listing
   */
  async publishOffer(offerId) {
    const endpoint = `/offer/${offerId}/publish`;
    return await this.makeApiCall(endpoint, 'POST', {}, 'inventory');
  }

  /**
   * Delete inventory location
   * WARNING: Can only delete if no active inventory items are associated
   */
  async deleteInventoryLocation(merchantLocationKey) {
    try {
      const endpoint = `/location/${merchantLocationKey}`;
      await this.makeApiCall(endpoint, 'DELETE', null, 'inventory');
      console.log('✓ Inventory location deleted:', merchantLocationKey);
      return { deleted: true, merchantLocationKey };
    } catch (error) {
      if (error.ebayStatusCode === 404) {
        console.log('Location not found (already deleted?):', merchantLocationKey);
        return { deleted: false, notFound: true, merchantLocationKey };
      }
      throw error;
    }
  }

  /**
   * Get or create inventory location
   * Checks if location exists, creates if not found
   * NOTE: eBay does not allow updating inventory locations once created
   */
  async ensureInventoryLocation(merchantLocationKey, locationData) {
    try {
      // Try to get existing location
      const endpoint = `/location/${merchantLocationKey}`;
      const existingLocation = await this.makeApiCall(endpoint, 'GET', null, 'inventory');
      console.log('✓ Inventory location already exists:', merchantLocationKey);
      console.log('ℹ️  Note: eBay does not allow updating existing inventory locations');
      console.log('ℹ️  Using existing location. To change address, delete location in eBay Seller Hub first.');
      console.log('   Current location:', JSON.stringify(existingLocation, null, 2));

      return { exists: true, merchantLocationKey, existingLocation };
    } catch (error) {
      // Location doesn't exist, create it
      if (error.ebayStatusCode === 404) {
        console.log('Location not found, creating new location...');
        const endpoint = `/location/${merchantLocationKey}`;
        console.log('POST payload:', JSON.stringify(locationData, null, 2));
        const result = await this.makeApiCall(endpoint, 'POST', locationData, 'inventory');
        console.log('✓ Location created successfully:', result);
        return { exists: false, merchantLocationKey, created: true };
      } else {
        // Re-throw non-404 errors
        throw error;
      }
    }
  }
}

module.exports = { EbayInventoryClient };
