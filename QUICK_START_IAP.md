
# Quick Start: iOS In-App Purchases

## 🚨 You're seeing "Product Not Found"? This is normal!

Your code is ready. You just need to create the products in Apple's system.

## ⚡ 5-Minute Quick Start

### 1. Run the Diagnostics Tool (2 minutes)

**On your iOS device:**
1. Open the app
2. Go to **Profile** tab
3. Tap **"IAP Diagnostics"** button
4. Review the results

**What you'll see:**
- ✅ Green = Working
- ❌ Red = Needs fixing
- ⚠️ Yellow = Optional

The tool will tell you exactly what's missing!

### 2. Create Products in App Store Connect (30 minutes)

**Go to:** [https://appstoreconnect.apple.com](https://appstoreconnect.apple.com)

**Create these two products:**

**Monthly Subscription:**
- Product ID: `macrogoal_premium_monthly` ← Must match exactly!
- Price: $9.99
- Duration: 1 Month

**Yearly Subscription:**
- Product ID: `macrogoal_premium_yearly` ← Must match exactly!
- Price: $49.99
- Duration: 1 Year

**Then:** Submit both for review

### 3. Create Sandbox Tester (5 minutes)

**In App Store Connect:**
1. Go to "Users and Access" → "Sandbox Testers"
2. Click "+" to add tester
3. Use a NEW email: `testuser12345@example.com`
4. Set password and save it

### 4. Test (30 minutes)

**On your iOS device:**
1. Sign out of your real Apple ID (Settings → [Your Name] → Sign Out)
2. Open the app
3. Go to Profile → "Upgrade to Premium"
4. Tap "Subscribe Now"
5. Sign in with your sandbox tester account
6. Complete the purchase (free in sandbox!)

**Run diagnostics again** to verify everything is working!

## 📋 Checklist

Before testing:
- [ ] Products created in App Store Connect
- [ ] Product IDs match exactly: `macrogoal_premium_monthly` and `macrogoal_premium_yearly`
- [ ] Products submitted for review
- [ ] Sandbox tester account created
- [ ] Signed out of real Apple ID on device
- [ ] IAP Diagnostics shows green checkmarks

## 🔍 Troubleshooting

**"Product Not Found" still showing?**
1. Run IAP Diagnostics tool
2. Check product IDs match exactly (case-sensitive!)
3. Wait 1-2 hours after creating products
4. Verify products are submitted (not just saved)

**Purchase fails?**
1. Sign out of real Apple ID
2. Use sandbox tester account
3. Check internet connection
4. Run IAP Diagnostics tool

**Need more help?**
- Read `IOS_IAP_TESTING_GUIDE.md` for detailed instructions
- Read `IOS_IAP_SETUP_SUMMARY.md` for complete overview
- Use the IAP Diagnostics tool - it will tell you exactly what's wrong!

## ⏱️ Timeline

- Create products: 30 min
- Apple sync: 1-2 hours
- Testing: 30 min
- **Total: ~3 hours**

## 🎯 Success!

You'll know it's working when:
- ✅ IAP Diagnostics shows all green
- ✅ Products load in paywall
- ✅ Purchase completes
- ✅ Premium features unlock

---

**Start with the IAP Diagnostics tool!** It will save you hours of debugging by telling you exactly what needs to be fixed.
