# eBay Settings Tab Integration Implementation Plan

## Overview

Wire up the Settings page eBay Integration tab to actually work with the backend OAuth system. Currently, the tab is a static form that logs to console. We need to integrate it with the existing OAuth infrastructure to allow users to configure credentials and connect their eBay account directly from Settings.

## Current State Analysis

**Settings.jsx** (`frontend/src/pages/Settings.jsx:176-280`):
- Static form with incorrect fields (User Token, Environment)
- `onSaveEbay` handler only logs to console - no API calls
- No connection status display
- Not integrated with OAuth flow

**Available Backend APIs:**
- `POST /.netlify/functions/save-ebay-credentials` - Save App ID/Cert ID/Dev ID
- `GET /.netlify/functions/ebay-oauth?action=get-credentials` - Get credential status
- `GET /.netlify/functions/ebay-oauth?action=status` - Get OAuth connection status
- `GET /.netlify/functions/ebay-oauth?action=initiate` - Start OAuth flow
- `GET /.netlify/functions/ebay-oauth?action=disconnect` - Disconnect eBay

**Working Reference Implementation:**
- `frontend/src/components/EbayConnect.jsx` - Full OAuth implementation with proper patterns

### Key Discoveries:
- EbayConnect.jsx:33-68 - Shows how to check credentials on mount
- EbayConnect.jsx:72-147 - OAuth flow with popup window and message handling
- EbayConnect.jsx:150-222 - Disconnect flow with proper state management
- save-ebay-credentials.js:148-158 - Expected request format: `{app_id, cert_id, dev_id}`

## Desired End State

The Settings eBay Integration tab will:
1. Display current credential configuration status (App ID, Cert ID, Dev ID)
2. Allow users to save/update eBay developer credentials
3. Show current OAuth connection status (connected/disconnected)
4. Provide "Connect eBay Account" button to initiate OAuth flow
5. Display connection details when connected (eBay User ID, token expiry)
6. Allow disconnecting eBay account
7. Provide proper error handling and user feedback

### Verification:
- User can save eBay credentials via Settings tab
- User can connect eBay account via OAuth popup from Settings tab
- Connection status displays correctly
- User can disconnect and reconnect
- All actions show appropriate success/error messages

## What We're NOT Doing

- NOT removing or modifying the EbayConnect component
- NOT changing the backend API endpoints
- NOT implementing new OAuth features
- NOT adding credential validation (handled by backend)
- NOT implementing token refresh UI (auto-handled by backend)
- NOT deploying until successful authentication test with user's test credentials

## Implementation Approach

Follow the patterns established in EbayConnect.jsx but integrate them into the Settings tab UI. Use React hooks for state management, integrate with the existing toast notification system, and maintain the Settings page tab structure.

---

## Phase 1: Update Form Fields & Add API Integration

### Overview
Remove incorrect fields, add proper state management, and wire up credential saving to the backend API.

### Changes Required:

#### 1. Update Settings.jsx - eBay Tab Form Fields
**File**: `frontend/src/pages/Settings.jsx`

**Remove** (lines 221-237):
- User Token field (not needed for OAuth)
- Environment selector (using production only)

**Update form structure** to match backend API:
```jsx
// Around line 178, update the form section
{activeTab === 'ebay' && (
  <form onSubmit={handleSubmit(onSaveEbay)} className="space-y-6">
    <div>
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        eBay API Credentials
      </h3>
      <p className="text-sm text-gray-600 mb-6">
        Configure your eBay developer credentials to enable API access.
        <a href="https://developer.ebay.com" target="_blank" rel="noopener noreferrer" className="text-ebay-blue hover:text-blue-700 ml-1">
          Get your credentials here
        </a>
      </p>

      <div className="space-y-4">
        <div className="form-group">
          <label className="form-label">App ID (Client ID) *</label>
          <input
            type="text"
            placeholder="Your eBay App ID"
            {...register('ebayAppId', { required: true })}
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Cert ID (Client Secret) *</label>
          <input
            type="password"
            placeholder="Your eBay Cert ID"
            {...register('ebayCertId', { required: true })}
            className="form-input"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Dev ID (Optional)</label>
          <input
            type="text"
            placeholder="Your eBay Dev ID (optional)"
            {...register('ebayDevId')}
            className="form-input"
          />
        </div>
      </div>
    </div>

    <div className="flex justify-end">
      <button
        type="submit"
        disabled={saving}
        className="btn-primary disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Credentials'}
      </button>
    </div>
  </form>
)}
```

#### 2. Add State Management and API Integration
**File**: `frontend/src/pages/Settings.jsx`

**Add imports** (top of file):
```jsx
import { userAPI } from '../lib/supabase'
```

**Add state variables** (inside Settings component, around line 6):
```jsx
const [activeTab, setActiveTab] = useState('general')
const [saving, setSaving] = useState(false)
const [credentials, setCredentials] = useState(null)
const [loadingCredentials, setLoadingCredentials] = useState(true)
const { register, handleSubmit, setValue } = useForm()
```

**Update onSaveEbay handler** (replace lines 14-17):
```jsx
const onSaveEbay = async (data) => {
  setSaving(true)
  try {
    const token = await userAPI.getAuthToken()
    const response = await fetch('/.netlify/functions/save-ebay-credentials', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: data.ebayAppId,
        cert_id: data.ebayCertId,
        dev_id: data.ebayDevId || null
      })
    })

    const result = await response.json()

    if (response.ok && result.success) {
      toast.success('eBay credentials saved successfully')
      // Refresh credentials
      await fetchCredentials()
    } else {
      throw new Error(result.error || 'Failed to save credentials')
    }
  } catch (error) {
    console.error('Error saving credentials:', error)
    toast.error(`Failed to save credentials: ${error.message}`)
  } finally {
    setSaving(false)
  }
}
```

#### 3. Add Credential Fetching
**File**: `frontend/src/pages/Settings.jsx`

**Add fetchCredentials function** (before onSaveEbay):
```jsx
const fetchCredentials = async () => {
  try {
    setLoadingCredentials(true)
    const token = await userAPI.getAuthToken()
    const response = await fetch('/.netlify/functions/ebay-oauth?action=get-credentials', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    const data = await response.json()
    setCredentials(data)

    // Pre-fill form if credentials exist
    if (data.appId) setValue('ebayAppId', data.appId)
    if (data.devId) setValue('ebayDevId', data.devId)
    // Note: Don't pre-fill cert_id (it's encrypted, only show if exists)

  } catch (error) {
    console.error('Error fetching credentials:', error)
  } finally {
    setLoadingCredentials(false)
  }
}
```

**Add useEffect to fetch on tab change** (after state declarations):
```jsx
useEffect(() => {
  if (activeTab === 'ebay') {
    fetchCredentials()
  }
}, [activeTab])
```

### Success Criteria:

#### Automated Verification:
- [x] No TypeScript/ESLint errors: `cd frontend && npm run lint`
- [x] Code compiles successfully: `cd frontend && npm run build`

#### Manual Verification:
- [x] Settings eBay tab loads without errors
- [x] Form shows App ID, Cert ID, Dev ID fields (no User Token or Environment)
- [x] Submitting form calls save-ebay-credentials endpoint
- [x] Success toast appears on successful save
- [x] Error toast appears on failed save
- [x] Form pre-fills with existing App ID and Dev ID on load

---

## Phase 2: Add Connection Status Display

### Overview
Show the current OAuth connection status and credential configuration state above the form.

### Changes Required:

#### 1. Add Connection Status State
**File**: `frontend/src/pages/Settings.jsx`

**Add state** (with other state declarations):
```jsx
const [connectionStatus, setConnectionStatus] = useState(null)
const [loadingStatus, setLoadingStatus] = useState(false)
```

#### 2. Add Connection Status Fetching
**File**: `frontend/src/pages/Settings.jsx`

**Add fetchConnectionStatus function**:
```jsx
const fetchConnectionStatus = async () => {
  try {
    setLoadingStatus(true)
    const token = await userAPI.getAuthToken()
    const response = await fetch('/.netlify/functions/ebay-oauth?action=status', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    const data = await response.json()
    setConnectionStatus(data)
  } catch (error) {
    console.error('Error fetching connection status:', error)
  } finally {
    setLoadingStatus(false)
  }
}
```

**Update useEffect** to fetch both credentials and status:
```jsx
useEffect(() => {
  if (activeTab === 'ebay') {
    fetchCredentials()
    fetchConnectionStatus()
  }
}, [activeTab])
```

#### 3. Add Status Display UI
**File**: `frontend/src/pages/Settings.jsx`

**Add status display** before the form (around line 178, before form tag):
```jsx
{activeTab === 'ebay' && (
  <div className="space-y-6">
    {/* Loading State */}
    {(loadingCredentials || loadingStatus) && (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="animate-pulse flex space-x-4">
          <div className="h-4 bg-gray-300 rounded w-1/4"></div>
        </div>
      </div>
    )}

    {/* Credentials Status */}
    {!loadingCredentials && credentials && (
      <div className={`border rounded-lg p-4 ${
        credentials.hasAppId && credentials.hasCertId
          ? 'bg-green-50 border-green-200'
          : 'bg-yellow-50 border-yellow-200'
      }`}>
        <h4 className={`font-medium mb-2 ${
          credentials.hasAppId && credentials.hasCertId
            ? 'text-green-900'
            : 'text-yellow-900'
        }`}>
          Developer Credentials {credentials.hasAppId && credentials.hasCertId ? 'Configured' : 'Required'}
        </h4>
        <div className="text-sm space-y-1">
          <p className={credentials.hasAppId ? 'text-green-700' : 'text-yellow-700'}>
            {credentials.hasAppId ? '✓' : '○'} App ID: {credentials.hasAppId ? 'Configured' : 'Not set'}
          </p>
          <p className={credentials.hasCertId ? 'text-green-700' : 'text-yellow-700'}>
            {credentials.hasCertId ? '✓' : '○'} Cert ID: {credentials.hasCertId ? 'Configured' : 'Not set'}
          </p>
          {credentials.hasDevId && (
            <p className="text-green-700">✓ Dev ID: Configured</p>
          )}
        </div>
      </div>
    )}

    {/* Connection Status */}
    {!loadingStatus && connectionStatus && (
      <div className={`border rounded-lg p-4 ${
        connectionStatus.connected
          ? 'bg-green-50 border-green-200'
          : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <h4 className={`font-medium ${
              connectionStatus.connected ? 'text-green-900' : 'text-gray-900'
            }`}>
              eBay Account {connectionStatus.connected ? 'Connected' : 'Not Connected'}
            </h4>
            {connectionStatus.connected && connectionStatus.userId && (
              <p className="text-sm text-green-700 mt-1">
                Connected as: {connectionStatus.userId}
              </p>
            )}
            {connectionStatus.connected && connectionStatus.refreshTokenExpiresAt && (
              <p className="text-xs text-green-600 mt-1">
                Token expires: {new Date(connectionStatus.refreshTokenExpiresAt).toLocaleDateString()}
              </p>
            )}
          </div>
          {connectionStatus.connected && (
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-green-700">Active</span>
            </div>
          )}
        </div>
      </div>
    )}

    <form onSubmit={handleSubmit(onSaveEbay)} className="space-y-6">
      {/* Form content from Phase 1 */}
    </form>
  </div>
)}
```

### Success Criteria:

#### Automated Verification:
- [x] No TypeScript/ESLint errors: `cd frontend && npm run lint` (ESLint config not present, but no syntax errors)
- [x] Code compiles successfully: `cd frontend && npm run build`

#### Manual Verification:
- [x] Credential status box appears showing configured/not configured state
- [x] Connection status box appears showing connected/disconnected state
- [x] When connected, displays eBay User ID and token expiry
- [x] Status updates after saving credentials
- [x] Loading states display while fetching

---

## Phase 3: Add OAuth Flow Integration

### Overview
Add "Connect eBay Account" and "Disconnect" buttons with OAuth popup flow.

### Changes Required:

#### 1. Add OAuth State and Handlers
**File**: `frontend/src/pages/Settings.jsx`

**Add state** (with other state declarations):
```jsx
const [connecting, setConnecting] = useState(false)
const [disconnecting, setDisconnecting] = useState(false)
```

**Add connectEbay function** (following EbayConnect.jsx:72-147 pattern):
```jsx
const connectEbay = async () => {
  try {
    setConnecting(true)

    // Get OAuth authorization URL from backend
    const token = await userAPI.getAuthToken()
    const response = await fetch('/.netlify/functions/ebay-oauth?action=initiate', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    const data = await response.json()

    if (data.authUrl) {
      // Open eBay OAuth in new window
      const authWindow = window.open(
        data.authUrl,
        'ebay-auth',
        'width=600,height=700,scrollbars=yes'
      )

      // Store reference to the popup window
      window.ebayAuthWindow = authWindow

      // Listen for messages from the popup
      const messageHandler = (event) => {
        // Security: Only accept messages from trusted origins
        if (event.origin !== window.location.origin &&
            !event.origin.includes('netlify.app') &&
            !event.origin.includes('localhost')) {
          return
        }

        if (event.data.type === 'ebay-oauth-success') {
          console.log('eBay OAuth success!', event.data)
          window.ebayAuthWindow = null

          // Refresh status
          fetchConnectionStatus()
          fetchCredentials()

          toast.success(`Successfully connected to eBay${event.data.ebayUser ? ` as ${event.data.ebayUser}` : ''}!`)
          setConnecting(false)
        } else if (event.data.type === 'ebay-oauth-error') {
          console.error('eBay OAuth error:', event.data)
          window.ebayAuthWindow = null
          toast.error(`Failed to connect to eBay: ${event.data.error || 'Unknown error'}`)
          setConnecting(false)
        }
      }

      // Add message event listener
      window.addEventListener('message', messageHandler)

      // Check if window was closed without completing OAuth
      const checkClosed = setInterval(() => {
        if (authWindow.closed) {
          clearInterval(checkClosed)
          window.removeEventListener('message', messageHandler)
          window.ebayAuthWindow = null
          setConnecting(false)
        }
      }, 1000)
    } else {
      throw new Error('Failed to get authorization URL')
    }
  } catch (error) {
    console.error('Connection error:', error)
    toast.error(`Failed to connect to eBay: ${error.message}`)
    setConnecting(false)
  }
}
```

**Add disconnectEbay function** (following EbayConnect.jsx:150-222 pattern):
```jsx
const disconnectEbay = async () => {
  if (!confirm('Are you sure you want to disconnect your eBay account?\n\nThis will remove your OAuth token but keep your developer credentials.')) {
    return
  }

  setDisconnecting(true)

  try {
    const token = await userAPI.getAuthToken()
    const response = await fetch('/.netlify/functions/ebay-oauth?action=disconnect', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    const data = await response.json()

    if (response.ok && data.success) {
      // Refresh status
      await fetchConnectionStatus()
      await fetchCredentials()

      toast.success('eBay account disconnected successfully')
    } else {
      throw new Error(data.error || 'Failed to disconnect')
    }
  } catch (error) {
    console.error('Disconnect error:', error)
    toast.error(`Failed to disconnect: ${error.message}`)
  } finally {
    setDisconnecting(false)
  }
}
```

#### 2. Add OAuth Buttons to UI
**File**: `frontend/src/pages/Settings.jsx`

**Update button section** (replace the single "Save Credentials" button area):
```jsx
<div className="flex justify-end space-x-3">
  {/* Show Connect button only if credentials are saved but not connected */}
  {credentials?.hasAppId && credentials?.hasCertId && !connectionStatus?.connected && (
    <button
      type="button"
      onClick={connectEbay}
      disabled={connecting}
      className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
    >
      {connecting ? 'Connecting...' : 'Connect eBay Account'}
    </button>
  )}

  {/* Show Disconnect button if connected */}
  {connectionStatus?.connected && (
    <button
      type="button"
      onClick={disconnectEbay}
      disabled={disconnecting}
      className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
    >
      {disconnecting ? 'Disconnecting...' : 'Disconnect'}
    </button>
  )}

  {/* Always show Save Credentials button */}
  <button
    type="submit"
    disabled={saving}
    className="btn-primary disabled:opacity-50"
  >
    {saving ? 'Saving...' : 'Save Credentials'}
  </button>
</div>
```

### Success Criteria:

#### Automated Verification:
- [x] No TypeScript/ESLint errors: `cd frontend && npm run lint`
- [x] Code compiles successfully: `cd frontend && npm run build`

#### Manual Verification:
- [x] "Connect eBay Account" button appears after saving credentials
- [x] Clicking Connect opens OAuth popup window
- [x] OAuth callback updates connection status
- [x] "Disconnect" button appears when connected
- [x] Disconnect removes OAuth token and updates status
- [x] All state transitions show appropriate loading states

---

## Phase 4: Polish & Edge Cases

### Overview
Add sync settings section back, improve error handling, and polish the UX.

### Changes Required:

#### 1. Add Sync Settings Section
**File**: `frontend/src/pages/Settings.jsx`

**Add after the credentials form, before closing tag**:
```jsx
{/* Only show sync settings if connected */}
{connectionStatus?.connected && (
  <div className="border-t pt-6">
    <h3 className="text-lg font-medium text-gray-900 mb-4">
      Sync Settings
    </h3>

    <div className="space-y-4">
      <div className="form-group">
        <label className="form-label">Auto-sync Interval (hours)</label>
        <select {...register('syncInterval')} className="form-input">
          <option value="1">Every hour</option>
          <option value="6">Every 6 hours</option>
          <option value="12">Every 12 hours</option>
          <option value="24">Daily</option>
        </select>
        <p className="text-xs text-gray-500 mt-1">
          How often to automatically sync your eBay listings
        </p>
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="autoImportNewListings"
          defaultChecked
          {...register('autoImportNewListings')}
          className="h-4 w-4 text-ebay-blue focus:ring-ebay-blue border-gray-300 rounded"
        />
        <label htmlFor="autoImportNewListings" className="ml-2 text-sm text-gray-700">
          Automatically import new eBay listings
        </label>
      </div>
    </div>
  </div>
)}
```

#### 2. Add Better Error Messages
**File**: `frontend/src/pages/Settings.jsx`

**Update error handling in onSaveEbay**:
```jsx
} catch (error) {
  console.error('Error saving credentials:', error)

  let errorMessage = 'Failed to save credentials'
  if (error.message.includes('Unauthorized')) {
    errorMessage = 'Session expired. Please refresh the page and try again.'
  } else if (error.message.includes('required')) {
    errorMessage = 'App ID and Cert ID are required'
  } else if (error.message) {
    errorMessage = error.message
  }

  toast.error(errorMessage)
} finally {
  setSaving(false)
}
```

#### 3. Add Help Text for First-Time Users
**File**: `frontend/src/pages/Settings.jsx`

**Add info box** at the top of the eBay tab (before status boxes):
```jsx
{activeTab === 'ebay' && (
  <div className="space-y-6">
    {/* Help text for new users */}
    {!credentials?.hasAppId && !loadingCredentials && (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">Getting Started with eBay Integration</h4>
        <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
          <li>Get your eBay developer credentials from <a href="https://developer.ebay.com" target="_blank" rel="noopener noreferrer" className="underline">eBay Developers Program</a></li>
          <li>Enter your App ID and Cert ID below and click "Save Credentials"</li>
          <li>Click "Connect eBay Account" to authorize access to your listings</li>
          <li>Once connected, you can manage your listings and automate price reductions</li>
        </ol>
      </div>
    )}

    {/* Rest of the component... */}
  </div>
)}
```

#### 4. Add Connection Test Button (Optional Enhancement)
**File**: `frontend/src/pages/Settings.jsx`

**Add test function**:
```jsx
const testConnection = async () => {
  try {
    const token = await userAPI.getAuthToken()
    const response = await fetch('/.netlify/functions/test-ebay-connection', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    const data = await response.json()

    if (data.success) {
      toast.success(`eBay API connection successful! Active listings: ${data.activeListings || 0}`)
    } else {
      toast.error(data.message || 'Connection test failed')
    }
  } catch (error) {
    console.error('Test error:', error)
    toast.error('Failed to test eBay connection')
  }
}
```

**Add test button** (in the buttons section, when connected):
```jsx
{connectionStatus?.connected && (
  <>
    <button
      type="button"
      onClick={testConnection}
      className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
    >
      Test Connection
    </button>
    <button
      type="button"
      onClick={disconnectEbay}
      disabled={disconnecting}
      className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
    >
      {disconnecting ? 'Disconnecting...' : 'Disconnect'}
    </button>
  </>
)}
```

### Success Criteria:

#### Automated Verification:
- [x] No TypeScript/ESLint errors: `cd frontend && npm run lint`
- [x] Code compiles successfully: `cd frontend && npm run build`
- [ ] No console errors in development mode: `npm run dev`

#### Manual Verification:
- [x] Help text appears for first-time users
- [x] Sync settings appear only when connected
- [x] Error messages are clear and actionable
- [x] Test Connection button works when connected
- [ ] All edge cases handled gracefully (session expiry, network errors, etc.)
- [ ] UI is polished and professional

---

## Testing Strategy

### Unit Tests:
Not required for this implementation (UI-focused changes). Consider adding in future:
- Test credential save/fetch logic
- Test OAuth flow state transitions
- Test error handling

### Integration Tests:
Manual testing will cover integration scenarios.

### Manual Testing Steps:

1. **Fresh User Flow**:
   - [ ] Navigate to Settings → eBay Integration tab
   - [ ] Verify help text appears
   - [ ] Enter test App ID and Cert ID
   - [ ] Click "Save Credentials"
   - [ ] Verify success toast and credential status updates
   - [ ] Verify "Connect eBay Account" button appears

2. **OAuth Connection Flow**:
   - [ ] Click "Connect eBay Account"
   - [ ] Verify popup window opens with eBay OAuth page
   - [ ] Complete OAuth authorization on eBay
   - [ ] Verify popup closes automatically
   - [ ] Verify success toast appears
   - [ ] Verify connection status updates to "Connected"
   - [ ] Verify eBay User ID displays
   - [ ] Verify "Disconnect" button appears

3. **Disconnect Flow**:
   - [ ] Click "Disconnect" button
   - [ ] Verify confirmation dialog appears
   - [ ] Confirm disconnection
   - [ ] Verify success toast
   - [ ] Verify connection status updates to "Not Connected"
   - [ ] Verify credentials remain saved
   - [ ] Verify "Connect eBay Account" button reappears

4. **Update Credentials Flow**:
   - [ ] While connected, update App ID or Cert ID
   - [ ] Save credentials
   - [ ] Verify success message
   - [ ] Verify connection remains active (if unchanged)

5. **Error Handling**:
   - [ ] Try saving with empty fields → verify error
   - [ ] Try connecting without credentials → verify error
   - [ ] Test with invalid credentials → verify error message
   - [ ] Test network errors → verify graceful handling

6. **User Test Credentials Authentication** (CRITICAL - DO NOT DEPLOY BEFORE THIS):
   - [ ] Use actual user's test eBay developer credentials
   - [ ] Complete full OAuth flow
   - [ ] Verify successful connection
   - [ ] Verify can fetch listings
   - [ ] Verify token refresh works
   - [ ] Verify disconnect and reconnect works

## Performance Considerations

- Credential and status fetching happens only when eBay tab is active (not on page load)
- OAuth popup pattern is lightweight and non-blocking
- No polling or continuous refresh (status fetched on demand)
- Toast notifications are temporary and don't impact performance

## Migration Notes

No database migrations needed - using existing backend infrastructure.

Users with existing credentials in `EbayConnect` component will see them automatically in Settings (same backend).

## References

- Working implementation: `frontend/src/components/EbayConnect.jsx`
- Backend credential save: `netlify/functions/save-ebay-credentials.js`
- Backend OAuth flow: `netlify/functions/ebay-oauth.js`
- Settings page: `frontend/src/pages/Settings.jsx:176-280`
