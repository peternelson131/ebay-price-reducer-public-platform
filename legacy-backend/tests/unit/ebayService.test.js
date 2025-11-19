const EbayService = require('../../src/services/ebayService');
const axios = require('axios');

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

// Mock ebay config
jest.mock('../../src/config/ebay', () => ({
  credentials: {
    appId: 'test_app_id',
    devId: 'test_dev_id',
    certId: 'test_cert_id',
    userToken: 'test_user_token'
  },
  getBaseUrl: () => ({
    tradingUrl: 'https://api.sandbox.ebay.com/ws/api/trading/v1',
    findingUrl: 'https://svcs.sandbox.ebay.com/services/search/FindingService/v1'
  }),
  getHeaders: () => ({
    'Content-Type': 'text/xml',
    'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
    'X-EBAY-API-DEV-NAME': 'test_dev_id',
    'X-EBAY-API-APP-NAME': 'test_app_id',
    'X-EBAY-API-CERT-NAME': 'test_cert_id',
    'X-EBAY-API-SITEID': '0'
  })
}));

describe('EbayService', () => {
  let ebayService;

  beforeEach(() => {
    ebayService = new EbayService();
    jest.clearAllMocks();
  });

  describe('buildTradingRequest', () => {
    it('should build proper XML request structure', () => {
      const result = ebayService.buildTradingRequest('GetItem', '<ItemID>123</ItemID>');

      expect(result).toContain('<?xml version="1.0" encoding="utf-8"?>');
      expect(result).toContain('<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">');
      expect(result).toContain('<RequesterCredentials>');
      expect(result).toContain('<eBayAuthToken>test_user_token</eBayAuthToken>');
      expect(result).toContain('<ItemID>123</ItemID>');
      expect(result).toContain('</GetItemRequest>');
    });

    it('should use custom user token when provided', () => {
      const customToken = 'custom_token_123';
      const result = ebayService.buildTradingRequest('GetItem', '<ItemID>123</ItemID>', customToken);

      expect(result).toContain(`<eBayAuthToken>${customToken}</eBayAuthToken>`);
    });

    it('should handle special characters in request data', () => {
      const requestData = '<Title>Item with &amp; symbol</Title>';
      const result = ebayService.buildTradingRequest('AddItem', requestData);

      expect(result).toContain(requestData);
    });
  });

  describe('getSellerListings', () => {
    const mockXmlResponse = '<?xml version="1.0" encoding="UTF-8"?><GetMyeBaySellingResponse>...</GetMyeBaySellingResponse>';

    beforeEach(() => {
      mockedAxios.post.mockResolvedValue({ data: mockXmlResponse });
    });

    it('should make correct API call for seller listings', async () => {
      await ebayService.getSellerListings('testuser', 1, 50);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.sandbox.ebay.com/ws/api/trading/v1',
        expect.stringContaining('<GetMyeBaySellingRequest'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling'
          })
        })
      );
    });

    it('should handle pagination parameters correctly', async () => {
      await ebayService.getSellerListings('testuser', 3, 25);

      const [, xmlRequest] = mockedAxios.post.mock.calls[0];
      expect(xmlRequest).toContain('<PageNumber>3</PageNumber>');
      expect(xmlRequest).toContain('<EntriesPerPage>25</EntriesPerPage>');
    });

    it('should use default values when parameters not provided', async () => {
      await ebayService.getSellerListings();

      const [, xmlRequest] = mockedAxios.post.mock.calls[0];
      expect(xmlRequest).toContain('<PageNumber>1</PageNumber>');
      expect(xmlRequest).toContain('<EntriesPerPage>100</EntriesPerPage>');
      expect(xmlRequest).toContain('<UserID>current_user</UserID>');
    });

    it('should handle API errors gracefully', async () => {
      const errorMessage = 'Network error';
      mockedAxios.post.mockRejectedValue(new Error(errorMessage));

      await expect(ebayService.getSellerListings()).rejects.toThrow('Failed to get seller listings: Network error');
    });
  });

  describe('getItemDetails', () => {
    const mockXmlResponse = '<?xml version="1.0" encoding="UTF-8"?><GetItemResponse>...</GetItemResponse>';

    beforeEach(() => {
      mockedAxios.post.mockResolvedValue({ data: mockXmlResponse });
    });

    it('should make correct API call for item details', async () => {
      const itemId = '123456789';
      await ebayService.getItemDetails(itemId);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.sandbox.ebay.com/ws/api/trading/v1',
        expect.stringContaining(`<ItemID>${itemId}</ItemID>`),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-EBAY-API-CALL-NAME': 'GetItem'
          })
        })
      );
    });

    it('should include DetailLevel in request', async () => {
      await ebayService.getItemDetails('123456789');

      const [, xmlRequest] = mockedAxios.post.mock.calls[0];
      expect(xmlRequest).toContain('<DetailLevel>ReturnAll</DetailLevel>');
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Item not found'));

      await expect(ebayService.getItemDetails('invalid_id')).rejects.toThrow('Failed to get item details: Item not found');
    });
  });

  describe('updateItemPrice', () => {
    const mockXmlResponse = '<?xml version="1.0" encoding="UTF-8"?><ReviseItemResponse>...</ReviseItemResponse>';

    beforeEach(() => {
      mockedAxios.post.mockResolvedValue({ data: mockXmlResponse });
    });

    it('should make correct API call for price update', async () => {
      const itemId = '123456789';
      const newPrice = 29.99;

      await ebayService.updateItemPrice(itemId, newPrice);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.sandbox.ebay.com/ws/api/trading/v1',
        expect.stringContaining(`<ItemID>${itemId}</ItemID>`),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-EBAY-API-CALL-NAME': 'ReviseItem'
          })
        })
      );

      const [, xmlRequest] = mockedAxios.post.mock.calls[0];
      expect(xmlRequest).toContain(`<StartPrice currencyID="USD">${newPrice}</StartPrice>`);
    });

    it('should handle custom currency', async () => {
      await ebayService.updateItemPrice('123456789', 25.00, 'EUR');

      const [, xmlRequest] = mockedAxios.post.mock.calls[0];
      expect(xmlRequest).toContain('<StartPrice currencyID="EUR">25</StartPrice>');
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Price update failed'));

      await expect(ebayService.updateItemPrice('123456789', 29.99)).rejects.toThrow('Failed to update item price: Price update failed');
    });
  });

  describe('searchCompletedListings', () => {
    const mockApiResponse = {
      data: {
        findCompletedItemsResponse: [{
          searchResult: [{
            item: [
              {
                itemId: ['123456789'],
                title: ['Test Item'],
                sellingStatus: [{
                  currentPrice: [{ __value__: '25.99' }]
                }]
              }
            ]
          }]
        }]
      }
    };

    beforeEach(() => {
      mockedAxios.get.mockResolvedValue(mockApiResponse);
    });

    it('should make correct API call for completed listings search', async () => {
      const keywords = 'test item';
      await ebayService.searchCompletedListings(keywords);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://svcs.sandbox.ebay.com/services/search/FindingService/v1',
        expect.objectContaining({
          params: expect.objectContaining({
            'OPERATION-NAME': 'findCompletedItems',
            'keywords': keywords,
            'itemFilter(2).name': 'SoldItemsOnly',
            'itemFilter(2).value': 'true'
          })
        })
      );
    });

    it('should include category filter when provided', async () => {
      await ebayService.searchCompletedListings('test item', '12345');

      const [, config] = mockedAxios.get.mock.calls[0];
      expect(config.params.categoryId).toBe('12345');
    });

    it('should set correct date range', async () => {
      const mockDate = new Date('2023-01-15T10:00:00Z');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      await ebayService.searchCompletedListings('test item', null, 7);

      const [, config] = mockedAxios.get.mock.calls[0];
      expect(config.params['itemFilter(0).name']).toBe('EndTimeFrom');
      expect(config.params['itemFilter(1).name']).toBe('EndTimeTo');

      global.Date.mockRestore();
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Search failed'));

      await expect(ebayService.searchCompletedListings('test')).rejects.toThrow('Failed to search completed listings: Search failed');
    });
  });

  describe('calculateSuggestedPrice', () => {
    const mockCompletedListings = {
      findCompletedItemsResponse: [{
        searchResult: [{
          item: [
            {
              sellingStatus: [{ currentPrice: [{ __value__: '30.00' }] }]
            },
            {
              sellingStatus: [{ currentPrice: [{ __value__: '25.00' }] }]
            },
            {
              sellingStatus: [{ currentPrice: [{ __value__: '35.00' }] }]
            }
          ]
        }]
      }]
    };

    it('should calculate price based on market data', () => {
      const currentPrice = 40.00;
      const result = ebayService.calculateSuggestedPrice(mockCompletedListings, currentPrice);

      // Average of [30, 25, 35] = 30, then 30 * 0.95 = 28.5
      // Compare with currentPrice * 0.95 = 38, take the minimum = 28.5
      expect(result).toBe(28.5);
    });

    it('should use default reduction when no market data available', () => {
      const currentPrice = 40.00;
      const result = ebayService.calculateSuggestedPrice(null, currentPrice, 0.1);

      expect(result).toBe(36.00); // 40 * (1 - 0.1)
    });

    it('should use default reduction when no items found', () => {
      const emptyListings = {
        findCompletedItemsResponse: [{
          searchResult: [{ item: [] }]
        }]
      };
      const currentPrice = 40.00;
      const result = ebayService.calculateSuggestedPrice(emptyListings, currentPrice);

      expect(result).toBe(38.00); // 40 * (1 - 0.05)
    });

    it('should not reduce below 70% of original price', () => {
      const lowPriceListings = {
        findCompletedItemsResponse: [{
          searchResult: [{
            item: [
              { sellingStatus: [{ currentPrice: [{ __value__: '5.00' }] }] },
              { sellingStatus: [{ currentPrice: [{ __value__: '6.00' }] }] }
            ]
          }]
        }]
      };
      const currentPrice = 40.00;
      const result = ebayService.calculateSuggestedPrice(lowPriceListings, currentPrice);

      expect(result).toBe(28.00); // 40 * 0.7 (minimum threshold)
    });

    it('should handle items without valid prices', () => {
      const invalidPriceListings = {
        findCompletedItemsResponse: [{
          searchResult: [{
            item: [
              { sellingStatus: [{}] }, // No price
              { title: ['Item without selling status'] }, // No selling status
              { sellingStatus: [{ currentPrice: [{ __value__: '25.00' }] }] } // Valid price
            ]
          }]
        }]
      };
      const currentPrice = 40.00;
      const result = ebayService.calculateSuggestedPrice(invalidPriceListings, currentPrice);

      // Should use only the valid price: 25 * 0.95 = 23.75
      // Compare with currentPrice * 0.95 = 38, take minimum = 23.75
      // But ensure it's not below 70% threshold: 40 * 0.7 = 28
      expect(result).toBe(28);
    });
  });

  describe('parseXMLResponse', () => {
    it('should return success object for valid XML', () => {
      const xmlData = '<?xml version="1.0"?><response>test</response>';
      const result = ebayService.parseXMLResponse(xmlData);

      expect(result).toEqual({
        success: true,
        data: xmlData
      });
    });

    it('should handle empty XML data', () => {
      const result = ebayService.parseXMLResponse('');

      expect(result).toEqual({
        success: true,
        data: ''
      });
    });
  });
});