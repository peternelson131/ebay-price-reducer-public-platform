-- Create unique constraint for upsert operations
-- This allows trigger-sync to use onConflict: 'user_id,ebay_item_id'

-- First, check if there are any duplicate records
SELECT user_id, ebay_item_id, COUNT(*)
FROM listings
WHERE archived_at IS NULL
GROUP BY user_id, ebay_item_id
HAVING COUNT(*) > 1;

-- If duplicates exist, you'll need to clean them up first:
-- DELETE FROM listings
-- WHERE id NOT IN (
--     SELECT DISTINCT ON (user_id, ebay_item_id) id
--     FROM listings
--     WHERE archived_at IS NULL
--     ORDER BY user_id, ebay_item_id, updated_at DESC
-- );

-- Drop old unique constraint on ebay_item_id only (if exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'listings_ebay_item_id_key'
    ) THEN
        ALTER TABLE listings DROP CONSTRAINT listings_ebay_item_id_key;
        RAISE NOTICE 'Dropped old constraint listings_ebay_item_id_key';
    END IF;
END $$;

-- Create the unique constraint on user_id + ebay_item_id
-- This is what Supabase upsert expects
ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_user_id_ebay_item_id_key;

ALTER TABLE listings
  ADD CONSTRAINT listings_user_id_ebay_item_id_key
  UNIQUE (user_id, ebay_item_id);

-- Verify the constraint was created
SELECT
    conname AS constraint_name,
    contype AS constraint_type,
    array_agg(attname ORDER BY attnum) AS columns
FROM pg_constraint
JOIN pg_attribute ON pg_attribute.attrelid = pg_constraint.conrelid
    AND pg_attribute.attnum = ANY(pg_constraint.conkey)
WHERE conrelid = 'listings'::regclass
  AND conname = 'listings_user_id_ebay_item_id_key'
GROUP BY conname, contype;
