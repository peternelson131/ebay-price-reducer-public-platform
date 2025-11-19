require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Simple auth middleware (in production, use proper JWT auth)
app.use('/api', (req, res, next) => {
  // For development, we'll mock a user
  req.user = {
    id: '507f1f77bcf86cd799439011', // Mock user ID
    email: 'demo@example.com',
    name: 'Demo User'
  };
  next();
});

// Mock data for demo
const mockListings = [
  {
    _id: '1',
    ebayItemId: '123456789',
    title: 'Vintage Camera - Canon AE-1 35mm Film Camera',
    description: 'Classic film camera in excellent condition',
    currentPrice: 189.99,
    originalPrice: 229.99,
    currency: 'USD',
    category: 'Electronics',
    categoryId: '625',
    condition: 'Used',
    imageUrls: ['https://picsum.photos/200/200?random=1'],
    listingFormat: 'FixedPriceItem',
    quantity: 1,
    quantityAvailable: 1,
    listingStatus: 'Active',
    startTime: new Date('2024-01-15'),
    endTime: new Date('2024-02-15'),
    viewCount: 45,
    watchCount: 8,
    priceReductionEnabled: true,
    reductionStrategy: 'fixed_percentage',
    reductionPercentage: 5,
    minimumPrice: 150.00,
    reductionInterval: 7,
    lastPriceReduction: new Date('2024-01-20'),
    nextPriceReduction: new Date('2024-01-27'),
    priceHistory: [
      { price: 229.99, date: new Date('2024-01-15'), reason: 'initial' },
      { price: 218.49, date: new Date('2024-01-20'), reason: 'fixed_percentage_reduction' },
      { price: 189.99, date: new Date('2024-01-25'), reason: 'fixed_percentage_reduction' }
    ],
    marketData: {
      averageCompetitorPrice: 195.50,
      lowestCompetitorPrice: 175.00,
      highestCompetitorPrice: 225.00,
      lastMarketAnalysis: new Date(),
      competitorCount: 15
    },
    userId: '507f1f77bcf86cd799439011',
    lastSyncedWithEbay: new Date(),
    syncErrors: []
  },
  {
    _id: '2',
    ebayItemId: '987654321',
    title: 'Apple iPhone 13 Pro - 128GB - Graphite (Unlocked)',
    description: 'iPhone in great condition with minor wear',
    currentPrice: 649.99,
    originalPrice: 749.99,
    currency: 'USD',
    category: 'Cell Phones & Smartphones',
    categoryId: '9355',
    condition: 'Used',
    imageUrls: ['https://picsum.photos/200/200?random=2'],
    listingFormat: 'FixedPriceItem',
    quantity: 1,
    quantityAvailable: 1,
    listingStatus: 'Active',
    startTime: new Date('2024-01-10'),
    endTime: new Date('2024-02-10'),
    viewCount: 127,
    watchCount: 23,
    priceReductionEnabled: true,
    reductionStrategy: 'market_based',
    reductionPercentage: 3,
    minimumPrice: 550.00,
    reductionInterval: 5,
    lastPriceReduction: new Date('2024-01-22'),
    nextPriceReduction: new Date('2024-01-27'),
    priceHistory: [
      { price: 749.99, date: new Date('2024-01-10'), reason: 'initial' },
      { price: 699.99, date: new Date('2024-01-17'), reason: 'market_based_reduction' },
      { price: 649.99, date: new Date('2024-01-22'), reason: 'market_based_reduction' }
    ],
    marketData: {
      averageCompetitorPrice: 675.00,
      lowestCompetitorPrice: 620.00,
      highestCompetitorPrice: 720.00,
      lastMarketAnalysis: new Date(),
      competitorCount: 28
    },
    userId: '507f1f77bcf86cd799439011',
    lastSyncedWithEbay: new Date(),
    syncErrors: []
  },
  {
    _id: '3',
    ebayItemId: '456789123',
    title: 'Nike Air Jordan 1 Retro High OG - Size 10.5',
    description: 'Classic sneakers in good condition',
    currentPrice: 145.00,
    originalPrice: 180.00,
    currency: 'USD',
    category: 'Athletic Shoes',
    categoryId: '15709',
    condition: 'Used',
    imageUrls: ['https://picsum.photos/200/200?random=3'],
    listingFormat: 'FixedPriceItem',
    quantity: 1,
    quantityAvailable: 1,
    listingStatus: 'Active',
    startTime: new Date('2024-01-12'),
    endTime: new Date('2024-02-12'),
    viewCount: 89,
    watchCount: 15,
    priceReductionEnabled: false,
    reductionStrategy: 'time_based',
    reductionPercentage: 7,
    minimumPrice: 120.00,
    reductionInterval: 10,
    lastPriceReduction: new Date('2024-01-18'),
    nextPriceReduction: null,
    priceHistory: [
      { price: 180.00, date: new Date('2024-01-12'), reason: 'initial' },
      { price: 167.40, date: new Date('2024-01-18'), reason: 'time_based_reduction' },
      { price: 145.00, date: new Date('2024-01-23'), reason: 'manual' }
    ],
    marketData: {
      averageCompetitorPrice: 155.00,
      lowestCompetitorPrice: 130.00,
      highestCompetitorPrice: 200.00,
      lastMarketAnalysis: new Date(),
      competitorCount: 12
    },
    userId: '507f1f77bcf86cd799439011',
    lastSyncedWithEbay: new Date(),
    syncErrors: []
  }
];

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK (Demo Mode)',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: 'demo'
  });
});

// Demo API routes
app.get('/api/listings', (req, res) => {
  const { page = 1, limit = 20, status = 'Active' } = req.query;

  let filteredListings = mockListings;
  if (status !== 'all') {
    filteredListings = mockListings.filter(listing => listing.listingStatus === status);
  }

  res.json({
    listings: filteredListings,
    totalPages: 1,
    currentPage: parseInt(page),
    total: filteredListings.length
  });
});

app.get('/api/listings/:id', (req, res) => {
  const listing = mockListings.find(l => l._id === req.params.id);
  if (!listing) {
    return res.status(404).json({ error: 'Listing not found' });
  }
  res.json(listing);
});

app.get('/api/listings/:id/price-history', (req, res) => {
  const listing = mockListings.find(l => l._id === req.params.id);
  if (!listing) {
    return res.status(404).json({ error: 'Listing not found' });
  }

  res.json({
    priceHistory: listing.priceHistory,
    currentPrice: listing.currentPrice,
    originalPrice: listing.originalPrice,
    minimumPrice: listing.minimumPrice
  });
});

app.get('/api/listings/:id/market-analysis', (req, res) => {
  const listing = mockListings.find(l => l._id === req.params.id);
  if (!listing) {
    return res.status(404).json({ error: 'Listing not found' });
  }

  const marketData = listing.marketData;
  const analysis = {
    hasData: true,
    averagePrice: marketData.averageCompetitorPrice,
    lowestPrice: marketData.lowestCompetitorPrice,
    highestPrice: marketData.highestCompetitorPrice,
    totalSales: marketData.competitorCount,
    currentPricePosition: listing.currentPrice <= marketData.averageCompetitorPrice ? 'below_average' : 'above_average',
    suggestedPrice: Math.max(
      marketData.averageCompetitorPrice * 0.95,
      listing.minimumPrice
    ),
    lastUpdated: new Date()
  };

  res.json(analysis);
});

app.put('/api/listings/:id', (req, res) => {
  const listing = mockListings.find(l => l._id === req.params.id);
  if (!listing) {
    return res.status(404).json({ error: 'Listing not found' });
  }

  // Update listing with new settings
  Object.assign(listing, req.body);
  res.json(listing);
});

app.post('/api/listings/:id/reduce-price', (req, res) => {
  const listing = mockListings.find(l => l._id === req.params.id);
  if (!listing) {
    return res.status(404).json({ error: 'Listing not found' });
  }

  const { customPrice } = req.body;
  const oldPrice = listing.currentPrice;
  const newPrice = customPrice || (listing.currentPrice * 0.95);

  listing.currentPrice = Math.max(newPrice, listing.minimumPrice);
  listing.lastPriceReduction = new Date();
  listing.priceHistory.push({
    price: listing.currentPrice,
    date: new Date(),
    reason: customPrice ? 'manual' : 'scheduled_reduction'
  });

  res.json({
    success: true,
    oldPrice,
    newPrice: listing.currentPrice,
    listing
  });
});

app.post('/api/listings/import', (req, res) => {
  res.json({
    message: 'Import feature available in full version with eBay API credentials',
    imported: 0,
    listings: []
  });
});

app.delete('/api/listings/:id', (req, res) => {
  const index = mockListings.findIndex(l => l._id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Listing not found' });
  }

  mockListings.splice(index, 1);
  res.json({ message: 'Listing removed from monitoring' });
});

// Price monitoring status endpoint
app.get('/api/monitor/status', (req, res) => {
  res.json({
    isRunning: true,
    activeJobs: ['hourly', 'marketAnalysis', 'sync'],
    uptime: process.uptime() * 1000
  });
});

app.post('/api/monitor/start', (req, res) => {
  res.json({ message: 'Price monitoring started (demo mode)' });
});

app.post('/api/monitor/stop', (req, res) => {
  res.json({ message: 'Price monitoring stopped (demo mode)' });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'Demo mode error handling'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Demo Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Environment: DEMO MODE`);
  console.log(`💡 This is a demo version without database connectivity`);
  console.log(`📱 Frontend will be available at: http://localhost:3000`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

module.exports = app;