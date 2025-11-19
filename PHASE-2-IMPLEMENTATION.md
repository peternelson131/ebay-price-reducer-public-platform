# Phase 2: Database and Backend Infrastructure Implementation

## 🎯 Goal
Set up Supabase database foundation and verify all core tables and relationships are working correctly.

---

## 📋 Step-by-Step Implementation

### Step 1: Create Supabase Account and Project

1. **Go to [supabase.com](https://supabase.com)**
2. **Sign up** for a free account (or login if you have one)
3. **Create a new project**:
   - Click "New project"
   - Choose your organization
   - Project name: `ebay-price-reducer`
   - Database password: Generate a strong password (save this!)
   - Region: Choose closest to your users (e.g., `us-east-1`)
   - Pricing plan: Start with Free tier
4. **Wait for project setup** (usually 2-3 minutes)

### Step 2: Get Supabase Credentials

1. **Go to Settings > API** in your Supabase dashboard
2. **Copy these values** (we'll need them later):
   ```
   Project URL: https://your-project-id.supabase.co
   anon public key: eyJ... (starts with eyJ)
   service_role secret: eyJ... (different key, also starts with eyJ)
   ```
3. **Keep these secure** - don't share the service_role key!

### Step 3: Set Up Database Schema

1. **Go to SQL Editor** in your Supabase dashboard
2. **Create a new query**
3. **Copy and paste** the entire contents of `supabase-schema.sql`
4. **Replace placeholder** in line 5:
   ```sql
   ALTER database postgres SET "app.jwt_secret" TO 'your-actual-jwt-secret-here';
   ```
   Generate a random 32+ character string for this
5. **Run the query** (click the Play button)
6. **Verify success** - you should see "Success. No rows returned"

### Step 4: Verify Table Creation

1. **Go to Table Editor** in Supabase dashboard
2. **Check that these tables exist**:
   - [ ] `users`
   - [ ] `listings`
   - [ ] `price_history`
   - [ ] `reduction_strategies`
   - [ ] `sync_errors`
   - [ ] `user_sessions`
   - [ ] `notifications`

3. **For each table, verify**:
   - Columns are correct
   - Primary keys are set
   - Foreign key relationships exist
   - Default values are applied

### Step 5: Set Up Row Level Security (RLS)

1. **Go back to SQL Editor**
2. **Run this query** to enable RLS on all tables:
   ```sql
   -- Enable RLS on all tables
   ALTER TABLE users ENABLE ROW LEVEL SECURITY;
   ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
   ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
   ALTER TABLE reduction_strategies ENABLE ROW LEVEL SECURITY;
   ALTER TABLE sync_errors ENABLE ROW LEVEL SECURITY;
   ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
   ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
   ```

3. **Create basic RLS policies**:
   ```sql
   -- Users can only see their own data
   CREATE POLICY "Users can view own data" ON users
     FOR ALL USING (auth.uid() = id);

   -- Users can only see their own listings
   CREATE POLICY "Users can view own listings" ON listings
     FOR ALL USING (user_id = auth.uid());

   -- Users can only see their own price history
   CREATE POLICY "Users can view own price history" ON price_history
     FOR ALL USING (
       listing_id IN (
         SELECT id FROM listings WHERE user_id = auth.uid()
       )
     );
   ```

### Step 6: Test Database Connection

1. **Create a test user** in Authentication > Users
   - Email: `test@example.com`
   - Password: `testpassword123`
   - Email confirmed: Yes

2. **Test basic operations** in SQL Editor:
   ```sql
   -- Insert test data
   INSERT INTO users (email, name)
   VALUES ('test@example.com', 'Test User');

   -- Verify it was inserted
   SELECT * FROM users WHERE email = 'test@example.com';

   -- Clean up test data
   DELETE FROM users WHERE email = 'test@example.com';
   ```

### Step 7: Configure Authentication Settings

1. **Go to Authentication > Settings**
2. **Configure Site URL**:
   - For development: `http://localhost:3000`
   - For production: Your actual domain
3. **Configure Email Templates** (optional):
   - Customize signup confirmation email
   - Customize password reset email
4. **Set Password Requirements**:
   - Minimum length: 8 characters
   - Require special characters: Optional

### Step 8: Set Up Environment Variables

1. **Create `.env` file** in project root:
   ```bash
   cp .env.example .env
   ```

2. **Fill in your Supabase credentials**:
   ```env
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key_here
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   JWT_SECRET=your_jwt_secret_from_step_3
   NODE_ENV=development
   ```

3. **Never commit `.env`** to version control!

### Step 9: Test Frontend Connection

1. **Update Supabase client configuration**:
   ```javascript
   // frontend/src/lib/supabase.js should be updated with your credentials
   ```

2. **Start the frontend**:
   ```bash
   cd frontend
   npm run dev
   ```

3. **Test the connection** by opening browser console and running:
   ```javascript
   // This should log your Supabase client
   console.log(window.supabase);
   ```

---

## ✅ Phase 2 Success Criteria

Before moving to Phase 3, verify these items:

### Database Setup ✅
- [ ] Supabase project created successfully
- [ ] All tables created with proper schema
- [ ] Row Level Security enabled
- [ ] Basic RLS policies implemented
- [ ] Test user authentication working

### Configuration ✅
- [ ] Environment variables configured
- [ ] Frontend can connect to Supabase
- [ ] No console errors in browser
- [ ] Can create/login test user

### Security ✅
- [ ] Service role key is secure (not in frontend code)
- [ ] RLS policies prevent data leaks
- [ ] JWT secret is properly configured
- [ ] Authentication flow working

### Testing ✅
- [ ] Can register new user
- [ ] Can login/logout
- [ ] Users can only see their own data
- [ ] Database queries work correctly

---

## 🚨 Common Issues & Solutions

### Issue: "JWT secret not found"
**Solution**: Make sure you set the JWT secret in the database:
```sql
ALTER database postgres SET "app.jwt_secret" TO 'your-jwt-secret';
```

### Issue: "RLS policy violation"
**Solution**: Check that RLS policies are created correctly and user is authenticated

### Issue: "Connection refused"
**Solution**: Verify Supabase URL and keys are correct in .env file

### Issue: "Table doesn't exist"
**Solution**: Re-run the schema SQL in Supabase SQL Editor

---

## 📊 Estimated Time: 1-1.5 hours

- Supabase setup: 20 minutes
- Schema creation: 20 minutes
- RLS configuration: 15 minutes
- Testing and verification: 20 minutes
- Environment setup: 15 minutes

---

## 🎉 Next Steps

Once Phase 2 is complete, you'll have:
- ✅ Fully functional database with proper schema
- ✅ Secure user authentication system
- ✅ Row-level security protecting user data
- ✅ Frontend connected to backend
- ✅ All foundation pieces for building features

**Ready for Phase 3: eBay API Integration!** 🚀