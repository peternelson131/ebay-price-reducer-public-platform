-- Add listing_url column to listings table
-- This column will store the direct URL to the eBay listing

-- Add listing_url column if it doesn't exist
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS listing_url TEXT;

-- Add index for faster lookups (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_listings_url ON listings(listing_url);

-- Backfill existing listings with constructed URLs from ebay_item_id
-- This ensures existing listings have URLs even before next sync
UPDATE listings
SET listing_url = 'https://www.ebay.com/itm/' || ebay_item_id
WHERE listing_url IS NULL AND ebay_item_id IS NOT NULL;

-- Verify the column was added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'listings' AND column_name = 'listing_url';
