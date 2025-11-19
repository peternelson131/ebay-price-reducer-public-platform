# 🔧 eBay Connection Troubleshooting Guide

## Current Issue
You're seeing 503 errors when trying to fetch eBay listings. This typically means one of the following:
1. eBay credentials are missing or incorrect
2. Refresh token has expired
3. Decryption of stored credentials is failing

## Quick Diagnostic

### Step 1: Check eBay Connection Status

Open your browser console (F12) and run this command while logged in:

```javascript
// Run this in browser console
fetch('/.netlify/functions/debug-ebay-connection', {
  headers: {
    'Authorization': `Bearer ${JSON.parse(localStorage.getItem('supabase.auth.token')).currentSession.access_token}`
  }
})
.then(r => r.json())
.then(data => console.log('eBay Connection Status:', data))
```

### Step 2: Interpret the Results

The response will tell you exactly what's wrong:

- **`connected: false, error: 'eBay not connected'`**
  → You need to connect your eBay account in Account Settings

- **`connected: false, error: 'Decryption failed'`**
  → The stored credentials are corrupted. Reconnect your eBay account

- **`connected: false, error: 'Token refresh failed'`**
  → Your eBay refresh token has expired. You need to reauthorize

- **`connected: true`**
  → Your connection is working! The issue might be with rate limiting

## Solutions

### Solution 1: Reconnect eBay Account
1. Go to Account Settings
2. Click "Connect eBay Account"
3. Complete the OAuth flow
4. Try loading listings again

### Solution 2: Check Environment Variables
Make sure these are set in Netlify:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `ENCRYPTION_KEY` (should be a consistent 32-byte key)
- `EBAY_APP_ID` (not needed if stored in database)
- `EBAY_CERT_ID` (not needed if stored in database)

### Solution 3: Clear Cache and Retry
Sometimes the function cache gets stuck:
1. Wait 5 minutes (cache TTL)
2. Hard refresh the page (Ctrl+Shift+R)
3. Try loading listings again

## Error Messages Explained

### "eBay service temporarily unavailable"
This is a generic 503 error. Run the diagnostic above to get specific details.

### "Your eBay connection has expired"
The refresh token is no longer valid. You need to reconnect your eBay account.

### "There was a problem accessing your eBay credentials"
The encryption/decryption of your stored tokens failed. This happens if the encryption key changes.

### "Too many requests to eBay"
You've hit the rate limit. The system has caching to prevent this, but if you see it:
- Wait 60 seconds
- The next request should use cached data

## Advanced Debugging

### Check Function Logs
```bash
npx netlify logs:function ebay-fetch-listings
```

### Test the Function Directly
```bash
# Get your auth token from browser localStorage first
curl https://dainty-horse-49c336.netlify.app/.netlify/functions/debug-ebay-connection \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

### Common Issues

1. **ENCRYPTION_KEY mismatch**
   - The key used to encrypt tokens differs from the one used to decrypt
   - Solution: Ensure ENCRYPTION_KEY environment variable is consistent

2. **Expired eBay App credentials**
   - Your eBay application credentials might be invalid
   - Solution: Check eBay Developer Portal for your app status

3. **Missing scopes**
   - The OAuth token doesn't have required permissions
   - Solution: Reconnect with proper scopes

## Next Steps

1. Run the diagnostic command above
2. Share the results (you can redact sensitive info)
3. Based on the error, follow the appropriate solution

The system is designed to give you specific, actionable error messages. If you're seeing generic errors, use the debug function to get details!