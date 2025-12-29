
# Quick Fix: Subscription Status Not Updating

## The Problem
✅ Stripe checkout completes successfully
❌ Profile still shows "Free" instead of "Premium"
❌ Premium features remain locked

## The Root Cause
The Stripe webhook is returning **401 Unauthorized** errors because JWT verification is enabled. Stripe webhooks don't send JWT tokens - they use webhook signatures instead.

## The Solution (2 Steps)

### Step 1: Disable JWT Verification (CRITICAL)

**You MUST do this in the Supabase Dashboard:**

1. Go to: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/functions
2. Click on `stripe-webhook`
3. Go to **Settings** tab
4. Find **"Verify JWT"** toggle
5. **Turn it OFF** (disable it)
6. Click **Save**

**This is the most important step!** Without this, the webhook will continue to fail.

### Step 2: Test the Fix

1. **Complete a test subscription:**
   - Open the app
   - Go to Profile → "Upgrade to Premium"
   - Use test card: `4242 4242 4242 4242`
   - Complete the checkout

2. **Verify it works:**
   - Return to the app
   - Go to Profile screen
   - You should see "⭐ Premium" badge
   - Subscription card should show "Active"

3. **If it doesn't update automatically:**
   - Tap "Sync Subscription Status" button
   - This will manually fetch the status from Stripe

## How to Verify the Webhook is Working

### Check Edge Function Logs

1. Go to: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/functions
2. Click on `stripe-webhook`
3. Go to **Logs** tab
4. Look for successful 200 responses (not 401 errors)
5. You should see logs like:
   ```
   [Webhook] ✅ Checkout completed
   [Webhook] ✅ Subscription upserted successfully
   [Webhook] ✅ User type updated to: premium
   ```

### Check Database

Run this query in Supabase SQL Editor:

```sql
SELECT 
  u.email,
  u.user_type,
  s.status,
  s.plan_type,
  s.stripe_subscription_id
FROM users u
LEFT JOIN subscriptions s ON u.id = s.user_id
WHERE u.email = 'your-email@example.com';
```

You should see:
- `user_type`: `premium`
- `status`: `active`
- `plan_type`: `monthly` or `yearly`
- `stripe_subscription_id`: Should have a value

## Troubleshooting

### Still seeing 401 errors in webhook logs?
→ JWT verification is still enabled. Go back to Step 1.

### Webhook shows 200 but Profile still shows Free?
→ Tap "Sync Subscription Status" button in Profile
→ Or restart the app

### Sync button doesn't work?
→ Check that you have an active subscription in Stripe Dashboard
→ Check Edge Function logs for errors

### Premium features still locked?
→ Verify `user_type` is `premium` in database
→ Restart the app completely

## Manual Sync (Temporary Workaround)

If you can't disable JWT verification right now, you can manually sync after each test:

1. Complete checkout in Stripe
2. Return to app
3. Go to Profile
4. Tap "Sync Subscription Status"
5. Wait for success message
6. Profile should update to Premium

## What Changed

### Webhook Function
- Now updates both `subscriptions` table AND `users.user_type`
- Sets `user_type = 'premium'` when subscription is active/trialing
- Sets `user_type = 'free'` when subscription is canceled

### Sync Function
- Can manually fetch subscription status from Stripe
- Updates database with latest information
- Accessible via "Sync Subscription Status" button

### Profile Screen
- Shows subscription status from database
- Displays correct user type badge
- Has manual sync button for troubleshooting

## Testing Checklist

- [ ] JWT verification disabled on webhook
- [ ] Webhook configured in Stripe Dashboard
- [ ] Test subscription completed successfully
- [ ] Profile shows "Premium" badge
- [ ] Subscription card shows "Active" status
- [ ] AI Meal Estimator works (premium feature)
- [ ] No 401 errors in webhook logs

## Need Help?

Check the logs:
1. **Edge Function logs**: Supabase Dashboard → Functions → stripe-webhook → Logs
2. **App logs**: Look for `[useSubscription]` and `[Profile]` messages in console
3. **Stripe logs**: Stripe Dashboard → Developers → Webhooks → Click your webhook → Events

The most common issue is forgetting to disable JWT verification on the webhook. Make sure you've done Step 1!
