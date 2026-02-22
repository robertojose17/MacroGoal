
# iOS In-App Purchases Implementation Guide

## Overview
This guide covers the complete implementation of Apple In-App Purchases (IAP) for iOS, replacing Stripe payments on iOS only. Android and web will continue using Stripe.

## ✅ What Has Been Implemented

### 1. iOS-Specific Files Created
- **`app/paywall.ios.tsx`** - iOS paywall using Apple IAP
- **`hooks/useSubscription.ios.ts`** - iOS subscription management hook
- **`supabase/migrations/20240102000000_add_apple_iap_fields.sql`** - Database migration for Apple IAP fields

### 2. Platform-Specific Routing
React Native automatically uses `.ios.tsx` files on iOS and falls back to `.tsx` on other platforms:
- iOS: Uses `paywall.ios.tsx` and `useSubscription.ios.ts`
- Android/Web: Uses `paywall.tsx` and `useSubscription.ts` (Stripe)

### 3. Features Implemented
✅ Product fetching from App Store
✅ Purchase flow with Apple IAP
✅ Restore purchases functionality
✅ Subscription status sync with Supabase
✅ Premium access gating
✅ Real-time subscription updates
✅ App foreground/background handling

## 📋 What You Need to Provide

### 1. App Store Connect Configuration

#### A. Create Subscription Group
1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Select your app
3. Go to **Features** → **In-App Purchases**
4. Click **+** → **Auto-Renewable Subscription**
5. Create a subscription group (e.g., "Premium Subscriptions")

#### B. Create Subscription Products
Create two subscription products with these **exact** product IDs:

**Monthly Subscription:**
- Product ID: `macrogoal_premium_monthly`
- Reference Name: "Premium Monthly"
- Subscription Group: (your group from step A)
- Subscription Duration: 1 Month
- Price: $9.99 (or your chosen price)

**Yearly Subscription:**
- Product ID: `macrogoal_premium_yearly`
- Reference Name: "Premium Yearly"
- Subscription Group: (same group)
- Subscription Duration: 1 Year
- Price: $49.99 (or your chosen price)

#### C. Configure Subscription Details
For each subscription:
1. Add **Subscription Display Name** (e.g., "Premium Monthly")
2. Add **Description** (e.g., "Access to AI Meal Estimator and premium features")
3. Add **App Store Promotional Image** (1024x1024px)
4. Set **Review Information** (screenshot showing the feature)
5. Set **Subscription Prices** for all territories

#### D. Submit for Review
1. Click **Submit** for each subscription
2. Wait for Apple approval (usually 24-48 hours)
3. Products must be **"Ready to Submit"** or **"Approved"** to work in production

### 2. Xcode Configuration

#### A. Enable In-App Purchase Capability
1. Open your project in Xcode
2. Select your app target
3. Go to **Signing & Capabilities**
4. Click **+ Capability**
5. Add **In-App Purchase**

#### B. Bundle Identifier
Ensure your bundle identifier matches App Store Connect:
- Example: `com.yourcompany.elitemacrotracker`

#### C. StoreKit Configuration File (for testing)
1. In Xcode: **File** → **New** → **File**
2. Select **StoreKit Configuration File**
3. Name it `Products.storekit`
4. Add your products:
   - Product ID: `macrogoal_premium_monthly`
   - Type: Auto-Renewable Subscription
   - Price: $9.99
   - Duration: 1 Month
   
   - Product ID: `macrogoal_premium_yearly`
   - Type: Auto-Renewable Subscription
   - Price: $49.99
   - Duration: 1 Year

5. In scheme settings, select this StoreKit file for testing

### 3. EAS Build Configuration

Update `eas.json`:

```json
{
  "build": {
    "production": {
      "ios": {
        "bundleIdentifier": "com.yourcompany.elitemacrotracker",
        "entitlements": {
          "com.apple.developer.in-app-payments": ["merchant.your.identifier"]
        }
      }
    }
  }
}
```

### 4. Database Migration

Run the migration to add Apple IAP fields:

```bash
# Apply the migration
supabase db push

# Or manually run the SQL:
# supabase/migrations/20240102000000_add_apple_iap_fields.sql
```

This adds these columns to the `subscriptions` table:
- `apple_transaction_id` (TEXT, UNIQUE)
- `apple_original_transaction_id` (TEXT)
- `apple_product_id` (TEXT)
- `apple_receipt_data` (TEXT)

## 🧪 Testing Plan

### A. Sandbox Testing (Before Production)

#### 1. Create Sandbox Tester Account
1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. **Users and Access** → **Sandbox Testers**
3. Click **+** to add a tester
4. Use a **new email** (not associated with any Apple ID)
5. Set password and country

#### 2. Test on Physical Device
**Important:** Sandbox testing only works on physical iOS devices, not simulators.

1. Sign out of your real Apple ID on the device:
   - **Settings** → **[Your Name]** → **Sign Out**
2. Build and install the app via Xcode or EAS
3. Open the app and navigate to the paywall
4. Tap **Subscribe Now**
5. When prompted, sign in with your **sandbox tester account**
6. Complete the purchase (you won't be charged)
7. Verify:
   - ✅ Purchase completes successfully
   - ✅ Premium features unlock
   - ✅ Subscription status shows "Active" in profile

#### 3. Test Restore Purchases
1. Delete the app from the device
2. Reinstall the app
3. Navigate to the paywall
4. Tap **Restore Purchases**
5. Sign in with the same sandbox tester account
6. Verify:
   - ✅ Subscription is restored
   - ✅ Premium features unlock
   - ✅ No new purchase is required

#### 4. Test Subscription Cancellation
1. On the device: **Settings** → **[Your Name]** → **Subscriptions**
2. Find your app's subscription
3. Tap **Cancel Subscription**
4. Verify:
   - ✅ Subscription shows "Active (Canceled)" in profile
   - ✅ Premium features remain active until period end
   - ✅ After period end, premium features are locked

#### 5. Test Subscription Expiration
Sandbox subscriptions expire much faster than production:
- 1 month subscription = 5 minutes
- 1 year subscription = 1 hour

Wait for expiration and verify:
- ✅ Subscription status changes to "Free"
- ✅ Premium features are locked
- ✅ User is prompted to resubscribe

### B. Production Testing (After App Store Approval)

#### 1. Real Purchase Test
1. Install the production app from TestFlight or App Store
2. Use a **real Apple ID** (not sandbox)
3. Complete a real purchase (you will be charged)
4. Verify all functionality works as expected

#### 2. Refund Test
1. Request a refund from Apple
2. Verify subscription status updates correctly
3. Verify premium features are revoked

## 🔧 How It Works

### Purchase Flow
```
1. User taps "Subscribe Now" on iOS
   ↓
2. App calls InAppPurchases.purchaseItemAsync()
   ↓
3. Apple shows native payment sheet
   ↓
4. User completes purchase with Face ID/Touch ID
   ↓
5. App receives purchase confirmation
   ↓
6. App updates Supabase subscriptions table
   ↓
7. App updates user profile to premium
   ↓
8. Premium features unlock
```

### Restore Flow
```
1. User taps "Restore Purchases" on iOS
   ↓
2. App calls InAppPurchases.getPurchaseHistoryAsync()
   ↓
3. Apple returns purchase history
   ↓
4. App finds most recent subscription
   ↓
5. App updates Supabase subscriptions table
   ↓
6. App updates user profile to premium
   ↓
7. Premium features unlock
```

### Entitlement Check
```
1. App launches or returns to foreground
   ↓
2. useSubscription hook syncs with Apple
   ↓
3. Fetches purchase history from Apple
   ↓
4. Updates Supabase subscriptions table
   ↓
5. Components check isSubscribed flag
   ↓
6. Premium features show/hide accordingly
```

## 🚨 Important Notes

### 1. Product IDs Must Match
The product IDs in the code **must exactly match** App Store Connect:
- Code: `macrogoal_premium_monthly`
- App Store Connect: `macrogoal_premium_monthly`

If they don't match, purchases will fail.

### 2. Sandbox vs Production
- **Sandbox:** Use sandbox tester accounts, fast expiration
- **Production:** Use real Apple IDs, real charges, normal expiration

### 3. Subscription Management
Users manage subscriptions through:
- **Settings** → **[Your Name]** → **Subscriptions**

NOT through your app. Apple requires this.

### 4. Receipt Validation
The current implementation uses client-side validation. For production, consider:
- Server-side receipt validation with Apple's servers
- Webhook integration for real-time updates
- Fraud prevention measures

### 5. App Store Review
Apple will test your IAP during review. Ensure:
- ✅ Products are submitted and approved
- ✅ Paywall is accessible without login (if applicable)
- ✅ Restore Purchases button is visible
- ✅ Subscription terms are clear
- ✅ Privacy policy and terms of service are linked

## 📱 User Experience

### iOS Users
- See Apple IAP paywall
- Purchase through Apple (Face ID/Touch ID)
- Manage subscription in iOS Settings
- Restore purchases works across devices

### Android/Web Users
- See Stripe paywall (unchanged)
- Purchase through Stripe checkout
- Manage subscription in Stripe portal
- No changes to existing flow

## 🔍 Debugging

### Check Logs
All IAP operations are logged with `[useSubscription iOS]` or `[Paywall iOS]` prefix:

```javascript
console.log('[useSubscription iOS] 🔄 Syncing subscription...');
console.log('[Paywall iOS] ✅ Purchase successful!');
```

### Common Issues

**Products not loading:**
- Check product IDs match exactly
- Ensure products are submitted in App Store Connect
- Verify bundle identifier matches
- Check internet connection

**Purchase fails:**
- Check sandbox tester account is valid
- Ensure device is signed out of real Apple ID
- Verify In-App Purchase capability is enabled
- Check Xcode console for error messages

**Restore doesn't work:**
- Ensure user is signed in with correct Apple ID
- Check purchase history in App Store Connect
- Verify subscription hasn't expired
- Check database for subscription record

## 📊 Database Schema

The `subscriptions` table now includes:

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  
  -- Stripe fields (for Android/web)
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  
  -- Apple IAP fields (for iOS)
  apple_transaction_id TEXT UNIQUE,
  apple_original_transaction_id TEXT,
  apple_product_id TEXT,
  apple_receipt_data TEXT,
  
  -- Common fields
  status TEXT,
  plan_type TEXT,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

## ✅ Checklist Before Submission

- [ ] Products created in App Store Connect
- [ ] Products submitted and approved
- [ ] Bundle identifier matches
- [ ] In-App Purchase capability enabled
- [ ] Database migration applied
- [ ] Sandbox testing completed
- [ ] Restore purchases tested
- [ ] Subscription cancellation tested
- [ ] Privacy policy updated (mention subscriptions)
- [ ] Terms of service updated (mention auto-renewal)
- [ ] App Store screenshots show IAP features
- [ ] App Store description mentions subscriptions

## 🎯 Next Steps

1. **Complete App Store Connect setup** (products, pricing, descriptions)
2. **Apply database migration** (add Apple IAP fields)
3. **Test with sandbox account** (purchase, restore, cancel)
4. **Submit for App Store review**
5. **Test in production** (real purchase with real Apple ID)
6. **Monitor subscription metrics** (conversions, cancellations, revenue)

## 📞 Support

If you encounter issues:
1. Check Xcode console logs
2. Verify App Store Connect configuration
3. Test with sandbox account first
4. Review Apple's IAP documentation
5. Contact Apple Developer Support if needed

## 🔗 Resources

- [Apple In-App Purchase Documentation](https://developer.apple.com/in-app-purchase/)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)
- [Expo In-App Purchases Docs](https://docs.expo.dev/versions/latest/sdk/in-app-purchases/)
- [StoreKit Testing Guide](https://developer.apple.com/documentation/storekit/in-app_purchase/testing_in-app_purchases_with_sandbox)
