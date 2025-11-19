-- Query to check what's actually saved in listing_settings
-- Replace the email with your actual email address

SELECT
  id,
  email,
  listing_settings,
  listing_settings->'defaultLocation' as default_location,
  listing_settings->'defaultLocation'->'address' as saved_address,
  listing_settings->'defaultLocation'->'address'->>'postalCode' as postal_code,
  ebay_connection_status,
  created_at,
  updated_at
FROM users
WHERE email = 'your-email@example.com'
LIMIT 1;

-- Alternative: Get all users to find yours
-- SELECT id, email, listing_settings->'defaultLocation'->'address'->>'postalCode' as postal_code FROM users;
