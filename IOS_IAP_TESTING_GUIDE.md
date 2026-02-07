
# iOS In-App Purchase Testing & Setup Guide

## 🎯 Current Status: "Product Not Found" Error

**What this means:** Your app code is correct, but the products don't exist in Apple's App Store Connect yet.

## ✅ Step-by-Step Setup (Do This First)

### Step 1: Verify Your Product IDs (5 minutes)

Your app is looking for these exact product IDs:
```
macrogoal_premium_monthly
macrogoal_premium_yearly
```

**Action Required:**
1. Open your code and verify these IDs are correct for your app
2. If you want different IDs, update them in `app/paywall.ios.tsx`:

```typescript
const PRODUCT_IDS = {
  monthly: 'YOUR_BUNDLE_ID.premium.monthly',  // e.g., com.yourcompany.app.premium.monthly
  yearly: 'YOUR_BUNDLE_ID.premium.yearly',    // e.g., com.yourcompany.app.premium.yearly
};
```

**Best Practice:** Use your bundle identifier as a prefix:
- If your bundle ID is `com.elitemacro.tracker`
- Monthly: `com.elitemacro.tracker.premium.monthly`
- Yearly: `com.elitemacro.tracker.premium.yearly`

### Step 2: Create Products in App Store Connect (30 minutes)

#### A. Go to App Store Connect
1. Visit [https://appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Sign in with your Apple Developer account
3. Click on **"My Apps"**
4. Select your app (or create it if it doesn't exist)

#### B. Create Subscription Group
1. Click **"Features"** tab
2. Click **"In-App Purchases"** in the sidebar
3. Click the **"+"** button
4. Select **"Auto-Renewable Subscription"**
5. Create a new subscription group:
   - Name: "Premium Subscriptions"
   - Reference Name: "Premium"
6. Click **"Create"**

#### C. Create Monthly Subscription
1. In your subscription group, click **"+"** to add a product
2. Fill in the details:
   - **Product ID:** `macrogoal_premium_monthly` (or your custom ID)
   - **Reference Name:** "Premium Monthly"
   - **Subscription Duration:** 1 Month
   - **Subscription Group:** (select the group you just created)
3. Click **"Create"**

4. Add Subscription Information:
   - **Subscription Display Name (English):** "Premium Monthly"
   - **Description:** "Access to AI Meal Estimator and all premium features"
   - **App Store Promotional Image:** Upload a 1024x1024px image showing your premium features

5. Add Pricing:
   - Click **"Add Pricing"**
   - Select **"United States"** (or your primary market)
   - Set price: **$9.99** (or your chosen price)
   - Click **"Next"** and **"Confirm"**

6. Add Review Information:
   - Upload a screenshot showing the premium feature
   - Add review notes explaining what the subscription unlocks

7. Click **"Save"**

#### D. Create Yearly Subscription
Repeat the same process:
- **Product ID:** `macrogoal_premium_yearly`
- **Reference Name:** "Premium Yearly"
- **Subscription Duration:** 1 Year
- **Price:** $49.99
- Same subscription group as monthly

#### E. Submit for Review
1. For each product, click **"Submit for Review"**
2. Wait for Apple approval (usually 24-48 hours)
3. Products must be **"Ready to Submit"** or **"Approved"** to work

**⚠️ IMPORTANT:** You can test with products in "Waiting for Review" status using sandbox testers, but they must be submitted first!

### Step 3: Create Sandbox Tester Account (10 minutes)

You need a special test account to test purchases without being charged.

1. In App Store Connect, go to **"Users and Access"**
2. Click **"Sandbox Testers"** in the sidebar
3. Click the **"+"** button
4. Fill in the form:
   - **First Name:** Test
   - **Last Name:** User
   - **Email:** Create a NEW email (e.g., `testuser12345@example.com`)
     - ⚠️ This email must NOT be associated with any existing Apple ID
     - You don't need to verify this email
   - **Password:** Create a strong password (save it!)
   - **Country/Region:** United States (or your region)
   - **App Store Territory:** United States
5. Click **"Create"**

**Save these credentials!** You'll need them for testing.

### Step 4: Configure Xcode (15 minutes)

#### A. Open Your Project in Xcode
```bash
# If using EAS, first run:
npx expo prebuild -p ios

# Then open:
open ios/YourApp.xcworkspace
```

#### B. Enable In-App Purchase Capability
1. In Xcode, select your project in the navigator
2. Select your app target
3. Click the **"Signing & Capabilities"** tab
4. Click **"+ Capability"**
5. Search for and add **"In-App Purchase"**

#### C. Verify Bundle Identifier
1. In the **"General"** tab, check your **Bundle Identifier**
2. It should match what's in App Store Connect
3. Example: `com.yourcompany.elitemacrotracker`

#### D. Create StoreKit Configuration (Optional - for local testing)
1. In Xcode: **File** → **New** → **File**
2. Scroll down and select **"StoreKit Configuration File"**
3. Name it `Products.storekit`
4. Click **"Create"**

5. In the StoreKit file, click **"+"** → **"Add Subscription"**
6. Add your products:
   - **Product ID:** `macrogoal_premium_monthly`
   - **Reference Name:** "Premium Monthly"
   - **Price:** $9.99
   - **Subscription Duration:** 1 Month
   - **Group:** Create a group called "Premium"

7. Repeat for yearly subscription

8. In Xcode, go to **Product** → **Scheme** → **Edit Scheme**
9. Select **"Run"** → **"Options"** tab
10. Under **"StoreKit Configuration"**, select your `Products.storekit` file

## 🧪 Testing Your Implementation

### Option 1: Test with Sandbox Account (Recommended First)

**Requirements:**
- Physical iOS device (sandbox doesn't work on simulator)
- Sandbox tester account created
- Products submitted in App Store Connect

**Steps:**

1. **Sign Out of Real Apple ID on Device**
   - Go to **Settings** → **[Your Name]** → **Sign Out**
   - ⚠️ This is critical! Don't skip this step.

2. **Build and Install App**
   ```bash
   # Using EAS (recommended):
   eas build --profile development --platform ios
   
   # Or using Xcode:
   # Open project in Xcode and click Run
   ```

3. **Test Purchase Flow**
   - Open the app
   - Navigate to the paywall (Profile → Manage Subscription)
   - Tap **"Subscribe Now"**
   - When prompted to sign in, use your **sandbox tester account**
   - Complete the purchase (you won't be charged)

4. **Verify Success**
   - ✅ Purchase completes without errors
   - ✅ Premium features unlock (AI Meal Estimator)
   - ✅ Profile shows "Premium" status
   - ✅ Check console logs for success messages

5. **Test Restore Purchases**
   - Delete the app from your device
   - Reinstall the app
   - Navigate to the paywall
   - Tap **"Restore Purchases"**
   - Sign in with the same sandbox tester account
   - ✅ Subscription should restore
   - ✅ Premium features should unlock

### Option 2: Test with StoreKit Configuration (Local Testing)

**Requirements:**
- Xcode with StoreKit configuration file
- iOS Simulator or device

**Steps:**

1. **Run from Xcode**
   - Open project in Xcode
   - Select a simulator or device
   - Click **Run** (▶️)

2. **Test Purchase**
   - Navigate to paywall
   - Tap **"Subscribe Now"**
   - StoreKit will show a test payment sheet
   - Click **"Subscribe"**
   - No Apple ID required for this method

3. **Verify**
   - ✅ Purchase completes
   - ✅ Premium features unlock
   - ⚠️ This is local testing only - doesn't sync with Apple servers

### Option 3: Production Testing (After App Store Approval)

**Requirements:**
- App approved and live on App Store
- Real Apple ID
- Real payment method

**Steps:**

1. **Install Production App**
   - Download from App Store or TestFlight

2. **Make Real Purchase**
   - Navigate to paywall
   - Tap **"Subscribe Now"**
   - Complete purchase with real Apple ID
   - ⚠️ You WILL be charged real money

3. **Verify**
   - ✅ Purchase completes
   - ✅ Premium features unlock
   - ✅ Subscription appears in Settings → Subscriptions

4. **Request Refund (if testing)**
   - Go to [reportaproblem.apple.com](https://reportaproblem.apple.com)
   - Find your purchase
   - Request refund
   - Verify subscription status updates

## 🔍 Debugging Common Issues

### Issue 1: "Product Not Found" Error

**Cause:** Products don't exist in App Store Connect or IDs don't match

**Solutions:**
1. ✅ Verify product IDs in code match App Store Connect exactly
2. ✅ Ensure products are submitted (not just saved as draft)
3. ✅ Wait 1-2 hours after creating products for Apple's servers to sync
4. ✅ Check bundle identifier matches between Xcode and App Store Connect

**How to verify:**
```typescript
// Add this to paywall.ios.tsx in initializeIAP():
console.log('[Paywall iOS] Looking for products:', Object.values(PRODUCT_IDS));
console.log('[Paywall iOS] Bundle ID:', Constants.expoConfig?.ios?.bundleIdentifier);
```

### Issue 2: Products Load But Purchase Fails

**Cause:** Sandbox tester account issue or device not signed out

**Solutions:**
1. ✅ Sign out of real Apple ID on device
2. ✅ Delete and recreate sandbox tester account
3. ✅ Try a different sandbox tester account
4. ✅ Restart device

### Issue 3: "Cannot Connect to iTunes Store"

**Cause:** Network issue or Apple servers down

**Solutions:**
1. ✅ Check internet connection
2. ✅ Try again in a few minutes
3. ✅ Check [Apple System Status](https://www.apple.com/support/systemstatus/)

### Issue 4: Restore Purchases Doesn't Work

**Cause:** No previous purchases or wrong Apple ID

**Solutions:**
1. ✅ Ensure you made a purchase with this Apple ID
2. ✅ Check you're signed in with the correct sandbox tester
3. ✅ Wait a few minutes and try again

## 📊 Monitoring Your Implementation

### Check Console Logs

Your app logs all IAP operations. Look for these messages:

**Success:**
```
[Paywall iOS] ✅ Connected to App Store
[Paywall iOS] ✅ Products loaded: 2
[Paywall iOS] ✅ Purchase successful!
[useSubscription iOS] ✅ Subscription status: active
```

**Errors:**
```
[Paywall iOS] ❌ Failed to fetch products
[Paywall iOS] ❌ Product not found: macrogoal_premium_monthly
[Paywall iOS] ❌ Purchase failed with code: 2
```

### Check Database

Verify subscription is saved:

```sql
-- In Supabase SQL Editor:
SELECT 
  user_id,
  status,
  plan_type,
  apple_product_id,
  apple_transaction_id,
  current_period_end
FROM subscriptions
WHERE user_id = 'YOUR_USER_ID';
```

### Check User Profile

Verify user type is updated:

```sql
SELECT id, email, user_type
FROM users
WHERE id = 'YOUR_USER_ID';
```

Should show `user_type = 'premium'` after purchase.

## ✅ Pre-Launch Checklist

Before submitting to App Store:

- [ ] Products created in App Store Connect
- [ ] Products submitted for review
- [ ] Sandbox testing completed successfully
- [ ] Restore purchases tested
- [ ] Subscription cancellation tested
- [ ] Bundle identifier matches everywhere
- [ ] In-App Purchase capability enabled in Xcode
- [ ] Database migration applied
- [ ] Privacy policy mentions subscriptions
- [ ] Terms of service mentions auto-renewal
- [ ] App Store screenshots show premium features

## 🎯 Quick Start (TL;DR)

1. **Update Product IDs** (if needed) in `app/paywall.ios.tsx`
2. **Create products** in App Store Connect with matching IDs
3. **Submit products** for review
4. **Create sandbox tester** account
5. **Sign out** of real Apple ID on device
6. **Build and install** app
7. **Test purchase** with sandbox account
8. **Verify** premium features unlock

## 📞 Need Help?

**If products still don't load after setup:**
1. Wait 1-2 hours for Apple's servers to sync
2. Verify product IDs match exactly (case-sensitive!)
3. Check bundle identifier matches
4. Try deleting and recreating products
5. Contact Apple Developer Support

**If purchase fails:**
1. Check Xcode console for error codes
2. Verify sandbox tester account is valid
3. Ensure device is signed out of real Apple ID
4. Try a different sandbox tester

**If restore doesn't work:**
1. Verify you made a purchase first
2. Check you're using the same Apple ID
3. Wait a few minutes and try again
4. Check purchase history in App Store Connect

## 🔗 Useful Links

- [App Store Connect](https://appstoreconnect.apple.com)
- [Apple Developer Portal](https://developer.apple.com)
- [System Status](https://www.apple.com/support/systemstatus/)
- [Report a Problem](https://reportaproblem.apple.com)
- [Expo IAP Docs](https://docs.expo.dev/versions/latest/sdk/in-app-purchases/)

---

**Remember:** The "Product Not Found" error is normal before you create products in App Store Connect. Once you complete Step 2 above, the error will go away! 🎉
