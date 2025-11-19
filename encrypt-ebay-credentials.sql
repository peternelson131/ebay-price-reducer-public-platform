-- =============================================
-- ENCRYPT EBAY CREDENTIALS MIGRATION
-- Adds encrypted column for secure eBay Cert ID storage
-- =============================================

-- Add new encrypted column
ALTER TABLE users
ADD COLUMN IF NOT EXISTS ebay_cert_id_encrypted TEXT;

-- Create migration function to encrypt existing credentials
CREATE OR REPLACE FUNCTION migrate_encrypt_cert_ids()
RETURNS void AS $$
DECLARE
  user_record RECORD;
  encrypted_cert TEXT;
BEGIN
  -- Loop through all users with unencrypted cert_id
  FOR user_record IN
    SELECT id, ebay_cert_id
    FROM users
    WHERE ebay_cert_id IS NOT NULL
    AND ebay_cert_id_encrypted IS NULL
  LOOP
    -- Note: Actual encryption will be done by Netlify function
    -- This just marks them for migration
    UPDATE users
    SET ebay_cert_id_encrypted = 'NEEDS_MIGRATION:' || ebay_cert_id
    WHERE id = user_record.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Run migration
SELECT migrate_encrypt_cert_ids();

-- Add comment
COMMENT ON COLUMN users.ebay_cert_id_encrypted IS
  'Encrypted eBay Cert ID using AES-256-CBC (same as refresh_token)';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Successfully added ebay_cert_id_encrypted column to users table';
    RAISE NOTICE 'Existing credentials marked for migration';
    RAISE NOTICE 'New credentials will be automatically encrypted by Netlify function';
END $$;
