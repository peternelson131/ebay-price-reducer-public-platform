const axios = require('axios');
const ebayConfig = require('../config/ebay');

class EbayService {
  constructor() {
    this.config = ebayConfig;
  }

  // Build XML request for Trading API
  buildTradingRequest(callName, requestData, userToken = null) {
    const token = userToken || this.config.credentials.userToken;

    return `<?xml version="1.0" encoding="utf-8"?>
      <${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
        <RequesterCredentials>
          <eBayAuthToken>${token}</eBayAuthToken>
        </RequesterCredentials>
        ${requestData}
      </${callName}Request>`;
  }

  // Get seller's active listings
  async getSellerListings(userId = null, page = 1, perPage = 100) {
    try {
      const requestData = `
        <UserID>${userId || 'current_user'}</UserID>
        <GranularityLevel>Fine</GranularityLevel>
        <Pagination>
          <EntriesPerPage>${perPage}</EntriesPerPage>
          <PageNumber>${page}</PageNumber>
        </Pagination>
      `;

      const xmlRequest = this.buildTradingRequest('GetMyeBaySelling', requestData);

      const response = await axios.post(this.config.getBaseUrl().tradingUrl, xmlRequest, {
        headers: {
          ...this.config.getHeaders(),
          'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling'
        }
      });

      return this.parseXMLResponse(response.data);
    } catch (error) {
      throw new Error(`Failed to get seller listings: ${error.message}`);
    }
  }

  // Get specific item details
  async getItemDetails(itemId) {
    try {
      const requestData = `
        <ItemID>${itemId}</ItemID>
        <DetailLevel>ReturnAll</DetailLevel>
      `;

      const xmlRequest = this.buildTradingRequest('GetItem', requestData);

      const response = await axios.post(this.config.getBaseUrl().tradingUrl, xmlRequest, {
        headers: {
          ...this.config.getHeaders(),
          'X-EBAY-API-CALL-NAME': 'GetItem'
        }
      });

      return this.parseXMLResponse(response.data);
    } catch (error) {
      throw new Error(`Failed to get item details: ${error.message}`);
    }
  }

  // Update item price (revise listing)
  async updateItemPrice(itemId, newPrice, currency = 'USD') {
    try {
      const requestData = `
        <Item>
          <ItemID>${itemId}</ItemID>
          <StartPrice currencyID="${currency}">${newPrice}</StartPrice>
        </Item>
      `;

      const xmlRequest = this.buildTradingRequest('ReviseItem', requestData);

      const response = await axios.post(this.config.getBaseUrl().tradingUrl, xmlRequest, {
        headers: {
          ...this.config.getHeaders(),
          'X-EBAY-API-CALL-NAME': 'ReviseItem'
        }
      });

      return this.parseXMLResponse(response.data);
    } catch (error) {
      throw new Error(`Failed to update item price: ${error.message}`);
    }
  }

  // Search completed items to analyze market prices
  async searchCompletedListings(keywords, categoryId = null, daysBack = 30) {
    try {
      const endTime = new Date();
      const startTime = new Date();
      startTime.setDate(startTime.getDate() - daysBack);

      const params = {
        'OPERATION-NAME': 'findCompletedItems',
        'SERVICE-VERSION': '1.0.0',
        'SECURITY-APPNAME': this.config.credentials.appId,
        'RESPONSE-DATA-FORMAT': 'JSON',
        'keywords': keywords,
        'itemFilter(0).name': 'EndTimeFrom',
        'itemFilter(0).value': startTime.toISOString(),
        'itemFilter(1).name': 'EndTimeTo',
        'itemFilter(1).value': endTime.toISOString(),
        'itemFilter(2).name': 'SoldItemsOnly',
        'itemFilter(2).value': 'true',
        'sortOrder': 'EndTimeSoonest'
      };

      if (categoryId) {
        params['categoryId'] = categoryId;
      }

      const response = await axios.get(this.config.getBaseUrl().findingUrl, { params });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to search completed listings: ${error.message}`);
    }
  }

  // Calculate suggested price based on market analysis
  calculateSuggestedPrice(completedListings, currentPrice, reductionPercentage = 0.05) {
    if (!completedListings || !completedListings.findCompletedItemsResponse) {
      return currentPrice * (1 - reductionPercentage);
    }

    const items = completedListings.findCompletedItemsResponse[0].searchResult[0].item || [];

    if (items.length === 0) {
      return currentPrice * (1 - reductionPercentage);
    }

    // Calculate average sold price
    const soldPrices = items
      .filter(item => item.sellingStatus && item.sellingStatus[0].currentPrice)
      .map(item => parseFloat(item.sellingStatus[0].currentPrice[0].__value__));

    if (soldPrices.length === 0) {
      return currentPrice * (1 - reductionPercentage);
    }

    const averagePrice = soldPrices.reduce((sum, price) => sum + price, 0) / soldPrices.length;
    const suggestedPrice = Math.min(averagePrice * 0.95, currentPrice * (1 - reductionPercentage));

    return Math.max(suggestedPrice, currentPrice * 0.7); // Don't reduce below 70% of original
  }

  // Simple XML parser helper
  parseXMLResponse(xmlData) {
    // This is a simplified parser - in production, use a proper XML parser like xml2js
    try {
      return { success: true, data: xmlData };
    } catch (error) {
      throw new Error(`Failed to parse XML response: ${error.message}`);
    }
  }
}

module.exports = EbayService;