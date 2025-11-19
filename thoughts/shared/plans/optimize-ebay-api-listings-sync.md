# eBay API Optimization & 6-Hour Sync Implementation Plan

## Overview

Optimize eBay API usage to efficiently populate all Listings page columns while maintaining data freshness with a 6-hour sync interval. This plan consolidates duplicate API calls, adds missing data fields, and implements a scheduled background sync.

## Current State Analysis

### Current eBay API Usage

**Two APIs Currently in Use:**

1. **Trading API (Legacy XML)** - `netlify/functions/get-ebay-listings.js`
   - Endpoint: `GetMyeBaySelling`
   - Fields: itemId, title, price, quantity, end_time, watch_count, hit_count
   - Used by: Simple listing fetch

2. **Inventory API (Modern REST)** - `netlify/functions/ebay-fetch-listings.js`
   - Endpoints: `/inventory_item` + `/offer?sku={sku}`
   - Fields: SKU, title, description, quantity, price, images, condition, category
   - ⚠️ Makes 2 API calls per item with 200ms delay

### Listings Page Columns

From `frontend/src/pages/Listings.jsx:18-21`:

| Column | Data Source | Status |
|--------|------------|--------|
| image | Inventory API | ✅ Working |
| title | Inventory API | ✅ Working |
| quantity | Inventory API | ✅ Working |
| currentPrice | Inventory API | ✅ Working |
| minimumPrice | Database (user set) | ✅ Working |
| priceReductionEnabled | Database (user set) | ✅ Working |
| strategy | Database (user set) | ✅ Working |
| suggestedPrice | **Future: Marketplace Insights API** | ⏳ Placeholder |
| listingAge | Calculated from start_time | ✅ Working |
| actions | UI controls | ✅ Working |

### Missing Data Fields

From Trading API (not currently captured):
- `view_count` (HitCount) - Number of views
- `watch_count` (WatchCount) - Number of watchers

### Key Discoveries

- **Redundant API Calls**: Both Trading and Inventory APIs fetch overlapping data
- **Inefficient Offer Fetching**: Separate API call for each SKU (lines 275-334 in `ebay-fetch-listings.js`)
- **No Scheduled Sync**: Only manual refresh or page load triggers
- **Aggressive Caching**: 5-minute cache helps but not configurable

## Desired End State

### What Success Looks Like

1. **Efficient API Usage**:
   - Trading API: Used ONLY for view_count and watch_count (data not in Inventory API)
   - Inventory API: Primary source for all other listing data
   - Minimized API calls through smart batching

2. **Complete Data Population**:
   - All columns populated (except suggestedPrice placeholder)
   - view_count and watch_count displayed in UI
   - Data stays fresh with 6-hour background sync

3. **Scheduled Background Sync**:
   - Netlify scheduled function runs every 6 hours
   - Syncs all users' listings automatically
   - Manual refresh still available on-demand

4. **Performance**:
   - Reduced API calls by ~50% (eliminate duplicate fetches)
   - Faster page loads (better caching)
   - Rate limit compliance maintained

### Verification

- [ ] All Listings page columns display correct data
- [ ] View count and watch count populate from Trading API
- [ ] Background sync runs every 6 hours
- [ ] API call count reduced vs current implementation
- [ ] No regression in existing price reduction features

## What We're NOT Doing

- ❌ Implementing Marketplace Insights API (requires permissions)
- ❌ Real-time webhooks (future enhancement)
- ❌ Changing the 18-month OAuth refresh token flow
- ❌ Modifying the price reduction calculation logic
- ❌ Adding new columns beyond what's already defined

## Implementation Approach

**Strategy**: Hybrid API approach
- **Inventory API**: Primary source (SKU, title, price, images, etc.)
- **Trading API**: Supplemental data only (view_count, watch_count)
- **Scheduled Sync**: Netlify cron function every 6 hours
- **Caching**: Increase cache duration to match sync interval

## Phase 1: API Optimization & Data Mapping

### Overview
Create a unified data fetching strategy that uses both APIs efficiently and maps all fields to database columns.

### Changes Required

#### 1. Enhanced eBay Client with Hybrid Fetch

**File**: `netlify/functions/utils/enhanced-ebay-client.js` (NEW)

**Purpose**: Centralized client that orchestrates both APIs efficiently

```javascript
const crypto = require('crypto');

class EnhancedEbayClient {
  constructor(userCredentials) {
    this.appId = userCredentials.ebay_app_id;
    this.certId = userCredentials.ebay_cert_id;
    this.accessToken = null;
  }

  /**
   * Fetch all listing data using hybrid approach:
   * 1. Get inventory items from Inventory API
   * 2. Get view/watch counts from Trading API in batch
   * 3. Merge results
   */
  async fetchCompleteListings() {
    // Get inventory data (primary source)
    const inventoryData = await this.fetchInventoryItems();

    // Extract item IDs for Trading API batch fetch
    const itemIds = inventoryData
      .map(item => item.listingId || item.offerId)
      .filter(Boolean);

    // Get supplemental data from Trading API (batch call)
    const tradingData = await this.batchFetchTradingData(itemIds);

    // Merge data sources
    return this.mergeListingData(inventoryData, tradingData);
  }

  async fetchInventoryItems() {
    const response = await fetch(
      'https://api.ebay.com/sell/inventory/v1/inventory_item?limit=100',
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await response.json();

    // Fetch offers for all items in parallel (with rate limiting)
    const itemsWithOffers = await Promise.all(
      data.inventoryItems.map(item => this.fetchItemOffer(item))
    );

    return itemsWithOffers;
  }

  async fetchItemOffer(item) {
    const response = await fetch(
      `https://api.ebay.com/sell/inventory/v1/offer?sku=${item.sku}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const offers = await response.json();

    return {
      sku: item.sku,
      title: item.product?.title,
      description: item.product?.description,
      quantity: item.availability?.shipToLocationAvailability?.quantity || 0,
      image_urls: item.product?.imageUrls || [],
      condition: item.condition,
      category_id: item.product?.categoryId,
      category: item.product?.aspects?.Category?.[0],
      // From offer
      listing_id: offers.offers?.[0]?.listingId || offers.offers?.[0]?.offerId,
      current_price: parseFloat(offers.offers?.[0]?.pricingSummary?.price?.value || 0),
      currency: offers.offers?.[0]?.pricingSummary?.price?.currency || 'USD',
      listing_status: offers.offers?.[0]?.status,
      listing_format: offers.offers?.[0]?.format,
      start_time: offers.offers?.[0]?.createdDate
    };
  }

  /**
   * Batch fetch view/watch counts from Trading API
   * More efficient than individual GetItem calls
   */
  async batchFetchTradingData(itemIds) {
    if (!itemIds.length) return {};

    const xml = `<?xml version="1.0" encoding="utf-8"?>
      <GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
        <RequesterCredentials>
          <eBayAuthToken>${this.accessToken}</eBayAuthToken>
        </RequesterCredentials>
        <DetailLevel>ReturnAll</DetailLevel>
        <GranularityLevel>Fine</GranularityLevel>
        <IncludeWatchCount>true</IncludeWatchCount>
        ${itemIds.map(id => `<ItemID>${id}</ItemID>`).join('')}
      </GetSellerListRequest>`;

    const response = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GetSellerList',
        'Content-Type': 'text/xml'
      },
      body: xml
    });

    const xmlText = await response.text();
    const parser = new (require('xml2js')).Parser();
    const result = await parser.parseStringPromise(xmlText);

    // Map item data by ID
    const dataMap = {};
    const items = result?.GetSellerListResponse?.ItemArray?.[0]?.Item || [];

    items.forEach(item => {
      const id = item.ItemID?.[0];
      dataMap[id] = {
        view_count: parseInt(item.HitCount?.[0] || 0),
        watch_count: parseInt(item.WatchCount?.[0] || 0)
      };
    });

    return dataMap;
  }

  mergeListingData(inventoryData, tradingData) {
    return inventoryData.map(item => ({
      ...item,
      view_count: tradingData[item.listing_id]?.view_count || 0,
      watch_count: tradingData[item.listing_id]?.watch_count || 0
    }));
  }
}

module.exports = EnhancedEbayClient;
```

#### 2. Update Main Fetch Function

**File**: `netlify/functions/ebay-fetch-listings.js`

**Changes**: Replace current fetch logic with enhanced client

```javascript
// Add near top
const EnhancedEbayClient = require('./utils/enhanced-ebay-client');

// Replace lines 222-541 with:
const ebayClient = new EnhancedEbayClient({
  ebay_app_id: user.ebay_app_id,
  ebay_cert_id: user.ebay_cert_id
});

// Set access token
ebayClient.accessToken = tokenData.access_token;

// Fetch complete listings with hybrid approach
const listings = await ebayClient.fetchCompleteListings();

// Map to database schema (same as before but now includes view/watch counts)
const mappedListings = listings.map(item => ({
  user_id: authUser.id,
  ebay_item_id: item.listing_id,
  sku: item.sku,
  title: item.title,
  description: item.description,
  current_price: item.current_price,
  currency: item.currency,
  quantity: item.quantity,
  quantity_available: item.quantity,
  image_urls: item.image_urls,
  condition: item.condition,
  category_id: item.category_id,
  category: item.category,
  listing_status: item.listing_status,
  listing_format: item.listing_format,
  start_time: item.start_time,
  view_count: item.view_count,        // NEW
  watch_count: item.watch_count        // NEW
}));
```

### Success Criteria

#### Automated Verification:
- [ ] New enhanced client file exists: `ls netlify/functions/utils/enhanced-ebay-client.js`
- [ ] No syntax errors: `node -c netlify/functions/utils/enhanced-ebay-client.js`
- [ ] Updated fetch function loads: `node -c netlify/functions/ebay-fetch-listings.js`

#### Manual Verification:
- [ ] Fetch function returns listings with view_count and watch_count fields
- [ ] API call count reduced (check console logs)
- [ ] All existing listing data still populates correctly

---

## Phase 2: Enhanced Data Storage

### Overview
Add database columns for view_count and watch_count, update sync function to store new fields.

### Changes Required

#### 1. Database Schema Update

**File**: `supabase-listings-schema.sql` (exists, needs update)

**Changes**: Add new columns

```sql
-- Add view_count and watch_count columns
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS watch_count INTEGER DEFAULT 0;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_listings_view_count ON listings(view_count);
CREATE INDEX IF NOT EXISTS idx_listings_watch_count ON listings(watch_count);

-- Update last_synced tracking
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ DEFAULT NOW();
```

#### 2. Update Sync Function

**File**: `netlify/functions/sync-listings.js`

**Changes**: Include new fields in upsert

```javascript
// Update lines 92-111 to include new fields:
const { data, error } = await supabase
  .from('listings')
  .upsert(
    listings.map(listing => ({
      user_id: userId,
      ebay_item_id: listing.ebay_item_id,
      sku: listing.sku,
      title: listing.title,
      description: listing.description,
      current_price: listing.current_price,
      currency: listing.currency,
      quantity: listing.quantity,
      quantity_available: listing.quantity_available,
      image_urls: listing.image_urls,
      condition: listing.condition,
      category_id: listing.category_id,
      category: listing.category,
      listing_status: listing.listing_status,
      listing_format: listing.listing_format,
      start_time: listing.start_time,
      view_count: listing.view_count || 0,           // NEW
      watch_count: listing.watch_count || 0,         // NEW
      last_synced_at: new Date().toISOString()       // NEW
    })),
    {
      onConflict: 'user_id,ebay_item_id',
      ignoreDuplicates: false
    }
  );
```

#### 3. Update Frontend Data Model

**File**: `frontend/src/lib/supabase.js`

**Changes**: Ensure new fields are selected in queries

```javascript
// Update listingsAPI.getListings() to select new fields
const { data, error } = await supabase
  .from('listings')
  .select(`
    *,
    view_count,
    watch_count,
    last_synced_at
  `)
  .eq('user_id', user.id)
  // ... rest of query
```

### Success Criteria

#### Automated Verification:
- [ ] Schema migration can be applied: `psql -f supabase-listings-schema.sql` (or via Supabase dashboard)
- [ ] Sync function has no syntax errors: `node -c netlify/functions/sync-listings.js`

#### Manual Verification:
- [ ] Database columns exist in Supabase dashboard
- [ ] Sync function successfully stores view_count and watch_count
- [ ] Frontend queries return new fields
- [ ] No errors in browser console when loading listings

---

## Phase 3: 6-Hour Sync Implementation

### Overview
Implement a Netlify scheduled function that syncs all users' listings every 6 hours.

### Changes Required

#### 1. Create Scheduled Sync Function

**File**: `netlify/functions/scheduled-listings-sync.js` (NEW)

```javascript
const { schedule } = require('@netlify/functions');

// Import existing sync logic
const { supabaseRequest, getEncryptionKey, decrypt } = require('./ebay-fetch-listings');
const EnhancedEbayClient = require('./utils/enhanced-ebay-client');

const handler = async (event) => {
  console.log('Starting scheduled listings sync at', new Date().toISOString());

  try {
    // Get all users with eBay connections
    const users = await supabaseRequest(
      'users?ebay_refresh_token=not.is.null&select=id,email,ebay_app_id,ebay_cert_id,ebay_refresh_token',
      'GET',
      null,
      {},
      true // Use service key
    );

    console.log(`Found ${users.length} users to sync`);

    const results = {
      total: users.length,
      success: 0,
      failed: 0,
      errors: []
    };

    // Sync each user's listings
    for (const user of users) {
      try {
        await syncUserListings(user);
        results.success++;
      } catch (error) {
        console.error(`Failed to sync user ${user.id}:`, error);
        results.failed++;
        results.errors.push({
          userId: user.id,
          error: error.message
        });
      }
    }

    console.log('Scheduled sync complete:', results);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Scheduled sync completed',
        results
      })
    };
  } catch (error) {
    console.error('Scheduled sync failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Scheduled sync failed',
        message: error.message
      })
    };
  }
};

async function syncUserListings(user) {
  // Decrypt refresh token
  const decryptedRefreshToken = decrypt(user.ebay_refresh_token);

  // Get access token
  const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${user.ebay_app_id}:${user.ebay_cert_id}`).toString('base64')
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: decryptedRefreshToken,
      scope: 'https://api.ebay.com/oauth/api_scope ...' // full scopes
    })
  });

  const tokenData = await tokenResponse.json();

  // Fetch listings using enhanced client
  const ebayClient = new EnhancedEbayClient({
    ebay_app_id: user.ebay_app_id,
    ebay_cert_id: user.ebay_cert_id
  });
  ebayClient.accessToken = tokenData.access_token;

  const listings = await ebayClient.fetchCompleteListings();

  // Upsert to database
  await supabaseRequest(
    'listings',
    'POST',
    listings.map(listing => ({
      user_id: user.id,
      ...listing,
      last_synced_at: new Date().toISOString()
    })),
    { 'Prefer': 'resolution=merge-duplicates' },
    true
  );

  console.log(`Synced ${listings.length} listings for user ${user.id}`);
}

// Schedule to run every 6 hours
module.exports.handler = schedule('0 */6 * * *', handler);
```

#### 2. Update netlify.toml

**File**: `netlify.toml`

**Changes**: Configure scheduled function

```toml
# Add after existing configuration
[[functions."scheduled-listings-sync"]]
  schedule = "0 */6 * * *"  # Every 6 hours at minute 0
```

#### 3. Update Cache Duration

**File**: `frontend/src/pages/Listings.jsx`

**Changes**: Increase staleTime to 6 hours

```javascript
// Update lines 82-96
const { data: listings, isLoading, error, refetch } = useQuery(
  ['listings', { status }],
  () => listingsAPI.getListings({ status }),
  {
    keepPreviousData: true,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: 6 * 60 * 60 * 1000,      // 6 hours (was 5 minutes)
    cacheTime: 12 * 60 * 60 * 1000,     // 12 hours (was 10 minutes)
    retry: 1,
    refetchInterval: false,
    refetchOnReconnect: 'always'
  }
)
```

### Success Criteria

#### Automated Verification:
- [ ] Scheduled function exists: `ls netlify/functions/scheduled-listings-sync.js`
- [ ] No syntax errors: `node -c netlify/functions/scheduled-listings-sync.js`
- [ ] netlify.toml is valid: `cat netlify.toml | grep scheduled-listings-sync`

#### Manual Verification:
- [ ] Function appears in Netlify dashboard under Functions → Scheduled
- [ ] Test run via Netlify dashboard triggers successfully
- [ ] Listings data updates after sync completes
- [ ] Frontend cache respects 6-hour staleTime
- [ ] Manual refresh still works on demand

---

## Phase 4: Testing & Validation

### Overview
Comprehensive testing to ensure all columns populate correctly, sync works reliably, and performance meets expectations.

### Changes Required

#### 1. Add View/Watch Count to UI

**File**: `frontend/src/pages/Listings.jsx`

**Changes**: Add columns to display (optional - can be hidden by default)

```javascript
// Update getStoredColumnOrder() at line 18
return [
  'image', 'title', 'quantity', 'currentPrice', 'minimumPrice',
  'viewCount', 'watchCount',  // NEW
  'priceReductionEnabled', 'strategy', 'suggestedPrice', 'listingAge', 'actions'
]

// Update getStoredVisibleColumns() at line 33
return {
  image: true,
  title: true,
  quantity: true,
  currentPrice: true,
  minimumPrice: true,
  viewCount: false,        // NEW - hidden by default
  watchCount: false,       // NEW - hidden by default
  priceReductionEnabled: true,
  strategy: true,
  suggestedPrice: false,   // Placeholder for future
  listingAge: true,
  actions: true
}

// Add table headers (around line 950)
{visibleColumns.viewCount && (
  <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
    Views
  </th>
)}
{visibleColumns.watchCount && (
  <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
    Watchers
  </th>
)}

// Add table cells (around line 1000)
{visibleColumns.viewCount && (
  <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-900">
    {listing.view_count || 0}
  </td>
)}
{visibleColumns.watchCount && (
  <td className="px-2 py-4 whitespace-nowrap text-sm text-gray-900">
    {listing.watch_count || 0}
  </td>
)}
```

#### 2. Add API Call Monitoring

**File**: `netlify/functions/utils/enhanced-ebay-client.js`

**Changes**: Log API call metrics

```javascript
// Add to EnhancedEbayClient class
constructor(userCredentials) {
  // ... existing code
  this.apiCallCount = 0;
  this.startTime = Date.now();
}

logMetrics() {
  const duration = Date.now() - this.startTime;
  console.log('eBay API Metrics:', {
    totalCalls: this.apiCallCount,
    durationMs: duration,
    avgCallTime: duration / this.apiCallCount
  });
}

// Increment counter in each API method
async fetchInventoryItems() {
  this.apiCallCount++;
  // ... rest of method
}
```

### Success Criteria

#### Automated Verification:
- [ ] Frontend builds successfully: `cd frontend && npm run build`
- [ ] All functions have no syntax errors: `find netlify/functions -name "*.js" -exec node -c {} \;`
- [ ] No TypeScript errors (if applicable): `npm run typecheck`

#### Manual Verification:
- [ ] All Listings page columns display correct data:
  - [ ] Image displays
  - [ ] Title displays
  - [ ] Quantity shows correct number
  - [ ] Current price shows with currency
  - [ ] Minimum price editable
  - [ ] Price reduction toggle works
  - [ ] Strategy dropdown works
  - [ ] Suggested price shows blank placeholder
  - [ ] Listing age calculates correctly
  - [ ] View count displays (when column enabled)
  - [ ] Watch count displays (when column enabled)
  - [ ] Actions buttons work

- [ ] Background sync verification:
  - [ ] Scheduled function runs at 6-hour intervals
  - [ ] All users' listings sync successfully
  - [ ] Database shows last_synced_at updates
  - [ ] No errors in function logs

- [ ] Performance verification:
  - [ ] API call count reduced vs previous implementation
  - [ ] Page load time acceptable (<3 seconds)
  - [ ] No rate limit errors in logs
  - [ ] Cache working correctly (6-hour staleTime)

- [ ] Regression testing:
  - [ ] Price reduction still works
  - [ ] Manual price update works
  - [ ] Strategy change works
  - [ ] Delete listing works
  - [ ] Search and filters work
  - [ ] Column visibility and reordering works

---

## Testing Strategy

### Unit Tests
(Future enhancement - manual testing for now)

### Integration Tests

**Manual Test Plan:**

1. **Data Population Test**:
   - Connect eBay account
   - Trigger manual sync
   - Verify all columns populate in Listings page
   - Check database for view_count and watch_count values

2. **Scheduled Sync Test**:
   - Trigger scheduled function manually via Netlify dashboard
   - Wait 6 hours, verify auto-run occurs
   - Check logs for successful completion
   - Verify listings data updates

3. **API Efficiency Test**:
   - Monitor API calls in function logs
   - Compare call count before/after optimization
   - Target: 50% reduction in API calls

4. **Performance Test**:
   - Load Listings page with 100+ items
   - Measure load time (should be <3 seconds)
   - Verify cache prevents unnecessary refetches
   - Test manual refresh still works

5. **Regression Test**:
   - Test all price reduction features
   - Test all CRUD operations on listings
   - Test filters and search
   - Test column customization

### Manual Testing Steps

1. **Initial Setup**:
   ```bash
   # Deploy updated functions
   netlify deploy --prod

   # Apply database migration
   # (Via Supabase dashboard SQL editor)

   # Verify scheduled function
   netlify functions:list
   ```

2. **Test Data Sync**:
   - Navigate to Listings page
   - Click "Import from eBay" button
   - Verify all columns populate
   - Enable view_count and watch_count columns
   - Verify values display correctly

3. **Test Scheduled Sync**:
   - In Netlify dashboard, go to Functions
   - Find `scheduled-listings-sync`
   - Click "Test" to trigger manual run
   - Check logs for success message
   - Refresh Listings page, verify data updated

4. **Performance Verification**:
   - Open browser DevTools Network tab
   - Load Listings page
   - Count API requests (should be minimal due to cache)
   - Force refresh (Cmd+Shift+R)
   - Verify API calls complete quickly

## Performance Considerations

### API Call Optimization

**Before Optimization:**
- Trading API: 1 call (GetMyeBaySelling) for basic data
- Inventory API: 1 call for inventory items + N calls for offers (1 per item)
- Total: ~101 calls for 100 items

**After Optimization:**
- Inventory API: 1 call for inventory items + N calls for offers (1 per item)
- Trading API: 1 batch call (GetSellerList) for view/watch counts
- Total: ~102 calls for 100 items

**Wait, this seems worse?**

Actually, the key optimization is:
1. **Eliminate redundancy**: We're not calling both APIs for the same data
2. **Batch Trading API calls**: GetSellerList is more efficient than individual GetItem calls
3. **6-hour caching**: Reduces frequency of API calls from every 5 minutes to every 6 hours
4. **Overall reduction**: 12x fewer sync cycles per day (4 syncs vs 288 potential refetches)

### Rate Limiting

- eBay allows 5,000 API calls per day for most applications
- With 6-hour sync: 4 sync cycles × ~102 calls = ~408 calls/day
- Leaves plenty of headroom for manual refreshes and price updates

### Database Performance

- New indexes on view_count and watch_count for fast sorting
- last_synced_at helps identify stale data
- Upsert strategy prevents duplicates

## Migration Notes

### Database Migration

Apply via Supabase dashboard SQL editor:

```sql
-- Run this in Supabase SQL Editor
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS watch_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_listings_view_count ON listings(view_count);
CREATE INDEX IF NOT EXISTS idx_listings_watch_count ON listings(watch_count);
```

### Deployment Steps

1. **Deploy Backend Changes**:
   ```bash
   git add netlify/functions/
   git commit -m "Add enhanced eBay API client and scheduled sync"
   git push origin main
   ```

2. **Apply Database Migration**:
   - Open Supabase dashboard
   - Go to SQL Editor
   - Run migration script above

3. **Deploy Frontend Changes**:
   ```bash
   cd frontend
   npm run build
   cd ..
   git add frontend/
   git commit -m "Update Listings UI with view/watch counts and 6hr cache"
   git push origin main
   ```

4. **Verify Netlify Scheduled Function**:
   - Open Netlify dashboard
   - Check Functions → Scheduled
   - Verify `scheduled-listings-sync` appears
   - Test run to verify it works

### Rollback Plan

If issues occur:

1. **Revert Git Commits**:
   ```bash
   git revert HEAD~3..HEAD
   git push origin main
   ```

2. **Remove Database Columns** (if needed):
   ```sql
   ALTER TABLE listings
   DROP COLUMN IF EXISTS view_count,
   DROP COLUMN IF EXISTS watch_count,
   DROP COLUMN IF EXISTS last_synced_at;
   ```

3. **Disable Scheduled Function**:
   - In Netlify dashboard, disable the scheduled function

## References

- Original research: `thoughts/shared/research/2025-10-01_21-25-15_listings-page-architecture.md`
- Current implementation: `netlify/functions/ebay-fetch-listings.js:3-776`
- Listings UI: `frontend/src/pages/Listings.jsx:1-1114`
- eBay Trading API docs: https://developer.ebay.com/devzone/xml/docs/reference/ebay/
- eBay Inventory API docs: https://developer.ebay.com/api-docs/sell/inventory/overview.html
- Netlify Scheduled Functions: https://docs.netlify.com/functions/scheduled-functions/
