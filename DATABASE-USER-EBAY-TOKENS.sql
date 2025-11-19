-- ===============================================
-- USER-LEVEL EBAY API TOKENS SCHEMA UPDATE
-- ===============================================
-- This script adds user-level eBay API token storage
-- allowing multiple users to connect their own eBay accounts

-- 1. Add eBay token columns to users table
-- NOTE: We only store refresh_token (18-month lifetime)
-- Access tokens are obtained on-demand by exchanging the refresh_token
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_connected_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_connection_status TEXT DEFAULT 'disconnected';

-- Drop the user_profiles view first (will be recreated later in this script)
DROP VIEW IF EXISTS user_profiles CASCADE;

-- Remove ebay_access_token column if it exists (should never store access tokens)
ALTER TABLE users DROP COLUMN IF EXISTS ebay_access_token;
ALTER TABLE users DROP COLUMN IF EXISTS ebay_token_expires_at;

-- 2. Create index for eBay user lookups
CREATE INDEX IF NOT EXISTS idx_users_ebay_user_id ON users(ebay_user_id);
CREATE INDEX IF NOT EXISTS idx_users_ebay_connection_status ON users(ebay_connection_status);

-- 3. Create eBay API logs table for user-specific API tracking
CREATE TABLE IF NOT EXISTS ebay_api_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    api_call TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    error_message TEXT,
    rate_limit_remaining INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create indexes for eBay API logs
CREATE INDEX IF NOT EXISTS idx_ebay_api_logs_user_id ON ebay_api_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ebay_api_logs_created_at ON ebay_api_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ebay_api_logs_api_call ON ebay_api_logs(api_call);

-- 5. Enable RLS on eBay API logs
ALTER TABLE ebay_api_logs ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies for eBay API logs (drop existing first to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their own eBay API logs" ON ebay_api_logs;
DROP POLICY IF EXISTS "Users can insert their own eBay API logs" ON ebay_api_logs;

CREATE POLICY "Users can view their own eBay API logs" ON ebay_api_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own eBay API logs" ON ebay_api_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 7. Drop existing functions first (in case signatures changed)
DROP FUNCTION IF EXISTS get_user_ebay_credentials(UUID);
DROP FUNCTION IF EXISTS update_user_ebay_token(UUID, TEXT, TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS has_valid_ebay_token(UUID);
DROP FUNCTION IF EXISTS disconnect_user_ebay_account(UUID);

-- 8. Create function to check if user has valid eBay token
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

-- 9. Create function to get user's eBay credentials
-- NOTE: Only returns refresh_token - access tokens must be obtained on-demand
CREATE OR REPLACE FUNCTION get_user_ebay_credentials(user_uuid UUID)
RETURNS TABLE (
    refresh_token TEXT,
    ebay_user_id TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        users.ebay_refresh_token,
        users.ebay_user_id
    FROM users
    WHERE users.id = user_uuid
    AND users.ebay_refresh_token IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Create function to update user's eBay token
-- NOTE: Only stores refresh_token - access tokens are never stored
CREATE OR REPLACE FUNCTION update_user_ebay_token(
    user_uuid UUID,
    refresh_token TEXT,
    ebay_user_id_param TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Update user's eBay credentials (only refresh token)
    UPDATE users SET
        ebay_refresh_token = refresh_token,
        ebay_user_id = COALESCE(ebay_user_id_param, ebay_user_id),
        ebay_connected_at = NOW(),
        ebay_connection_status = 'connected',
        updated_at = NOW()
    WHERE id = user_uuid;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Create function to disconnect user's eBay account
CREATE OR REPLACE FUNCTION disconnect_user_ebay_account(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE users SET
        ebay_refresh_token = NULL,
        ebay_user_id = NULL,
        ebay_connection_status = 'disconnected',
        updated_at = NOW()
    WHERE id = user_uuid;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Create trigger to log eBay API calls
CREATE OR REPLACE FUNCTION log_ebay_api_call()
RETURNS TRIGGER AS $$
BEGIN
    -- This trigger can be used to automatically log API usage
    -- Implementation depends on how you want to track API calls
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 12. Add eBay connection status to user profiles view
CREATE OR REPLACE VIEW user_profiles AS
SELECT
    u.id,
    u.email,
    u.name,
    u.is_active,
    u.created_at,
    u.updated_at,
    u.ebay_connection_status,
    u.ebay_connected_at,
    u.ebay_user_id,
    CASE
        WHEN u.ebay_refresh_token IS NOT NULL THEN true
        ELSE false
    END AS ebay_token_valid,
    COUNT(l.id) AS total_listings,
    COUNT(CASE WHEN l.price_reduction_enabled THEN 1 END) AS enabled_listings
FROM users u
LEFT JOIN listings l ON u.id = l.user_id AND l.listing_status = 'Active'
GROUP BY u.id, u.email, u.name, u.is_active, u.created_at, u.updated_at,
         u.ebay_connection_status, u.ebay_connected_at, u.ebay_user_id, u.ebay_refresh_token;

-- 13. Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ebay_api_logs TO authenticated;
GRANT SELECT ON user_profiles TO authenticated;
GRANT EXECUTE ON FUNCTION has_valid_ebay_token(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_ebay_credentials(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_ebay_token(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION disconnect_user_ebay_account(UUID) TO authenticated;

-- 14. Migrate old ebay_user_token data to ebay_refresh_token (if column exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'users' AND column_name = 'ebay_user_token') THEN
        -- Migrate data from old column to new column
        UPDATE users
        SET ebay_refresh_token = ebay_user_token,
            ebay_connection_status = 'connected',
            ebay_connected_at = NOW()
        WHERE ebay_user_token IS NOT NULL
        AND ebay_refresh_token IS NULL;

        RAISE NOTICE 'Migrated ebay_user_token data to ebay_refresh_token';

        -- Drop old column
        ALTER TABLE users DROP COLUMN ebay_user_token;
        RAISE NOTICE 'Dropped ebay_user_token column';
    END IF;
END $$;

-- 15. Update existing users to have disconnected status
UPDATE users SET ebay_connection_status = 'disconnected' WHERE ebay_connection_status IS NULL;

-- ===============================================
-- VERIFICATION QUERIES
-- ===============================================

-- Check the updated users table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name LIKE '%ebay%'
ORDER BY column_name;

-- Check the new eBay API logs table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ebay_api_logs'
ORDER BY ordinal_position;

-- Test the new functions
SELECT has_valid_ebay_token('00000000-0000-0000-0000-000000000000'::UUID);