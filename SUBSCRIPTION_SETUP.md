
# 💳 Subscription System Setup

## Overview

This app has a clean, simple subscription system ready to integrate with your payment provider of choice.

## Current Implementation

### ✅ What's Already Built

1. **Subscription Screen** (`app/subscription.tsx`)
   - Clean UI showing subscription plans
   - Monthly and Yearly options
   - Premium status display
   - Ready to integrate with payment provider

2. **Premium Status Hook** (`hooks/usePremium.ts`)
   - Checks if user has premium access
   - Reads from Supabase `users` table
   - Easy to use in any component

3. **Premium Feature Gate** (`components/PremiumFeatureGate.tsx`)
   - Wraps premium features
   - Shows upgrade prompt for free users
   - Automatically unlocks for premium users

4. **Database Schema**
   - `users` table has `user_type` column ('free' or 'premium')
   - `subscriptions` table for subscription details
   - Ready for payment provider integration

## Integration Options

You can integrate with any payment provider:

### Option 1: RevenueCat (Recommended for Mobile)
- Handles iOS and Android in-app purchases
- Manages subscriptions automatically
- Provides analytics and webhooks
- [RevenueCat Documentation](https://docs.revenuecat.com/)

### Option 2: Stripe
- Web and mobile payments
- Flexible pricing models
- Powerful API
- [Stripe Documentation](https://stripe.com/docs)

### Option 3: Apple/Google Direct
- Direct integration with App Store / Play Store
- More control but more complexity
- Requires manual receipt validation

## How to Use Premium Features

### Check Premium Status
```typescript
import { usePremium } from '@/hooks/usePremium';

function MyComponent() {
  const { isPremium, loading } = usePremium();
  
  if (loading) return <ActivityIndicator />;
  
  return (
    <View>
      {isPremium ? (
        <Text>Premium Feature</Text>
      ) : (
        <Button title="Upgrade" onPress={() => router.push('/subscription')} />
      )}
    </View>
  );
}
```

### Gate Premium Features
```typescript
import { PremiumFeatureGate } from '@/components/PremiumFeatureGate';

function MyScreen() {
  return (
    <PremiumFeatureGate featureName="Advanced Analytics">
      <AdvancedAnalyticsChart />
    </PremiumFeatureGate>
  );
}
```

### Manually Set Premium Status
```typescript
// After successful payment
const { data: { user } } = await supabase.auth.getUser();

await supabase
  .from('users')
  .update({ user_type: 'premium' })
  .eq('id', user.id);
```

## Database Schema

### users table
```sql
- id (uuid, primary key)
- email (text)
- user_type (text) -- 'free' or 'premium'
- created_at (timestamp)
- updated_at (timestamp)
```

### subscriptions table
```sql
- id (uuid, primary key)
- user_id (uuid, foreign key to users)
- status (text) -- 'active', 'inactive', 'past_due'
- plan_type (text) -- 'monthly', 'yearly'
- current_period_start (timestamp)
- current_period_end (timestamp)
- cancel_at_period_end (boolean)
- created_at (timestamp)
- updated_at (timestamp)
```

## Next Steps

1. **Choose a payment provider** (RevenueCat, Stripe, etc.)
2. **Set up products** in the provider dashboard
3. **Integrate payment flow** in `app/subscription.tsx`
4. **Update user_type** after successful payment
5. **Test the flow** end-to-end

## Testing

### Test Premium Access
```sql
-- Manually set a user to premium for testing
UPDATE users 
SET user_type = 'premium' 
WHERE id = 'YOUR_USER_ID';
```

### Check Premium Status
```sql
-- Check if user is premium
SELECT user_type FROM users WHERE id = 'YOUR_USER_ID';
```

## Support

The subscription system is designed to be flexible and easy to integrate with any payment provider. The core logic is already in place - you just need to connect your payment provider of choice.

For payment provider-specific integration help, refer to their documentation:
- [RevenueCat Docs](https://docs.revenuecat.com/)
- [Stripe Docs](https://stripe.com/docs)
- [Apple In-App Purchase](https://developer.apple.com/in-app-purchase/)
- [Google Play Billing](https://developer.android.com/google/play/billing)
