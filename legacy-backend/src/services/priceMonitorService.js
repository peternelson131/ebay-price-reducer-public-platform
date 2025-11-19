const cron = require('node-cron');
const EbayService = require('./ebayService');
const Listing = require('../models/Listing');

class PriceMonitorService {
  constructor() {
    this.ebayService = new EbayService();
    this.isRunning = false;
    this.jobs = new Map();
  }

  // Start the price monitoring service
  start() {
    if (this.isRunning) {
      console.log('Price monitoring service is already running');
      return;
    }

    console.log('Starting price monitoring service...');

    // Run price checks every hour
    const hourlyJob = cron.schedule('0 * * * *', () => {
      this.checkPriceReductions();
    }, {
      scheduled: false
    });

    // Run market analysis every 6 hours
    const marketAnalysisJob = cron.schedule('0 */6 * * *', () => {
      this.performMarketAnalysis();
    }, {
      scheduled: false
    });

    // Sync with eBay daily
    const syncJob = cron.schedule('0 2 * * *', () => {
      this.syncWithEbay();
    }, {
      scheduled: false
    });

    this.jobs.set('hourly', hourlyJob);
    this.jobs.set('marketAnalysis', marketAnalysisJob);
    this.jobs.set('sync', syncJob);

    // Start all jobs
    hourlyJob.start();
    marketAnalysisJob.start();
    syncJob.start();

    this.isRunning = true;
    console.log('Price monitoring service started successfully');
  }

  // Stop the price monitoring service
  stop() {
    if (!this.isRunning) {
      console.log('Price monitoring service is not running');
      return;
    }

    console.log('Stopping price monitoring service...');

    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`Stopped ${name} job`);
    });

    this.jobs.clear();
    this.isRunning = false;
    console.log('Price monitoring service stopped');
  }

  // Check all listings for price reductions
  async checkPriceReductions() {
    try {
      console.log('Checking for price reductions...');

      const listingsDue = await Listing.find({
        priceReductionEnabled: true,
        listingStatus: 'Active',
        $or: [
          { nextPriceReduction: { $lte: new Date() } },
          { nextPriceReduction: null }
        ]
      });

      console.log(`Found ${listingsDue.length} listings due for price reduction`);

      for (const listing of listingsDue) {
        await this.processListingReduction(listing);
      }

      console.log('Price reduction check completed');
    } catch (error) {
      console.error('Error checking price reductions:', error);
    }
  }

  // Process individual listing for price reduction
  async processListingReduction(listing) {
    try {
      // Skip if already at minimum price
      if (listing.currentPrice <= listing.minimumPrice) {
        console.log(`Listing ${listing.ebayItemId} already at minimum price`);
        return;
      }

      // Get market data if using market-based strategy
      let marketData = null;
      if (listing.reductionStrategy === 'market_based') {
        marketData = await this.getMarketData(listing);
      }

      // Calculate new price
      const newPrice = listing.calculateNextPrice(marketData);

      // Round to 2 decimal places
      const roundedPrice = Math.round(newPrice * 100) / 100;

      // Skip if new price would be the same as current
      if (roundedPrice >= listing.currentPrice) {
        console.log(`No price reduction needed for listing ${listing.ebayItemId}`);
        return;
      }

      // Update price on eBay
      const ebayResponse = await this.ebayService.updateItemPrice(
        listing.ebayItemId,
        roundedPrice,
        listing.currency
      );

      if (ebayResponse.success) {
        // Update listing in database
        listing.currentPrice = roundedPrice;
        listing.lastPriceReduction = new Date();
        listing.nextPriceReduction = listing.calculateNextReductionDate();

        // Add to price history
        listing.priceHistory.push({
          price: roundedPrice,
          date: new Date(),
          reason: `${listing.reductionStrategy}_reduction`
        });

        await listing.save();

        console.log(`Successfully reduced price for ${listing.ebayItemId}: ${listing.currentPrice} -> ${roundedPrice}`);
      } else {
        console.error(`Failed to update price for ${listing.ebayItemId}:`, ebayResponse);

        // Log the error
        listing.syncErrors.push({
          error: 'Failed to update price on eBay',
          date: new Date(),
          resolved: false
        });
        await listing.save();
      }

    } catch (error) {
      console.error(`Error processing listing ${listing.ebayItemId}:`, error);

      // Log the error
      listing.syncErrors.push({
        error: error.message,
        date: new Date(),
        resolved: false
      });
      await listing.save();
    }
  }

  // Get market data for market-based pricing
  async getMarketData(listing) {
    try {
      // Use the first few words of the title as keywords
      const keywords = listing.title.split(' ').slice(0, 5).join(' ');

      const completedListings = await this.ebayService.searchCompletedListings(
        keywords,
        listing.categoryId,
        30 // last 30 days
      );

      if (!completedListings || !completedListings.findCompletedItemsResponse) {
        return null;
      }

      const items = completedListings.findCompletedItemsResponse[0].searchResult[0].item || [];

      if (items.length === 0) {
        return null;
      }

      const prices = items
        .filter(item => item.sellingStatus && item.sellingStatus[0].currentPrice)
        .map(item => parseFloat(item.sellingStatus[0].currentPrice[0].__value__));

      if (prices.length === 0) {
        return null;
      }

      const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      const lowestPrice = Math.min(...prices);
      const highestPrice = Math.max(...prices);

      const marketData = {
        averageCompetitorPrice: averagePrice,
        lowestCompetitorPrice: lowestPrice,
        highestCompetitorPrice: highestPrice,
        lastMarketAnalysis: new Date(),
        competitorCount: prices.length
      };

      // Update listing with market data
      listing.marketData = marketData;
      await listing.save();

      return marketData;

    } catch (error) {
      console.error(`Error getting market data for ${listing.ebayItemId}:`, error);
      return null;
    }
  }

  // Perform market analysis for all active listings
  async performMarketAnalysis() {
    try {
      console.log('Performing market analysis...');

      const activeListings = await Listing.find({
        listingStatus: 'Active',
        priceReductionEnabled: true,
        reductionStrategy: 'market_based'
      });

      console.log(`Analyzing market data for ${activeListings.length} listings`);

      for (const listing of activeListings) {
        await this.getMarketData(listing);
        // Small delay to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log('Market analysis completed');
    } catch (error) {
      console.error('Error performing market analysis:', error);
    }
  }

  // Sync listing data with eBay
  async syncWithEbay() {
    try {
      console.log('Syncing with eBay...');

      const activeListings = await Listing.find({
        listingStatus: 'Active'
      });

      console.log(`Syncing ${activeListings.length} listings with eBay`);

      for (const listing of activeListings) {
        try {
          const ebayData = await this.ebayService.getItemDetails(listing.ebayItemId);

          if (ebayData.success) {
            // Update listing status and other fields from eBay data
            // This would need proper XML parsing in production
            listing.lastSyncedWithEbay = new Date();
            await listing.save();
          }

          // Small delay to avoid hitting rate limits
          await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
          console.error(`Error syncing listing ${listing.ebayItemId}:`, error);

          listing.syncErrors.push({
            error: error.message,
            date: new Date(),
            resolved: false
          });
          await listing.save();
        }
      }

      console.log('eBay sync completed');
    } catch (error) {
      console.error('Error syncing with eBay:', error);
    }
  }

  // Manual price reduction for a specific listing
  async reducePrice(listingId, customPrice = null) {
    try {
      const listing = await Listing.findById(listingId);

      if (!listing) {
        throw new Error('Listing not found');
      }

      let newPrice;
      if (customPrice) {
        newPrice = Math.max(customPrice, listing.minimumPrice);
      } else {
        newPrice = listing.calculateNextPrice();
      }

      const roundedPrice = Math.round(newPrice * 100) / 100;

      if (roundedPrice >= listing.currentPrice) {
        throw new Error('New price must be lower than current price');
      }

      // Update price on eBay
      const ebayResponse = await this.ebayService.updateItemPrice(
        listing.ebayItemId,
        roundedPrice,
        listing.currency
      );

      if (!ebayResponse.success) {
        throw new Error('Failed to update price on eBay');
      }

      // Update listing in database
      const oldPrice = listing.currentPrice;
      listing.currentPrice = roundedPrice;
      listing.lastPriceReduction = new Date();
      listing.nextPriceReduction = listing.calculateNextReductionDate();

      // Add to price history
      listing.priceHistory.push({
        price: roundedPrice,
        date: new Date(),
        reason: 'manual'
      });

      await listing.save();

      return {
        success: true,
        oldPrice,
        newPrice: roundedPrice,
        listing
      };

    } catch (error) {
      console.error('Error reducing price manually:', error);
      throw error;
    }
  }

  // Get service status
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeJobs: Array.from(this.jobs.keys()),
      uptime: this.isRunning ? Date.now() - this.startTime : 0
    };
  }
}

module.exports = PriceMonitorService;