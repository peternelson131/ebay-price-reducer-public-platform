-- Check eBay token status for all users
-- Run this to see if tokens were cleared by auto-disconnect

SELECT
    id,
    email,
    ebay_app_id,
    CASE
        WHEN ebay_cert_id_encrypted IS NOT NULL THEN 'Present'
        ELSE 'Missing'
    END as cert_id_status,
    CASE
        WHEN ebay_refresh_token IS NOT NULL THEN 'Present'
        ELSE 'Missing'
    END as refresh_token_status,
    ebay_user_id,
    ebay_connection_status,
    ebay_connected_at,
    created_at,
    updated_at
FROM users
WHERE email IS NOT NULL
ORDER BY created_at DESC;

-- If refresh_token_status shows "Missing", the auto-disconnect logic cleared it
-- You'll need to reconnect your eBay account
