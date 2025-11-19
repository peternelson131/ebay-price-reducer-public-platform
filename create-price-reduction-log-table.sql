-- =====================================================
-- CREATE PRICE REDUCTION LOG TABLE
-- =====================================================
-- Records all successful price reductions for monitoring
-- Automatically deletes records older than 10 days
--

-- Create price_reduction_log table
CREATE TABLE IF NOT EXISTS price_reduction_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
    ebay_item_id TEXT NOT NULL,
    sku TEXT,
    title TEXT,
    original_price DECIMAL(10,2) NOT NULL,
    reduced_price DECIMAL(10,2) NOT NULL,
    reduction_amount DECIMAL(10,2) NOT NULL,
    reduction_percentage DECIMAL(5,2) NOT NULL,
    reduction_type TEXT NOT NULL CHECK (reduction_type IN ('manual', 'scheduled', 'automated')),
    reduction_strategy TEXT,
    triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_price_reduction_log_user_id ON price_reduction_log(user_id);
CREATE INDEX IF NOT EXISTS idx_price_reduction_log_created_at ON price_reduction_log(created_at);
CREATE INDEX IF NOT EXISTS idx_price_reduction_log_ebay_item_id ON price_reduction_log(ebay_item_id);
CREATE INDEX IF NOT EXISTS idx_price_reduction_log_type ON price_reduction_log(reduction_type);

-- Add RLS policies
ALTER TABLE price_reduction_log ENABLE ROW LEVEL SECURITY;

-- Users can only see their own logs
CREATE POLICY "Users can view own price reduction logs"
ON price_reduction_log
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Service role can manage all logs
CREATE POLICY "Service role can manage all price reduction logs"
ON price_reduction_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Add helpful comments
COMMENT ON TABLE price_reduction_log IS 'Records all successful price reductions. Automatically cleaned up after 10 days.';
COMMENT ON COLUMN price_reduction_log.reduction_type IS 'Type: manual (user clicked button), scheduled (daily 1:10 AM), automated (other triggers)';
COMMENT ON COLUMN price_reduction_log.reduction_strategy IS 'Strategy used: fixed_percentage, time_based, market_based, etc.';
COMMENT ON COLUMN price_reduction_log.triggered_by IS 'User who triggered manual reduction (null for scheduled)';

-- Create function to clean up old logs (older than 10 days)
CREATE OR REPLACE FUNCTION cleanup_old_price_reduction_logs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM price_reduction_log
    WHERE created_at < NOW() - INTERVAL '10 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RAISE NOTICE 'Cleaned up % old price reduction log entries', deleted_count;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION cleanup_old_price_reduction_logs() TO service_role;

-- Verify table was created
SELECT
    tablename as table_name,
    schemaname as schema_name
FROM pg_tables
WHERE tablename = 'price_reduction_log';

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Successfully created price_reduction_log table';
    RAISE NOTICE 'Logs will be automatically cleaned up after 10 days';
    RAISE NOTICE 'Location: public.price_reduction_log';
END $$;
