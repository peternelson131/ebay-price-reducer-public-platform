const { EbayBrowseClient } = require('./ebay-browse-client');

/**
 * Service for analyzing competitive pricing
 */
class CompetitivePricingService {
  constructor(appId, certId, userEbaySellerId) {
    this.browseClient = new EbayBrowseClient(appId, certId, userEbaySellerId);
  }

  /**
   * Analyze pricing for a single listing using waterfall approach
   * @param {Object} listing - The listing to analyze
   * @returns {Object} Pricing analysis result
   */
  async analyzeListingPricing(listing) {
    let competitors = [];
    let matchTier = null;

    // Tier 1: GTIN search (if available)
    if (listing.gtin || listing.upc) {
      console.log(`Tier 1: Searching by GTIN/UPC for listing ${listing.sku}`);
      competitors = await this.browseClient.searchByGtin(listing.gtin || listing.upc);

      if (competitors.length >= 5) {
        matchTier = 'gtin';
        console.log(`✓ Found ${competitors.length} competitors via GTIN`);
      }
    }

    // Tier 2: Title + Category search
    if (!matchTier && listing.title && listing.category_id) {
      console.log(`Tier 2: Searching by title + category for listing ${listing.sku || listing.ebay_item_id}`);
      const keywords = this.browseClient.extractKeywords(listing.title);
      competitors = await this.browseClient.searchByTitleAndCategory(keywords, listing.category_id);

      if (competitors.length >= 5) {
        matchTier = 'title_category';
        console.log(`✓ Found ${competitors.length} competitors via title + category`);
      }
    }

    // Tier 3: Title-only search (fallback)
    if (!matchTier && listing.title) {
      console.log(`Tier 3: Searching by title only for listing ${listing.sku || listing.ebay_item_id}`);
      const keywords = this.browseClient.extractKeywords(listing.title);
      competitors = await this.browseClient.searchByTitle(keywords);

      if (competitors.length > 0) {
        matchTier = 'title_only';
        console.log(`✓ Found ${competitors.length} competitors via title only`);
      }
    }

    // Filter and process competitors
    competitors = this.browseClient.filterOwnListings(competitors);
    competitors = this.browseClient.filterOutliers(competitors);

    // Calculate pricing metrics
    const analysis = this.calculatePricingMetrics(competitors, matchTier);

    console.log(`Analysis complete for ${listing.sku || listing.ebay_item_id}:`, {
      matchTier: analysis.matchTier,
      competitorCount: analysis.competitorCount,
      suggestedMin: analysis.suggestedMinPrice,
      suggestedAvg: analysis.suggestedAvgPrice
    });

    return analysis;
  }

  /**
   * Calculate pricing metrics from competitor data
   */
  calculatePricingMetrics(competitors, matchTier) {
    if (competitors.length === 0) {
      return {
        suggestedMinPrice: null,
        suggestedAvgPrice: null,
        marketLowestPrice: null,
        marketHighestPrice: null,
        competitorCount: 0,
        matchTier: matchTier || 'no_matches',
        hasInsufficientData: true
      };
    }

    // Extract prices
    const prices = competitors
      .map(item => parseFloat(item.price?.value || 0))
      .filter(price => price > 0)
      .sort((a, b) => a - b);

    if (prices.length === 0) {
      return {
        suggestedMinPrice: null,
        suggestedAvgPrice: null,
        marketLowestPrice: null,
        marketHighestPrice: null,
        competitorCount: 0,
        matchTier: matchTier || 'no_matches',
        hasInsufficientData: true
      };
    }

    // Calculate metrics
    const suggestedMinPrice = Math.min(...prices);
    const suggestedAvgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const marketLowestPrice = Math.min(...prices);
    const marketHighestPrice = Math.max(...prices);

    return {
      suggestedMinPrice: parseFloat(suggestedMinPrice.toFixed(2)),
      suggestedAvgPrice: parseFloat(suggestedAvgPrice.toFixed(2)),
      marketLowestPrice: parseFloat(marketLowestPrice.toFixed(2)),
      marketHighestPrice: parseFloat(marketHighestPrice.toFixed(2)),
      competitorCount: competitors.length,
      matchTier: matchTier,
      hasInsufficientData: competitors.length < 5
    };
  }
}

module.exports = { CompetitivePricingService };
