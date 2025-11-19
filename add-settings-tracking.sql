-- Add settings_updated_at column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS settings_updated_at TIMESTAMP WITH TIME ZONE;

-- Create trigger function to update timestamp
CREATE OR REPLACE FUNCTION update_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.listing_settings IS DISTINCT FROM OLD.listing_settings THEN
    NEW.settings_updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_settings_timestamp ON users;
CREATE TRIGGER trigger_update_settings_timestamp
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_settings_timestamp();

-- Add comment for documentation
COMMENT ON COLUMN users.settings_updated_at IS 'Timestamp of last listing_settings modification';
