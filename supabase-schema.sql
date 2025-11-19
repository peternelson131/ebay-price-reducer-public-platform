-- eBay Price Reducer - Supabase Database Schema
-- Run this in your Supabase SQL editor to set up the database

-- Enable Row Level Security
ALTER database postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- Create custom types
CREATE TYPE listing_status AS ENUM ('Active', 'Ended', 'Completed');
CREATE TYPE listing_format AS ENUM ('FixedPriceItem', 'Auction', 'StoreInventory');
CREATE TYPE reduction_strategy AS ENUM ('fixed_percentage', 'market_based', 'time_based');
CREATE TYPE subscription_plan AS ENUM ('free', 'basic', 'premium');

-- Users table
CREATE TABLE users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- eBay credentials (encrypted)
    ebay_user_token TEXT,
    ebay_user_id TEXT,
    ebay_token_expires_at TIMESTAMP WITH TIME ZONE,
    ebay_credentials_valid BOOLEAN DEFAULT FALSE,

    -- User preferences
    default_reduction_strategy reduction_strategy DEFAULT 'fixed_percentage',
    default_reduction_percentage INTEGER DEFAULT 5 CHECK (default_reduction_percentage BETWEEN 1 AND 50),
    default_reduction_interval INTEGER DEFAULT 7 CHECK (default_reduction_interval BETWEEN 1 AND 30),
    email_notifications BOOLEAN DEFAULT TRUE,
    price_reduction_alerts BOOLEAN DEFAULT TRUE,

    -- Subscription info
    subscription_plan subscription_plan DEFAULT 'free',
    subscription_active BOOLEAN DEFAULT TRUE,
    subscription_expires_at TIMESTAMP WITH TIME ZONE,
    listing_limit INTEGER DEFAULT 10,

    -- Account status
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP WITH TIME ZONE,
    login_count INTEGER DEFAULT 0
);

-- Listings table
CREATE TABLE listings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- eBay listing data
    ebay_item_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    current_price DECIMAL(10,2) NOT NULL,
    original_price DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    category TEXT,
    category_id TEXT,
    condition TEXT,
    image_urls TEXT[],
    listing_format listing_format DEFAULT 'FixedPriceItem',
    quantity INTEGER DEFAULT 1,
    quantity_available INTEGER DEFAULT 1,
    listing_status listing_status DEFAULT 'Active',
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    view_count INTEGER DEFAULT 0,
    watch_count INTEGER DEFAULT 0,

    -- Price reduction settings
    price_reduction_enabled BOOLEAN DEFAULT FALSE,
    reduction_strategy reduction_strategy DEFAULT 'fixed_percentage',
    reduction_percentage INTEGER DEFAULT 5 CHECK (reduction_percentage BETWEEN 1 AND 50),
    minimum_price DECIMAL(10,2) NOT NULL,
    reduction_interval INTEGER DEFAULT 7 CHECK (reduction_interval BETWEEN 1 AND 30),
    last_price_reduction TIMESTAMP WITH TIME ZONE,
    next_price_reduction TIMESTAMP WITH TIME ZONE,

    -- Market analysis data
    market_average_price DECIMAL(10,2),
    market_lowest_price DECIMAL(10,2),
    market_highest_price DECIMAL(10,2),
    market_competitor_count INTEGER,
    last_market_analysis TIMESTAMP WITH TIME ZONE,

    -- System fields
    last_synced_with_ebay TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Price history table
CREATE TABLE price_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
    price DECIMAL(10,2) NOT NULL,
    reason TEXT NOT NULL, -- 'initial', 'scheduled_reduction', 'market_analysis', 'manual'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sync errors table
CREATE TABLE sync_errors (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
    error_message TEXT NOT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Monitor jobs table (for tracking scheduled jobs)
CREATE TABLE monitor_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_type TEXT NOT NULL, -- 'price_check', 'market_analysis', 'sync'
    status TEXT DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_listings_user_id ON listings(user_id);
CREATE INDEX idx_listings_ebay_item_id ON listings(ebay_item_id);
CREATE INDEX idx_listings_status ON listings(listing_status);
CREATE INDEX idx_listings_price_reduction ON listings(next_price_reduction, price_reduction_enabled);
CREATE INDEX idx_listings_last_synced ON listings(last_synced_with_ebay);
CREATE INDEX idx_price_history_listing_id ON price_history(listing_id);
CREATE INDEX idx_price_history_created_at ON price_history(created_at);
CREATE INDEX idx_sync_errors_listing_id ON sync_errors(listing_id);
CREATE INDEX idx_monitor_jobs_type_status ON monitor_jobs(job_type, status);

-- Updated at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_listings_updated_at BEFORE UPDATE ON listings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_errors ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

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

-- Sync errors policies
CREATE POLICY "Users can view own sync errors" ON sync_errors
    FOR SELECT USING (
        auth.uid() = (SELECT user_id FROM listings WHERE id = listing_id)
    );

CREATE POLICY "System can insert sync errors" ON sync_errors
    FOR INSERT WITH CHECK (
        auth.uid() = (SELECT user_id FROM listings WHERE id = listing_id)
    );

-- Functions for price reduction logic
CREATE OR REPLACE FUNCTION calculate_next_reduction_date(
    last_reduction TIMESTAMP WITH TIME ZONE,
    reduction_interval INTEGER
)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT (COALESCE(last_reduction, NOW()) + (reduction_interval || ' days')::INTERVAL);
$$;

CREATE OR REPLACE FUNCTION is_price_reduction_due(
    price_reduction_enabled BOOLEAN,
    current_price DECIMAL,
    minimum_price DECIMAL,
    next_reduction TIMESTAMP WITH TIME ZONE
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT
        price_reduction_enabled = TRUE
        AND current_price > minimum_price
        AND (next_reduction IS NULL OR next_reduction <= NOW());
$$;

-- Function to get listings due for price reduction
CREATE OR REPLACE FUNCTION get_listings_due_for_reduction()
RETURNS TABLE (
    listing_id UUID,
    user_id UUID,
    ebay_item_id TEXT,
    current_price DECIMAL,
    minimum_price DECIMAL,
    reduction_strategy reduction_strategy,
    reduction_percentage INTEGER
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
        AND (l.next_price_reduction IS NULL OR l.next_price_reduction <= NOW());
$$;

-- Function to record price reduction
CREATE OR REPLACE FUNCTION record_price_reduction(
    p_listing_id UUID,
    p_new_price DECIMAL,
    p_reason TEXT,
    p_reduction_interval INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update listing price
    UPDATE listings
    SET
        current_price = p_new_price,
        last_price_reduction = NOW(),
        next_price_reduction = calculate_next_reduction_date(NOW(), p_reduction_interval),
        updated_at = NOW()
    WHERE id = p_listing_id;

    -- Record in price history
    INSERT INTO price_history (listing_id, price, reason)
    VALUES (p_listing_id, p_new_price, p_reason);
END;
$$;

-- Insert sample data (optional - remove in production)
/*
INSERT INTO users (id, email, name) VALUES
('00000000-0000-0000-0000-000000000001', 'demo@example.com', 'Demo User');

INSERT INTO listings (
    user_id, ebay_item_id, title, current_price, original_price,
    minimum_price, category, condition, price_reduction_enabled
) VALUES
(
    '00000000-0000-0000-0000-000000000001',
    '123456789',
    'Vintage Camera - Canon AE-1 35mm Film Camera',
    189.99,
    229.99,
    150.00,
    'Electronics',
    'Used',
    TRUE
);
*/

-- Grant necessary permissions for Supabase functions
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;