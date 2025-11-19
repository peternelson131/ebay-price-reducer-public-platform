# New Database Setup - Step by Step

**Goal**: Create a fresh Supabase database for the public platform (structure only, no data)

---

## Step 1: Create New Supabase Project (5 minutes)

1. **Go to**: https://supabase.com/dashboard
2. **Click**: "New Project"
3. **Fill in**:
   - Name: `ebay-price-reducer-public`
   - Database Password: (generate a strong password - save it!)
   - Region: Choose closest to you
   - Pricing Plan: Free tier is fine for now
4. **Click**: "Create new project"
5. **Wait**: 2-3 minutes for database to provision

---

## Step 2: Apply Database Schema (2 minutes)

1. **In your new Supabase project**, go to **SQL Editor** (left sidebar)
2. **Click**: "New query"
3. **Open the file**: `NEW-DATABASE-SCHEMA.sql` (in this repo)
4. **Copy ALL the contents** of that file
5. **Paste** into the SQL Editor
6. **Click**: "Run" (bottom right)
7. **Wait**: You should see "Success. No rows returned"

**What this does:**
- Creates all tables (users, listings, price_history, etc.)
- Sets up indexes for performance
- Configures Row Level Security (RLS)
- Creates helper functions
- **NO DATA** is copied - just the structure

---

## Step 3: Get Your New Database Credentials

1. **In Supabase**, click **Settings** (gear icon, bottom left)
2. **Click**: "API" (under Project Settings)
3. **Copy these 3 values** (you'll need them):

```
Project URL: https://YOUR-PROJECT-REF.supabase.co
anon public key: eyJ...
service_role key: eyJ...  (click "Reveal" first)
```

**Save these somewhere safe!** You'll need them in the next step.

---

## Step 4: Configure Netlify Environment Variables

Once you have the credentials from Step 3, I'll help you set them in Netlify.

**Just tell me: "I have the credentials"** and paste them here (they're safe - this is your private session).

Then I'll automatically configure Netlify with:
- New Supabase URL
- New Supabase keys
- All other required environment variables

---

## What Tables Were Created

Your new database now has these tables:

### Core Tables:
- `users` - User accounts, eBay credentials, preferences
- `oauth_states` - eBay OAuth flow security
- `listings` - eBay listings with price reduction settings
- `price_history` - Track all price changes
- `price_reduction_log` - Log of automated reductions

### Supporting Tables:
- `sync_queue` - Background job queue
- `sync_errors` - Error tracking
- `ebay_api_logs` - API call tracking
- `ebay_category_aspects` - eBay category data cache
- `strategies` - Custom pricing strategies
- `system_state` - System configuration

### Features Enabled:
- ✅ Row Level Security (RLS) - Users can only see their own data
- ✅ Automatic timestamps (created_at, updated_at)
- ✅ Price change tracking (automatic logging)
- ✅ Full-text search on listings
- ✅ Soft deletes (archived_at)
- ✅ OAuth PKCE support

---

## Comparison: Old vs New Database

| Feature | Old Database (zxcdkanccbdeqebnabgg) | New Database (public-platform) |
|---------|--------------------------------------|--------------------------------|
| **Purpose** | Production app | Development/public platform |
| **Data** | Live user data | Empty (structure only) |
| **Tables** | Same structure | Same structure |
| **Users** | Existing users | Start fresh |
| **Safe to test** | No (production) | Yes (empty) |

Both databases are **independent** - changes to one don't affect the other.

---

## After Setup Complete

Once your new database is configured:

1. **Test the deployment**: Push a small change to GitHub
2. **Verify Netlify builds**: Check build logs
3. **Test authentication**: Sign up a new user
4. **Test eBay OAuth**: Connect an eBay account
5. **Start building**: Add modular features

---

## Rollback Plan

If anything goes wrong:
- Original database is untouched at `zxcdkanccbdeqebnabgg.supabase.co`
- Original app still works at `dainty-horse-49c336.netlify.app`
- Can delete new Supabase project anytime
- Can reconfigure Netlify back to old database

---

## Next Steps

**You're currently on Step 1.**

Go to https://supabase.com/dashboard and create the new project!

When you're done with Steps 1-3, come back and share the credentials, and I'll handle Step 4 automatically.

---

**Files Created:**
- `NEW-DATABASE-SCHEMA.sql` - Complete database structure
- `NEW-DATABASE-SETUP.md` - This guide

**Ready?** Go create that Supabase project! 🚀
