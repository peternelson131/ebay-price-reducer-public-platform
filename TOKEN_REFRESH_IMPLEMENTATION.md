# eBay OAuth Token Refresh Implementation

## Overview

This document describes the automatic token refresh system implemented for the eBay Price Reducer application. The system ensures that access tokens are automatically refreshed before they expire, providing seamless API access without user intervention.

## Components

### 1. Backend - Token Refresh Endpoint

**File**: `netlify/functions/ebay-oauth.js`

**Endpoint**: `/.netlify/functions/ebay-oauth?action=refresh-token`

**Features**:
- Retrieves user's encrypted refresh token from database
- Decrypts refresh token using AES-256-CBC encryption
- Calls eBay's token refresh API endpoint
- Updates access token expiry time in database
- Handles errors gracefully with specific error messages
- Detects expired/invalid refresh tokens and prompts reconnection

**Request**:
```javascript
GET /.netlify/functions/ebay-oauth?action=refresh-token
Headers:
  Authorization: Bearer {user_auth_token}
```

**Response (Success)**:
```json
{
  "success": true,
  "message": "Access token refreshed successfully",
  "tokenExpiresAt": "2025-10-01T16:30:00.000Z",
  "expiresIn": 7200
}
```

**Response (Error)**:
```json
{
  "success": false,
  "error": "Refresh token has expired or been revoked. Please reconnect your eBay account.",
  "needsReconnect": true
}
```

### 2. Frontend - Utility Module

**File**: `frontend/src/utils/ebayTokenManager.js`

**Exports**:

- `isTokenExpiringSoon(tokenExpiresAt, bufferMinutes)` - Check if token needs refresh
- `isTokenValid(tokenExpiresAt)` - Check if token is currently valid
- `getTimeUntilExpiry(tokenExpiresAt)` - Get days/hours/minutes remaining
- `refreshEbayToken()` - Call token refresh API
- `checkAndRefreshToken(profile)` - Auto-check and refresh if needed
- `formatTokenExpiry(tokenExpiresAt)` - Format expiry for display
- `getTokenStatus(tokenExpiresAt)` - Get status with color coding

**Usage Example**:
```javascript
import { isTokenExpiringSoon, refreshEbayToken } from '../utils/ebayTokenManager'

// Check if token needs refresh
if (isTokenExpiringSoon(profile.ebay_token_expires_at, 30)) {
  const result = await refreshEbayToken()
  if (result.success) {
    console.log('Token refreshed:', result.tokenExpiresAt)
  }
}
```

### 3. Frontend - EbayConnect Component

**File**: `frontend/src/components/EbayConnect.jsx`

**Features**:

#### Automatic Token Refresh
- Runs on component mount when profile loads
- Checks if token is expiring within 30 minutes
- Automatically refreshes token in background
- No user interaction required

#### Manual Refresh Button
- "Refresh Now" button in token status section
- Shows loading state during refresh
- Displays success/error messages
- Updates UI immediately after refresh

#### Token Status Display
- Shows token expiration time
- Displays time remaining (e.g., "1h 45m remaining")
- Color-coded status:
  - 🟢 Green: Token is valid (>1 hour remaining)
  - 🟡 Yellow: Token expiring soon (<1 hour remaining)
  - 🔴 Red: Token expired
- Real-time status updates

#### Error Handling
- Detects expired refresh tokens
- Prompts user to reconnect eBay account
- Provides clear error messages
- Offers reconnection flow

## Token Lifecycle

### Access Token
- **Duration**: 2 hours
- **Storage**: NOT stored (generated on each API call)
- **Tracking**: `ebay_token_expires_at` field in database
- **Refresh**: Automatic when expiring within 30 minutes

### Refresh Token
- **Duration**: 18 months
- **Storage**: Encrypted in `ebay_refresh_token` field
- **Tracking**: `ebay_refresh_token_expires_at` field in database
- **Encryption**: AES-256-CBC with unique IV per token

## User Experience

### Scenario 1: Normal Operation
1. User connects eBay account via OAuth
2. Refresh token stored (encrypted)
3. User uses app normally
4. When access token is within 30 minutes of expiry:
   - System automatically refreshes in background
   - User sees no interruption
   - Token status updates to show new expiry

### Scenario 2: Token Expired
1. User returns to app after 2+ hours
2. Component detects expired access token
3. Automatically triggers refresh
4. Success message briefly appears
5. User continues working

### Scenario 3: Refresh Token Expired
1. System attempts to refresh access token
2. eBay returns "invalid_grant" error
3. User sees error message:
   > "Refresh token has expired or been revoked. Please reconnect your eBay account."
4. Dialog prompts: "Would you like to reconnect now?"
5. If yes: OAuth flow restarts
6. If no: User can manually reconnect later

### Scenario 4: Manual Refresh
1. User views Account > Integrations page
2. Sees token status with "Refresh Now" button
3. Clicks button
4. Loading state shows "Refreshing..."
5. Success message appears with new expiry time
6. Message auto-hides after 5 seconds

## Database Schema

**Table**: `users`

Relevant columns:
```sql
ebay_refresh_token TEXT,                    -- Encrypted refresh token
ebay_token_expires_at TIMESTAMPTZ,          -- Access token expiry (2 hours)
ebay_refresh_token_expires_at TIMESTAMPTZ,  -- Refresh token expiry (18 months)
ebay_connection_status TEXT,                -- 'connected', 'not_connected', etc.
ebay_user_id TEXT,                          -- eBay user identifier
ebay_connected_at TIMESTAMPTZ              -- When user connected account
```

## Security Considerations

### Encryption
- Refresh tokens encrypted with AES-256-CBC
- Unique IV (Initialization Vector) per token
- Encryption key from environment variable `ENCRYPTION_KEY`
- Tokens never exposed to frontend in decrypted form

### Access Control
- Row Level Security (RLS) on users table
- Service key used for backend operations
- Refresh endpoint requires valid authentication
- User can only refresh their own tokens

### Error Handling
- Specific error messages for different failure modes
- No sensitive data in error responses
- Graceful degradation when refresh fails
- Clear path to recovery (reconnect)

## Testing

### Manual Testing Checklist

1. **Happy Path - Auto Refresh**
   - [ ] Connect eBay account
   - [ ] Wait 1.5 hours (or modify expiry in DB)
   - [ ] Reload page
   - [ ] Verify auto-refresh triggered
   - [ ] Check new expiry time updated

2. **Happy Path - Manual Refresh**
   - [ ] Navigate to Account > Integrations
   - [ ] Click "Refresh Now" button
   - [ ] Verify success message appears
   - [ ] Check expiry time updated
   - [ ] Confirm message auto-hides after 5 seconds

3. **Error Path - Expired Refresh Token**
   - [ ] Manually clear `ebay_refresh_token` in DB
   - [ ] Click "Refresh Now"
   - [ ] Verify error message appears
   - [ ] Check "Reconnect" button appears
   - [ ] Click reconnect and verify OAuth flow starts

4. **Error Path - Invalid Credentials**
   - [ ] Change `ebay_cert_id` to invalid value
   - [ ] Click "Refresh Now"
   - [ ] Verify error message shows
   - [ ] Restore valid credentials
   - [ ] Retry refresh

5. **UI/UX Testing**
   - [ ] Token status shows correct color (green/yellow/red)
   - [ ] Time remaining displays correctly
   - [ ] Loading states work properly
   - [ ] Mobile responsive layout works
   - [ ] Success messages are readable
   - [ ] Error messages are clear and actionable

### Automated Testing (Future)

```javascript
// Example test case
describe('Token Refresh', () => {
  it('should automatically refresh expiring token', async () => {
    // Set token to expire in 20 minutes
    await setTokenExpiry(Date.now() + 20 * 60 * 1000)

    // Mount component
    render(<EbayConnect />)

    // Wait for auto-refresh
    await waitFor(() => {
      expect(refreshTokenSpy).toHaveBeenCalled()
    })

    // Verify new expiry is ~2 hours from now
    const newExpiry = await getTokenExpiry()
    expect(newExpiry).toBeGreaterThan(Date.now() + 1.5 * 60 * 60 * 1000)
  })
})
```

## API Reference

### eBay Token Refresh Endpoint

**URL**: `https://api.ebay.com/identity/v1/oauth2/token`

**Method**: POST

**Headers**:
```
Content-Type: application/x-www-form-urlencoded
Authorization: Basic {base64(app_id:cert_id)}
```

**Body**:
```
grant_type=refresh_token
refresh_token={encrypted_refresh_token}
scope={space_separated_scopes}
```

**Response**:
```json
{
  "access_token": "v^1.1#i^1...",
  "expires_in": 7200,
  "token_type": "User Access Token"
}
```

Note: eBay does NOT return a new refresh token on refresh. The original refresh token remains valid for 18 months.

## Monitoring & Logging

### Backend Logs
- Token refresh initiated: `Token refresh action triggered for user: {user_id}`
- Calling eBay API: `Calling eBay token refresh endpoint...`
- Success: `Token refresh successful`
- Failure: `Token refresh failed: {error}`
- Expiry updated: `Token expiry updated successfully`

### Frontend Logs
- Auto-refresh trigger: `Token is expired or expiring soon, auto-refreshing...`
- Manual refresh: `Starting token refresh...`
- Success: `Token refresh successful`
- Error: `Token refresh failed: {error}`

### Metrics to Monitor
- Token refresh success rate
- Average time between refreshes
- Number of expired refresh tokens (requiring reconnect)
- Error types and frequencies

## Future Enhancements

1. **Proactive Refresh Scheduling**
   - Background job to refresh all tokens within 1 hour of expiry
   - Reduces client-side processing
   - Ensures tokens always valid

2. **Refresh Token Rotation**
   - eBay may add refresh token rotation in future
   - Update endpoint to handle new refresh tokens
   - Store rotation history for audit

3. **Token Health Dashboard**
   - Admin view of all user tokens
   - See which tokens are expiring soon
   - Bulk refresh capability
   - Connection status overview

4. **Webhook Integration**
   - eBay webhooks for token expiry notifications
   - Proactive refresh based on events
   - User notifications for action required

5. **Enhanced Error Recovery**
   - Retry logic with exponential backoff
   - Queue failed refreshes for retry
   - Batch refresh operations

## Deployment Notes

### Environment Variables Required

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# Encryption
ENCRYPTION_KEY=your-32-byte-encryption-key

# eBay (per-user storage, not env vars anymore)
# Each user stores their own:
# - ebay_app_id
# - ebay_cert_id
# - ebay_dev_id
```

### Deployment Steps

1. Deploy backend function to Netlify
2. Deploy frontend to Netlify
3. Verify environment variables set
4. Test with development eBay app first
5. Switch to production eBay app
6. Monitor logs for first 24 hours

## Troubleshooting

### Issue: Token refresh fails with "invalid_grant"

**Cause**: Refresh token has expired or been revoked

**Solution**: User must reconnect eBay account via OAuth flow

### Issue: Token refresh fails with authentication error

**Cause**: User's App ID or Cert ID is incorrect

**Solution**: User should update credentials in Admin Settings

### Issue: Auto-refresh not triggering

**Cause**: Component not detecting expiring token

**Solution**:
1. Check `ebay_token_expires_at` value in database
2. Verify useEffect dependencies
3. Check browser console for errors
4. Ensure profile data is loading correctly

### Issue: Encryption error when decrypting token

**Cause**: ENCRYPTION_KEY changed or token corrupted

**Solution**:
1. User must reconnect eBay account
2. New token will be encrypted with current key
3. Consider key rotation strategy

## Support

For issues or questions:
1. Check browser console logs
2. Check Netlify function logs
3. Verify database values
4. Review this documentation
5. Create GitHub issue with logs and steps to reproduce

---

**Last Updated**: October 1, 2025
**Version**: 1.0
**Author**: Claude Code
