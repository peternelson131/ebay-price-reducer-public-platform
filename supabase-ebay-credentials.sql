-- eBay App Credentials Table
-- This table stores the eBay application credentials securely in Supabase

-- Create the app_credentials table with user association
CREATE TABLE IF NOT EXISTS app_credentials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- Link to user
    service_name TEXT NOT NULL,                                -- 'ebay_production' or 'ebay_sandbox'
    app_id TEXT NOT NULL,                                      -- eBay App ID / Client ID
    cert_id TEXT NOT NULL,                                     -- eBay Cert ID / Client Secret (encrypted)
    dev_id TEXT,                                               -- eBay Dev ID (optional)
    environment TEXT NOT NULL DEFAULT 'production',            -- 'production' or 'sandbox'
    redirect_uri TEXT NOT NULL,                                -- OAuth redirect URI
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, service_name)  -- One set of credentials per user per service
);

-- Enable Row Level Security
ALTER TABLE app_credentials ENABLE ROW LEVEL SECURITY;

-- Create policies for app_credentials table
-- Users can read and write their own credentials
CREATE POLICY "Users can read own app credentials" ON app_credentials
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own app credentials" ON app_credentials
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own app credentials" ON app_credentials
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own app credentials" ON app_credentials
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "Service role can manage all app credentials" ON app_credentials
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- No default insert anymore since credentials are user-specific

-- Create function to get user's eBay credentials
CREATE OR REPLACE FUNCTION get_user_ebay_app_credentials(user_uuid UUID, env TEXT DEFAULT 'production')
RETURNS TABLE (
    app_id TEXT,
    cert_id TEXT,
    dev_id TEXT,
    redirect_uri TEXT
)
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ac.app_id,
        ac.cert_id,
        ac.dev_id,
        ac.redirect_uri
    FROM app_credentials ac
    WHERE ac.user_id = user_uuid
        AND ac.service_name = 'ebay_' || env
        AND ac.is_active = true
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION get_user_ebay_app_credentials TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_ebay_app_credentials TO service_role;

-- Create function to save or update user's eBay credentials
CREATE OR REPLACE FUNCTION save_user_ebay_credentials(
    user_uuid UUID,
    ebay_app_id TEXT,
    ebay_cert_id TEXT,
    ebay_dev_id TEXT DEFAULT NULL,
    env TEXT DEFAULT 'production'
)
RETURNS BOOLEAN
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO app_credentials (
        user_id,
        service_name,
        app_id,
        cert_id,
        dev_id,
        environment,
        redirect_uri
    ) VALUES (
        user_uuid,
        'ebay_' || env,
        ebay_app_id,
        ebay_cert_id,
        ebay_dev_id,
        env,
        'https://dainty-horse-49c336.netlify.app/.netlify/functions/ebay-oauth'
    )
    ON CONFLICT (user_id, service_name) DO UPDATE SET
        app_id = EXCLUDED.app_id,
        cert_id = EXCLUDED.cert_id,
        dev_id = EXCLUDED.dev_id,
        updated_at = NOW();

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION save_user_ebay_credentials TO authenticated;
GRANT EXECUTE ON FUNCTION save_user_ebay_credentials TO service_role;