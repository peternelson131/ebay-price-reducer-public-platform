-- Create category aspects caching table
-- Migration: add-ebay-category-aspects-cache.sql
-- Purpose: Cache eBay category aspect requirements to reduce API calls and improve performance
-- Date: 2025-10-08

CREATE TABLE IF NOT EXISTS ebay_category_aspects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id VARCHAR(100) NOT NULL UNIQUE,
    category_name TEXT NOT NULL,
    aspects JSONB NOT NULL,              -- Full aspect metadata from eBay getItemAspectsForCategory API
    required_aspects TEXT[],             -- Quick access to required aspect names for validation
    last_fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_category_aspects_category_id ON ebay_category_aspects(category_id);
CREATE INDEX IF NOT EXISTS idx_category_aspects_expires ON ebay_category_aspects(expires_at);
CREATE INDEX IF NOT EXISTS idx_category_aspects_gin ON ebay_category_aspects USING GIN(aspects);

-- Comments for documentation
COMMENT ON TABLE ebay_category_aspects IS 'Cache for eBay category aspect requirements to reduce API calls. Expires after 7 days.';
COMMENT ON COLUMN ebay_category_aspects.aspects IS 'Full JSONB response from eBay getItemAspectsForCategory API containing aspect metadata, constraints, and allowed values';
COMMENT ON COLUMN ebay_category_aspects.required_aspects IS 'Array of required aspect names extracted from aspects for quick validation';
COMMENT ON COLUMN ebay_category_aspects.expires_at IS 'Cache expiration timestamp (default 7 days from creation) - entries should be refreshed when expired';
COMMENT ON COLUMN ebay_category_aspects.last_fetched_at IS 'Timestamp when aspects were last fetched from eBay API';
