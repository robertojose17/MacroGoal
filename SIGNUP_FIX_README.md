
# Signup and Login Error Fixes

## Issues Fixed

### 1. Login Error: "Invalid login credentials"
**Problem**: Users were unable to log in with valid credentials.

**Root Cause**: The email wasn't being trimmed or normalized before sending to Supabase.

**Fix**: 
- Added `.trim().toLowerCase()` to the email before authentication
- Improved error messages to be more user-friendly
- Added better logging to track the authentication flow

### 2. SignUp Error: "new row violates row-level security policy for table 'users'"
**Problem**: New users couldn't sign up because the RLS policy was blocking the insert into the `users` table.

**Root Cause**: The RLS policy wasn't properly configured to allow authenticated users to insert their own profile during signup.

**Fixes Applied**:

#### A. Database Migration (supabase/migrations/20250101000003_fix_users_rls_for_signup.sql)
Created a new migration that:
- Drops all existing conflicting policies
- Creates a proper INSERT policy that allows authenticated users to insert their own profile
- Ensures the policy checks that `auth.uid() = id`
- Grants necessary permissions to authenticated users

#### B. Improved Signup Flow (app/auth/signup.tsx)
Enhanced the signup process with:
- **Longer initial wait**: Added 1.5 second wait after auth user creation to ensure session is established
- **Exponential backoff**: Increased retry count to 5 attempts with exponential backoff (1s, 2s, 3s, 4s, 5s)
- **Better RLS error handling**: Specifically detects RLS errors (code 42501) and waits longer before retrying
- **Duplicate key handling**: Treats duplicate key errors as success (profile already exists)
- **Graceful failure**: If profile creation fails after all retries, signs out the user and shows a helpful error message
- **Comprehensive logging**: Added detailed console logs at each step for debugging

#### C. Login Flow Improvements (app/auth/login.tsx)
- Normalized email input (trim + lowercase)
- Better error messages for common issues
- Improved user record creation fallback
- Enhanced logging for debugging

## How to Apply the Fix

### Step 1: Apply the Database Migration
Run the SQL migration to fix the RLS policies:

```bash
# If using Supabase CLI
supabase db push

# Or manually run the SQL in the Supabase dashboard:
# Go to SQL Editor and run the contents of:
# supabase/migrations/20250101000003_fix_users_rls_for_signup.sql
```

### Step 2: Test the Signup Flow
1. Try creating a new account
2. The app will:
   - Create the auth user
   - Wait 1.5 seconds for session establishment
   - Attempt to create the user profile (up to 5 times with exponential backoff)
   - Navigate to onboarding on success

### Step 3: Test the Login Flow
1. Try logging in with existing credentials
2. The app will:
   - Normalize the email (trim + lowercase)
   - Authenticate with Supabase
   - Check/create user profile if needed
   - Navigate to home or onboarding based on status

## Verification

Check the console logs for these success indicators:

**Signup Success**:
```
[SignUp] ✅ Auth user created: <user-id>
[SignUp] ✅ Profile created successfully
[SignUp] ✅ Signup complete!
```

**Login Success**:
```
[Login] ✅ User logged in: <user-id>
[Login] ✅ Onboarding complete, going to home
```

## Troubleshooting

If signup still fails after applying the migration:

1. **Check RLS Policies**: Go to Supabase Dashboard → Authentication → Policies and verify the policies exist
2. **Check Logs**: Look for detailed error messages in the console
3. **Manual Profile Creation**: As a last resort, profiles can be created manually in the Supabase dashboard

## Technical Details

### RLS Policy Structure
```sql
-- Allow authenticated users to insert their own profile
CREATE POLICY "Users can insert their own profile"
ON users
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);
```

This policy ensures that:
- Only authenticated users can insert
- They can only insert a row where the `id` matches their `auth.uid()`
- This prevents users from creating profiles for other users

### Retry Logic
The signup flow uses exponential backoff:
- Attempt 1: Immediate
- Attempt 2: Wait 1 second
- Attempt 3: Wait 2 seconds
- Attempt 4: Wait 3 seconds
- Attempt 5: Wait 4 seconds

This gives the database time to propagate the auth session and allows the RLS policy to properly evaluate.

## Additional Notes

- The migration is idempotent (can be run multiple times safely)
- All existing user data is preserved
- The fix is backward compatible with existing users
- No changes needed to other parts of the app
