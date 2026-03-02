
# 📧 Email Verification Setup Guide for iOS

## Problem
When users click the email verification link on iOS, they see "Safari can't open the page because it couldn't connect to the server" (localhost error).

## Solution
The app now uses deep links for email verification. You need to configure your Supabase project to use the correct redirect URLs.

## ✅ Steps to Fix

### 1. Configure Supabase Redirect URLs

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq
2. Navigate to **Authentication** → **URL Configuration**
3. Add the following redirect URLs:

**For Development (Expo Go):**
```
exp://192.168.1.100:8081/--/auth/verify
```
Replace `192.168.1.100` with your computer's local IP address (shown in the Expo terminal when you run `npm run dev`)

**For Production (Standalone App):**
```
macrogoal://auth/verify
```

4. Click **Save**

### 2. Update Email Templates (Optional but Recommended)

1. In Supabase Dashboard, go to **Authentication** → **Email Templates**
2. Select **Confirm signup** template
3. Make sure it contains `{{ .ConfirmationURL }}` in the email body
4. The default template should work, but you can customize the message

### 3. Test the Flow

1. **Sign up** with a new email address
2. **Check your email** on your iOS device
3. **Tap the confirmation link** in the email
4. The app should open automatically and verify your account
5. You'll be redirected to complete your profile

## 🔍 How It Works

1. User signs up → Supabase sends confirmation email
2. Email contains a link like: `macrogoal://auth/verify?access_token=...&refresh_token=...`
3. iOS recognizes the `macrogoal://` scheme and opens the app
4. The `/auth/verify` screen processes the tokens
5. User is logged in and redirected to onboarding or home

## 📱 Finding Your Local IP Address

**On Mac:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

**On Windows:**
```bash
ipconfig
```
Look for "IPv4 Address" under your active network adapter

**In Expo Terminal:**
The IP is shown when you run `npm run dev`, look for:
```
Metro waiting on exp://192.168.1.100:8081
```

## ⚠️ Important Notes

- **Development**: Use `exp://YOUR_IP:8081/--/auth/verify` for Expo Go
- **Production**: Use `macrogoal://auth/verify` for standalone builds
- The scheme `macrogoal` is defined in `app.json`
- Make sure to add BOTH URLs to Supabase for seamless testing

## 🐛 Troubleshooting

**Link still goes to localhost:**
- Make sure you saved the redirect URLs in Supabase
- Clear your browser cache and try signing up again
- Check that the email template is using `{{ .ConfirmationURL }}`

**App doesn't open when clicking the link:**
- Verify the scheme in `app.json` matches the URL (`macrogoal://`)
- Make sure you're testing on a physical device (deep links don't work in simulators for email links)
- Try restarting the Expo dev server

**"Invalid verification link" error:**
- The link may have expired (default: 24 hours)
- Try signing up again with a fresh email
- Check Supabase logs for any errors

## ✅ Success Indicators

When everything is working correctly:
1. User signs up → sees "Check Your Email!" alert
2. User opens email on iOS device → taps link
3. App opens automatically → shows "Verifying your email..." screen
4. After 1-2 seconds → shows "Email verified!" message
5. User is redirected to complete profile or home screen

---

**Need Help?** Check the Supabase logs in Dashboard → Logs → Auth Logs to see what's happening with the verification requests.
