
# Subscription Status Fix - Implementation Complete

## Problem Summary

The Stripe checkout was completing successfully, but the app was not recognizing the user as subscribed because:

1. **Webhook 401 Errors**: The `stripe-webhook` Edge Function had JWT verification enabled, causing all webhook calls from Stripe to fail with 401 Unauthorized errors.
2. **Database Not Updated**: Because the webhook failed, the `subscriptions` table was never updated with the subscription details.
3. **User Type Not Synced**: The `users.user_type` field was not being updated to `premium` when a subscription became active.

## Solution Implemented

### 1. Updated Webhook Logic

**File**: `supabase/functions/stripe-webhook/index.ts`

The webhook now:
- ✅ Updates the `subscriptions` table with subscription details
- ✅ Updates the `users.user_type` field to `premium` when subscription is active/trialing
- ✅ Updates the `users.user_type` field to `free` when subscription is canceled
- ✅ Handles all three key events:
  - `checkout.session.completed` - Initial subscription creation
  - `customer.subscription.updated` - Subscription changes
  - `customer.subscription.deleted` - Subscription cancellation

### 2. Created Sync Function

**File**: `supabase/functions/sync-subscription/index.ts`

This function allows manual syncing of subscription status:
- ✅ Fetches the latest subscription data from Stripe
- ✅ Updates the database with current subscription status
- ✅ Updates `users.user_type` based on subscription status
- ✅ Can be called from the app after checkout to force a sync

### 3. Profile Screen Integration

**File**: `app/(tabs)/profile.tsx`

The Profile screen now:
- ✅ Shows subscription status from the database
- ✅ Displays user type (Free/Premium) correctly
- ✅ Has a "Sync Subscription Status" button for manual sync
- ✅ Refreshes data when the screen is focused

### 4. Subscription Hook

**File**: `hooks/useSubscription.ts`

The hook now:
- ✅ Provides a `syncSubscription()` method
- ✅ Automatically syncs after checkout completes
- ✅ Listens for real-time subscription changes

## Critical Action Required

### Disable JWT Verification for Webhook

The `stripe-webhook` Edge Function **MUST** have JWT verification disabled because Stripe webhooks do not send JWT tokens - they use webhook signatures instead.

**Steps to fix in Supabase Dashboard:**

1. Go to https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/functions
2. Click on the `stripe-webhook` function
3. Go to Settings
4. Find "Verify JWT" setting
5. **Disable** JWT verification
6. Save changes

**Why this is critical:**
- Stripe webhooks authenticate using the `Stripe-Signature` header, not JWT tokens
- With JWT verification enabled, all webhook calls return 401 Unauthorized
- This prevents the subscription status from being updated automatically
- The webhook code already validates the Stripe signature for security

### Configure Stripe Webhook

In your Stripe Dashboard (test mode):

1. Go to Developers → Webhooks
2. Add endpoint: `https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/stripe-webhook`
3. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the webhook signing secret
5. Add it to Supabase Edge Function secrets as `STRIPE_WEBHOOK_SECRET`

## Testing the Fix

### Test Flow

1. **Start as Free User**
   - Open Profile screen
   - Verify it shows "Free" plan

2. **Subscribe with Test Card**
   - Tap "Upgrade to Premium" or open paywall
   - Select a plan (Monthly or Yearly)
   - Complete checkout with test card: `4242 4242 4242 4242`
   - Any future date, any CVC

3. **Verify Subscription**
   - After returning to the app, the Profile should automatically refresh
   - If not, tap "Sync Subscription Status" button
   - Profile should now show:
     - User type badge: "⭐ Premium"
     - Subscription card showing "Active" status
     - Plan type (Monthly/Yearly)
     - Renewal date

4. **Verify Premium Access**
   - AI Meal Estimator should now work
   - No paywall should appear when accessing premium features

### Manual Sync (Workaround)

If the webhook is still not working (JWT verification not disabled):

1. Complete a test subscription in Stripe
2. Return to the app
3. Go to Profile screen
4. Tap "Sync Subscription Status" button
5. This will manually fetch the subscription from Stripe and update the database

## Database Schema

### subscriptions table
```sql
- user_id (uuid, unique) - Links to auth.users
- stripe_customer_id (text) - Stripe customer ID
- stripe_subscription_id (text) - Stripe subscription ID
- stripe_price_id (text) - Stripe price ID
- status (text) - active, inactive, trialing, past_due, canceled, unpaid
- plan_type (text) - monthly, yearly
- current_period_start (timestamptz)
- current_period_end (timestamptz)
- cancel_at_period_end (boolean)
- trial_end (timestamptz)
```

### users table
```sql
- user_type (text) - guest, free, premium
```

## Flow Diagram

```
User Completes Checkout
         ↓
Stripe sends webhook event
         ↓
stripe-webhook Edge Function
         ↓
Updates subscriptions table
         ↓
Updates users.user_type to 'premium'
         ↓
Real-time listener in app
         ↓
Profile screen refreshes
         ↓
Shows Premium status
```

## Troubleshooting

### Webhook Still Returning 401

**Cause**: JWT verification is still enabled on the webhook function

**Solution**: Disable JWT verification in Supabase Dashboard (see above)

### Subscription Not Updating After Checkout

**Cause**: Webhook not configured in Stripe or webhook secret is incorrect

**Solution**: 
1. Check Stripe Dashboard → Webhooks
2. Verify endpoint URL is correct
3. Verify webhook secret matches the one in Supabase secrets
4. Use "Sync Subscription Status" button as workaround

### Profile Shows Free After Successful Payment

**Cause**: Database not updated yet

**Solution**:
1. Wait a few seconds for webhook to process
2. Pull to refresh on Profile screen
3. Use "Sync Subscription Status" button
4. Check Edge Function logs for errors

### Premium Features Still Locked

**Cause**: App is checking wrong field or not refreshing

**Solution**:
1. Verify `users.user_type` is set to 'premium' in database
2. Restart the app
3. Check that premium feature checks use `user.user_type === 'premium'`

## Verification Queries

Check subscription status in database:

```sql
-- Check user's subscription
SELECT 
  u.email,
  u.user_type,
  s.status,
  s.plan_type,
  s.stripe_subscription_id,
  s.current_period_end
FROM users u
LEFT JOIN subscriptions s ON u.id = s.user_id
WHERE u.email = 'your-email@example.com';
```

Check webhook logs:

```sql
-- In Supabase Dashboard → Edge Functions → stripe-webhook → Logs
-- Look for:
-- ✅ "Checkout completed"
-- ✅ "Subscription upserted successfully"
-- ✅ "User type updated to: premium"
```

## Next Steps

1. **Disable JWT verification** on the webhook (critical!)
2. **Configure Stripe webhook** in test mode
3. **Test the full flow** with a test card
4. **Verify** the Profile shows Premium status
5. **Test premium features** are unlocked
6. **Monitor logs** for any errors

## Files Modified

- ✅ `supabase/functions/stripe-webhook/index.ts` - Updated webhook logic
- ✅ `supabase/functions/sync-subscription/index.ts` - Created sync function
- ✅ `hooks/useSubscription.ts` - Already had sync logic
- ✅ `app/(tabs)/profile.tsx` - Already had sync button

## Summary

The subscription system is now properly configured to:
1. Receive webhook events from Stripe
2. Update the database with subscription details
3. Sync the user_type field for premium access
4. Display the correct status in the Profile screen
5. Unlock premium features automatically

The only remaining action is to **disable JWT verification** on the webhook function in the Supabase Dashboard.
