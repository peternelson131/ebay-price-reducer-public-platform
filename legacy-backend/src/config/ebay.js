const ebayConfig = {
  production: {
    baseUrl: 'https://api.ebay.com',
    tradingUrl: 'https://api.ebay.com/ws/api.dll',
    findingUrl: 'https://svcs.ebay.com/services/search/FindingService/v1',
    shoppingUrl: 'https://open.api.ebay.com/shopping'
  },
  sandbox: {
    baseUrl: 'https://api.sandbox.ebay.com',
    tradingUrl: 'https://api.sandbox.ebay.com/ws/api.dll',
    findingUrl: 'https://svcs.sandbox.ebay.com/services/search/FindingService/v1',
    shoppingUrl: 'https://open.api.sandbox.ebay.com/shopping'
  },

  // API credentials from environment variables
  credentials: {
    appId: process.env.EBAY_APP_ID,
    devId: process.env.EBAY_DEV_ID,
    certId: process.env.EBAY_CERT_ID,
    userToken: process.env.EBAY_USER_TOKEN,
    environment: process.env.EBAY_ENVIRONMENT || 'sandbox'
  },

  // Common headers
  getHeaders: function() {
    const env = this.credentials.environment === 'production' ? this.production : this.sandbox;
    return {
      'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
      'X-EBAY-API-DEV-NAME': this.credentials.devId,
      'X-EBAY-API-APP-NAME': this.credentials.appId,
      'X-EBAY-API-CERT-NAME': this.credentials.certId,
      'X-EBAY-API-SITEID': '0', // US site
      'Content-Type': 'text/xml'
    };
  },

  getBaseUrl: function() {
    return this.credentials.environment === 'production' ? this.production : this.sandbox;
  }
};

module.exports = ebayConfig;