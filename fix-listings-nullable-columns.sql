-- Make columns nullable that don't always have values from eBay sync
-- These columns should allow NULL because eBay API doesn't always provide them

ALTER TABLE listings
  ALTER COLUMN minimum_price DROP NOT NULL;

ALTER TABLE listings
  ALTER COLUMN sku DROP NOT NULL;

ALTER TABLE listings
  ALTER COLUMN original_price DROP NOT NULL;

ALTER TABLE listings
  ALTER COLUMN description DROP NOT NULL;

-- Verify the changes
SELECT
    column_name,
    is_nullable,
    data_type
FROM information_schema.columns
WHERE table_name = 'listings'
  AND column_name IN ('minimum_price', 'sku', 'original_price', 'description')
ORDER BY column_name;
