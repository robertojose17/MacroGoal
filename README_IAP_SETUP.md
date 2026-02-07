
# iOS In-App Purchase Setup - Complete Guide

## 🎯 Current Situation

You're seeing this error in your app:
```
❌ Product Not Found
The selected subscription is not available. Please try again.
```

**This is completely normal!** Your app code is 100% ready. You just need to create the products in Apple's App Store Connect.

## ✅ What's Already Working

Your app has everything it needs:
- ✅ iOS paywall screen with Apple IAP integration
- ✅ Subscription management
- ✅ Purchase flow
- ✅ Restore purchases
- ✅ Database sync
- ✅ **NEW: IAP Diagnostics tool** to verify your setup

## 🚀 What You Need to Do (3 Steps)

### Step 1: Run the Diagnostics Tool (2 minutes)

**This is the easiest way to see what's missing!**

1. Open your app on an iOS device
2. Go to the **Profile** tab
3. Tap the **"IAP Diagnostics"** button
4. Review the results:
   - ✅ Green = Working correctly
   - ❌ Red = Needs to be fixed
   - ⚠️ Yellow = Optional warning
   - ℹ️ Blue = Information

The tool will tell you exactly what's missing and what to do next!

### Step 2: Create Products in App Store Connect (30 minutes)

#### Your Product IDs

Your app is configured to use these product IDs:
```
Monthly: macrogoal_premium_monthly
Yearly:  macrogoal_premium_yearly
```

Your bundle identifier is: `com.elitemacrotracker.app`

#### Create the Products

1. **Go to App Store Connect**
   - Visit: https://appstoreconnect.apple.com
   - Sign in with your Apple Developer account
   - Click "My Apps" → Select your app (or create it if it doesn't exist)

2. **Navigate to In-App Purchases**
   - Click "Features" tab
   - Click "In-App Purchases" in the sidebar
   - Click the "+" button

3. **Create Subscription Group**
   - Select "Auto-Renewable Subscription"
   - Create a new subscription group: "Premium Subscriptions"
   - Click "Create"

4. **Create Monthly Subscription**
   - Product ID: `macrogoal_premium_monthly` ⚠️ Must match exactly!
   - Reference Name: "Premium Monthly"
   - Subscription Group: "Premium Subscriptions"
   - Subscription Duration: 1 Month
   - Click "Create"
   
   Then add:
   - Display Name: "Premium Monthly"
   - Description: "Access to AI Meal Estimator and all premium features"
   - Promotional Image: Upload a 1024x1024px image
   - Pricing: $9.99 (or your chosen price)
   - Click "Save"
   - Click "Submit for Review"

5. **Create Yearly Subscription**
   - Product ID: `macrogoal_premium_yearly` ⚠️ Must match exactly!
   - Reference Name: "Premium Yearly"
   - Same subscription group
   - Subscription Duration: 1 Year
   - Pricing: $49.99 (or your chosen price)
   - Submit for review

⏰ **Wait 1-2 hours** for Apple's servers to sync the products.

### Step 3: Test Your Setup (30 minutes)

#### Create Sandbox Tester

1. In App Store Connect: "Users and Access" → "Sandbox Testers"
2. Click "+" to add a new tester
3. Fill in:
   - Email: Use a NEW email (e.g., `testuser12345@example.com`)
   - Password: Create a strong password
   - Country: United States (or your region)
4. Click "Create"
5. **Save these credentials!** You'll need them for testing.

#### Test Purchase Flow

1. **On your iOS device:**
   - Go to Settings → [Your Name] → Sign Out
   - ⚠️ This is critical! You must sign out of your real Apple ID

2. **Build and install your app:**
   ```bash
   # Using EAS:
   eas build --profile development --platform ios
   
   # Or using Xcode:
   # Open project and click Run
   ```

3. **Test the purchase:**
   - Open the app
   - Go to Profile → "Upgrade to Premium"
   - Tap "Subscribe Now"
   - When prompted, sign in with your **sandbox tester account**
   - Complete the purchase (you won't be charged)

4. **Verify it worked:**
   - Premium features should unlock (AI Meal Estimator)
   - Profile should show "Active" status
   - Run IAP Diagnostics again - should show all green checkmarks!

5. **Test Restore Purchases:**
   - Delete the app
   - Reinstall the app
   - Go to Profile → "Upgrade to Premium"
   - Tap "Restore Purchases"
   - Sign in with the same sandbox tester
   - Subscription should restore automatically

## 🔍 Troubleshooting

### Still seeing "Product Not Found"?

**Run the IAP Diagnostics tool first!** It will tell you exactly what's wrong.

Common causes:
1. **Products not created yet** → Complete Step 2 above
2. **Product IDs don't match** → Check they're exactly: `macrogoal_premium_monthly` and `macrogoal_premium_yearly`
3. **Waiting for Apple sync** → Wait 1-2 hours after creating products
4. **Products not submitted** → Make sure you clicked "Submit for Review" in App Store Connect

### Purchase fails?

**Checklist:**
- [ ] Signed out of real Apple ID on device
- [ ] Using sandbox tester account (not your real Apple ID)
- [ ] Products are submitted in App Store Connect
- [ ] Internet connection is working
- [ ] Testing on physical iOS device (not simulator)

### Restore doesn't work?

**Checklist:**
- [ ] Made a purchase first with this Apple ID
- [ ] Using the same Apple ID for restore
- [ ] Subscription hasn't expired

## 📊 Using the IAP Diagnostics Tool

The diagnostics tool is your best friend! It checks:

1. ✅ **Platform** - Confirms you're on iOS
2. ✅ **Bundle Identifier** - Shows your app's bundle ID
3. ℹ️ **Product IDs** - Shows what products your app is looking for
4. ✅ **App Store Connection** - Tests connection to Apple's servers
5. ✅ **Product Fetch** - Checks if products exist in App Store Connect
6. ✅ **Purchase History** - Shows any previous purchases
7. ✅ **User Authentication** - Confirms you're logged in
8. ✅ **Database Subscription** - Checks subscription in database

**How to read the results:**
- ✅ Green checkmark = Working correctly
- ❌ Red X = Needs to be fixed (with explanation)
- ⚠️ Yellow warning = Optional issue
- ℹ️ Blue info = Informational message

**Share results:**
- Tap "View Full Results" to see all details
- Take a screenshot to share with support

## 📝 Quick Reference

### Your Configuration

```
Bundle ID:    com.elitemacrotracker.app
Product IDs:  macrogoal_premium_monthly
              macrogoal_premium_yearly
Pricing:      $9.99/month, $49.99/year
```

### Timeline

```
Step 1: Run diagnostics        2 min
Step 2: Create products        30 min
        Wait for Apple sync    1-2 hours
Step 3: Create sandbox tester  5 min
        Test purchase          30 min
        Test restore           10 min
─────────────────────────────────────
Total active time:             ~1 hour
Total wait time:               1-2 hours
Total:                         ~3 hours
```

### Production Timeline

```
Submit products for review:    5 min
Apple review:                  24-48 hours
Production testing:            30 min
─────────────────────────────────────
Total:                         ~2 days
```

## ✅ Success Checklist

You'll know everything is working when:

- [ ] IAP Diagnostics shows all green checkmarks
- [ ] Products load in the paywall with correct prices
- [ ] Purchase completes successfully with sandbox account
- [ ] Premium features unlock (AI Meal Estimator)
- [ ] Profile shows "Active" subscription status
- [ ] Restore purchases works after reinstalling app
- [ ] Subscription status syncs across devices

## 📚 Additional Resources

- **`QUICK_START_IAP.md`** - 5-minute quick start guide
- **`IOS_IAP_SETUP_SUMMARY.md`** - Detailed setup summary
- **`IOS_IAP_TESTING_GUIDE.md`** - Complete testing instructions
- **`IOS_IAP_IMPLEMENTATION_GUIDE.md`** - Technical implementation details
- **`IOS_IAP_CHECKLIST.md`** - Step-by-step checklist
- **`IAP_VISUAL_CHECKLIST.md`** - Visual guide with screenshots

## 🎯 Next Steps

1. **Run IAP Diagnostics** (Profile → IAP Diagnostics)
2. **Review the results** - it will tell you what to do next
3. **Create products in App Store Connect** if they don't exist
4. **Wait 1-2 hours** for Apple to sync
5. **Run diagnostics again** to verify products loaded
6. **Create sandbox tester** account
7. **Test purchase flow** with sandbox account
8. **Test restore purchases**
9. **Submit app for review** when ready

## 💡 Pro Tips

1. **Always start with the IAP Diagnostics tool** - it will save you hours of debugging
2. **Product IDs are case-sensitive** - they must match exactly
3. **Wait 1-2 hours after creating products** - Apple's servers need time to sync
4. **Test on a physical device** - sandbox doesn't work on simulator
5. **Sign out of your real Apple ID** - or sandbox testing won't work
6. **Save your sandbox tester credentials** - you'll need them multiple times
7. **Run diagnostics after each step** - to verify progress

## 📞 Need Help?

1. **Run the IAP Diagnostics tool** - it will tell you exactly what's wrong
2. **Check the error message** - it usually explains the issue
3. **Review the troubleshooting section** above
4. **Read the detailed guides** in the Additional Resources section
5. **Contact Apple Developer Support** if you're still stuck

---

**Remember:** The "Product Not Found" error is completely normal before you create products in App Store Connect. Once you complete Step 2 and wait for Apple's sync, the error will disappear! 🎉

**Start with the IAP Diagnostics tool!** It's the fastest way to see what needs to be done.
