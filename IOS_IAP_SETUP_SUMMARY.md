
# iOS In-App Purchase Setup Summary

## 🎯 Current Status

You're seeing the **"Product Not Found"** error because your iOS app is correctly configured, but the products haven't been created in Apple's App Store Connect yet.

**This is normal and expected!** The error will disappear once you complete the setup steps below.

## ✅ What's Already Done (Your Code is Ready!)

1. ✅ iOS-specific paywall screen (`app/paywall.ios.tsx`)
2. ✅ iOS subscription management hook (`hooks/useSubscription.ios.ts`)
3. ✅ Database migration for Apple IAP fields
4. ✅ Platform-specific routing (iOS uses Apple IAP, Android/Web use Stripe)
5. ✅ Purchase flow implementation
6. ✅ Restore purchases functionality
7. ✅ Subscription status sync
8. ✅ **NEW:** IAP Diagnostics tool to verify your setup

## 🚀 What You Need to Do Next

### Step 1: Verify Your Product IDs (2 minutes)

Your app is currently looking for these product IDs:
```
macrogoal_premium_monthly
macrogoal_premium_yearly
```

**Decision:** Do you want to keep these IDs or change them?

**Option A: Keep them** (recommended)
- No code changes needed
- Use these exact IDs in App Store Connect

**Option B: Change them** (if you prefer your bundle ID as prefix)
- Update `app/paywall.ios.tsx` line 10-13:
  ```typescript
  const PRODUCT_IDS = {
    monthly: 'com.yourcompany.app.premium.monthly',
    yearly: 'com.yourcompany.app.premium.yearly',
  };
  ```

### Step 2: Create Products in App Store Connect (30 minutes)

1. **Go to App Store Connect**
   - Visit [https://appstoreconnect.apple.com](https://appstoreconnect.apple.com)
   - Sign in with your Apple Developer account
   - Click "My Apps" → Select your app

2. **Create Subscription Group**
   - Click "Features" → "In-App Purchases"
   - Click "+" → "Auto-Renewable Subscription"
   - Create group: "Premium Subscriptions"

3. **Create Monthly Product**
   - Product ID: `macrogoal_premium_monthly` (must match exactly!)
   - Reference Name: "Premium Monthly"
   - Duration: 1 Month
   - Price: $9.99 (or your chosen price)
   - Add display name and description
   - Upload promotional image (1024x1024px)
   - Submit for review

4. **Create Yearly Product**
   - Product ID: `macrogoal_premium_yearly` (must match exactly!)
   - Reference Name: "Premium Yearly"
   - Duration: 1 Year
   - Price: $49.99 (or your chosen price)
   - Same group as monthly
   - Submit for review

### Step 3: Create Sandbox Tester (5 minutes)

1. In App Store Connect: "Users and Access" → "Sandbox Testers"
2. Click "+" to add tester
3. Use a NEW email (not associated with any Apple ID)
4. Example: `testuser12345@example.com`
5. Set password and save credentials

### Step 4: Test Your Setup (30 minutes)

#### Using the Diagnostics Tool (Easiest Way!)

1. **Open the app on your iOS device**
2. **Go to Profile tab**
3. **Tap "IAP Diagnostics"** button
4. **Review the results:**
   - ✅ Green checkmarks = Everything is working
   - ❌ Red errors = Something needs fixing
   - ⚠️ Yellow warnings = Optional issues

The diagnostics tool will tell you:
- If your bundle ID is configured
- If products are found in App Store Connect
- If you have any previous purchases
- If your database is connected
- Detailed error messages if something is wrong

#### Manual Testing (If you prefer)

1. **Sign out of real Apple ID** on device (Settings → [Your Name] → Sign Out)
2. **Build and install** your app
3. **Navigate to paywall** (Profile → Upgrade to Premium)
4. **Tap "Subscribe Now"**
5. **Sign in with sandbox tester** account when prompted
6. **Complete purchase** (you won't be charged)
7. **Verify premium features unlock**

### Step 5: Test Restore Purchases (10 minutes)

1. Delete the app
2. Reinstall the app
3. Go to paywall
4. Tap "Restore Purchases"
5. Sign in with same sandbox tester
6. Verify subscription restores

## 🔍 Troubleshooting

### "Product Not Found" Error

**Cause:** Products don't exist in App Store Connect yet

**Solution:**
1. Create products in App Store Connect (Step 2 above)
2. Wait 1-2 hours for Apple's servers to sync
3. Run the IAP Diagnostics tool to verify
4. Check that product IDs match exactly (case-sensitive!)

### Products Still Not Loading After Creating Them

**Checklist:**
- [ ] Product IDs in code match App Store Connect exactly
- [ ] Products are submitted (not just saved as draft)
- [ ] Waited 1-2 hours after creating products
- [ ] Bundle identifier matches between Xcode and App Store Connect
- [ ] Testing on physical iOS device (not simulator)
- [ ] In-App Purchase capability enabled in Xcode

**Run the diagnostics tool** - it will tell you exactly what's wrong!

### Purchase Fails

**Checklist:**
- [ ] Signed out of real Apple ID on device
- [ ] Using valid sandbox tester account
- [ ] Products are submitted in App Store Connect
- [ ] Internet connection is working

### Restore Doesn't Work

**Checklist:**
- [ ] Made a purchase first with this Apple ID
- [ ] Using the same Apple ID for restore
- [ ] Subscription hasn't expired

## 📊 Using the IAP Diagnostics Tool

The diagnostics tool (`app/iap-diagnostics.tsx`) is your best friend for debugging!

**What it checks:**
1. ✅ Platform (iOS required)
2. ✅ Bundle identifier configuration
3. ✅ Product IDs in your code
4. ✅ Connection to App Store
5. ✅ Product availability
6. ✅ Purchase history
7. ✅ Database connection
8. ✅ Subscription status

**How to use it:**
1. Open app on iOS device
2. Go to Profile tab
3. Tap "IAP Diagnostics" button
4. Wait for checks to complete
5. Review results (green = good, red = needs fixing)
6. Tap "View Full Results" to see details

**Share results with support:**
- Tap "View Full Results"
- Take a screenshot
- Share with your developer or Apple support

## 📝 Quick Reference

### Product IDs (Must Match Exactly!)
```
Monthly: macrogoal_premium_monthly
Yearly:  macrogoal_premium_yearly
```

### Pricing (Update in App Store Connect)
```
Monthly: $9.99
Yearly:  $49.99
```

### Testing Timeline
```
Create products:        30 min
Apple server sync:      1-2 hours
Sandbox testing:        30 min
Total:                  ~3 hours
```

### Production Timeline
```
Submit products:        5 min
Apple review:           24-48 hours
Production testing:     30 min
Total:                  ~2 days
```

## 🎯 Next Steps

1. **Decide on product IDs** (keep current or change)
2. **Create products in App Store Connect** (30 min)
3. **Wait for sync** (1-2 hours)
4. **Run IAP Diagnostics tool** to verify setup
5. **Create sandbox tester** (5 min)
6. **Test purchase flow** (30 min)
7. **Test restore purchases** (10 min)
8. **Submit app for review** when ready

## 📞 Need Help?

1. **Run the IAP Diagnostics tool first** - it will tell you exactly what's wrong
2. **Check the detailed guides:**
   - `IOS_IAP_TESTING_GUIDE.md` - Complete testing instructions
   - `IOS_IAP_IMPLEMENTATION_GUIDE.md` - Technical implementation details
   - `IOS_IAP_CHECKLIST.md` - Step-by-step checklist
3. **Common issues are documented** in the testing guide
4. **Contact Apple Developer Support** if you're stuck

## ✅ Success Criteria

You'll know everything is working when:
- ✅ IAP Diagnostics shows all green checkmarks
- ✅ Products load in the paywall
- ✅ Purchase completes successfully
- ✅ Premium features unlock
- ✅ Restore purchases works
- ✅ Subscription status syncs correctly

---

**Remember:** The "Product Not Found" error is normal before you create products in App Store Connect. Once you complete Step 2 above, the error will disappear! 🎉

**Use the IAP Diagnostics tool** to verify each step of your setup. It will save you hours of debugging!
