/**
 * eBay Browse API Client
 *
 * Handles competitive pricing searches using the Buy Browse API
 * Requires OAuth access token with buy scopes
 */

class EbayBrowseClient {
  constructor(appId, certId, userEbaySellerId = null) {
    this.appId = appId;
    this.certId = certId;
    this.userEbaySellerId = userEbaySellerId;
    this.baseUrl = 'https://api.ebay.com/buy/browse/v1';
    this.accessToken = null; // Will be fetched when needed
  }

  /**
   * Get Application Access Token for Browse API
   * Browse API can use app-level auth instead of user OAuth
   */
  async getAppAccessToken() {
    if (this.accessToken) return this.accessToken;

    const tokenUrl = 'https://api.ebay.com/identity/v1/oauth2/token';
    const credentials = Buffer.from(`${this.appId}:${this.certId}`).toString('base64');

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`
        },
        body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Failed to get app access token:', data);
        return null;
      }

      this.accessToken = data.access_token;
      console.log('✓ Got Browse API app access token');
      return this.accessToken;

    } catch (error) {
      console.error('Error getting app access token:', error);
      return null;
    }
  }

  /**
   * Search for items by GTIN (UPC/EAN)
   * @param {string} gtin - The GTIN/UPC code
   * @returns {Promise<Array>} Array of competitor listings
   */
  async searchByGtin(gtin) {
    const url = `${this.baseUrl}/item_summary/search`;
    const params = new URLSearchParams({
      gtin: gtin,
      limit: 50
    });

    return this._makeRequest(url, params);
  }

  /**
   * Search by title keywords and category
   * @param {string} keywords - Search keywords from title
   * @param {string} categoryId - eBay category ID
   * @returns {Promise<Array>} Array of competitor listings
   */
  async searchByTitleAndCategory(keywords, categoryId) {
    const url = `${this.baseUrl}/item_summary/search`;
    const params = new URLSearchParams({
      q: keywords,
      category_ids: categoryId,
      limit: 50
    });

    return this._makeRequest(url, params);
  }

  /**
   * Search by title keywords only (broadest search)
   * @param {string} keywords - Search keywords from title
   * @returns {Promise<Array>} Array of competitor listings
   */
  async searchByTitle(keywords) {
    const url = `${this.baseUrl}/item_summary/search`;
    const params = new URLSearchParams({
      q: keywords,
      limit: 50
    });

    return this._makeRequest(url, params);
  }

  /**
   * Extract key search terms from listing title
   * Removes common words and keeps meaningful terms
   */
  extractKeywords(title) {
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'new', 'used', 'free', 'shipping', 'fast',
      'buy', 'now', 'get', 'sale', 'best', 'top', 'great', 'good', 'quality'
    ]);

    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 2 && !commonWords.has(word))
      .slice(0, 5) // Take first 5 meaningful words
      .join(' ');
  }

  /**
   * Filter out listings from the same seller
   */
  filterOwnListings(items) {
    if (!this.userEbaySellerId) return items;

    return items.filter(item => {
      const sellerUsername = item.seller?.username;
      return sellerUsername !== this.userEbaySellerId;
    });
  }

  /**
   * Remove price outliers using median-based filtering
   */
  filterOutliers(items) {
    if (items.length < 3) return items; // Need at least 3 items

    // Extract prices
    const prices = items
      .map(item => parseFloat(item.price?.value || 0))
      .filter(price => price > 0)
      .sort((a, b) => a - b);

    if (prices.length === 0) return items;

    // Calculate median
    const median = prices[Math.floor(prices.length / 2)];
    const minPrice = median * 0.3;
    const maxPrice = median * 3;

    // Filter items within range
    return items.filter(item => {
      const price = parseFloat(item.price?.value || 0);
      return price >= minPrice && price <= maxPrice;
    });
  }

  /**
   * Make authenticated request to Browse API
   * Uses Application Access Token (app-level, not user-level)
   */
  async _makeRequest(url, params) {
    // Get app access token first
    const token = await this.getAppAccessToken();
    if (!token) {
      console.error('No access token available for Browse API');
      return [];
    }

    const fullUrl = `${url}?${params.toString()}`;

    try {
      const response = await fetch(fullUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Browse API error:', response.status, errorText);
        console.error('Full URL:', fullUrl);
        return [];
      }

      const data = await response.json();
      return data.itemSummaries || [];

    } catch (error) {
      console.error('Browse API request failed:', error);
      return [];
    }
  }
}

module.exports = { EbayBrowseClient };
