-- ===============================================
-- ADD RPC FUNCTION FOR SECURE APP CREDENTIAL RETRIEVAL
-- ===============================================
-- This RPC function allows secure retrieval of user's eBay app credentials
-- (ebay_app_id and ebay_cert_id_encrypted) for token refresh operations.
--
-- SECURITY: Marked as SECURITY DEFINER to bypass RLS policies
-- Only returns credentials for the authenticated user's own account

-- Drop existing function if it exists (for clean re-creation)
DROP FUNCTION IF EXISTS get_user_ebay_app_credentials(UUID);

-- Create secure RPC to fetch user's eBay app credentials
CREATE OR REPLACE FUNCTION get_user_ebay_app_credentials(user_uuid UUID)
RETURNS TABLE (
    ebay_app_id TEXT,
    ebay_cert_id_encrypted TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        users.ebay_app_id,
        users.ebay_cert_id_encrypted
    FROM users
    WHERE users.id = user_uuid
    AND users.ebay_app_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_ebay_app_credentials(UUID) TO authenticated;

-- Verify the function works
SELECT
    proname as function_name,
    prosecdef as is_security_definer,
    proacl as permissions
FROM pg_proc
WHERE proname = 'get_user_ebay_app_credentials';

-- Test query (replace with actual user UUID)
-- SELECT * FROM get_user_ebay_app_credentials('your-user-uuid-here');
