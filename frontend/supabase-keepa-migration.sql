-- Simple Keepa API Key Storage Migration
-- This only adds a column to store the encrypted API key
-- No other Keepa data is stored in the database

-- Add keepa_api_key column to profiles table if it doesn't exist
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS keepa_api_key TEXT;

-- Add a comment to document the column
COMMENT ON COLUMN public.profiles.keepa_api_key IS 'Encrypted Keepa API key for accessing Keepa services';

-- That's it! All Keepa data will be fetched in real-time from the API
-- and handled in the application layer without database storage