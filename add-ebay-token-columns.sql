-- Add eBay token expiration columns to users table
-- These columns are needed for OAuth token management

ALTER TABLE users
ADD COLUMN IF NOT EXISTS ebay_token_expires_at TIMESTAMPTZ;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS ebay_refresh_token_expires_at TIMESTAMPTZ;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS ebay_user_id TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS ebay_connection_status TEXT DEFAULT 'disconnected';

ALTER TABLE users
ADD COLUMN IF NOT EXISTS ebay_connected_at TIMESTAMPTZ;

COMMENT ON COLUMN users.ebay_token_expires_at IS 'When the eBay access token expires';
COMMENT ON COLUMN users.ebay_refresh_token_expires_at IS 'When the eBay refresh token expires';
COMMENT ON COLUMN users.ebay_user_id IS 'eBay user ID from OAuth';
COMMENT ON COLUMN users.ebay_connection_status IS 'Current connection status: connected, disconnected, error';
COMMENT ON COLUMN users.ebay_connected_at IS 'When the user connected their eBay account';
