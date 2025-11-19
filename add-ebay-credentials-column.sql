-- Migration: Add eBay credentials column to users table
-- Run this in your Supabase SQL editor

-- Add the missing ebay_credentials_valid column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users'
                   AND column_name = 'ebay_credentials_valid') THEN
        ALTER TABLE users ADD COLUMN ebay_credentials_valid BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added ebay_credentials_valid column to users table';
    ELSE
        RAISE NOTICE 'ebay_credentials_valid column already exists';
    END IF;
END $$;

-- Also ensure other eBay-related columns exist
DO $$
BEGIN
    -- Check for ebay_user_token
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users'
                   AND column_name = 'ebay_user_token') THEN
        ALTER TABLE users ADD COLUMN ebay_user_token TEXT;
        RAISE NOTICE 'Added ebay_user_token column to users table';
    END IF;

    -- Check for ebay_user_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users'
                   AND column_name = 'ebay_user_id') THEN
        ALTER TABLE users ADD COLUMN ebay_user_id TEXT;
        RAISE NOTICE 'Added ebay_user_id column to users table';
    END IF;

    -- Check for ebay_token_expires_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'users'
                   AND column_name = 'ebay_token_expires_at') THEN
        ALTER TABLE users ADD COLUMN ebay_token_expires_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added ebay_token_expires_at column to users table';
    END IF;
END $$;

-- Verify the columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name LIKE 'ebay%'
ORDER BY column_name;