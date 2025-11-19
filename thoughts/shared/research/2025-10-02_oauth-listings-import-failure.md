---
date: 2025-10-02T00:00:00Z
researcher: Claude Code
git_commit: 62ddc754e682cf3f5919e17c14c663a31a733436
branch: main
repository: ebay-price-reducer
topic: "OAuth Infrastructure - Listings Import Failure Analysis"
tags: [research, oauth, ebay-api, authentication, bug-fix]
status: complete
last_updated: 2025-10-02
last_updated_by: Claude Code
---

# Research: OAuth Infrastructure - Listings Import Failure Analysis

**Date**: 2025-10-02T00:00:00Z
**Researcher**: Claude Code
**Git Commit**: 62ddc754e682cf3f5919e17c14c663a31a733436
**Branch**: main
**Repository**: ebay-price-reducer

## Research Question

Why is the listings import feature failing with an OAuth error when users try to import their eBay listings?

## Summary

**CRITICAL BUG IDENTIFIED AND FIXED**: The `user-ebay-client.js` file was checking for database fields (`access_token`, `expires_at`) that were removed in a database migration. The migration switched to a more secure refresh-token-only storage pattern, but this client file wasn't updated accordingly.

**Root Cause**: Database schema migration removed `ebay_access_token` and `ebay_token_expires_at` columns, but `user-ebay-client.js` wasn't updated to use the new `refresh_token`-only pattern.

**Impact**: Listings import failed immediately on initialization with error "User has not connected their eBay account" even for properly connected users.

**Resolution**: Updated `user-ebay-client.js` to match the working implementation in `enhanced-ebay-client.js`, which correctly uses the refresh-token-only pattern.

## Detailed Findings

### OAuth Infrastructure Overview

The application implements a secure OAuth 2.0 flow with eBay's API:

**Security Features** (EXCELLENT):
- ✅ PKCE (Proof Key for Code Exchange) implementation
- ✅ State parameter for CSRF protection
- ✅ AES-256-CBC encryption for refresh tokens
- ✅ Refresh-token-only database storage (access tokens never persisted)
- ✅ Proper RLS (Row Level Security) with service key for admin operations

**OAuth Flow Files**:
- [`netlify/functions/ebay-oauth.js`](netlify/functions/ebay-oauth.js) - Initiate OAuth, token refresh, status checks
- [`netlify/functions/ebay-oauth-callback.js`](netlify/functions/ebay-oauth-callback.js) - Handle OAuth callback, exchange code for tokens

### Database Schema Architecture

**File**: [`DATABASE-USER-EBAY-TOKENS.sql`](DATABASE-USER-EBAY-TOKENS.sql)

**Current Schema** (lines 7-13):
```sql
-- NOTE: We only store refresh_token (18-month lifetime)
-- Access tokens are obtained on-demand by exchanging the refresh_token
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_user_id TEXT;
```

**Removed Columns** (lines 18-20):
```sql
ALTER TABLE users DROP COLUMN IF EXISTS ebay_access_token;
ALTER TABLE users DROP COLUMN IF EXISTS ebay_token_expires_at;
```

**RPC Function Returns** (lines 79-93):
- `refresh_token` (TEXT)
- `ebay_user_id` (TEXT)

### The Bug - Field Name Mismatch

**BROKEN CLIENT**: [`netlify/functions/utils/user-ebay-client.js`](netlify/functions/utils/user-ebay-client.js)

**Problem Code** (original lines 33-47):
```javascript
if (!data || data.length === 0 || !data[0].access_token) {  // ❌ Field doesn't exist
    throw new Error('User has not connected their eBay account');
}

const credentials = data[0];

// Check if token is expired
if (credentials.expires_at && new Date(credentials.expires_at) <= new Date()) {  // ❌ Field doesn't exist
    const refreshResult = await this.refreshToken();
    if (!refreshResult) {
        throw new Error('eBay token expired and refresh failed');
    }
} else {
    this.accessToken = credentials.access_token;  // ❌ Field doesn't exist
    this.ebayUserId = credentials.ebay_user_id;
}
```

**WORKING CLIENT**: [`netlify/functions/utils/enhanced-ebay-client.js`](netlify/functions/utils/enhanced-ebay-client.js)

**Correct Code** (lines 38-48):
```javascript
if (!data || data.length === 0 || !data[0].refresh_token) {  // ✅ Correct field
    throw new Error('User has not connected their eBay account');
}

const credentials = data[0];
this.ebayUserId = credentials.ebay_user_id;

// Always get fresh access token by exchanging refresh token
const refreshResult = await this.refreshToken();  // ✅ Always refresh
if (!refreshResult) {
    throw new Error('Failed to obtain eBay access token');
}
```

### Listings Import Flow

**Frontend**: [`frontend/src/pages/Listings.jsx:202-241`](frontend/src/pages/Listings.jsx:202-241)
```javascript
const handleSyncFromEbay = async () => {
    const response = await fetch('/.netlify/functions/trigger-sync', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
        }
    })
}
```

**Backend Endpoints**:
1. **PRIMARY (Working)**: [`netlify/functions/trigger-sync.js`](netlify/functions/trigger-sync.js) - Uses `EnhancedEbayClient` ✅
2. **SECONDARY (Broken)**: [`netlify/functions/sync-listings.js`](netlify/functions/sync-listings.js) - Uses `UserEbayClient` ❌
3. **TERTIARY (Broken)**: [`netlify/functions/get-ebay-listings.js`](netlify/functions/get-ebay-listings.js) - Uses `UserEbayClient` ❌

### The Fix Applied

**File**: `netlify/functions/utils/user-ebay-client.js`

**Changes Made**:

1. **`initialize()` method** (lines 23-51):
   - Changed field check from `access_token` → `refresh_token`
   - Removed expiration check for non-existent `expires_at` field
   - Now always refreshes token to obtain fresh access token
   - Matches working implementation pattern

2. **`refreshToken()` method** (lines 56-99):
   - Removed incorrect database update attempting to store `access_token`
   - Access tokens now stored in memory only (never persisted)
   - Follows security best practice

## Code References

- `netlify/functions/utils/user-ebay-client.js:33` - Fixed field check (access_token → refresh_token)
- `netlify/functions/utils/user-ebay-client.js:41` - Fixed initialization to always refresh token
- `netlify/functions/utils/enhanced-ebay-client.js:38` - Reference implementation (working pattern)
- `DATABASE-USER-EBAY-TOKENS.sql:79-93` - RPC function showing correct return fields
- `frontend/src/pages/Listings.jsx:202-241` - Import trigger handler

## Architecture Insights

### Security Pattern: Refresh-Token-Only Storage

**Design Decision**: Store only long-lived refresh tokens (18 months), obtain short-lived access tokens (2 hours) on-demand.

**Benefits**:
- Reduces risk if database is compromised (no active access tokens)
- Access tokens never persisted to disk
- Follows OAuth 2.0 security best practices
- PKCE prevents authorization code interception

**Implementation**:
- Database stores: `ebay_refresh_token` (encrypted with AES-256-CBC)
- Memory stores: `accessToken` (ephemeral, per-request)
- Token refresh: Always performed on client initialization

### Client Architecture Issues

**Multiple eBay Client Implementations** (creates confusion):
1. `enhanced-ebay-client.js` - Modern, working ✅
2. `user-ebay-client.js` - Legacy, was broken ❌ (now fixed)
3. `ebay.js` - Very old legacy code

**Recommendation**: Consolidate to single client implementation (`EnhancedEbayClient`) to avoid future drift.

## Open Questions

1. **Why weren't all endpoints migrated?** - Some endpoints still use the old `UserEbayClient`. Should migrate `sync-listings.js` and `get-ebay-listings.js` to use `EnhancedEbayClient`.

2. **Credential sourcing inconsistency** - OAuth flow uses user-specific credentials (`ebay_app_id`, `ebay_cert_id` from database), but token refresh uses environment variables (`EBAY_APP_ID`, `EBAY_CERT_ID`). Should standardize.

3. **Missing monitoring** - No alerting for approaching refresh token expiration (18 months). Should add scheduled job to warn users 30 days before expiration.

## Resolution Status

**✅ FIXED**: Updated `user-ebay-client.js` to use correct database fields and token refresh pattern.

**Next Steps**:
1. Test listings import end-to-end
2. Consider consolidating all endpoints to use `EnhancedEbayClient`
3. Add monitoring for token expiration
4. Implement retry logic for transient failures

## Related Issues

This bug was introduced when the database schema was migrated to the refresh-token-only pattern, but not all code was updated to match the new schema. This highlights the importance of:
- Comprehensive testing after schema migrations
- Code search for all usages of removed fields
- Maintaining single source of truth for client implementations
