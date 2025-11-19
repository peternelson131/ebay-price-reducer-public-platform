# 🚀 QUICK START - Run Missing Database Migration

**Status:** ⚠️ Required columns are missing from your database
**Action:** Run the SQL migration below in your Supabase dashboard

---

## 🎯 What You Need to Do

### Step 1: Open Supabase SQL Editor
1. Go to: https://supabase.com/dashboard/project/zxcdkanccbdeqebnabgg
2. Click: **SQL Editor** (left sidebar)
3. Click: **New Query**

### Step 2: Copy & Run This Migration

Copy the contents of this file:
```
/Users/peternelson/Projects/ebay-price-reducer/add-listing-view-watch-counts.sql
```

**OR** run this command to view the file:
```bash
cat add-listing-view-watch-counts.sql
```

Then paste into Supabase SQL Editor and click **Run**.

---

## 📄 Migration Preview

The migration adds these essential columns to your `listings` table:

```sql
-- Add new columns to listings table
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS watch_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS hit_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
```

Plus indexes, triggers, and materialized views for optimal performance.

---

## ✅ Step 3: Verify Migration

After running the migration, verify it worked:

```bash
node check-db-migration.js
```

**Expected output:**
```
✅ MIGRATION STATUS: COMPLETE
✓ view_count
✓ watch_count
✓ hit_count
✓ last_synced_at
```

---

## 🔍 Why This Is Needed

These columns are required for:
- ✅ Tracking eBay listing views and watchers
- ✅ eBay API optimization (Phase 2)
- ✅ Display metrics in the UI
- ✅ Intelligent sync scheduling based on activity

**Without this migration:**
- ❌ eBay sync will fail with "column does not exist" errors
- ❌ UI won't display view/watch count data
- ❌ API optimization features won't work

---

## 📊 What Gets Created

### 4 New Columns
| Column | Type | Purpose |
|--------|------|---------|
| `view_count` | INTEGER | Number of views from eBay |
| `watch_count` | INTEGER | Number of watchers on eBay |
| `hit_count` | INTEGER | Total hits from eBay (alternative metric) |
| `last_synced_at` | TIMESTAMP | Last successful sync time |

### 3 New Indexes
- Fast queries on view count (sorted DESC)
- Fast queries on watch count (sorted DESC)
- Sync tracking by last_synced_at

### 1 Updated View
- `user_listing_stats` - Now includes avg_views and avg_watchers

### 1 New Trigger
- Auto-updates `last_synced_at` when listing data changes

---

## ⚡ Quick Command Reference

### View the migration file:
```bash
cat add-listing-view-watch-counts.sql
```

### Run verification:
```bash
node check-db-migration.js
```

### Test eBay sync after migration:
```bash
# Your eBay sync command here
npm run sync-ebay-listings
```

---

## 🛟 Troubleshooting

### Migration doesn't run?
- Make sure you're logged into Supabase as the project owner
- Check you're in the correct project (zxcdkanccbdeqebnabgg)
- Verify SQL Editor has permissions

### Verification script shows "INCOMPLETE"?
- Re-run the migration
- Check for errors in Supabase SQL Editor output
- The migration is idempotent (safe to run multiple times)

### Still having issues?
Run this SQL to manually check:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'listings'
  AND column_name IN ('view_count', 'watch_count', 'hit_count', 'last_synced_at')
ORDER BY column_name;
```

Should return 4 rows.

---

## ✨ Summary

**File to run:** `add-listing-view-watch-counts.sql`
**Where to run it:** Supabase SQL Editor
**How to verify:** `node check-db-migration.js`
**Time required:** 2-3 minutes

**This is a critical migration - run it now to enable full eBay integration!**
