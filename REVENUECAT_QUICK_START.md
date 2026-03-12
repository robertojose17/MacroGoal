
# 🚀 RevenueCat Quick Start Guide

## ⚡ Get Your Subscriptions Working in 15 Minutes

This is a condensed guide to get RevenueCat working ASAP. For detailed information, see `REVENUECAT_MIGRATION_GUIDE.md`.

---

## 📋 Prerequisites

- [ ] App Store Connect account (iOS)
- [ ] Google Play Console account (Android)
- [ ] Products created in App Store Connect/Google Play Console
- [ ] Supabase project set up

---

## 🎯 Step 1: RevenueCat Setup (5 minutes)

### 1.1 Create Account
1. Go to https://app.revenuecat.com
2. Sign up (free for up to $10k MRR)

### 1.2 Add Your App
1. Click "Create New Project"
2. Add iOS app:
   - Bundle ID: `com.robertojose17.macrogoal`
3. Add Android app:
   - Package Name: `com.robertojose17.macrogoal`

### 1.3 Create Products
1. Go to "Products" tab
2. Add products (must match App Store/Play Store):
   - `macro_goal_premium_monthly`
   - `macro_goal_premium_yearly`

### 1.4 Create Entitlement
1. Go to "Entitlements" tab
2. Create entitlement: `premium_access`

### 1.5 Create Offering
1. Go to "Offerings" tab
2. Create offering: `default`
3. Add both products to offering
4. Link products to `premium_access` entitlement

### 1.6 Get API Keys
1. Go to "API Keys" tab
2. Copy iOS key (starts with `appl_`)
3. Copy Android key (starts with `goog_`)

---

## 🔧 Step 2: Configure Your App (5 minutes)

### 2.1 Update app.json

```json
{
  "expo": {
    "extra": {
      "revenueCat": {
        "iosApiKey": "appl_YOUR_ACTUAL_IOS_KEY_HERE",
        "androidApiKey": "goog_YOUR_ACTUAL_ANDROID_KEY_HERE"
      }
    }
  }
}
```

### 2.2 Rebuild Native Code

```bash
# iOS
npx expo prebuild -p ios
cd ios && pod install && cd ..

# Android
npx expo prebuild -p android
```

---

## 🔗 Step 3: Configure Webhook (3 minutes)

### 3.1 In RevenueCat Dashboard
1. Go to "Integrations" → "Webhooks"
2. Click "Add Webhook"
3. URL: `https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/revenuecat-webhook`
4. Generate webhook secret (save it!)
5. Select "All events"
6. Click "Save"

### 3.2 In Supabase Dashboard
1. Go to "Edge Functions" → "Secrets"
2. Add secret:
   - Name: `REVENUECAT_WEBHOOK_SECRET`
   - Value: (paste the secret from RevenueCat)

### 3.3 Deploy Edge Function

```bash
supabase functions deploy revenuecat-webhook
```

---

## ✅ Step 4: Test (2 minutes)

### 4.1 iOS Testing
1. Create Sandbox Tester in App Store Connect
2. Sign out of App Store on device
3. Run app: `npm run ios`
4. Navigate to subscription screen
5. Attempt purchase
6. Sign in with Sandbox Tester

### 4.2 Android Testing
1. Add test account in Google Play Console
2. Run app: `npm run android`
3. Navigate to subscription screen
4. Attempt purchase

### 4.3 Verify
1. Check RevenueCat dashboard → Customers
2. Check Supabase → subscriptions table
3. Check users.user_type = 'premium'

---

## 🎉 Done!

Your subscriptions are now powered by RevenueCat!

### What You Get

✅ Automatic receipt verification  
✅ Cross-platform subscription sync  
✅ Real-time analytics  
✅ Automatic refund handling  
✅ Grace period management  
✅ Churn analysis  

---

## 🐛 Quick Troubleshooting

### "No offerings available"
- Wait 5-10 minutes for RevenueCat to sync
- Verify products linked to offering
- Verify offering is "default"

### "Purchase completed but not premium"
- Check RevenueCat dashboard → Customer → Entitlements
- Check Supabase logs: `supabase functions logs revenuecat-webhook`
- Verify webhook secret matches

### "Products not loading"
- iOS: Test on real device (not simulator)
- Android: Use signed build (not debug)
- Verify product IDs match exactly

---

## 📚 Next Steps

1. Read full migration guide: `REVENUECAT_MIGRATION_GUIDE.md`
2. Test all subscription lifecycle events
3. Set up production webhook
4. Monitor RevenueCat dashboard

---

## 🆘 Need Help?

- **RevenueCat Docs:** https://docs.revenuecat.com
- **RevenueCat Support:** support@revenuecat.com
- **Community:** https://community.revenuecat.com

---

**Status:** ✅ Migration Complete  
**Time to Complete:** ~15 minutes  
**Difficulty:** Easy
