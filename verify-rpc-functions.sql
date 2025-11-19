-- Run this in Supabase SQL Editor to verify RPC functions exist

-- 1. Check if the RPC function exists
SELECT
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
    AND routine_name IN (
        'get_user_ebay_credentials',
        'update_user_ebay_token',
        'has_valid_ebay_token',
        'disconnect_user_ebay_account'
    )
ORDER BY routine_name;

-- 2. Check the function definition
SELECT
    pg_get_functiondef(oid) AS function_definition
FROM pg_proc
WHERE proname = 'get_user_ebay_credentials';

-- 3. Test if the function works (replace with your actual user UUID)
-- SELECT * FROM get_user_ebay_credentials('your-user-uuid-here'::UUID);
