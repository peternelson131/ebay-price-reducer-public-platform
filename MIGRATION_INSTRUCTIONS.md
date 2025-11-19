# Database Migration Instructions

This document provides instructions for running the required database migrations manually.

## Overview

The following migrations need to be run against your Supabase database. You must have your database credentials and `psql` installed to run these migrations.

## Prerequisites

1. Install `psql` (PostgreSQL client):
   - macOS: `brew install postgresql`
   - Ubuntu/Debian: `sudo apt-get install postgresql-client`
   - Windows: Download from https://www.postgresql.org/download/windows/

2. Get your DATABASE_URL from Supabase:
   - Go to your Supabase project settings
   - Navigate to Database > Connection string
   - Copy the connection string (it should start with `postgresql://`)

## Migration 1: Add Listing View/Watch Counts

This migration adds the `view_count`, `watch_count`, `hit_count`, and `last_synced_at` columns to the `listings` table.

**File**: `add-listing-view-watch-counts.sql`

**Run with**:
```bash
psql $DATABASE_URL -f add-listing-view-watch-counts.sql
```

Or if you need to specify the connection string directly:
```bash
psql "postgresql://your-connection-string-here" -f add-listing-view-watch-counts.sql
```

**Expected output**:
```
ALTER TABLE
COMMENT
CREATE INDEX
CREATE INDEX
CREATE INDEX
DROP MATERIALIZED VIEW
CREATE MATERIALIZED VIEW
CREATE UNIQUE INDEX
CREATE FUNCTION
DROP TRIGGER
CREATE TRIGGER
GRANT
GRANT
NOTICE:  Successfully added view_count, watch_count, hit_count, and last_synced_at columns to listings table
NOTICE:  Created indexes and updated materialized views
NOTICE:  Added automatic last_synced_at update trigger
```

## Migration 2: Encrypt eBay Credentials

This migration adds the `ebay_cert_id_encrypted` column to the `users` table for secure credential storage.

**File**: `encrypt-ebay-credentials.sql`

**Run with**:
```bash
psql $DATABASE_URL -f encrypt-ebay-credentials.sql
```

**Expected output**:
```
ALTER TABLE
CREATE FUNCTION
(function execution output)
COMMENT
```

## Verification

After running both migrations, verify they were applied successfully:

### Check listings table:
```bash
psql $DATABASE_URL -c "\d listings"
```

Look for these columns:
- `view_count` (integer)
- `watch_count` (integer)
- `hit_count` (integer)
- `last_synced_at` (timestamp with time zone)

### Check users table:
```bash
psql $DATABASE_URL -c "\d users"
```

Look for this column:
- `ebay_cert_id_encrypted` (text)

### Check indexes:
```bash
psql $DATABASE_URL -c "\d listings" | grep -E "(idx_listings_view_count|idx_listings_watch_count|idx_listings_last_synced_at)"
```

## Troubleshooting

### Error: "psql: command not found"
Install PostgreSQL client tools (see Prerequisites above).

### Error: "could not connect to server"
Check your DATABASE_URL is correct and your IP is whitelisted in Supabase settings.

### Error: "column already exists"
The migration has already been run. This is safe to ignore.

### Error: "permission denied"
Make sure you're using the correct database credentials with sufficient privileges.

## Rollback (if needed)

If you need to rollback these migrations:

### Rollback Migration 1:
```sql
DROP TRIGGER IF EXISTS update_listings_last_synced_at ON listings;
DROP FUNCTION IF EXISTS update_last_synced_at();
DROP MATERIALIZED VIEW IF EXISTS user_listing_stats CASCADE;
DROP INDEX IF EXISTS idx_listings_view_count;
DROP INDEX IF EXISTS idx_listings_watch_count;
DROP INDEX IF EXISTS idx_listings_last_synced_at;
ALTER TABLE listings DROP COLUMN IF EXISTS view_count;
ALTER TABLE listings DROP COLUMN IF EXISTS watch_count;
ALTER TABLE listings DROP COLUMN IF EXISTS hit_count;
ALTER TABLE listings DROP COLUMN IF EXISTS last_synced_at;
```

### Rollback Migration 2:
```sql
DROP FUNCTION IF EXISTS migrate_encrypt_cert_ids();
ALTER TABLE users DROP COLUMN IF EXISTS ebay_cert_id_encrypted;
```

## Support

If you encounter issues running these migrations, check:
1. Supabase project status at https://app.supabase.com
2. Database logs in Supabase dashboard
3. Your network connection and firewall settings
