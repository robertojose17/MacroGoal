
# iOS IAP Implementation Checklist

## 🎯 Quick Reference - What You Need to Do

### 1. App Store Connect Setup (30-60 minutes)

#### Create Subscription Products
Go to [App Store Connect](https://appstoreconnect.apple.com) → Your App → Features → In-App Purchases

**Monthly Subscription:**
- [ ] Product ID: `macrogoal_premium_monthly`
- [ ] Price: $9.99
- [ ] Duration: 1 Month
- [ ] Display Name: "Premium Monthly"
- [ ] Description: "Access to AI Meal Estimator and premium features"
- [ ] Screenshot: (1024x1024px showing feature)
- [ ] Submit for Review

**Yearly Subscription:**
- [ ] Product ID: `macrogoal_premium_yearly`
- [ ] Price: $49.99
- [ ] Duration: 1 Year
- [ ] Display Name: "Premium Yearly"
- [ ] Description: "Access to AI Meal Estimator and premium features"
- [ ] Screenshot: (1024x1024px showing feature)
- [ ] Submit for Review

#### Create Sandbox Tester
- [ ] Go to Users and Access → Sandbox Testers
- [ ] Create new tester with unique email
- [ ] Save credentials for testing

### 2. Xcode Configuration (10 minutes)

- [ ] Open project in Xcode
- [ ] Select app target → Signing & Capabilities
- [ ] Add "In-App Purchase" capability
- [ ] Verify bundle identifier matches App Store Connect
- [ ] Create StoreKit Configuration File (optional, for testing)

### 3. Database Migration (5 minutes)

```bash
# Run this command to apply the migration
supabase db push
```

Or manually run the SQL in `supabase/migrations/20240102000000_add_apple_iap_fields.sql`

### 4. Testing (1-2 hours)

#### Sandbox Testing (Physical Device Required)
- [ ] Sign out of real Apple ID on device
- [ ] Install app via Xcode or EAS
- [ ] Navigate to paywall
- [ ] Purchase with sandbox tester account
- [ ] Verify premium features unlock
- [ ] Delete and reinstall app
- [ ] Test "Restore Purchases"
- [ ] Verify subscription restores correctly
- [ ] Cancel subscription in Settings
- [ ] Verify "Active (Canceled)" status
- [ ] Wait for expiration (5 min for monthly in sandbox)
- [ ] Verify premium features lock after expiration

### 5. App Store Submission

- [ ] Ensure products are "Ready to Submit" or "Approved"
- [ ] Update app screenshots to show IAP features
- [ ] Update app description to mention subscriptions
- [ ] Link privacy policy (mention subscriptions)
- [ ] Link terms of service (mention auto-renewal)
- [ ] Submit app for review
- [ ] Wait for approval (usually 24-48 hours)

### 6. Production Testing (After Approval)

- [ ] Install production app from TestFlight or App Store
- [ ] Make real purchase with real Apple ID
- [ ] Verify all functionality works
- [ ] Test restore purchases
- [ ] Monitor subscription metrics

## 🚨 Critical Requirements

### Product IDs MUST Match Exactly
```
Code:              macrogoal_premium_monthly
App Store Connect: macrogoal_premium_monthly
                   ↑ Must be identical ↑
```

### Bundle Identifier MUST Match
```
Xcode:             com.yourcompany.elitemacrotracker
App Store Connect: com.yourcompany.elitemacrotracker
                   ↑ Must be identical ↑
```

### Restore Purchases Button MUST Be Visible
Apple requires a "Restore Purchases" button on the paywall. It's already implemented in `paywall.ios.tsx`.

## 📋 Information You Need

### From App Store Connect:
- [ ] Product IDs (already set in code)
- [ ] Sandbox tester email and password
- [ ] Bundle identifier

### From Xcode:
- [ ] Bundle identifier (must match App Store Connect)
- [ ] Team ID (for signing)

### From Supabase:
- [ ] Database migration applied
- [ ] Subscriptions table has Apple IAP columns

## ⏱️ Timeline

| Task | Time | Status |
|------|------|--------|
| App Store Connect setup | 30-60 min | ⏳ |
| Xcode configuration | 10 min | ⏳ |
| Database migration | 5 min | ⏳ |
| Sandbox testing | 1-2 hours | ⏳ |
| App Store submission | 5 min | ⏳ |
| Apple review | 24-48 hours | ⏳ |
| Production testing | 30 min | ⏳ |

**Total: ~3-4 hours of work + 24-48 hours waiting for Apple**

## 🎯 Success Criteria

After implementation, verify:
- ✅ iOS users see Apple IAP paywall
- ✅ Android/web users see Stripe paywall (unchanged)
- ✅ Purchase flow works on iOS
- ✅ Restore purchases works on iOS
- ✅ Premium features unlock correctly
- ✅ Subscription status syncs across devices
- ✅ Cancellation works correctly
- ✅ Expiration locks premium features

## 📞 Need Help?

1. **Products not loading?**
   - Check product IDs match exactly
   - Ensure products are submitted in App Store Connect
   - Verify bundle identifier matches

2. **Purchase fails?**
   - Check sandbox tester account
   - Ensure device is signed out of real Apple ID
   - Verify In-App Purchase capability is enabled

3. **Restore doesn't work?**
   - Ensure user is signed in with correct Apple ID
   - Check purchase history in App Store Connect
   - Verify subscription hasn't expired

## 🔗 Quick Links

- [App Store Connect](https://appstoreconnect.apple.com)
- [Apple Developer Portal](https://developer.apple.com)
- [Expo IAP Docs](https://docs.expo.dev/versions/latest/sdk/in-app-purchases/)
- [Full Implementation Guide](./IOS_IAP_IMPLEMENTATION_GUIDE.md)
