# Check Your eBay Token Status

## Quick Check Command

Run this in your browser console while on the app:

```javascript
// First, get the correct auth token
const authData = JSON.parse(localStorage.getItem('sb-kwgpcrnqhpxwqkxibblw-auth-token'));
const token = authData?.access_token;

if (!token) {
  console.log('No auth token found. Please log in first.');
} else {
  // Check what token is stored
  fetch('/.netlify/functions/check-stored-token', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(r => r.json())
  .then(data => {
    console.log('Token Analysis:', data);
    if (data.tokenAnalysis) {
      console.log('\n=== TOKEN STATUS ===');
      console.log('Type:', data.tokenAnalysis.type);
      console.log('Status:', data.tokenAnalysis.status || 'Unknown');
      if (data.tokenAnalysis.jwtPayload) {
        console.log('Expired?', data.tokenAnalysis.jwtPayload.expired);
        console.log('Expiration:', data.tokenAnalysis.jwtPayload.exp);
        if (data.tokenAnalysis.expiredHoursAgo) {
          console.log('Expired hours ago:', data.tokenAnalysis.expiredHoursAgo);
        }
      }
      if (data.diagnosis) {
        console.log('\n⚠️ DIAGNOSIS:', data.diagnosis);
        console.log('✅ SOLUTION:', data.solution);
      }
    }
    return data;
  })
  .catch(err => console.error('Error:', err));
}
```

## Alternative: Find Your Auth Token

If the above doesn't work, try this to find your auth token:

```javascript
// List all localStorage keys to find the auth token
Object.keys(localStorage).forEach(key => {
  if (key.includes('auth') || key.includes('token')) {
    console.log(key, ':', localStorage.getItem(key).substring(0, 100) + '...');
  }
});
```

Then use the token from the correct key.

## What We're Looking For

1. **Token Type**: Is it a JWT (access token) or eBay refresh token?
2. **Expiration**: If it's a JWT, when did it expire?
3. **Problem**: Did we store an access token instead of a refresh token?

## Expected Issues

- **Access Token Stored**: If we stored an access token (JWT) instead of a refresh token, it expires in 2 hours
- **Expired Token**: The token is expired and can't be used to get new tokens
- **Wrong Field**: The token might be in the wrong database field

Run the first command and share what you see!