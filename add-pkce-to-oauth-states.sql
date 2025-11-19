-- Add PKCE support to oauth_states table
-- This migration adds the code_verifier column needed for PKCE (Proof Key for Code Exchange)

ALTER TABLE oauth_states
ADD COLUMN IF NOT EXISTS code_verifier TEXT;

COMMENT ON COLUMN oauth_states.code_verifier IS
  'PKCE code verifier (stored temporarily for OAuth flow)';
