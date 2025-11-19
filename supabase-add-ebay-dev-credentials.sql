-- Add eBay Developer Credentials to Users Table
-- These are the app-level credentials needed for OAuth

-- Add columns to store eBay developer credentials
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_app_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_cert_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_dev_id TEXT;

-- Since these are app-level credentials (not user-specific),
-- we'll store them in the admin user's record
-- You can identify your admin user by email or create a specific admin account

-- Option 1: Update a specific admin user's credentials
-- UPDATE users
-- SET
--     ebay_app_id = 'YOUR_EBAY_APP_ID',
--     ebay_cert_id = 'YOUR_EBAY_CERT_ID',
--     ebay_dev_id = 'YOUR_EBAY_DEV_ID'
-- WHERE email = 'admin@yourdomain.com';

-- Option 2: Create a function to get the app credentials from any admin user
CREATE OR REPLACE FUNCTION get_ebay_app_credentials()
RETURNS TABLE (
    app_id TEXT,
    cert_id TEXT,
    dev_id TEXT
)
SECURITY DEFINER
AS $$
BEGIN
    -- Get credentials from the first user that has them configured
    -- In production, you might want to check for a specific admin role
    RETURN QUERY
    SELECT
        ebay_app_id,
        ebay_cert_id,
        ebay_dev_id
    FROM users
    WHERE ebay_app_id IS NOT NULL
        AND ebay_cert_id IS NOT NULL
        AND ebay_dev_id IS NOT NULL
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_ebay_app_credentials TO service_role;
GRANT EXECUTE ON FUNCTION get_ebay_app_credentials TO authenticated;