const axios = require('axios');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Encryption settings
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
const IV_LENGTH = 16;

class KeepaService {
  constructor() {
    this.baseURL = 'https://api.keepa.com';
    this.rateLimitDelay = 100; // 100ms between requests (10 req/s max)
    this.lastRequestTime = 0;
    this.cache = new Map();
    this.cacheExpiry = 300000; // 5 minutes cache
  }

  // Encrypt API key before storage
  encryptApiKey(apiKey) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(ENCRYPTION_KEY),
      iv
    );
    let encrypted = cipher.update(apiKey);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  // Decrypt API key for use
  decryptApiKey(encryptedKey) {
    const parts = encryptedKey.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encrypted = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(ENCRYPTION_KEY),
      iv
    );
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }

  // Rate limiting helper
  async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimitDelay) {
      await new Promise(resolve =>
        setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest)
      );
    }
    this.lastRequestTime = Date.now();
  }

  // Cache helper
  getCacheKey(endpoint, params) {
    return `${endpoint}:${JSON.stringify(params)}`;
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  // Validate API key by making a test request
  async validateApiKey(apiKey) {
    try {
      await this.enforceRateLimit();

      // Test with tokens endpoint (least expensive)
      const response = await axios.get(`${this.baseURL}/token`, {
        params: {
          key: apiKey
        },
        timeout: 10000
      });

      return {
        valid: response.status === 200,
        tokensLeft: response.data?.tokensLeft || 0,
        refillIn: response.data?.refillIn || null,
        refillRate: response.data?.refillRate || null,
        tokenFlowReduction: response.data?.tokenFlowReduction || null
      };
    } catch (error) {
      if (error.response?.status === 402) {
        return {
          valid: true,
          insufficientTokens: true,
          message: 'Valid API key but insufficient tokens'
        };
      }
      if (error.response?.status === 401) {
        return {
          valid: false,
          message: 'Invalid API key'
        };
      }
      throw error;
    }
  }

  // Store encrypted API key for user
  async saveApiKey(userId, apiKey) {
    try {
      // Validate the key first
      const validation = await this.validateApiKey(apiKey);
      if (!validation.valid) {
        throw new Error(validation.message || 'Invalid API key');
      }

      // Encrypt the API key
      const encryptedKey = this.encryptApiKey(apiKey);

      // Store in database (only keepa_api_key exists in current schema)
      const { data, error } = await supabase
        .from('users')
        .update({
          keepa_api_key: encryptedKey,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .single();

      // Log additional validation data since we don't have those fields in DB
      console.log('Keepa API validation result:', {
        userId,
        tokensLeft: validation.tokensLeft,
        valid: true,
        validatedAt: new Date().toISOString()
      });

      if (error) throw error;

      return {
        success: true,
        validation,
        message: 'Keepa API key saved successfully'
      };
    } catch (error) {
      console.error('Error saving Keepa API key:', error);
      throw error;
    }
  }

  // Get user's decrypted API key
  async getUserApiKey(userId) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('keepa_api_key')
        .eq('id', userId)
        .single();

      if (error) throw error;
      if (!data?.keepa_api_key) {
        throw new Error('No Keepa API key found for user');
      }

      return this.decryptApiKey(data.keepa_api_key);
    } catch (error) {
      console.error('Error retrieving Keepa API key:', error);
      throw error;
    }
  }

  // Product lookup by ASIN/UPC/EAN
  async getProduct(userId, asin, domain = 'com') {
    try {
      const apiKey = await this.getUserApiKey(userId);
      const cacheKey = this.getCacheKey('product', { asin, domain });

      // Check cache
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      await this.enforceRateLimit();

      const response = await axios.get(`${this.baseURL}/product`, {
        params: {
          key: apiKey,
          domain: this.getDomainId(domain),
          asin: asin,
          stats: 180, // 6 months of stats
          history: 1, // Include price history
          offers: 20 // Include top 20 offers
        },
        timeout: 15000
      });

      const productData = this.parseProductData(response.data.products?.[0]);
      this.setCache(cacheKey, productData);

      // Store product analysis in database
      await this.storeProductAnalysis(userId, asin, productData);

      return productData;
    } catch (error) {
      console.error('Error fetching product from Keepa:', error);
      throw error;
    }
  }

  // Search products
  async searchProducts(userId, query, options = {}) {
    try {
      const apiKey = await this.getUserApiKey(userId);
      await this.enforceRateLimit();

      const response = await axios.get(`${this.baseURL}/search`, {
        params: {
          key: apiKey,
          domain: this.getDomainId(options.domain || 'com'),
          type: options.type || 'product',
          term: query,
          page: options.page || 0
        },
        timeout: 15000
      });

      return this.parseSearchResults(response.data);
    } catch (error) {
      console.error('Error searching products on Keepa:', error);
      throw error;
    }
  }

  // Get price history for multiple products (batch operation)
  async getBatchPriceHistory(userId, asins, domain = 'com') {
    try {
      const apiKey = await this.getUserApiKey(userId);
      await this.enforceRateLimit();

      // Keepa allows up to 100 products per request
      const chunks = this.chunkArray(asins, 100);
      const results = [];

      for (const chunk of chunks) {
        const response = await axios.get(`${this.baseURL}/product`, {
          params: {
            key: apiKey,
            domain: this.getDomainId(domain),
            asin: chunk.join(','),
            stats: 90, // 3 months of stats
            history: 1
          },
          timeout: 30000
        });

        results.push(...response.data.products.map(p => this.parseProductData(p)));
        await this.enforceRateLimit();
      }

      return results;
    } catch (error) {
      console.error('Error fetching batch price history:', error);
      throw error;
    }
  }

  // Get best sellers in category
  async getCategoryBestSellers(userId, categoryId, domain = 'com') {
    try {
      const apiKey = await this.getUserApiKey(userId);
      const cacheKey = this.getCacheKey('bestsellers', { categoryId, domain });

      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      await this.enforceRateLimit();

      const response = await axios.get(`${this.baseURL}/bestsellers`, {
        params: {
          key: apiKey,
          domain: this.getDomainId(domain),
          category: categoryId,
          range: 0 // Current best sellers
        },
        timeout: 15000
      });

      const bestSellers = this.parseBestSellers(response.data);
      this.setCache(cacheKey, bestSellers);

      return bestSellers;
    } catch (error) {
      console.error('Error fetching best sellers:', error);
      throw error;
    }
  }

  // Track price for notifications
  async createPriceTracker(userId, asin, targetPrice, domain = 'com') {
    try {
      const apiKey = await this.getUserApiKey(userId);
      await this.enforceRateLimit();

      const response = await axios.post(`${this.baseURL}/tracking`, {
        key: apiKey,
        domain: this.getDomainId(domain),
        asin: asin,
        desiredPrice: targetPrice,
        updateInterval: 1, // Check once per hour
        metaData: JSON.stringify({ userId })
      });

      // Log tracking data since keepa_price_tracking table doesn't exist
      console.log('Keepa price tracking created:', {
        user_id: userId,
        asin: asin,
        target_price: targetPrice,
        domain: domain,
        tracking_id: response.data.trackingId,
        active: true,
        created_at: new Date().toISOString()
      });

      return {
        success: true,
        trackingId: response.data.trackingId,
        message: 'Price tracking activated'
      };
    } catch (error) {
      console.error('Error creating price tracker:', error);
      throw error;
    }
  }

  // Parse product data helper
  parseProductData(product) {
    if (!product) return null;

    return {
      asin: product.asin,
      title: product.title,
      brand: product.brand,
      model: product.model,
      category: product.categoryTree,
      imagesCSV: product.imagesCSV,
      currentPrice: this.getCurrentPrice(product),
      priceHistory: this.parsePriceHistory(product),
      stats: {
        avg30: product.stats?.avg30?.[0] / 100,
        avg90: product.stats?.avg90?.[0] / 100,
        avg180: product.stats?.avg180?.[0] / 100,
        min30: product.stats?.min30?.[0] / 100,
        min90: product.stats?.min90?.[0] / 100,
        min180: product.stats?.min180?.[0] / 100,
        salesRankCurrent: product.stats?.current?.[3],
        salesRankAvg30: product.stats?.avg30?.[3],
        salesRankAvg90: product.stats?.avg90?.[3]
      },
      offers: product.offers,
      variations: product.variations,
      lastUpdate: product.lastUpdate,
      keepaScore: this.calculateKeepaScore(product)
    };
  }

  // Calculate a custom score based on Keepa data
  calculateKeepaScore(product) {
    let score = 0;

    // Price stability (lower variation is better)
    if (product.stats?.avg30?.[0] && product.stats?.min30?.[0]) {
      const priceVariation = (product.stats.avg30[0] - product.stats.min30[0]) / product.stats.avg30[0];
      score += (1 - priceVariation) * 30;
    }

    // Sales rank (lower is better)
    if (product.stats?.current?.[3]) {
      const rankScore = Math.max(0, 100 - (product.stats.current[3] / 1000));
      score += rankScore * 0.4;
    }

    // Review count and rating
    if (product.stats?.reviewCount) {
      score += Math.min(30, product.stats.reviewCount / 10);
    }

    return Math.round(score);
  }

  // Parse price history
  parsePriceHistory(product) {
    const history = [];
    const amazonHistory = product.csv?.[0]; // Amazon price history

    if (amazonHistory) {
      for (let i = 0; i < amazonHistory.length; i += 2) {
        history.push({
          date: new Date(amazonHistory[i] * 60000 + 21564000000),
          price: amazonHistory[i + 1] / 100
        });
      }
    }

    return history;
  }

  // Get current price
  getCurrentPrice(product) {
    // Try Amazon price first
    if (product.csv?.[0]) {
      const amazonPrices = product.csv[0];
      if (amazonPrices.length >= 2) {
        return amazonPrices[amazonPrices.length - 1] / 100;
      }
    }
    // Fallback to stats
    return product.stats?.current?.[0] / 100 || null;
  }

  // Helper to chunk arrays
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  // Domain ID mapper
  getDomainId(domain) {
    const domainMap = {
      'com': 1,  // Amazon.com
      'co.uk': 2, // Amazon.co.uk
      'de': 3,    // Amazon.de
      'fr': 4,    // Amazon.fr
      'co.jp': 5, // Amazon.co.jp
      'ca': 6,    // Amazon.ca
      'it': 8,    // Amazon.it
      'es': 9,    // Amazon.es
      'in': 10,   // Amazon.in
      'com.mx': 11 // Amazon.com.mx
    };
    return domainMap[domain] || 1;
  }

  // Parse search results
  parseSearchResults(data) {
    if (!data?.products) return [];

    return data.products.map(product => ({
      asin: product.asin,
      title: product.title,
      price: product.price / 100,
      image: product.image,
      rating: product.rating,
      reviewCount: product.reviewCount,
      isPrime: product.isPrime,
      salesRank: product.salesRank
    }));
  }

  // Parse best sellers
  parseBestSellers(data) {
    if (!data?.bestSellersList) return [];

    return data.bestSellersList.map(item => ({
      asin: item.asin,
      rank: item.rank,
      title: item.title,
      price: item.price / 100,
      image: item.image
    }));
  }

  // Store product analysis in database
  async storeProductAnalysis(userId, asin, productData) {
    try {
      // Store essential product analysis data as JSON in listings table if listing exists
      // Otherwise, just log the analysis data
      const { data: listing } = await supabase
        .from('listings')
        .select('id')
        .eq('user_id', userId)
        .eq('ebay_item_id', asin)
        .single();

      if (listing) {
        // Store analysis data in existing listing
        await supabase
          .from('listings')
          .update({
            market_average_price: productData.stats?.avg30 || null,
            market_lowest_price: productData.stats?.min30 || null,
            market_highest_price: productData.currentPrice || null,
            last_market_analysis: new Date().toISOString()
          })
          .eq('id', listing.id);

        console.log('Stored Keepa analysis in listings table for:', { userId, asin, listingId: listing.id });
      } else {
        // Log analysis data since no matching listing found
        console.log('Keepa product analysis (no matching listing):', {
          user_id: userId,
          asin: asin,
          product_data: productData,
          analyzed_at: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error storing product analysis:', error);
    }
  }

  // Get pricing recommendations based on Keepa data
  async getPricingRecommendation(userId, asin, domain = 'com') {
    try {
      const product = await this.getProduct(userId, asin, domain);

      if (!product) {
        throw new Error('Product not found');
      }

      const recommendations = {
        currentMarketPrice: product.currentPrice,
        averagePrice30Days: product.stats.avg30,
        averagePrice90Days: product.stats.avg90,
        lowestPrice30Days: product.stats.min30,
        lowestPrice90Days: product.stats.min90,
        competitivePrice: null,
        aggressivePrice: null,
        premiumPrice: null,
        priceScore: product.keepaScore
      };

      // Calculate pricing recommendations
      if (product.stats.avg30 && product.stats.min30) {
        recommendations.competitivePrice = product.stats.avg30 * 0.95; // 5% below average
        recommendations.aggressivePrice = product.stats.min30 * 1.02; // 2% above minimum
        recommendations.premiumPrice = product.stats.avg30 * 1.05; // 5% above average
      }

      // Analyze price trend
      if (product.priceHistory && product.priceHistory.length > 10) {
        const recentPrices = product.priceHistory.slice(-10);
        const oldPrices = product.priceHistory.slice(-20, -10);

        const recentAvg = recentPrices.reduce((sum, p) => sum + p.price, 0) / recentPrices.length;
        const oldAvg = oldPrices.reduce((sum, p) => sum + p.price, 0) / oldPrices.length;

        recommendations.priceTrend = recentAvg > oldAvg ? 'increasing' : 'decreasing';
        recommendations.trendPercentage = ((recentAvg - oldAvg) / oldAvg * 100).toFixed(2);
      }

      return recommendations;
    } catch (error) {
      console.error('Error getting pricing recommendation:', error);
      throw error;
    }
  }

  // Monitor competitor prices
  async monitorCompetitorPrices(userId, asinList, domain = 'com') {
    try {
      const products = await this.getBatchPriceHistory(userId, asinList, domain);

      const analysis = {
        timestamp: new Date().toISOString(),
        competitors: [],
        marketAverage: 0,
        marketLow: Infinity,
        marketHigh: 0,
        recommendations: []
      };

      products.forEach(product => {
        if (product && product.currentPrice) {
          analysis.competitors.push({
            asin: product.asin,
            title: product.title,
            currentPrice: product.currentPrice,
            avg30Days: product.stats.avg30,
            salesRank: product.stats.salesRankCurrent,
            keepaScore: product.keepaScore
          });

          analysis.marketAverage += product.currentPrice;
          analysis.marketLow = Math.min(analysis.marketLow, product.currentPrice);
          analysis.marketHigh = Math.max(analysis.marketHigh, product.currentPrice);
        }
      });

      if (analysis.competitors.length > 0) {
        analysis.marketAverage /= analysis.competitors.length;

        // Generate recommendations
        analysis.recommendations.push({
          strategy: 'price-match',
          suggestedPrice: analysis.marketAverage,
          rationale: 'Match market average to remain competitive'
        });

        analysis.recommendations.push({
          strategy: 'undercut',
          suggestedPrice: analysis.marketLow * 0.98,
          rationale: 'Price below lowest competitor for quick sales'
        });

        analysis.recommendations.push({
          strategy: 'value-position',
          suggestedPrice: analysis.marketAverage * 1.1,
          rationale: 'Premium pricing if product has unique value'
        });
      }

      // Log competitor analysis since keepa_competitor_analysis table doesn't exist
      console.log('Keepa competitor analysis:', {
        user_id: userId,
        analysis_data: analysis,
        created_at: new Date().toISOString()
      });

      return analysis;
    } catch (error) {
      console.error('Error monitoring competitor prices:', error);
      throw error;
    }
  }
}

module.exports = new KeepaService();