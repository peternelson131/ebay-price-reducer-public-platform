-- Disable price history trigger completely
-- This prevents the "null value in column" error

DROP TRIGGER IF EXISTS track_price_changes ON listings;
DROP FUNCTION IF EXISTS log_price_change();

-- Note: This disables automatic price history tracking
-- If you want to re-enable it later, use fix-price-history-trigger.sql
