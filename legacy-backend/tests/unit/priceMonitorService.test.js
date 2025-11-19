const PriceMonitorService = require('../../src/services/priceMonitorService');
const EbayService = require('../../src/services/ebayService');
const Listing = require('../../src/models/Listing');
const cron = require('node-cron');

// Mock dependencies
jest.mock('../../src/services/ebayService');
jest.mock('../../src/models/Listing');
jest.mock('node-cron');

describe('PriceMonitorService', () => {
  let priceMonitorService;
  let mockEbayService;
  let mockCronJob;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock cron job
    mockCronJob = {
      start: jest.fn(),
      stop: jest.fn()
    };
    cron.schedule.mockReturnValue(mockCronJob);

    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    priceMonitorService = new PriceMonitorService();
    mockEbayService = priceMonitorService.ebayService;
  });

  afterEach(() => {
    console.log.mockRestore();
    console.error.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize with correct default values', () => {
      expect(priceMonitorService.isRunning).toBe(false);
      expect(priceMonitorService.jobs).toBeInstanceOf(Map);
      expect(priceMonitorService.jobs.size).toBe(0);
      expect(priceMonitorService.ebayService).toBeInstanceOf(EbayService);
    });
  });

  describe('start', () => {
    it('should start the monitoring service and schedule jobs', () => {
      priceMonitorService.start();

      expect(cron.schedule).toHaveBeenCalledTimes(3);
      expect(cron.schedule).toHaveBeenCalledWith('0 * * * *', expect.any(Function), { scheduled: false });
      expect(cron.schedule).toHaveBeenCalledWith('0 */6 * * *', expect.any(Function), { scheduled: false });
      expect(cron.schedule).toHaveBeenCalledWith('0 2 * * *', expect.any(Function), { scheduled: false });

      expect(mockCronJob.start).toHaveBeenCalledTimes(3);
      expect(priceMonitorService.isRunning).toBe(true);
      expect(priceMonitorService.jobs.size).toBe(3);
    });

    it('should not start if already running', () => {
      priceMonitorService.isRunning = true;
      priceMonitorService.start();

      expect(cron.schedule).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('Price monitoring service is already running');
    });
  });

  describe('stop', () => {
    beforeEach(() => {
      priceMonitorService.start();
    });

    it('should stop all jobs and clear the jobs map', () => {
      priceMonitorService.stop();

      expect(mockCronJob.stop).toHaveBeenCalledTimes(3);
      expect(priceMonitorService.jobs.size).toBe(0);
      expect(priceMonitorService.isRunning).toBe(false);
    });

    it('should not stop if not running', () => {
      priceMonitorService.isRunning = false;
      priceMonitorService.stop();

      expect(console.log).toHaveBeenCalledWith('Price monitoring service is not running');
    });
  });

  describe('checkPriceReductions', () => {
    const mockListings = [
      {
        _id: 'listing1',
        ebayItemId: '123456',
        currentPrice: 50.00,
        minimumPrice: 25.00,
        priceReductionEnabled: true,
        listingStatus: 'Active'
      },
      {
        _id: 'listing2',
        ebayItemId: '789012',
        currentPrice: 30.00,
        minimumPrice: 15.00,
        priceReductionEnabled: true,
        listingStatus: 'Active'
      }
    ];

    beforeEach(() => {
      Listing.find.mockResolvedValue(mockListings);
      priceMonitorService.processListingReduction = jest.fn().mockResolvedValue();
    });

    it('should find and process listings due for reduction', async () => {
      await priceMonitorService.checkPriceReductions();

      expect(Listing.find).toHaveBeenCalledWith({
        priceReductionEnabled: true,
        listingStatus: 'Active',
        $or: [
          { nextPriceReduction: { $lte: expect.any(Date) } },
          { nextPriceReduction: null }
        ]
      });

      expect(priceMonitorService.processListingReduction).toHaveBeenCalledTimes(2);
      expect(priceMonitorService.processListingReduction).toHaveBeenCalledWith(mockListings[0]);
      expect(priceMonitorService.processListingReduction).toHaveBeenCalledWith(mockListings[1]);
    });

    it('should handle database errors gracefully', async () => {
      const error = new Error('Database connection failed');
      Listing.find.mockRejectedValue(error);

      await priceMonitorService.checkPriceReductions();

      expect(console.error).toHaveBeenCalledWith('Error checking price reductions:', error);
    });

    it('should handle empty results', async () => {
      Listing.find.mockResolvedValue([]);

      await priceMonitorService.checkPriceReductions();

      expect(priceMonitorService.processListingReduction).not.toHaveBeenCalled();
    });
  });

  describe('processListingReduction', () => {
    let mockListing;

    beforeEach(() => {
      mockListing = {
        _id: 'listing1',
        ebayItemId: '123456',
        currentPrice: 50.00,
        minimumPrice: 25.00,
        currency: 'USD',
        reductionStrategy: 'fixed_percentage',
        calculateNextPrice: jest.fn().mockReturnValue(45.00),
        calculateNextReductionDate: jest.fn().mockReturnValue(new Date()),
        priceHistory: [],
        syncErrors: [],
        save: jest.fn().mockResolvedValue()
      };

      mockEbayService.updateItemPrice.mockResolvedValue({ success: true });
    });

    it('should skip listing already at minimum price', async () => {
      mockListing.currentPrice = 25.00; // At minimum price

      await priceMonitorService.processListingReduction(mockListing);

      expect(mockEbayService.updateItemPrice).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('Listing 123456 already at minimum price');
    });

    it('should skip if new price is not lower than current', async () => {
      mockListing.calculateNextPrice.mockReturnValue(55.00); // Higher than current

      await priceMonitorService.processListingReduction(mockListing);

      expect(mockEbayService.updateItemPrice).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('No price reduction needed for listing 123456');
    });

    it('should successfully reduce price when conditions are met', async () => {
      await priceMonitorService.processListingReduction(mockListing);

      expect(mockListing.calculateNextPrice).toHaveBeenCalled();
      expect(mockEbayService.updateItemPrice).toHaveBeenCalledWith('123456', 45.00, 'USD');

      expect(mockListing.currentPrice).toBe(45.00);
      expect(mockListing.lastPriceReduction).toBeInstanceOf(Date);
      expect(mockListing.calculateNextReductionDate).toHaveBeenCalled();
      expect(mockListing.priceHistory).toHaveLength(1);
      expect(mockListing.priceHistory[0]).toEqual({
        price: 45.00,
        date: expect.any(Date),
        reason: 'fixed_percentage_reduction'
      });
      expect(mockListing.save).toHaveBeenCalled();
    });

    it('should handle market-based strategy', async () => {
      mockListing.reductionStrategy = 'market_based';
      const mockMarketData = { averageCompetitorPrice: 40.00 };
      priceMonitorService.getMarketData = jest.fn().mockResolvedValue(mockMarketData);

      await priceMonitorService.processListingReduction(mockListing);

      expect(priceMonitorService.getMarketData).toHaveBeenCalledWith(mockListing);
      expect(mockListing.calculateNextPrice).toHaveBeenCalledWith(mockMarketData);
    });

    it('should handle eBay API failure', async () => {
      mockEbayService.updateItemPrice.mockResolvedValue({ success: false, error: 'API Error' });

      await priceMonitorService.processListingReduction(mockListing);

      expect(mockListing.syncErrors).toHaveLength(1);
      expect(mockListing.syncErrors[0]).toEqual({
        error: 'Failed to update price on eBay',
        date: expect.any(Date),
        resolved: false
      });
      expect(mockListing.save).toHaveBeenCalled();
    });

    it('should handle unexpected errors', async () => {
      const error = new Error('Unexpected error');
      mockEbayService.updateItemPrice.mockRejectedValue(error);

      await priceMonitorService.processListingReduction(mockListing);

      expect(mockListing.syncErrors).toHaveLength(1);
      expect(mockListing.syncErrors[0]).toEqual({
        error: 'Unexpected error',
        date: expect.any(Date),
        resolved: false
      });
      expect(console.error).toHaveBeenCalledWith('Error processing listing 123456:', error);
    });

    it('should round prices to 2 decimal places', async () => {
      mockListing.calculateNextPrice.mockReturnValue(45.556); // Should round to 45.56

      await priceMonitorService.processListingReduction(mockListing);

      expect(mockEbayService.updateItemPrice).toHaveBeenCalledWith('123456', 45.56, 'USD');
      expect(mockListing.currentPrice).toBe(45.56);
    });
  });

  describe('getMarketData', () => {
    let mockListing;
    let mockCompletedListings;

    beforeEach(() => {
      mockListing = {
        title: 'Vintage Camera Lens 50mm F1.8',
        categoryId: '625',
        ebayItemId: '123456',
        save: jest.fn().mockResolvedValue()
      };

      mockCompletedListings = {
        findCompletedItemsResponse: [{
          searchResult: [{
            item: [
              { sellingStatus: [{ currentPrice: [{ __value__: '45.00' }] }] },
              { sellingStatus: [{ currentPrice: [{ __value__: '50.00' }] }] },
              { sellingStatus: [{ currentPrice: [{ __value__: '40.00' }] }] }
            ]
          }]
        }]
      };

      mockEbayService.searchCompletedListings.mockResolvedValue(mockCompletedListings);
    });

    it('should extract keywords and call eBay API', async () => {
      const result = await priceMonitorService.getMarketData(mockListing);

      expect(mockEbayService.searchCompletedListings).toHaveBeenCalledWith(
        'Vintage Camera Lens 50mm F1.8',
        '625',
        30
      );

      expect(result).toEqual({
        averageCompetitorPrice: 45.00, // (45 + 50 + 40) / 3
        lowestCompetitorPrice: 40.00,
        highestCompetitorPrice: 50.00,
        lastMarketAnalysis: expect.any(Date),
        competitorCount: 3
      });

      expect(mockListing.marketData).toEqual(result);
      expect(mockListing.save).toHaveBeenCalled();
    });

    it('should handle no completed listings found', async () => {
      mockEbayService.searchCompletedListings.mockResolvedValue(null);

      const result = await priceMonitorService.getMarketData(mockListing);

      expect(result).toBeNull();
    });

    it('should handle empty search results', async () => {
      const emptyResults = {
        findCompletedItemsResponse: [{
          searchResult: [{ item: [] }]
        }]
      };
      mockEbayService.searchCompletedListings.mockResolvedValue(emptyResults);

      const result = await priceMonitorService.getMarketData(mockListing);

      expect(result).toBeNull();
    });

    it('should filter out items without valid prices', async () => {
      const mixedResults = {
        findCompletedItemsResponse: [{
          searchResult: [{
            item: [
              { sellingStatus: [{ currentPrice: [{ __value__: '45.00' }] }] },
              { sellingStatus: [{}] }, // No price
              { title: ['Item without selling status'] }, // No selling status
              { sellingStatus: [{ currentPrice: [{ __value__: '50.00' }] }] }
            ]
          }]
        }]
      };
      mockEbayService.searchCompletedListings.mockResolvedValue(mixedResults);

      const result = await priceMonitorService.getMarketData(mockListing);

      expect(result.competitorCount).toBe(2);
      expect(result.averageCompetitorPrice).toBe(47.50); // (45 + 50) / 2
    });

    it('should handle API errors gracefully', async () => {
      const error = new Error('API rate limit exceeded');
      mockEbayService.searchCompletedListings.mockRejectedValue(error);

      const result = await priceMonitorService.getMarketData(mockListing);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith('Error getting market data for 123456:', error);
    });

    it('should limit keywords to first 5 words', async () => {
      mockListing.title = 'Very Long Title With Many Words That Should Be Truncated';

      await priceMonitorService.getMarketData(mockListing);

      expect(mockEbayService.searchCompletedListings).toHaveBeenCalledWith(
        'Very Long Title With Many',
        '625',
        30
      );
    });
  });

  describe('reducePrice', () => {
    let mockListing;

    beforeEach(() => {
      mockListing = {
        _id: 'listing1',
        ebayItemId: '123456',
        currentPrice: 50.00,
        minimumPrice: 25.00,
        currency: 'USD',
        calculateNextPrice: jest.fn().mockReturnValue(45.00),
        calculateNextReductionDate: jest.fn().mockReturnValue(new Date()),
        priceHistory: [],
        save: jest.fn().mockResolvedValue()
      };

      Listing.findById.mockResolvedValue(mockListing);
      mockEbayService.updateItemPrice.mockResolvedValue({ success: true });
    });

    it('should throw error if listing not found', async () => {
      Listing.findById.mockResolvedValue(null);

      await expect(priceMonitorService.reducePrice('invalid_id')).rejects.toThrow('Listing not found');
    });

    it('should use custom price when provided', async () => {
      const customPrice = 35.00;

      const result = await priceMonitorService.reducePrice('listing1', customPrice);

      expect(mockEbayService.updateItemPrice).toHaveBeenCalledWith('123456', customPrice, 'USD');
      expect(result).toEqual({
        success: true,
        oldPrice: 50.00,
        newPrice: customPrice,
        listing: mockListing
      });
    });

    it('should not allow custom price below minimum', async () => {
      const customPrice = 20.00; // Below minimum of 25.00

      await priceMonitorService.reducePrice('listing1', customPrice);

      expect(mockEbayService.updateItemPrice).toHaveBeenCalledWith('123456', 25.00, 'USD');
    });

    it('should use calculated price when no custom price provided', async () => {
      const result = await priceMonitorService.reducePrice('listing1');

      expect(mockListing.calculateNextPrice).toHaveBeenCalled();
      expect(mockEbayService.updateItemPrice).toHaveBeenCalledWith('123456', 45.00, 'USD');
    });

    it('should throw error if new price is not lower than current', async () => {
      mockListing.calculateNextPrice.mockReturnValue(55.00);

      await expect(priceMonitorService.reducePrice('listing1')).rejects.toThrow('New price must be lower than current price');
    });

    it('should throw error if eBay update fails', async () => {
      mockEbayService.updateItemPrice.mockResolvedValue({ success: false });

      await expect(priceMonitorService.reducePrice('listing1')).rejects.toThrow('Failed to update price on eBay');
    });

    it('should update listing and add to price history on success', async () => {
      const result = await priceMonitorService.reducePrice('listing1');

      expect(mockListing.currentPrice).toBe(45.00);
      expect(mockListing.lastPriceReduction).toBeInstanceOf(Date);
      expect(mockListing.priceHistory).toHaveLength(1);
      expect(mockListing.priceHistory[0]).toEqual({
        price: 45.00,
        date: expect.any(Date),
        reason: 'manual'
      });
      expect(mockListing.save).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return correct status when not running', () => {
      const status = priceMonitorService.getStatus();

      expect(status).toEqual({
        isRunning: false,
        activeJobs: [],
        uptime: 0
      });
    });

    it('should return correct status when running', () => {
      priceMonitorService.start();

      const status = priceMonitorService.getStatus();

      expect(status).toEqual({
        isRunning: true,
        activeJobs: ['hourly', 'marketAnalysis', 'sync'],
        uptime: expect.any(Number)
      });
    });
  });

  describe('performMarketAnalysis', () => {
    const mockListings = [
      { _id: 'listing1', reductionStrategy: 'market_based' },
      { _id: 'listing2', reductionStrategy: 'market_based' }
    ];

    beforeEach(() => {
      Listing.find.mockResolvedValue(mockListings);
      priceMonitorService.getMarketData = jest.fn().mockResolvedValue();
      // Mock setTimeout for the delay
      jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay) => {
        fn();
        return 1;
      });
    });

    afterEach(() => {
      global.setTimeout.mockRestore();
    });

    it('should analyze market data for all market-based listings', async () => {
      await priceMonitorService.performMarketAnalysis();

      expect(Listing.find).toHaveBeenCalledWith({
        listingStatus: 'Active',
        priceReductionEnabled: true,
        reductionStrategy: 'market_based'
      });

      expect(priceMonitorService.getMarketData).toHaveBeenCalledTimes(2);
      expect(priceMonitorService.getMarketData).toHaveBeenCalledWith(mockListings[0]);
      expect(priceMonitorService.getMarketData).toHaveBeenCalledWith(mockListings[1]);
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Market analysis failed');
      Listing.find.mockRejectedValue(error);

      await priceMonitorService.performMarketAnalysis();

      expect(console.error).toHaveBeenCalledWith('Error performing market analysis:', error);
    });
  });
});