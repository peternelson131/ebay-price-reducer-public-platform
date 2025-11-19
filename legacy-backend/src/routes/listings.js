const express = require('express');
const router = express.Router();
const Listing = require('../models/Listing');
const EbayService = require('../services/ebayService');
const PriceMonitorService = require('../services/priceMonitorService');

const ebayService = new EbayService();
const priceMonitor = new PriceMonitorService();

// Get all listings for a user
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'Active' } = req.query;
    const userId = req.user.id; // Assuming authentication middleware sets this

    const listings = await Listing.find({
      userId,
      ...(status !== 'all' && { listingStatus: status })
    })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Listing.countDocuments({
      userId,
      ...(status !== 'all' && { listingStatus: status })
    });

    res.json({
      listings,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific listing details
router.get('/:id', async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Check if user owns this listing
    if (listing.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(listing);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import listings from eBay
router.post('/import', async (req, res) => {
  try {
    const userId = req.user.id;
    const { ebayUserId } = req.body;

    // Get listings from eBay
    const ebayListings = await ebayService.getSellerListings(ebayUserId);

    // This would need proper XML parsing in production
    // For now, we'll create a mock response
    const importedListings = [];

    // Process and save listings
    // Note: This is simplified - you'd need to parse the actual eBay XML response
    const mockListings = [
      {
        ebayItemId: '123456789',
        title: 'Sample eBay Item',
        currentPrice: 29.99,
        originalPrice: 29.99,
        currency: 'USD',
        category: 'Electronics',
        condition: 'New',
        quantity: 1,
        listingStatus: 'Active',
        startTime: new Date(),
        endTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
      }
    ];

    for (const ebayItem of mockListings) {
      // Check if listing already exists
      const existingListing = await Listing.findOne({
        ebayItemId: ebayItem.ebayItemId,
        userId
      });

      if (!existingListing) {
        const newListing = new Listing({
          ...ebayItem,
          userId,
          minimumPrice: ebayItem.currentPrice * 0.7, // Default minimum: 70% of original
          priceHistory: [{
            price: ebayItem.currentPrice,
            date: new Date(),
            reason: 'initial'
          }]
        });

        await newListing.save();
        importedListings.push(newListing);
      }
    }

    res.json({
      message: `Imported ${importedListings.length} new listings`,
      imported: importedListings.length,
      listings: importedListings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update listing settings
router.put('/:id', async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Check if user owns this listing
    if (listing.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const {
      priceReductionEnabled,
      reductionStrategy,
      reductionPercentage,
      minimumPrice,
      reductionInterval
    } = req.body;

    // Update allowed fields
    if (priceReductionEnabled !== undefined) {
      listing.priceReductionEnabled = priceReductionEnabled;
    }
    if (reductionStrategy) {
      listing.reductionStrategy = reductionStrategy;
    }
    if (reductionPercentage !== undefined) {
      listing.reductionPercentage = Math.min(Math.max(reductionPercentage, 1), 50);
    }
    if (minimumPrice !== undefined) {
      listing.minimumPrice = Math.max(minimumPrice, 0.01);
    }
    if (reductionInterval !== undefined) {
      listing.reductionInterval = Math.min(Math.max(reductionInterval, 1), 30);
    }

    // Recalculate next price reduction date
    if (listing.priceReductionEnabled) {
      listing.nextPriceReduction = listing.calculateNextReductionDate();
    } else {
      listing.nextPriceReduction = null;
    }

    await listing.save();

    res.json(listing);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manually reduce price
router.post('/:id/reduce-price', async (req, res) => {
  try {
    const { customPrice } = req.body;
    const listingId = req.params.id;

    // Verify ownership
    const listing = await Listing.findById(listingId);
    if (!listing || listing.userId.toString() !== req.user.id) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const result = await priceMonitor.reducePrice(listingId, customPrice);

    res.json({
      message: 'Price reduced successfully',
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get price history
router.get('/:id/price-history', async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Check if user owns this listing
    if (listing.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      priceHistory: listing.priceHistory,
      currentPrice: listing.currentPrice,
      originalPrice: listing.originalPrice,
      minimumPrice: listing.minimumPrice
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get market analysis for a listing
router.get('/:id/market-analysis', async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Check if user owns this listing
    if (listing.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get fresh market data
    const keywords = listing.title.split(' ').slice(0, 5).join(' ');
    const completedListings = await ebayService.searchCompletedListings(
      keywords,
      listing.categoryId,
      30
    );

    let marketAnalysis = {
      hasData: false,
      message: 'No recent sales data found'
    };

    if (completedListings && completedListings.findCompletedItemsResponse) {
      const items = completedListings.findCompletedItemsResponse[0].searchResult[0].item || [];

      if (items.length > 0) {
        const prices = items
          .filter(item => item.sellingStatus && item.sellingStatus[0].currentPrice)
          .map(item => parseFloat(item.sellingStatus[0].currentPrice[0].__value__));

        if (prices.length > 0) {
          const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
          const lowestPrice = Math.min(...prices);
          const highestPrice = Math.max(...prices);

          marketAnalysis = {
            hasData: true,
            averagePrice: Math.round(averagePrice * 100) / 100,
            lowestPrice,
            highestPrice,
            totalSales: prices.length,
            currentPricePosition: listing.currentPrice <= averagePrice ? 'below_average' : 'above_average',
            suggestedPrice: Math.max(
              averagePrice * 0.95,
              listing.minimumPrice
            ),
            lastUpdated: new Date()
          };
        }
      }
    }

    res.json(marketAnalysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a listing (remove from monitoring, not from eBay)
router.delete('/:id', async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Check if user owns this listing
    if (listing.userId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await Listing.findByIdAndDelete(req.params.id);

    res.json({ message: 'Listing removed from monitoring' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;