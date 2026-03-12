
# RevenueCat Configuration Complete ✅

Your RevenueCat integration has been successfully configured with your credentials!

## 📋 Configuration Summary

### RevenueCat Details
- **App ID**: `app48cb666b48`
- **iOS SDK Key**: `appl_TZdEZxwrVNJdRUPcoavoXaVUCSE` ✅ (configured)
- **Android SDK Key**: `goog_YOUR_ANDROID_KEY_HERE` ⚠️ (needs your key)
- **Offering Identifier**: `Monthly_MG`
- **Products**: `Monthly_MG`, `Yearly_MG`
- **Entitlement**: `Macrogoal Pro`

### What Was Updated
1. ✅ `app.json` - Added iOS SDK key and RevenueCat configuration
2. ✅ `app/subscription.tsx` - Updated to use `'Macrogoal Pro'` entitlement
3. ✅ `hooks/usePremium.ts` - Updated to check `'Macrogoal Pro'` entitlement
4. ✅ Webhook already configured correctly

## 🚀 Next Steps

### 1. Add Android SDK Key (if supporting Android)
Go to RevenueCat Dashboard → API Keys → Copy Android key (starts with `goog_`)

Then update `app.json`:
```json
"revenueCat": {
  "iosApiKey": "appl_TZdEZxwrVNJdRUPcoavoXaVUCSE",
  "androidApiKey": "YOUR_ANDROID_KEY_HERE"  ← Replace this
}
```

### 2. Verify RevenueCat Dashboard Setup

**Products (App Store Connect / Google Play):**
- [ ] `Monthly_MG` product created in App Store Connect
- [ ] `Yearly_MG` product created in App Store Connect
- [ ] Products are approved and ready for sale
- [ ] Product IDs match exactly in RevenueCat

**RevenueCat Dashboard:**
- [ ] Offering `Monthly_MG` exists
- [ ] Products `Monthly_MG` and `Yearly_MG` are linked to the offering
- [ ] Entitlement `Macrogoal Pro` is configured
- [ ] Products are connected to the entitlement

**Webhook Configuration:**
- [ ] Webhook URL: `https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/revenuecat-webhook`
- [ ] Webhook secret generated and added to Supabase secrets as `REVENUECAT_WEBHOOK_SECRET`
- [ ] All events selected (recommended)

### 3. Test the Integration

**Test Purchases (Sandbox):**
1. Build the app with `npx expo prebuild`
2. Run on iOS simulator or device
3. Navigate to subscription screen
4. Make a test purchase using sandbox account
5. Verify premium features unlock

**Check Logs:**
```bash
# Frontend logs
Look for: [Subscription] and [usePremium] logs

# Backend webhook logs
supabase functions logs revenuecat-webhook
```

### 4. Verify Database Sync

After a test purchase, check Supabase:
```sql
-- Check subscription record
SELECT * FROM subscriptions WHERE user_id = 'YOUR_USER_ID';

-- Check user type
SELECT id, email, user_type FROM users WHERE id = 'YOUR_USER_ID';

-- Check webhook events
SELECT * FROM revenuecat_events ORDER BY created_at DESC LIMIT 10;
```

## 🔧 Troubleshooting

### "No offerings available"
- Verify products are created in App Store Connect
- Ensure products are linked to offering in RevenueCat
- Check product IDs match exactly
- Wait 24 hours after creating products (App Store sync delay)

### "Purchase failed"
- Verify you're using a sandbox test account
- Check App Store Connect agreements are signed
- Ensure products are approved and ready for sale
- Check RevenueCat logs for detailed error

### Premium not unlocking after purchase
- Check webhook is receiving events: `supabase functions logs revenuecat-webhook`
- Verify entitlement name is `'Macrogoal Pro'` (case-sensitive)
- Check `subscriptions` table has correct status
- Call `refreshPremiumStatus()` in the app

### Webhook not receiving events
- Verify webhook URL is correct in RevenueCat dashboard
- Check webhook secret is set in Supabase secrets
- Test webhook manually from RevenueCat dashboard
- Check Supabase function logs for errors

## 📱 How It Works

### Purchase Flow
1. User taps "Subscribe Now" → `Purchases.purchasePackage()`
2. iOS/Android handles payment → RevenueCat receives receipt
3. RevenueCat validates receipt → Sends webhook to Supabase
4. Webhook updates `subscriptions` table and `users.user_type`
5. App checks `usePremium()` → Premium features unlock

### Premium Check Flow
1. `usePremium()` hook checks RevenueCat entitlements (primary)
2. Falls back to Supabase `users.user_type` (offline/backup)
3. Real-time listener updates when subscription changes
4. UI automatically updates based on `isPremium` state

## 🎯 Premium Features Gated

The following features check `isPremium`:
- Advanced analytics & trends
- Multiple goal phases
- Custom recipes builder
- Habit tracking & streaks
- Data export (CSV)
- Priority support

Use the `usePremium()` hook in any component:
```tsx
import { usePremium } from '@/hooks/usePremium';

function MyComponent() {
  const { isPremium, loading } = usePremium();
  
  if (loading) return <ActivityIndicator />;
  
  if (!isPremium) {
    return <Button title="Upgrade to Premium" onPress={() => router.push('/subscription')} />;
  }
  
  return <PremiumFeature />;
}
```

## 📞 Need Help?

If you encounter issues:
1. Check the troubleshooting section above
2. Review RevenueCat logs in dashboard
3. Check Supabase function logs
4. Verify all configuration steps are complete
5. Test with a fresh sandbox account

---

**Status**: ✅ iOS Configured | ⚠️ Android Pending
**Last Updated**: $(date)
