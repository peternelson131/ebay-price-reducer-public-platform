# Keepa Integration - Simple Setup Guide

## Overview
This application integrates with Keepa API for real-time Amazon market data. The integration is designed to be lightweight - we ONLY store your encrypted API key in the database. All Keepa data is fetched in real-time and handled in the application layer.

## Database Setup

### Step 1: Run the Migration
Execute this simple SQL in your Supabase SQL Editor to add the API key storage:

```sql
-- Simple Keepa API Key Storage Migration
-- This only adds a column to store the encrypted API key
-- No other Keepa data is stored in the database

-- Add keepa_api_key column to profiles table if it doesn't exist
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS keepa_api_key TEXT;

-- Add a comment to document the column
COMMENT ON COLUMN public.profiles.keepa_api_key IS 'Encrypted Keepa API key for accessing Keepa services';
```

That's it for the database! We keep it simple - just store the key, nothing else.

## How It Works

1. **API Key Storage**: Your Keepa API key is encrypted with AES-256 and stored in your profile
2. **Real-time Data**: All Keepa data (prices, products, etc.) is fetched directly from Keepa when needed
3. **No Data Storage**: We don't store any Keepa response data in the database
4. **Application Layer**: All data processing happens in the frontend/backend code

## Security

- **Encryption**: API keys are encrypted before storage using AES-256-CBC
- **Environment Variables**: Encryption key stored in Netlify environment variables
- **HTTPS Only**: All API calls use secure connections

## Usage

### Save Your API Key
1. Go to Account → Integrations → Keepa
2. Enter your Keepa API key
3. Click "Save API Key"

### Test Connection
Click "Test Connection" to verify your API key is working

### Access Keepa Data
Once your API key is saved, the application can:
- Fetch real-time Amazon product data
- Get current prices and availability
- Search for products
- Monitor competitors
- All without storing any of this data in your database!

## Environment Variables (Already Set in Netlify)

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_KEY`: Supabase service key
- `ENCRYPTION_KEY`: 32-byte hex key for encryption

## Benefits of This Approach

✅ **Simple**: Only one database column needed
✅ **Fresh Data**: Always get the latest data from Keepa
✅ **No Storage Costs**: Don't pay for storing data you can fetch
✅ **Privacy**: Keepa data isn't stored in your database
✅ **Flexible**: Easy to change how you use Keepa data

## Troubleshooting

### "Failed to save API key"
- Make sure you've run the SQL migration above
- Check that your Keepa API key is valid
- Verify Netlify environment variables are set

### "No API key configured"
- You need to save your API key first in Account settings

### "Invalid API key"
- Your Keepa API key may be incorrect or expired
- Get a valid key from keepa.com

## Support

The integration is straightforward - we just securely store your key and fetch data as needed. No complex database schemas or data synchronization required!