
# 🚀 Quick Start: Enable In-App Purchases

Follow these steps to enable subscriptions in your app.

## ⏱️ 5-Minute Setup (Development Testing)

### 1. Get RevenueCat API Keys (2 minutes)
```
1. Go to https://app.revenuecat.com
2. Sign up (free account)
3. Create new project
4. Go to: Project Settings > API Keys
5. Copy iOS key (appl_...) and Android key (goog_...)
```

### 2. Update Code (1 minute)
Open `app/subscription.tsx` and replace line 31-32:
```typescript
const REVENUECAT_API_KEY = Platform.select({
  ios: 'appl_YOUR_KEY_HERE',      // ← Paste iOS key here
  android: 'goog_YOUR_KEY_HERE',  // ← Paste Android key here
}) || '';
```

### 3. Create Products in RevenueCat (2 minutes)
```
1. In RevenueCat Dashboard: Products > + New
2. Create product: Monthly_MG
3. Create product: Yearly_MG
4. Go to: Entitlements > + New
5. Create entitlement: premium
6. Attach both products to premium entitlement
```

### 4. Test (Now!)
```bash
# Restart your app
# Navigate to: Profile > Subscription
# You should see the subscription screen!
```

**Note**: For actual purchases, you need to configure App Store Connect (iOS) and Google Play Console (Android). See `REVENUECAT_SETUP.md` for full instructions.

---

## 📱 Full Production Setup (1-2 hours)

### iOS Setup (30 minutes)
1. **App Store Connect**
   - Create app
   - Add in-app purchases: Monthly_MG, Yearly_MG
   - Set pricing
   - Submit for review

2. **Link to RevenueCat**
   - RevenueCat Dashboard > Apple App Store
   - Connect to App Store Connect
   - Upload API key

### Android Setup (30 minutes)
1. **Google Play Console**
   - Create app
   - Add subscriptions: Monthly_MG, Yearly_MG
   - Set pricing
   - Activate subscriptions

2. **Link to RevenueCat**
   - RevenueCat Dashboard > Google Play Store
   - Connect to Google Play
   - Upload service account credentials

### Webhook Setup (5 minutes)
```
1. RevenueCat Dashboard > Integrations > Webhooks
2. Add webhook:
   URL: https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/revenuecat-webhook
   Auth: Bearer YOUR_SUPABASE_ANON_KEY
3. Select all event types
4. Save
```

---

## ✅ Verification Checklist

After setup, verify everything works:

- [ ] Subscription screen loads without errors
- [ ] Plans display with correct pricing
- [ ] Can tap "Subscribe Now" button
- [ ] Purchase flow starts (sandbox/test account)
- [ ] Premium status updates after purchase
- [ ] "Restore Purchases" works
- [ ] Webhook receives events (check Supabase logs)
- [ ] User's `user_type` changes to 'premium' in database

---

## 🧪 Testing

### iOS Testing
```
1. App Store Connect > Users and Access > Sandbox Testers
2. Create test account
3. On device: Settings > App Store > Sign Out
4. Run app, attempt purchase
5. Sign in with sandbox account when prompted
```

### Android Testing
```
1. Google Play Console > Setup > License Testing
2. Add test email
3. Install app from Play Store (internal testing track)
4. Make purchase with test account
```

---

## 🎯 Using Premium Features in Your App

### Method 1: Hook
```tsx
import { usePremium } from '@/hooks/usePremium';

function MyScreen() {
  const { isPremium } = usePremium();
  
  return isPremium ? <PremiumFeature /> : <UpgradePrompt />;
}
```

### Method 2: Gate Component
```tsx
import { PremiumFeatureGate } from '@/components/PremiumFeatureGate';

function AdvancedAnalytics() {
  return (
    <PremiumFeatureGate featureName="Advanced Analytics">
      <AnalyticsChart />
    </PremiumFeatureGate>
  );
}
```

### Method 3: Navigate to Subscription
```tsx
import { useRouter } from 'expo-router';

function UpgradeButton() {
  const router = useRouter();
  return (
    <Button 
      title="Go Premium" 
      onPress={() => router.push('/subscription')}
    />
  );
}
```

---

## 🐛 Troubleshooting

### "No offerings found"
- Products not created in RevenueCat
- Products not attached to entitlement
- Wait a few minutes after creating products

### "Purchase failed"
- Using wrong API keys
- Products not approved in App Store/Play Store
- Not using test account

### "Subscription not syncing"
- Webhook not configured
- Wrong webhook URL
- Check Supabase function logs

### Still having issues?
1. Check console logs: Look for `[Subscription]` messages
2. Check Supabase logs: Dashboard > Edge Functions > revenuecat-webhook
3. Verify API keys are correct
4. Ensure products exist in RevenueCat

---

## 📚 Documentation

- **Full Setup Guide**: `REVENUECAT_SETUP.md`
- **Code Examples**: `INTEGRATION_EXAMPLE.md`
- **Feature Overview**: `README_SUBSCRIPTIONS.md`
- **Implementation Details**: `SUBSCRIPTION_IMPLEMENTATION_COMPLETE.md`

---

## 🎉 You're Done!

Once you complete the setup:
1. Users can subscribe to premium
2. Premium status syncs automatically
3. You can gate features behind premium
4. Subscriptions renew automatically
5. Webhook keeps everything in sync

**No more errors!** The old `expo-in-app-purchases` is completely removed and replaced with the modern, reliable `react-native-purchases` library.
