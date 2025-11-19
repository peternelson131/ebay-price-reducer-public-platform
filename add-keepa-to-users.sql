-- Add Keepa API key column to existing users table
-- This is the correct approach - we use the users table throughout the app

-- Add keepa_api_key column if it doesn't already exist
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS keepa_api_key TEXT;

-- Add comment to document the column
COMMENT ON COLUMN public.users.keepa_api_key IS 'Encrypted Keepa API key for accessing Keepa services';

-- Ensure the users table has proper RLS policies for the user to update their own row
-- (These may already exist, but adding them won't hurt if they do)
DO $$
BEGIN
    -- Check if the policy exists before creating it
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'users'
        AND policyname = 'Users can update own user data for keepa'
    ) THEN
        CREATE POLICY "Users can update own user data for keepa"
            ON public.users FOR UPDATE
            USING (auth.uid() = id)
            WITH CHECK (auth.uid() = id);
    END IF;
END $$;