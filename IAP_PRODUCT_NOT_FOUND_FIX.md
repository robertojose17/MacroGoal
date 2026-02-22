
# Fix: "Product Not Found" Error - Apple In-App Purchases

## Problem
When clicking the paywall to subscribe, Apple says "product not found". This means the App Store cannot find the subscription products you're trying to purchase.

## Root Cause
The product IDs in your code don't match what's configured in App Store Connect, OR the products haven't been created yet.

## Current Configuration

### Product IDs in Code
Located in `config/iapConfig.ts`:
```
macrogoal_premium_monthly
macrogoal_premium_yearly
```

### Bundle ID
Located in `app.json`:
```
com.elitemacrotracker.app
```

## Solution Steps

### Step 1: Verify App Store Connect Configuration

1. **Open App Store Connect**
   - Go to https://appstoreconnect.apple.com
   - Sign in with your Apple Developer account

2. **Navigate to Your App**
   - Click "My Apps"
   - Select "Macro Goal" (or your app name)

3. **Go to In-App Purchases**
   - Click "In-App Purchases" in the left sidebar
   - Check if any subscriptions exist

### Step 2: Create Subscription Products (if they don't exist)

If no subscriptions exist, create them:

1. **Click "+ Create" → "Subscription"**

2. **Create Monthly Subscription**
   - Reference Name: `Premium Monthly`
   - Product ID: `macrogoal_premium_monthly` (MUST match exactly)
   - Subscription Group: Create new group "Premium Subscriptions"
   - Subscription Duration: 1 Month
   - Price: $9.99 (or your desired price)
   - Localization: Add English description
   - Review Information: Add screenshot

3. **Create Yearly Subscription**
   - Reference Name: `Premium Yearly`
   - Product ID: `macrogoal_premium_yearly` (MUST match exactly)
   - Subscription Group: Use same "Premium Subscriptions" group
   - Subscription Duration: 1 Year
   - Price: $49.99 (or your desired price)
   - Localization: Add English description
   - Review Information: Add screenshot

4. **Set Status to "Ready to Submit"**
   - Both subscriptions must be in "Ready to Submit" status
   - Fill in all required fields

### Step 3: Update Product IDs (if they don't match)

If your App Store Connect products have DIFFERENT IDs:

1. **Copy the EXACT Product IDs from App Store Connect**

2. **Update `config/iapConfig.ts`**:
   ```typescript
   export const IAP_PRODUCT_IDS = {
     monthly: 'YOUR_ACTUAL_MONTHLY_PRODUCT_ID',
     yearly: 'YOUR_ACTUAL_YEARLY_PRODUCT_ID',
   } as const;
   ```

3. **Update prices if needed**:
   ```typescript
   export const IAP_PRICING = {
     monthly: 9.99,  // Your actual monthly price
     yearly: 49.99,  // Your actual yearly price
   } as const;
   ```

### Step 4: Wait for Sync (IMPORTANT)

After creating or updating products in App Store Connect:

- **Wait 2-4 hours** for products to sync with Apple's servers
- Products won't be available immediately
- This is normal and expected

### Step 5: Test with Sandbox Account

1. **Create a Sandbox Tester Account**
   - In App Store Connect, go to "Users and Access"
   - Click "Sandbox Testers"
   - Create a new tester account

2. **Sign Out of Your Apple ID on Device**
   - Settings → App Store → Sign Out

3. **Run Your App**
   - Open the paywall screen
   - When prompted, sign in with your Sandbox account
   - Test the purchase

### Step 6: Run Diagnostics

1. **Open the app**
2. **Navigate to Paywall screen**
3. **Tap "Diagnostics" button in top-right**
4. **Check the results**:
   - ✅ All tests should pass
   - ❌ If "Product Fetch" fails, products aren't configured correctly

## Verification Checklist

- [ ] Products created in App Store Connect
- [ ] Product IDs match EXACTLY (case-sensitive)
- [ ] Products are "Ready to Submit" status
- [ ] Bundle ID matches app.json
- [ ] Waited 2-4 hours after creating products
- [ ] Testing with Sandbox account
- [ ] Diagnostics screen shows products found

## Common Issues

### Issue: "No products found"
**Solution**: Products not created or not synced yet. Wait 2-4 hours.

### Issue: "Product IDs don't match"
**Solution**: Copy EXACT IDs from App Store Connect to `config/iapConfig.ts`

### Issue: "Products show in diagnostics but purchase fails"
**Solution**: Make sure you're signed in with a Sandbox account, not your real Apple ID

### Issue: "Sandbox account not working"
**Solution**: Sign out of your real Apple ID first, then sign in with Sandbox account when prompted

## Testing Flow

1. **Open app** → Navigate to Profile
2. **Tap "Manage Subscription"** → Opens paywall
3. **Tap "Diagnostics"** → Verify products are found
4. **Go back** → Select a plan
5. **Tap "Subscribe Now"** → Should show Apple payment sheet
6. **Complete purchase** → Should succeed with Sandbox account

## Console Logs to Check

Look for these logs in the console:

```
[Paywall iOS] Product IDs configured: ["macrogoal_premium_monthly", "macrogoal_premium_yearly"]
[Paywall iOS] ✅ Step 1 Complete: Connected to App Store
[Paywall iOS] ✅ Step 2 Complete: Products loaded successfully
[Paywall iOS] Product Details:
[Paywall iOS]   1. macrogoal_premium_monthly
[Paywall iOS]      - Title: Premium Monthly
[Paywall iOS]      - Price: $9.99
```

If you see "❌ Step 2 Failed: No products returned", the products aren't configured correctly.

## Need Help?

1. Run the diagnostics screen and check all test results
2. Copy the console logs (look for `[Paywall iOS]` and `[IAP Diagnostics]`)
3. Verify your App Store Connect configuration matches the checklist above
4. Make sure you've waited 2-4 hours after creating products

## Files Modified

- `config/iapConfig.ts` - Centralized IAP configuration
- `app/paywall.ios.tsx` - Enhanced error handling and diagnostics
- `app/iap-diagnostics.tsx` - Comprehensive diagnostic tool
- `hooks/useSubscription.ios.ts` - Improved logging

## Next Steps

After fixing the product configuration:

1. Products should appear in the paywall
2. Purchases should work with Sandbox accounts
3. Test the full flow: subscribe → use premium features → restore purchases
4. Submit your app for review once testing is complete
