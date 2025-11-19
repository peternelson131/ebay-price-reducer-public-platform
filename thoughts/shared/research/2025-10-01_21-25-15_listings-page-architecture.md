---
date: 2025-10-01T21:25:15-07:00
researcher: Claude Code
git_commit: 64eb90694a7f3150931646bdc9587b0b33b8447c
branch: main
repository: ebay-price-reducer
topic: "Listings Page Architecture and Data Flow"
tags: [research, codebase, listings, react-query, ebay-api, supabase]
status: complete
last_updated: 2025-10-01
last_updated_by: Claude Code
---

# Research: Listings Page Architecture and Data Flow

**Date**: 2025-10-01T21:25:15-07:00
**Researcher**: Claude Code
**Git Commit**: 64eb90694a7f3150931646bdc9587b0b33b8447c
**Branch**: main
**Repository**: ebay-price-reducer

## Research Question

How does the Listings page work in the eBay Price Reducer application? What is the complete data flow from eBay API through the backend to the frontend?

## Summary

The Listings page is a sophisticated React component that manages eBay listing data through a multi-layered architecture:

- **Frontend**: React component using React Query for data management, local state for UI controls
- **Backend**: Multiple Netlify serverless functions handling different operations (fetch, sync, price reduction)
- **Database**: Supabase for persistent storage with user-level data isolation
- **Caching**: Aggressive caching strategy (5-10 minutes) to reduce eBay API calls
- **Data Flow**: eBay API → Netlify Functions → Supabase → React Query → UI

The system uses a dual-source approach: Supabase for fast UI updates and periodic eBay syncs for data accuracy.

## Detailed Findings

### 1. Frontend Component: `frontend/src/pages/Listings.jsx`

#### Data Fetching with React Query

**Primary Listings Query** (Lines 82-96):
```javascript
const { data: listings, isLoading, error, refetch } = useQuery(
  ['listings', { status }],
  () => listingsAPI.getListings({ status }),
  {
    keepPreviousData: true,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: 5 * 60 * 1000,      // 5 minutes
    cacheTime: 10 * 60 * 1000,     // 10 minutes
    retry: 1,
    refetchInterval: false,         // No automatic polling
    refetchOnReconnect: 'always'
  }
)
```

This configuration provides:
- **Aggressive caching**: Data stays fresh for 5 minutes
- **No automatic refetching**: User-controlled updates only
- **Previous data kept**: Smooth transitions during refetches
- **Single retry**: Graceful error handling

**User Profile Query** (Lines 98-105):
Fetches eBay connection status to show appropriate UI states

#### State Management Architecture

The component uses **local component state** (no Redux/Zustand):

| State Variable | Purpose | Persistence |
|----------------|---------|-------------|
| `status` | Filter by Active/Ended/all | Session only |
| `searchTerm` | Search/filter text | Session only |
| `sortConfig` | Column sorting | Session only |
| `visibleColumns` | Column visibility | localStorage |
| `columnOrder` | Column order | localStorage |
| `filters` | Advanced filters | Session only |
| `notification` | Toast messages | Session only |

#### CRUD Operations via React Query Mutations

**1. Price Reduction** (Lines 107-118):
```javascript
const reducePriceMutation = useMutation(
  ({ listingId }) => listingsAPI.recordPriceReduction(listingId),
  {
    onSuccess: () => {
      queryClient.invalidateQueries(['listings'])
      // ... notification
    }
  }
)
```

**2. Delete Listing** (Lines 120-128):
Removes listing from monitoring (doesn't delete from eBay)

**3. Update Minimum Price** (Lines 130-141):
Updates the floor price below which reductions won't go

**4. Update Strategy** (Lines 143-154):
Changes the price reduction strategy (fixed percentage, time-based, market-based)

**5. Toggle Price Reduction** (Lines 156-167):
Enables/disables automatic price reduction

#### Advanced Filtering System (Lines 397-430)

Supports multiple filter types:
- **Strategy**: Filter by reduction strategy
- **Price Range**: Min/max price filters
- **Quantity**: Stock level filters
- **SKU**: Product identifier
- **Monitoring Status**: Active/paused monitoring
- **Listing Age**: How long item has been listed

Filter operators include: `equals`, `contains`, `greater_than`, `less_than`, `between`

#### Search Functionality (Lines 307-325)

Searches across multiple fields:
- Title
- SKU
- Price values (current, original, minimum)
- Quantity
- Strategy name
- Listing ID

#### Responsive Design

**Mobile View** (Lines 790-920): Card-based layout
**Desktop View** (Lines 922-1114): Sortable table with draggable columns

#### Mock Data Fallback (Lines 263-305)

When no real listings exist, shows 3 sample listings to demonstrate functionality

### 2. Backend Netlify Functions

#### A. `get-ebay-listings.js` - Simple eBay Fetch

**Purpose**: Direct fetch from eBay Trading API

**Authentication Flow**:
- Validates Bearer token from request header (Lines 37-70)
- Supports multiple auth modes: Supabase, localStorage, mock, development

**eBay Integration**:
- Uses `UserEbayClient` class for eBay API calls
- Calls `GetMyeBaySelling` endpoint (Lines 96-119)
- Maps eBay response to simplified structure (Lines 128-144)

**Pagination**:
- Supports `page` and `limit` query parameters
- Returns total pages and entries (Lines 147-153)

**Response Structure**:
```json
{
  "success": true,
  "listings": [...],
  "pagination": {
    "totalPages": 10,
    "totalEntries": 100,
    "currentPage": 1,
    "entriesPerPage": 10
  },
  "environment": "sandbox"
}
```

#### B. `ebay-fetch-listings.js` - Advanced Caching & Rate Limiting

**Purpose**: Comprehensive listing fetch with performance optimizations

**In-Memory Cache** (Lines 3-39):
```javascript
const cache = new Map()
const CACHE_DURATION = 5 * 60 * 1000  // 5 minutes
```

Cache provides:
- Fast repeated requests (cache hits logged at Line 23)
- Reduced eBay API calls
- Per-user cache keys

**Request Deduplication** (Lines 8-9, 373-390):
Prevents concurrent identical requests from hitting eBay API multiple times

**Rate Limiting** (Lines 6, 274-334):
- 200ms delay between offer requests
- Prevents hitting eBay rate limits
- Exponential backoff for failed requests (Lines 42-49)

**Token Management**:
- Decrypts stored refresh token (Lines 459-467)
- Exchanges for access token (Lines 174-219)
- Handles token expiration gracefully

**Data Flow**:
1. Check cache (Lines 395-399)
2. Check for duplicate requests (Lines 373-390)
3. Authenticate user (Lines 359-369)
4. Get eBay credentials from database (Lines 428-456)
5. Decrypt refresh token (Lines 459-467)
6. Get access token from eBay (Lines 174-219)
7. Fetch inventory items (Lines 222-272)
8. Fetch offers for each item with rate limiting (Lines 275-334)
9. Map to database schema (Lines 488-541)
10. Cache results (Lines 545-547)
11. Return data (Lines 549-564)

**Response Structure**:
```json
{
  "success": true,
  "total": 100,
  "listings": [...],
  "hasMore": true,
  "nextOffset": 100
}
```

#### C. `sync-listings.js` - Database Synchronization

**Purpose**: Sync eBay listings to Supabase for persistent storage

**Sync Strategy** (Lines 72-124):
- Fetches all active listings from eBay
- Upserts to Supabase `listings` table
- Conflict resolution: `onConflict: 'user_id,ebay_item_id'` (Line 110)

**Fields Synced**:
- `ebay_item_id`, `title`, `current_price`, `currency`
- `quantity`, `listing_type`, `category_id`, `category_name`
- `end_time`, `watch_count`, `hit_count`, `listing_url`

**Error Handling**:
- Tracks success/error counts (Lines 75-77)
- Continues on individual failures
- Returns summary of sync operation (Lines 140-150)

#### D. `reduce-price.js` - Price Reduction Logic

**Purpose**: Calculate and apply price reductions

**Strategy Implementations**:

**1. Fixed Percentage** (Lines 88-90):
```javascript
newPrice = listing.current_price * (1 - listing.reduction_percentage / 100)
```

**2. Time-Based** (Lines 96-101):
```javascript
const daysListed = Math.ceil((new Date() - new Date(listing.start_time)) / (1000 * 60 * 60 * 24))
const aggressiveFactor = Math.min(1 + (daysListed / 30) * 0.5, 2)
newPrice = listing.current_price * (1 - (listing.reduction_percentage / 100) * aggressiveFactor)
```

Gets more aggressive as listing ages (up to 2x)

**3. Market-Based**: Placeholder for future implementation

**Minimum Price Protection** (Line 107):
```javascript
newPrice = Math.max(newPrice, listing.minimum_price)
```

**eBay Update Flow**:
1. Calculate new price based on strategy (Lines 82-108)
2. Update eBay via `ebayService.updateItemPrice()` (Lines 139-160)
3. Update Supabase `listings` table (Lines 163-176)
4. Calculate next reduction date (Line 174)

#### E. `toggle-price-reduction.js` - Enable/Disable Monitoring

**Purpose**: Toggle automatic price reduction on/off

**Implementation** (Lines 100-109):
- Simple boolean toggle
- Updates `price_reduction_enabled` field
- No eBay API call (internal setting)

### 3. Data Layer: Supabase Client

**Location**: `frontend/src/lib/supabase.js`

**Key API Methods**:

```javascript
listingsAPI.getListings({ status })     // Query listings table
listingsAPI.updateListing(id, data)     // Update listing
listingsAPI.deleteListing(id)           // Remove from monitoring
listingsAPI.recordPriceReduction(id)    // Trigger price reduction

userAPI.getProfile()                    // Get user eBay connection
```

**Database Tables**:

**`listings` table**:
- `id`, `user_id`, `ebay_item_id`, `sku`
- `title`, `description`, `category`
- `current_price`, `original_price`, `minimum_price`
- `quantity`, `image_urls`
- `price_reduction_enabled`, `reduction_strategy`
- `reduction_percentage`, `reduction_interval`
- `last_price_reduction`, `next_price_reduction`

**`users` table**:
- `id`, `email`, `name`
- `ebay_app_id`, `ebay_cert_id`, `ebay_refresh_token`
- `ebay_token_expires_at`, `ebay_refresh_token_expires_at`
- `default_reduction_strategy`, `default_reduction_percentage`

## Code References

- `frontend/src/pages/Listings.jsx:82-96` - React Query listing fetch
- `frontend/src/pages/Listings.jsx:107-167` - CRUD mutations
- `frontend/src/pages/Listings.jsx:307-325` - Search functionality
- `frontend/src/pages/Listings.jsx:397-430` - Filter system
- `netlify/functions/get-ebay-listings.js:96-119` - eBay Trading API call
- `netlify/functions/ebay-fetch-listings.js:3-39` - In-memory cache implementation
- `netlify/functions/ebay-fetch-listings.js:174-219` - OAuth token exchange
- `netlify/functions/sync-listings.js:72-124` - Database sync loop
- `netlify/functions/reduce-price.js:82-108` - Price calculation strategies
- `frontend/src/lib/supabase.js` - Data access layer

## Architecture Insights

### 1. Dual Data Source Strategy

The system maintains data in two places:
- **Supabase**: Fast queries, user modifications, UI state
- **eBay API**: Source of truth, periodic sync

This provides:
- Fast UI updates (Supabase queries are sub-100ms)
- Eventual consistency with eBay
- Ability to work offline/with stale data

### 2. Aggressive Caching Strategy

**Frontend Cache** (React Query):
- 5-minute staleTime
- 10-minute cacheTime
- keepPreviousData for smooth UX

**Backend Cache** (In-memory Map):
- 5-minute duration
- Per-user cache keys
- Request deduplication

**Benefits**:
- Reduced eBay API calls (stays under rate limits)
- Faster user experience
- Lower costs

### 3. Optimistic UI Updates

React Query mutations use cache invalidation:
```javascript
onSuccess: () => {
  queryClient.invalidateQueries(['listings'])
}
```

This provides:
- Instant UI feedback
- Automatic refetch after mutations
- Consistent state across components

### 4. Modular Backend Architecture

Each operation has dedicated function:
- `get-ebay-listings.js` - Simple fetch
- `ebay-fetch-listings.js` - Advanced fetch
- `sync-listings.js` - Database sync
- `reduce-price.js` - Price updates
- `toggle-price-reduction.js` - Monitoring control

**Benefits**:
- Independent deployment
- Clear separation of concerns
- Can be triggered via cron, API, or manual
- Easier testing and debugging

### 5. Error Resilience

**Graceful Degradation**:
- Continues even if eBay API fails (Line 308-333 in ebay-fetch-listings.js)
- Shows mock data if no listings exist
- Multiple auth modes (Supabase, localStorage, mock, development)

**Request Deduplication**:
- Prevents redundant API calls
- Reduces race conditions

**Exponential Backoff**:
- Retries failed requests with increasing delays
- Respects rate limits

### 6. Performance Optimizations

**Rate Limiting** (ebay-fetch-listings.js:274-334):
- 200ms delay between offer requests
- Prevents overwhelming eBay API

**Batch Processing**:
- Fetches all inventory items first
- Then fetches offers with controlled delay

**Lazy Loading**:
- Mobile view uses card layout (less DOM)
- Desktop table uses virtualization-ready structure

## Related Research

None found in thoughts/ directory - this is the first comprehensive research of the Listings page architecture.

## Open Questions

1. **Scheduled Sync**: Is there a cron job that triggers `sync-listings.js` automatically?
2. **Webhook Integration**: Does eBay send webhooks for listing changes, or is it purely poll-based?
3. **Conflict Resolution**: What happens if a user updates a price in eBay directly while it's also being updated through this app?
4. **Market-Based Strategy**: The code mentions market-based pricing but it's not implemented - what's the plan?
5. **Offline Mode**: How does the app behave when eBay API is down or user is offline?

## Recommendations

### Short-term Improvements

1. **Add Polling for Active Users**: Implement optional background polling for users actively viewing the page
2. **Improve Error Messages**: Surface eBay API errors more clearly in the UI
3. **Add Refresh Button**: Manual refresh option in addition to automatic refetch
4. **Loading States**: Better skeleton screens during initial load

### Long-term Enhancements

1. **WebSocket Updates**: Real-time updates when listings change
2. **Webhook Integration**: Subscribe to eBay notifications for instant updates
3. **Conflict Resolution UI**: Show when local data differs from eBay and let user choose
4. **Market-Based Pricing**: Implement competitor analysis and dynamic pricing
5. **Bulk Operations**: Allow selecting multiple listings for batch price updates
6. **Analytics Dashboard**: Show price reduction effectiveness over time
