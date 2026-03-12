
# RevenueCat In-App Purchase Setup Guide

This app uses RevenueCat for in-app purchases and subscriptions. Follow these steps to complete the setup.

## 1. Create RevenueCat Account

1. Go to [https://app.revenuecat.com](https://app.revenuecat.com)
2. Sign up for a free account
3. Create a new project for your app

## 2. Configure Products in RevenueCat

### Create Products
1. In RevenueCat Dashboard, go to **Products**
2. Click **+ New** to create products
3. Create two products:
   - **Monthly Premium** (Product ID: `Monthly_MG`)
   - **Yearly Premium** (Product ID: `Yearly_MG`)

### Create Entitlements
1. Go to **Entitlements** tab
2. Click **+ New Entitlement**
3. Create an entitlement called `premium`
4. Attach both products to this entitlement

## 3. Configure App Store Connect (iOS)

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Create your app if you haven't already
3. Go to **Features** > **In-App Purchases**
4. Create two auto-renewable subscriptions:
   - Product ID: `Monthly_MG`
   - Product ID: `Yearly_MG`
5. Set pricing and subscription duration
6. Submit for review

### Link to RevenueCat
1. In RevenueCat Dashboard, go to **Project Settings** > **Apple App Store**
2. Click **Connect to App Store Connect**
3. Follow the instructions to generate and upload the API key
4. Enter your app's Bundle ID

## 4. Configure Google Play Console (Android)

1. Go to [Google Play Console](https://play.google.com/console)
2. Create your app if you haven't already
3. Go to **Monetize** > **Subscriptions**
4. Create two subscriptions:
   - Product ID: `Monthly_MG`
   - Product ID: `Yearly_MG`
5. Set pricing and billing period
6. Activate the subscriptions

### Link to RevenueCat
1. In RevenueCat Dashboard, go to **Project Settings** > **Google Play Store**
2. Click **Connect to Google Play**
3. Follow the instructions to create a service account and upload credentials
4. Enter your app's Package Name

## 5. Get API Keys

1. In RevenueCat Dashboard, go to **Project Settings** > **API Keys**
2. Under **App-specific API Keys**, you'll find:
   - iOS API Key (starts with `appl_`)
   - Android API Key (starts with `goog_`)
3. Copy these keys

## 6. Update App Configuration

Open `app/subscription.tsx` and replace the placeholder API keys:

```typescript
const REVENUECAT_API_KEY = Platform.select({
  ios: 'appl_YOUR_ACTUAL_IOS_KEY', // Replace with your iOS key
  android: 'goog_YOUR_ACTUAL_ANDROID_KEY', // Replace with your Android key
}) || '';
```

## 7. Configure Webhook (Backend Sync)

The app uses Supabase Edge Functions to sync subscription status.

1. In RevenueCat Dashboard, go to **Integrations** > **Webhooks**
2. Click **+ Add Webhook**
3. Enter webhook URL: `https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/revenuecat-webhook`
4. Set Authorization header: `Bearer YOUR_SUPABASE_ANON_KEY`
5. Select all event types (recommended)
6. Save the webhook

The webhook is already deployed and will automatically:
- Update user subscription status in Supabase
- Sync premium access across devices
- Handle subscription renewals, cancellations, and expirations

## 8. Testing

### iOS Testing
1. Use a Sandbox Tester account in App Store Connect
2. Sign out of your Apple ID in Settings
3. Run the app and attempt a purchase
4. Sign in with your Sandbox Tester account when prompted

### Android Testing
1. Add test users in Google Play Console
2. Use a test account to sign in on your device
3. Run the app and attempt a purchase

### Test Checklist
- [ ] Monthly subscription purchase works
- [ ] Yearly subscription purchase works
- [ ] Premium features unlock after purchase
- [ ] Restore purchases works
- [ ] Subscription status syncs to Supabase
- [ ] Webhook receives events (check Supabase logs)

## 9. Product IDs Reference

Make sure these match across all platforms:

| Product | RevenueCat ID | iOS Product ID | Android Product ID |
|---------|---------------|----------------|-------------------|
| Monthly | `Monthly_MG` | `Monthly_MG` | `Monthly_MG` |
| Yearly | `Yearly_MG` | `Yearly_MG` | `Yearly_MG` |

## 10. Troubleshooting

### "No offerings found"
- Check that products are created in RevenueCat
- Verify products are attached to an entitlement
- Ensure App Store Connect / Google Play products are approved

### "Purchase failed"
- Verify API keys are correct
- Check that products exist in App Store Connect / Google Play
- Ensure you're using a test account (not production)

### "Subscription not syncing"
- Check webhook is configured correctly
- Verify webhook URL is accessible
- Check Supabase Edge Function logs for errors

### Check Logs
```bash
# View RevenueCat webhook logs in Supabase
# Go to: Supabase Dashboard > Edge Functions > revenuecat-webhook > Logs
```

## Support

- RevenueCat Docs: [https://docs.revenuecat.com](https://docs.revenuecat.com)
- RevenueCat Support: [https://community.revenuecat.com](https://community.revenuecat.com)
- Supabase Docs: [https://supabase.com/docs](https://supabase.com/docs)
