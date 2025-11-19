-- Add primary_image_url column to listings table

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS primary_image_url TEXT;

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'listings'
  AND column_name = 'primary_image_url';
