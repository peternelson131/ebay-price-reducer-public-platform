const express = require('express');
const router = express.Router();
const keepaService = require('../services/keepaService');
const { authenticate } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authenticate);

// Middleware for error handling
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Validate and save Keepa API key
router.post('/api-key', asyncHandler(async (req, res) => {
  const { apiKey } = req.body;
  const userId = req.user.id;

  if (!apiKey) {
    return res.status(400).json({
      success: false,
      message: 'API key is required'
    });
  }

  try {
    const result = await keepaService.saveApiKey(userId, apiKey);

    // Track API usage
    await trackApiUsage(userId, 'validate-key', 1, result.validation.tokensLeft);

    res.json({
      success: true,
      message: 'Keepa API key saved and validated successfully',
      validation: result.validation
    });
  } catch (error) {
    console.error('Error saving Keepa API key:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to save API key'
    });
  }
}));

// Test Keepa API connection
router.get('/test-connection', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    const apiKey = await keepaService.getUserApiKey(userId);
    const validation = await keepaService.validateApiKey(apiKey);

    res.json({
      success: validation.valid,
      connected: validation.valid,
      tokensLeft: validation.tokensLeft,
      message: validation.valid
        ? 'Keepa API connection successful'
        : 'Keepa API connection failed',
      details: validation
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      connected: false,
      message: error.message || 'Connection test failed'
    });
  }
}));

// Get product data from Keepa
router.get('/product/:asin', asyncHandler(async (req, res) => {
  const { asin } = req.params;
  const { domain = 'com' } = req.query;
  const userId = req.user.id;

  if (!asin) {
    return res.status(400).json({
      success: false,
      message: 'ASIN is required'
    });
  }

  try {
    const startTime = Date.now();
    const product = await keepaService.getProduct(userId, asin, domain);
    const responseTime = Date.now() - startTime;

    // Track API usage
    await trackApiUsage(userId, 'get-product', 2, null, responseTime);

    res.json({
      success: true,
      product,
      cached: responseTime < 50 // If very fast, likely from cache
    });
  } catch (error) {
    await trackApiUsage(userId, 'get-product', 1, null, null, error.message);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to fetch product data'
    });
  }
}));

// Search products
router.get('/search', asyncHandler(async (req, res) => {
  const { q: query, domain = 'com', page = 0, type = 'product' } = req.query;
  const userId = req.user.id;

  if (!query) {
    return res.status(400).json({
      success: false,
      message: 'Search query is required'
    });
  }

  try {
    const results = await keepaService.searchProducts(userId, query, {
      domain,
      page,
      type
    });

    await trackApiUsage(userId, 'search', 2);

    res.json({
      success: true,
      results,
      query,
      page
    });
  } catch (error) {
    await trackApiUsage(userId, 'search', 1, null, null, error.message);
    res.status(400).json({
      success: false,
      message: error.message || 'Search failed'
    });
  }
}));

// Get pricing recommendations
router.get('/pricing-recommendation/:asin', asyncHandler(async (req, res) => {
  const { asin } = req.params;
  const { domain = 'com' } = req.query;
  const userId = req.user.id;

  try {
    const recommendations = await keepaService.getPricingRecommendation(userId, asin, domain);

    await trackApiUsage(userId, 'pricing-recommendation', 2);

    res.json({
      success: true,
      asin,
      recommendations
    });
  } catch (error) {
    await trackApiUsage(userId, 'pricing-recommendation', 1, null, null, error.message);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to get pricing recommendations'
    });
  }
}));

// Monitor competitor prices (batch operation)
router.post('/monitor-competitors', asyncHandler(async (req, res) => {
  const { asins, domain = 'com' } = req.body;
  const userId = req.user.id;

  if (!asins || !Array.isArray(asins) || asins.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'ASIN list is required'
    });
  }

  if (asins.length > 20) {
    return res.status(400).json({
      success: false,
      message: 'Maximum 20 ASINs allowed per request'
    });
  }

  try {
    const analysis = await keepaService.monitorCompetitorPrices(userId, asins, domain);

    await trackApiUsage(userId, 'monitor-competitors', asins.length * 2);

    res.json({
      success: true,
      analysis,
      asinCount: asins.length
    });
  } catch (error) {
    await trackApiUsage(userId, 'monitor-competitors', 1, null, null, error.message);
    res.status(400).json({
      success: false,
      message: error.message || 'Competitor monitoring failed'
    });
  }
}));

// Create price alert/tracker
router.post('/price-tracker', asyncHandler(async (req, res) => {
  const { asin, targetPrice, domain = 'com' } = req.body;
  const userId = req.user.id;

  if (!asin || !targetPrice) {
    return res.status(400).json({
      success: false,
      message: 'ASIN and target price are required'
    });
  }

  try {
    const tracker = await keepaService.createPriceTracker(userId, asin, targetPrice, domain);

    await trackApiUsage(userId, 'create-tracker', 1);

    res.json({
      success: true,
      tracker,
      message: 'Price tracker created successfully'
    });
  } catch (error) {
    await trackApiUsage(userId, 'create-tracker', 1, null, null, error.message);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to create price tracker'
    });
  }
}));

// Get best sellers in category
router.get('/bestsellers/:categoryId', asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const { domain = 'com' } = req.query;
  const userId = req.user.id;

  try {
    const bestSellers = await keepaService.getCategoryBestSellers(userId, categoryId, domain);

    await trackApiUsage(userId, 'bestsellers', 2);

    res.json({
      success: true,
      categoryId,
      bestSellers
    });
  } catch (error) {
    await trackApiUsage(userId, 'bestsellers', 1, null, null, error.message);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to fetch best sellers'
    });
  }
}));

// Get batch price history
router.post('/batch-price-history', asyncHandler(async (req, res) => {
  const { asins, domain = 'com' } = req.body;
  const userId = req.user.id;

  if (!asins || !Array.isArray(asins) || asins.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'ASIN list is required'
    });
  }

  if (asins.length > 100) {
    return res.status(400).json({
      success: false,
      message: 'Maximum 100 ASINs allowed per request'
    });
  }

  try {
    const priceHistory = await keepaService.getBatchPriceHistory(userId, asins, domain);

    await trackApiUsage(userId, 'batch-history', Math.ceil(asins.length / 10));

    res.json({
      success: true,
      count: priceHistory.length,
      priceHistory
    });
  } catch (error) {
    await trackApiUsage(userId, 'batch-history', 1, null, null, error.message);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to fetch price history'
    });
  }
}));

// Get user's API usage statistics
router.get('/usage-stats', asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Return basic usage stats since Keepa tracking tables don't exist
    // Daily usage and token tracking would be logged to console instead
    console.log('Keepa usage stats requested for user:', userId);

    res.json({
      success: true,
      tokensLeft: 0, // No token tracking in current schema
      subscriptionLevel: 'basic', // Default subscription level
      dailyUsage: [], // No usage tracking in current schema
      message: 'Usage tracking is currently logged to console only'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to fetch usage statistics'
    });
  }
}));

// Helper function to track API usage
async function trackApiUsage(userId, endpoint, tokens = 1, tokensLeft = null, responseTime = null, error = null) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Log API usage since tracking function/table doesn't exist
    console.log('Keepa API usage:', {
      user_id: userId,
      endpoint: endpoint,
      tokens: tokens,
      response_time: responseTime,
      status: error ? 400 : 200,
      error: error,
      tokens_left: tokensLeft,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error tracking API usage:', err);
  }
}

// Error handling middleware
router.use((error, req, res, next) => {
  console.error('Keepa route error:', error);

  // Handle specific error types
  if (error.response?.status === 402) {
    return res.status(402).json({
      success: false,
      message: 'Insufficient Keepa API tokens. Please upgrade your plan.',
      error: 'INSUFFICIENT_TOKENS'
    });
  }

  if (error.response?.status === 401) {
    return res.status(401).json({
      success: false,
      message: 'Invalid Keepa API key. Please check your credentials.',
      error: 'INVALID_API_KEY'
    });
  }

  if (error.response?.status === 429) {
    return res.status(429).json({
      success: false,
      message: 'Rate limit exceeded. Please try again later.',
      error: 'RATE_LIMIT_EXCEEDED'
    });
  }

  // Generic error response
  res.status(500).json({
    success: false,
    message: 'An unexpected error occurred',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

module.exports = router;