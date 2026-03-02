
# 🚨 IAP Connection Issue - Quick Fix

## The Problem
Your app cannot connect to Apple StoreKit to verify purchases because the **Apple Shared Secret** is missing from the backend.

## The Solution (5 minutes)

### 1️⃣ Get Your Apple Shared Secret
- Go to: https://appstoreconnect.apple.com
- Navigate to: **My Apps** → **Macro Goal** → **Features** → **In-App Purchases**
- Click: **"App-Specific Shared Secret"**
- Copy the secret (looks like: `a1b2c3d4e5f6...`)

### 2️⃣ Add to Supabase
- Go to: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq
- Navigate to: **Settings** → **Edge Functions** → **Secrets**
- Add new secret:
  - **Name**: `APPLE_SHARED_SECRET`
  - **Value**: (paste your secret)
- Click **Save**

### 3️⃣ Redeploy Edge Function
- Go to: **Edge Functions** → `verify-apple-receipt`
- Click: **Deploy** or **Redeploy**

### 4️⃣ Test
- Open app on real iOS device or TestFlight
- Go to Profile → Upgrade to Premium
- Tap "Show Diagnostics" to see connection status

## What Changed?
I've added:
- ✅ **Supabase Edge Function** (`verify-apple-receipt`) to verify receipts with Apple
- ✅ **Enhanced diagnostics** in the app to show exactly what's happening
- ✅ **Better error messages** to help troubleshoot connection issues

## Still Having Issues?
Check the diagnostics in the app:
- Tap "Upgrade to Premium"
- If there's an error, tap "Show Diagnostics"
- The diagnostics will tell you exactly what's wrong:
  - ❌ "No products returned" → Check App Store Connect product setup
  - ❌ "Store not connected" → Use real device, not Simulator
  - ❌ "Verification failed" → Check the shared secret is correct

---

**The app is now ready to connect to StoreKit once you add the Apple Shared Secret!** 🎉
