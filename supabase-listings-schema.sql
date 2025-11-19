-- =============================================
-- EBAY LISTINGS DATABASE SCHEMA
-- Three-tier architecture: Hot (Redis), Warm (PostgreSQL), Cold (Storage)
-- =============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For composite indexes

-- =============================================
-- CORE TABLES
-- =============================================

-- Main listings table with partitioning support
CREATE TABLE IF NOT EXISTS listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- eBay identifiers
    ebay_item_id VARCHAR(100) UNIQUE,
    sku VARCHAR(100) NOT NULL,

    -- Basic listing information
    title TEXT NOT NULL,
    description TEXT,
    category VARCHAR(255),
    category_id VARCHAR(100),
    condition VARCHAR(50),
    listing_format VARCHAR(50) DEFAULT 'FixedPriceItem',
    listing_status VARCHAR(50) DEFAULT 'Active',

    -- Pricing information
    current_price DECIMAL(10,2) NOT NULL,
    original_price DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'USD',
    minimum_price DECIMAL(10,2),

    -- Inventory
    quantity INTEGER DEFAULT 1,
    quantity_available INTEGER DEFAULT 1,
    quantity_sold INTEGER DEFAULT 0,

    -- Images and media
    image_urls JSONB DEFAULT '[]'::jsonb,
    primary_image_url TEXT,

    -- Price reduction settings
    price_reduction_enabled BOOLEAN DEFAULT false,
    reduction_strategy VARCHAR(50) DEFAULT 'fixed_percentage',
    reduction_percentage DECIMAL(5,2) DEFAULT 5,
    reduction_interval INTEGER DEFAULT 7, -- days
    last_price_reduction TIMESTAMP WITH TIME ZONE,
    total_reductions INTEGER DEFAULT 0,

    -- eBay specific attributes (flexible)
    ebay_attributes JSONB DEFAULT '{}'::jsonb,

    -- Sync metadata
    last_synced TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sync_status VARCHAR(50) DEFAULT 'pending',
    sync_error TEXT,
    data_checksum VARCHAR(64), -- For detecting changes

    -- Timestamps
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP WITH TIME ZONE -- Soft delete
);

-- Price history table for tracking changes
CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    price DECIMAL(10,2) NOT NULL,
    previous_price DECIMAL(10,2),
    change_type VARCHAR(50), -- 'manual', 'automatic', 'sync'
    change_reason TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for price_history
CREATE INDEX IF NOT EXISTS idx_price_history_listing ON price_history(listing_id);
CREATE INDEX IF NOT EXISTS idx_price_history_timestamp ON price_history(timestamp DESC);

-- Sync queue for background processing
CREATE TABLE IF NOT EXISTS sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_type VARCHAR(50) NOT NULL, -- 'full_sync', 'price_update', 'inventory_check'
    priority INTEGER DEFAULT 5, -- 1-10, lower is higher priority
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    payload JSONB DEFAULT '{}'::jsonb,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Webhook events tracking
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    event_id VARCHAR(255) UNIQUE,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Performance metrics table
CREATE TABLE IF NOT EXISTS sync_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    metric_type VARCHAR(50), -- 'api_call', 'sync_duration', 'cache_hit'
    value DECIMAL(10,2),
    metadata JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Listings table indexes
CREATE INDEX IF NOT EXISTS idx_listings_user_id ON listings(user_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_listings_sku ON listings(sku) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(listing_status) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_listings_sync_status ON listings(sync_status);
CREATE INDEX IF NOT EXISTS idx_listings_last_synced ON listings(last_synced DESC);
CREATE INDEX IF NOT EXISTS idx_listings_price_range ON listings(current_price) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_listings_reduction_enabled ON listings(price_reduction_enabled) WHERE archived_at IS NULL;

-- Full text search index
CREATE INDEX IF NOT EXISTS idx_listings_search ON listings USING gin(
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
) WHERE archived_at IS NULL;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_listings_user_status ON listings(user_id, listing_status)
    WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_listings_user_category ON listings(user_id, category_id)
    WHERE archived_at IS NULL;

-- Sync queue indexes
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, scheduled_for)
    WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_sync_queue_user ON sync_queue(user_id, status);

-- =============================================
-- MATERIALIZED VIEWS FOR FAST QUERIES
-- =============================================

-- Aggregated stats per user
CREATE MATERIALIZED VIEW IF NOT EXISTS user_listing_stats AS
SELECT
    user_id,
    COUNT(*) as total_listings,
    COUNT(*) FILTER (WHERE listing_status = 'Active') as active_listings,
    COUNT(*) FILTER (WHERE price_reduction_enabled = true) as reduction_enabled,
    AVG(current_price) as avg_price,
    SUM(quantity_sold) as total_sold,
    MAX(last_synced) as last_sync
FROM listings
WHERE archived_at IS NULL
GROUP BY user_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_listing_stats ON user_listing_stats(user_id);

-- Category aggregations
CREATE MATERIALIZED VIEW IF NOT EXISTS category_stats AS
SELECT
    category_id,
    category,
    COUNT(*) as listing_count,
    AVG(current_price) as avg_price,
    MIN(current_price) as min_price,
    MAX(current_price) as max_price
FROM listings
WHERE archived_at IS NULL AND listing_status = 'Active'
GROUP BY category_id, category;

CREATE INDEX IF NOT EXISTS idx_category_stats ON category_stats(category_id);

-- =============================================
-- FUNCTIONS AND TRIGGERS
-- =============================================

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_listings_updated_at ON listings;
CREATE TRIGGER update_listings_updated_at
    BEFORE UPDATE ON listings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Price change trigger
CREATE OR REPLACE FUNCTION log_price_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.current_price IS DISTINCT FROM NEW.current_price THEN
        INSERT INTO price_history (listing_id, price, previous_price, change_type)
        VALUES (NEW.id, NEW.current_price, OLD.current_price, 'sync');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS track_price_changes ON listings;
CREATE TRIGGER track_price_changes
    AFTER UPDATE ON listings
    FOR EACH ROW
    WHEN (OLD.current_price IS DISTINCT FROM NEW.current_price)
    EXECUTE FUNCTION log_price_change();

-- Calculate data checksum for change detection
CREATE OR REPLACE FUNCTION calculate_listing_checksum(listing_data JSONB)
RETURNS VARCHAR AS $$
BEGIN
    RETURN encode(digest(listing_data::text, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Refresh materialized views function
CREATE OR REPLACE FUNCTION refresh_stats_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_listing_stats;
    REFRESH MATERIALIZED VIEW CONCURRENTLY category_stats;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;

-- Listings policies
DROP POLICY IF EXISTS "Users can view own listings" ON listings;
CREATE POLICY "Users can view own listings" ON listings
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own listings" ON listings;
CREATE POLICY "Users can update own listings" ON listings
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own listings" ON listings;
CREATE POLICY "Users can insert own listings" ON listings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Price history policies
DROP POLICY IF EXISTS "Users can view own price history" ON price_history;
CREATE POLICY "Users can view own price history" ON price_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM listings
            WHERE listings.id = price_history.listing_id
            AND listings.user_id = auth.uid()
        )
    );

-- Sync queue policies
DROP POLICY IF EXISTS "Users can view own sync jobs" ON sync_queue;
CREATE POLICY "Users can view own sync jobs" ON sync_queue
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own sync jobs" ON sync_queue;
CREATE POLICY "Users can create own sync jobs" ON sync_queue
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =============================================
-- INITIAL DATA AND CONFIGURATION
-- =============================================

-- Insert default sync job for new users
CREATE OR REPLACE FUNCTION create_initial_sync_job()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO sync_queue (user_id, job_type, priority)
    VALUES (NEW.id, 'full_sync', 1);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: Partitioning can be added later with:
-- CREATE TABLE price_history_YYYY_MM (LIKE price_history INCLUDING ALL);
-- ALTER TABLE price_history_YYYY_MM ADD CONSTRAINT check_timestamp
--   CHECK (timestamp >= 'YYYY-MM-01' AND timestamp < 'YYYY-MM-01'::date + interval '1 month');
-- ALTER TABLE price_history_YYYY_MM INHERIT price_history;