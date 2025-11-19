# eBay Credentials System Fix - Summary

## Problem Identified

The eBay credentials system had a fundamental architectural flaw: it was storing (or attempting to store) short-lived access tokens in the database, when it should only store long-lived refresh tokens.

### eBay OAuth Token Architecture
- **Refresh Token**: 18-month lifetime, should be stored securely in database
- **Access Token**: 2-hour lifetime, should be obtained on-demand and held only in memory
- **Correct Flow**: Exchange refresh_token for access_token on each API call session

## Changes Made

### 1. Database Schema (DATABASE-USER-EBAY-TOKENS.sql)

#### Removed Columns:
- ✅ `ebay_access_token` - Should never be stored
- ✅ `ebay_token_expires_at` - Not needed for refresh tokens

#### Updated Functions:

**`has_valid_ebay_token(user_uuid UUID)`**
- Now checks: `ebay_refresh_token IS NOT NULL` (was checking ebay_access_token)
- No longer validates expiration dates

**`get_user_ebay_credentials(user_uuid UUID)`**
- Returns: `{ refresh_token, ebay_user_id }`
- Previously returned: `{ access_token, refresh_token, expires_at, ebay_user_id }`
- Now checks: `ebay_refresh_token IS NOT NULL` (was checking connection_status)

**`update_user_ebay_token(user_uuid, refresh_token, ebay_user_id)`**
- Only stores refresh_token
- Removed parameters: access_token, expires_in
- No longer stores expiration timestamps

**`disconnect_user_ebay_account(user_uuid)`**
- Updated to only clear: refresh_token, user_id, connection_status
- No longer clears: access_token, token_expires_at

**`user_profiles` View**
- `ebay_token_valid` now checks if refresh_token exists
- Removed dependency on expires_at fields

#### Data Migration:
- Added migration block to move data from old `ebay_user_token` column to `ebay_refresh_token`
- Sets connection_status to 'connected' for migrated users
- Drops old `ebay_user_token` column after migration

### 2. Enhanced eBay Client (enhanced-ebay-client.js)

**Status**: DOCUMENTATION CREATED - Implementation required

See `/Users/peternelson/Projects/ebay-price-reducer/EBAY-CLIENT-CHANGES-NEEDED.md` for detailed implementation instructions.

Key changes needed:
- Update `initialize()` to always exchange refresh_token for fresh access_token
- Rename `refreshToken()` to `getAccessTokenFromRefresh()` and remove database updates
- Remove all code that stores access_token or expires_at in database

### 3. OAuth Flow (ebay-oauth.js)

**Status**: DOCUMENTATION CREATED - Implementation required

See `/Users/peternelson/Projects/ebay-price-reducer/EBAY-CLIENT-CHANGES-NEEDED.md` for detailed implementation instructions.

Key issues identified:
1. **Callback Handler** (Line 380): Storing access_token expiration (should only store refresh_token)
2. **Refresh Token Handler** (Line 744): Storing access_token expiration (should not store anything)
3. **Status Check** (Line 539): Checking non-existent fields (ebay_token_expires_at, ebay_refresh_token_expires_at)
4. **Disconnect Handler** (Line 835): Clearing non-existent fields

## Files Modified

### ✅ Completed:
- `/Users/peternelson/Projects/ebay-price-reducer/DATABASE-USER-EBAY-TOKENS.sql`

### 📝 Documentation Created:
- `/Users/peternelson/Projects/ebay-price-reducer/EBAY-CLIENT-CHANGES-NEEDED.md` (Implementation guide)
- `/Users/peternelson/Projects/ebay-price-reducer/EBAY-CREDENTIALS-FIX-SUMMARY.md` (This file)

### ⏳ Requires Implementation:
- `/Users/peternelson/Projects/ebay-price-reducer/netlify/functions/utils/enhanced-ebay-client.js`
- `/Users/peternelson/Projects/ebay-price-reducer/netlify/functions/ebay-oauth.js`

## Next Steps

1. **Apply Database Schema Changes**
   ```bash
   # Run the updated DATABASE-USER-EBAY-TOKENS.sql against your Supabase database
   # This will:
   # - Remove ebay_access_token and ebay_token_expires_at columns
   # - Update all RPC functions
   # - Migrate data from ebay_user_token to ebay_refresh_token
   ```

2. **Update enhanced-ebay-client.js**
   - Follow the implementation guide in EBAY-CLIENT-CHANGES-NEEDED.md
   - Test the token exchange flow thoroughly

3. **Update ebay-oauth.js**
   - Follow the implementation guide in EBAY-CLIENT-CHANGES-NEEDED.md
   - Test OAuth flow, status checks, and disconnect functionality

4. **Testing Checklist**
   - [ ] OAuth connection flow works
   - [ ] Refresh tokens are stored correctly (encrypted)
   - [ ] Access tokens are never stored in database
   - [ ] API calls successfully exchange refresh_token for access_token
   - [ ] Status checks work without checking expiration
   - [ ] Disconnect properly clears only refresh_token and related fields

## Security Notes

- Refresh tokens should remain encrypted in the database
- Access tokens should only exist in memory during API calls
- Never log refresh tokens or access tokens in production
- Connection status is determined by presence of refresh_token, not expiration checks

## Architectural Improvement

**Before:**
```
Database stores: access_token, refresh_token, expires_at
Flow: Check if access_token expired → refresh if needed → store new access_token
Problem: Short-lived tokens stored unnecessarily, complex expiration tracking
```

**After:**
```
Database stores: refresh_token only
Flow: Get refresh_token → exchange for access_token → use access_token (in memory)
Benefit: Simpler, more secure, follows OAuth 2.0 best practices
```
