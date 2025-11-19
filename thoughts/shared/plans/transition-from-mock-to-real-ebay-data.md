# Transition from Mock Data to Real eBay Integration - Implementation Plan

## Overview

This plan transitions the Listings page from displaying hardcoded mock data to fetching real eBay listings through the existing EnhancedEbayClient infrastructure. The implementation follows a database-backed approach using Supabase as an intermediary cache, with scheduled 6-hour syncs to keep data fresh.

## Current State Analysis

### What's Working
- ✅ **EnhancedEbayClient** - Fully implemented hybrid API approach (Inventory + Offer + Trading APIs)
- ✅ **Netlify Functions** - Complete backend infrastructure for eBay integration
- ✅ **Scheduled Sync** - 6-hour cron job already coded (`scheduled-listings-sync.js`)
- ✅ **Database Schema** - Base `listings` table exists in Supabase
- ✅ **Frontend UI** - Listings page ready to display real data

### What's Blocking Real Data
1. **Demo Mode Enabled** (`frontend/src/lib/supabase.js:8`) - `isDemoMode = true`
2. **Missing Database Columns** - Migration `add-listing-view-watch-counts.sql` not run
3. **Empty Database** - No initial sync has populated the `listings` table
4. **Environment Variables** - Demo mode variables need to be updated

### Mock Data Locations
- `frontend/src/lib/supabase.js:28-137` - Mock listings API returning 3 fake items
- `frontend/src/lib/supabase.js:201-263` - Mock API implementation
- `frontend/src/pages/Listings.jsx:263-306` - Fallback mock data

### Key Discoveries
- Real eBay integration uses 3 APIs: Inventory, Offer, and Trading (XML)
- Data flow: eBay API → EnhancedEbayClient → Supabase → Frontend
- Authentication via OAuth stored in user records with encrypted refresh tokens
- Rate limiting: 200ms between requests, 1s between users
- Caching: 5-min backend cache, 6-hour frontend cache

## Desired End State

**Success State**:
- Users see their actual eBay listings in the Listings page
- Data syncs automatically every 6 hours via scheduled function
- View counts and watch counts display correctly
- Users can manually trigger sync via "Import from eBay" button
- Mock data completely removed or only shown to non-authenticated users

**Verification**:
```bash
# 1. Database has required columns
psql -h [supabase-host] -c "SELECT view_count, watch_count FROM listings LIMIT 1;"

# 2. Environment variables set correctly
echo $VITE_DEMO_MODE  # Should be 'false' or unset

# 3. Frontend shows real data (manual check in browser)
# 4. Scheduled function runs successfully (check Netlify logs)
```

## What We're NOT Doing

- ❌ Not migrating to direct API calls (keeping database-backed approach)
- ❌ Not removing the scheduled sync (keeping 6-hour automation)
- ❌ Not changing the UI/UX (only data source changes)
- ❌ Not implementing new features (focus on making existing features work)
- ❌ Not supporting multiple marketplaces yet (US only for now)
- ❌ Not implementing webhook integration (keeping polling approach)

## Implementation Approach

**Strategy**: Incremental enablement with fallback safety

1. **Database First** - Ensure schema supports all fields
2. **Environment Second** - Configure variables but keep demo mode as fallback
3. **Sync Third** - Populate database with real data
4. **Frontend Last** - Disable demo mode only after data is ready

**Safety**: Each phase has automated and manual verification before proceeding

---

## Phase 1: Database Migration & Schema Verification

### Overview
Run the pending database migration to add columns required for eBay API data (view_count, watch_count, hit_count, last_synced_at). Verify the schema is complete and indexes are created.

### Changes Required

#### 1. Run Database Migration via Supabase Dashboard

**Migration File**: `add-listing-view-watch-counts.sql`

**Steps**:
1. Open Supabase Dashboard: https://supabase.com/dashboard
2. Navigate to: SQL Editor → New Query
3. Copy contents of `add-listing-view-watch-counts.sql`
4. Paste into editor
5. Click "Run" button

**Migration Contents** (for reference):
```sql
-- Add view_count, watch_count, hit_count, last_synced_at columns
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS watch_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS hit_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_listings_view_count ON listings(view_count DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_listings_watch_count ON listings(watch_count DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_listings_last_synced_at ON listings(last_synced_at DESC);

-- Update materialized view
DROP MATERIALIZED VIEW IF EXISTS user_listing_stats CASCADE;
CREATE MATERIALIZED VIEW user_listing_stats AS
SELECT
    user_id,
    COUNT(*) as total_listings,
    COUNT(*) FILTER (WHERE listing_status = 'Active') as active_listings,
    COUNT(*) FILTER (WHERE price_reduction_enabled = true) as reduction_enabled,
    AVG(current_price) as avg_price,
    SUM(quantity_sold) as total_sold,
    AVG(view_count) as avg_views,
    AVG(watch_count) as avg_watchers,
    MAX(last_synced) as last_sync,
    MAX(last_synced_at) as last_synced_at
FROM listings
WHERE archived_at IS NULL
GROUP BY user_id;

CREATE UNIQUE INDEX idx_user_listing_stats ON user_listing_stats(user_id);

-- Add trigger for automatic last_synced_at updates
CREATE OR REPLACE FUNCTION update_last_synced_at()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        OLD.current_price IS DISTINCT FROM NEW.current_price OR
        OLD.quantity IS DISTINCT FROM NEW.quantity OR
        OLD.view_count IS DISTINCT FROM NEW.view_count OR
        OLD.watch_count IS DISTINCT FROM NEW.watch_count
    ) THEN
        NEW.last_synced_at = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_listings_last_synced_at ON listings;
CREATE TRIGGER update_listings_last_synced_at
    BEFORE UPDATE ON listings
    FOR EACH ROW
    EXECUTE FUNCTION update_last_synced_at();
```

#### 2. Verify Migration Success

**Method 1: Via Supabase Dashboard**
1. Go to: Table Editor → listings table
2. Check columns appear: `view_count`, `watch_count`, `hit_count`, `last_synced_at`

**Method 2: Via SQL Query**
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'listings'
  AND column_name IN ('view_count', 'watch_count', 'hit_count', 'last_synced_at')
ORDER BY column_name;
```

**Expected Output**:
```
 column_name     | data_type                   | column_default
-----------------+-----------------------------+----------------
 hit_count       | integer                     | 0
 last_synced_at  | timestamp with time zone    | CURRENT_TIMESTAMP
 view_count      | integer                     | 0
 watch_count     | integer                     | 0
```

### Success Criteria

#### Automated Verification:
- [ ] Migration file exists: `ls add-listing-view-watch-counts.sql`
- [ ] Can connect to Supabase: `curl -I https://zxcdkanccbdeqebnabgg.supabase.co`

#### Manual Verification:
- [ ] Migration runs without errors in Supabase SQL Editor
- [ ] All 4 new columns visible in Table Editor
- [ ] Indexes created successfully (check query performance)
- [ ] Materialized view `user_listing_stats` exists
- [ ] Trigger `update_listings_last_synced_at` exists
- [ ] No breaking changes to existing listings data

---

## Phase 2: Environment Configuration & eBay OAuth Verification

### Overview
Configure environment variables to disable demo mode and verify eBay OAuth credentials are properly set up for API access.

### Changes Required

#### 1. Update Frontend Environment Variables

**File**: Create/Update `.env` or `.env.local` in `frontend/` directory

**Changes**:
```bash
# Disable demo mode to use real eBay data
VITE_DEMO_MODE=false

# Supabase configuration (should already exist)
VITE_SUPABASE_URL=https://zxcdkanccbdeqebnabgg.supabase.co
VITE_SUPABASE_ANON_KEY=[your-anon-key]

# eBay API environment (sandbox or production)
VITE_EBAY_ENVIRONMENT=sandbox  # or 'production'
```

**Note**: The `VITE_DEMO_MODE` variable is checked in `frontend/src/lib/supabase.js:8`

#### 2. Update Netlify Environment Variables

**Via Netlify Dashboard**:
1. Go to: Site Settings → Environment Variables
2. Add/Update:
   ```
   EBAY_APP_ID=[your-app-id]
   EBAY_CERT_ID=[your-cert-id]
   EBAY_DEV_ID=[your-dev-id]
   EBAY_ENVIRONMENT=sandbox  # or 'production'
   SUPABASE_URL=https://zxcdkanccbdeqebnabgg.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=[your-service-key]
   ENCRYPTION_KEY=[your-encryption-key-for-tokens]
   ```

**Via Netlify CLI** (alternative):
```bash
netlify env:set EBAY_APP_ID "your-app-id"
netlify env:set EBAY_CERT_ID "your-cert-id"
netlify env:set EBAY_DEV_ID "your-dev-id"
netlify env:set EBAY_ENVIRONMENT "sandbox"
netlify env:set ENCRYPTION_KEY "your-encryption-key"
```

#### 3. Verify eBay OAuth Setup

**Check User OAuth Connection**:
1. Log into the app
2. Go to Account → Integrations tab
3. Click "Connect eBay Account"
4. Complete OAuth flow
5. Verify `ebay_refresh_token` is stored in user record

**SQL Verification**:
```sql
SELECT
  id,
  email,
  ebay_app_id IS NOT NULL as has_app_id,
  ebay_refresh_token IS NOT NULL as has_refresh_token,
  ebay_token_expires_at
FROM users
WHERE id = '[your-user-id]';
```

**Expected Output**:
```
 id   | email          | has_app_id | has_refresh_token | ebay_token_expires_at
------+----------------+------------+-------------------+----------------------
 uuid | user@email.com | true       | true              | 2025-04-01 12:00:00
```

#### 4. Test OAuth Token Refresh

**File**: `netlify/functions/ebay-oauth.js`

**Test Command** (via Netlify CLI):
```bash
netlify functions:invoke ebay-oauth --payload '{"httpMethod":"POST","path":"/refresh-token","body":"{}","headers":{"authorization":"Bearer [user-jwt-token]"}}'
```

**Expected Response**:
```json
{
  "statusCode": 200,
  "body": {
    "success": true,
    "message": "Token refreshed successfully"
  }
}
```

### Success Criteria

#### Automated Verification:
- [ ] Environment file exists: `test -f frontend/.env && echo "exists"`
- [ ] VITE_DEMO_MODE set to false: `grep VITE_DEMO_MODE=false frontend/.env`
- [ ] Netlify env vars set: `netlify env:list`
- [ ] Frontend builds successfully: `cd frontend && npm run build`

#### Manual Verification:
- [ ] Can access eBay OAuth in Account page
- [ ] OAuth callback redirects correctly
- [ ] User record has encrypted refresh token
- [ ] Token refresh endpoint returns success
- [ ] No console errors related to missing env vars
- [ ] Supabase connection works from frontend

---

## Phase 3: Initial Data Sync & Population

### Overview
Trigger the sync process to populate the Supabase `listings` table with real eBay data for authenticated users. This ensures data is available before disabling mock mode.

### Changes Required

#### 1. Create Manual Sync Trigger Function

**File**: Create `netlify/functions/trigger-sync.js` (NEW)

**Purpose**: One-time manual sync trigger for testing

```javascript
const { createClient } = require('@supabase/supabase-js');
const { EnhancedEbayClient } = require('./utils/enhanced-ebay-client');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Get authenticated user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    console.log(`🔄 Manual sync triggered for user: ${user.email}`);

    // Initialize EnhancedEbayClient
    const ebayClient = new EnhancedEbayClient(user.id);
    await ebayClient.initialize();

    // Fetch all listings with view/watch counts
    const ebayData = await ebayClient.fetchAllListings({
      limit: 100,
      offset: 0,
      includeViewCounts: true,
      includeWatchCounts: true
    });

    console.log(`✅ Fetched ${ebayData.listings.length} listings from eBay`);

    if (ebayData.listings.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No listings found in eBay account',
          count: 0
        })
      };
    }

    // Prepare listings for upsert
    const listingsToUpsert = ebayData.listings.map(listing => ({
      user_id: user.id,
      ebay_item_id: listing.ebay_item_id,
      sku: listing.sku,
      title: listing.title,
      description: listing.description,
      current_price: listing.current_price,
      original_price: listing.original_price || listing.current_price,
      currency: listing.currency,
      quantity: listing.quantity,
      quantity_available: listing.quantity,
      image_urls: listing.image_urls,
      condition: listing.condition || 'Used',
      category_id: listing.category_id,
      category: listing.category_name,
      listing_status: listing.listing_status,
      listing_format: listing.listing_type || 'FixedPriceItem',
      start_time: listing.start_time,
      end_time: listing.end_time,
      view_count: listing.view_count || 0,
      watch_count: listing.watch_count || 0,
      hit_count: listing.hit_count || 0,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    // Upsert to database
    const { data, error } = await supabase
      .from('listings')
      .upsert(listingsToUpsert, {
        onConflict: 'user_id,ebay_item_id',
        ignoreDuplicates: false
      });

    if (error) {
      console.error('❌ Failed to upsert listings:', error);
      throw error;
    }

    console.log(`✅ Successfully synced ${listingsToUpsert.length} listings to database`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Sync completed successfully',
        count: listingsToUpsert.length,
        listings: ebayData.listings.map(l => ({
          sku: l.sku,
          title: l.title,
          price: l.current_price,
          views: l.view_count,
          watchers: l.watch_count
        }))
      })
    };

  } catch (error) {
    console.error('💥 Sync failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Sync failed',
        message: error.message
      })
    };
  }
};
```

#### 2. Update Frontend to Call Sync Function

**File**: `frontend/src/pages/Listings.jsx`

**Find** (around line 196-199):
```javascript
const handleConnectEbay = () => {
  // Navigate to Account page with integrations tab active
  navigate('/account?tab=integrations')
}
```

**Add new function after it**:
```javascript
const handleSyncFromEbay = async () => {
  try {
    setNotification({ type: 'info', message: 'Syncing listings from eBay...' })

    const response = await fetch('/.netlify/functions/trigger-sync', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await supabase.auth.getSession().then(s => s.data.session?.access_token)}`,
        'Content-Type': 'application/json'
      }
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.message || 'Sync failed')
    }

    setNotification({
      type: 'success',
      message: `Successfully synced ${result.count} listings from eBay!`
    })

    // Refresh the listings
    refetch()
  } catch (error) {
    console.error('Sync error:', error)
    setNotification({
      type: 'error',
      message: error.message || 'Failed to sync listings'
    })
  }
}
```

**Update "Import from eBay" button** (around line 679):
```javascript
<button
  onClick={handleSyncFromEbay}  // Changed from refetch
  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
>
  Import from eBay
</button>
```

#### 3. Test Sync Process

**Via Netlify CLI**:
```bash
# Build and deploy the function
cd netlify/functions
npm install
cd ../..
netlify deploy --build

# Test the sync endpoint
netlify functions:invoke trigger-sync \
  --payload '{"httpMethod":"POST","headers":{"authorization":"Bearer [user-jwt]"}}'
```

**Via Browser**:
1. Log into the app
2. Go to Listings page
3. Click "Import from eBay" button
4. Watch network tab for `/trigger-sync` call
5. Check for success notification
6. Refresh page to see real data

#### 4. Verify Data in Database

**SQL Query**:
```sql
SELECT
  COUNT(*) as total_listings,
  COUNT(*) FILTER (WHERE view_count > 0) as has_views,
  COUNT(*) FILTER (WHERE watch_count > 0) as has_watchers,
  MAX(last_synced_at) as last_sync
FROM listings
WHERE user_id = '[your-user-id]';
```

**Expected Output**:
```
 total_listings | has_views | has_watchers | last_sync
----------------+-----------+--------------+----------------------
 15             | 12        | 8            | 2025-10-01 22:30:00
```

### Success Criteria

#### Automated Verification:
- [ ] Sync function file exists: `ls netlify/functions/trigger-sync.js`
- [ ] Function builds without errors: `cd netlify/functions && npm install`
- [ ] Function deploys successfully: `netlify deploy`

#### Manual Verification:
- [ ] "Import from eBay" button triggers sync
- [ ] Success notification appears after sync
- [ ] Database contains listings with real data
- [ ] View counts and watch counts are populated (> 0 for some items)
- [ ] `last_synced_at` timestamp is recent
- [ ] No duplicate listings created
- [ ] All listing fields mapped correctly
- [ ] Images display properly (not placeholder URLs)

---

## Phase 4: Enable Real Data & Remove Mock Fallbacks

### Overview
Disable demo mode in production, remove mock data fallbacks, and verify the Listings page displays real eBay data. Enable scheduled sync for automatic updates.

### Changes Required

#### 1. Remove Mock Data Fallback from Listings Page

**File**: `frontend/src/pages/Listings.jsx`

**Find and REMOVE** (Lines 263-306):
```javascript
// Add mock data if we don't have real listings
if (!listingsToSort || listingsToSort.length === 0) {
  listingsToSort = [
    {
      id: '1',
      title: 'iPhone 14 Pro Max 256GB Space Black',
      // ... rest of mock data
    }
  ]
}
```

**Replace with**:
```javascript
// Use empty array if no listings
if (!listingsToSort) {
  listingsToSort = []
}
```

**Reasoning**: Now that we have real data syncing, we don't need the fallback mock data. An empty state is better than fake data.

#### 2. Update Empty State Message

**File**: `frontend/src/pages/Listings.jsx`

**Find** (around lines 1108-1114):
```javascript
{(!listings?.listings || listings.listings.length === 0) && (
  <div className="text-center py-12">
    <div className="text-gray-500 mb-4">No listings found</div>
    <button className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
      Import Your First Listing
    </button>
  </div>
)}
```

**Update to**:
```javascript
{(!listings?.listings || listings.listings.length === 0) && (
  <div className="text-center py-12">
    <div className="text-gray-500 mb-4">
      {userProfile?.ebay_connected
        ? 'No listings found. Click "Import from eBay" to sync your listings.'
        : 'Connect your eBay account to import listings.'
      }
    </div>
    {userProfile?.ebay_connected ? (
      <button
        onClick={handleSyncFromEbay}
        className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
      >
        Import from eBay
      </button>
    ) : (
      <button
        onClick={handleConnectEbay}
        className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
      >
        Connect eBay Account
      </button>
    )}
  </div>
)}
```

#### 3. Deploy with Demo Mode Disabled

**Update Netlify Environment Variables**:
```bash
netlify env:set VITE_DEMO_MODE false
```

**Or via Dashboard**:
1. Netlify Dashboard → Site Settings → Environment Variables
2. Update `VITE_DEMO_MODE` to `false`
3. Trigger redeploy

**Update Local Development**:

**File**: `frontend/.env.local` (or `.env`)
```bash
VITE_DEMO_MODE=false
```

#### 4. Verify Scheduled Sync Function

**Check Function Configuration**:

**File**: `netlify/functions/scheduled-listings-sync.js`

**Verify schedule export** (Line 165):
```javascript
exports.handler = schedule('0 */6 * * *', handler);
```

**Schedule**: Runs at 00:00, 06:00, 12:00, 18:00 UTC daily

**Test Scheduled Function** (Manual Trigger):
```bash
netlify functions:invoke scheduled-listings-sync
```

**Check Netlify Logs** (after scheduled run):
1. Netlify Dashboard → Functions → scheduled-listings-sync
2. Look for logs showing:
   ```
   🕐 Starting scheduled listings sync at [timestamp]
   Found X users to sync
   ✅ Synced Y listings for user [email]
   🎉 Scheduled sync complete: {total: X, success: Y, failed: 0}
   ```

#### 5. Remove Mock Data from supabase.js

**File**: `frontend/src/lib/supabase.js`

**Option A: Remove Completely** (Recommended)

**Delete Lines 8-263** (all mock-related code):
- Mock listings array (28-137)
- `mockListingsAPI` object (201-263)
- Demo mode check (8)

**Update Line 365**:
```javascript
// Before:
export const listingsAPI = isDemoMode ? mockListingsAPI : realListingsAPI

// After (remove ternary):
export const listingsAPI = realListingsAPI
```

**Option B: Keep for Development** (Alternative)

Keep mock code but default to `false`:
```javascript
const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true' // Must explicitly set to 'true'
```

Add comment:
```javascript
// Demo mode for development only - set VITE_DEMO_MODE=true to use mock data
```

#### 6. Update README/Documentation

**File**: `README.md` or `IMPLEMENTATION_SUMMARY.md`

**Add section**:
```markdown
## Running with Real eBay Data

The application now uses real eBay listings data via the eBay API.

### Setup Steps:
1. Run database migration: `add-listing-view-watch-counts.sql`
2. Set environment variables:
   - `VITE_DEMO_MODE=false`
   - Configure eBay API credentials
3. Connect eBay account via Account → Integrations
4. Click "Import from eBay" to sync listings
5. Data auto-syncs every 6 hours

### Troubleshooting:
- **No listings showing**: Check eBay OAuth connection in Account page
- **Sync fails**: Verify eBay API credentials in Netlify env vars
- **Stale data**: Click "Import from eBay" to force refresh
```

### Success Criteria

#### Automated Verification:
- [ ] Frontend builds with VITE_DEMO_MODE=false: `cd frontend && npm run build`
- [ ] No references to mock data: `grep -r "mockListings" frontend/src/pages/ | wc -l` returns 0
- [ ] Scheduled function exists: `ls netlify/functions/scheduled-listings-sync.js`
- [ ] All tests pass: `cd frontend && npm test`

#### Manual Verification:
- [ ] Listings page shows real eBay data (not iPhone/Galaxy/MacBook mocks)
- [ ] View counts display actual numbers from eBay
- [ ] Watch counts display actual numbers from eBay
- [ ] Images are real product images (not placeholder URLs)
- [ ] Prices match eBay listings
- [ ] "Import from eBay" button fetches fresh data
- [ ] Empty state shows helpful message with action button
- [ ] Scheduled sync runs every 6 hours (check Netlify logs)
- [ ] No console errors about missing data or API failures
- [ ] Data persists across page refreshes (cached in Supabase)

---

## Testing Strategy

### Unit Tests

**Not applicable** - This is primarily configuration and integration work. Focus on integration and manual testing.

### Integration Tests

#### Test 1: Database Migration
```bash
# Run migration
psql -h [supabase-host] -f add-listing-view-watch-counts.sql

# Verify columns exist
psql -h [supabase-host] -c "SELECT view_count FROM listings LIMIT 1;"

# Expected: Query returns without error (even if no rows)
```

#### Test 2: Environment Variables
```bash
# Frontend
cd frontend
npm run build
# Expected: Build succeeds, no env var warnings

# Backend
netlify env:list
# Expected: Shows EBAY_APP_ID, EBAY_CERT_ID, VITE_DEMO_MODE=false
```

#### Test 3: OAuth Flow
1. Open app in browser
2. Go to Account → Integrations
3. Click "Connect eBay"
4. Complete OAuth on eBay
5. Redirect back to app
6. Check database for refresh token

**Expected**: User record has `ebay_refresh_token` populated

#### Test 4: Sync Function
```bash
# Trigger sync via CLI
netlify functions:invoke trigger-sync \
  --payload '{"httpMethod":"POST","headers":{"authorization":"Bearer [jwt]"}}'

# Expected output:
# {
#   "statusCode": 200,
#   "body": {
#     "success": true,
#     "count": 15,
#     "listings": [...]
#   }
# }
```

#### Test 5: Frontend Data Display
1. Log into app
2. Navigate to Listings page
3. Observe data displayed

**Expected**:
- Real product titles (not "iPhone 14 Pro Max")
- Real prices from eBay
- View counts > 0 for popular items
- Watch counts > 0 for watched items
- Real product images

### Manual Testing Steps

#### Scenario 1: First-Time User
1. Create new account
2. Log in
3. Navigate to Listings page
   - **Expected**: Empty state with "Connect eBay Account" button
4. Click "Connect eBay Account"
   - **Expected**: Redirected to eBay OAuth
5. Authorize app on eBay
   - **Expected**: Redirected back to Account page
6. Navigate back to Listings page
   - **Expected**: Empty state with "Import from eBay" button
7. Click "Import from eBay"
   - **Expected**: Loading indicator, then listings appear
8. Verify listings display:
   - Real titles
   - Real prices
   - Real images
   - View/watch counts

#### Scenario 2: Existing User with eBay Connected
1. Log in as user with eBay already connected
2. Navigate to Listings page
   - **Expected**: Real listings display immediately (from database cache)
3. Click "Import from eBay"
   - **Expected**: "Syncing..." notification, then "Synced X listings" success
4. Verify data updates (if any changes on eBay)

#### Scenario 3: Scheduled Sync
1. Wait for scheduled sync time (or trigger manually)
2. Check Netlify Function logs
   - **Expected**: Logs show sync starting, processing users, completing
3. Navigate to Listings page
   - **Expected**: Data reflects any eBay changes
4. Check `last_synced_at` in database
   - **Expected**: Recent timestamp (within 6 hours)

#### Scenario 4: Error Handling
1. Disconnect internet
2. Click "Import from eBay"
   - **Expected**: Error notification, fallback to cached data
3. Reconnect internet
4. Retry sync
   - **Expected**: Success, data updates

#### Scenario 5: No eBay Listings
1. Use eBay account with 0 active listings
2. Click "Import from eBay"
   - **Expected**: "No listings found in eBay account" message
   - **Expected**: Empty state displays

## Performance Considerations

### API Rate Limiting
- **Current**: 200ms delay between Offer API calls
- **Impact**: ~5 requests/second, well under eBay limits
- **Scheduled Sync**: 1-second delay between users
- **Recommendation**: Monitor Netlify function execution time, adjust delays if needed

### Database Query Performance
- **Indexes Created**: `view_count`, `watch_count`, `last_synced_at`
- **Row Level Security**: Already enabled on `listings` table
- **Expected Query Time**: <100ms for typical user (10-50 listings)
- **Recommendation**: Add pagination if users have >200 listings

### Frontend Caching
- **React Query Cache**: 6 hours (matches sync interval)
- **Impact**: Reduces database queries
- **Recommendation**: Keep current settings, works well with scheduled sync

### Function Cold Starts
- **Netlify Functions**: ~500ms-2s cold start
- **Scheduled Sync**: Runs regularly, usually warm
- **Manual Sync**: May experience cold start delay
- **Recommendation**: Add loading indicator for user feedback

## Migration Notes

### Data Migration
**Not applicable** - No existing production data to migrate. Starting fresh with eBay sync.

### Rollback Plan
If issues arise after deployment:

1. **Immediate Rollback** (< 5 minutes):
   ```bash
   # Re-enable demo mode
   netlify env:set VITE_DEMO_MODE true

   # Redeploy
   netlify deploy --prod
   ```

2. **Code Rollback** (if demo mode fails):
   ```bash
   # Revert to previous commit
   git revert HEAD
   git push origin main

   # Netlify will auto-deploy previous version
   ```

3. **Database Rollback** (if migration causes issues):
   ```sql
   -- Remove new columns (if needed)
   ALTER TABLE listings
   DROP COLUMN IF EXISTS view_count,
   DROP COLUMN IF EXISTS watch_count,
   DROP COLUMN IF EXISTS hit_count,
   DROP COLUMN IF EXISTS last_synced_at;

   -- Drop trigger
   DROP TRIGGER IF EXISTS update_listings_last_synced_at ON listings;
   DROP FUNCTION IF EXISTS update_last_synced_at();
   ```

### User Communication
**Not applicable** - No existing users to notify. This is initial real data enablement.

## References

- **Research Document**: `thoughts/shared/research/2025-10-01_22-07-07_listing-import-api-usage.md`
- **Prior Implementation Plan**: `thoughts/shared/plans/optimize-ebay-api-listings-sync.md`
- **EnhancedEbayClient**: `netlify/functions/utils/enhanced-ebay-client.js`
- **Scheduled Sync**: `netlify/functions/scheduled-listings-sync.js`
- **Database Schema**: `supabase-listings-schema.sql`
- **Migration File**: `add-listing-view-watch-counts.sql`

## Next Steps After Implementation

1. **Monitor Scheduled Sync**: Check Netlify logs daily for first week
2. **Performance Testing**: Test with users who have 100+ listings
3. **Error Monitoring**: Set up alerts for sync failures
4. **User Feedback**: Collect feedback on data accuracy and freshness
5. **Feature Enhancements** (Future):
   - Webhook integration to replace polling
   - Multi-marketplace support (UK, AU, etc.)
   - Real-time updates via WebSockets
   - Batch operations for bulk listing management
