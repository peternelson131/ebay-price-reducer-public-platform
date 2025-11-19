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
