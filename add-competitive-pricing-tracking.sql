-- Add competitive pricing tracking columns
-- This migration adds columns to track pricing analysis status and results

-- Add column to track if listing has been analyzed
-- This prevents re-analyzing listings that have already been processed
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS price_analysis_completed BOOLEAN DEFAULT FALSE;

-- Create index for efficient queries (partial index for better performance)
CREATE INDEX IF NOT EXISTS idx_listings_analysis_status
ON listings(price_analysis_completed)
WHERE price_analysis_completed = FALSE;

-- Add column to track which matching tier was used
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS price_match_tier TEXT;

-- Update existing listings to mark as not analyzed
UPDATE listings
SET price_analysis_completed = FALSE
WHERE price_analysis_completed IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN listings.price_analysis_completed IS 'Indicates if competitive pricing analysis has been completed for this listing';
COMMENT ON COLUMN listings.price_match_tier IS 'Which search tier was used: gtin, title_category, title_only, no_matches, or error';
