# Required Changes to enhanced-ebay-client.js

## Problem Summary
The `enhanced-ebay-client.js` currently expects an `access_token` from the `get_user_ebay_credentials` RPC function, but the database schema has been corrected to only store `refresh_token` (18-month lifetime). Access tokens should NEVER be stored in the database.

## Changes Made to Database Schema

1. **Removed columns:**
   - `ebay_access_token` - Should never be stored
   - `ebay_token_expires_at` - Not needed for refresh tokens

2. **Updated `get_user_ebay_credentials` RPC:**
   - Now returns: `{ refresh_token, ebay_user_id }`
   - Previously returned: `{ access_token, refresh_token, expires_at, ebay_user_id }`

3. **Updated `update_user_ebay_token` RPC:**
   - New signature: `update_user_ebay_token(user_uuid, refresh_token, ebay_user_id)`
   - Old signature: `update_user_ebay_token(user_uuid, access_token, refresh_token, expires_in, ebay_user_id)`

## Required Changes to enhanced-ebay-client.js

### 1. Update `initialize()` method (Lines 28-61)

**Current Code (INCORRECT):**
```javascript
const credentials = data[0];

// Check if token is expired
if (credentials.expires_at && new Date(credentials.expires_at) <= new Date()) {
    // Try to refresh the token
    const refreshResult = await this.refreshToken();
    if (!refreshResult) {
        throw new Error('eBay token expired and refresh failed');
    }
} else {
    this.accessToken = credentials.access_token;
    this.ebayUserId = credentials.ebay_user_id;
}
```

**Required Fix:**
```javascript
const credentials = data[0];

// We only have refresh_token, so we always need to get a fresh access_token
const accessToken = await this.getAccessTokenFromRefresh(credentials.refresh_token);
if (!accessToken) {
    throw new Error('Failed to obtain access token from refresh token');
}

this.accessToken = accessToken;
this.ebayUserId = credentials.ebay_user_id;
```

### 2. Rename and Simplify `refreshToken()` method

**Current Code (Lines 66-115):**
- This method fetches refresh_token from DB, exchanges it for access_token, then stores access_token back to DB (INCORRECT)

**Required Fix:**
Rename to `getAccessTokenFromRefresh()` and simplify:
```javascript
/**
 * Exchange refresh token for a fresh access token
 * Note: Access tokens are short-lived and obtained on-demand, never stored
 */
async getAccessTokenFromRefresh(refreshToken) {
    try {
        const clientId = process.env.EBAY_APP_ID;
        const clientSecret = process.env.EBAY_CERT_ID;
        const credentialsBase64 = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

        const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${credentialsBase64}`
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Token exchange failed:', data);
            return null;
        }

        // DO NOT store access_token in database
        return data.access_token;

    } catch (error) {
        console.error('Error exchanging refresh token for access token:', error);
        return null;
    }
}
```

### 3. Remove Database Update from Token Exchange

**CRITICAL:** The current `refreshToken()` method incorrectly stores the access_token back to the database:

```javascript
// REMOVE THIS CODE - access tokens should NEVER be stored
await supabase.rpc('update_user_ebay_token', {
    user_uuid: this.userId,
    access_token: data.access_token,  // WRONG!
    expires_in: data.expires_in       // WRONG!
});
```

Access tokens should only be held in memory for the duration of the API calls.

## OAuth Flow Changes (ebay-oauth.js)

### Issue 1: Callback Handler Storing Access Token (Lines 376-385)

**Current Code (INCORRECT):**
```javascript
// Update user record with encrypted refresh token (use service key for protected table)
await supabaseRequest(
  `users?id=eq.${authUser.id}`,
  'PATCH',
  {
    ebay_refresh_token: encryptedToken,
    ebay_token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
  },
  {},
  true // Use service key for protected table
);
```

**Required Fix:**
```javascript
// Update user record with encrypted refresh token (use service key for protected table)
// NOTE: Only store refresh_token, NOT access_token or its expiration
await supabaseRequest(
  `users?id=eq.${authUser.id}`,
  'PATCH',
  {
    ebay_refresh_token: encryptedToken,
    ebay_connection_status: 'connected',
    ebay_connected_at: new Date().toISOString()
  },
  {},
  true // Use service key for protected table
);
```

### Issue 2: Refresh Token Handler Storing Access Token Expiry (Lines 740-749)

**Current Code (INCORRECT):**
```javascript
// Update the access token expiry time in database
// Note: We don't store the access token itself, only the expiry time
const accessTokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000);

await supabaseRequest(
  `users?id=eq.${authUser.id}`,
  'PATCH',
  {
    ebay_token_expires_at: accessTokenExpiry.toISOString(),
    ebay_connection_status: 'connected'
  },
  {},
  true // Use service key
);
```

**Required Fix:**
```javascript
// DO NOT store access token expiry - access tokens are short-lived and obtained on-demand
// The comment above is incorrect - we shouldn't track access token expiry at all
await supabaseRequest(
  `users?id=eq.${authUser.id}`,
  'PATCH',
  {
    ebay_connection_status: 'connected'
  },
  {},
  true // Use service key
);
```

### Issue 3: Status Check Using Wrong Fields (Lines 537-581)

**Current Code (INCORRECT):**
```javascript
const userData = await supabaseRequest(
  `users?id=eq.${authUser.id}&select=ebay_refresh_token,ebay_user_id,ebay_token_expires_at,ebay_refresh_token_expires_at,ebay_connection_status`,
  'GET',
  null,
  {},
  true // Use service key
);

// ...
const isTokenValid = user.ebay_token_expires_at ?
  new Date(user.ebay_token_expires_at) > new Date() : false;
const isRefreshTokenValid = user.ebay_refresh_token_expires_at ?
  new Date(user.ebay_refresh_token_expires_at) > new Date() : false;
```

**Required Fix:**
```javascript
const userData = await supabaseRequest(
  `users?id=eq.${authUser.id}&select=ebay_refresh_token,ebay_user_id,ebay_connection_status`,
  'GET',
  null,
  {},
  true // Use service key
);

// ...
// Refresh tokens have 18-month lifetime - we just check if it exists
const hasRefreshToken = !!user.ebay_refresh_token;
const isConnected = hasRefreshToken && user.ebay_connection_status === 'connected';

return {
  statusCode: 200,
  headers,
  body: JSON.stringify({
    success: true,
    connected: isConnected,
    message: hasRefreshToken ? 'eBay account connected' : 'eBay account not connected',
    userId: user.ebay_user_id,
    connectionStatus: user.ebay_connection_status
  })
};
```

### Issue 4: Disconnect Handler Clearing Wrong Fields (Lines 834-866)

The disconnect handler is already mostly correct, but it references fields that no longer exist:

**Update Lines 834-846 to:**
```javascript
updateResult = await supabaseRequest(
  `users?id=eq.${authUser.id}&select=*`,
  'PATCH',
  {
    ebay_refresh_token: null,
    ebay_user_id: null,
    ebay_connection_status: 'disconnected',
    ebay_connected_at: null
    // Keep: ebay_app_id, ebay_cert_id, ebay_dev_id
  },
  {
    'Prefer': 'return=representation'
  },
  true // Use service key
);
```

## Summary of Architectural Fix

**Before (INCORRECT):**
1. Store access_token in database
2. Check if access_token is expired
3. If expired, exchange refresh_token for new access_token
4. Store new access_token in database

**After (CORRECT):**
1. Store ONLY refresh_token in database (18-month lifetime)
2. On each API call, exchange refresh_token for fresh access_token
3. Use access_token for API calls (held in memory only)
4. Never store access_token or expiration time in database

This follows OAuth 2.0 best practices and eBay's token architecture.
