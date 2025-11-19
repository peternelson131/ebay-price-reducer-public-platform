# eBay Price Reducer - Integration Fixes Implementation Plan

## Overview

This plan addresses critical issues identified in the integration review (2025-10-02). The application has successfully migrated to serverless architecture (Netlify Functions + Supabase), but requires immediate fixes for database migrations, security hardening, and legacy code cleanup.

## Current State Analysis

**What Exists Now**:
- ✅ Functional serverless architecture (Netlify Functions + Supabase)
- ✅ Working OAuth flow with eBay
- ✅ Frontend properly integrated with functions
- ❌ Missing database columns (view_count, watch_count, hit_count, last_synced_at)
- ❌ Unencrypted eBay credentials (ebay_cert_id stored in plaintext)
- ❌ Test functions exposed in production
- ❌ Legacy backend code (~4,000 lines unused)
- ⚠️ Security vulnerabilities (no PKCE, broad CORS, predictable encryption key)

**Key Constraints**:
- Production Netlify deployment running
- Active users with eBay connections
- Cannot break existing OAuth tokens
- Must maintain backwards compatibility during migration

## Desired End State

After implementation:
1. All database migrations complete and verified
2. eBay credentials encrypted at rest
3. Test functions removed from production
4. PKCE implemented for OAuth security
5. CORS restricted to production domain
6. Legacy backend archived with documentation
7. All security best practices implemented

**Verification**:
- Run automated tests
- Manual OAuth flow testing
- Database schema verification
- Security audit checklist completion

## What We're NOT Doing

- NOT changing the OAuth flow UX
- NOT migrating existing users' tokens (will re-encrypt on next refresh)
- NOT implementing rate limiting (deferred to Phase 4)
- NOT adding audit logging tables (deferred to Phase 4)
- NOT implementing request debouncing (deferred to Phase 4)
- NOT porting legacy backend logic to functions (only archiving)

## Implementation Approach

Three-phase approach with increasing scope:
1. **Phase 1 (Critical)**: Database + immediate security fixes
2. **Phase 2 (Security)**: OAuth hardening + CORS restrictions
3. **Phase 3 (Cleanup)**: Code organization + documentation

Each phase is independently deployable and testable.

---

## Phase 1: Critical Database & Security Fixes

### Overview
Fix blocking issues that could cause runtime errors or security breaches. Priority: Database schema completion and credential encryption.

### Changes Required

#### 1. Database Migration - Add Missing Columns

**File**: `/Users/peternelson/Projects/ebay-price-reducer/add-listing-view-watch-counts.sql`

**Status**: Migration file exists, needs to be run

**Changes**: Execute existing migration

```bash
# Connect to Supabase database and run migration
psql $DATABASE_URL -f add-listing-view-watch-counts.sql
```

**Migration Contents** (already exists):
```sql
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS watch_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS hit_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_listings_view_count
  ON listings(view_count DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_listings_watch_count
  ON listings(watch_count DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_listings_last_synced_at
  ON listings(last_synced_at DESC);
```

#### 2. Encrypt eBay Credentials

**File**: Create new migration `/Users/peternelson/Projects/ebay-price-reducer/encrypt-ebay-credentials.sql`

**Changes**: Add encrypted column and migrate data

```sql
-- Add new encrypted column
ALTER TABLE users
ADD COLUMN IF NOT EXISTS ebay_cert_id_encrypted TEXT;

-- Create migration function to encrypt existing credentials
CREATE OR REPLACE FUNCTION migrate_encrypt_cert_ids()
RETURNS void AS $$
DECLARE
  user_record RECORD;
  encrypted_cert TEXT;
BEGIN
  -- Loop through all users with unencrypted cert_id
  FOR user_record IN
    SELECT id, ebay_cert_id
    FROM users
    WHERE ebay_cert_id IS NOT NULL
    AND ebay_cert_id_encrypted IS NULL
  LOOP
    -- Note: Actual encryption will be done by Netlify function
    -- This just marks them for migration
    UPDATE users
    SET ebay_cert_id_encrypted = 'NEEDS_MIGRATION:' || ebay_cert_id
    WHERE id = user_record.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Run migration
SELECT migrate_encrypt_cert_ids();

-- Add comment
COMMENT ON COLUMN users.ebay_cert_id_encrypted IS
  'Encrypted eBay Cert ID using AES-256-CBC (same as refresh_token)';
```

**File**: `/Users/peternelson/Projects/ebay-price-reducer/netlify/functions/save-ebay-credentials.js`

**Changes**: Update to encrypt cert_id before storage (Lines 176-214)

**Before**:
```javascript
// Line 203
ebay_app_id: appId,
ebay_cert_id: certId,
ebay_dev_id: devId || null
```

**After**:
```javascript
// Import encryption functions from ebay-oauth.js
const crypto = require('crypto');

// Add encryption functions (copy from ebay-oauth.js:8-45)
const IV_LENGTH = 16;
const getEncryptionKey = () => {
  if (process.env.ENCRYPTION_KEY) {
    if (process.env.ENCRYPTION_KEY.length === 64) {
      return Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    }
    return crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
  }
  // Fallback - to be removed in Phase 2
  const seed = process.env.SUPABASE_URL || 'default-seed';
  return crypto.createHash('sha256').update(seed).digest();
};

const ENCRYPTION_KEY = getEncryptionKey();

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// Line 203 - Updated
ebay_app_id: appId,
ebay_cert_id_encrypted: encrypt(certId), // Encrypt before storage
ebay_dev_id: devId || null
```

**File**: `/Users/peternelson/Projects/ebay-price-reducer/netlify/functions/ebay-oauth.js`

**Changes**: Update to read from encrypted column (Lines 232-239)

**Before**:
```javascript
// Line 238
const { data: users } = await supabaseRequest(
  `users?id=eq.${authUser.id}`,
  'GET'
);
const user = users?.[0];
```

**After**:
```javascript
// Line 238 - Add decryption
const { data: users } = await supabaseRequest(
  `users?id=eq.${authUser.id}`,
  'GET'
);
const user = users?.[0];

// Decrypt cert_id if encrypted
if (user?.ebay_cert_id_encrypted) {
  user.ebay_cert_id = decrypt(user.ebay_cert_id_encrypted);
}
```

**File**: `/Users/peternelson/Projects/ebay-price-reducer/netlify/functions/ebay-oauth-callback.js`

**Changes**: Update to read encrypted cert_id (Lines 176-192)

```javascript
// Add same decryption logic
if (user?.ebay_cert_id_encrypted) {
  user.ebay_cert_id = decrypt(user.ebay_cert_id_encrypted);
}
```

#### 3. Remove Test Functions from Production

**Action**: Move test functions to excluded directory

**Files to Move**:
```
netlify/functions/test-ebay-token.js
netlify/functions/test-function.js
netlify/functions/test-ebay-connection.js
netlify/functions/test-disconnect.js
netlify/functions/test-oauth-flow.js
netlify/functions/test-oauth-callback.js
netlify/functions/test-save-credentials.js
netlify/functions/debug-ebay-oauth.js
netlify/functions/debug-ebay-connection.js
netlify/functions/check-stored-token.js
netlify/functions/fix-ebay-token.js
```

**New Structure**:
```bash
mkdir -p netlify/functions-dev
mv netlify/functions/test-*.js netlify/functions-dev/
mv netlify/functions/debug-*.js netlify/functions-dev/
mv netlify/functions/check-stored-token.js netlify/functions-dev/
mv netlify/functions/fix-ebay-token.js netlify/functions-dev/
```

**File**: `/Users/peternelson/Projects/ebay-price-reducer/netlify.toml`

**Changes**: Update functions directory config (Lines 5-6)

```toml
[functions]
  directory = "netlify/functions"
  # Exclude dev functions from production
  excluded_patterns = ["**/functions-dev/**"]
```

#### 4. Create README for Dev Functions

**File**: Create `/Users/peternelson/Projects/ebay-price-reducer/netlify/functions-dev/README.md`

```markdown
# Development & Testing Functions

These functions are excluded from production deployment and are only for local testing.

## Available Functions

- `test-ebay-token.js` - Test eBay token validation
- `test-ebay-connection.js` - Test eBay API connectivity
- `test-oauth-flow.js` - Test complete OAuth flow
- `debug-ebay-oauth.js` - Debug OAuth issues
- `check-stored-token.js` - Verify token storage
- `fix-ebay-token.js` - Manual token repair utility

## Usage

To test locally:
```bash
netlify dev
curl http://localhost:8888/.netlify/functions/test-ebay-connection
```

## Security Note

These functions should NEVER be deployed to production as they may:
- Expose sensitive configuration
- Bypass authentication
- Provide debugging information
```

### Success Criteria

#### Automated Verification:
- [ ] Database migration runs successfully: `psql $DATABASE_URL -f add-listing-view-watch-counts.sql`
- [ ] Verify columns exist: `psql $DATABASE_URL -c "\d listings" | grep -E "(view_count|watch_count|hit_count|last_synced_at)"`
- [ ] Encryption migration runs: `psql $DATABASE_URL -f encrypt-ebay-credentials.sql`
- [ ] Verify encrypted column: `psql $DATABASE_URL -c "\d users" | grep ebay_cert_id_encrypted`
- [ ] Test functions moved: `test ! -f netlify/functions/test-ebay-token.js`
- [ ] Dev functions exist: `test -f netlify/functions-dev/test-ebay-token.js`
- [ ] Build succeeds: `cd frontend && npm run build`
- [ ] Netlify deploy preview succeeds

#### Manual Verification:
- [ ] OAuth flow completes successfully with encrypted credentials
- [ ] Existing users can still authenticate
- [ ] Listings page displays view/watch counts correctly
- [ ] No test functions accessible at `/.netlify/functions/test-*`
- [ ] Saved credentials are encrypted in database (query users table)

---

## Phase 2: Security Hardening

### Overview
Implement OAuth security best practices (PKCE), restrict CORS, and enforce encryption key requirement.

### Changes Required

#### 1. Implement PKCE for OAuth

**Background**: PKCE (Proof Key for Code Exchange) prevents authorization code interception attacks.

**File**: `/Users/peternelson/Projects/ebay-price-reducer/netlify/functions/ebay-oauth.js`

**Changes**: Add PKCE code_challenge generation (Lines 215-302)

**Add helper functions at top**:
```javascript
// Add after encryption functions (around line 46)
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
}
```

**Update initiate action** (Line 268-302):
```javascript
// Generate PKCE values
const codeVerifier = generateCodeVerifier();
const codeChallenge = generateCodeChallenge(codeVerifier);

// Generate OAuth state
const oauthState = crypto.randomBytes(32).toString('hex');

// Store state AND code_verifier in database
await supabaseRequest(
  'oauth_states',
  'POST',
  {
    state: oauthState,
    user_id: authUser.id,
    code_verifier: codeVerifier, // NEW: Store verifier
    created_at: new Date().toISOString()
  },
  {},
  true
);

// Build eBay authorization URL with PKCE
const ebayAuthUrl = `https://auth.ebay.com/oauth2/authorize?` +
  `client_id=${user.ebay_app_id}&` +
  `response_type=code&` +
  `redirect_uri=${encodeURIComponent(redirectUri)}&` +
  `scope=${encodeURIComponent(SCOPES)}&` +
  `state=${oauthState}&` +
  `code_challenge=${codeChallenge}&` +           // NEW
  `code_challenge_method=S256`;                   // NEW
```

**File**: `/Users/peternelson/Projects/ebay-price-reducer/create-oauth-states-table.sql`

**Changes**: Add code_verifier column

```sql
ALTER TABLE oauth_states
ADD COLUMN IF NOT EXISTS code_verifier TEXT;

COMMENT ON COLUMN oauth_states.code_verifier IS
  'PKCE code verifier (stored temporarily for OAuth flow)';
```

**File**: `/Users/peternelson/Projects/ebay-price-reducer/netlify/functions/ebay-oauth-callback.js`

**Changes**: Verify PKCE in callback (Lines 148-244)

**After state validation** (around line 164):
```javascript
// Validate state exists
if (!stateRecords || stateRecords.length === 0) {
  return htmlResponse(400, 'Invalid OAuth state',
    'OAuth state not found or expired. Please try connecting again.');
}

const stateRecord = stateRecords[0];
const userId = stateRecord.user_id;
const codeVerifier = stateRecord.code_verifier; // NEW: Get verifier

// ... existing user fetch code ...

// Add code_verifier to token exchange (Line 216-224)
const tokenResponse = await fetch(tokenUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': 'Basic ' + Buffer.from(`${user.ebay_app_id}:${user.ebay_cert_id}`).toString('base64')
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier  // NEW: Include verifier
  })
});
```

#### 2. Restrict CORS to Production Domain

**File**: `/Users/peternelson/Projects/ebay-price-reducer/netlify/functions/ebay-oauth.js`

**Changes**: Update CORS headers (Lines 927-940)

**Before**:
```javascript
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
};
```

**After**:
```javascript
// Get allowed origin from environment
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['https://dainty-horse-49c336.netlify.app'];

// Check request origin
const requestOrigin = event.headers.origin || event.headers.Origin;
const allowedOrigin = ALLOWED_ORIGINS.includes(requestOrigin)
  ? requestOrigin
  : ALLOWED_ORIGINS[0];

const headers = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Credentials': 'true'
};
```

**Apply to ALL function files**:
- `ebay-oauth-callback.js`
- `save-ebay-credentials.js`
- `ebay-fetch-listings.js`
- `sync-listings.js`
- `reduce-price.js`
- All other production functions

**File**: Create `/Users/peternelson/Projects/ebay-price-reducer/netlify/functions/utils/cors.js`

**Shared CORS helper**:
```javascript
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['https://dainty-horse-49c336.netlify.app'];

function getCorsHeaders(event) {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  const allowedOrigin = ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  };
}

module.exports = { getCorsHeaders };
```

**Update all functions to use**:
```javascript
const { getCorsHeaders } = require('./utils/cors');

// In handler
const headers = getCorsHeaders(event);
```

#### 3. Require ENCRYPTION_KEY Environment Variable

**File**: `/Users/peternelson/Projects/ebay-price-reducer/netlify/functions/ebay-oauth.js`

**Changes**: Remove fallback encryption key (Lines 10-26)

**Before**:
```javascript
const getEncryptionKey = () => {
  if (process.env.ENCRYPTION_KEY) {
    // Use provided key
  }
  // Fallback: hash Supabase URL
  const seed = process.env.SUPABASE_URL || 'default-seed';
  return crypto.createHash('sha256').update(seed).digest();
};
```

**After**:
```javascript
const getEncryptionKey = () => {
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required. ' +
      'Generate with: openssl rand -hex 32'
    );
  }

  if (process.env.ENCRYPTION_KEY.length === 64) {
    return Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  }

  return crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
};

// Validate on startup
const ENCRYPTION_KEY = getEncryptionKey();
```

**File**: `/Users/peternelson/Projects/ebay-price-reducer/.env.example`

**Changes**: Add ENCRYPTION_KEY documentation

```bash
# Required: Encryption key for sensitive data (32-byte hex string)
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=your-32-byte-hex-key-here

# Allowed CORS origins (comma-separated)
ALLOWED_ORIGINS=https://dainty-horse-49c336.netlify.app,http://localhost:8888
```

#### 4. Add API Retry Logic in Frontend

**File**: `/Users/peternelson/Projects/ebay-price-reducer/frontend/src/services/api.js`

**Changes**: Add retry with exponential backoff (Lines 12-34)

**Before**:
```javascript
async function apiRequest(endpoint, options = {}) {
  try {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error(`API Error for ${endpoint}:`, error);
    throw error;
  }
}
```

**After**:
```javascript
async function apiRequest(endpoint, options = {}, retries = 3) {
  const url = `${API_BASE_URL}${endpoint}`;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      const data = await response.json();

      if (!response.ok) {
        // Don't retry client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }

        // Retry server errors (5xx) and network errors
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      return data;
    } catch (error) {
      lastError = error;

      // Don't retry on abort or client errors
      if (error.name === 'AbortError' || error.message.includes('HTTP error!')) {
        throw error;
      }

      // Retry network errors
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.warn(`API request failed, retrying in ${delay}ms...`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  console.error(`API Error for ${endpoint} after ${retries} retries:`, lastError);
  throw lastError;
}
```

### Success Criteria

#### Automated Verification:
- [ ] PKCE migration runs: `psql $DATABASE_URL -c "ALTER TABLE oauth_states ADD COLUMN IF NOT EXISTS code_verifier TEXT"`
- [ ] Environment check fails without ENCRYPTION_KEY: `unset ENCRYPTION_KEY && netlify build` (should fail)
- [ ] TypeScript/ESLint passes: `cd frontend && npm run lint`
- [ ] Frontend builds: `cd frontend && npm run build`
- [ ] All functions deploy successfully

#### Manual Verification:
- [ ] OAuth flow works with PKCE (check Network tab for code_challenge param)
- [ ] CORS blocks requests from unauthorized origins
- [ ] API retry logic works (test with network throttling)
- [ ] Deployment fails if ENCRYPTION_KEY not set in Netlify env vars
- [ ] Browser console shows retry attempts on network failures

---

## Phase 3: Code Cleanup & Documentation

### Overview
Archive legacy backend code and update documentation to reflect serverless architecture.

### Changes Required

#### 1. Archive Legacy Backend Code

**Action**: Move backend to legacy-backend directory

```bash
# Archive backend
mv backend legacy-backend

# Update gitignore
echo "# Legacy backend - archived, not in use" >> .gitignore
echo "legacy-backend/node_modules/" >> .gitignore
```

**File**: Create `/Users/peternelson/Projects/ebay-price-reducer/legacy-backend/README.md`

```markdown
# Legacy Backend - ARCHIVED

This directory contains the original Express.js + MongoDB backend that has been **replaced by Netlify serverless functions**.

## Migration Status

**DO NOT USE THIS CODE IN PRODUCTION**

The application has migrated to:
- **Database**: Supabase (PostgreSQL) instead of MongoDB
- **API**: Netlify Functions instead of Express routes
- **Auth**: Supabase Auth instead of custom JWT

## Migration Mapping

| Legacy File | Current Implementation |
|-------------|----------------------|
| `src/server.js` | Netlify Functions (serverless) |
| `src/routes/listings.js` | `netlify/functions/ebay-fetch-listings.js`, `sync-listings.js` |
| `src/routes/keepa.js` | `netlify/functions/keepa-api.js` |
| `src/services/ebayOAuth.js` | `netlify/functions/ebay-oauth.js`, `ebay-oauth-callback.js` |
| `src/services/priceMonitorService.js` | `netlify/functions/scheduled-listings-sync.js` |
| `src/models/User.js` | Supabase `users` table |
| `src/models/Listing.js` | Supabase `listings` table |

## Useful Logic to Port (Future)

Some business logic from this backend may be useful to port to Netlify functions:

1. **Price Calculation** (`models/Listing.js:177-209`):
   - Time-based progressive pricing strategy
   - Market-based pricing algorithm

2. **Keepa Score Calculation** (`services/keepaService.js:381-402`):
   - Product scoring algorithm
   - Price stability analysis

3. **Market Analysis** (`services/ebayService.js:132-156`):
   - Suggested price calculation
   - Competitor analysis logic

## Archived Date

2025-10-02

## Related Documentation

- Migration analysis: `/research/2025-10-02_integration_review.md`
- Current architecture: `/ARCHITECTURE.md` (to be updated)
```

#### 2. Update CLAUDE.md

**File**: `/Users/peternelson/Projects/ebay-price-reducer/CLAUDE.md`

**Changes**: Complete rewrite to reflect serverless architecture

```markdown
# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Architecture

This is a **serverless full-stack application** deployed on Netlify with Supabase backend:

### **Frontend** (React + Vite)
- `frontend/src/components/` - Reusable UI components
- `frontend/src/pages/` - Page components
- `frontend/src/services/api.js` - API client for Netlify functions
- `frontend/src/contexts/AuthContext.jsx` - Supabase authentication
- `frontend/src/lib/supabase.js` - Supabase client

### **Backend** (Netlify Serverless Functions)
- `netlify/functions/` - Production serverless functions
  - `ebay-oauth.js` - eBay OAuth flow (initiate, callback, status, refresh, disconnect)
  - `ebay-oauth-callback.js` - OAuth callback handler
  - `save-ebay-credentials.js` - Save user's eBay app credentials
  - `ebay-fetch-listings.js` - Fetch listings from eBay (hybrid Inventory + Trading API)
  - `sync-listings.js` - Sync eBay listings to Supabase
  - `reduce-price.js` - Manual price reduction
  - `scheduled-listings-sync.js` - Cron job (every 6 hours)
  - `utils/` - Shared utilities (supabase, ebay-client, logger)
- `netlify/functions-dev/` - Development/test functions (excluded from production)

### **Database** (Supabase PostgreSQL)
- `users` table - User accounts, eBay credentials, OAuth tokens
- `listings` table - eBay listings with price reduction settings
- `oauth_states` table - Temporary OAuth CSRF protection
- Schema files: `supabase-schema.sql`, `DATABASE-USER-EBAY-TOKENS.sql`

### **Legacy Backend** (ARCHIVED - DO NOT USE)
- `legacy-backend/` - Old Express.js + MongoDB backend (replaced by Netlify functions)
- See `legacy-backend/README.md` for migration details

## Development Commands

### Frontend
```bash
cd frontend
npm install
npm run dev        # Start development server (Vite)
npm run build      # Build for production
npm run preview    # Preview production build
npm run lint       # ESLint
```

### Netlify Functions (Local)
```bash
netlify dev        # Start local Netlify dev server (includes functions)
netlify functions:list  # List all functions
```

### Database
```bash
# Run migrations
psql $DATABASE_URL -f migration-file.sql

# Connect to database
psql $DATABASE_URL
```

### Deployment
```bash
# Frontend builds automatically on push to main
git push origin main

# Netlify deploys automatically from GitHub
# Build command (in netlify.toml):
#   npm install && cd netlify/functions && npm install &&
#   cd ../../frontend && npm install --include=dev && npm run build
```

## Development Notes

### Architecture Patterns
- **Serverless Functions**: Each function is a self-contained API endpoint
- **Per-User eBay Credentials**: Users provide their own eBay App ID/Cert ID
- **Token Security**: Refresh tokens encrypted (AES-256-CBC), access tokens ephemeral
- **Hybrid eBay API**: Uses Inventory API (REST) for data, Trading API (XML) for stats
- **PKCE OAuth**: OAuth 2.0 with PKCE for security

### Key Security Features
- CSRF protection via OAuth state
- AES-256-CBC encryption for sensitive tokens
- Row Level Security (RLS) on all Supabase tables
- CORS restricted to production domain
- PKCE for OAuth code exchange

### Common Tasks

**Add a new API endpoint**:
1. Create new file in `netlify/functions/your-function.js`
2. Export handler: `exports.handler = async (event, context) => { ... }`
3. Use `utils/cors.js` for CORS headers
4. Use `utils/supabase.js` for database access
5. Test locally with `netlify dev`

**Modify eBay OAuth flow**:
- Main logic: `netlify/functions/ebay-oauth.js`
- Callback: `netlify/functions/ebay-oauth-callback.js`
- Encryption: `ebay-oauth.js:8-45`
- PKCE: `ebay-oauth.js:47-58`

**Update database schema**:
1. Create migration SQL file in project root
2. Test locally: `psql $DATABASE_URL -f migration.sql`
3. Update RLS policies if needed
4. Document in schema files

**Debug OAuth issues**:
1. Check Netlify function logs
2. Use dev functions: `netlify/functions-dev/debug-ebay-oauth.js`
3. Verify state in `oauth_states` table
4. Check encryption key is set

## Environment Variables Required

### Netlify Functions
```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
ENCRYPTION_KEY=64-char-hex-string (generate with: openssl rand -hex 32)
ALLOWED_ORIGINS=https://your-domain.netlify.app,http://localhost:8888
EBAY_REDIRECT_URI=https://your-domain.netlify.app/.netlify/functions/ebay-oauth-callback
```

### Frontend
```bash
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx...
VITE_API_BASE_URL=/.netlify/functions (default)
```

## Deployment Instructions

**IMPORTANT**: After making updates:

1. Commit all changes: `git add -A && git commit -m "description"`
2. Push to GitHub: `git push origin main`
3. Netlify automatically:
   - Installs dependencies
   - Builds frontend (`npm run build`)
   - Deploys functions
   - Deploys frontend to CDN

No manual deployment needed. Monitor deploy at: https://app.netlify.com

## Testing

### Manual Testing Checklist
- [ ] OAuth flow: Connect eBay account
- [ ] Listings sync: Fetch and display listings
- [ ] Price reduction: Reduce price on a listing
- [ ] Disconnect: Disconnect eBay account
- [ ] View/watch counts: Verify stats display

### Automated Testing
```bash
# Frontend tests (if added)
cd frontend && npm test

# Function tests (if added)
cd netlify/functions && npm test
```

## Important Files Reference

- `netlify.toml` - Netlify build configuration
- `supabase-schema.sql` - Database schema
- `add-listing-view-watch-counts.sql` - Pending migration
- `encrypt-ebay-credentials.sql` - Credential encryption migration
- `research/2025-10-02_integration_review.md` - Architecture analysis
- `research/implementation_plan.md` - This plan
```

#### 3. Replace alert() with Toast Notifications

**File**: `/Users/peternelson/Projects/ebay-price-reducer/frontend/src/utils/toast.js`

**Create toast utility**:
```javascript
// Simple toast notification utility
class ToastManager {
  constructor() {
    this.container = null;
    this.init();
  }

  init() {
    if (typeof window === 'undefined') return;

    // Create toast container
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 400px;
    `;
    document.body.appendChild(this.container);
  }

  show(message, type = 'info', duration = 5000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const colors = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6'
    };

    toast.style.cssText = `
      background: ${colors[type] || colors.info};
      color: white;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      animation: slideIn 0.3s ease-out;
      cursor: pointer;
    `;

    toast.textContent = message;

    // Add close on click
    toast.onclick = () => {
      toast.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => this.container.removeChild(toast), 300);
    };

    this.container.appendChild(toast);

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        if (this.container.contains(toast)) {
          toast.style.animation = 'slideOut 0.3s ease-out';
          setTimeout(() => {
            if (this.container.contains(toast)) {
              this.container.removeChild(toast);
            }
          }, 300);
        }
      }, duration);
    }
  }

  success(message) {
    this.show(message, 'success');
  }

  error(message) {
    this.show(message, 'error');
  }

  warning(message) {
    this.show(message, 'warning');
  }

  info(message) {
    this.show(message, 'info');
  }
}

// Add animations to document
if (typeof window !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

export const toast = new ToastManager();
```

**File**: `/Users/peternelson/Projects/ebay-price-reducer/frontend/src/components/EbayConnect.jsx`

**Changes**: Replace alert() with toast (Lines 112, 144, 211)

```javascript
// Add import
import { toast } from '../utils/toast';

// Line 112 - Replace alert
// Before: alert(`Failed to connect to eBay: ${event.data.error || 'Unknown error'}`);
toast.error(`Failed to connect to eBay: ${event.data.error || 'Unknown error'}`);

// Line 144 - Replace alert
// Before: alert('Failed to get eBay authorization URL. Please try again.');
toast.error('Failed to get eBay authorization URL. Please try again.');

// Line 211 - Replace alert
// Before: alert('Failed to disconnect eBay account. Please try again.');
toast.error('Failed to disconnect eBay account. Please try again.');
```

#### 4. Environment-Based Logging

**File**: `/Users/peternelson/Projects/ebay-price-reducer/frontend/src/services/api.js`

**Changes**: Remove console.log in production (Line 32)

```javascript
// Before
console.error(`API Error for ${endpoint}:`, error);

// After
if (import.meta.env.DEV) {
  console.error(`API Error for ${endpoint}:`, error);
}
```

**File**: Create `/Users/peternelson/Projects/ebay-price-reducer/frontend/src/utils/logger.js`

```javascript
// Environment-aware logger
const isDev = import.meta.env.DEV;

export const logger = {
  error: (...args) => {
    if (isDev) {
      console.error(...args);
    }
    // In production, could send to error tracking service
    // e.g., Sentry.captureException(args[0]);
  },

  warn: (...args) => {
    if (isDev) {
      console.warn(...args);
    }
  },

  info: (...args) => {
    if (isDev) {
      console.info(...args);
    }
  },

  debug: (...args) => {
    if (isDev) {
      console.debug(...args);
    }
  }
};
```

### Success Criteria

#### Automated Verification:
- [ ] Legacy backend moved: `test -d legacy-backend && test ! -d backend`
- [ ] Legacy README exists: `test -f legacy-backend/README.md`
- [ ] CLAUDE.md updated: `grep -q "Netlify Serverless Functions" CLAUDE.md`
- [ ] Frontend builds: `cd frontend && npm run build`
- [ ] No console.log in production build: `cd frontend && npm run build && ! grep -r "console.log" dist/`

#### Manual Verification:
- [ ] Toast notifications appear instead of browser alerts
- [ ] Toast notifications auto-dismiss after 5 seconds
- [ ] No console errors in production build
- [ ] CLAUDE.md accurately describes architecture
- [ ] Legacy backend README explains migration

---

## Testing Strategy

### Unit Tests

**To be added in future phases**:
- Encryption/decryption functions
- PKCE code generation and validation
- CORS header generation
- API retry logic

### Integration Tests

**Manual testing required**:
1. Complete OAuth flow with PKCE
2. Save encrypted credentials
3. Fetch listings with view/watch counts
4. Token refresh with encrypted credentials
5. Disconnect and reconnect

### Manual Testing Steps

#### Phase 1 Testing:
1. **Database Migration**:
   - Run migration
   - Verify columns exist: `\d listings` in psql
   - Check listings page displays counts

2. **Credential Encryption**:
   - Save new eBay credentials in AdminSettings
   - Verify encrypted in database: `SELECT ebay_cert_id_encrypted FROM users LIMIT 1;`
   - Test OAuth flow completes successfully

3. **Test Functions Removed**:
   - Try accessing `/.netlify/functions/test-ebay-token` (should 404)
   - Verify dev functions exist in `functions-dev/`

#### Phase 2 Testing:
1. **PKCE**:
   - Open browser DevTools Network tab
   - Initiate OAuth flow
   - Verify eBay authorization URL includes `code_challenge` parameter
   - Complete OAuth flow successfully

2. **CORS**:
   - Test from unauthorized origin (should fail)
   - Test from production domain (should succeed)

3. **Encryption Key Requirement**:
   - Deploy without ENCRYPTION_KEY env var (should fail)
   - Add ENCRYPTION_KEY and deploy (should succeed)

4. **API Retry**:
   - Use Chrome DevTools to throttle network
   - Trigger API call
   - Verify retries in console (dev mode)

#### Phase 3 Testing:
1. **Toast Notifications**:
   - Trigger OAuth error
   - Verify toast appears (not browser alert)
   - Verify auto-dismiss after 5s

2. **Production Logging**:
   - Build frontend for production
   - Check no console.log in output
   - Verify logger only logs in dev mode

## Performance Considerations

- **Database Indexes**: Added indexes on view_count, watch_count, last_synced_at for query performance
- **API Retry**: Exponential backoff prevents flooding server
- **CORS Check**: Minimal overhead for origin validation
- **Encryption**: Negligible performance impact (AES-256-CBC is fast)

## Migration Notes

### Migrating Existing Users

**Encrypted Credentials**:
- Existing `ebay_cert_id` values will be encrypted on next save
- Users don't need to re-enter credentials
- OAuth tokens remain valid

**PKCE Migration**:
- Existing OAuth flows use old method (no PKCE)
- New OAuth flows use PKCE
- Users will be prompted to reconnect on next login (optional)

**No Breaking Changes**:
- All changes are backwards compatible
- Existing tokens continue to work
- Database migrations are additive (no data loss)

### Rollback Plan

If issues arise:
1. **Phase 1**: Revert database migration via `ALTER TABLE listings DROP COLUMN ...`
2. **Phase 2**: Revert CORS to `*`, disable PKCE check
3. **Phase 3**: Restore backend directory from git history

## References

- Original research: `/Users/peternelson/Projects/ebay-price-reducer/research/2025-10-02_integration_review.md`
- Database schema: `/Users/peternelson/Projects/ebay-price-reducer/supabase-schema.sql`
- Token migration: `/Users/peternelson/Projects/ebay-price-reducer/DATABASE-USER-EBAY-TOKENS.sql`
- Netlify config: `/Users/peternelson/Projects/ebay-price-reducer/netlify.toml`
- OAuth implementation: `/Users/peternelson/Projects/ebay-price-reducer/netlify/functions/ebay-oauth.js`

## Implementation Order

Execute in this order to minimize risk:

1. **Phase 1** (Critical - Complete First)
   - Run database migrations
   - Implement credential encryption
   - Remove test functions
   - Deploy and verify

2. **Phase 2** (Security - Complete Second)
   - Implement PKCE
   - Restrict CORS
   - Require encryption key
   - Add API retry
   - Deploy and verify

3. **Phase 3** (Cleanup - Complete Last)
   - Archive backend
   - Update documentation
   - Add toast notifications
   - Environment logging
   - Deploy and verify

Each phase should be tested thoroughly before proceeding to the next.
