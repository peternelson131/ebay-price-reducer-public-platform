# 📦 Database Deployment Instructions

## Quick Deploy to Supabase

### Step 1: Open Supabase SQL Editor
1. Go to your Supabase project dashboard
2. Click on "SQL Editor" in the left sidebar
3. Click "New Query"

### Step 2: Run the Schema
1. Copy the entire contents of `supabase-listings-schema.sql`
2. Paste into the SQL editor
3. Click "Run" button (or press Cmd/Ctrl + Enter)

### Step 3: Verify Tables Created
After running, verify these tables exist in the Table Editor:
- ✅ `listings` - Main listings table
- ✅ `price_history` - Price tracking
- ✅ `sync_queue` - Background jobs
- ✅ `webhook_events` - Event tracking
- ✅ `sync_metrics` - Performance metrics

### Step 4: Check Materialized Views
In SQL Editor, run:
```sql
SELECT * FROM user_listing_stats LIMIT 1;
SELECT * FROM category_stats LIMIT 1;
```

## 🎯 What This Enables

Once deployed, you'll have:
1. **Database-backed listings** - Store all eBay data locally
2. **Price history tracking** - Automatic price change logging
3. **Background sync queue** - Intelligent data synchronization
4. **Performance metrics** - Track API usage and performance
5. **Row-level security** - Users can only see their own data

## 🚀 Next Step: Initial Data Sync

After the database is deployed, trigger the initial sync:

```bash
# Import your existing eBay listings into the database
curl -X POST https://dainty-horse-49c336.netlify.app/.netlify/functions/sync-service \
  -H "Content-Type: application/json" \
  -d '{"initial": true}'
```

## 📊 Monitor Progress

Check sync status:
```bash
curl https://dainty-horse-49c336.netlify.app/.netlify/functions/sync-service
```

## 🔄 Enable the New Optimized Page

To use the new high-performance listings page, update your frontend routing:

1. **Option A - Test alongside existing page:**
   Navigate to: `https://dainty-horse-49c336.netlify.app/listings-optimized`

2. **Option B - Replace existing page:**
   We'll update the routing once database is ready.

## ⚡ Expected Results

After deployment:
- Page loads in <100ms (vs 2000ms+)
- No more eBay rate limit errors
- Support for 10,000+ listings
- Real-time sync status
- Advanced filtering and search

## 🆘 Troubleshooting

If you see errors:
1. Check that all extensions are enabled (uuid-ossp, pg_trgm, btree_gin)
2. Ensure you're using the correct Supabase project
3. Verify auth.users table exists (Supabase Auth should be enabled)

## 📝 Notes

- The schema is idempotent - safe to run multiple times
- Uses `IF NOT EXISTS` to prevent duplicate errors
- Row-level security is automatically configured
- Materialized views will be empty until data is synced