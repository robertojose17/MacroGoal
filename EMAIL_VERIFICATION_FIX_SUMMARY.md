
# ✅ Email Verification Fix - Summary of Changes

## Problem
Users clicking email verification links on iOS devices were seeing:
> "Safari can't open the page because it couldn't connect to the server"

This happened because Supabase was redirecting to `localhost`, which doesn't work on mobile devices.

## Solution Implemented

### 1. **Updated Supabase Client** (`app/integrations/supabase/client.ts`)
- Enabled `detectSessionInUrl: true` to handle deep link authentication
- Added `expo-linking` import for deep link support

### 2. **Updated Signup Flow** (`app/auth/signup.tsx`)
- Added deep link redirect URL using `Linking.createURL('/auth/verify')`
- Configured `emailRedirectTo` option in `supabase.auth.signUp()`
- Updated success message to guide users to check email on their device

### 3. **Created Verification Handler** (`app/auth/verify.tsx`)
- New screen that processes email verification deep links
- Extracts `access_token` and `refresh_token` from URL parameters
- Sets Supabase session using the tokens
- Redirects to onboarding or home based on user status
- Shows clear status messages (verifying → success/error)

### 4. **Updated App Configuration** (`app.json`)
- Changed scheme from `"Macro Goal"` to `"macrogoal"` (URL-friendly)
- This enables the app to handle `macrogoal://` deep links

## How It Works Now

### User Flow:
1. User signs up with email → Supabase sends confirmation email
2. User opens email on iOS device → taps "Confirm your mail" link
3. Link opens as `macrogoal://auth/verify?access_token=...&refresh_token=...`
4. iOS recognizes the scheme and opens the app
5. `/auth/verify` screen processes the tokens and sets the session
6. User is logged in and redirected to complete profile or home

### Technical Flow:
```
Email Link Click
    ↓
macrogoal://auth/verify?access_token=XXX&refresh_token=YYY
    ↓
iOS opens app with deep link
    ↓
Linking.addEventListener('url', handleDeepLink)
    ↓
Extract tokens from URL
    ↓
supabase.auth.setSession({ access_token, refresh_token })
    ↓
Check user profile and onboarding status
    ↓
Redirect to /onboarding/complete or /(tabs)/(home)
```

## Required Supabase Configuration

### ⚠️ IMPORTANT: You must update your Supabase project settings

1. Go to: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq
2. Navigate to: **Authentication** → **URL Configuration**
3. Add these redirect URLs:

**For Development (Expo Go):**
```
exp://YOUR_LOCAL_IP:8081/--/auth/verify
```
Example: `exp://192.168.1.100:8081/--/auth/verify`

**For Production (Standalone App):**
```
macrogoal://auth/verify
```

4. Click **Save**

### Finding Your Local IP:
- **Mac**: Run `ifconfig | grep "inet " | grep -v 127.0.0.1`
- **Windows**: Run `ipconfig` and look for IPv4 Address
- **Expo Terminal**: Look for the IP in `Metro waiting on exp://192.168.1.100:8081`

## Files Changed

1. ✅ `app/integrations/supabase/client.ts` - Enabled deep link detection
2. ✅ `app/auth/signup.tsx` - Added deep link redirect URL
3. ✅ `app/auth/verify.tsx` - **NEW** - Handles email verification deep links
4. ✅ `app.json` - Updated scheme to `macrogoal`

## Testing Checklist

- [ ] Update Supabase redirect URLs (see above)
- [ ] Sign up with a new email address
- [ ] Check email on iOS device
- [ ] Tap "Confirm your mail" link
- [ ] App should open automatically
- [ ] See "Verifying your email..." message
- [ ] See "Email verified!" success message
- [ ] Redirected to onboarding or home screen

## Troubleshooting

**Link still goes to localhost:**
- Make sure you saved the redirect URLs in Supabase
- Clear browser cache and try signing up again

**App doesn't open:**
- Verify scheme in `app.json` is `macrogoal`
- Test on a physical device (simulators may not handle email deep links)
- Restart Expo dev server

**"Invalid verification link":**
- Link may have expired (24 hours default)
- Try signing up again with a fresh email

## Success Indicators

✅ User sees "Check Your Email!" alert after signup
✅ Email contains clickable link
✅ Tapping link opens the app (not Safari)
✅ App shows "Verifying your email..." screen
✅ After 1-2 seconds, shows "Email verified!" message
✅ User is redirected to complete profile

---

**Next Steps:** Follow the instructions in `EMAIL_VERIFICATION_SETUP.md` or `CONFIGURACION_VERIFICACION_EMAIL.md` (Spanish) to configure your Supabase project.
