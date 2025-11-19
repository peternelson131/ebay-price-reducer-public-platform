-- ===============================================
-- USER PROFILE CREATION TRIGGER
-- ===============================================
-- This script creates a trigger to automatically insert user profiles
-- when new users sign up through Supabase Auth

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    name,
    username,
    active,
    created_at,
    updated_at,
    ebay_connection_status
  )
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', new.email),
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    true,
    now(),
    now(),
    'disconnected'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Enable Row Level Security (RLS) on users table if not already enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for users to see their own data
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
CREATE POLICY "Users can view their own profile" ON users
  FOR SELECT USING (auth.uid() = id);

-- Create RLS policy for users to update their own data
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, UPDATE ON users TO authenticated;

-- Test the function (this won't actually insert since the user doesn't exist in auth.users)
-- SELECT handle_new_user();

-- ===============================================
-- VERIFICATION
-- ===============================================
-- You can verify the trigger works by checking:
-- SELECT * FROM users ORDER BY created_at DESC LIMIT 5;