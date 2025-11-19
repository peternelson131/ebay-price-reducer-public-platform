const axios = require('axios');
const xml2js = require('xml2js');

class EbayClient {
  constructor() {
    this.appId = process.env.EBAY_APP_ID;
    this.devId = process.env.EBAY_DEV_ID;
    this.certId = process.env.EBAY_CERT_ID;
    this.userToken = process.env.EBAY_USER_TOKEN;
    this.environment = process.env.EBAY_ENVIRONMENT || 'sandbox';
    this.siteId = process.env.EBAY_SITE_ID || '0';
    this.apiVersion = process.env.EBAY_API_VERSION || '967';

    this.baseUrl = this.environment === 'sandbox'
      ? 'https://api.sandbox.ebay.com/ws/api.dll'
      : 'https://api.ebay.com/ws/api.dll';

    // Validate required credentials
    if (!this.appId || !this.devId || !this.certId) {
      throw new Error('Missing required eBay API credentials. Check environment variables.');
    }
  }

  async makeRequest(callName, requestBody) {
    const xmlRequest = this.buildXmlRequest(callName, requestBody);

    try {
      const response = await axios.post(this.baseUrl, xmlRequest, {
        headers: {
          'X-EBAY-API-SITEID': this.siteId,
          'X-EBAY-API-COMPATIBILITY-LEVEL': this.apiVersion,
          'X-EBAY-API-CALL-NAME': callName,
          'X-EBAY-API-APP-NAME': this.appId,
          'X-EBAY-API-DEV-NAME': this.devId,
          'X-EBAY-API-CERT-NAME': this.certId,
          'Content-Type': 'text/xml'
        }
      });

      const parsedResponse = await this.parseXmlResponse(response.data);

      // Check for eBay API errors
      const responseKey = `${callName}Response`;
      if (parsedResponse[responseKey] && parsedResponse[responseKey].Errors) {
        throw new Error(`eBay API Error: ${JSON.stringify(parsedResponse[responseKey].Errors)}`);
      }

      return parsedResponse;
    } catch (error) {
      if (error.response) {
        throw new Error(`eBay API HTTP Error: ${error.response.status} - ${error.response.statusText}`);
      }
      throw new Error(`eBay API Error: ${error.message}`);
    }
  }

  buildXmlRequest(callName, requestBody) {
    const authToken = this.userToken ? `<eBayAuthToken>${this.userToken}</eBayAuthToken>` : '';

    return `<?xml version="1.0" encoding="utf-8"?>
      <${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">
        <RequesterCredentials>
          ${authToken}
        </RequesterCredentials>
        ${requestBody}
      </${callName}Request>`;
  }

  async parseXmlResponse(xmlData) {
    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      tagNameProcessors: [xml2js.processors.stripPrefix]
    });
    return await parser.parseStringPromise(xmlData);
  }

  // Test connection with eBay
  async testConnection() {
    try {
      const response = await this.makeRequest('GeteBayOfficialTime', '');
      return {
        success: true,
        timestamp: response.GeteBayOfficialTimeResponse?.Timestamp,
        environment: this.environment
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        environment: this.environment
      };
    }
  }

  // Get seller's active listings
  async getMyeBaySelling(pageNumber = 1, entriesPerPage = 100) {
    const requestBody = `
      <ActiveList>
        <Include>true</Include>
        <Pagination>
          <EntriesPerPage>${entriesPerPage}</EntriesPerPage>
          <PageNumber>${pageNumber}</PageNumber>
        </Pagination>
      </ActiveList>
    `;

    try {
      const response = await this.makeRequest('GetMyeBaySelling', requestBody);
      return response.GetMyeBaySellingResponse;
    } catch (error) {
      throw new Error(`Failed to fetch listings: ${error.message}`);
    }
  }

  // Get specific item details
  async getItem(itemId) {
    const requestBody = `
      <ItemID>${itemId}</ItemID>
      <DetailLevel>ReturnAll</DetailLevel>
    `;

    try {
      const response = await this.makeRequest('GetItem', requestBody);
      return response.GetItemResponse;
    } catch (error) {
      throw new Error(`Failed to fetch item ${itemId}: ${error.message}`);
    }
  }

  // Revise item price
  async reviseItemPrice(itemId, newPrice) {
    const requestBody = `
      <Item>
        <ItemID>${itemId}</ItemID>
        <StartPrice>${newPrice}</StartPrice>
      </Item>
    `;

    try {
      const response = await this.makeRequest('ReviseItem', requestBody);
      return response.ReviseItemResponse;
    } catch (error) {
      throw new Error(`Failed to revise item ${itemId}: ${error.message}`);
    }
  }

  // Get category features (for validation)
  async getCategoryFeatures(categoryId) {
    const requestBody = `
      <CategoryID>${categoryId}</CategoryID>
      <DetailLevel>ReturnAll</DetailLevel>
    `;

    try {
      const response = await this.makeRequest('GetCategoryFeatures', requestBody);
      return response.GetCategoryFeaturesResponse;
    } catch (error) {
      throw new Error(`Failed to fetch category features: ${error.message}`);
    }
  }

  // Search for completed items (market analysis)
  async getSearchResults(keywords, categoryId = null, maxResults = 100) {
    let requestBody = `
      <Query>${keywords}</Query>
      <MaxEntries>${maxResults}</MaxEntries>
      <IncludeSelector>Details</IncludeSelector>
    `;

    if (categoryId) {
      requestBody += `<CategoryID>${categoryId}</CategoryID>`;
    }

    try {
      const response = await this.makeRequest('FindItemsAdvanced', requestBody);
      return response.FindItemsAdvancedResponse;
    } catch (error) {
      throw new Error(`Failed to search items: ${error.message}`);
    }
  }

  // Utility: Format price for eBay (2 decimal places)
  formatPrice(price) {
    return parseFloat(price).toFixed(2);
  }

  // Utility: Check if environment is sandbox
  isSandbox() {
    return this.environment === 'sandbox';
  }

  // Utility: Get environment info
  getEnvironmentInfo() {
    return {
      environment: this.environment,
      baseUrl: this.baseUrl,
      siteId: this.siteId,
      apiVersion: this.apiVersion,
      hasUserToken: !!this.userToken
    };
  }
}

module.exports = EbayClient;