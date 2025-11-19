const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema({
  ebayItemId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  currentPrice: {
    type: Number,
    required: true
  },
  originalPrice: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  category: {
    type: String
  },
  categoryId: {
    type: String
  },
  condition: {
    type: String
  },
  imageUrls: [{
    type: String
  }],
  listingFormat: {
    type: String,
    enum: ['FixedPriceItem', 'Auction', 'StoreInventory'],
    default: 'FixedPriceItem'
  },
  quantity: {
    type: Number,
    default: 1
  },
  quantityAvailable: {
    type: Number,
    default: 1
  },
  listingStatus: {
    type: String,
    enum: ['Active', 'Ended', 'Completed'],
    default: 'Active'
  },
  startTime: {
    type: Date
  },
  endTime: {
    type: Date
  },
  viewCount: {
    type: Number,
    default: 0
  },
  watchCount: {
    type: Number,
    default: 0
  },

  // Price reduction settings
  priceReductionEnabled: {
    type: Boolean,
    default: false
  },
  reductionStrategy: {
    type: String,
    enum: ['fixed_percentage', 'market_based', 'time_based'],
    default: 'fixed_percentage'
  },
  reductionPercentage: {
    type: Number,
    default: 5, // 5% reduction
    min: 1,
    max: 50
  },
  minimumPrice: {
    type: Number,
    required: true
  },
  reductionInterval: {
    type: Number,
    default: 7, // days
    min: 1,
    max: 30
  },
  lastPriceReduction: {
    type: Date
  },
  nextPriceReduction: {
    type: Date
  },

  // Tracking data
  priceHistory: [{
    price: Number,
    date: Date,
    reason: String // 'initial', 'scheduled_reduction', 'market_analysis', 'manual'
  }],

  // Market analysis data
  marketData: {
    averageCompetitorPrice: Number,
    lowestCompetitorPrice: Number,
    highestCompetitorPrice: Number,
    lastMarketAnalysis: Date,
    competitorCount: Number
  },

  // User settings
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // System fields
  lastSyncedWithEbay: {
    type: Date,
    default: Date.now
  },
  syncErrors: [{
    error: String,
    date: Date,
    resolved: Boolean
  }]
}, {
  timestamps: true
});

// Indexes for performance
listingSchema.index({ userId: 1, listingStatus: 1 });
listingSchema.index({ nextPriceReduction: 1, priceReductionEnabled: 1 });
listingSchema.index({ lastSyncedWithEbay: 1 });

// Virtual for days since last price reduction
listingSchema.virtual('daysSinceLastReduction').get(function() {
  if (!this.lastPriceReduction) return null;
  const diffTime = Math.abs(new Date() - this.lastPriceReduction);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Method to calculate next price reduction date
listingSchema.methods.calculateNextReductionDate = function() {
  if (!this.priceReductionEnabled) return null;

  const lastReduction = this.lastPriceReduction || this.createdAt;
  const nextDate = new Date(lastReduction);
  nextDate.setDate(nextDate.getDate() + this.reductionInterval);

  return nextDate;
};

// Method to check if price reduction is due
listingSchema.methods.isPriceReductionDue = function() {
  if (!this.priceReductionEnabled) return false;
  if (this.currentPrice <= this.minimumPrice) return false;

  const nextReduction = this.nextPriceReduction || this.calculateNextReductionDate();
  return new Date() >= nextReduction;
};

// Method to calculate next price
listingSchema.methods.calculateNextPrice = function(marketData = null) {
  let newPrice;

  switch (this.reductionStrategy) {
    case 'fixed_percentage':
      newPrice = this.currentPrice * (1 - this.reductionPercentage / 100);
      break;

    case 'market_based':
      if (marketData && marketData.averageCompetitorPrice) {
        newPrice = Math.min(
          marketData.averageCompetitorPrice * 0.95, // 5% below market average
          this.currentPrice * (1 - this.reductionPercentage / 100)
        );
      } else {
        newPrice = this.currentPrice * (1 - this.reductionPercentage / 100);
      }
      break;

    case 'time_based':
      // More aggressive reduction over time
      const daysListed = Math.ceil((new Date() - this.startTime) / (1000 * 60 * 60 * 24));
      const aggressiveFactor = Math.min(1 + (daysListed / 30) * 0.5, 2); // Up to 2x more aggressive after 30 days
      newPrice = this.currentPrice * (1 - (this.reductionPercentage / 100) * aggressiveFactor);
      break;

    default:
      newPrice = this.currentPrice * (1 - this.reductionPercentage / 100);
  }

  // Ensure we don't go below minimum price
  return Math.max(newPrice, this.minimumPrice);
};

module.exports = mongoose.model('Listing', listingSchema);