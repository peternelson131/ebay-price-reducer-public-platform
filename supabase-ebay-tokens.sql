-- Add eBay token and connection status columns to users table if they don't exist
-- These columns store OAuth tokens and connection state

-- Add refresh token column (if not exists)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_refresh_token TEXT;

-- Add refresh token expiration column (if not exists)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_refresh_token_expires_at TIMESTAMP WITH TIME ZONE;

-- Add connection status columns (if not exists)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_connection_status TEXT DEFAULT 'not_connected';
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_connected_at TIMESTAMP WITH TIME ZONE;

-- Quick verification query to check if columns were added
-- Run this separately to verify:
-- SELECT column_name
-- FROM information_schema.columns
-- WHERE table_name = 'users'
-- AND column_name IN ('ebay_refresh_token', 'ebay_connection_status', 'ebay_connected_at');