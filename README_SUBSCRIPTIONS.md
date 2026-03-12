
# In-App Purchases & Subscriptions

This app uses **RevenueCat** for in-app purchases and subscriptions. The integration is complete and ready to use once you configure your RevenueCat account.

## Quick Start

1. **Install Dependencies** (Already done)
   ```bash
   # react-native-purchases is already installed
   ```

2. **Configure RevenueCat**
   - See `REVENUECAT_SETUP.md` for detailed setup instructions
   - Get your API keys from RevenueCat Dashboard
   - Update `app/subscription.tsx` with your API keys

3. **Test the Integration**
   - Run the app and navigate to Profile > Subscription
   - Use sandbox accounts to test purchases
   - Verify webhook events in Supabase logs

## Features Implemented

### ✅ Subscription Screen (`app/subscription.tsx`)
- Displays available subscription plans (Monthly & Yearly)
- Fetches real-time pricing from RevenueCat
- Handles purchase flow with proper error handling
- Restore purchases functionality
- Premium status display for existing subscribers

### ✅ Premium Status Hook (`hooks/usePremium.ts`)
- Check if user has active premium subscription
- Automatically syncs between RevenueCat and Supabase
- Can be used anywhere in the app
- Example usage:
  ```tsx
  const { isPremium, loading } = usePremium();
  
  if (isPremium) {
    return <PremiumFeature />;
  }
  ```

### ✅ Premium Feature Gate (`components/PremiumFeatureGate.tsx`)
- Wrap any component to gate it behind premium
- Shows upgrade prompt for free users
- Example usage:
  ```tsx
  <PremiumFeatureGate featureName="Advanced Analytics">
    <AdvancedAnalyticsChart />
  </PremiumFeatureGate>
  ```

### ✅ Backend Webhook (`supabase/functions/revenuecat-webhook/index.ts`)
- Automatically syncs subscription status
- Handles all RevenueCat events:
  - Initial purchase
  - Renewals
  - Cancellations
  - Expirations
  - Billing issues
  - Product changes
- Updates Supabase `subscriptions` table
- Stores audit trail in `revenuecat_events` table

### ✅ Database Schema
- `subscriptions` table with RevenueCat fields
- `revenuecat_events` table for audit trail
- Proper RLS policies for security
- See `supabase/migrations/20250131000000_create_revenuecat_integration.sql`

## Configuration Required

### 1. RevenueCat API Keys
Update in `app/subscription.tsx`:
```typescript
const REVENUECAT_API_KEY = Platform.select({
  ios: 'appl_YOUR_ACTUAL_IOS_KEY',
  android: 'goog_YOUR_ACTUAL_ANDROID_KEY',
}) || '';
```

### 2. Product IDs
Current product IDs (must match in RevenueCat, App Store, and Google Play):
- `Monthly_MG` - Monthly subscription
- `Yearly_MG` - Yearly subscription

### 3. Webhook URL
Configure in RevenueCat Dashboard:
```
https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/revenuecat-webhook
```

## How It Works

### Purchase Flow
1. User taps "Subscribe Now" on subscription screen
2. App calls `Purchases.purchasePackage()` with selected plan
3. Native store (App Store/Google Play) handles payment
4. RevenueCat receives purchase confirmation
5. RevenueCat sends webhook to Supabase
6. Supabase updates user's subscription status
7. App checks status and unlocks premium features

### Status Sync
- RevenueCat is the source of truth for subscriptions
- Webhook keeps Supabase in sync automatically
- App checks both RevenueCat and Supabase for redundancy
- Status is cached locally for offline access

### Premium Feature Access
```tsx
// Method 1: Using the hook
const { isPremium } = usePremium();
if (isPremium) {
  // Show premium feature
}

// Method 2: Using the gate component
<PremiumFeatureGate featureName="Custom Recipes">
  <CustomRecipeBuilder />
</PremiumFeatureGate>

// Method 3: Direct check from Supabase
const { data } = await supabase
  .from('users')
  .select('user_type')
  .eq('id', userId)
  .single();
const isPremium = data?.user_type === 'premium';
```

## Testing

### iOS Testing
1. Create sandbox tester in App Store Connect
2. Sign out of Apple ID on device
3. Run app and attempt purchase
4. Sign in with sandbox account when prompted

### Android Testing
1. Add test user in Google Play Console
2. Join testing track (internal/closed/open)
3. Install app from Play Store
4. Test purchases with test account

### Webhook Testing
1. Make a test purchase
2. Check Supabase logs: Dashboard > Edge Functions > revenuecat-webhook > Logs
3. Verify `revenuecat_events` table has new entry
4. Verify `subscriptions` table is updated
5. Verify user's `user_type` is set to 'premium'

## Troubleshooting

### "No offerings found"
- Products not created in RevenueCat
- Products not attached to entitlement
- App Store/Google Play products not approved

### "Purchase failed"
- Wrong API keys
- Products don't exist in stores
- Not using test account

### "Subscription not syncing"
- Webhook not configured
- Wrong webhook URL
- Check Supabase function logs

### Check Logs
```typescript
// Frontend logs
console.log('[Subscription] ...');

// Backend logs
// Supabase Dashboard > Edge Functions > revenuecat-webhook > Logs
```

## Premium Features to Gate

Based on your app requirements, these features should be premium:
- ✅ Advanced analytics & trends (7/30-day charts)
- ✅ Multiple goal phases (cut/maintain/bulk)
- ✅ Custom recipes (multi-ingredient builder)
- ✅ Habit tracking + streaks + completion %
- ✅ Data export (CSV)
- ✅ Smart Suggestions (AI tips)

## Support

- RevenueCat Docs: https://docs.revenuecat.com
- Supabase Docs: https://supabase.com/docs
- Setup Guide: See `REVENUECAT_SETUP.md`
