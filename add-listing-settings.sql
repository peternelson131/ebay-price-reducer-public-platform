-- Add listing_settings column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS listing_settings JSONB DEFAULT '{}'::jsonb;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_listing_settings ON users USING GIN (listing_settings);

-- Add comment
COMMENT ON COLUMN users.listing_settings IS 'User preferences for eBay listing creation';

-- Example structure:
-- {
--   "defaultFulfillmentPolicyId": "6786459000",
--   "defaultPaymentPolicyId": "6786454000",
--   "defaultReturnPolicyId": "6786458000",
--   "defaultCondition": "NEW_OTHER",
--   "skuPrefix": "PETE-",
--   "defaultLocation": {
--     "address": {
--       "addressLine1": "123 Main St",
--       "city": "San Francisco",
--       "stateOrProvince": "CA",
--       "postalCode": "94105",
--       "country": "US"
--     }
--   }
-- }
