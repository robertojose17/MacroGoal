
# In-App Purchase Testing Checklist

## Current Issue
You're seeing "Product Not Found" because the products don't exist in App Store Connect yet.

## ✅ What's Working (Your Side)
Based on the diagnostics screen, here's what should pass:

1. **Platform Check** - ✅ Running on iOS
2. **IAP Module** - ✅ expo-in-app-purchases is installed
3. **Store Connection** - ✅ Can connect to App Store
4. **Product Fetch** - ❌ FAILS (products not in App Store Connect)
5. **Code Implementation** - ✅ All code is correct

## 🔧 What You Need to Do in App Store Connect

### Step 1: Create In-App Purchase Products

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Select your app
3. Go to **Features** → **In-App Purchases**
4. Click **+** to create a new product

### Step 2: Create Monthly Subscription

**Product ID:** `macro_goal_premium_monthly`
- **Type:** Auto-Renewable Subscription
- **Reference Name:** Macro Goal Premium Monthly
- **Subscription Group:** Create new group "Premium Subscriptions"
- **Subscription Duration:** 1 Month
- **Price:** $9.99 (or your preferred price)
- **Localization:**
  - Display Name: Premium Monthly
  - Description: Get premium features with monthly billing

### Step 3: Create Yearly Subscription

**Product ID:** `macro_goal_premium_yearly`
- **Type:** Auto-Renewable Subscription
- **Reference Name:** Macro Goal Premium Yearly
- **Subscription Group:** Premium Subscriptions (same as above)
- **Subscription Duration:** 1 Year
- **Price:** $49.99 (or your preferred price)
- **Localization:**
  - Display Name: Premium Yearly
  - Description: Get premium features with yearly billing - best value!

### Step 4: Submit for Review (Optional for Testing)

⚠️ **Important:** You can test products in Sandbox mode WITHOUT submitting them for review!

- Products must be in "Ready to Submit" status
- They do NOT need to be approved
- Sandbox testing works immediately

## 🧪 Testing with Sandbox Account

### Create a Sandbox Tester

1. In App Store Connect, go to **Users and Access**
2. Click **Sandbox Testers**
3. Click **+** to add a new tester
4. Use a UNIQUE email (can be fake, like `test123@example.com`)
5. Set password and country

### Test on Device

1. **Sign out of real Apple ID:**
   - Settings → App Store → Sign Out

2. **Run your app** (don't sign into Sandbox yet)

3. **Tap "Subscribe Now"** in your app

4. **When prompted, sign in with Sandbox account**
   - Use the email/password you created
   - This only works when making a purchase

5. **Complete the purchase**
   - Sandbox purchases are FREE
   - You'll see "Environment: Sandbox" at the top

### Verify Purchase

After purchasing, check:
- ✅ Alert shows "Subscription activated"
- ✅ Profile screen shows "Premium" status
- ✅ Premium features are unlocked
- ✅ Diagnostics screen shows purchase in history

## 🔍 Run Diagnostics

Use the built-in diagnostics screen to verify everything:

```
Profile → IAP Diagnostics
```

This will show:
- ✅ Platform compatibility
- ✅ IAP module status
- ✅ Store connection
- ✅ Product availability (should pass after Step 1-3)
- ✅ Purchase history

## ⏱️ Timeline

- **Product Creation:** 5-10 minutes
- **Product Sync:** 2-4 hours (sometimes instant)
- **Sandbox Testing:** Immediate (once products sync)

## 🐛 Troubleshooting

### "Product Not Found" Error

**Cause:** Products not in App Store Connect or not synced yet

**Fix:**
1. Verify product IDs match exactly:
   - `macro_goal_premium_monthly`
   - `macro_goal_premium_yearly`
2. Wait 2-4 hours for sync
3. Try again

### "Cannot Connect to iTunes Store"

**Cause:** Not signed out of real Apple ID

**Fix:**
1. Settings → App Store → Sign Out
2. Restart app
3. Try purchase again

### Purchase Doesn't Unlock Features

**Cause:** Supabase subscription sync not working

**Fix:**
1. Check `subscriptions` table in Supabase
2. Verify `apple_transaction_id` is saved
3. Check `status` is "active"

## 📱 Testing Checklist

Before going live, test these scenarios:

- [ ] Purchase monthly subscription
- [ ] Purchase yearly subscription
- [ ] Restore purchases (after reinstalling app)
- [ ] Cancel subscription (in Settings → Subscriptions)
- [ ] Resubscribe after cancellation
- [ ] Upgrade from monthly to yearly
- [ ] Downgrade from yearly to monthly
- [ ] Expired subscription (wait for expiry in Sandbox)

## 🚀 Going Live

Once testing is complete:

1. **Submit products for review** in App Store Connect
2. **Submit app for review** (if not already live)
3. **Wait for approval** (1-3 days typically)
4. **Test with real Apple ID** (use a test account, not your main one)
5. **Monitor** Supabase logs for any issues

## 📊 Monitoring

After launch, monitor:
- Supabase `subscriptions` table for new purchases
- App Store Connect → Sales and Trends
- User feedback for any purchase issues

## 🆘 Need Help?

If you're still stuck after following this guide:

1. Run diagnostics screen and screenshot results
2. Check Supabase logs for errors
3. Verify product IDs match exactly
4. Wait 2-4 hours for product sync
5. Try with a fresh Sandbox account

---

**Next Step:** Create the two products in App Store Connect with the exact product IDs shown above, then wait 2-4 hours and test again.
