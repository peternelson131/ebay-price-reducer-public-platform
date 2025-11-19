-- Fix listings table schema to match current application needs
-- This migration adds missing columns and updates constraints

-- Add missing columns if they don't exist
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS sku VARCHAR(100);

-- Make sku nullable since eBay items don't always have SKUs
ALTER TABLE listings
  ALTER COLUMN sku DROP NOT NULL;

-- Add other missing columns that trigger-sync expects
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS watch_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hit_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

-- Create unique constraint on user_id + ebay_item_id (for upserts)
CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_user_ebay_item
  ON listings(user_id, ebay_item_id)
  WHERE archived_at IS NULL;

-- Drop the old unique constraint on ebay_item_id if it exists
-- (allows same item_id across different users)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'listings_ebay_item_id_key'
    ) THEN
        ALTER TABLE listings DROP CONSTRAINT listings_ebay_item_id_key;
    END IF;
END $$;

-- Verify the schema
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'listings'
  AND column_name IN ('sku', 'view_count', 'watch_count', 'hit_count', 'last_synced_at', 'ebay_item_id')
ORDER BY column_name;
