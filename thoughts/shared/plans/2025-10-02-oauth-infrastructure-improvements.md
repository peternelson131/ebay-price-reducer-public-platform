# OAuth Infrastructure Improvements - Implementation Plan

**Date**: 2025-10-02
**Repository**: ebay-price-reducer
**Git Commit**: 62ddc754e682cf3f5919e17c14c663a31a733436
**Branch**: main
**Related Research**: `thoughts/shared/research/2025-10-02_oauth-listings-import-failure.md`

## Overview

This plan implements three critical improvements to the OAuth/eBay API infrastructure:
1. **Fix credential sourcing** - Support legacy per-user credentials while defaulting to global credentials
2. **Consolidate eBay clients** - Eliminate redundant implementations
3. **Add token expiration monitoring** - Proactive alerts before refresh tokens expire

These changes ensure the system works for both the legacy user account (with custom eBay app credentials) and new users (using global environment variables).

---

## Current State Analysis

### Architecture Issues Identified

**1. Credential Sourcing Inconsistency**

```javascript
// OAuth initiation (ebay-oauth.js:256-293) - Uses USER credentials ✅
const user = users[0];
const clientId = user.ebay_app_id;
const certId = decrypt(user.ebay_cert_id_encrypted);

// Token refresh (user-ebay-client.js:67-68) - Uses GLOBAL env vars ❌
const clientId = process.env.EBAY_APP_ID;
const clientSecret = process.env.EBAY_CERT_ID;
```

**Problem**: If legacy user has custom `ebay_app_id`/`ebay_cert_id`, token refresh fails because it uses wrong credentials.

**2. Multiple eBay Client Implementations**

- `EnhancedEbayClient` - Modern, hybrid API approach (Inventory + Trading)
- `UserEbayClient` - Legacy, simpler API calls
- `EbayService` - Very old, axios-based

**Problem**: Code duplication, inconsistent patterns, maintenance burden.

**3. No Token Expiration Monitoring**

- Refresh tokens expire after 18 months
- No warnings before expiration
- Users experience cryptic errors when tokens expire

---

## What We're NOT Doing

- ❌ Adding per-user credentials for new users (only supporting existing legacy account)
- ❌ Rewriting the OAuth flow (it works correctly)
- ❌ Changing database schema (current schema is correct)
- ❌ Implementing rate limiting (separate future enhancement)
- ❌ Adding circuit breaker patterns (separate future enhancement)

---

## Implementation Strategy

We'll break this into **3 small, incremental phases**:

1. **Phase 1: Fix Credential Sourcing** (30-60 min) - CRITICAL
2. **Phase 2: Consolidate Clients** (1-2 hours) - Important for maintenance
3. **Phase 3: Token Expiration Monitoring** (1-2 hours) - Prevents future issues

Each phase is independently testable and can be deployed separately.

---

# Phase 1: Fix Credential Sourcing

## Overview

Update both eBay clients to use a **credential fallback strategy**:
1. Try user-specific credentials from database (for legacy account)
2. Fall back to global environment variables (for new users)
3. Throw clear error if neither exists

This maintains backward compatibility while supporting the new global credential model.

## Changes Required

### 1. Update `UserEbayClient.refreshToken()`

**File**: `netlify/functions/utils/user-ebay-client.js`
**Lines**: 56-99

**Current Code** (lines 67-68):
```javascript
const clientId = process.env.EBAY_APP_ID;
const clientSecret = process.env.EBAY_CERT_ID;
```

**New Code**:
```javascript
// Try to get user-specific credentials first (for legacy account)
const { data: userData, error: userError } = await supabase
  .from('users')
  .select('ebay_app_id, ebay_cert_id_encrypted')
  .eq('id', this.userId)
  .single();

let clientId, clientSecret;

if (userData && userData.ebay_app_id && userData.ebay_cert_id_encrypted) {
  // Use user-specific credentials (legacy account)
  console.log('Using user-specific eBay credentials for token refresh');
  clientId = userData.ebay_app_id;

  // Import decrypt function
  const { decrypt } = require('./ebay-oauth-helpers');
  clientSecret = decrypt(userData.ebay_cert_id_encrypted);
} else {
  // Fall back to global environment variables (new users)
  console.log('Using global eBay credentials from environment');
  clientId = process.env.EBAY_APP_ID;
  clientSecret = process.env.EBAY_CERT_ID;

  if (!clientId || !clientSecret) {
    throw new Error('No eBay credentials available. Please configure EBAY_APP_ID and EBAY_CERT_ID environment variables.');
  }
}
```

**Why**: This maintains the OAuth flow's behavior (which uses user credentials when available) and ensures token refresh uses the same credentials.

### 2. Update `EnhancedEbayClient.refreshToken()`

**File**: `netlify/functions/utils/enhanced-ebay-client.js`
**Lines**: 61-104

Apply the same credential fallback logic as above.

### 3. Extract Encryption Helpers to Shared Module

**File**: `netlify/functions/utils/ebay-oauth-helpers.js` (NEW)

```javascript
const crypto = require('crypto');

// Encryption key management
const getEncryptionKey = () => {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required. ' +
      'Generate with: openssl rand -hex 32'
    );
  }

  const key = process.env.ENCRYPTION_KEY;
  // If it's a hex string, convert it properly
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, 'hex');
  }

  // Otherwise, hash it to get consistent 32 bytes
  return crypto.createHash('sha256').update(key).digest();
};

const ENCRYPTION_KEY = getEncryptionKey();
const IV_LENGTH = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

module.exports = { encrypt, decrypt, getEncryptionKey };
```

**Why**: Prevents code duplication and ensures consistent encryption/decryption across all functions.

### 4. Update Imports in Existing Files

**Files to update**:
- `netlify/functions/ebay-oauth.js` - Import from helpers instead of local functions
- `netlify/functions/ebay-oauth-callback.js` - Same
- `netlify/functions/save-ebay-credentials.js` - Same

**Change**:
```javascript
// OLD (local functions)
function encrypt(text) { ... }
function decrypt(text) { ... }

// NEW (import from helpers)
const { encrypt, decrypt } = require('./utils/ebay-oauth-helpers');
```

## Success Criteria

### Automated Verification:
- [ ] Functions start without errors: `netlify dev`
- [ ] No import errors or missing modules
- [ ] Encryption/decryption works: Run dev function to test token encryption

### Manual Verification:
- [ ] **Legacy account (with user credentials)**: Token refresh uses user's `ebay_app_id`/`ebay_cert_id_encrypted`
- [ ] **New account (no user credentials)**: Token refresh uses `process.env.EBAY_APP_ID`/`EBAY_CERT_ID`
- [ ] **Missing all credentials**: Clear error message about configuration
- [ ] OAuth flow still works end-to-end
- [ ] Listings import works after fix

## Testing Plan

**Test Case 1: Legacy User with Custom Credentials**
```bash
# 1. Verify legacy user has credentials in database
psql $DATABASE_URL -c "SELECT id, ebay_app_id, ebay_cert_id_encrypted FROM users WHERE ebay_app_id IS NOT NULL;"

# 2. Trigger token refresh via Listings page "Import from eBay"
# 3. Check Netlify function logs for: "Using user-specific eBay credentials for token refresh"
# 4. Verify listings import succeeds
```

**Test Case 2: New User (Global Credentials)**
```bash
# 1. Create test user without ebay_app_id/ebay_cert_id
# 2. Ensure EBAY_APP_ID and EBAY_CERT_ID are set in Netlify env vars
# 3. Trigger listings import
# 4. Check logs for: "Using global eBay credentials from environment"
# 5. Verify import succeeds
```

**Test Case 3: Missing Credentials Error**
```bash
# 1. Temporarily remove EBAY_APP_ID from env vars
# 2. Use test account without user credentials
# 3. Attempt listings import
# 4. Verify error: "No eBay credentials available. Please configure EBAY_APP_ID..."
```

---

# Phase 2: Consolidate eBay Clients

## Overview

Migrate all endpoints to use `EnhancedEbayClient` and deprecate the old clients. This reduces maintenance burden and ensures consistent API usage patterns.

## Migration Strategy

1. Update endpoints using `UserEbayClient` to use `EnhancedEbayClient`
2. Remove unused `EbayService` class
3. Keep `UserEbayClient` temporarily (mark as deprecated)
4. After verification period, delete `UserEbayClient` and `EbayService`

## Changes Required

### 1. Migrate `sync-listings.js`

**File**: `netlify/functions/sync-listings.js`

**Current** (line 4):
```javascript
const { UserEbayClient } = require('./utils/user-ebay-client');
```

**New**:
```javascript
const { EnhancedEbayClient } = require('./utils/enhanced-ebay-client');
```

**Current** (lines 51-52):
```javascript
const userEbayClient = new UserEbayClient(user.id);
await userEbayClient.initialize();
```

**New**:
```javascript
const ebayClient = new EnhancedEbayClient(user.id);
await ebayClient.initialize();
```

**Current** (line 69):
```javascript
const ebayResponse = await userEbayClient.getActiveListings(1, 200);
```

**New**:
```javascript
const ebayResponse = await ebayClient.fetchAllListings({
  limit: 200,
  offset: 0,
  includeViewCounts: true,
  includeWatchCounts: true
});
```

**Current** (lines 75-119 - response parsing):
```javascript
if (ebayResponse.ActiveList?.ItemArray?.Item) {
  const items = Array.isArray(ebayResponse.ActiveList.ItemArray.Item)
    ? ebayResponse.ActiveList.ItemArray.Item
    : [ebayResponse.ActiveList.ItemArray.Item];

  for (const item of items) {
    // ... parsing logic
  }
}
```

**New**:
```javascript
// EnhancedEbayClient returns unified format, no need for parsing
if (ebayResponse.listings && ebayResponse.listings.length > 0) {
  for (const listing of ebayResponse.listings) {
    try {
      const { error: upsertError } = await supabase
        .from('listings')
        .upsert({
          user_id: user.id,
          ebay_item_id: listing.ebay_item_id,
          sku: listing.sku,
          title: listing.title,
          current_price: listing.current_price,
          currency: listing.currency,
          quantity: listing.quantity,
          category_id: listing.category_id,
          category_name: listing.category_name,
          end_time: listing.end_time,
          view_count: listing.view_count,
          watch_count: listing.watch_count,
          hit_count: listing.hit_count,
          listing_url: listing.listing_url,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,ebay_item_id'
        });

      if (upsertError) {
        errors.push(`Item ${listing.ebay_item_id}: ${upsertError.message}`);
        errorCount++;
      } else {
        syncedCount++;
      }
    } catch (itemError) {
      errors.push(`Item ${listing.ebay_item_id}: ${itemError.message}`);
      errorCount++;
    }
  }
}
```

### 2. Migrate `get-ebay-listings.js`

**File**: `netlify/functions/get-ebay-listings.js`

**Current** (lines 73-74):
```javascript
const userEbayClient = new UserEbayClient(user.id);
await userEbayClient.initialize();
```

**New**:
```javascript
const ebayClient = new EnhancedEbayClient(user.id);
await ebayClient.initialize();
```

**Current** (lines 76-119 - API call with manual XML headers):
```javascript
const response = await userEbayClient.makeApiCall(
  '/ws/api.dll',
  'POST',
  {
    'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
    'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
    // ... complex manual API call
  },
  'trading'
);
```

**New**:
```javascript
const response = await ebayClient.fetchAllListings({
  limit: entriesPerPage,
  offset: (pageNumber - 1) * entriesPerPage,
  includeViewCounts: true,
  includeWatchCounts: true
});
```

**Current** (lines 122-144 - response parsing):
```javascript
const listings = [];
if (response && response.ActiveList && response.ActiveList.ItemArray && response.ActiveList.ItemArray.Item) {
  // ... manual parsing
}
```

**New**:
```javascript
// Response already in unified format
const listings = response.listings.map(listing => ({
  itemId: listing.ebay_item_id,
  title: listing.title,
  currentPrice: { value: listing.current_price, currency: listing.currency },
  quantity: listing.quantity,
  listingType: listing.listing_type,
  endTime: listing.end_time,
  watchCount: listing.watch_count,
  hitCount: listing.hit_count,
  categoryId: listing.category_id,
  categoryName: listing.category_name,
  listingUrl: listing.listing_url
}));

const pagination = {
  totalPages: Math.ceil(response.total / entriesPerPage),
  totalEntries: response.total,
  currentPage: pageNumber,
  entriesPerPage: entriesPerPage
};
```

### 3. Mark `UserEbayClient` as Deprecated

**File**: `netlify/functions/utils/user-ebay-client.js`

Add deprecation notice at top of file:
```javascript
/**
 * @deprecated Use EnhancedEbayClient instead
 * This class is maintained only for backward compatibility.
 * It will be removed in a future version.
 *
 * Migration: Replace UserEbayClient with EnhancedEbayClient
 * - new UserEbayClient(userId) → new EnhancedEbayClient(userId)
 * - getActiveListings() → fetchAllListings()
 *
 * @see EnhancedEbayClient for modern implementation
 */
class UserEbayClient {
  // ... existing code
}
```

### 4. Remove `EbayService` (Unused Legacy Code)

**File**: `netlify/functions/utils/ebay.js`

**Action**: Delete this file entirely (it's not imported anywhere in active code).

**Verification**:
```bash
# Verify no active imports
grep -r "require.*ebay.js" netlify/functions/*.js
grep -r "from.*ebay.js" netlify/functions/*.js
```

If no results, safe to delete.

## Success Criteria

### Automated Verification:
- [ ] All endpoints start without errors: `netlify dev`
- [ ] No import errors for EnhancedEbayClient
- [ ] Listings data structure matches database schema
- [ ] Response format matches API contracts

### Manual Verification:
- [ ] `sync-listings.js` successfully syncs listings using EnhancedEbayClient
- [ ] `get-ebay-listings.js` returns listings in correct format
- [ ] View counts and watch counts populate correctly
- [ ] Pagination works correctly in get-ebay-listings
- [ ] No regressions in listings display on frontend

## Testing Plan

**Test Case 1: Sync Listings Endpoint**
```bash
# Trigger via frontend "Import from eBay" button
# OR via curl:
curl -X POST https://your-domain.netlify.app/.netlify/functions/sync-listings \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json"

# Verify in logs:
# - "Enhanced eBay client" initialization messages
# - "Fetched X listings from eBay"
# - "Successfully synced X listings to database"

# Check database:
psql $DATABASE_URL -c "SELECT COUNT(*), MAX(view_count), MAX(watch_count) FROM listings WHERE user_id = 'your-user-id';"
```

**Test Case 2: Get Listings Endpoint**
```bash
# Fetch via API:
curl https://your-domain.netlify.app/.netlify/functions/get-ebay-listings?page=1&limit=50 \
  -H "Authorization: Bearer $USER_TOKEN"

# Verify response:
# - "success": true
# - "listings": [array of listings with itemId, title, currentPrice, watchCount, etc.]
# - "pagination": { totalPages, totalEntries, currentPage }
```

**Test Case 3: Verify Old Code Removed**
```bash
# Verify ebay.js is not imported anywhere
grep -r "require.*ebay.js\|from.*ebay.js" netlify/functions/

# Should return no results (or only comments/deprecated files)
```

---

# Phase 3: Token Expiration Monitoring

## Overview

Create a scheduled Netlify function that runs daily to:
1. Check for refresh tokens expiring within 30 days
2. Log warnings to console (Netlify function logs)
3. (Future) Send email notifications to affected users

This prevents users from experiencing sudden authentication failures when tokens expire.

## Changes Required

### 1. Add Token Expiration Tracking to Database

**File**: Database migration (run manually via psql)

**File Name**: `add-refresh-token-expiration-tracking.sql`

```sql
-- Add refresh token expiration timestamp if not exists
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ebay_refresh_token_expires_at TIMESTAMP WITH TIME ZONE;

-- Update existing rows to set expiration 18 months from connection date
UPDATE users
SET ebay_refresh_token_expires_at = ebay_connected_at + INTERVAL '18 months'
WHERE ebay_connected_at IS NOT NULL
  AND ebay_refresh_token_expires_at IS NULL
  AND ebay_refresh_token IS NOT NULL;

-- Create index for efficient expiration queries
CREATE INDEX IF NOT EXISTS idx_users_refresh_token_expiration
  ON users(ebay_refresh_token_expires_at)
  WHERE ebay_refresh_token IS NOT NULL;

-- Verify migration
SELECT
  COUNT(*) as total_connected,
  COUNT(ebay_refresh_token_expires_at) as has_expiration,
  MIN(ebay_refresh_token_expires_at) as earliest_expiration,
  MAX(ebay_refresh_token_expires_at) as latest_expiration
FROM users
WHERE ebay_refresh_token IS NOT NULL;
```

### 2. Update OAuth Callback to Set Expiration

**File**: `netlify/functions/ebay-oauth-callback.js`

**Current** (lines 373-380):
```javascript
// Encrypt and store refresh token
if (tokenData.refresh_token) {
  const encryptedToken = encrypt(tokenData.refresh_token);

  await supabaseRequest(
    `users?id=eq.${authUser.id}`,
    'PATCH',
    {
      ebay_refresh_token: encryptedToken,
      ebay_token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    },
    // ...
  );
}
```

**New**:
```javascript
// Encrypt and store refresh token
if (tokenData.refresh_token) {
  const encryptedToken = encrypt(tokenData.refresh_token);

  // Calculate expiration dates
  const accessTokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000);
  const refreshTokenExpiry = new Date(Date.now() + 18 * 30 * 24 * 60 * 60 * 1000); // 18 months

  await supabaseRequest(
    `users?id=eq.${authUser.id}`,
    'PATCH',
    {
      ebay_refresh_token: encryptedToken,
      ebay_user_id: ebayUserId, // Store eBay username
      ebay_token_expires_at: accessTokenExpiry.toISOString(),
      ebay_refresh_token_expires_at: refreshTokenExpiry.toISOString(),
      ebay_connected_at: new Date().toISOString(),
      ebay_connection_status: 'connected'
    },
    {},
    true
  );
}
```

### 3. Create Scheduled Function for Monitoring

**File**: `netlify/functions/scheduled-token-expiration-check.js` (NEW)

```javascript
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Scheduled function to check for expiring eBay refresh tokens
 * Runs daily via Netlify scheduled functions
 */
exports.handler = async (event, context) => {
  console.log('🔍 Checking for expiring eBay refresh tokens...');

  try {
    // Check for tokens expiring in next 30 days
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const { data: expiringUsers, error } = await supabase
      .from('users')
      .select('id, email, ebay_user_id, ebay_refresh_token_expires_at, ebay_connection_status')
      .eq('ebay_connection_status', 'connected')
      .not('ebay_refresh_token_expires_at', 'is', null)
      .lt('ebay_refresh_token_expires_at', thirtyDaysFromNow.toISOString())
      .order('ebay_refresh_token_expires_at', { ascending: true });

    if (error) {
      console.error('❌ Error querying users:', error);
      throw error;
    }

    if (!expiringUsers || expiringUsers.length === 0) {
      console.log('✅ No tokens expiring in the next 30 days');
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: 'No expiring tokens found',
          checked_at: new Date().toISOString()
        })
      };
    }

    console.log(`⚠️ Found ${expiringUsers.length} user(s) with expiring tokens:`);

    // Log each expiring token
    for (const user of expiringUsers) {
      const daysUntilExpiration = Math.ceil(
        (new Date(user.ebay_refresh_token_expires_at) - new Date()) / (1000 * 60 * 60 * 24)
      );

      console.log(`  - User: ${user.email}`);
      console.log(`    eBay ID: ${user.ebay_user_id}`);
      console.log(`    Expires: ${user.ebay_refresh_token_expires_at}`);
      console.log(`    Days remaining: ${daysUntilExpiration}`);
      console.log('');

      // TODO: Send email notification to user
      // await sendExpirationWarningEmail(user, daysUntilExpiration);
    }

    // Check for already-expired tokens
    const { data: expiredUsers, error: expiredError } = await supabase
      .from('users')
      .select('id, email, ebay_user_id, ebay_refresh_token_expires_at')
      .eq('ebay_connection_status', 'connected')
      .lt('ebay_refresh_token_expires_at', new Date().toISOString());

    if (expiredUsers && expiredUsers.length > 0) {
      console.log(`🚨 Found ${expiredUsers.length} user(s) with EXPIRED tokens (disconnecting):`);

      for (const user of expiredUsers) {
        console.log(`  - Disconnecting user: ${user.email} (expired: ${user.ebay_refresh_token_expires_at})`);

        // Auto-disconnect expired tokens
        await supabase
          .from('users')
          .update({
            ebay_connection_status: 'expired',
            ebay_refresh_token: null,
            ebay_user_id: null
          })
          .eq('id', user.id);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        expiring_soon: expiringUsers.length,
        already_expired: expiredUsers?.length || 0,
        checked_at: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('💥 Error in token expiration check:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
```

### 4. Configure Netlify Scheduled Function

**File**: `netlify.toml`

**Add to existing file**:
```toml
# Daily token expiration check (runs at 9:00 AM UTC)
[[functions]]
  name = "scheduled-token-expiration-check"
  schedule = "0 9 * * *"  # Cron syntax: minute hour day month weekday
```

**Alternative** (if using Netlify UI):
- Go to Functions → scheduled-token-expiration-check
- Enable "Schedule" and set to: `0 9 * * *`

### 5. Add Manual Trigger Endpoint (for Testing)

**File**: Same as above (`scheduled-token-expiration-check.js`)

**Add before main handler**:
```javascript
// Support both scheduled and manual invocation
exports.handler = async (event, context) => {
  // Allow manual trigger via GET request for testing
  if (event.httpMethod === 'GET' && event.queryStringParameters?.action === 'check') {
    console.log('📋 Manual token expiration check triggered');
    // Fall through to main logic below
  }

  // Main logic continues...
  console.log('🔍 Checking for expiring eBay refresh tokens...');
  // ... rest of function
};
```

**Usage**:
```bash
# Manual trigger for testing
curl "https://your-domain.netlify.app/.netlify/functions/scheduled-token-expiration-check?action=check"
```

## Success Criteria

### Automated Verification:
- [ ] Database migration runs successfully: `psql $DATABASE_URL -f add-refresh-token-expiration-tracking.sql`
- [ ] All existing connected users have `ebay_refresh_token_expires_at` set
- [ ] Scheduled function deploys without errors
- [ ] Function can be triggered manually for testing

### Manual Verification:
- [ ] New OAuth connections set both `ebay_token_expires_at` and `ebay_refresh_token_expires_at`
- [ ] Scheduled function runs daily at 9:00 AM UTC (check Netlify function logs)
- [ ] Tokens expiring within 30 days are logged with correct countdown
- [ ] Expired tokens are automatically disconnected
- [ ] Manual trigger endpoint works for testing

## Testing Plan

**Test Case 1: Database Migration**
```bash
# Run migration
psql $DATABASE_URL -f add-refresh-token-expiration-tracking.sql

# Verify all connected users have expiration set
psql $DATABASE_URL -c "
  SELECT
    email,
    ebay_connected_at,
    ebay_refresh_token_expires_at,
    ebay_refresh_token_expires_at - ebay_connected_at AS token_lifetime
  FROM users
  WHERE ebay_refresh_token IS NOT NULL
  ORDER BY ebay_refresh_token_expires_at ASC;
"

# Should show ~18 months (540 days) lifetime for all users
```

**Test Case 2: OAuth Callback Sets Expiration**
```bash
# 1. Disconnect and reconnect eBay account via UI
# 2. Check database after reconnection:
psql $DATABASE_URL -c "
  SELECT
    email,
    ebay_connected_at,
    ebay_token_expires_at,
    ebay_refresh_token_expires_at
  FROM users
  WHERE id = 'your-user-id';
"

# Verify:
# - ebay_token_expires_at is ~2 hours from now
# - ebay_refresh_token_expires_at is ~18 months from now
```

**Test Case 3: Scheduled Function Execution**
```bash
# Manual trigger:
curl "https://your-domain.netlify.app/.netlify/functions/scheduled-token-expiration-check?action=check"

# Check Netlify function logs for:
# - "🔍 Checking for expiring eBay refresh tokens..."
# - List of expiring users (if any)
# - "✅ No tokens expiring in the next 30 days" (if none)
```

**Test Case 4: Simulate Expiring Token (Testing)**
```bash
# Temporarily set token to expire soon (for testing)
psql $DATABASE_URL -c "
  UPDATE users
  SET ebay_refresh_token_expires_at = NOW() + INTERVAL '15 days'
  WHERE id = 'your-test-user-id';
"

# Trigger scheduled function
curl "...?action=check"

# Check logs - should show warning with "15 days remaining"

# Reset to normal expiration
psql $DATABASE_URL -c "
  UPDATE users
  SET ebay_refresh_token_expires_at = ebay_connected_at + INTERVAL '18 months'
  WHERE id = 'your-test-user-id';
"
```

---

## Deployment Checklist

### Phase 1: Credential Sourcing Fix

- [ ] Create `netlify/functions/utils/ebay-oauth-helpers.js`
- [ ] Update `user-ebay-client.js` with credential fallback logic
- [ ] Update `enhanced-ebay-client.js` with credential fallback logic
- [ ] Update `ebay-oauth.js` to import from helpers
- [ ] Update `ebay-oauth-callback.js` to import from helpers
- [ ] Update `save-ebay-credentials.js` to import from helpers
- [ ] Test locally with `netlify dev`
- [ ] Commit and push to GitHub
- [ ] Verify deployment on Netlify
- [ ] Test with legacy account (user credentials)
- [ ] Test with new account (global credentials)

### Phase 2: Client Consolidation

- [ ] Update `sync-listings.js` to use `EnhancedEbayClient`
- [ ] Update `get-ebay-listings.js` to use `EnhancedEbayClient`
- [ ] Add deprecation notice to `user-ebay-client.js`
- [ ] Delete `netlify/functions/utils/ebay.js`
- [ ] Test all listings endpoints locally
- [ ] Commit and push
- [ ] Verify deployment
- [ ] Test sync-listings endpoint
- [ ] Test get-ebay-listings endpoint
- [ ] Verify listings display correctly in frontend

### Phase 3: Token Expiration Monitoring

- [ ] Run database migration: `add-refresh-token-expiration-tracking.sql`
- [ ] Verify all users have expiration dates set
- [ ] Update `ebay-oauth-callback.js` to set expiration on new connections
- [ ] Create `netlify/functions/scheduled-token-expiration-check.js`
- [ ] Update `netlify.toml` with schedule configuration
- [ ] Test scheduled function manually
- [ ] Commit and push
- [ ] Verify scheduled function is enabled in Netlify UI
- [ ] Monitor function logs after first scheduled run
- [ ] Verify expired tokens are auto-disconnected

---

## Rollback Plan

### Phase 1 Rollback
If credential fallback logic fails:
```bash
# Revert commits
git revert <commit-hash>
git push origin main

# Temporary fix: Ensure EBAY_APP_ID and EBAY_CERT_ID env vars are set
# This will work for both legacy and new users (less secure for legacy)
```

### Phase 2 Rollback
If EnhancedEbayClient migration causes issues:
```bash
# Revert sync-listings.js and get-ebay-listings.js changes
git revert <commit-hash>
git push origin main

# UserEbayClient still exists (marked deprecated), so old code will work
```

### Phase 3 Rollback
If scheduled function causes issues:
```bash
# Disable scheduled function in netlify.toml
# OR disable in Netlify UI
# Database migration is safe to keep (adds column, doesn't break anything)
```

---

## Future Enhancements (Out of Scope)

These improvements are noted for future consideration but NOT part of this plan:

1. **Email Notifications** - Send emails to users when tokens are expiring (requires email service integration)
2. **Retry Logic** - Add exponential backoff for transient eBay API failures
3. **Circuit Breaker** - Prevent cascading failures when eBay API is down
4. **Rate Limit Tracking** - Monitor eBay API rate limit headers and warn before hitting limits
5. **Delete UserEbayClient** - After verification period (30 days), remove deprecated code entirely

---

## References

- Original bug report: [thoughts/shared/research/2025-10-02_oauth-listings-import-failure.md](thoughts/shared/research/2025-10-02_oauth-listings-import-failure.md)
- Database schema: `DATABASE-USER-EBAY-TOKENS.sql`
- CLAUDE.md context: Project architecture and conventions
- eBay OAuth docs: https://developer.ebay.com/api-docs/static/oauth-tokens.html
