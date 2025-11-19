# Database Setup Guide - Supabase Schema Implementation

## 🎯 Objective
Implement the complete database schema for the eBay Price Reducer application in your Supabase project.

---

## ⚠️ Prerequisites

1. **Supabase Project Created**: You must have created a Supabase project named `ebay-price-reducer`
2. **Credentials Copied**: You have your Project URL, anon key, and service role key
3. **Environment Updated**: Your `.env` file has been updated with real Supabase credentials

---








## 📋 **Step-by-Step Implementation**

### Step 1: Access Supabase SQL Editor

1. **Open your Supabase project dashboard**
2. **Go to the "SQL Editor"** in the left sidebar
3. **Click "New query"** to create a new SQL script

### Step 2: Generate Your JWT Secret

1. **Generate a random 32+ character string** for JWT secret:
   ```bash
   # You can use this command in your terminal:
   ```
2. **Copy the generated string** - you'll need it in Step 3

### Step 3: Run the Complete Schema

**Copy and paste this COMPLETE schema** into your Supabase SQL Editor:

```sql
-- eBay Price Reducer - Complete Database Schema
-- Replace 'YOUR_JWT_SECRET_HERE' with your generated JWT secret

-- Set JWT secret (replace with your generated secret)
ALTER database postgres SET "app.jwt_secret" TO 'YOUR_JWT_SECRET_HERE';

-- Create custom types
CREATE TYPE listing_status AS ENUM ('Active', 'Ended', 'Completed');
CREATE TYPE listing_format AS ENUM ('FixedPriceItem', 'Auction', 'StoreInventory');
CREATE TYPE reduction_strategy AS ENUM ('fixed_percentage', 'market_based', 'time_based');

-- Users table (extends Supabase auth.users)
CREATE TABLE public.users (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    ebay_user_id VARCHAR(255),
    ebay_token TEXT,
    ebay_token_expires TIMESTAMPTZ,
    notification_preferences JSONB DEFAULT '{"email": true, "push": false}',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Listings table
CREATE TABLE public.listings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    ebay_item_id VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    current_price DECIMAL(10,2) NOT NULL,
    original_price DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'USD',
    quantity INTEGER DEFAULT 1,
    listing_type listing_format DEFAULT 'FixedPriceItem',
    category_id VARCHAR(50),
    category_name VARCHAR(255),
    status listing_status DEFAULT 'Active',
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    watch_count INTEGER DEFAULT 0,
    hit_count INTEGER DEFAULT 0,
    listing_url TEXT,
    image_urls TEXT[],
    price_reduction_enabled BOOLEAN DEFAULT false,
    last_price_update TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, ebay_item_id)
);

-- Price history table
CREATE TABLE public.price_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
    old_price DECIMAL(10,2) NOT NULL,
    new_price DECIMAL(10,2) NOT NULL,
    change_percentage DECIMAL(5,2),
    change_reason TEXT,
    automated BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reduction strategies table
CREATE TABLE public.reduction_strategies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    listing_id UUID REFERENCES public.listings(id) ON DELETE CASCADE,
    strategy_type reduction_strategy DEFAULT 'fixed_percentage',
    reduction_percentage DECIMAL(5,2) DEFAULT 5.00,
    minimum_price DECIMAL(10,2),
    maximum_reductions INTEGER DEFAULT 5,
    time_trigger_days INTEGER DEFAULT 3,
    watch_count_threshold INTEGER DEFAULT 5,
    hit_count_threshold INTEGER DEFAULT 10,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sync errors table
CREATE TABLE public.sync_errors (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    operation VARCHAR(100) NOT NULL,
    error_message TEXT NOT NULL,
    error_details JSONB,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    errors TEXT[],
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User sessions table
CREATE TABLE public.user_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    session_token TEXT UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications table
CREATE TABLE public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_listings_user_id ON public.listings(user_id);
CREATE INDEX idx_listings_ebay_item_id ON public.listings(ebay_item_id);
CREATE INDEX idx_listings_status ON public.listings(status);
CREATE INDEX idx_listings_price_reduction_enabled ON public.listings(price_reduction_enabled);
CREATE INDEX idx_listings_end_time ON public.listings(end_time);
CREATE INDEX idx_price_history_listing_id ON public.price_history(listing_id);
CREATE INDEX idx_price_history_created_at ON public.price_history(created_at);
CREATE INDEX idx_reduction_strategies_user_id ON public.reduction_strategies(user_id);
CREATE INDEX idx_reduction_strategies_listing_id ON public.reduction_strategies(listing_id);
CREATE INDEX idx_sync_errors_user_id ON public.sync_errors(user_id);
CREATE INDEX idx_sync_errors_created_at ON public.sync_errors(created_at);
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(read);

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reduction_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only see their own data
CREATE POLICY "Users can view own data" ON public.users
    FOR ALL USING (auth.uid() = id);

-- Users can only see their own listings
CREATE POLICY "Users can view own listings" ON public.listings
    FOR ALL USING (user_id = auth.uid());

-- Users can only see their own price history
CREATE POLICY "Users can view own price history" ON public.price_history
    FOR ALL USING (
        listing_id IN (
            SELECT id FROM public.listings WHERE user_id = auth.uid()
        )
    );

-- Users can only see their own reduction strategies
CREATE POLICY "Users can view own strategies" ON public.reduction_strategies
    FOR ALL USING (user_id = auth.uid());

-- Users can only see their own sync errors
CREATE POLICY "Users can view own sync errors" ON public.sync_errors
    FOR ALL USING (user_id = auth.uid());

-- Users can only see their own sessions
CREATE POLICY "Users can view own sessions" ON public.user_sessions
    FOR ALL USING (user_id = auth.uid());

-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications" ON public.notifications
    FOR ALL USING (user_id = auth.uid());

-- Create functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_listings_updated_at BEFORE UPDATE ON public.listings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reduction_strategies_updated_at BEFORE UPDATE ON public.reduction_strategies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to automatically calculate price change percentage
CREATE OR REPLACE FUNCTION calculate_price_change()
RETURNS TRIGGER AS $$
BEGIN
    NEW.change_percentage = ROUND(
        ((NEW.new_price - NEW.old_price) / NEW.old_price * 100)::numeric, 2
    );
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for price change calculation
CREATE TRIGGER calculate_price_change_trigger BEFORE INSERT ON public.price_history
    FOR EACH ROW EXECUTE FUNCTION calculate_price_change();

-- Insert some sample data for testing (optional)
-- You can uncomment these if you want test data
/*
INSERT INTO public.users (id, email, name) VALUES
    (gen_random_uuid(), 'test@example.com', 'Test User');

INSERT INTO public.listings (user_id, ebay_item_id, title, current_price, currency) VALUES
    ((SELECT id FROM public.users WHERE email = 'test@example.com'), '123456789', 'Sample Item', 29.99, 'USD');
*/
```

### Step 4: Execute the Schema

1. **Replace `YOUR_JWT_SECRET_HERE`** with your generated JWT secret
2. **Click "Run"** to execute the entire schema
3. **Wait for completion** - you should see "Success. No rows returned"

### Step 5: Verify the Setup

1. **Go to "Table Editor"** in Supabase
2. **Check that these tables exist**:
   - ✅ `users`
   - ✅ `listings`
   - ✅ `price_history`
   - ✅ `reduction_strategies`
   - ✅ `sync_errors`
   - ✅ `user_sessions`
   - ✅ `notifications`

### Step 6: Update Your Environment Variables

1. **Copy your real Supabase credentials**
2. **Update your `.env` file**:
   ```env
   VITE_SUPABASE_URL=https://your-actual-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your_actual_anon_key
   SUPABASE_URL=https://your-actual-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_actual_service_role_key
   JWT_SECRET=your_generated_jwt_secret
   ```

---

## ✅ **Verification Checklist**

After running the schema, verify:

- [ ] All 7 tables created successfully
- [ ] All indexes created
- [ ] Row Level Security enabled on all tables
- [ ] RLS policies created
- [ ] Triggers for automatic timestamps working
- [ ] No errors in SQL execution
- [ ] Environment variables updated with real credentials

---

## 🎉 **You're Done!**

Your Supabase database is now fully configured with:
- ✅ Complete schema with all tables and relationships
- ✅ Row Level Security for data protection
- ✅ Automatic timestamp updates
- ✅ Performance indexes
- ✅ Price change calculation triggers

**Next Step**: Test the connection from your application by running the frontend and trying to sync listings!

---

## 🚨 **Troubleshooting**

### Issue: "JWT secret not found"
**Fix**: Make sure you replaced `YOUR_JWT_SECRET_HERE` with your actual generated secret

### Issue: "Table already exists"
**Fix**: If you need to start over, you can drop tables and re-run the schema

### Issue: "Permission denied"
**Fix**: Make sure you're using the correct service role key in your environment variables