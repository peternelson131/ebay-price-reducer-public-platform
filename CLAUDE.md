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
