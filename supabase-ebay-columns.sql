-- Add eBay Developer Credentials columns to users table if they don't exist
-- These columns store each user's eBay App credentials

-- Add eBay app credentials columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_app_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_cert_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_dev_id TEXT;

-- Add index for faster lookups (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_users_ebay_credentials
ON users(id)
WHERE ebay_app_id IS NOT NULL AND ebay_cert_id IS NOT NULL;

-- Quick verification query to check if columns were added
-- Run this separately to verify:
-- SELECT column_name
-- FROM information_schema.columns
-- WHERE table_name = 'users'
-- AND column_name IN ('ebay_app_id', 'ebay_cert_id', 'ebay_dev_id');