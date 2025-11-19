-- Migration: Add Keepa Integration Support
-- Description: Adds tables and columns for Keepa API integration with security and performance optimizations

-- Add Keepa-related columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS keepa_api_key TEXT,
ADD COLUMN IF NOT EXISTS keepa_api_valid BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS keepa_tokens_left INTEGER,
ADD COLUMN IF NOT EXISTS keepa_last_validated TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS keepa_subscription_level TEXT CHECK (keepa_subscription_level IN ('basic', 'premium', 'enterprise'));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_keepa_valid ON users(keepa_api_valid) WHERE keepa_api_valid = TRUE;

-- Table for Keepa product analysis cache
CREATE TABLE IF NOT EXISTS keepa_product_analysis (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    asin TEXT NOT NULL,
    domain TEXT DEFAULT 'com',
    product_data JSONB NOT NULL,
    analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '6 hours'),

    -- Composite unique constraint
    CONSTRAINT unique_user_product UNIQUE(user_id, asin, domain)
);

-- Indexes for performance
CREATE INDEX idx_keepa_analysis_user_id ON keepa_product_analysis(user_id);
CREATE INDEX idx_keepa_analysis_asin ON keepa_product_analysis(asin);
CREATE INDEX idx_keepa_analysis_expires ON keepa_product_analysis(expires_at);
CREATE INDEX idx_keepa_product_data_gin ON keepa_product_analysis USING gin(product_data);

-- Table for Keepa price tracking
CREATE TABLE IF NOT EXISTS keepa_price_tracking (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    asin TEXT NOT NULL,
    domain TEXT DEFAULT 'com',
    target_price DECIMAL(10,2) NOT NULL,
    current_price DECIMAL(10,2),
    tracking_id TEXT,
    active BOOLEAN DEFAULT TRUE,
    notification_sent BOOLEAN DEFAULT FALSE,
    price_reached_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Composite index for active tracking
    CONSTRAINT unique_active_tracking UNIQUE(user_id, asin, domain, active)
);

-- Indexes for price tracking
CREATE INDEX idx_keepa_tracking_active ON keepa_price_tracking(active) WHERE active = TRUE;
CREATE INDEX idx_keepa_tracking_user_id ON keepa_price_tracking(user_id);
CREATE INDEX idx_keepa_tracking_asin ON keepa_price_tracking(asin);

-- Table for competitor monitoring
CREATE TABLE IF NOT EXISTS keepa_competitor_analysis (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
    analysis_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Index for JSON queries
    INDEX idx_competitor_data_gin USING gin(analysis_data)
);

CREATE INDEX idx_keepa_competitor_user_id ON keepa_competitor_analysis(user_id);
CREATE INDEX idx_keepa_competitor_listing_id ON keepa_competitor_analysis(listing_id);
CREATE INDEX idx_keepa_competitor_created ON keepa_competitor_analysis(created_at DESC);

-- Table for Keepa API usage tracking (for monitoring and rate limiting)
CREATE TABLE IF NOT EXISTS keepa_api_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    tokens_used INTEGER DEFAULT 1,
    response_time_ms INTEGER,
    status_code INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for API usage monitoring
CREATE INDEX idx_keepa_usage_user_id ON keepa_api_usage(user_id);
CREATE INDEX idx_keepa_usage_created ON keepa_api_usage(created_at DESC);
CREATE INDEX idx_keepa_usage_endpoint ON keepa_api_usage(endpoint);

-- Table for Keepa pricing recommendations
CREATE TABLE IF NOT EXISTS keepa_pricing_recommendations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
    asin TEXT NOT NULL,
    recommendation_data JSONB NOT NULL,
    applied BOOLEAN DEFAULT FALSE,
    applied_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_keepa_recommendations_user_id ON keepa_pricing_recommendations(user_id);
CREATE INDEX idx_keepa_recommendations_listing_id ON keepa_pricing_recommendations(listing_id);
CREATE INDEX idx_keepa_recommendations_applied ON keepa_pricing_recommendations(applied);

-- Add Keepa-related columns to listings table for cross-referencing
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS amazon_asin TEXT,
ADD COLUMN IF NOT EXISTS keepa_last_sync TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS keepa_score INTEGER,
ADD COLUMN IF NOT EXISTS amazon_sales_rank INTEGER,
ADD COLUMN IF NOT EXISTS amazon_category TEXT;

-- Create index for ASIN lookups
CREATE INDEX IF NOT EXISTS idx_listings_amazon_asin ON listings(amazon_asin) WHERE amazon_asin IS NOT NULL;

-- Row Level Security Policies
ALTER TABLE keepa_product_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE keepa_price_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE keepa_competitor_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE keepa_api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE keepa_pricing_recommendations ENABLE ROW LEVEL SECURITY;

-- Policies for keepa_product_analysis
CREATE POLICY "Users can view own Keepa analysis" ON keepa_product_analysis
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Keepa analysis" ON keepa_product_analysis
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own Keepa analysis" ON keepa_product_analysis
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own Keepa analysis" ON keepa_product_analysis
    FOR DELETE USING (auth.uid() = user_id);

-- Policies for keepa_price_tracking
CREATE POLICY "Users can view own price tracking" ON keepa_price_tracking
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own price tracking" ON keepa_price_tracking
    FOR ALL USING (auth.uid() = user_id);

-- Policies for keepa_competitor_analysis
CREATE POLICY "Users can view own competitor analysis" ON keepa_competitor_analysis
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own competitor analysis" ON keepa_competitor_analysis
    FOR ALL USING (auth.uid() = user_id);

-- Policies for keepa_api_usage
CREATE POLICY "Users can view own API usage" ON keepa_api_usage
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert API usage" ON keepa_api_usage
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policies for keepa_pricing_recommendations
CREATE POLICY "Users can view own pricing recommendations" ON keepa_pricing_recommendations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own pricing recommendations" ON keepa_pricing_recommendations
    FOR ALL USING (auth.uid() = user_id);

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_keepa_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM keepa_product_analysis
    WHERE expires_at < NOW();
END;
$$;

-- Function to track API usage
CREATE OR REPLACE FUNCTION track_keepa_api_usage(
    p_user_id UUID,
    p_endpoint TEXT,
    p_tokens INTEGER DEFAULT 1,
    p_response_time INTEGER DEFAULT NULL,
    p_status INTEGER DEFAULT 200,
    p_error TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO keepa_api_usage (
        user_id,
        endpoint,
        tokens_used,
        response_time_ms,
        status_code,
        error_message
    ) VALUES (
        p_user_id,
        p_endpoint,
        p_tokens,
        p_response_time,
        p_status,
        p_error
    );

    -- Update user's token count if successful
    IF p_status = 200 THEN
        UPDATE users
        SET keepa_tokens_left = GREATEST(0, COALESCE(keepa_tokens_left, 0) - p_tokens)
        WHERE id = p_user_id;
    END IF;
END;
$$;

-- Function to get user's daily API usage
CREATE OR REPLACE FUNCTION get_keepa_daily_usage(p_user_id UUID)
RETURNS TABLE (
    date DATE,
    total_calls INTEGER,
    total_tokens INTEGER,
    avg_response_time FLOAT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT
        DATE(created_at) as date,
        COUNT(*)::INTEGER as total_calls,
        SUM(tokens_used)::INTEGER as total_tokens,
        AVG(response_time_ms)::FLOAT as avg_response_time
    FROM keepa_api_usage
    WHERE user_id = p_user_id
        AND created_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(created_at)
    ORDER BY date DESC;
$$;

-- Create a scheduled job to clean up expired cache (requires pg_cron extension)
-- This should be run daily
-- SELECT cron.schedule('cleanup-keepa-cache', '0 2 * * *', 'SELECT cleanup_expired_keepa_cache();');

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;