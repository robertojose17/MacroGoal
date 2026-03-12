
# RevenueCat Debugging Guide

## Current Issue
User reports: "No subscription available, no subscription plan currently available. Please ensure products are created in revenue cat and offering is configured, products are linked to offering."

## What I've Fixed

### 1. Enhanced Debug Logging
The subscription screen now has comprehensive logging that will show:
- RevenueCat configuration details
- API key validation
- Offering fetch results
- All available offerings and packages
- Detailed error messages

### 2. Better Error Handling
- Added error state UI with detailed messages
- Shows exactly what's missing or misconfigured
- Provides actionable steps to fix the issue

### 3. Improved Offering Detection
The code now:
- Tries to fetch the specific offering by identifier (`Monthly_MG`)
- Falls back to the current offering
- Falls back to the first available offering
- Shows all available offerings in debug logs

## How to Debug

### Step 1: Check the Console Logs
When you open the subscription screen, look for these log messages:

```
[Subscription] ========== INITIALIZING REVENUECAT ==========
[Subscription] RevenueCat config: { ... }
[Subscription] Platform: ios/android
[Subscription] API Key exists: true/false
[Subscription] User ID: <user-id>
[Subscription] ✅ RevenueCat configured successfully
[Subscription] Fetching offerings...
[Subscription] Offerings response: { ... }
```

### Step 2: Verify Configuration

#### Check app.json
```json
{
  "expo": {
    "extra": {
      "revenueCat": {
        "iosApiKey": "appl_TZdEZxwrVNJdRUPcoavoXaVUCSE",
        "androidApiKey": "goog_YOUR_ANDROID_KEY_HERE",  // ⚠️ NEEDS TO BE UPDATED
        "offeringIdentifier": "Monthly_MG",
        "entitlementIdentifier": "Macrogoal Pro"
      }
    }
  }
}
```

**CRITICAL**: The Android API key is still a placeholder. If you're testing on Android, you MUST update this.

### Step 3: Verify RevenueCat Dashboard

#### Products
1. Go to RevenueCat Dashboard → Products
2. Verify these products exist:
   - `Monthly_MG` (or your monthly product ID)
   - `Yearly_MG` (or your yearly product ID)
3. Verify they are linked to App Store Connect / Google Play Console
4. Verify they are **approved** in App Store Connect / Google Play Console

#### Offering
1. Go to RevenueCat Dashboard → Offerings
2. Verify an offering named `Monthly_MG` exists
3. Verify it contains your products (`Monthly_MG` and `Yearly_MG`)
4. Verify it is set as the **current offering** (or at least active)

#### Entitlement
1. Go to RevenueCat Dashboard → Entitlements
2. Verify an entitlement named `Macrogoal Pro` exists
3. Verify it is linked to your products

### Step 4: Check Platform-Specific Issues

#### iOS
- Are you testing on a **physical device**? (Simulators don't support IAP)
- Is your device signed in with a **Sandbox Tester** account?
- Are the products approved in App Store Connect?
- Did you wait 24-48 hours after creating products in App Store Connect?

#### Android
- Is the Android API key configured in app.json?
- Are the products created in Google Play Console?
- Is your app uploaded to Google Play Console (at least as internal testing)?
- Are you testing with a test account added in Google Play Console?

## Common Issues and Solutions

### Issue 1: "No offerings available"
**Cause**: RevenueCat can't find any offerings
**Solution**:
1. Check that offerings are created in RevenueCat dashboard
2. Verify offering identifier matches exactly (case-sensitive)
3. Wait a few minutes for RevenueCat to sync

### Issue 2: "API key not configured"
**Cause**: API key is missing or is a placeholder
**Solution**:
1. Get your API key from RevenueCat Dashboard → API Keys
2. Update app.json with the correct key
3. Restart the app

### Issue 3: "Products not linked to offering"
**Cause**: Products exist but aren't in the offering
**Solution**:
1. Go to RevenueCat Dashboard → Offerings
2. Edit your offering
3. Add your products to the offering
4. Save and wait a few minutes

### Issue 4: Android-specific issues
**Cause**: Android API key is placeholder
**Solution**:
1. Get Android API key from RevenueCat Dashboard
2. Update `androidApiKey` in app.json
3. Restart the app

## What the Logs Will Tell You

### If you see:
```
[Subscription] Offerings response: {
  hasCurrent: false,
  allOfferingsCount: 0,
  allOfferingIds: []
}
```
**Problem**: No offerings configured in RevenueCat
**Fix**: Create offerings in RevenueCat dashboard

### If you see:
```
[Subscription] Offerings response: {
  hasCurrent: true,
  currentIdentifier: "default",
  allOfferingsCount: 1,
  allOfferingIds: ["default"]
}
```
**Problem**: Offering exists but has wrong identifier
**Fix**: Either:
- Rename offering in RevenueCat to "Monthly_MG", OR
- Update `offeringIdentifier` in app.json to "default"

### If you see:
```
[Subscription] ✅ Offering found: {
  identifier: "Monthly_MG",
  packagesCount: 0,
  packageIdentifiers: []
}
```
**Problem**: Offering exists but has no products
**Fix**: Add products to the offering in RevenueCat dashboard

### If you see:
```
[Subscription] ✅ Offering found: {
  identifier: "Monthly_MG",
  packagesCount: 2,
  packageIdentifiers: ["monthly", "annual"]
}
```
**Success**: Everything is configured correctly!

## Next Steps

1. **Run the app** and navigate to the subscription screen
2. **Check the console logs** for the detailed debug output
3. **Look for the specific error** in the logs
4. **Follow the solution** for that specific error
5. **If still stuck**, share the console logs (especially the lines between the `==========` markers)

## Testing Checklist

- [ ] iOS API key is correct in app.json
- [ ] Android API key is correct in app.json (if testing on Android)
- [ ] Products are created in App Store Connect / Google Play Console
- [ ] Products are approved/active
- [ ] Products are created in RevenueCat dashboard
- [ ] Products are linked to App Store Connect / Google Play Console in RevenueCat
- [ ] Offering "Monthly_MG" exists in RevenueCat
- [ ] Products are added to the offering
- [ ] Entitlement "Macrogoal Pro" exists
- [ ] Entitlement is linked to products
- [ ] Testing on physical device (iOS)
- [ ] Signed in with Sandbox Tester (iOS) or test account (Android)
- [ ] App has been restarted after configuration changes

## Contact Information

If you've verified all of the above and still have issues, the detailed logs will help identify the exact problem. The new error screen will show you exactly what's missing.
