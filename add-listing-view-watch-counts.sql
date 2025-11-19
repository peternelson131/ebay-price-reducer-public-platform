-- =============================================
-- ADD VIEW COUNT, WATCH COUNT, AND ENHANCED SYNC METADATA TO LISTINGS
-- Migration for eBay API optimization (Phase 2)
-- =============================================

-- Add archived_at column if it doesn't exist (needed for indexes)
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- Add new columns to listings table
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS watch_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS hit_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Add comments for documentation
COMMENT ON COLUMN listings.view_count IS 'Number of times the listing has been viewed (from eBay Trading API)';
COMMENT ON COLUMN listings.watch_count IS 'Number of watchers for this listing (from eBay Trading API)';
COMMENT ON COLUMN listings.hit_count IS 'Total hit count from eBay (alternative to view_count)';
COMMENT ON COLUMN listings.last_synced_at IS 'Timestamp of last successful sync from eBay API';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_listings_view_count ON listings(view_count DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_listings_watch_count ON listings(watch_count DESC) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_listings_last_synced_at ON listings(last_synced_at DESC);

-- Update the user_listing_stats materialized view to include new stats
DROP MATERIALIZED VIEW IF EXISTS user_listing_stats CASCADE;

CREATE MATERIALIZED VIEW user_listing_stats AS
SELECT
    user_id,
    COUNT(*) as total_listings,
    COUNT(*) FILTER (WHERE listing_status = 'Active') as active_listings,
    COUNT(*) FILTER (WHERE price_reduction_enabled = true) as reduction_enabled,
    AVG(current_price) as avg_price,
    AVG(view_count) as avg_views,
    AVG(watch_count) as avg_watchers,
    MAX(last_synced_at) as last_synced_at
FROM listings
WHERE archived_at IS NULL
GROUP BY user_id;

CREATE UNIQUE INDEX idx_user_listing_stats ON user_listing_stats(user_id);

-- Add function to update last_synced_at automatically
CREATE OR REPLACE FUNCTION update_last_synced_at()
RETURNS TRIGGER AS $$
BEGIN
    -- Update last_synced_at when listing data changes from sync
    IF TG_OP = 'UPDATE' AND (
        OLD.current_price IS DISTINCT FROM NEW.current_price OR
        OLD.quantity IS DISTINCT FROM NEW.quantity OR
        OLD.view_count IS DISTINCT FROM NEW.view_count OR
        OLD.watch_count IS DISTINCT FROM NEW.watch_count
    ) THEN
        NEW.last_synced_at = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS update_listings_last_synced_at ON listings;
CREATE TRIGGER update_listings_last_synced_at
    BEFORE UPDATE ON listings
    FOR EACH ROW
    EXECUTE FUNCTION update_last_synced_at();

-- Grant necessary permissions
GRANT SELECT, UPDATE ON listings TO authenticated;
GRANT SELECT ON user_listing_stats TO authenticated;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Successfully added view_count, watch_count, hit_count, and last_synced_at columns to listings table';
    RAISE NOTICE 'Created indexes and updated materialized views';
    RAISE NOTICE 'Added automatic last_synced_at update trigger';
END $$;
