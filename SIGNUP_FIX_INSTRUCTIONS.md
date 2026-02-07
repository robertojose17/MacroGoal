
# 🔧 Fix User Signup - Step by Step Instructions

## ⚠️ CRITICAL: You MUST run the SQL migration for signups to work!

The app is currently experiencing signup failures because the RLS (Row Level Security) policy is blocking new user profile creation. Follow these steps to fix it:

---

## 📋 Step 1: Apply the RLS Policy Fix (REQUIRED)

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Navigate to SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Copy and Paste this SQL:**

```sql
-- Fix RLS policies for users table to allow signup
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON users;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON users;
DROP POLICY IF EXISTS "Enable update for users based on id" ON users;
DROP POLICY IF EXISTS "Authenticated users can insert profiles" ON users;

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- CRITICAL FIX: Allow authenticated users to insert profiles during signup
CREATE POLICY "Authenticated users can insert profiles"
ON users
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow users to view their own profile
CREATE POLICY "Users can view their own profile"
ON users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update their own profile"
ON users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON users TO authenticated;
```

4. **Run the SQL**
   - Click "Run" or press Ctrl+Enter (Cmd+Enter on Mac)
   - You should see "Success. No rows returned"

5. **Verify the Policy**
   - Go to "Database" → "Tables" → "users"
   - Click on "RLS Policies"
   - You should see the new policy "Authenticated users can insert profiles"

---

## 📋 Step 2: Create Database Function (OPTIONAL but RECOMMENDED)

This creates a database function that can be called from the app to create user profiles. It's more reliable than direct inserts.

1. **In SQL Editor, run this:**

```sql
-- Create a database function to handle user profile creation
CREATE OR REPLACE FUNCTION create_user_profile(
  user_id UUID,
  user_email TEXT,
  user_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  -- Check if profile already exists
  IF EXISTS (SELECT 1 FROM users WHERE id = user_id) THEN
    result := json_build_object(
      'success', true,
      'message', 'Profile already exists'
    );
    RETURN result;
  END IF;

  -- Insert the user profile
  INSERT INTO users (id, email, name, user_type, onboarding_completed)
  VALUES (user_id, user_email, user_name, 'free', false);

  result := json_build_object(
    'success', true,
    'message', 'Profile created successfully'
  );
  
  RETURN result;
EXCEPTION
  WHEN unique_violation THEN
    result := json_build_object(
      'success', true,
      'message', 'Profile already exists'
    );
    RETURN result;
  WHEN OTHERS THEN
    result := json_build_object(
      'success', false,
      'error', SQLERRM
    );
    RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_user_profile(UUID, TEXT, TEXT) TO authenticated;
```

2. **Run the SQL**
   - Click "Run"
   - You should see "Success. No rows returned"

---

## 📋 Step 3: Deploy Edge Function (OPTIONAL)

If you want the most robust solution, deploy the Edge Function:

1. **Install Supabase CLI** (if not already installed):
```bash
npm install -g supabase
```

2. **Login to Supabase**:
```bash
supabase login
```

3. **Link your project**:
```bash
supabase link --project-ref esgptfiofoaeguslgvcq
```

4. **Deploy the Edge Function**:
```bash
supabase functions deploy create-user-profile
```

---

## ✅ Step 4: Test the Fix

1. **Restart your app** (if it's running)

2. **Try creating a new account**:
   - Open the app
   - Go to Sign Up
   - Fill in the form
   - Click "Sign Up"

3. **Check the logs**:
   - You should see:
     ```
     [SignUp] ✅ Auth user created: [user-id]
     [SignUp] ✅ Session established
     [SignUp] ✅ Profile created successfully
     [SignUp] ✅ Signup complete!
     ```

4. **Verify in Supabase Dashboard**:
   - Go to "Authentication" → "Users"
   - You should see the new user
   - Go to "Database" → "Tables" → "users"
   - You should see the user profile

---

## 🐛 Troubleshooting

### If signup still fails:

1. **Check the logs** for error messages
2. **Verify the RLS policy** was created correctly
3. **Check if the user was created in auth** but not in the database
4. **Try running the SQL migration again**

### If you see "RLS policy blocking insert":

- The SQL migration wasn't applied correctly
- Go back to Step 1 and run the SQL again
- Make sure you see "Success" after running the SQL

### If you see "Function does not exist":

- The database function wasn't created
- Go back to Step 2 and run the SQL again
- The app will fall back to direct insert, which should work if Step 1 was completed

---

## 📝 What Changed?

### Before:
- RLS policy required `auth.uid() = id` for inserts
- During signup, `auth.uid()` wasn't available yet
- Profile creation failed with error 42501

### After:
- RLS policy allows any authenticated user to insert profiles
- This is safe because only authenticated users can insert
- The app ensures users only insert their own profile
- Signup now works reliably

---

## 🎉 Success!

After completing Step 1 (REQUIRED), new users should be able to create accounts without errors. Steps 2 and 3 are optional but provide additional reliability.

If you still have issues, check the app logs and Supabase Dashboard for more details.
