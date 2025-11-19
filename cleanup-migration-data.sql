-- ===============================================
-- CLEANUP CORRUPTED MIGRATION DATA
-- ===============================================
-- This script identifies and cleans up eBay credentials that were
-- prefixed with 'NEEDS_MIGRATION:' during migration but never properly encrypted.
--
-- Background: The migration script (encrypt-ebay-credentials.sql) prefixed
-- credentials with 'NEEDS_MIGRATION:' but the actual encryption step was never implemented.
-- These corrupted credentials cause decrypt() to fail during token refresh.

-- 0. First, check if the column exists and add it if needed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'ebay_cert_id_encrypted'
    ) THEN
        ALTER TABLE users ADD COLUMN ebay_cert_id_encrypted TEXT;
        RAISE NOTICE 'Added ebay_cert_id_encrypted column';
    ELSE
        RAISE NOTICE 'Column ebay_cert_id_encrypted already exists';
    END IF;
END $$;

-- 1. First, inspect what we're dealing with
SELECT
    id,
    email,
    ebay_app_id,
    CASE
        WHEN ebay_cert_id_encrypted LIKE 'NEEDS_MIGRATION:%' THEN '⚠️ NEEDS CLEANUP'
        WHEN ebay_cert_id_encrypted IS NULL THEN 'NULL'
        WHEN ebay_cert_id_encrypted ~ '^[0-9a-f]+:[0-9a-f]+$' THEN '✓ PROPERLY ENCRYPTED'
        ELSE '⚠️ UNKNOWN FORMAT'
    END as credential_status,
    LENGTH(ebay_cert_id_encrypted) as encrypted_length,
    LEFT(ebay_cert_id_encrypted, 20) as encrypted_preview,
    ebay_connection_status,
    ebay_connected_at
FROM users
WHERE ebay_cert_id_encrypted IS NOT NULL
ORDER BY ebay_connected_at DESC;

-- 2. Count how many need cleanup
SELECT
    COUNT(*) as total_users_with_credentials,
    COUNT(*) FILTER (WHERE ebay_cert_id_encrypted LIKE 'NEEDS_MIGRATION:%') as needs_cleanup,
    COUNT(*) FILTER (WHERE ebay_cert_id_encrypted ~ '^[0-9a-f]+:[0-9a-f]+$') as properly_encrypted
FROM users
WHERE ebay_cert_id_encrypted IS NOT NULL;

-- 3. Clean up corrupted credentials
-- Option A: Clear the corrupted credentials and require user to reconnect
UPDATE users
SET
    ebay_cert_id_encrypted = NULL,
    ebay_connection_status = 'disconnected',
    ebay_refresh_token = NULL,
    ebay_user_id = NULL,
    ebay_connected_at = NULL
WHERE ebay_cert_id_encrypted LIKE 'NEEDS_MIGRATION:%';

-- Option B: If you want to preserve the plaintext value for manual inspection
-- (DO NOT use this in production - it's insecure)
-- CREATE TABLE IF NOT EXISTS users_credentials_backup AS
-- SELECT
--     id,
--     email,
--     ebay_app_id,
--     SUBSTRING(ebay_cert_id_encrypted FROM 18) as plaintext_cert_id,
--     now() as backup_timestamp
-- FROM users
-- WHERE ebay_cert_id_encrypted LIKE 'NEEDS_MIGRATION:%';

-- 4. Verify cleanup was successful
SELECT
    COUNT(*) FILTER (WHERE ebay_cert_id_encrypted LIKE 'NEEDS_MIGRATION:%') as remaining_corrupted,
    COUNT(*) FILTER (WHERE ebay_connection_status = 'disconnected') as disconnected_users
FROM users;

-- 5. Show users who need to reconnect their eBay accounts
SELECT
    id,
    email,
    ebay_app_id,
    ebay_connection_status,
    'Please reconnect eBay account in application' as action_required
FROM users
WHERE ebay_cert_id_encrypted IS NULL
  AND ebay_app_id IS NOT NULL
  AND ebay_connection_status = 'disconnected'
ORDER BY email;

-- NOTE: After running this cleanup, affected users will need to:
-- 1. Go to the application's eBay settings page
-- 2. Click "Disconnect eBay Account" (if still shown as connected)
-- 3. Click "Connect eBay Account"
-- 4. Complete the OAuth flow
-- This will save properly encrypted credentials
