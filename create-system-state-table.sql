-- =====================================================
-- CREATE SYSTEM STATE TABLE
-- =====================================================
-- This table stores system-wide state information
-- Used to track scheduled job executions and prevent duplicates
--
-- Usage: The scheduled-price-reduction function uses this to ensure
-- it only runs once per day, even though it's triggered at both
-- 6 AM and 7 AM UTC to handle DST changes.
--

-- Create system_state table if it doesn't exist
CREATE TABLE IF NOT EXISTS system_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_state_updated_at ON system_state(updated_at);

-- Add RLS policies
ALTER TABLE system_state ENABLE ROW LEVEL SECURITY;

-- Allow service role (backend) to read/write
-- Regular users should not have access to system state
CREATE POLICY "Service role can manage system state"
ON system_state
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Add helpful comment
COMMENT ON TABLE system_state IS 'Stores system-wide state information for scheduled jobs and background tasks. Used by automated functions to track execution state and prevent duplicates.';

COMMENT ON COLUMN system_state.key IS 'Unique identifier for the state entry (e.g., last_price_reduction_date)';

COMMENT ON COLUMN system_state.value IS 'State value, format depends on key (e.g., date string, JSON, etc.)';

-- Insert initial value for price reduction tracking (optional)
INSERT INTO system_state (key, value, updated_at)
VALUES ('last_price_reduction_date', '1970-01-01', NOW())
ON CONFLICT (key) DO NOTHING;

-- Verify table was created
SELECT
    tablename as table_name,
    schemaname as schema_name,
    tableowner as owner
FROM pg_tables
WHERE tablename = 'system_state';

-- Show initial data
SELECT * FROM system_state;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Successfully created system_state table';
    RAISE NOTICE 'This table is used by scheduled functions to prevent duplicate executions';
    RAISE NOTICE 'Location: public.system_state';
END $$;
