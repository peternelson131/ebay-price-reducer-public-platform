# OAuth Token Management Research

**Date**: 2025-10-02
**Git Commit**: e379801f4f33f9e2f00869c6f5d10516f73614b7
**Branch**: main
**Purpose**: Comprehensive analysis of how frontend and backend work together to manage tokens throughout the OAuth storage and connection workflow, and how the listings page provides tokens to access eBay's API

---

## Executive Summary

This eBay Price Reducer application uses a multi-layered authentication system:

1. **Supabase JWT Authentication**: Users authenticate with Supabase, receiving a JWT access token
2. **eBay OAuth 2.0 with PKCE**: Users connect their eBay accounts via OAuth, generating eBay refresh tokens
3. **Token Storage**: eBay refresh tokens are encrypted (AES-256-CBC) and stored in Supabase database
4. **Token Exchange**: When accessing eBay API, refresh tokens are exchanged for short-lived access tokens
5. **Per-User Credentials**: Each user provides their own eBay App ID and Cert ID for API calls

**Key Finding**: The system uses TWO separate authentication layers that work together - Supabase for application authentication and eBay for API access. The Listings page uses the Supabase JWT to authenticate to backend functions, which then use the eBay credentials to access eBay's API on behalf of the user.

---

## Table of Contents

1. [Authentication Architecture Overview](#authentication-architecture-overview)
2. [Token Types and Lifecycles](#token-types-and-lifecycles)
3. [Complete OAuth Flow](#complete-oauth-flow)
4. [How Listings Page Accesses eBay API](#how-listings-page-accesses-ebay-api)
5. [Database Schema and Security](#database-schema-and-security)
6. [Encryption Implementation](#encryption-implementation)
7. [File-by-File Analysis](#file-by-file-analysis)
8. [Security Features](#security-features)
9. [Error Handling and Edge Cases](#error-handling-and-edge-cases)
10. [Common Issues and Troubleshooting](#common-issues-and-troubleshooting)

---

## Authentication Architecture Overview

### Two-Layer Authentication System

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER'S BROWSER                           │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Supabase Session (localStorage)                           │ │
│  │  - JWT Access Token (1 hour)                              │ │
│  │  - JWT Refresh Token (for Supabase session renewal)       │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Bearer Token in Authorization header
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   NETLIFY SERVERLESS FUNCTIONS                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Token Validation                                          │ │
│  │  - Validates Supabase JWT                                 │ │
│  │  - Extracts user ID from JWT                              │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              │ Query with user ID               │
│                              ▼                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Database Query (via RPC)                                  │ │
│  │  - get_user_ebay_credentials(user_uuid)                   │ │
│  │  - Returns: encrypted refresh_token, app_id, cert_id      │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              │ Encrypted credentials            │
│                              ▼                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Credential Decryption                                     │ │
│  │  - Decrypt cert_id using ENCRYPTION_KEY                   │ │
│  │  - Use app_id + cert_id + refresh_token                   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              │ POST with Basic Auth             │
│                              ▼                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       EBAY OAUTH API                            │
│  POST /identity/v1/oauth2/token                                 │
│  Authorization: Basic base64(app_id:cert_id)                    │
│  Body: grant_type=refresh_token&refresh_token=...               │
│                                                                 │
│  Response:                                                      │
│  {                                                              │
│    "access_token": "v^1.1|...",  // 2-hour lifetime            │
│    "token_type": "Bearer",                                      │
│    "expires_in": 7200                                           │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Return access token
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   NETLIFY FUNCTION (in memory)                  │
│  this.accessToken = data.access_token  // Ephemeral, 2 hours   │
│                                                                 │
│  Now make eBay API calls:                                       │
│    GET /sell/inventory/v1/inventory_item                        │
│    Authorization: Bearer {access_token}                         │
└─────────────────────────────────────────────────────────────────┘
```

### Key Points

- **Supabase JWT**: Used for authenticating the user to the application's backend functions
- **eBay Refresh Token**: Long-lived (18 months), stored encrypted, used to obtain access tokens
- **eBay Access Token**: Short-lived (2 hours), ephemeral (never persisted), used for API calls
- **Per-User Credentials**: Each user has their own eBay App ID and Cert ID

---

## Token Types and Lifecycles

### 1. Supabase JWT Access Token

**Purpose**: Authenticate user to Netlify serverless functions
**Lifetime**: 1 hour (configurable in Supabase)
**Storage**: Browser localStorage (via Supabase client)
**Format**: JWT (JSON Web Token)
**Used By**: Frontend → Backend function calls

**Lifecycle**:
```
User Login → Supabase Auth → JWT Generated → Stored in localStorage
                                            ↓
                           Used in Authorization: Bearer {token}
                                            ↓
                              Backend validates JWT with Supabase
                                            ↓
                                Extracts user.id from JWT payload
```

**Code Location**:
- Frontend: `frontend/src/lib/supabase.js:583-586`
```javascript
export const getAuthToken = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}
```

- Backend: `netlify/functions/trigger-sync.js:25-44`
```javascript
const authHeader = event.headers.authorization || event.headers.Authorization;
if (!authHeader?.startsWith('Bearer ')) {
  return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
}

const token = authHeader.replace('Bearer ', '');
const { data: userData, error: authError } = await supabase.auth.getUser(token);
user = userData?.user;
```

### 2. eBay OAuth Refresh Token

**Purpose**: Obtain eBay access tokens for API calls
**Lifetime**: 18 months (reissued on each use)
**Storage**: Supabase `users` table, `ebay_refresh_token` column (AES-256-CBC encrypted)
**Format**: Opaque string (eBay proprietary)
**Used By**: Backend functions → eBay OAuth token endpoint

**Lifecycle**:
```
OAuth Flow Complete → eBay issues refresh_token
                              ↓
                    Encrypt with AES-256-CBC
                              ↓
              Store in users.ebay_refresh_token column
                              ↓
         Retrieved via get_user_ebay_credentials RPC
                              ↓
                        Decrypt in memory
                              ↓
            Exchange for access_token (POST to eBay)
                              ↓
                Refresh token is reissued by eBay
                              ↓
               Update users.ebay_refresh_token (encrypted)
```

**Code Location**:
- Storage: `netlify/functions/ebay-oauth-callback.js:302-318`
```javascript
const { data: existingUser, error: fetchError } = await supabase
  .from('users')
  .select('ebay_refresh_token')
  .eq('id', authUser.id)
  .single();

const encryptedRefreshToken = encrypt(ebayData.refresh_token);

const { error: updateError } = await supabase
  .from('users')
  .update({
    ebay_refresh_token: encryptedRefreshToken,
    ebay_user_id: ebayData.ebay_user_id || null,
    ebay_connected_at: new Date().toISOString(),
    ebay_connection_status: 'connected'
  })
  .eq('id', authUser.id);
```

- Retrieval: `netlify/functions/utils/user-ebay-client.js:58-77`
```javascript
async refreshToken() {
  const { data: tokenData, error: tokenError } = await supabase.rpc(
    'get_user_ebay_credentials',
    { user_uuid: this.userId }
  );

  if (!tokenData || !tokenData[0]?.refresh_token) {
    throw new Error('No refresh token found. User has not connected their eBay account.');
  }

  const refreshToken = tokenData[0].refresh_token;
  // ... exchange for access token
}
```

### 3. eBay OAuth Access Token

**Purpose**: Make authenticated calls to eBay APIs
**Lifetime**: 2 hours (7200 seconds)
**Storage**: In-memory only (instance variable in client class)
**Format**: `v^1.1|...` (eBay proprietary)
**Used By**: Backend → eBay REST/Trading APIs

**Lifecycle**:
```
Backend needs to call eBay API
                ↓
    Check if this.accessToken exists and is valid
                ↓
         If expired or missing:
                ↓
      Exchange refresh_token for access_token
                ↓
    Store in this.accessToken (in-memory only)
                ↓
  Use in Authorization: Bearer {access_token} header
                ↓
        Make eBay API call
```

**Code Location**:
- Exchange: `netlify/functions/utils/user-ebay-client.js:130-165`
```javascript
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
this.accessToken = data.access_token; // In-memory storage
```

- Usage: `netlify/functions/utils/user-ebay-client.js:182-213`
```javascript
async makeApiCall(endpoint, method = 'GET', data = null, apiType = 'trading') {
  if (!this.accessToken) {
    throw new Error('eBay client not initialized. Call initialize() first.');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${this.accessToken}`
  };

  const response = await fetch(url, { method, headers, body: data ? JSON.stringify(data) : undefined });
  return await response.json();
}
```

### 4. eBay App Credentials (App ID + Cert ID)

**Purpose**: Authenticate the application to eBay (not the user)
**Lifetime**: Permanent (until regenerated by user in eBay developer portal)
**Storage**:
  - `ebay_app_id`: Plain text in `users` table
  - `ebay_cert_id_encrypted`: AES-256-CBC encrypted in `users` table
**Format**:
  - App ID: `<username>-<appname>-<env>-<random>`
  - Cert ID: Random hex string
**Used By**: Backend → eBay OAuth token exchange (Basic Auth)

**Code Location**:
- Storage: `netlify/functions/save-ebay-credentials.js:45-59`
```javascript
const encryptedCertId = encrypt(ebay_cert_id);

const { error: updateError } = await supabase
  .from('users')
  .update({
    ebay_app_id: ebay_app_id,
    ebay_cert_id_encrypted: encryptedCertId,
    ebay_dev_id: ebay_dev_id || null
  })
  .eq('id', user.id);
```

- Retrieval: `netlify/functions/utils/user-ebay-client.js:79-128`
```javascript
const { data: appCreds, error: appError } = await supabase.rpc(
  'get_user_ebay_app_credentials',
  { user_uuid: this.userId }
);

if (appCreds && appCreds[0]?.ebay_app_id && appCreds[0]?.ebay_cert_id_encrypted) {
  clientId = appCreds[0].ebay_app_id;
  this.appId = clientId;

  const encrypted = appCreds[0].ebay_cert_id_encrypted;
  if (!/^[0-9a-f]+:[0-9a-f]+$/i.test(encrypted)) {
    throw new Error('Invalid credential encryption format');
  }

  clientSecret = decrypt(encrypted);
}
```

---

## Complete OAuth Flow

### Phase 1: OAuth Initiation (User clicks "Connect eBay Account")

**Frontend Component**: `frontend/src/components/EbayConnect.jsx:92-166`

```javascript
const handleConnect = async () => {
  setIsLoading(true)
  setError(null)

  const { supabase } = await import('../lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) {
    setError('Not authenticated')
    return
  }

  const response = await fetch('/.netlify/functions/ebay-oauth?action=initiate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    }
  })

  const data = await response.json()

  if (data.authUrl) {
    window.location.href = data.authUrl // Redirect to eBay
  }
}
```

**Backend Function**: `netlify/functions/ebay-oauth.js:341-470`

**Step-by-Step**:

1. **Validate Supabase JWT**:
```javascript
const token = authHeader.replace('Bearer ', '');
const { data: userData, error: authError } = await supabase.auth.getUser(token);
const authUser = userData?.user;
```

2. **Retrieve User's App Credentials**:
```javascript
const { data: userRecord, error: userError } = await supabase
  .from('users')
  .select('ebay_app_id, ebay_cert_id_encrypted')
  .eq('id', authUser.id)
  .single();

if (!userRecord.ebay_app_id || !userRecord.ebay_cert_id_encrypted) {
  return {
    statusCode: 400,
    body: JSON.stringify({
      error: 'eBay credentials not configured. Please add your credentials in Admin Settings.'
    })
  };
}
```

3. **Generate PKCE Code Challenge** (for security):
```javascript
const generateCodeChallenge = (verifier) => {
  return crypto.createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

const codeVerifier = crypto.randomBytes(32).toString('hex');
const codeChallenge = generateCodeChallenge(codeVerifier);
```

4. **Generate OAuth State** (CSRF protection):
```javascript
const state = crypto.randomBytes(16).toString('hex');

await supabase
  .from('oauth_states')
  .insert({
    state: state,
    user_id: authUser.id,
    code_verifier: codeVerifier,
    created_at: new Date().toISOString()
  });
```

5. **Build eBay Authorization URL**:
```javascript
const params = new URLSearchParams({
  client_id: appId,
  redirect_uri: redirectUri,
  response_type: 'code',
  state: state,
  scope: 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory',
  code_challenge: codeChallenge,
  code_challenge_method: 'S256'
});

const authUrl = `https://auth.ebay.com/oauth2/authorize?${params}`;
return {
  statusCode: 200,
  body: JSON.stringify({ authUrl })
};
```

**Flow Diagram**:
```
User clicks "Connect eBay"
         ↓
Frontend: GET Supabase session token
         ↓
Frontend: POST /.netlify/functions/ebay-oauth?action=initiate
         Authorization: Bearer {supabase_token}
         ↓
Backend: Validate Supabase JWT → Extract user.id
         ↓
Backend: Query users table → Get ebay_app_id, ebay_cert_id_encrypted
         ↓
Backend: Generate PKCE code_verifier + code_challenge
         ↓
Backend: Generate random state (CSRF token)
         ↓
Backend: Store state + code_verifier in oauth_states table
         ↓
Backend: Build eBay auth URL with:
         - client_id (app_id)
         - redirect_uri
         - state
         - code_challenge
         - scopes
         ↓
Backend: Return { authUrl: "https://auth.ebay.com/oauth2/authorize?..." }
         ↓
Frontend: window.location.href = authUrl (redirect to eBay)
         ↓
User authorizes app on eBay website
```

### Phase 2: OAuth Callback (eBay redirects back to app)

**URL**: `/.netlify/functions/ebay-oauth-callback?code=xxx&state=xxx`

**Backend Function**: `netlify/functions/ebay-oauth-callback.js`

**Step-by-Step**:

1. **Extract Query Parameters**:
```javascript
const code = event.queryStringParameters?.code;
const state = event.queryStringParameters?.state;

if (!code || !state) {
  return redirectToFrontend('/account?error=missing_parameters');
}
```

2. **Validate State (CSRF Protection)**:
```javascript
const { data: stateRecord, error: stateError } = await supabase
  .from('oauth_states')
  .select('*')
  .eq('state', state)
  .single();

if (stateError || !stateRecord) {
  return redirectToFrontend('/account?error=invalid_state');
}

const userId = stateRecord.user_id;
const codeVerifier = stateRecord.code_verifier;
```

3. **Retrieve User's App Credentials**:
```javascript
const { data: appCreds, error: appError } = await supabase.rpc(
  'get_user_ebay_app_credentials',
  { user_uuid: userId }
);

const clientId = appCreds[0].ebay_app_id;
const clientSecret = decrypt(appCreds[0].ebay_cert_id_encrypted);
```

4. **Exchange Authorization Code for Tokens** (with PKCE):
```javascript
const credentialsBase64 = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${credentialsBase64}`
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  })
});

const ebayData = await response.json();
// ebayData contains: access_token, refresh_token, expires_in
```

5. **Get eBay User ID** (optional but recommended):
```javascript
const userResponse = await fetch('https://apiz.ebay.com/commerce/identity/v1/user/', {
  headers: {
    'Authorization': `Bearer ${ebayData.access_token}`
  }
});

const ebayUserData = await userResponse.json();
const ebayUserId = ebayUserData.userId;
```

6. **Encrypt and Store Refresh Token**:
```javascript
const encryptedRefreshToken = encrypt(ebayData.refresh_token);

const { error: updateError } = await supabase
  .from('users')
  .update({
    ebay_refresh_token: encryptedRefreshToken,
    ebay_user_id: ebayUserId,
    ebay_connected_at: new Date().toISOString(),
    ebay_connection_status: 'connected'
  })
  .eq('id', userId);
```

7. **Clean Up OAuth State**:
```javascript
await supabase
  .from('oauth_states')
  .delete()
  .eq('state', state);
```

8. **Redirect to Frontend**:
```javascript
return redirectToFrontend('/account?ebay_connected=true');
```

**Flow Diagram**:
```
eBay redirects: /.netlify/functions/ebay-oauth-callback?code=xxx&state=xxx
         ↓
Backend: Extract code + state from query params
         ↓
Backend: Query oauth_states table WHERE state = {state}
         → Get user_id, code_verifier
         ↓
Backend: Validate state exists (CSRF check)
         ↓
Backend: Query users table → Get ebay_app_id, ebay_cert_id_encrypted
         ↓
Backend: Decrypt ebay_cert_id_encrypted → clientSecret
         ↓
Backend: POST https://api.ebay.com/identity/v1/oauth2/token
         Authorization: Basic base64(app_id:cert_id)
         Body: grant_type=authorization_code
               code={code}
               redirect_uri={redirect_uri}
               code_verifier={code_verifier}
         ↓
eBay returns: { access_token, refresh_token, expires_in }
         ↓
Backend: GET https://apiz.ebay.com/commerce/identity/v1/user/
         Authorization: Bearer {access_token}
         → Get ebay_user_id
         ↓
Backend: Encrypt refresh_token with AES-256-CBC
         ↓
Backend: UPDATE users SET
         ebay_refresh_token = {encrypted_refresh_token}
         ebay_user_id = {ebay_user_id}
         ebay_connected_at = NOW()
         ebay_connection_status = 'connected'
         WHERE id = {user_id}
         ↓
Backend: DELETE FROM oauth_states WHERE state = {state}
         ↓
Backend: Redirect to /account?ebay_connected=true
```

### Phase 3: Token Refresh (When making eBay API calls)

**Backend Class**: `netlify/functions/utils/user-ebay-client.js` → `UserEbayClient`

**When Triggered**:
- On client initialization: `await ebayClient.initialize()`
- Before every API call if token is expired

**Step-by-Step**:

1. **Initialize Client**:
```javascript
const ebayClient = new UserEbayClient(userId);
await ebayClient.initialize(); // Triggers token refresh
```

2. **Retrieve Refresh Token**:
```javascript
const { data: tokenData, error: tokenError } = await supabase.rpc(
  'get_user_ebay_credentials',
  { user_uuid: this.userId }
);

const refreshToken = tokenData[0].refresh_token; // Already decrypted by RPC
```

3. **Retrieve App Credentials**:
```javascript
const { data: appCreds, error: appError } = await supabase.rpc(
  'get_user_ebay_app_credentials',
  { user_uuid: this.userId }
);

const clientId = appCreds[0].ebay_app_id;
const clientSecret = decrypt(appCreds[0].ebay_cert_id_encrypted);
```

4. **Exchange Refresh Token for Access Token**:
```javascript
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
this.accessToken = data.access_token; // Store in memory (ephemeral)
```

**Flow Diagram**:
```
Backend function needs to call eBay API
         ↓
Initialize: new UserEbayClient(userId)
         ↓
Call: await ebayClient.initialize()
         ↓
RPC: get_user_ebay_credentials(user_uuid)
         → Returns: refresh_token (decrypted)
         ↓
RPC: get_user_ebay_app_credentials(user_uuid)
         → Returns: ebay_app_id, ebay_cert_id_encrypted
         ↓
Decrypt ebay_cert_id_encrypted → clientSecret
         ↓
POST https://api.ebay.com/identity/v1/oauth2/token
         Authorization: Basic base64(app_id:cert_id)
         Body: grant_type=refresh_token
               refresh_token={refresh_token}
         ↓
eBay returns: { access_token, expires_in: 7200 }
         ↓
Store in memory: this.accessToken = access_token
         ↓
Ready to make eBay API calls
```

---

## How Listings Page Accesses eBay API

### Complete Request Flow: Listings.jsx → Backend → eBay API

**Frontend Component**: `frontend/src/pages/Listings.jsx`

**Scenario**: User clicks "Sync from eBay" button

### Step 1: User Action

**Code**: `frontend/src/pages/Listings.jsx:202-241`

```javascript
const handleSyncFromEbay = async () => {
  setIsSyncing(true)
  setError(null)

  try {
    const { supabase } = await import('../lib/supabase')
    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.access_token) {
      throw new Error('Not authenticated')
    }

    console.log('🔄 Starting manual sync from eBay...')

    const response = await fetch('/.netlify/functions/trigger-sync', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`, // Supabase JWT
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Sync failed')
    }

    const result = await response.json()
    console.log('✅ Sync completed:', result)

    // Refresh listings display
    refetch()
  } catch (err) {
    console.error('Sync error:', err)
    setError(err.message)
  } finally {
    setIsSyncing(false)
  }
}
```

**Key Points**:
- Gets Supabase session from localStorage
- Extracts JWT access token
- Sends to `/.netlify/functions/trigger-sync` with `Authorization: Bearer {supabase_token}`
- **Does NOT send eBay credentials** - backend retrieves them from database

### Step 2: Backend Function Receives Request

**Function**: `netlify/functions/trigger-sync.js`

**Code**: Lines 1-92

```javascript
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

  let user = null; // Declare outside try for error handling

  try {
    // 1. Validate Supabase JWT
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    user = userData?.user;

    if (authError || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    console.log(`📥 Manual sync triggered for user: ${user.email}`);

    // 2. Initialize eBay client (this fetches and uses eBay credentials)
    const ebayClient = new UserEbayClient(user.id);
    await ebayClient.initialize(); // Triggers token refresh internally

    // 3. Fetch listings from eBay
    const listings = await ebayClient.getActiveListings();

    // 4. Sync to database
    const syncService = new SyncService(user.id);
    const syncResult = await syncService.syncListings(listings);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Sync completed successfully',
        ...syncResult
      })
    };

  } catch (error) {
    console.error('Sync failed:', error);
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

### Step 3: eBay Client Initialization

**Class**: `UserEbayClient` in `netlify/functions/utils/user-ebay-client.js`

**Code**: Lines 14-53

```javascript
class UserEbayClient {
  constructor(userId) {
    this.userId = userId;
    this.accessToken = null; // Will be set during initialize()
    this.ebayUserId = null;
    this.appId = null;
  }

  async initialize() {
    try {
      // 1. Get refresh token from database
      const { data, error } = await supabase.rpc('get_user_ebay_credentials', {
        user_uuid: this.userId
      });

      if (error) {
        throw new Error(`Failed to get eBay credentials: ${error.message}`);
      }

      if (!data || data.length === 0 || !data[0].refresh_token) {
        throw new Error('User has not connected their eBay account');
      }

      const credentials = data[0];
      this.ebayUserId = credentials.ebay_user_id;

      // 2. Exchange refresh token for access token
      const refreshResult = await this.refreshToken();
      if (!refreshResult) {
        throw new Error('Failed to obtain eBay access token');
      }

      return true;
    } catch (error) {
      console.error('Error initializing eBay client:', error);
      throw error;
    }
  }

  async refreshToken() {
    // (Detailed implementation in previous section)
    // Returns: Sets this.accessToken with 2-hour eBay access token
  }
}
```

### Step 4: Making eBay API Calls

**Method**: `UserEbayClient.getActiveListings()`

**Code**: Lines 237-252

```javascript
async getActiveListings(page = 1, limit = 50) {
  // Build eBay Trading API request
  const requestData = {
    RequesterCredentials: {
      eBayAuthToken: this.accessToken // Use the access token we just obtained
    },
    Pagination: {
      EntriesPerPage: limit,
      PageNumber: page
    },
    DetailLevel: 'ReturnAll',
    StartTimeFrom: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    StartTimeTo: new Date().toISOString()
  };

  return await this.makeApiCall('GetMyeBaySelling', 'POST', requestData, 'trading');
}

async makeApiCall(endpoint, method = 'GET', data = null, apiType = 'trading') {
  if (!this.accessToken) {
    throw new Error('eBay client not initialized. Call initialize() first.');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${this.accessToken}` // Use ephemeral access token
  };

  const response = await fetch(url, { method, headers, body: JSON.stringify(data) });
  return await response.json();
}
```

### Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         LISTINGS PAGE                               │
│  User clicks "Sync from eBay"                                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ 1. Get Supabase session
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     FRONTEND (Listings.jsx:202)                     │
│  const { data: { session } } = await supabase.auth.getSession()    │
│  const token = session.access_token // Supabase JWT                │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ 2. POST with Authorization header
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 HTTP REQUEST to Backend                             │
│  POST /.netlify/functions/trigger-sync                              │
│  Authorization: Bearer {supabase_jwt}                               │
│  Content-Type: application/json                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ 3. Validate JWT
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│              BACKEND (trigger-sync.js:25-36)                        │
│  const token = authHeader.replace('Bearer ', '')                    │
│  const { data: userData } = await supabase.auth.getUser(token)     │
│  const user = userData?.user // Extract user.id                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ 4. Initialize eBay client
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│         BACKEND (user-ebay-client.js:15-25)                         │
│  const ebayClient = new UserEbayClient(user.id)                     │
│  await ebayClient.initialize()                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ 5. Get refresh token from DB
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                DATABASE (Supabase RPC)                              │
│  SELECT * FROM get_user_ebay_credentials('user-uuid')               │
│  Returns: { refresh_token, ebay_user_id }                           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ 6. Get app credentials
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                DATABASE (Supabase RPC)                              │
│  SELECT * FROM get_user_ebay_app_credentials('user-uuid')           │
│  Returns: { ebay_app_id, ebay_cert_id_encrypted }                   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ 7. Decrypt cert_id
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│         BACKEND (user-ebay-client.js:108-113)                       │
│  const clientSecret = decrypt(ebay_cert_id_encrypted)               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ 8. Exchange for access token
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   EBAY OAUTH API                                    │
│  POST https://api.ebay.com/identity/v1/oauth2/token                 │
│  Authorization: Basic base64(app_id:cert_id)                        │
│  Body: grant_type=refresh_token&refresh_token=...                   │
│  Returns: { access_token, expires_in: 7200 }                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ 9. Store access token in memory
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│         BACKEND (user-ebay-client.js:163)                           │
│  this.accessToken = data.access_token // Ephemeral, 2 hours        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ 10. Make eBay API call
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│              EBAY TRADING API                                       │
│  POST https://api.ebay.com/ws/api.dll                               │
│  Authorization: Bearer {access_token}                               │
│  X-EBAY-API-CALL-NAME: GetMyeBaySelling                             │
│  Body: { RequesterCredentials, Pagination, ... }                    │
│  Returns: { Listings: [...] }                                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ 11. Return listings to frontend
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                BACKEND (trigger-sync.js:55-64)                      │
│  return {                                                           │
│    statusCode: 200,                                                 │
│    body: JSON.stringify({ listings, syncResult })                   │
│  }                                                                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ 12. Display listings
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  FRONTEND (Listings.jsx:238)                        │
│  refetch() // Re-fetch listings from database                       │
│  Display updated listings in UI                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Takeaways

1. **Two Authentication Layers**:
   - Frontend uses **Supabase JWT** to authenticate to backend functions
   - Backend uses **eBay refresh token** to get access tokens for eBay API

2. **Token Flow**:
   - Frontend: `Supabase JWT` → Backend
   - Backend: `eBay Refresh Token` (from DB) → eBay OAuth API → `eBay Access Token`
   - Backend: `eBay Access Token` → eBay Trading/Inventory API

3. **Security**:
   - Frontend never sees eBay credentials
   - eBay refresh tokens stored encrypted in database
   - eBay access tokens ephemeral (in-memory only)
   - Supabase JWT validates user identity

4. **Per-User Credentials**:
   - Each user has their own eBay App ID and Cert ID
   - Backend retrieves user-specific credentials from database
   - Allows multi-tenant architecture with user-owned eBay apps

---

## Database Schema and Security

### Users Table

**Columns Related to eBay**:

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text UNIQUE NOT NULL,

  -- eBay App Credentials (per-user)
  ebay_app_id text,                    -- eBay App ID (plain text)
  ebay_cert_id_encrypted text,         -- eBay Cert ID (AES-256-CBC encrypted)
  ebay_dev_id text,                    -- eBay Dev ID (optional)

  -- eBay OAuth Tokens
  ebay_refresh_token text,             -- Refresh token (AES-256-CBC encrypted)
  ebay_user_id text,                   -- eBay's user ID

  -- Connection Status
  ebay_connection_status text DEFAULT 'disconnected', -- 'connected' | 'disconnected'
  ebay_connected_at timestamptz,       -- When user connected eBay account

  -- Timestamps
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);
```

**Row Level Security (RLS)**:

```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can only read their own record
CREATE POLICY "Users can view own record"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- Users can only update their own record
CREATE POLICY "Users can update own record"
  ON users FOR UPDATE
  USING (auth.uid() = id);
```

### OAuth States Table

**Purpose**: Store OAuth state and PKCE code_verifier during OAuth flow

```sql
CREATE TABLE oauth_states (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  state text UNIQUE NOT NULL,          -- CSRF token
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  code_verifier text NOT NULL,         -- PKCE code verifier
  created_at timestamptz DEFAULT NOW()
);

-- Clean up expired states (older than 10 minutes)
CREATE INDEX idx_oauth_states_created_at ON oauth_states(created_at);
```

**RLS**:

```sql
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage oauth_states"
  ON oauth_states FOR ALL
  USING (auth.role() = 'service_role');
```

### RPC Functions

#### 1. get_user_ebay_credentials

**Purpose**: Securely retrieve user's eBay refresh token (decrypted)

**Code**:
```sql
CREATE OR REPLACE FUNCTION get_user_ebay_credentials(user_uuid uuid)
RETURNS TABLE (
  refresh_token text,
  ebay_user_id text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    decrypt_ebay_token(ebay_refresh_token) AS refresh_token,
    users.ebay_user_id
  FROM users
  WHERE id = user_uuid;
END;
$$;
```

**Security**:
- `SECURITY DEFINER`: Runs with function creator's privileges (bypasses RLS)
- Only accessible to service role (backend functions)
- Decrypts refresh token before returning

#### 2. get_user_ebay_app_credentials

**Purpose**: Retrieve user's eBay App ID and encrypted Cert ID

**Code**:
```sql
CREATE OR REPLACE FUNCTION get_user_ebay_app_credentials(user_uuid uuid)
RETURNS TABLE (
  ebay_app_id text,
  ebay_cert_id_encrypted text
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    users.ebay_app_id,
    users.ebay_cert_id_encrypted
  FROM users
  WHERE id = user_uuid;
END;
$$;
```

**Note**: Cert ID returned **encrypted** - backend must decrypt it

#### 3. decrypt_ebay_token (Internal Function)

**Purpose**: Decrypt tokens using database-stored encryption key

**Code**:
```sql
CREATE OR REPLACE FUNCTION decrypt_ebay_token(encrypted_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  encryption_key text;
  iv_hex text;
  ciphertext_hex text;
  decrypted_token text;
BEGIN
  -- Get encryption key from Supabase vault or environment
  encryption_key := current_setting('app.settings.encryption_key', true);

  -- Parse encrypted token format: iv:ciphertext
  iv_hex := split_part(encrypted_token, ':', 1);
  ciphertext_hex := split_part(encrypted_token, ':', 2);

  -- Decrypt using pgcrypto
  decrypted_token := convert_from(
    decrypt_iv(
      decode(ciphertext_hex, 'hex'),
      decode(encryption_key, 'hex'),
      decode(iv_hex, 'hex'),
      'aes-cbc'
    ),
    'utf8'
  );

  RETURN decrypted_token;
END;
$$;
```

**Security**:
- Encryption key stored in Supabase secrets (not in code)
- Uses PostgreSQL's `pgcrypto` extension
- AES-256-CBC algorithm

---

## Encryption Implementation

### Overview

**Algorithm**: AES-256-CBC (Advanced Encryption Standard, 256-bit key, Cipher Block Chaining)

**What's Encrypted**:
- eBay refresh tokens (`users.ebay_refresh_token`)
- eBay Cert IDs (`users.ebay_cert_id_encrypted`)

**Encryption Key**:
- 64-character hex string (32 bytes = 256 bits)
- Stored in Netlify environment variable: `ENCRYPTION_KEY`
- Generated once with: `openssl rand -hex 32`

**Format**: `{iv}:{ciphertext}` (both hex-encoded)

### Encryption Code

**File**: `netlify/functions/ebay-oauth.js:8-28`

```javascript
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 64-char hex string
const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32; // 256 bits / 8
const IV_LENGTH = 16;  // 128 bits / 8

/**
 * Encrypt sensitive data (refresh tokens, cert IDs)
 */
function encrypt(text) {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string');
  }

  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH); // Random IV for each encryption

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Return format: iv:ciphertext (both hex-encoded)
  return iv.toString('hex') + ':' + encrypted;
}
```

**Key Points**:
- **Random IV**: Each encryption generates a new Initialization Vector (prevents pattern detection)
- **Hex Encoding**: Both IV and ciphertext are hex-encoded for storage
- **Format**: `{iv}:{ciphertext}` allows decryption to extract IV and ciphertext

### Decryption Code

**File**: `netlify/functions/ebay-oauth.js:30-45`

```javascript
/**
 * Decrypt sensitive data
 */
function decrypt(encryptedText) {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string');
  }

  const key = Buffer.from(ENCRYPTION_KEY, 'hex');

  // Parse format: iv:ciphertext
  const parts = encryptedText.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted text format. Expected iv:ciphertext');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const ciphertext = Buffer.from(parts[1], 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(ciphertext, undefined, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = { encrypt, decrypt };
```

**Key Points**:
- **Parse Format**: Splits on `:` to extract IV and ciphertext
- **Validation**: Throws error if format is invalid
- **UTF-8 Output**: Returns decrypted text as UTF-8 string

### Usage Examples

**Encrypting on Storage**:

```javascript
// When saving eBay credentials
const { ebay_cert_id } = req.body;
const encryptedCertId = encrypt(ebay_cert_id);

await supabase
  .from('users')
  .update({ ebay_cert_id_encrypted: encryptedCertId })
  .eq('id', user.id);
```

**Decrypting on Retrieval**:

```javascript
// When using credentials for eBay API calls
const { data } = await supabase.rpc('get_user_ebay_app_credentials', { user_uuid: userId });

const clientId = data[0].ebay_app_id; // Plain text
const clientSecret = decrypt(data[0].ebay_cert_id_encrypted); // Decrypt in memory

// Use for API call
const credentialsBase64 = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
```

### Security Best Practices

1. **Key Rotation**: Periodically rotate `ENCRYPTION_KEY` and re-encrypt all data
2. **Key Storage**: Never commit `ENCRYPTION_KEY` to git - store in Netlify secrets
3. **Random IVs**: Always generate new IV for each encryption (prevents pattern attacks)
4. **Hex Encoding**: Use hex (not base64) for consistent format
5. **Error Handling**: Validate format before decryption to prevent crashes

---

## File-by-File Analysis

### Frontend Files

#### 1. `frontend/src/pages/Listings.jsx`

**Purpose**: Display eBay listings and trigger sync

**Key Functions**:

**handleSyncFromEbay** (Lines 202-241):
```javascript
const handleSyncFromEbay = async () => {
  // 1. Get Supabase session
  const { supabase } = await import('../lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()

  // 2. Send Supabase JWT to backend
  const response = await fetch('/.netlify/functions/trigger-sync', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    }
  })

  // 3. Refresh listings display
  refetch()
}
```

**Token Usage**:
- Uses **Supabase JWT** (`session.access_token`)
- Does NOT send eBay credentials
- Backend retrieves eBay credentials from database

**Authentication Flow**:
1. Get Supabase session from localStorage
2. Extract JWT access token
3. Send to backend in `Authorization` header
4. Backend validates JWT and retrieves user.id

#### 2. `frontend/src/lib/supabase.js`

**Purpose**: Initialize Supabase client and manage authentication

**Key Code** (Lines 1-25):
```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: 'ebay-price-reducer-auth',
    storage: window.localStorage
  }
})

console.log('🔌 Supabase client initialized:', {
  url: supabaseUrl,
  hasAnonKey: !!supabaseAnonKey
})
```

**getAuthToken** (Lines 583-586):
```javascript
export const getAuthToken = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}
```

**Token Storage**:
- Supabase JWT stored in `localStorage` under key `ebay-price-reducer-auth`
- Persists across browser sessions
- Automatically refreshed by Supabase client when expired

#### 3. `frontend/src/components/EbayConnect.jsx`

**Purpose**: UI component for connecting/disconnecting eBay account

**Key Functions**:

**handleConnect** (Lines 92-166):
```javascript
const handleConnect = async () => {
  const { supabase } = await import('../lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.access_token) {
    setError('Not authenticated')
    return
  }

  // Initiate OAuth flow
  const response = await fetch('/.netlify/functions/ebay-oauth?action=initiate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    }
  })

  const data = await response.json()

  if (data.authUrl) {
    window.location.href = data.authUrl // Redirect to eBay
  }
}
```

**handleDisconnect** (Lines 148-166):
```javascript
const handleDisconnect = async () => {
  const { supabase } = await import('../lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()

  const response = await fetch('/.netlify/functions/ebay-oauth?action=disconnect', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    }
  })

  if (response.ok) {
    refetch() // Refresh connection status
  }
}
```

**Token Usage**:
- Uses Supabase JWT for all backend calls
- Backend handles OAuth redirect URLs
- Frontend only manages UI state

### Backend Files

#### 4. `netlify/functions/ebay-oauth.js`

**Purpose**: Handle OAuth flow (initiate, callback, disconnect, status, refresh)

**Actions**:
- `action=initiate`: Start OAuth flow (Lines 341-470)
- `action=callback`: Handle OAuth callback (deprecated - use ebay-oauth-callback.js)
- `action=disconnect`: Disconnect eBay account (Lines 812-887)
- `action=status`: Check connection status (Lines 708-810)
- `action=refresh`: Manually refresh token (Lines 889-950)

**Key Code - Disconnect** (Lines 838-864):
```javascript
// Clear OAuth tokens but keep app credentials
const updateResult = await supabaseRequest(
  `users?id=eq.${authUser.id}&select=*`,
  'PATCH',
  {
    ebay_refresh_token: null,
    ebay_user_id: null,
    ebay_connection_status: 'disconnected',
    ebay_connected_at: null
    // Keep: ebay_app_id, ebay_cert_id_encrypted, ebay_dev_id
  },
  {
    'Prefer': 'return=representation'
  },
  true // Use service role key
);

// Verify disconnect succeeded
if (!updateResult || updateResult.length === 0) {
  throw new Error('Failed to verify disconnect');
}

const updatedUser = updateResult[0];
if (updatedUser.ebay_refresh_token !== null) {
  throw new Error('Disconnect verification failed: token still present');
}
```

**Important Notes**:
- **FIXED BUG**: Previously referenced non-existent columns (`ebay_token_expires_at`, `ebay_refresh_token_expires_at`)
- Now only updates existing columns
- Preserves app credentials (app_id, cert_id) for easy reconnection

#### 5. `netlify/functions/ebay-oauth-callback.js`

**Purpose**: Handle OAuth callback from eBay

**Flow** (Lines 1-384):

1. **Extract Parameters** (Lines 100-112):
```javascript
const code = event.queryStringParameters?.code;
const state = event.queryStringParameters?.state;

if (!code || !state) {
  return redirectToFrontend('/account?error=missing_parameters');
}
```

2. **Validate State** (Lines 114-132):
```javascript
const { data: stateRecord, error: stateError } = await supabase
  .from('oauth_states')
  .select('*')
  .eq('state', state)
  .single();

if (stateError || !stateRecord) {
  return redirectToFrontend('/account?error=invalid_state');
}

const userId = stateRecord.user_id;
const codeVerifier = stateRecord.code_verifier;
```

3. **Get App Credentials** (Lines 134-163):
```javascript
const { data: appCreds, error: appError } = await supabase.rpc(
  'get_user_ebay_app_credentials',
  { user_uuid: userId }
);

if (!appCreds || !appCreds[0]?.ebay_app_id || !appCreds[0]?.ebay_cert_id_encrypted) {
  return redirectToFrontend('/account?error=missing_credentials');
}

const clientId = appCreds[0].ebay_app_id;

// Validate and decrypt cert_id
const encrypted = appCreds[0].ebay_cert_id_encrypted;
if (!/^[0-9a-f]+:[0-9a-f]+$/i.test(encrypted)) {
  throw new Error('Invalid credential encryption format');
}

const clientSecret = decrypt(encrypted);
```

4. **Exchange Code for Tokens** (Lines 165-202):
```javascript
const credentialsBase64 = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${credentialsBase64}`
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier // PKCE
  })
});

const ebayData = await response.json();
// ebayData: { access_token, refresh_token, expires_in }
```

5. **Get eBay User ID** (Lines 204-228):
```javascript
const userResponse = await fetch('https://apiz.ebay.com/commerce/identity/v1/user/', {
  headers: {
    'Authorization': `Bearer ${ebayData.access_token}`
  }
});

const ebayUserData = await userResponse.json();
const ebayUserId = ebayUserData.userId;
```

6. **Store Refresh Token** (Lines 230-318):
```javascript
const encryptedRefreshToken = encrypt(ebayData.refresh_token);

const { error: updateError } = await supabase
  .from('users')
  .update({
    ebay_refresh_token: encryptedRefreshToken,
    ebay_user_id: ebayUserId,
    ebay_connected_at: new Date().toISOString(),
    ebay_connection_status: 'connected'
  })
  .eq('id', userId);
```

7. **Clean Up** (Lines 320-330):
```javascript
await supabase
  .from('oauth_states')
  .delete()
  .eq('state', state);

return redirectToFrontend('/account?ebay_connected=true');
```

#### 6. `netlify/functions/save-ebay-credentials.js`

**Purpose**: Save user's eBay App ID, Cert ID, Dev ID

**Flow** (Lines 1-89):

1. **Validate Input** (Lines 37-43):
```javascript
const { ebay_app_id, ebay_cert_id, ebay_dev_id } = JSON.parse(event.body);

if (!ebay_app_id || !ebay_cert_id) {
  return {
    statusCode: 400,
    body: JSON.stringify({ error: 'ebay_app_id and ebay_cert_id are required' })
  };
}
```

2. **Encrypt Cert ID** (Lines 45-46):
```javascript
const encryptedCertId = encrypt(ebay_cert_id);
```

3. **Save to Database** (Lines 48-59):
```javascript
const { error: updateError } = await supabase
  .from('users')
  .update({
    ebay_app_id: ebay_app_id,
    ebay_cert_id_encrypted: encryptedCertId,
    ebay_dev_id: ebay_dev_id || null
  })
  .eq('id', user.id);
```

**Security**:
- Cert ID encrypted before storage
- App ID stored plain text (not sensitive)
- Dev ID optional (rarely used)

#### 7. `netlify/functions/trigger-sync.js`

**Purpose**: Manually trigger eBay listing sync

**Flow** (Lines 1-92):

1. **Validate JWT** (Lines 25-44):
```javascript
const authHeader = event.headers.authorization || event.headers.Authorization;
if (!authHeader?.startsWith('Bearer ')) {
  return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
}

const token = authHeader.replace('Bearer ', '');
const { data: userData, error: authError } = await supabase.auth.getUser(token);
user = userData?.user;
```

2. **Initialize eBay Client** (Lines 48-50):
```javascript
const ebayClient = new UserEbayClient(user.id);
await ebayClient.initialize(); // Triggers token refresh
```

3. **Fetch Listings** (Lines 52-54):
```javascript
const listings = await ebayClient.getActiveListings();
```

4. **Sync to Database** (Lines 56-58):
```javascript
const syncService = new SyncService(user.id);
const syncResult = await syncService.syncListings(listings);
```

**Error Handling** (Lines 68-80):
```javascript
catch (error) {
  console.error('Sync failed:', error);
  return {
    statusCode: 500,
    headers,
    body: JSON.stringify({
      error: 'Sync failed',
      message: error.message
    })
  };
}
```

#### 8. `netlify/functions/utils/user-ebay-client.js`

**Purpose**: eBay API client with user-specific credentials

**Class**: `UserEbayClient`

**Constructor** (Lines 14-20):
```javascript
constructor(userId) {
  this.userId = userId;
  this.accessToken = null; // Ephemeral, set during initialize()
  this.ebayUserId = null;
  this.appId = null; // Store user's App ID for API calls
}
```

**initialize()** (Lines 22-53):
```javascript
async initialize() {
  // 1. Get refresh token
  const { data, error } = await supabase.rpc('get_user_ebay_credentials', {
    user_uuid: this.userId
  });

  if (!data || !data[0]?.refresh_token) {
    throw new Error('User has not connected their eBay account');
  }

  this.ebayUserId = data[0].ebay_user_id;

  // 2. Exchange for access token
  const refreshResult = await this.refreshToken();
  if (!refreshResult) {
    throw new Error('Failed to obtain eBay access token');
  }

  return true;
}
```

**refreshToken()** (Lines 55-177):
```javascript
async refreshToken() {
  // 1. Get refresh token
  const { data: tokenData } = await supabase.rpc('get_user_ebay_credentials', { user_uuid: this.userId });
  const refreshToken = tokenData[0].refresh_token;

  // 2. Get app credentials
  const { data: appCreds } = await supabase.rpc('get_user_ebay_app_credentials', { user_uuid: this.userId });

  let clientId, clientSecret;

  if (appCreds && appCreds[0]?.ebay_app_id && appCreds[0]?.ebay_cert_id_encrypted) {
    // User has custom credentials
    clientId = appCreds[0].ebay_app_id;
    this.appId = clientId;

    const encrypted = appCreds[0].ebay_cert_id_encrypted;

    // Validate format: hex:hex
    if (!/^[0-9a-f]+:[0-9a-f]+$/i.test(encrypted)) {
      throw new Error('Invalid credential encryption format');
    }

    clientSecret = decrypt(encrypted);
  } else {
    // Fall back to environment variables
    clientId = process.env.EBAY_APP_ID;
    clientSecret = process.env.EBAY_CERT_ID;
    this.appId = clientId;
  }

  // 3. Exchange for access token
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
  this.accessToken = data.access_token; // Store in memory

  return true;
}
```

**makeApiCall()** (Lines 179-232):
```javascript
async makeApiCall(endpoint, method = 'GET', data = null, apiType = 'trading') {
  if (!this.accessToken) {
    throw new Error('eBay client not initialized. Call initialize() first.');
  }

  const baseUrls = {
    trading: 'https://api.ebay.com/ws/api.dll',
    finding: 'https://svcs.ebay.com/services/search/FindingService/v1',
    sell: 'https://api.ebay.com/sell'
  };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${this.accessToken}`
  };

  // Add API-specific headers
  if (apiType === 'trading') {
    headers['X-EBAY-API-SITEID'] = '0';
    headers['X-EBAY-API-COMPATIBILITY-LEVEL'] = '967';
    headers['X-EBAY-API-CALL-NAME'] = endpoint;
  }

  const url = apiType === 'trading' ? baseUrls.trading : `${baseUrls[apiType]}${endpoint}`;

  const response = await fetch(url, { method, headers, body: data ? JSON.stringify(data) : undefined });
  return await response.json();
}
```

**API Methods**:
- `getActiveListings()` (Lines 234-252): Get user's active eBay listings
- `getItemDetails()` (Lines 254-267): Get specific item details
- `updateItemPrice()` (Lines 269-284): Update item price
- `endListing()` (Lines 286-299): End a listing
- `searchSimilarItems()` (Lines 301-342): Search for similar items

**IMPORTANT FIX** (Lines 303-318):
```javascript
async searchSimilarItems(keywords, category = null, maxResults = 10) {
  // Use user's App ID if available, otherwise fall back to environment variable
  const appId = this.appId || process.env.EBAY_APP_ID;

  if (!appId) {
    throw new Error('eBay App ID not configured');
  }

  const params = new URLSearchParams({
    'OPERATION-NAME': 'findItemsAdvanced',
    'SERVICE-VERSION': '1.0.0',
    'SECURITY-APPNAME': appId, // Now uses instance variable
    'RESPONSE-DATA-FORMAT': 'JSON',
    'keywords': keywords,
    ...
  });
}
```

**Previous Bug**: Hardcoded `process.env.EBAY_APP_ID` in `searchSimilarItems()`
**Fix**: Now uses `this.appId` (set during `refreshToken()`)

#### 9. `netlify/functions/utils/enhanced-ebay-client.js`

**Purpose**: Alternative eBay API client with additional features

**Similar to UserEbayClient, but with enhancements**:
- More detailed logging
- Better error handling
- Support for additional eBay APIs

**Key Difference**: Debugging logs added during troubleshooting

**Lines 134-135** (Debugging logs):
```javascript
console.log('→ Using App ID:', clientId ? `${clientId.substring(0, 10)}...` : 'MISSING');
console.log('→ Cert ID length:', clientSecret ? clientSecret.length : 'MISSING');
```

#### 10. `netlify/functions/utils/ebay-oauth-helpers.js`

**Purpose**: Shared OAuth helper functions

**Exports**:
- `encrypt(text)`: Encrypt sensitive data
- `decrypt(encryptedText)`: Decrypt sensitive data
- `generateCodeChallenge(verifier)`: Generate PKCE code challenge
- `generateState()`: Generate random OAuth state

**Code**: Same as `ebay-oauth.js:8-58`

### Development/Diagnostic Files

#### 11. `netlify/functions-dev/check-credentials.js`

**Purpose**: Diagnostic tool to check user's credential status

**Returned Diagnosis**:
```javascript
{
  hasAppId: true,
  hasCertId: true,
  hasRefreshToken: true,
  connectionStatus: 'connected',
  connectedAt: '2025-10-02T12:34:56Z',
  appIdPreview: 'username-a...',
  certIdFormat: 'VALID_HEX', // or 'NEEDS_MIGRATION' or 'INVALID_FORMAT'
  certIdLength: 67,
  issues: ['Encryption format is valid.'],
  canSync: true
}
```

**Usage**: `POST /.netlify/functions-dev/check-credentials` with Supabase JWT

#### 12. `netlify/functions-dev/force-disconnect.js`

**Purpose**: Force-disconnect when normal disconnect fails

**Functionality**:
- Clears OAuth tokens
- Keeps app credentials (for easy reconnection)
- Bypasses validation checks

**Usage**: `POST /.netlify/functions-dev/force-disconnect` with Supabase JWT

---

## Security Features

### 1. Multi-Layer Authentication

**Layer 1: Supabase JWT Authentication**
- Frontend authenticates with Supabase
- Receives JWT access token (1-hour lifetime)
- JWT used to authenticate to backend functions
- Backend validates JWT with Supabase

**Layer 2: eBay OAuth 2.0 with PKCE**
- User connects eBay account via OAuth
- PKCE prevents authorization code interception
- State parameter prevents CSRF attacks
- Refresh token stored encrypted in database

### 2. Encryption at Rest

**What's Encrypted**:
- eBay refresh tokens
- eBay Cert IDs

**Algorithm**: AES-256-CBC
- 256-bit key (64-char hex string)
- Random IV for each encryption
- Format: `{iv}:{ciphertext}` (hex-encoded)

**Key Storage**:
- Netlify environment variable: `ENCRYPTION_KEY`
- Not committed to git
- Generated once with: `openssl rand -hex 32`

### 3. CSRF Protection

**OAuth State Parameter**:
- Random 32-byte hex string
- Stored in `oauth_states` table with user_id
- Validated on OAuth callback
- Prevents CSRF attacks on OAuth flow

**Cleanup**:
- States deleted after successful OAuth callback
- Should expire states older than 10 minutes (not implemented yet)

### 4. PKCE (Proof Key for Code Exchange)

**Why**: Prevents authorization code interception attacks

**Flow**:
1. Generate random `code_verifier` (64-char hex)
2. Compute `code_challenge = SHA256(code_verifier)` (base64url)
3. Send `code_challenge` to eBay in authorize URL
4. Store `code_verifier` in `oauth_states` table
5. On callback, send `code_verifier` to eBay with authorization code
6. eBay validates: `SHA256(code_verifier) == code_challenge`

### 5. Row Level Security (RLS)

**Supabase Tables**:
- All tables have RLS enabled
- Users can only access their own records
- Backend uses `SECURITY DEFINER` RPC functions to bypass RLS
- Service role key used for privileged operations

### 6. CORS Restrictions

**Allowed Origins**:
- Production: `https://dainty-horse-49c336.netlify.app`
- Local dev: `http://localhost:8888`

**Headers**:
```javascript
'Access-Control-Allow-Origin': '*', // Should be restricted to allowed origins
'Access-Control-Allow-Headers': 'Content-Type, Authorization',
'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
```

**TODO**: Restrict `Access-Control-Allow-Origin` to specific origins (not `*`)

### 7. Input Validation

**OAuth Callback**:
- Validates presence of `code` and `state`
- Validates state exists in database
- Validates user has configured credentials

**Credential Encryption Format**:
```javascript
if (!/^[0-9a-f]+:[0-9a-f]+$/i.test(encrypted)) {
  throw new Error('Invalid credential encryption format');
}
```

**NEEDS_MIGRATION Check**:
```javascript
if (encrypted.startsWith('NEEDS_MIGRATION:')) {
  throw new Error('Credentials need migration. Please disconnect and reconnect.');
}
```

### 8. Ephemeral Access Tokens

**eBay Access Tokens**:
- Never persisted to database
- Stored in memory only (instance variable)
- 2-hour lifetime
- Discarded after function execution

**Why**: Minimizes exposure if database is compromised

### 9. Logging and Monitoring

**API Call Logging**:
- All eBay API calls logged with:
  - Timestamp
  - User ID
  - Endpoint
  - Status code
  - Response time
  - Error message (if any)

**Security Event Logging**:
- OAuth flow initiation
- OAuth callback success/failure
- Token refresh success/failure
- Disconnect events

---

## Error Handling and Edge Cases

### Common Errors

#### 1. "User has not connected their eBay account"

**Cause**: User has not completed OAuth flow
**Where**: `user-ebay-client.js:36`
**Fix**: User needs to click "Connect eBay Account" and complete OAuth

#### 2. "eBay API error (401): client authentication failed"

**Cause**: Invalid App ID or Cert ID
**Where**: `user-ebay-client.js:159`
**Possible Reasons**:
- Credentials still have `NEEDS_MIGRATION:` prefix
- Cert ID not properly encrypted (invalid format)
- App ID or Cert ID incorrect (typo)
- eBay credentials expired or revoked

**Debug Steps**:
1. Call `/.netlify/functions-dev/check-credentials` to diagnose
2. Check Netlify function logs for debugging output
3. Disconnect and reconnect eBay account with fresh credentials

#### 3. "Invalid credential encryption format"

**Cause**: Encrypted Cert ID doesn't match `hex:hex` format
**Where**: `user-ebay-client.js:102-106`
**Fix**: User needs to disconnect and reconnect eBay account (re-encrypt credentials)

#### 4. "Failed to disconnect eBay account"

**Cause**: Database columns don't exist
**Where**: `ebay-oauth.js:850-864`
**Fix**: Updated disconnect function to only reference existing columns (FIXED)

#### 5. "Invalid state"

**Cause**: OAuth state not found in database or expired
**Where**: `ebay-oauth-callback.js:120-132`
**Possible Reasons**:
- User took too long to complete OAuth flow
- State was already used (replay attack)
- State was manually deleted from database

**Fix**: User needs to restart OAuth flow from beginning

### Edge Cases

#### 1. Refresh Token Expired (18 months)

**Detection**: eBay returns 401 error on token refresh
**Handling**: Not implemented yet
**Recommended Fix**:
```javascript
if (response.status === 401) {
  // Mark user as disconnected
  await supabase
    .from('users')
    .update({
      ebay_connection_status: 'expired',
      ebay_refresh_token: null
    })
    .eq('id', userId);

  throw new Error('eBay connection expired. Please reconnect your account.');
}
```

#### 2. Concurrent Token Refresh

**Problem**: Multiple backend functions call `refreshToken()` simultaneously
**Risk**: Race condition, eBay may reject concurrent requests
**Mitigation**: eBay reissues refresh token on each use, so last one wins
**Recommended Fix**: Implement token caching with expiration

#### 3. User Deletes eBay App

**Detection**: eBay returns 401 error on token refresh
**Handling**: Same as expired token
**User Action**: User needs to create new eBay app and update credentials

#### 4. Encryption Key Rotation

**Problem**: Changing `ENCRYPTION_KEY` breaks all existing encrypted data
**Solution**: Implement migration:
```javascript
// 1. Add new environment variable: ENCRYPTION_KEY_NEW
// 2. Decrypt all tokens with old key
// 3. Re-encrypt with new key
// 4. Update database
// 5. Replace ENCRYPTION_KEY with ENCRYPTION_KEY_NEW
```

#### 5. OAuth State Cleanup

**Problem**: `oauth_states` table grows indefinitely
**Solution**: Implement cleanup job:
```sql
DELETE FROM oauth_states
WHERE created_at < NOW() - INTERVAL '10 minutes';
```

**Recommended**: Add to scheduled function or database trigger

---

## Common Issues and Troubleshooting

### Issue 1: 401 "client authentication failed"

**Symptoms**:
- Sync fails with 401 error
- Error message: "eBay API error (401): client authentication failed"

**Diagnosis**:
1. Call `/.netlify/functions-dev/check-credentials`
2. Check for:
   - `certIdFormat: 'NEEDS_MIGRATION'`
   - `certIdFormat: 'INVALID_FORMAT'`
   - `hasAppId: false`
   - `hasCertId: false`

**Solutions**:

**If credentials have NEEDS_MIGRATION**:
```javascript
// 1. Force disconnect
POST /.netlify/functions-dev/force-disconnect
Authorization: Bearer {supabase_token}

// 2. Reconnect eBay account
// (Goes through OAuth flow, re-encrypts credentials)
```

**If credentials have invalid format**:
```sql
-- Run SQL to check format
SELECT
  id,
  ebay_app_id,
  ebay_cert_id_encrypted,
  LENGTH(ebay_cert_id_encrypted) as cert_length,
  POSITION(':' IN ebay_cert_id_encrypted) as colon_pos
FROM users
WHERE id = '{user_uuid}';

-- Should return:
-- - cert_length: 67 (32 bytes IV + 1 colon + 32 bytes ciphertext = 67 chars)
-- - colon_pos: 33 (IV is 32 chars, colon at position 33)
```

**If missing credentials**:
- User needs to configure credentials in Admin Settings
- Then complete OAuth flow

### Issue 2: "User has not connected their eBay account"

**Symptoms**:
- Sync fails immediately
- Error message: "User has not connected their eBay account"

**Diagnosis**:
```sql
SELECT
  ebay_connection_status,
  ebay_refresh_token IS NOT NULL as has_refresh_token,
  ebay_connected_at
FROM users
WHERE id = '{user_uuid}';
```

**Expected**:
- `ebay_connection_status: 'connected'`
- `has_refresh_token: true`
- `ebay_connected_at: <timestamp>`

**Solution**:
- User needs to click "Connect eBay Account"
- Complete OAuth flow

### Issue 3: OAuth flow doesn't complete

**Symptoms**:
- User redirected to eBay, authorizes app
- Redirected back to app, but not connected
- Error: "invalid_state" or "missing_parameters"

**Diagnosis**:
1. Check Netlify function logs for `ebay-oauth-callback`
2. Check `oauth_states` table:
```sql
SELECT * FROM oauth_states WHERE user_id = '{user_uuid}';
```

**Common Causes**:

**State expired**:
- User took too long (>10 minutes) to complete OAuth
- Solution: Restart OAuth flow

**State missing from database**:
- Database error during `action=initiate`
- Check Netlify logs for errors during OAuth initiation

**Redirect URI mismatch**:
- Check `EBAY_REDIRECT_URI` environment variable
- Must match exactly: `https://dainty-horse-49c336.netlify.app/.netlify/functions/ebay-oauth-callback`

### Issue 4: Access token expired mid-request

**Symptoms**:
- First few API calls succeed
- Later calls fail with 401

**Cause**:
- Access token has 2-hour lifetime
- Long-running function exceeds 2 hours

**Solution**:
```javascript
// Check if access token is expired before each API call
async makeApiCall(endpoint, method, data, apiType) {
  // Add token expiration tracking
  if (this.accessTokenExpiresAt && Date.now() >= this.accessTokenExpiresAt) {
    await this.refreshToken();
  }

  // ... rest of makeApiCall
}

async refreshToken() {
  // ... existing code ...

  this.accessToken = data.access_token;
  this.accessTokenExpiresAt = Date.now() + (data.expires_in * 1000); // Add expiration
}
```

### Issue 5: Disconnect fails silently

**Symptoms**:
- User clicks "Disconnect"
- No error, but still shows as connected

**Diagnosis**:
1. Check browser console for errors
2. Check Netlify function logs for `ebay-oauth?action=disconnect`

**Common Causes**:

**RLS policy blocking update**:
- Disconnect function uses service role key
- Should bypass RLS
- Check if `SUPABASE_SERVICE_ROLE_KEY` is set correctly

**Verification failed**:
```javascript
// Check if verification is too strict
const updatedUser = updateResult[0];
if (updatedUser.ebay_refresh_token !== null) {
  throw new Error('Disconnect verification failed: token still present');
}
```

**Solution**:
- Use `force-disconnect` function as workaround
- Investigate why normal disconnect is failing

### Issue 6: Credentials configured but can't sync

**Symptoms**:
- Admin Settings shows credentials configured
- "Connect eBay" shows "Connected"
- Sync fails with "User has not connected their eBay account"

**Diagnosis**:
```sql
SELECT
  ebay_app_id IS NOT NULL as has_app_id,
  ebay_cert_id_encrypted IS NOT NULL as has_cert_id,
  ebay_refresh_token IS NOT NULL as has_refresh_token,
  ebay_connection_status
FROM users
WHERE id = '{user_uuid}';
```

**Expected**:
- `has_app_id: true`
- `has_cert_id: true`
- `has_refresh_token: true` (THIS IS KEY)
- `ebay_connection_status: 'connected'`

**Solution**:
- User has configured credentials but hasn't completed OAuth
- User needs to click "Connect eBay Account" to complete OAuth flow
- OAuth flow generates and stores refresh token

---

## Conclusion

This eBay Price Reducer application uses a sophisticated two-layer authentication system:

1. **Supabase JWT Authentication**: Authenticates users to the application's backend functions
2. **eBay OAuth 2.0 with PKCE**: Authenticates users to eBay's API

**Key Design Decisions**:

- **Per-User Credentials**: Each user provides their own eBay App ID and Cert ID
- **Encryption at Rest**: Refresh tokens and Cert IDs encrypted with AES-256-CBC
- **Ephemeral Access Tokens**: eBay access tokens stored in memory only (not persisted)
- **PKCE**: Prevents authorization code interception attacks
- **State Parameter**: Prevents CSRF attacks on OAuth flow

**Token Flow Summary**:

```
User Login → Supabase JWT (1 hour)
            ↓
User Connects eBay → OAuth Flow → eBay Refresh Token (18 months, encrypted)
                                   ↓
Backend Needs API Access → Exchange Refresh Token → eBay Access Token (2 hours, ephemeral)
                                                     ↓
                                          Make eBay API Calls
```

**Security Best Practices**:

1. ✅ Encryption at rest for sensitive tokens
2. ✅ PKCE for OAuth code exchange
3. ✅ State parameter for CSRF protection
4. ✅ Row Level Security (RLS) on database
5. ✅ Ephemeral access tokens (not persisted)
6. ⚠️ CORS should be restricted to specific origins (not `*`)
7. ⚠️ OAuth state cleanup should be implemented
8. ⚠️ Token expiration handling should be improved

**Common Pitfalls**:

1. Confusing Supabase JWT with eBay tokens
2. Forgetting to complete OAuth flow after configuring credentials
3. Credential format migration issues (NEEDS_MIGRATION prefix)
4. Concurrent token refresh race conditions
5. Encryption key rotation without migration

**Debugging Tips**:

1. Use `check-credentials` function to diagnose credential issues
2. Check Netlify function logs for detailed error messages
3. Verify credential format in database (should be `hex:hex`)
4. Use `force-disconnect` if normal disconnect fails
5. Check `oauth_states` table during OAuth flow debugging

---

## Appendix: Environment Variables

### Netlify Functions

```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

# Encryption
ENCRYPTION_KEY=64-char-hex-string (generate with: openssl rand -hex 32)

# eBay OAuth
EBAY_REDIRECT_URI=https://dainty-horse-49c336.netlify.app/.netlify/functions/ebay-oauth-callback

# CORS
ALLOWED_ORIGINS=https://dainty-horse-49c336.netlify.app,http://localhost:8888

# Optional: Global eBay credentials (fallback if user doesn't provide their own)
EBAY_APP_ID=username-appname-env-random
EBAY_CERT_ID=random-hex-string
EBAY_DEV_ID=random-uuid
```

### Frontend

```bash
# Supabase
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx...

# API Base URL
VITE_API_BASE_URL=/.netlify/functions (default for Netlify)
```

---

**End of Research Document**

*This document was generated on 2025-10-02 as part of the eBay Price Reducer project research initiative. For questions or updates, see the conversation history or git commit e379801f4f33f9e2f00869c6f5d10516f73614b7.*
