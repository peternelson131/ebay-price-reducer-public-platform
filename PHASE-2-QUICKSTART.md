# Phase 2 Quick Start Guide - Database Setup

## 🚀 Ready to Implement? Follow These Steps!

Since your project already has the schema and functions set up, here's what you need to do to get Phase 2 running:

---

## ✅ **Step 1: Create Supabase Project (15 minutes)**

1. **Go to [supabase.com](https://supabase.com)** and create account
2. **Click "New project"**
3. **Fill in details**:
   - Project name: `ebay-price-reducer`
   - Database password: Generate strong password *(save this!)*
   - Region: Choose closest to you (e.g., `us-east-1`)
4. **Wait for setup** (2-3 minutes)

---

## ✅ **Step 2: Get Your Credentials (5 minutes)**

1. **Go to Settings > API**
2. **Copy these 3 values**:
   ```
   Project URL: https://xxxxxxxxx.supabase.co
   anon public: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   service_role: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
3. **Keep service_role secret!**

---

## ✅ **Step 3: Set Up Database Schema (10 minutes)**

1. **Go to SQL Editor** in Supabase
2. **Create new query**
3. **Copy-paste from `supabase-schema.sql`**
4. **Replace this line**:
   ```sql
   ALTER database postgres SET "app.jwt_secret" TO 'your-jwt-secret';
   ```
   **With** (generate a random 32-char string):
   ```sql
   ALTER database postgres SET "app.jwt_secret" TO 'abc123xyz789...your-random-string';
   ```
5. **Click Run** ▶️
6. **Should see "Success. No rows returned"**

---

## ✅ **Step 4: Configure Environment Variables (5 minutes)**

1. **Create `.env` file**:
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your credentials**:
   ```env
   VITE_SUPABASE_URL=https://xxxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_URL=https://xxxxxxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   JWT_SECRET=your-random-string-from-step-3
   NODE_ENV=development
   ```

3. **Save and close**

---

## ✅ **Step 5: Test the Connection (10 minutes)**

1. **Make sure frontend is running**:
   ```bash
   cd frontend
   npm run dev
   ```

2. **Open browser to `http://localhost:3000`**

3. **Open browser console (F12)**

4. **Test Supabase connection**:
   ```javascript
   // Should show your Supabase client
   console.log(window.supabase);
   ```

5. **Try the login page** - should load without errors

---

## ✅ **Step 6: Verify Database Tables (5 minutes)**

1. **Go to Supabase Table Editor**
2. **Check these tables exist**:
   - ✅ `users`
   - ✅ `listings`
   - ✅ `price_history`
   - ✅ `reduction_strategies`
   - ✅ `sync_errors`
   - ✅ `user_sessions`
   - ✅ `notifications`

3. **If missing tables, re-run schema in SQL Editor**

---

## ✅ **Step 7: Test User Registration (5 minutes)**

1. **Go to your app login page**
2. **Click "Sign up"**
3. **Create test account**:
   - Email: `test@example.com`
   - Password: `testpassword123`
   - Name: `Test User`
4. **Should work without errors**
5. **Check Supabase Authentication > Users** - should see new user

---

## 🎉 **Phase 2 Complete!**

**You're ready when:**
- ✅ Supabase project created
- ✅ Database schema deployed
- ✅ Environment variables configured
- ✅ Frontend connects without errors
- ✅ Can register/login users
- ✅ Tables visible in Supabase dashboard

---

## 🚨 **Troubleshooting**

### Problem: "Invalid API key"
**Fix**: Double-check your `.env` file has correct Supabase credentials

### Problem: "Table doesn't exist"
**Fix**: Re-run `supabase-schema.sql` in SQL Editor

### Problem: "JWT secret not found"
**Fix**: Make sure you updated the JWT secret in Step 3

### Problem: Console errors in browser
**Fix**: Check browser console for specific error message

---

## 📞 **Need Help?**

1. **Check browser console** for error messages
2. **Check Supabase logs** in dashboard
3. **Verify environment variables** are correct
4. **Make sure all steps completed** in order

---

## ⏭️ **Next: Phase 3 - eBay API Integration**

Once Phase 2 is working, you'll move on to:
- Setting up eBay Developer account
- Configuring API credentials
- Testing eBay API connections
- Building authentication flow

**Total Time**: ~1 hour
**Status**: Ready to implement! 🚀