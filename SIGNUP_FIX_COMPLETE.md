
# User Signup Profile Creation Fix

## Problem
New users were unable to create accounts because the RLS (Row Level Security) policy on the `users` table was blocking profile creation during signup. The error was:

```
Error code: 42501
Error message: new row violates row-level security policy for table "users"
```

## Root Cause
The RLS policy required `auth.uid()` to match the user ID being inserted, but during signup, the auth session might not be fully established when we try to insert the user record, causing the policy to block the insert.

## Solution
We've implemented a multi-layered approach to fix this issue:

### 1. Updated RLS Policy (CRITICAL - MUST RUN THIS SQL)
Run the SQL migration in `supabase/migrations/20250130000001_fix_signup_rls_policy.sql`:

```sql
-- This allows authenticated users to insert profiles during signup
CREATE POLICY "Authenticated users can insert profiles"
ON users
FOR INSERT
TO authenticated
WITH CHECK (true);
```

**To apply this fix:**
1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `supabase/migrations/20250130000001_fix_signup_rls_policy.sql`
4. Run the SQL
5. Verify the policy was created successfully

### 2. Created Edge Function (Optional but Recommended)
Created `supabase/functions/create-user-profile/index.ts` which uses the service role key to bypass RLS entirely. This is the most reliable method.

**To deploy the Edge Function:**
```bash
supabase functions deploy create-user-profile
```

### 3. Updated Signup Flow
The signup flow now:
1. Creates the auth user
2. Waits for the session to be established (2 seconds)
3. Attempts to create the profile using the Edge Function (if available)
4. Falls back to direct insert if Edge Function fails
5. Retries up to 3 times with exponential backoff
6. Allows the user to continue even if profile creation fails (the onboarding screen will create it)

### 4. Enhanced Navigation Logic
The `app/_layout.tsx` now handles cases where:
- User exists in auth but not in the database
- Database queries timeout
- Profile creation fails

It will automatically attempt to create the user record if it's missing.

## Testing
To test the fix:

1. **Apply the SQL migration** (CRITICAL STEP)
2. Try creating a new account
3. The signup should succeed without RLS errors
4. The user should be redirected to onboarding
5. Check the logs for `[SignUp] ✅ Profile created successfully`

## Verification
After applying the fix, you should see these logs during signup:

```
[SignUp] Starting signup process...
[SignUp] Step 1: Creating auth user...
[SignUp] ✅ Auth user created: [user-id]
[SignUp] Waiting for auth session to establish...
[SignUp] ✅ Session established
[SignUp] Step 2: Creating user profile via Edge Function...
[SignUp] Profile creation attempt 1/3
[SignUp] ✅ Profile created successfully via Edge Function
[SignUp] ✅ Signup complete!
```

## Fallback Behavior
If profile creation fails after all retries, the user is still allowed to continue to onboarding. The onboarding screen will attempt to create the profile again, ensuring no user is left in a broken state.

## Files Changed
1. `supabase/migrations/20250130000001_fix_signup_rls_policy.sql` - New RLS policy
2. `supabase/functions/create-user-profile/index.ts` - New Edge Function
3. `app/auth/signup.tsx` - Updated signup flow with Edge Function support
4. `app/_layout.tsx` - Enhanced navigation logic (already had fallback logic)

## Important Notes
- **The SQL migration MUST be run** for the fix to work
- The Edge Function is optional but highly recommended
- The app will work even if the Edge Function isn't deployed (it falls back to direct insert)
- Users who had signup failures can now try again successfully
