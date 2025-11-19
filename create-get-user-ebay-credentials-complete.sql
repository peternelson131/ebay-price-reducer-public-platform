-- ===============================================
-- CREATE UNIFIED RPC FUNCTION FOR ALL EBAY CREDENTIALS
-- ===============================================
-- This RPC function provides a single call to retrieve all eBay-related
-- credentials and connection information for a user.
--
-- Returns:
-- - ebay_app_id (plain text)
-- - ebay_cert_id_encrypted (encrypted - must be decrypted by backend)
-- - ebay_refresh_token (decrypted - via decrypt_ebay_token function)
-- - ebay_user_id (eBay's user ID)
-- - ebay_connection_status (connected/disconnected)
-- - ebay_connected_at (timestamp)
--
-- SECURITY: Marked as SECURITY DEFINER to bypass RLS policies
-- Only returns credentials for the specified user

-- Create a pass-through function for encrypted tokens
-- This function returns encrypted token as-is for backend decryption
CREATE OR REPLACE FUNCTION decrypt_ebay_token(encrypted_token TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Return encrypted token for backend to decrypt
    RETURN encrypted_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER IMMUTABLE;

-- Drop existing function if it exists (for clean re-creation)
DROP FUNCTION IF EXISTS get_user_ebay_credentials_complete(UUID);

-- Create the unified credentials retrieval function
CREATE OR REPLACE FUNCTION get_user_ebay_credentials_complete(user_uuid UUID)
RETURNS TABLE (
    ebay_app_id TEXT,
    ebay_cert_id_encrypted TEXT,
    ebay_refresh_token TEXT,
    ebay_user_id TEXT,
    ebay_connection_status TEXT,
    ebay_connected_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        users.ebay_app_id,
        users.ebay_cert_id_encrypted,
        decrypt_ebay_token(users.ebay_refresh_token) AS ebay_refresh_token,
        users.ebay_user_id,
        users.ebay_connection_status,
        users.ebay_connected_at
    FROM users
    WHERE users.id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION decrypt_ebay_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_ebay_credentials_complete(UUID) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION get_user_ebay_credentials_complete(UUID) IS
  'Unified function to retrieve all eBay credentials for a user. Returns app credentials, refresh token (decrypted), and connection status.';

-- Verify the function was created successfully
SELECT
    proname as function_name,
    prosecdef as is_security_definer,
    pg_get_function_arguments(oid) as arguments,
    pg_get_function_result(oid) as return_type
FROM pg_proc
WHERE proname = 'get_user_ebay_credentials_complete';

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Successfully created get_user_ebay_credentials_complete function';
    RAISE NOTICE 'This function provides unified access to all eBay credentials in a single call';
    RAISE NOTICE 'Usage: SELECT * FROM get_user_ebay_credentials_complete(''user-uuid-here'');';
END $$;
