# eBay Price Reducer - Deployment Guide

## Architecture Overview

This application uses a modern serverless stack:

- **Frontend**: React (Vite) deployed on Netlify
- **Backend**: Netlify Functions (serverless)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **APIs**: eBay Trading/Finding APIs
- **Scheduling**: Netlify Scheduled Functions

## Prerequisites

1. **Supabase Account**: [Sign up at supabase.com](https://supabase.com)
2. **Netlify Account**: [Sign up at netlify.com](https://netlify.com)
3. **eBay Developer Account**: [Get credentials at developer.ebay.com](https://developer.ebay.com)

## Step 1: Set up Supabase

1. **Create a new Supabase project**
   - Go to [supabase.com](https://supabase.com)
   - Click "New project"
   - Choose organization and set project name
   - Wait for setup to complete

2. **Set up the database schema**
   - Go to SQL Editor in Supabase dashboard
   - Copy and paste the contents of `supabase-schema.sql`
   - Run the query to create all tables and functions

3. **Get your Supabase credentials**
   - Go to Settings > API
   - Copy your Project URL
   - Copy your anon/public key
   - Copy your service_role key (keep this secret!)

4. **Configure authentication**
   - Go to Authentication > Settings
   - Configure your site URL (will be your Netlify URL)
   - Set up email templates if desired

## Step 2: Set up eBay Developer Account

1. **Create eBay developer account**
   - Go to [developer.ebay.com](https://developer.ebay.com)
   - Sign up and verify your account

2. **Create an application**
   - Go to My Account > Application Keysets
   - Create a new keyset
   - Choose "Production" or "Sandbox" environment
   - Note down your App ID, Dev ID, and Cert ID

3. **Get user token**
   - Use eBay's token generation tool
   - Generate a user token for your account
   - This allows the app to manage your listings

## Step 3: Deploy to Netlify

### Option A: Deploy from GitHub

1. **Push code to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/ebay-price-reducer.git
   git push -u origin main
   ```

2. **Connect to Netlify**
   - Go to [netlify.com](https://netlify.com)
   - Click "New site from Git"
   - Connect your GitHub repository
   - Build settings should auto-detect from `netlify.toml`

### Option B: Deploy via Netlify CLI

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login and deploy**
   ```bash
   netlify login
   netlify init
   netlify deploy --prod
   ```

## Step 4: Configure Environment Variables

In your Netlify site dashboard, go to Site settings > Environment variables and add:

### Frontend Environment Variables
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Function Environment Variables
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
EBAY_APP_ID=your_ebay_app_id
EBAY_DEV_ID=your_ebay_dev_id
EBAY_CERT_ID=your_ebay_cert_id
EBAY_USER_TOKEN=your_ebay_user_token
EBAY_ENVIRONMENT=sandbox
```

## Step 5: Install Dependencies for Functions

```bash
cd netlify/functions
npm install
```

## Step 6: Test the Deployment

1. **Visit your Netlify site URL**
2. **Sign up for an account**
3. **Configure eBay credentials in settings**
4. **Import a test listing**
5. **Verify price monitoring works**

## Step 7: Set up Scheduled Functions (Optional)

Netlify automatically handles scheduled functions based on the cron expressions in your code. The price monitoring function will run every hour.

To monitor scheduled functions:
1. Go to Netlify dashboard > Functions
2. Check the "scheduled-price-monitor" function logs
3. Monitor for any errors

## Environment Configurations

### Development
- Use Supabase local development (optional)
- Use eBay sandbox environment
- Set `EBAY_ENVIRONMENT=sandbox`

### Production
- Use production Supabase project
- Use eBay production environment
- Set `EBAY_ENVIRONMENT=production`

## Security Notes

1. **Never commit sensitive credentials**
2. **Use environment variables for all secrets**
3. **Regularly rotate eBay tokens**
4. **Monitor Supabase RLS policies**
5. **Set up proper CORS policies**

## Monitoring and Maintenance

1. **Monitor Netlify function logs**
2. **Check Supabase usage and billing**
3. **Monitor eBay API rate limits**
4. **Review error logs in sync_errors table**
5. **Update dependencies regularly**

## Troubleshooting

### Common Issues

1. **Functions not working**
   - Check environment variables
   - Verify Supabase credentials
   - Check function logs in Netlify

2. **eBay API errors**
   - Verify token hasn't expired
   - Check API rate limits
   - Ensure proper XML formatting

3. **Database connection issues**
   - Verify Supabase service role key
   - Check RLS policies
   - Ensure schema is set up correctly

4. **Scheduled functions not running**
   - Verify cron syntax
   - Check Netlify plan supports scheduled functions
   - Monitor function logs

### Getting Help

- Check the GitHub issues
- Review Netlify documentation
- Consult Supabase docs
- eBay API documentation

## Performance Optimization

1. **Database**
   - Ensure proper indexing
   - Monitor query performance
   - Use pagination for large datasets

2. **Functions**
   - Optimize cold start times
   - Implement proper error handling
   - Use connection pooling

3. **Frontend**
   - Implement proper loading states
   - Use React Query caching
   - Optimize bundle size

## Scaling Considerations

1. **Supabase limits**
   - Monitor database size
   - Consider connection limits
   - Plan for bandwidth usage

2. **Netlify limits**
   - Function execution time (10s)
   - Function invocations per month
   - Build minutes

3. **eBay API limits**
   - Daily call limits
   - Rate limiting
   - Token expiration

Your eBay Price Reducer is now deployed and ready to use! 🚀