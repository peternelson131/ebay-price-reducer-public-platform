import { supabase } from '../lib/supabase';

// Detect if we're in production (Netlify) or development
const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const API_URL = isProduction
  ? '/.netlify/functions/keepa-api'
  : (import.meta.env.VITE_API_URL || 'http://localhost:3001');

class KeepaApiService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  // Helper to get auth token
  async getAuthToken() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Authentication required');
    }
    return session.access_token;
  }

  // Helper for API requests
  async request(endpoint, options = {}) {
    try {
      const token = await this.getAuthToken();

      // Adjust URL based on environment
      const url = isProduction
        ? `${API_URL}${endpoint}`
        : `${API_URL}/api/keepa${endpoint}`;

      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...options.headers
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('Keepa API request failed:', error);
      throw error;
    }
  }

  // Save and validate API key
  async saveApiKey(apiKey) {
    try {
      const result = await this.request('/api-key', {
        method: 'POST',
        body: JSON.stringify({ apiKey })
      });

      // Clear cache when API key is updated
      this.cache.clear();

      return result;
    } catch (error) {
      throw new Error(`Failed to save API key: ${error.message}`);
    }
  }

  // Test connection
  async testConnection() {
    try {
      return await this.request('/test-connection');
    } catch (error) {
      return {
        success: false,
        connected: false,
        message: error.message
      };
    }
  }

  // Get product data
  async getProduct(asin, domain = 'com') {
    const cacheKey = `product:${asin}:${domain}`;

    // Check cache
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const result = await this.request(`/product/${asin}?domain=${domain}`);

      if (result.success && result.product) {
        this.setCache(cacheKey, result.product);
      }

      return result.product;
    } catch (error) {
      throw new Error(`Failed to fetch product: ${error.message}`);
    }
  }

  // Search products
  async searchProducts(query, options = {}) {
    const params = new URLSearchParams({
      q: query,
      domain: options.domain || 'com',
      page: options.page || 0,
      type: options.type || 'product'
    });

    try {
      const result = await this.request(`/search?${params.toString()}`);
      return result.results || [];
    } catch (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  // Get pricing recommendations
  async getPricingRecommendations(asin, domain = 'com') {
    try {
      const result = await this.request(`/pricing-recommendation/${asin}?domain=${domain}`);
      return result.recommendations;
    } catch (error) {
      throw new Error(`Failed to get pricing recommendations: ${error.message}`);
    }
  }

  // Monitor competitor prices
  async monitorCompetitors(asins, domain = 'com') {
    if (!Array.isArray(asins) || asins.length === 0) {
      throw new Error('ASIN list is required');
    }

    try {
      const result = await this.request('/monitor-competitors', {
        method: 'POST',
        body: JSON.stringify({ asins, domain })
      });

      return result.analysis;
    } catch (error) {
      throw new Error(`Competitor monitoring failed: ${error.message}`);
    }
  }

  // Create price tracker
  async createPriceTracker(asin, targetPrice, domain = 'com') {
    try {
      const result = await this.request('/price-tracker', {
        method: 'POST',
        body: JSON.stringify({ asin, targetPrice, domain })
      });

      return result.tracker;
    } catch (error) {
      throw new Error(`Failed to create price tracker: ${error.message}`);
    }
  }

  // Get best sellers
  async getBestSellers(categoryId, domain = 'com') {
    const cacheKey = `bestsellers:${categoryId}:${domain}`;

    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      const result = await this.request(`/bestsellers/${categoryId}?domain=${domain}`);

      if (result.success && result.bestSellers) {
        this.setCache(cacheKey, result.bestSellers);
      }

      return result.bestSellers || [];
    } catch (error) {
      throw new Error(`Failed to fetch best sellers: ${error.message}`);
    }
  }

  // Get batch price history
  async getBatchPriceHistory(asins, domain = 'com') {
    if (!Array.isArray(asins) || asins.length === 0) {
      throw new Error('ASIN list is required');
    }

    if (asins.length > 100) {
      throw new Error('Maximum 100 ASINs allowed per request');
    }

    try {
      const result = await this.request('/batch-price-history', {
        method: 'POST',
        body: JSON.stringify({ asins, domain })
      });

      return result.priceHistory || [];
    } catch (error) {
      throw new Error(`Failed to fetch price history: ${error.message}`);
    }
  }

  // Get usage statistics
  async getUsageStats() {
    try {
      const result = await this.request('/usage-stats');
      return {
        tokensLeft: result.tokensLeft || 0,
        subscriptionLevel: result.subscriptionLevel || 'basic',
        dailyUsage: result.dailyUsage || []
      };
    } catch (error) {
      throw new Error(`Failed to fetch usage stats: ${error.message}`);
    }
  }

  // Helper: Get product by UPC/EAN (searches first, then gets product)
  async getProductByBarcode(barcode, domain = 'com') {
    try {
      // Search for the product using barcode
      const searchResults = await this.searchProducts(barcode, {
        domain,
        type: 'product'
      });

      if (!searchResults || searchResults.length === 0) {
        throw new Error('Product not found');
      }

      // Get detailed product data for the first result
      const product = await this.getProduct(searchResults[0].asin, domain);
      return product;
    } catch (error) {
      throw new Error(`Failed to fetch product by barcode: ${error.message}`);
    }
  }

  // Helper: Get products from eBay listing title
  async findAmazonEquivalent(ebayTitle, domain = 'com') {
    try {
      // Clean up eBay title for better Amazon search
      const cleanTitle = ebayTitle
        .replace(/\b(new|used|mint|excellent|good|fair|poor|condition|box|sealed)\b/gi, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const results = await this.searchProducts(cleanTitle, { domain });

      // Score results based on title similarity
      const scored = results.map(result => {
        const score = this.calculateSimilarity(cleanTitle.toLowerCase(), result.title.toLowerCase());
        return { ...result, score };
      });

      // Sort by score and return top matches
      return scored.sort((a, b) => b.score - a.score).slice(0, 5);
    } catch (error) {
      throw new Error(`Failed to find Amazon equivalent: ${error.message}`);
    }
  }

  // Calculate string similarity (Levenshtein distance)
  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  levenshteinDistance(str1, str2) {
    const costs = [];
    for (let i = 0; i <= str2.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= str1.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (str1.charAt(j - 1) !== str2.charAt(i - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[str1.length] = lastValue;
    }
    return costs[str1.length];
  }

  // Cache helpers
  getCached(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
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

  clearCache() {
    this.cache.clear();
  }

  // Format price for display
  formatPrice(price) {
    if (price === null || price === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price);
  }

  // Format date for display
  formatDate(date) {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}

// Export singleton instance
export default new KeepaApiService();