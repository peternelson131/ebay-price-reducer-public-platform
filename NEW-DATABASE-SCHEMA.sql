-- =============================================
-- EBAY PRICE REDUCER PUBLIC PLATFORM - DATABASE SCHEMA
-- Fresh database structure (no data migration)
-- Created: 2025-11-19
-- =============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For composite indexes

-- =============================================
-- CUSTOM TYPES
-- =============================================

CREATE TYPE listing_status AS ENUM ('Active', 'Ended', 'Completed');
CREATE TYPE listing_format AS ENUM ('FixedPriceItem', 'Auction', 'StoreInventory');
CREATE TYPE reduction_strategy AS ENUM ('fixed_percentage', 'market_based', 'time_based');
CREATE TYPE subscription_plan AS ENUM ('free', 'basic', 'premium');

-- =============================================
-- USERS TABLE (extends Supabase auth.users)
-- =============================================

CREATE TABLE IF NOT EXISTS public.users (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT,

    -- eBay OAuth tokens (user-level credentials)
    ebay_refresh_token TEXT,
    ebay_user_id TEXT,
    ebay_connected_at TIMESTAMPTZ,
    ebay_connection_status TEXT DEFAULT 'disconnected',

    -- eBay App Credentials (user provides their own)
    ebay_app_id TEXT,
    ebay_cert_id TEXT,
    ebay_dev_id TEXT,

    -- Keepa API
    keepa_api_key TEXT,

    -- User preferences
    default_reduction_strategy reduction_strategy DEFAULT 'fixed_percentage',
    default_reduction_percentage INTEGER DEFAULT 5 CHECK (default_reduction_percentage BETWEEN 1 AND 50),
    default_reduction_interval INTEGER DEFAULT 7 CHECK (default_reduction_interval BETWEEN 1 AND 30),
    email_notifications BOOLEAN DEFAULT TRUE,
    price_reduction_alerts BOOLEAN DEFAULT TRUE,

    -- Subscription
    subscription_plan subscription_plan DEFAULT 'free',
    subscription_active BOOLEAN DEFAULT TRUE,
    subscription_expires_at TIMESTAMPTZ,
    listing_limit INTEGER DEFAULT 10,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ,
    login_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

-- =============================================
-- OAUTH STATES TABLE (for eBay OAuth flow)
-- =============================================

CREATE TABLE IF NOT EXISTS oauth_states (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    state TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    code_verifier TEXT, -- For PKCE
    code_challenge TEXT, -- For PKCE
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes')
);

-- =============================================
-- LISTINGS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    -- eBay identifiers
    ebay_item_id TEXT UNIQUE,
    sku TEXT NOT NULL,

    -- Basic information
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    category_id TEXT,
    condition TEXT,
    listing_format listing_format DEFAULT 'FixedPriceItem',
    listing_status listing_status DEFAULT 'Active',

    -- Pricing
    current_price DECIMAL(10,2) NOT NULL,
    original_price DECIMAL(10,2),
    minimum_price DECIMAL(10,2),
    currency TEXT DEFAULT 'USD',

    -- Inventory
    quantity INTEGER DEFAULT 1,
    quantity_available INTEGER DEFAULT 1,
    quantity_sold INTEGER DEFAULT 0,

    -- Images
    image_urls JSONB DEFAULT '[]'::jsonb,
    primary_image_url TEXT,

    -- Price reduction settings
    price_reduction_enabled BOOLEAN DEFAULT FALSE,
    reduction_strategy reduction_strategy DEFAULT 'fixed_percentage',
    reduction_percentage DECIMAL(5,2) DEFAULT 5,
    reduction_interval INTEGER DEFAULT 7, -- days
    last_price_reduction TIMESTAMPTZ,
    next_price_reduction TIMESTAMPTZ,
    total_reductions INTEGER DEFAULT 0,

    -- eBay stats
    view_count INTEGER DEFAULT 0,
    watch_count INTEGER DEFAULT 0,

    -- Market analysis
    market_average_price DECIMAL(10,2),
    market_lowest_price DECIMAL(10,2),
    market_highest_price DECIMAL(10,2),
    market_competitor_count INTEGER,
    last_market_analysis TIMESTAMPTZ,

    -- eBay specific attributes
    ebay_attributes JSONB DEFAULT '{}'::jsonb,

    -- Sync metadata
    last_synced TIMESTAMPTZ DEFAULT NOW(),
    sync_status TEXT DEFAULT 'pending',
    sync_error TEXT,
    data_checksum TEXT,

    -- Timestamps
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    archived_at TIMESTAMPTZ, -- Soft delete
    hidden BOOLEAN DEFAULT FALSE
);

-- =============================================
-- PRICE HISTORY TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
    price DECIMAL(10,2) NOT NULL,
    previous_price DECIMAL(10,2),
    change_type TEXT, -- 'initial', 'scheduled_reduction', 'market_analysis', 'manual', 'sync'
    change_reason TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PRICE REDUCTION LOG TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS price_reduction_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
    ebay_item_id TEXT,
    old_price DECIMAL(10,2) NOT NULL,
    new_price DECIMAL(10,2) NOT NULL,
    reduction_type TEXT,
    status TEXT, -- 'success', 'failed', 'skipped'
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SYNC QUEUE TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL, -- 'full_sync', 'price_update', 'inventory_check'
    priority INTEGER DEFAULT 5, -- 1-10, lower is higher priority
    status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    payload JSONB DEFAULT '{}'::jsonb,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    scheduled_for TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SYNC ERRORS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS sync_errors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
    error_message TEXT NOT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- EBAY API LOGS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS ebay_api_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    api_call TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    error_message TEXT,
    rate_limit_remaining INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- EBAY CATEGORY ASPECTS CACHE
-- =============================================

CREATE TABLE IF NOT EXISTS ebay_category_aspects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id TEXT NOT NULL UNIQUE,
    category_name TEXT,
    aspects JSONB NOT NULL,
    allowed_conditions JSONB,
    condition_required BOOLEAN DEFAULT FALSE,
    last_fetched_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- STRATEGIES TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS strategies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    strategy_type reduction_strategy NOT NULL,
    config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SYSTEM STATE TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS system_state (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================

-- Users
CREATE INDEX IF NOT EXISTS idx_users_ebay_user_id ON users(ebay_user_id);
CREATE INDEX IF NOT EXISTS idx_users_ebay_connection_status ON users(ebay_connection_status);

-- OAuth states
CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states(state);
CREATE INDEX IF NOT EXISTS idx_oauth_states_user_id ON oauth_states(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);

-- Listings
CREATE INDEX IF NOT EXISTS idx_listings_user_id ON listings(user_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_listings_ebay_item_id ON listings(ebay_item_id);
CREATE INDEX IF NOT EXISTS idx_listings_sku ON listings(sku) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(listing_status) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_listings_price_reduction ON listings(next_price_reduction, price_reduction_enabled);
CREATE INDEX IF NOT EXISTS idx_listings_last_synced ON listings(last_synced);
CREATE INDEX IF NOT EXISTS idx_listings_user_status ON listings(user_id, listing_status) WHERE archived_at IS NULL;

-- Full text search
CREATE INDEX IF NOT EXISTS idx_listings_search ON listings USING gin(
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
) WHERE archived_at IS NULL;

-- Price history
CREATE INDEX IF NOT EXISTS idx_price_history_listing_id ON price_history(listing_id);
CREATE INDEX IF NOT EXISTS idx_price_history_timestamp ON price_history(timestamp DESC);

-- Price reduction log
CREATE INDEX IF NOT EXISTS idx_price_reduction_log_user_id ON price_reduction_log(user_id);
CREATE INDEX IF NOT EXISTS idx_price_reduction_log_listing_id ON price_reduction_log(listing_id);
CREATE INDEX IF NOT EXISTS idx_price_reduction_log_created_at ON price_reduction_log(created_at);

-- Sync queue
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, scheduled_for) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_sync_queue_user ON sync_queue(user_id, status);

-- Sync errors
CREATE INDEX IF NOT EXISTS idx_sync_errors_listing_id ON sync_errors(listing_id);

-- eBay API logs
CREATE INDEX IF NOT EXISTS idx_ebay_api_logs_user_id ON ebay_api_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ebay_api_logs_created_at ON ebay_api_logs(created_at);

-- eBay category aspects
CREATE INDEX IF NOT EXISTS idx_ebay_category_aspects_category_id ON ebay_category_aspects(category_id);

-- Strategies
CREATE INDEX IF NOT EXISTS idx_strategies_user_id ON strategies(user_id);

-- =============================================
-- TRIGGERS
-- =============================================

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_listings_updated_at
    BEFORE UPDATE ON listings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_strategies_updated_at
    BEFORE UPDATE ON strategies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Price change logging trigger
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

CREATE TRIGGER track_price_changes
    AFTER UPDATE ON listings
    FOR EACH ROW
    WHEN (OLD.current_price IS DISTINCT FROM NEW.current_price)
    EXECUTE FUNCTION log_price_change();

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_reduction_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE ebay_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

-- OAuth states policies
CREATE POLICY "Users can view own oauth states" ON oauth_states
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own oauth states" ON oauth_states
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own oauth states" ON oauth_states
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to oauth_states" ON oauth_states
    FOR ALL USING (auth.role() = 'service_role');

-- Listings policies
CREATE POLICY "Users can view own listings" ON listings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own listings" ON listings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own listings" ON listings
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own listings" ON listings
    FOR DELETE USING (auth.uid() = user_id);

-- Price history policies
CREATE POLICY "Users can view own price history" ON price_history
    FOR SELECT USING (
        auth.uid() = (SELECT user_id FROM listings WHERE id = listing_id)
    );

CREATE POLICY "System can insert price history" ON price_history
    FOR INSERT WITH CHECK (
        auth.uid() = (SELECT user_id FROM listings WHERE id = listing_id)
    );

-- Price reduction log policies
CREATE POLICY "Users can view own price reduction log" ON price_reduction_log
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert price reduction log" ON price_reduction_log
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Sync queue policies
CREATE POLICY "Users can view own sync jobs" ON sync_queue
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own sync jobs" ON sync_queue
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Sync errors policies
CREATE POLICY "Users can view own sync errors" ON sync_errors
    FOR SELECT USING (
        auth.uid() = (SELECT user_id FROM listings WHERE id = listing_id)
    );

CREATE POLICY "System can insert sync errors" ON sync_errors
    FOR INSERT WITH CHECK (
        auth.uid() = (SELECT user_id FROM listings WHERE id = listing_id)
    );

-- eBay API logs policies
CREATE POLICY "Users can view their own eBay API logs" ON ebay_api_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own eBay API logs" ON ebay_api_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Strategies policies
CREATE POLICY "Users can view own strategies" ON strategies
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own strategies" ON strategies
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own strategies" ON strategies
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own strategies" ON strategies
    FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- HELPER FUNCTIONS
-- =============================================

-- Clean up expired OAuth states
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS void AS $$
BEGIN
    DELETE FROM oauth_states WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Check if user has valid eBay token
CREATE OR REPLACE FUNCTION has_valid_ebay_token(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users
        WHERE id = user_uuid
        AND ebay_refresh_token IS NOT NULL
        AND ebay_connection_status = 'connected'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's eBay credentials
CREATE OR REPLACE FUNCTION get_user_ebay_credentials(user_uuid UUID)
RETURNS TABLE (
    refresh_token TEXT,
    ebay_user_id TEXT,
    app_id TEXT,
    cert_id TEXT,
    dev_id TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        users.ebay_refresh_token,
        users.ebay_user_id,
        users.ebay_app_id,
        users.ebay_cert_id,
        users.ebay_dev_id
    FROM users
    WHERE users.id = user_uuid
    AND users.ebay_refresh_token IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Calculate next reduction date
CREATE OR REPLACE FUNCTION calculate_next_reduction_date(
    last_reduction TIMESTAMPTZ,
    reduction_interval INTEGER
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT (COALESCE(last_reduction, NOW()) + (reduction_interval || ' days')::INTERVAL);
$$;

-- Get listings due for price reduction
CREATE OR REPLACE FUNCTION get_listings_due_for_reduction()
RETURNS TABLE (
    listing_id UUID,
    user_id UUID,
    ebay_item_id TEXT,
    current_price DECIMAL,
    minimum_price DECIMAL,
    reduction_strategy reduction_strategy,
    reduction_percentage DECIMAL
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT
        l.id,
        l.user_id,
        l.ebay_item_id,
        l.current_price,
        l.minimum_price,
        l.reduction_strategy,
        l.reduction_percentage
    FROM listings l
    WHERE
        l.listing_status = 'Active'
        AND l.price_reduction_enabled = TRUE
        AND l.current_price > l.minimum_price
        AND (l.next_price_reduction IS NULL OR l.next_price_reduction <= NOW())
        AND l.archived_at IS NULL;
$$;

-- =============================================
-- GRANT PERMISSIONS
-- =============================================

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =============================================
-- SCHEMA COMPLETE
-- =============================================

-- Run this script in your new Supabase project's SQL editor
-- It creates all tables, indexes, triggers, RLS policies, and functions
-- No data is included - only the structure
