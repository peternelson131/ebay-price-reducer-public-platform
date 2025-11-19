# eBay Competitive Pricing Analysis Implementation Plan

## Overview

This plan implements a competitive pricing analysis feature that suggests minimum and average prices for eBay listings based on active competitor listings. The system uses eBay's Browse API to find similar products and calculates pricing recommendations that are displayed directly in the listings table with one-click acceptance.

## Current State Analysis

### Existing Architecture
- **Frontend**: React + Vite with TanStack Query for data fetching
- **Backend**: Netlify serverless functions
- **Database**: Supabase PostgreSQL with existing `listings` table
- **eBay Integration**:
  - Inventory API (fetch user's listings)
  - Trading API (view/watch counts)
  - OAuth 2.0 with per-user credentials

### Current Database Schema (`listings` table)
The schema already includes market analysis fields (lines 80-85 in `supabase-schema.sql`):
- `market_average_price` DECIMAL(10,2)
- `market_lowest_price` DECIMAL(10,2)
- `market_highest_price` DECIMAL(10,2)
- `market_competitor_count` INTEGER
- `last_market_analysis` TIMESTAMP WITH TIME ZONE

### Key Discovery
- ✅ Market analysis fields already exist in the schema
- ✅ Browse API can search active listings with condition/price filters
- ❌ Finding API (sold items) decommissioned Feb 2025
- ✅ Browse API requires OAuth token (we already have this)

## Desired End State

### User Experience
1. User imports listings from eBay
2. System automatically analyzes each new listing (first-time only)
3. Suggested prices appear in new columns in the listings table
4. User can accept suggested prices with one click
5. System never re-analyzes a listing (one-time analysis)

### Verification Criteria
A listing has been successfully analyzed when:
- `market_average_price` IS NOT NULL OR `last_market_analysis` IS NOT NULL
- UI displays suggested prices or "No competitors found" message
- User can click "Accept Avg" or "Accept Min" to apply suggested price

## What We're NOT Doing

- ❌ Real-time pricing updates (one-time analysis only)
- ❌ Sold item pricing (Finding API decommissioned)
- ❌ Manual re-trigger of analysis for specific listings
- ❌ Shipping cost normalization (keeping it simple for v1)
- ❌ Seller reputation filtering
- ❌ Geographic filtering
- ❌ Advanced outlier detection (just basic 3x filter)
- ❌ Machine learning price predictions

## Implementation Approach

### High-Level Strategy
1. Add new Netlify function for competitive pricing analysis
2. Integrate analysis into listing import flow (trigger-sync)
3. Add database column to track analysis status
4. Update Listings UI to display suggested prices
5. Add accept/reject buttons for one-click price application

### Matching Algorithm (Waterfall Approach)
For each listing, search competitors in this order (stop at first tier yielding ≥5 results):

**Tier 1**: GTIN/UPC search (if available)
- API: `/buy/browse/v1/item_summary/search?gtin={upc}`
- Precision: Exact product match

**Tier 2**: Title + Category search
- API: `/buy/browse/v1/item_summary/search?q={keywords}&category_ids={category_id}`
- Extract 3-5 key terms from title (remove common words)
- Precision: High (same product type in same category)

**Tier 3**: Title-only search (fallback)
- API: `/buy/browse/v1/item_summary/search?q={keywords}`
- Precision: Lower, but broader dataset

**All Tiers Include**:
- All conditions (NEW, USED, UNSPECIFIED) to maximize dataset
- Exclude user's own seller ID
- Apply outlier filter: remove prices >3x or <0.3x median

### Price Calculations
From matched competitors:
- **Suggested Minimum** = Lowest competitor price (after outlier removal)
- **Suggested Average** = Mean of all prices (after outlier removal)
- **Metadata**: competitor count, match tier, timestamp

---

## Phase 1: Database Schema Updates

### Overview
Add column to track analysis status and ensure market analysis fields exist.

### Changes Required

#### 1. Database Migration
**File**: `add-competitive-pricing-tracking.sql` (new file in project root)

```sql
-- Add column to track if listing has been analyzed
-- This prevents re-analyzing listings that have already been processed
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS price_analysis_completed BOOLEAN DEFAULT FALSE;

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_listings_analysis_status
ON listings(price_analysis_completed)
WHERE price_analysis_completed = FALSE;

-- Add column to track which matching tier was used
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS price_match_tier TEXT;

-- Update existing listings to mark as not analyzed
UPDATE listings
SET price_analysis_completed = FALSE
WHERE price_analysis_completed IS NULL;

COMMENT ON COLUMN listings.price_analysis_completed IS 'Indicates if competitive pricing analysis has been completed for this listing';
COMMENT ON COLUMN listings.price_match_tier IS 'Which search tier was used: gtin, title_category, title_only, or null if no matches found';
```

### Success Criteria

#### Automated Verification
- [ ] Migration applies cleanly: `psql $DATABASE_URL -f add-competitive-pricing-tracking.sql`
- [ ] Column exists: `psql $DATABASE_URL -c "\d listings"` shows `price_analysis_completed`
- [ ] Index created: `psql $DATABASE_URL -c "\di idx_listings_analysis_status"`

#### Manual Verification
- [ ] Existing listings have `price_analysis_completed = FALSE`
- [ ] No data loss in existing market analysis fields

---

## Phase 2: Browse API Client Implementation

### Overview
Create reusable client for eBay Browse API to search for competitor listings.

### Changes Required

#### 1. Browse API Client Utility
**File**: `netlify/functions/utils/ebay-browse-client.js` (new file)

```javascript
/**
 * eBay Browse API Client
 *
 * Handles competitive pricing searches using the Buy Browse API
 * Requires OAuth access token with buy scopes
 */

class EbayBrowseClient {
  constructor(accessToken, userEbaySellerId = null) {
    this.accessToken = accessToken;
    this.userEbaySellerId = userEbaySellerId;
    this.baseUrl = 'https://api.ebay.com/buy/browse/v1';
  }

  /**
   * Search for items by GTIN (UPC/EAN)
   * @param {string} gtin - The GTIN/UPC code
   * @returns {Promise<Array>} Array of competitor listings
   */
  async searchByGtin(gtin) {
    const url = `${this.baseUrl}/item_summary/search`;
    const params = new URLSearchParams({
      gtin: gtin,
      limit: 50
    });

    return this._makeRequest(url, params);
  }

  /**
   * Search by title keywords and category
   * @param {string} keywords - Search keywords from title
   * @param {string} categoryId - eBay category ID
   * @returns {Promise<Array>} Array of competitor listings
   */
  async searchByTitleAndCategory(keywords, categoryId) {
    const url = `${this.baseUrl}/item_summary/search`;
    const params = new URLSearchParams({
      q: keywords,
      category_ids: categoryId,
      limit: 50
    });

    return this._makeRequest(url, params);
  }

  /**
   * Search by title keywords only (broadest search)
   * @param {string} keywords - Search keywords from title
   * @returns {Promise<Array>} Array of competitor listings
   */
  async searchByTitle(keywords) {
    const url = `${this.baseUrl}/item_summary/search`;
    const params = new URLSearchParams({
      q: keywords,
      limit: 50
    });

    return this._makeRequest(url, params);
  }

  /**
   * Extract key search terms from listing title
   * Removes common words and keeps meaningful terms
   */
  extractKeywords(title) {
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'new', 'used', 'free', 'shipping', 'fast'
    ]);

    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 2 && !commonWords.has(word))
      .slice(0, 5) // Take first 5 meaningful words
      .join(' ');
  }

  /**
   * Filter out listings from the same seller
   */
  filterOwnListings(items) {
    if (!this.userEbaySellerId) return items;

    return items.filter(item => {
      const sellerUsername = item.seller?.username;
      return sellerUsername !== this.userEbaySellerId;
    });
  }

  /**
   * Remove price outliers using median-based filtering
   */
  filterOutliers(items) {
    if (items.length < 3) return items; // Need at least 3 items

    // Extract prices
    const prices = items
      .map(item => parseFloat(item.price?.value || 0))
      .filter(price => price > 0)
      .sort((a, b) => a - b);

    if (prices.length === 0) return items;

    // Calculate median
    const median = prices[Math.floor(prices.length / 2)];
    const minPrice = median * 0.3;
    const maxPrice = median * 3;

    // Filter items within range
    return items.filter(item => {
      const price = parseFloat(item.price?.value || 0);
      return price >= minPrice && price <= maxPrice;
    });
  }

  /**
   * Make authenticated request to Browse API
   */
  async _makeRequest(url, params) {
    const fullUrl = `${url}?${params.toString()}`;

    try {
      const response = await fetch(fullUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Browse API error:', response.status, errorText);
        return [];
      }

      const data = await response.json();
      return data.itemSummaries || [];

    } catch (error) {
      console.error('Browse API request failed:', error);
      return [];
    }
  }
}

module.exports = { EbayBrowseClient };
```

#### 2. Competitive Pricing Service
**File**: `netlify/functions/utils/competitive-pricing-service.js` (new file)

```javascript
const { EbayBrowseClient } = require('./ebay-browse-client');

/**
 * Service for analyzing competitive pricing
 */
class CompetitivePricingService {
  constructor(accessToken, userEbaySellerId) {
    this.browseClient = new EbayBrowseClient(accessToken, userEbaySellerId);
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
      console.log(`Tier 2: Searching by title + category for listing ${listing.sku}`);
      const keywords = this.browseClient.extractKeywords(listing.title);
      competitors = await this.browseClient.searchByTitleAndCategory(keywords, listing.category_id);

      if (competitors.length >= 5) {
        matchTier = 'title_category';
        console.log(`✓ Found ${competitors.length} competitors via title + category`);
      }
    }

    // Tier 3: Title-only search (fallback)
    if (!matchTier && listing.title) {
      console.log(`Tier 3: Searching by title only for listing ${listing.sku}`);
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

    console.log(`Analysis complete for ${listing.sku}:`, {
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
```

### Success Criteria

#### Automated Verification
- [ ] Files created: `ls netlify/functions/utils/ebay-browse-client.js`
- [ ] Files created: `ls netlify/functions/utils/competitive-pricing-service.js`
- [ ] No syntax errors: `node -c netlify/functions/utils/ebay-browse-client.js`
- [ ] No syntax errors: `node -c netlify/functions/utils/competitive-pricing-service.js`

#### Manual Verification
- [ ] Can instantiate EbayBrowseClient with access token
- [ ] extractKeywords() returns meaningful terms from sample titles
- [ ] filterOutliers() correctly removes prices >3x or <0.3x median

---

## Phase 3: Pricing Analysis Netlify Function

### Overview
Create serverless function to analyze listings and update database with competitive pricing.

### Changes Required

#### 1. Analyze Competitive Pricing Function
**File**: `netlify/functions/analyze-competitive-pricing.js` (new file)

```javascript
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { EnhancedEbayClient } = require('./utils/enhanced-ebay-client');
const { CompetitivePricingService } = require('./utils/competitive-pricing-service');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Analyze competitive pricing for listings that haven't been analyzed yet
 */
exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Authentication required' })
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid authentication' })
      };
    }

    // Get user's eBay seller ID
    const { data: userData } = await supabase
      .from('users')
      .select('ebay_user_id')
      .eq('id', user.id)
      .single();

    const userEbaySellerId = userData?.ebay_user_id;

    // Initialize eBay client
    const ebayClient = new EnhancedEbayClient(user.id);
    await ebayClient.initialize();

    // Get listings that need analysis
    const { data: listingsToAnalyze, error: fetchError } = await supabase
      .from('listings')
      .select('*')
      .eq('user_id', user.id)
      .eq('price_analysis_completed', false)
      .limit(20); // Process in batches to avoid rate limits

    if (fetchError) {
      throw new Error(`Failed to fetch listings: ${fetchError.message}`);
    }

    if (!listingsToAnalyze || listingsToAnalyze.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No listings to analyze',
          analyzed: 0
        })
      };
    }

    console.log(`Analyzing ${listingsToAnalyze.length} listings for user ${user.id}`);

    // Initialize pricing service
    const pricingService = new CompetitivePricingService(
      ebayClient.accessToken,
      userEbaySellerId
    );

    let analyzedCount = 0;
    let errorCount = 0;

    // Analyze each listing
    for (const listing of listingsToAnalyze) {
      try {
        console.log(`Analyzing listing: ${listing.sku} - ${listing.title}`);

        const analysis = await pricingService.analyzeListingPricing(listing);

        // Update listing in database
        const { error: updateError } = await supabase
          .from('listings')
          .update({
            market_average_price: analysis.suggestedAvgPrice,
            market_lowest_price: analysis.suggestedMinPrice,
            market_highest_price: analysis.marketHighestPrice,
            market_competitor_count: analysis.competitorCount,
            price_match_tier: analysis.matchTier,
            last_market_analysis: new Date().toISOString(),
            price_analysis_completed: true
          })
          .eq('id', listing.id);

        if (updateError) {
          console.error(`Failed to update listing ${listing.id}:`, updateError);
          errorCount++;
        } else {
          analyzedCount++;
        }

        // Rate limiting: 200ms delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        console.error(`Error analyzing listing ${listing.id}:`, error);
        errorCount++;

        // Mark as analyzed even if failed (to avoid infinite retries)
        await supabase
          .from('listings')
          .update({
            price_analysis_completed: true,
            last_market_analysis: new Date().toISOString(),
            price_match_tier: 'error'
          })
          .eq('id', listing.id);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        analyzed: analyzedCount,
        errors: errorCount,
        total: listingsToAnalyze.length
      })
    };

  } catch (error) {
    console.error('Analysis failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to analyze competitive pricing',
        message: error.message
      })
    };
  }
};
```

### Success Criteria

#### Automated Verification
- [ ] Function created: `ls netlify/functions/analyze-competitive-pricing.js`
- [ ] No syntax errors: `node -c netlify/functions/analyze-competitive-pricing.js`
- [ ] Function listed: `netlify functions:list | grep analyze-competitive-pricing`

#### Manual Verification
- [ ] Function can be called via API: `curl /.netlify/functions/analyze-competitive-pricing`
- [ ] Returns 401 without auth token
- [ ] Successfully analyzes listings when called with valid auth

---

## Phase 4: Integration with Listing Import Flow

### Overview
Automatically trigger competitive pricing analysis when listings are imported.

### Changes Required

#### 1. Update Trigger Sync Function
**File**: `netlify/functions/trigger-sync.js`

Add competitive pricing analysis after sync completes:

```javascript
// At the top, add import
const { analyzePricingForUser } = require('./utils/pricing-analyzer');

// After successful sync, add this code (around line 140-150):

    // Trigger competitive pricing analysis for newly synced listings
    try {
      console.log('Triggering competitive pricing analysis...');

      // Call analysis in background (don't wait for completion)
      fetch('/.netlify/functions/analyze-competitive-pricing', {
        method: 'POST',
        headers: {
          'Authorization': event.headers.authorization,
          'Content-Type': 'application/json'
        }
      }).catch(err => {
        console.error('Failed to trigger pricing analysis:', err);
        // Don't fail the sync if analysis fails
      });

    } catch (analysisError) {
      console.error('Error triggering pricing analysis:', analysisError);
      // Don't fail the sync if analysis fails
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        syncedCount,
        errorCount,
        errors: errors.slice(0, 5),
        timestamp: new Date().toISOString(),
        pricingAnalysisTriggered: true
      })
    };
```

### Success Criteria

#### Automated Verification
- [ ] No syntax errors: `node -c netlify/functions/trigger-sync.js`
- [ ] Function deploys: `netlify deploy --build`

#### Manual Verification
- [ ] Sync from eBay triggers pricing analysis automatically
- [ ] Netlify function logs show "Triggering competitive pricing analysis"
- [ ] New listings get analyzed within 1 minute of import

---

## Phase 5: Frontend UI Updates

### Overview
Add suggested pricing columns to listings table with accept/reject buttons.

### Changes Required

#### 1. Update Listings Component
**File**: `frontend/src/pages/Listings.jsx`

**Add to column configuration (around line 612)**:

```javascript
const getColumnConfig = (column) => {
  const configs = {
    image: { label: 'Image', sortable: false, width: 'w-20 lg:w-24' },
    title: { label: 'Title', sortable: true, sortKey: 'title', width: 'w-1/3 lg:w-2/5' },
    quantity: { label: 'Quantity', sortable: true, sortKey: 'quantity', width: 'w-16 lg:w-20' },
    currentPrice: { label: 'Current Price', sortable: true, sortKey: 'current_price', width: 'w-24 lg:w-28' },

    // NEW: Competitive pricing columns
    suggestedPricing: { label: 'Suggested Pricing', sortable: false, width: 'w-56 lg:w-64' },

    minimumPrice: { label: 'Minimum Price', sortable: false, width: 'w-24 lg:w-28' },
    priceReductionEnabled: { label: 'Price Reduction', sortable: true, sortKey: 'price_reduction_enabled', width: 'w-32 lg:w-36' },
    strategy: { label: 'Strategy', sortable: false, width: 'w-40 lg:w-48' },
    viewCount: { label: 'Views', sortable: true, sortKey: 'view_count', width: 'w-20 lg:w-24' },
    watchCount: { label: 'Watchers', sortable: true, sortKey: 'watch_count', width: 'w-20 lg:w-24' },
    listingAge: { label: 'Listing Age', sortable: true, sortKey: 'created_at', width: 'w-20 lg:w-24' },
    actions: { label: 'Actions', sortable: false, width: 'w-32 lg:w-36' }
  }
  return configs[column] || { label: column, sortable: false }
}
```

**Update column order state (around line 18)**:

```javascript
return [
  'image', 'title', 'quantity', 'currentPrice', 'suggestedPricing', 'minimumPrice',
  'priceReductionEnabled', 'strategy', 'viewCount', 'watchCount', 'listingAge', 'actions'
]
```

**Update visible columns state (around line 33)**:

```javascript
return {
  image: true,
  title: true,
  quantity: true,
  currentPrice: true,
  suggestedPricing: true,  // NEW
  minimumPrice: true,
  priceReductionEnabled: true,
  strategy: true,
  viewCount: true,
  watchCount: true,
  listingAge: true,
  actions: true
}
```

**Add mutation for accepting suggested price (around line 210)**:

```javascript
const acceptSuggestedPriceMutation = useMutation(
  ({ listingId, suggestedPrice }) => listingsAPI.updateListing(listingId, {
    current_price: suggestedPrice,
    minimum_price: suggestedPrice * 0.8  // Set min to 80% of suggested
  }),
  {
    onSuccess: (data, { suggestedPrice }) => {
      showNotification('success', `Price updated to $${suggestedPrice}`)
      queryClient.invalidateQueries('listings')
    },
    onError: (error) => {
      showNotification('error', error.message || 'Failed to update price')
    }
  }
)

const handleAcceptSuggestedPrice = (listingId, suggestedPrice) => {
  if (window.confirm(`Update listing price to $${suggestedPrice}?`)) {
    acceptSuggestedPriceMutation.mutate({ listingId, suggestedPrice })
  }
}
```

**Add render case for suggestedPricing column (in table renderCell switch, around line 1370)**:

```javascript
case 'suggestedPricing':
  const hasAnalysis = listing.last_market_analysis !== null;
  const hasCompetitors = listing.market_competitor_count > 0;
  const lowDataWarning = hasCompetitors && listing.market_competitor_count < 5;

  return (
    <div className="text-xs">
      {!hasAnalysis ? (
        <span className="text-gray-400 italic">Analyzing...</span>
      ) : !hasCompetitors ? (
        <span className="text-gray-400 italic">No competitors found</span>
      ) : (
        <div className="space-y-1">
          {lowDataWarning && (
            <div className="text-orange-600 font-medium mb-1">
              ⚠️ Only {listing.market_competitor_count} found
            </div>
          )}

          {/* Average Price */}
          {listing.market_average_price && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-600">Avg:</span>
              <span className="font-medium text-blue-600">
                ${listing.market_average_price.toFixed(2)}
              </span>
              <button
                onClick={() => handleAcceptSuggestedPrice(listing.id, listing.market_average_price)}
                disabled={acceptSuggestedPriceMutation.isLoading}
                className="bg-blue-600 text-white px-2 py-0.5 rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                title="Set current price to average"
              >
                Accept
              </button>
            </div>
          )}

          {/* Minimum Price */}
          {listing.market_lowest_price && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-600">Min:</span>
              <span className="font-medium text-green-600">
                ${listing.market_lowest_price.toFixed(2)}
              </span>
              <button
                onClick={() => handleAcceptSuggestedPrice(listing.id, listing.market_lowest_price)}
                disabled={acceptSuggestedPriceMutation.isLoading}
                className="bg-green-600 text-white px-2 py-0.5 rounded text-xs hover:bg-green-700 disabled:opacity-50"
                title="Set current price to minimum"
              >
                Accept
              </button>
            </div>
          )}

          {/* Metadata */}
          <div className="text-gray-400 mt-1">
            {listing.market_competitor_count} comp
            {listing.market_competitor_count !== 1 ? 's' : ''}
            {listing.price_match_tier && (
              <span className="ml-1">
                ({listing.price_match_tier === 'gtin' ? 'UPC' :
                  listing.price_match_tier === 'title_category' ? 'Cat' :
                  listing.price_match_tier === 'title_only' ? 'Title' : '?'})
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
```

**Add mobile card view for suggested pricing (around line 1085)**:

```javascript
{/* After the Age field in mobile view */}
{listing.last_market_analysis && listing.market_competitor_count > 0 && (
  <div className="col-span-2 pt-2 border-t border-gray-200">
    <span className="text-sm text-gray-500 block mb-2">Suggested Pricing:</span>

    {listing.market_competitor_count < 5 && (
      <div className="text-xs text-orange-600 mb-2">
        ⚠️ Only {listing.market_competitor_count} competitor{listing.market_competitor_count !== 1 ? 's' : ''} found
      </div>
    )}

    <div className="space-y-2">
      {listing.market_average_price && (
        <div className="flex items-center justify-between">
          <span className="text-sm">Avg: <span className="font-medium text-blue-600">${listing.market_average_price.toFixed(2)}</span></span>
          <button
            onClick={() => handleAcceptSuggestedPrice(listing.id, listing.market_average_price)}
            className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700"
          >
            Accept Avg
          </button>
        </div>
      )}

      {listing.market_lowest_price && (
        <div className="flex items-center justify-between">
          <span className="text-sm">Min: <span className="font-medium text-green-600">${listing.market_lowest_price.toFixed(2)}</span></span>
          <button
            onClick={() => handleAcceptSuggestedPrice(listing.id, listing.market_lowest_price)}
            className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700"
          >
            Accept Min
          </button>
        </div>
      )}
    </div>
  </div>
)}
```

### Success Criteria

#### Automated Verification
- [ ] No syntax errors: `npm run lint` in frontend directory
- [ ] No type errors: `npm run build` succeeds
- [ ] Component renders: Development server starts without errors

#### Manual Verification
- [ ] "Suggested Pricing" column appears in listings table
- [ ] Shows "Analyzing..." for new listings without analysis
- [ ] Shows "No competitors found" when market_competitor_count = 0
- [ ] Shows average and minimum prices with Accept buttons when data available
- [ ] Shows warning icon when <5 competitors found
- [ ] Accept button updates listing price and shows success notification
- [ ] Mobile card view displays suggested pricing correctly

---

## Testing Strategy

### Unit Tests
Not required for Phase 1 (manual testing sufficient).

### Integration Tests
Not required for Phase 1 (manual testing sufficient).

### Manual Testing Steps

#### Test 1: Database Migration
1. Run migration: `psql $DATABASE_URL -f add-competitive-pricing-tracking.sql`
2. Verify column exists: `psql $DATABASE_URL -c "\d listings"`
3. Check existing data: All listings should have `price_analysis_completed = FALSE`

#### Test 2: New Listing Import & Analysis
1. Go to Listings page
2. Click "Import from eBay"
3. Wait for sync to complete
4. Verify new listings show "Analyzing..." in Suggested Pricing column
5. Wait 1-2 minutes
6. Refresh page
7. Verify suggested prices appear or "No competitors found" message

#### Test 3: Accept Suggested Price
1. Find listing with suggested pricing
2. Click "Accept" button next to Average price
3. Verify confirmation dialog appears
4. Confirm
5. Verify:
   - Success notification appears
   - Current price updates to suggested price
   - Minimum price updates to 80% of suggested
   - Page refreshes data

#### Test 4: Low Competitor Warning
1. Find listing with <5 competitors (check database if needed)
2. Verify warning icon "⚠️ Only X found" appears
3. Verify prices still show and are clickable

#### Test 5: No Re-Analysis
1. Import listings (triggers analysis)
2. Wait for analysis to complete
3. Import listings again (same listings)
4. Verify suggested prices don't change (no re-analysis)
5. Check database: `price_analysis_completed` should remain `TRUE`

#### Test 6: Mobile View
1. Resize browser to mobile width
2. Verify suggested pricing appears in card view
3. Verify Accept buttons work correctly
4. Verify warning for low competitors displays

---

## Performance Considerations

### API Rate Limits
- eBay Browse API: ~5000 calls/day per token
- Our approach: 200ms delay between requests = ~18,000 listings/hour max
- Batch size: 20 listings per function call
- One-time analysis prevents repeated API calls

### Database Performance
- Index on `price_analysis_completed` for efficient queries
- Batch updates (20 at a time) prevent overwhelming database
- Partial indexes improve query speed

### Frontend Performance
- New column adds minimal overhead (data already fetched)
- No additional API calls required
- LocalStorage for column preferences prevents re-renders

---

## Migration Notes

### Handling Existing Listings
1. All existing listings will have `price_analysis_completed = FALSE` after migration
2. Trigger analysis manually: Call `/.netlify/functions/analyze-competitive-pricing`
3. Or wait for next scheduled sync (will analyze unanalyzed listings)

### Rollback Plan
If issues occur:

```sql
-- Remove new columns
ALTER TABLE listings DROP COLUMN IF EXISTS price_analysis_completed;
ALTER TABLE listings DROP COLUMN IF EXISTS price_match_tier;

-- Drop index
DROP INDEX IF EXISTS idx_listings_analysis_status;
```

### Data Retention
- Keep analysis results indefinitely (helps with historical tracking)
- Market prices represent snapshot at time of analysis
- Consider adding "last_market_analysis" timestamp to UI for transparency

---

## References

- eBay Browse API Docs: https://developer.ebay.com/api-docs/buy/browse/overview.html
- Current schema: `supabase-schema.sql:46-91`
- Listings UI: `frontend/src/pages/Listings.jsx`
- Sync function: `netlify/functions/trigger-sync.js`

---

## Future Enhancements (Not in This Plan)

1. **Periodic Re-Analysis** - Allow manual refresh of pricing data
2. **Sold Items Integration** - When Marketplace Insights API becomes available
3. **Price Trend Charts** - Track competitor pricing over time
4. **Smart Pricing Rules** - "Always price 5% below average"
5. **Shipping Cost Normalization** - Factor in shipping for total buyer cost
6. **Condition-Specific Matching** - Weight matches by condition similarity
7. **Bulk Accept** - Accept all suggested prices at once
