const { EbayTokenService } = require('./ebay-token-service');
const xml2js = require('xml2js');

/**
 * Simplified eBay API client
 * Uses EbayTokenService for all token operations
 */
class EbayApiClient {
  constructor(userId) {
    this.userId = userId;
    this.tokenService = new EbayTokenService(userId);
    this.accessToken = null;
  }

  /**
   * Initialize client (get valid access token)
   */
  async initialize() {
    this.accessToken = await this.tokenService.getAccessToken();
    return true;
  }

  /**
   * Build XML request for Trading API
   */
  buildXmlRequest(callName, requestBody) {
    const authToken = this.accessToken ? `<eBayAuthToken>${this.accessToken}</eBayAuthToken>` : '';

    return `<?xml version="1.0" encoding="utf-8"?>
      <${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
        <RequesterCredentials>
          ${authToken}
        </RequesterCredentials>
        ${requestBody}
      </${callName}Request>`;
  }

  /**
   * Parse XML response from Trading API
   */
  async parseXmlResponse(xmlData) {
    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      tagNameProcessors: [xml2js.processors.stripPrefix]
    });
    return await parser.parseStringPromise(xmlData);
  }

  /**
   * Make authenticated eBay API call
   */
  async makeApiCall(endpoint, method = 'GET', data = null, apiType = 'trading') {
    // Ensure we have valid access token
    if (!this.accessToken) {
      await this.initialize();
    }

    const baseUrls = {
      trading: 'https://api.ebay.com/ws/api.dll',
      finding: 'https://svcs.ebay.com/services/search/FindingService/v1',
      sell: 'https://api.ebay.com/sell'
    };

    // Trading API uses XML, others use JSON
    if (apiType === 'trading') {
      const xmlRequest = this.buildXmlRequest(endpoint, data || '');

      const headers = {
        'Content-Type': 'text/xml',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': endpoint
      };

      try {
        const response = await fetch(baseUrls.trading, {
          method: 'POST',
          headers,
          body: xmlRequest
        });

        const responseText = await response.text();
        const parsedResponse = await this.parseXmlResponse(responseText);

        // Check for eBay API errors
        const responseKey = `${endpoint}Response`;
        if (parsedResponse[responseKey] && parsedResponse[responseKey].Errors) {
          const errors = Array.isArray(parsedResponse[responseKey].Errors)
            ? parsedResponse[responseKey].Errors
            : [parsedResponse[responseKey].Errors];
          const errorMsg = errors.map(e => e.LongMessage || e.ShortMessage).join('; ');
          throw new Error(`eBay API Error: ${errorMsg}`);
        }

        return parsedResponse[responseKey];

      } catch (error) {
        console.error(`eBay Trading API call failed (${endpoint}):`, error);
        throw error;
      }
    } else {
      // JSON API (Finding, Sell APIs)
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`
      };

      const url = `${baseUrls[apiType]}${endpoint}`;

      try {
        const response = await fetch(url, {
          method,
          headers,
          body: data ? JSON.stringify(data) : undefined
        });

        const responseData = await response.json();

        if (!response.ok) {
          throw new Error(`eBay API Error: ${responseData.error?.message || 'Unknown error'}`);
        }

        return responseData;

      } catch (error) {
        console.error(`eBay API call failed (${endpoint}):`, error);
        throw error;
      }
    }
  }

  // ============================================================================
  // HIGH-LEVEL API METHODS
  // ============================================================================

  /**
   * Get active listings for user
   * @param {number} page - Page number (default: 1)
   * @param {number} limit - Listings per page (default: 50)
   * @returns {Promise<Object>} eBay GetMyeBaySelling response
   */
  async getActiveListings(page = 1, limit = 50) {
    const startTimeFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const startTimeTo = new Date().toISOString();

    const requestBody = `
      <ActiveList>
        <Include>true</Include>
        <Pagination>
          <EntriesPerPage>${limit}</EntriesPerPage>
          <PageNumber>${page}</PageNumber>
        </Pagination>
      </ActiveList>
      <DetailLevel>ReturnAll</DetailLevel>
    `;

    return await this.makeApiCall('GetMyeBaySelling', 'POST', requestBody, 'trading');
  }

  /**
   * Get specific item details
   * @param {string} itemId - eBay item ID
   * @returns {Promise<Object>} eBay GetItem response
   */
  async getItemDetails(itemId) {
    const requestBody = `
      <ItemID>${itemId}</ItemID>
      <DetailLevel>ReturnAll</DetailLevel>
    `;

    return await this.makeApiCall('GetItem', 'POST', requestBody, 'trading');
  }

  /**
   * Update item price
   * @param {string} itemId - eBay item ID
   * @param {number} newPrice - New price for the item
   * @returns {Promise<Object>} eBay ReviseItem response
   */
  async updateItemPrice(itemId, newPrice) {
    const requestBody = `
      <Item>
        <ItemID>${itemId}</ItemID>
        <StartPrice>${newPrice}</StartPrice>
      </Item>
    `;

    return await this.makeApiCall('ReviseItem', 'POST', requestBody, 'trading');
  }

  /**
   * End a listing
   * @param {string} itemId - eBay item ID
   * @param {string} reason - Ending reason (default: 'NotAvailable')
   * @returns {Promise<Object>} eBay EndItem response
   */
  async endListing(itemId, reason = 'NotAvailable') {
    const requestBody = `
      <ItemID>${itemId}</ItemID>
      <EndingReason>${reason}</EndingReason>
    `;

    return await this.makeApiCall('EndItem', 'POST', requestBody, 'trading');
  }

  /**
   * Search for similar items (for competitive pricing)
   * @param {string} keywords - Search keywords
   * @param {string} category - Category ID (optional)
   * @param {number} maxResults - Maximum results to return (default: 10)
   * @returns {Promise<Object>} eBay Finding API response
   */
  async searchSimilarItems(keywords, category = null, maxResults = 10) {
    // Get app ID from token service credentials
    const credentials = await this.tokenService.getCredentials();
    const appId = credentials.appId;

    if (!appId) {
      throw new Error('eBay App ID not configured. Please initialize the client first.');
    }

    const params = new URLSearchParams({
      'OPERATION-NAME': 'findItemsAdvanced',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': appId,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'keywords': keywords,
      'paginationInput.entriesPerPage': maxResults.toString(),
      'sortOrder': 'PricePlusShipping'
    });

    if (category) {
      params.append('categoryId', category);
    }

    const url = `https://svcs.ebay.com/services/search/FindingService/v1?${params}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error('Finding API call failed');
      }

      return data;

    } catch (error) {
      console.error('Error searching similar items:', error);
      throw error;
    }
  }

  /**
   * Get connection status
   * @returns {Promise<Object>} Connection status
   */
  async getConnectionStatus() {
    return await this.tokenService.getConnectionStatus();
  }

  /**
   * Disconnect eBay account
   * @returns {Promise<void>}
   */
  async disconnect() {
    return await this.tokenService.disconnect();
  }
}

module.exports = { EbayApiClient };
