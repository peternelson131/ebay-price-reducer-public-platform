# Database Migration Status Report

**Generated:** October 1, 2025
**Supabase Project:** zxcdkanccbdeqebnabgg.supabase.co

---

## 🔍 Current Status

### ✅ Completed
- **Listings Table:** EXISTS
- **Base Schema:** Likely implemented (table exists with basic columns)
- **Supabase Connection:** CONFIGURED and working

### ❌ Incomplete
- **View/Watch Count Columns:** MISSING
  - Missing: `view_count` column
  - Missing: `watch_count` column
  - Missing: `hit_count` column
  - Missing: `last_synced_at` column

---

## 📋 Migration Files Found

### Core Schema Files
1. **`supabase-schema.sql`** - Base schema (possibly already run)
2. **`supabase-listings-schema.sql`** - Detailed listings table schema

### User/Profile Migrations
3. **`create-complete-users-table.sql`** - Complete users table setup
4. **`USER-PROFILE-TRIGGER.sql`** - User profile automation
5. **`supabase-complete-migration.sql`** - Complete profiles table with Keepa support

### eBay Integration Migrations
6. **`supabase-ebay-columns.sql`** - eBay-specific columns
7. **`supabase-ebay-credentials.sql`** - eBay credentials storage
8. **`supabase-ebay-tokens.sql`** - eBay token management
9. **`add-ebay-credentials-column.sql`** - Additional eBay credentials
10. **`create-oauth-states-table.sql`** - OAuth state management
11. **`DATABASE-USER-EBAY-TOKENS.sql`** - User eBay tokens

### Keepa Integration Migrations
12. **`add-keepa-to-users.sql`** - Keepa API key storage
13. **`supabase-keepa-migration.sql`** - Simple Keepa integration
14. **`backend/src/database/migrations/003_add_keepa_integration.sql`** - Full Keepa tables

### ⚠️ PENDING - Critical Migration
15. **`add-listing-view-watch-counts.sql`** ⬅️ **NEEDS TO BE RUN**

---

## 🎯 Required Actions

### Priority 1: Run Missing Migration

The migration file **`add-listing-view-watch-counts.sql`** needs to be executed to add the following columns to the `listings` table:

- `view_count` (INTEGER, DEFAULT 0)
- `watch_count` (INTEGER, DEFAULT 0)
- `hit_count` (INTEGER, DEFAULT 0)
- `last_synced_at` (TIMESTAMP WITH TIME ZONE)

**This migration also includes:**
- Performance indexes on new columns
- Updated materialized views for statistics
- Automatic timestamp update trigger
- Row-level security policies

### How to Apply the Migration

#### Option 1: Via Supabase Dashboard (Recommended)
1. Open Supabase Dashboard: https://supabase.com/dashboard/project/zxcdkanccbdeqebnabgg
2. Navigate to: **SQL Editor** (left sidebar)
3. Click: **New Query**
4. Copy contents of: `/Users/peternelson/Projects/ebay-price-reducer/add-listing-view-watch-counts.sql`
5. Paste into SQL Editor
6. Click: **Run** (or press Cmd/Ctrl + Enter)
7. Verify: "Success" message appears

#### Option 2: Via Supabase CLI
```bash
# If you have Supabase CLI installed
supabase db push --file add-listing-view-watch-counts.sql
```

#### Option 3: Programmatically (Advanced)
```javascript
// Using Node.js with Supabase client
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const migration = fs.readFileSync('add-listing-view-watch-counts.sql', 'utf8');
await supabase.rpc('exec', { sql: migration });
```

---

## 🔄 Migration Tracking

### Migration Order (Recommended)
If setting up from scratch, run migrations in this order:

1. **Core Schema**
   - `supabase-listings-schema.sql` (base tables, indexes, RLS)

2. **User Management**
   - `create-complete-users-table.sql` (users table)
   - `USER-PROFILE-TRIGGER.sql` (auto-create profiles)

3. **eBay Integration**
   - `supabase-ebay-credentials.sql` (eBay credentials)
   - `create-oauth-states-table.sql` (OAuth flow)

4. **Keepa Integration** (if using)
   - `supabase-keepa-migration.sql` (simple Keepa API key storage)
   - OR `backend/src/database/migrations/003_add_keepa_integration.sql` (full Keepa tables)

5. **Enhanced Listings** ⬅️ **CURRENTLY NEEDED**
   - `add-listing-view-watch-counts.sql` (view/watch counts)

---

## ✅ Verification Steps

After running the migration, verify with:

### Method 1: Run Check Script
```bash
node check-db-migration.js
```

### Method 2: Manual Verification in Supabase
1. Go to: **Table Editor** > **listings**
2. Check columns exist:
   - ✓ `view_count`
   - ✓ `watch_count`
   - ✓ `hit_count`
   - ✓ `last_synced_at`

### Method 3: SQL Query
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'listings'
  AND column_name IN ('view_count', 'watch_count', 'hit_count', 'last_synced_at')
ORDER BY column_name;
```

Expected result: 4 rows returned

---

## 📊 Migration Impact

### What This Enables
- ✅ eBay API optimization (Phase 2 implementation)
- ✅ Listing performance metrics tracking
- ✅ View and watcher count display in UI
- ✅ Better sync tracking with `last_synced_at`
- ✅ Performance queries using indexed columns

### Data Impact
- **No data loss** - Uses `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- **Safe to run** - All columns have default values
- **Backwards compatible** - Existing queries still work

### Performance Impact
- **New indexes** added for fast queries on view/watch counts
- **Materialized view** updated to include new statistics
- **Trigger** added to auto-update `last_synced_at`

---

## 🚨 Troubleshooting

### Issue: Permission Denied
**Cause:** Not using service role key
**Fix:** Ensure you're logged into Supabase Dashboard as owner, or use service role key in API calls

### Issue: Column Already Exists
**Cause:** Migration already partially run
**Fix:** Migration uses `IF NOT EXISTS`, safe to re-run. Or drop columns first:
```sql
ALTER TABLE listings
DROP COLUMN IF EXISTS view_count,
DROP COLUMN IF EXISTS watch_count,
DROP COLUMN IF EXISTS hit_count,
DROP COLUMN IF EXISTS last_synced_at;
```

### Issue: Materialized View Error
**Cause:** View definition conflict
**Fix:** Migration drops and recreates view, should handle automatically

---

## 📁 File Locations

- **Migration to run:** `/Users/peternelson/Projects/ebay-price-reducer/add-listing-view-watch-counts.sql`
- **Check script:** `/Users/peternelson/Projects/ebay-price-reducer/check-db-migration.js`
- **All migrations:** `/Users/peternelson/Projects/ebay-price-reducer/*.sql`

---

## 🎯 Next Steps

1. **Immediate:** Run `add-listing-view-watch-counts.sql` migration
2. **Verify:** Run `node check-db-migration.js` to confirm
3. **Test:** Sync eBay listings to populate new columns
4. **Monitor:** Check that view/watch counts are being updated from eBay API

---

## 📝 Migration Content Preview

The migration adds these exact columns:

```sql
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS watch_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS hit_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
```

**Full migration file:** `add-listing-view-watch-counts.sql` (80 lines)
