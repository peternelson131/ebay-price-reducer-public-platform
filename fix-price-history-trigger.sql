-- Fix price history trigger to match the price_history table schema
-- The trigger was trying to insert with 'change_type' but the table expects 'reason'

-- Drop the existing trigger
DROP TRIGGER IF EXISTS track_price_changes ON listings;

-- Drop the existing function
DROP FUNCTION IF EXISTS log_price_change();

-- Option 1: Recreate the trigger with the correct column name
CREATE OR REPLACE FUNCTION log_price_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.current_price IS DISTINCT FROM NEW.current_price THEN
        INSERT INTO price_history (listing_id, price, reason)
        VALUES (NEW.id, NEW.current_price, 'manual');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER track_price_changes
    AFTER UPDATE ON listings
    FOR EACH ROW
    WHEN (OLD.current_price IS DISTINCT FROM NEW.current_price)
    EXECUTE FUNCTION log_price_change();

-- Grant INSERT permission on price_history to service role
GRANT INSERT ON price_history TO service_role;
