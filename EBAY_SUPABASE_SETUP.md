# eBay Integration Setup with Supabase

This guide explains how to set up eBay OAuth integration with credentials stored in Supabase (not Netlify environment variables).

## Architecture Overview

- **eBay App Credentials**: Stored securely in Supabase `app_credentials` table
- **OAuth Flow**: Netlify functions fetch credentials from Supabase at runtime
- **Benefits**: No redeployment needed when updating credentials, centralized credential management

## Setup Steps

### 1. Create eBay Developer Application

1. Go to [eBay Developer Program](https://developer.ebay.com)
2. Sign in with your eBay account
3. Navigate to **"My Account"** → **"Application Keys"**
4. Click **"Create Application"** and select **Production** environment
5. Fill in application details:
   - Application Name: "eBay Price Reducer"
   - Application Type: Your choice
   - Platform: Web Application

6. Once approved (1-3 business days), note down:
   - **App ID** (Client ID)
   - **Cert ID** (Client Secret)
   - **Dev ID**

### 2. Configure eBay OAuth Settings

In your eBay application settings:

1. **Set Redirect URI**:
   ```
   https://dainty-horse-49c336.netlify.app/.netlify/functions/ebay-oauth
   ```

2. **Select ALL OAuth Scopes** (already configured in the code):
   - All Selling APIs (inventory, marketing, fulfillment, etc.)
   - Commerce APIs (catalog, taxonomy, notifications)
   - Store and reputation APIs

### 3. Set Up Supabase Database

1. **Run the SQL script** in your Supabase SQL editor:
   ```sql
   -- Copy contents from supabase-ebay-credentials.sql
   ```

2. **Update the credentials** in Supabase:
   ```sql
   UPDATE app_credentials
   SET
     app_id = 'YOUR_ACTUAL_EBAY_APP_ID',
     cert_id = 'YOUR_ACTUAL_EBAY_CERT_ID',
     dev_id = 'YOUR_ACTUAL_EBAY_DEV_ID'
   WHERE service_name = 'ebay_production';
   ```

### 4. Configure Netlify Environment Variables

You still need these Netlify environment variables (but NOT the eBay credentials):

1. Go to [Netlify Dashboard](https://app.netlify.com)
2. Select your site
3. Go to **Site Settings** → **Environment Variables**
4. Add:
   ```
   SUPABASE_URL = your_supabase_project_url
   SUPABASE_SERVICE_ROLE_KEY = your_supabase_service_role_key
   URL = https://dainty-horse-49c336.netlify.app
   ```

### 5. Deploy the Updated Functions

```bash
npx netlify-cli deploy --prod
```

## How It Works

1. **User clicks "Connect eBay Account"**
2. **Netlify function fetches credentials** from Supabase `app_credentials` table
3. **OAuth URL is generated** with the credentials from Supabase
4. **User authorizes** on eBay's OAuth page
5. **Tokens are stored** in the user's profile in Supabase

## Security Benefits

- **Credentials in Database**: More secure than environment variables
- **Row Level Security**: Only service role can access credentials
- **Dynamic Updates**: Change credentials without redeployment
- **Encrypted Storage**: Supabase encrypts sensitive data at rest

## Updating Credentials

To update eBay credentials later:

1. **Via Supabase Dashboard**:
   - Go to Table Editor → `app_credentials`
   - Edit the `ebay_production` row
   - Update app_id, cert_id, or dev_id

2. **Via SQL**:
   ```sql
   UPDATE app_credentials
   SET
     app_id = 'NEW_APP_ID',
     cert_id = 'NEW_CERT_ID',
     updated_at = NOW()
   WHERE service_name = 'ebay_production';
   ```

## Troubleshooting

### "eBay credentials not configured"
- Check that the `app_credentials` table has the `ebay_production` row
- Verify the credentials are set (not the placeholder values)

### "unauthorized_client" error from eBay
- Verify the App ID is correct in Supabase
- Ensure you're using Production keys (not Sandbox)
- Check that your eBay app is approved

### "Invalid redirect URI"
- Verify the redirect_uri in the database matches exactly:
  ```
  https://dainty-horse-49c336.netlify.app/.netlify/functions/ebay-oauth
  ```
- Ensure this URI is configured in your eBay app settings

## Support for Multiple Environments

The schema supports both production and sandbox environments:

```sql
-- Add sandbox credentials if needed
INSERT INTO app_credentials (
    service_name,
    app_id,
    cert_id,
    dev_id,
    environment,
    redirect_uri
) VALUES (
    'ebay_sandbox',
    'YOUR_SANDBOX_APP_ID',
    'YOUR_SANDBOX_CERT_ID',
    'YOUR_SANDBOX_DEV_ID',
    'sandbox',
    'https://dainty-horse-49c336.netlify.app/.netlify/functions/ebay-oauth'
);
```

To use sandbox, modify the function call:
```javascript
const { data } = await supabase.rpc('get_ebay_credentials', {
  env: 'sandbox' // or 'production'
});
```