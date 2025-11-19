# Fix eBay Token Issue

## Problem Identified
The issue is that an **access token** was stored instead of a **refresh token** in the database. Access tokens expire after 2 hours, while refresh tokens last 18 months.

## Quick Diagnosis

Run this in your browser console to check your current token:

```javascript
// Get auth token
const authData = JSON.parse(localStorage.getItem('sb-kwgpcrnqhpxwqkxibblw-auth-token'));
const token = authData?.access_token;

// Check stored token
fetch('/.netlify/functions/check-stored-token', {
  headers: { 'Authorization': `Bearer ${token}` }
})
.then(r => r.json())
.then(data => {
  console.log('Token Status:', data);
  if (data.diagnosis) {
    console.warn('⚠️ PROBLEM:', data.diagnosis);
    console.log('✅ SOLUTION:', data.solution);
  }
});
```

## Solution Options

### Option 1: Reconnect eBay Account (Recommended)
Simply reconnect your eBay account through the UI:
1. Go to Settings
2. Click "Connect eBay Account"
3. Authorize the app
4. The system will now correctly store the refresh token

### Option 2: Manual Token Fix
If you have a valid refresh token from eBay, you can manually update it:

```javascript
// Replace YOUR_REFRESH_TOKEN with your actual eBay refresh token
const refreshToken = 'YOUR_REFRESH_TOKEN_HERE';

// Get auth token
const authData = JSON.parse(localStorage.getItem('sb-kwgpcrnqhpxwqkxibblw-auth-token'));
const authToken = authData?.access_token;

// Fix the token
fetch('/.netlify/functions/fix-ebay-token', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ refreshToken })
})
.then(r => r.json())
.then(data => {
  if (data.success) {
    console.log('✅ Token fixed successfully!', data);
  } else {
    console.error('❌ Failed to fix token:', data);
  }
});
```

## How to Get a Refresh Token

### Via eBay Developer Portal:
1. Go to https://developer.ebay.com/my/auth
2. Select your app
3. Get OAuth tokens
4. Use the "User Token Tool" to generate tokens
5. Copy the **refresh_token** (NOT the access_token)

### Via OAuth Flow:
The app will automatically get the correct token when you connect through the UI.

## Understanding Token Types

| Token Type | Lifetime | Format | Usage |
|------------|----------|--------|-------|
| **Access Token** | 2 hours | JWT (3 dots) | API calls |
| **Refresh Token** | 18 months | eBay format (v^1#i^1#...) | Get new access tokens |

## Prevention
The OAuth callback has been verified to correctly store refresh tokens. The issue should not recur for new connections.

## Verification
After fixing, verify it works:

```javascript
// Test the listings API
const authData = JSON.parse(localStorage.getItem('sb-kwgpcrnqhpxwqkxibblw-auth-token'));
fetch('/.netlify/functions/ebay-fetch-listings', {
  headers: { 'Authorization': `Bearer ${authData?.access_token}` }
})
.then(r => r.json())
.then(data => console.log('Listings:', data));
```