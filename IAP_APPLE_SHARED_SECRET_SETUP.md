
# 🔐 Apple In-App Purchase - Shared Secret Setup

## ⚠️ CRITICAL: The app cannot verify purchases without this configuration!

Your app is trying to connect to Apple StoreKit, but the **Supabase Edge Function needs your Apple Shared Secret** to verify receipts with Apple's servers.

---

## 📋 Step 1: Get Your Apple Shared Secret

1. **Go to App Store Connect**: https://appstoreconnect.apple.com
2. **Navigate to**: My Apps → **Macro Goal** → Features → **In-App Purchases**
3. **Click**: "App-Specific Shared Secret" (in the sidebar)
4. **Generate** a new shared secret if you don't have one
5. **Copy** the shared secret (it looks like: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`)

---

## 📋 Step 2: Add the Secret to Supabase

### Option A: Using Supabase Dashboard (Recommended)

1. **Go to**: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq
2. **Navigate to**: Settings → Edge Functions → Secrets
3. **Click**: "Add new secret"
4. **Name**: `APPLE_SHARED_SECRET`
5. **Value**: Paste your shared secret from Step 1
6. **Click**: "Save"

### Option B: Using Supabase CLI

```bash
# Set the secret
supabase secrets set APPLE_SHARED_SECRET=your_shared_secret_here

# Verify it was set
supabase secrets list
```

---

## 📋 Step 3: Set the Environment (Optional)

By default, the Edge Function uses **sandbox** mode (for TestFlight testing).

When you're ready for production:

1. **Go to**: Supabase Dashboard → Settings → Edge Functions → Secrets
2. **Add**: `APPLE_IAP_ENVIRONMENT` = `production`

**Important**: Keep it as `sandbox` (or don't set it) while testing with TestFlight!

---

## 📋 Step 4: Redeploy the Edge Function

After adding the secret, you need to redeploy the Edge Function:

### Using Supabase Dashboard:
1. Go to: Edge Functions → `verify-apple-receipt`
2. Click: "Deploy" or "Redeploy"

### Using Supabase CLI:
```bash
supabase functions deploy verify-apple-receipt
```

---

## ✅ Step 5: Test the Connection

1. **Open the app** on a real iOS device or TestFlight
2. **Go to**: Profile → Upgrade to Premium
3. **Check the diagnostics**:
   - ✅ "Connected to StoreKit successfully"
   - ✅ "Loaded X product(s) successfully"
   - If you see errors, tap "Show Diagnostics" to see what's wrong

---

## 🐛 Troubleshooting

### "No products returned from App Store"
- **Cause**: Products not configured correctly in App Store Connect
- **Fix**: 
  1. Go to App Store Connect → In-App Purchases
  2. Verify product IDs: `mg_monthly` and `mg_yearly`
  3. Ensure products are in "Ready to Submit" status
  4. Ensure Bundle ID matches: `com.robertojose17.macrogoal`

### "Server configuration error: APPLE_SHARED_SECRET missing"
- **Cause**: The shared secret wasn't added to Supabase
- **Fix**: Follow Step 2 above

### "Receipt verification failed"
- **Cause**: Wrong environment (sandbox vs production)
- **Fix**: 
  - For TestFlight: Use sandbox (don't set `APPLE_IAP_ENVIRONMENT`)
  - For App Store: Set `APPLE_IAP_ENVIRONMENT=production`

### "Store not connected"
- **Cause**: Testing on Simulator or device not signed in to Apple ID
- **Fix**: 
  - Use a real iOS device or TestFlight
  - Sign in to a valid Apple ID in Settings

---

## 📚 Additional Resources

- [Apple: In-App Purchase Documentation](https://developer.apple.com/in-app-purchase/)
- [Apple: Testing In-App Purchases](https://developer.apple.com/documentation/storekit/in-app_purchase/testing_in-app_purchases)
- [Supabase: Edge Functions Secrets](https://supabase.com/docs/guides/functions/secrets)

---

## 🎯 Quick Checklist

- [ ] Generated Apple Shared Secret in App Store Connect
- [ ] Added `APPLE_SHARED_SECRET` to Supabase Edge Function secrets
- [ ] Redeployed `verify-apple-receipt` Edge Function
- [ ] Products configured in App Store Connect (`mg_monthly`, `mg_yearly`)
- [ ] Bundle ID matches: `com.robertojose17.macrogoal`
- [ ] Testing on real device or TestFlight (not Simulator)
- [ ] Device signed in to Apple ID

---

**Once you complete these steps, the app will be able to connect to StoreKit and verify purchases!** 🎉
