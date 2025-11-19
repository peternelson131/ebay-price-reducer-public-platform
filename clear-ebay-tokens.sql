-- Clear eBay OAuth tokens to force re-authorization
-- Run this when you get "refresh token issued to another client" error
-- After running this, you must reconnect your eBay account through the OAuth flow

UPDATE users
SET
  ebay_refresh_token = NULL,
  ebay_connection_status = 'disconnected',
  ebay_connected_at = NULL,
  ebay_user_id = NULL
WHERE id = auth.uid(); -- This will only affect your current user

-- Verify the tokens were cleared
SELECT
  id,
  email,
  ebay_app_id IS NOT NULL as has_app_id,
  ebay_cert_id_encrypted IS NOT NULL as has_cert_id,
  ebay_refresh_token IS NOT NULL as has_refresh_token,
  ebay_connection_status,
  ebay_connected_at
FROM users
WHERE id = auth.uid();
