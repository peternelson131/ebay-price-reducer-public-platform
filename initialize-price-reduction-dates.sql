-- =====================================================
-- INITIALIZE PRICE REDUCTION DATES
-- =====================================================
-- Sets next_price_reduction for all listings that have
-- price_reduction_enabled = true but next_price_reduction = NULL
--
-- This makes them eligible for the next scheduled reduction
--

-- Update listings with NULL next_price_reduction
-- Set them to NOW so they'll be eligible immediately
UPDATE listings
SET
    next_price_reduction = NOW(),
    updated_at = NOW()
WHERE
    price_reduction_enabled = true
    AND next_price_reduction IS NULL
    AND listing_status = 'Active'
    AND current_price > minimum_price;

-- Show what was updated
SELECT
    COUNT(*) as listings_initialized,
    'These listings are now eligible for price reduction' as message
FROM listings
WHERE
    price_reduction_enabled = true
    AND next_price_reduction IS NOT NULL
    AND listing_status = 'Active';

-- Show next few reductions scheduled
SELECT
    ebay_item_id,
    sku,
    title,
    current_price,
    minimum_price,
    reduction_percentage,
    next_price_reduction,
    CASE
        WHEN next_price_reduction <= NOW() THEN 'Ready for reduction'
        ELSE 'Scheduled for ' || next_price_reduction::date
    END as status
FROM listings
WHERE
    price_reduction_enabled = true
    AND listing_status = 'Active'
ORDER BY next_price_reduction
LIMIT 10;

-- Success message
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO updated_count
    FROM listings
    WHERE
        price_reduction_enabled = true
        AND next_price_reduction IS NOT NULL
        AND listing_status = 'Active';

    RAISE NOTICE '✅ Initialized price reduction dates';
    RAISE NOTICE 'Total listings ready for reduction: %', updated_count;
    RAISE NOTICE 'Next scheduled run: Tonight at 1:10 AM CST';
END $$;
