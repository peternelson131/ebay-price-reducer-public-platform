-- Create oauth_states table for eBay OAuth flow
-- This table stores temporary state values for OAuth CSRF protection

CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  state TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- States expire after 10 minutes for security
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes')
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states(state);
CREATE INDEX IF NOT EXISTS idx_oauth_states_user_id ON oauth_states(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);

-- Enable Row Level Security
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

-- Create policies for RLS
-- Users can only see their own states
CREATE POLICY "Users can view own oauth states" ON oauth_states
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own states
CREATE POLICY "Users can create own oauth states" ON oauth_states
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can delete their own states
CREATE POLICY "Users can delete own oauth states" ON oauth_states
  FOR DELETE USING (auth.uid() = user_id);

-- Service role can do everything (for backend operations)
CREATE POLICY "Service role full access" ON oauth_states
  FOR ALL USING (auth.role() = 'service_role');

-- Clean up expired states automatically
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS void AS $$
BEGIN
  DELETE FROM oauth_states WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Optional: Set up a cron job to clean up expired states (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-oauth-states', '*/10 * * * *', 'SELECT cleanup_expired_oauth_states();');