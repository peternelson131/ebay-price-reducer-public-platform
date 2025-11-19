---
date: 2025-10-02T17:07:32+0000
researcher: Claude Code
git_commit: 7a65feffa18120bcc4d10f55510f17a48d8be93a
branch: main
repository: ebay-price-reducer
topic: "eBay Credential Handling Consistency Analysis"
tags: [research, oauth, credentials, encryption, consistency]
status: complete
last_updated: 2025-10-02
last_updated_by: Claude Code
---

# Research: eBay Credential Handling Consistency Analysis

**Date**: 2025-10-02T17:07:32+0000
**Researcher**: Claude Code
**Git Commit**: 7a65feffa18120bcc4d10f55510f17a48d8be93a
**Branch**: main
**Repository**: ebay-price-reducer

## Research Question

Ensure that the use of updated eBay credentials (per-user App ID/Cert ID with encryption and fallback to environment variables) is consistent throughout the application. Identify any inconsistencies without changing frontend functionality.

## Executive Summary

The eBay Price Reducer implements a **per-user credential system** with encrypted storage and fallback to global environment variables. The implementation is **largely consistent** with a shared encryption module and standardized RPC-based credential retrieval. However, **three critical inconsistencies** were identified that compromise the architecture:

1. **Code Duplication**: Two files duplicate encryption logic instead of using shared module
2. **Hardcoded Environment Variable**: One method bypasses user-specific credentials
3. **Inconsistent Credential Retrieval**: OAuth flows use direct DB queries instead of RPC

The **frontend is fully compatible** and requires no changes to functionality—only minor adjustments to credential display format.

---

## Detailed Findings

### 1. Encryption/Decryption Implementation

#### ✅ **Shared Module Pattern (Recommended)**

**File**: `netlify/functions/utils/ebay-oauth-helpers.js`

This is the canonical source for encryption utilities:

```javascript
// AES-256-CBC encryption with proper key handling
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
```

**Files Using Shared Module Correctly**:
- `save-ebay-credentials.js:3` - `const { encrypt } = require('./utils/ebay-oauth-helpers')`
- `ebay-oauth-callback.js:5` - `const { encrypt, decrypt } = require('./utils/ebay-oauth-helpers')`
- `ebay-oauth.js:3` - `const { encrypt, decrypt } = require('./utils/ebay-oauth-helpers')`
- `user-ebay-client.js:2` - `const { decrypt } = require('./ebay-oauth-helpers')`
- `enhanced-ebay-client.js:2` - `const { decrypt } = require('./ebay-oauth-helpers')`

#### ❌ **Code Duplication (Anti-Pattern)**

**File**: `netlify/functions/ebay-fetch-listings.js:58-113`

This file duplicates the entire encryption implementation:

```javascript
// DUPLICATED CODE - should import from ebay-oauth-helpers.js
function getEncryptionKey() {
  if (!process.env.ENCRYPTION_KEY) {
    // Has fallback to SUPABASE_URL as seed (non-standard)
    const seed = process.env.SUPABASE_URL || 'default-seed';
    return crypto.createHash('sha256').update(seed).digest();
  }
  // ... rest of implementation
}

function decrypt(encryptedData) {
  // ... duplicated decrypt logic
}
```

**File**: `netlify/functions/sync-service.js:36-59`

Also duplicates encryption code with same fallback pattern.

**Impact**:
- Maintenance burden: Changes to encryption logic must be duplicated
- Inconsistent fallback: Uses SUPABASE_URL fallback not present in canonical version
- Risk of drift: Different implementations may behave differently

**Recommendation**: Refactor to use shared module.

---

### 2. Credential Retrieval Patterns

#### ✅ **Consistent Pattern: RPC with Fallback**

**Files**: `user-ebay-client.js:78-126`, `enhanced-ebay-client.js:83-130`

Both implement identical credential retrieval logic:

```javascript
// Step 1: Call RPC to get user-specific credentials
const { data: appCreds, error: appError } = await supabase.rpc(
  'get_user_ebay_app_credentials',
  { user_uuid: this.userId }
);

// Step 2: Use user credentials if available
if (appCreds && appCreds[0]?.ebay_app_id && appCreds[0]?.ebay_cert_id_encrypted) {
  console.log('✓ Using user-specific eBay app credentials');
  clientId = appCreds[0].ebay_app_id;

  // Validation before decryption
  const encrypted = appCreds[0].ebay_cert_id_encrypted;

  if (encrypted.startsWith('NEEDS_MIGRATION:')) {
    throw new Error('eBay credentials need migration...');
  }

  if (!/^[0-9a-f]+:[0-9a-f]+$/i.test(encrypted)) {
    throw new Error('Invalid credential encryption format...');
  }

  clientSecret = decrypt(encrypted);
} else {
  // Step 3: Fall back to environment variables
  console.log('→ Using global eBay credentials from environment');
  clientId = process.env.EBAY_APP_ID;
  clientSecret = process.env.EBAY_CERT_ID;

  if (!clientId || !clientSecret) {
    throw new Error('No eBay app credentials configured...');
  }
}
```

**Validation Features**:
1. ✅ Checks for migration marker (`NEEDS_MIGRATION:`)
2. ✅ Validates hex:hex format with regex
3. ✅ Graceful fallback to environment variables
4. ✅ Descriptive error messages

#### ❌ **Inconsistency #1: Hardcoded Environment Variable**

**File**: `user-ebay-client.js:298-330` (method: `searchSimilarItems`)

```javascript
async searchSimilarItems(keywords, category = null, maxResults = 10) {
  const params = new URLSearchParams({
    'OPERATION-NAME': 'findItemsAdvanced',
    'SERVICE-VERSION': '1.0.0',
    'SECURITY-APPNAME': process.env.EBAY_APP_ID,  // ❌ HARDCODED!
    'RESPONSE-DATA-FORMAT': 'JSON',
    'keywords': keywords,
    // ...
  });

  const url = `https://svcs.ebay.com/services/search/FindingService/v1?${params}`;
  const response = await fetch(url);
  // ...
}
```

**Why This is Wrong**:
- All other methods use `this.accessToken` obtained with user-specific credentials
- This method hardcodes `process.env.EBAY_APP_ID` in the API call
- Bypasses the user-specific → fallback pattern
- Could cause rate limiting if multiple users share global App ID

**Recommendation**: Store user's App ID in instance variable during initialization and use it here.

#### ❌ **Inconsistency #2: OAuth Uses Direct DB Queries**

**Files**: `ebay-oauth.js:215-253`, `ebay-oauth-callback.js:196-219`

OAuth flows use direct database queries instead of RPC:

```javascript
// Direct query with service key
const users = await supabaseRequest(
  `users?id=eq.${authUser.id}`,
  'GET',
  null,
  {},
  true // Use service key to bypass RLS
);

const user = users[0];

// Decrypt cert_id if encrypted
if (user.ebay_cert_id_encrypted) {
  user.ebay_cert_id = decrypt(user.ebay_cert_id_encrypted);
}
```

**Why This is Inconsistent**:
- API clients use `get_user_ebay_app_credentials` RPC
- OAuth flows query database directly with service key
- Different access patterns for same data

**Recommendation**: Standardize on RPC pattern for consistency, or document architectural decision.

---

### 3. Database Schema and RPC Functions

#### **RPC Function**: `get_user_ebay_app_credentials`

**File**: `add-app-credentials-rpc.sql:14-28`

```sql
CREATE OR REPLACE FUNCTION get_user_ebay_app_credentials(user_uuid UUID)
RETURNS TABLE (
    ebay_app_id TEXT,
    ebay_cert_id_encrypted TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        users.ebay_app_id,
        users.ebay_cert_id_encrypted
    FROM users
    WHERE users.id = user_uuid
    AND users.ebay_app_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_user_ebay_app_credentials(UUID) TO authenticated;
```

**Features**:
- `SECURITY DEFINER`: Bypasses RLS policies
- Returns only if `ebay_app_id IS NOT NULL`
- Granted to `authenticated` role

#### **User Table Columns**

**File**: `DATABASE-USER-EBAY-TOKENS.sql`

Relevant columns:
- `ebay_app_id` (TEXT) - Plaintext App ID
- `ebay_cert_id_encrypted` (TEXT) - AES-256-CBC encrypted Cert ID
- `ebay_dev_id` (TEXT) - Plaintext Dev ID
- `ebay_refresh_token` (TEXT) - Encrypted refresh token
- `ebay_user_id` (TEXT) - eBay username
- `ebay_connection_status` (TEXT) - Connection state

---

### 4. Frontend Integration Analysis

#### ✅ **Frontend is Fully Compatible**

The frontend already supports the per-user credential architecture:

**Primary Component**: `frontend/src/components/EbayConnect.jsx`

**Credential Flow**:
1. User enters credentials in `AdminSettings.jsx` → POST to `/save-ebay-credentials`
2. `EbayConnect.jsx` checks credential status → GET `/ebay-oauth?action=get-credentials`
3. User initiates OAuth → GET `/ebay-oauth?action=initiate`
4. Backend uses user credentials for OAuth flow
5. Success → Refresh token stored encrypted

**No Changes Required**:
- Already uses correct endpoints
- Already handles credential states correctly
- Already displays masked values

#### ⚠️ **Minor Frontend Adjustments**

1. **Credential Display Format** (`EbayConnect.jsx:446-464`)
   - Currently expects `credentials.appId` (string value)
   - Backend returns `hasAppId` (boolean) + masked value
   - **Action**: Verify backend returns masked strings for display

2. **Deprecated Token Manager** (`utils/ebayTokenManager.js`)
   - References `ebay_token_expires_at` which is deprecated
   - **Action**: Remove or update file

3. **API Service Not Used** (`services/api.js:159-175`)
   - Has methods for eBay OAuth but components use direct `fetch()`
   - **Action**: Optionally refactor for consistency

---

## Code References

### Encryption Module
- **Shared Module**: `netlify/functions/utils/ebay-oauth-helpers.js:15-62`
- **Duplicated Code**:
  - `netlify/functions/ebay-fetch-listings.js:58-113`
  - `netlify/functions/sync-service.js:36-59`

### Credential Retrieval
- **Consistent Pattern**:
  - `netlify/functions/utils/user-ebay-client.js:78-126`
  - `netlify/functions/utils/enhanced-ebay-client.js:83-130`
- **Inconsistent Pattern**:
  - `netlify/functions/utils/user-ebay-client.js:303` (searchSimilarItems)
  - `netlify/functions/ebay-oauth.js:215-253` (direct DB query)
  - `netlify/functions/ebay-oauth-callback.js:196-219` (direct DB query)

### Database
- **RPC Function**: `add-app-credentials-rpc.sql:14-28`
- **Schema**: `DATABASE-USER-EBAY-TOKENS.sql`

### Frontend
- **Credential Config**: `frontend/src/pages/AdminSettings.jsx:67-129`
- **Connection Management**: `frontend/src/components/EbayConnect.jsx:33-328`
- **OAuth Callback**: `frontend/src/pages/Account.jsx:76-121`

---

## Architecture Insights

### **Design Pattern**: Per-User Credentials with Fallback

The system implements a sophisticated credential management strategy:

1. **User-Specific Credentials** (Tier 1):
   - Users provide their own eBay App ID and Cert ID
   - Stored in `users` table with encryption for sensitive data
   - Retrieved via secure RPC function
   - Used for all eBay API operations for that user

2. **Global Credentials** (Tier 2 - Fallback):
   - Environment variables: `EBAY_APP_ID`, `EBAY_CERT_ID`
   - Used when user hasn't configured their own credentials
   - Shared across all users without custom credentials
   - May hit rate limits faster

3. **Security Features**:
   - AES-256-CBC encryption for Cert ID
   - Validation of encryption format before decryption
   - Migration marker detection (`NEEDS_MIGRATION:`)
   - RLS bypass via `SECURITY DEFINER` RPC

### **Credential Flow**

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CREDENTIAL STORAGE                                        │
└─────────────────────────────────────────────────────────────┘
User Input (AdminSettings.jsx)
  ↓
POST /save-ebay-credentials
  ↓
encrypt(cert_id) using ebay-oauth-helpers.js
  ↓
Store in users table: ebay_app_id, ebay_cert_id_encrypted

┌─────────────────────────────────────────────────────────────┐
│ 2. CREDENTIAL RETRIEVAL                                      │
└─────────────────────────────────────────────────────────────┘
API Call Needs Credentials
  ↓
RPC: get_user_ebay_app_credentials(user_uuid)
  ↓
Returns: ebay_app_id, ebay_cert_id_encrypted
  ↓
Validate format → decrypt(cert_id)
  ↓
If not found → Fallback to process.env.EBAY_APP_ID/CERT_ID

┌─────────────────────────────────────────────────────────────┐
│ 3. TOKEN REFRESH                                             │
└─────────────────────────────────────────────────────────────┘
Need Access Token
  ↓
Get credentials (user-specific or env vars)
  ↓
POST to eBay OAuth: Basic Auth(app_id:cert_id)
  ↓
Exchange refresh_token for access_token (ephemeral, 2 hours)
  ↓
Use access_token for eBay API calls
```

---

## Inconsistencies Summary

| Issue | File | Location | Severity | Impact |
|-------|------|----------|----------|--------|
| **Duplicated Encryption Code** | `ebay-fetch-listings.js` | Lines 58-113 | High | Maintenance burden, drift risk |
| **Duplicated Encryption Code** | `sync-service.js` | Lines 36-59 | High | Maintenance burden, drift risk |
| **Hardcoded Environment Variable** | `user-ebay-client.js` | Line 303 | Critical | Bypasses user credentials |
| **Direct DB Query vs RPC** | `ebay-oauth.js` | Lines 215-253 | Medium | Pattern inconsistency |
| **Direct DB Query vs RPC** | `ebay-oauth-callback.js` | Lines 196-219 | Medium | Pattern inconsistency |
| **Unused API Service Methods** | `api.js` | Lines 159-175 | Low | Code maintenance |
| **Deprecated Token Manager** | `ebayTokenManager.js` | Entire file | Low | Deprecated references |

---

## Recommendations

### **High Priority**

1. **Fix `searchSimilarItems` Hardcoded Credential**
   - Store user's App ID in instance variable during `initialize()`
   - Use stored App ID instead of `process.env.EBAY_APP_ID`
   - Implement same fallback pattern as token refresh

2. **Refactor Duplicated Encryption Code**
   - Update `ebay-fetch-listings.js` to import from `ebay-oauth-helpers.js`
   - Update `sync-service.js` to import from `ebay-oauth-helpers.js`
   - Remove duplicated `getEncryptionKey()` and `decrypt()` functions
   - Test to ensure fallback behavior is preserved if needed

### **Medium Priority**

3. **Standardize OAuth Credential Retrieval**
   - Consider using `get_user_ebay_app_credentials` RPC in OAuth flows
   - Or document why direct DB queries are preferred (performance, control)
   - Ensure consistent pattern across all credential access

4. **Verify Frontend Credential Display**
   - Confirm `/ebay-oauth?action=get-credentials` returns masked strings
   - Update `EbayConnect.jsx` if response format has changed

### **Low Priority**

5. **Clean Up Frontend Code**
   - Remove or update deprecated `ebayTokenManager.js`
   - Consider refactoring to use `api.js` service methods
   - Remove redundant `EbayConnectionModal.jsx` if not used

6. **Add Instance-Level Credential Caching**
   - Store decrypted credentials in client instance after first retrieval
   - Reduces database calls during token refresh cycles
   - Improves performance for high-frequency API usage

---

## Related Research

- `thoughts/shared/research/2025-10-02_oauth-listings-import-failure.md` - Original OAuth bug analysis
- `thoughts/shared/plans/2025-10-02-oauth-infrastructure-improvements.md` - Implementation plan

---

## Conclusion

The eBay credential handling is **architecturally sound** with proper encryption, secure RPC functions, and user-specific credential support. The **frontend is fully compatible** and requires no functionality changes.

However, **three critical inconsistencies** undermine the architecture:
1. Code duplication creates maintenance burden and drift risk
2. Hardcoded environment variable bypasses user-specific credentials
3. Inconsistent credential access patterns across different modules

**Immediate action required**: Fix `searchSimilarItems` hardcoded credential (critical) and refactor duplicated encryption code (high priority). These issues can cause unexpected behavior for users with custom credentials and complicate future maintenance.
