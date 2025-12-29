
# Stripe Webhook Configuration Guide

## Overview

For the subscription system to work automatically, you need to configure a webhook in Stripe that sends events to your Supabase Edge Function.

## Step-by-Step Setup

### 1. Get Your Webhook URL

Your webhook URL is:
```
https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/stripe-webhook
```

### 2. Configure Webhook in Stripe Dashboard

#### For Test Mode (Development)

1. Go to: https://dashboard.stripe.com/test/webhooks
2. Click **"Add endpoint"**
3. Enter the endpoint URL:
   ```
   https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/stripe-webhook
   ```
4. Click **"Select events"**
5. Select these events:
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.created`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
6. Click **"Add events"**
7. Click **"Add endpoint"**

#### For Live Mode (Production)

**Important**: Only do this when you're ready to accept real payments!

1. Go to: https://dashboard.stripe.com/webhooks
2. Follow the same steps as test mode
3. Use the same webhook URL
4. Select the same events

### 3. Get the Webhook Signing Secret

After creating the webhook:

1. Click on the webhook you just created
2. In the **"Signing secret"** section, click **"Reveal"**
3. Copy the secret (starts with `whsec_`)

### 4. Add Secret to Supabase

1. Go to: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/settings/functions
2. Scroll to **"Secrets"** section
3. Add a new secret:
   - **Name**: `STRIPE_WEBHOOK_SECRET`
   - **Value**: Paste the webhook signing secret from Stripe
4. Click **"Save"**

### 5. Disable JWT Verification (CRITICAL!)

1. Go to: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/functions
2. Click on `stripe-webhook`
3. Go to **Settings** tab
4. Find **"Verify JWT"** toggle
5. **Turn it OFF** (disable it)
6. Click **"Save"**

**Why?** Stripe webhooks use signature-based authentication, not JWT tokens. If JWT verification is enabled, all webhook calls will fail with 401 errors.

## Testing the Webhook

### Test in Stripe Dashboard

1. Go to your webhook in Stripe Dashboard
2. Click **"Send test webhook"**
3. Select `checkout.session.completed`
4. Click **"Send test webhook"**
5. Check the response:
   - ✅ Should return **200 OK**
   - ❌ If you see **401 Unauthorized**, JWT verification is still enabled

### Test with Real Checkout

1. In your app, start a subscription with test card `4242 4242 4242 4242`
2. Complete the checkout
3. Check Stripe Dashboard → Webhooks → Your webhook → Events
4. You should see a successful event delivery (200 response)
5. Check your app's Profile screen - should show Premium

### Check Webhook Logs

In Supabase Dashboard:

1. Go to: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/functions
2. Click on `stripe-webhook`
3. Go to **Logs** tab
4. Look for recent webhook calls
5. Successful logs should show:
   ```
   [Webhook] ✅ Checkout completed
   [Webhook] ✅ Subscription upserted successfully
   [Webhook] ✅ User type updated to: premium
   ```

## Webhook Events Explained

### checkout.session.completed
- **When**: User completes payment in Stripe Checkout
- **What it does**:
  - Creates/updates subscription record in database
  - Sets user_type to 'premium'
  - Stores subscription details (plan, dates, etc.)

### customer.subscription.created
- **When**: New subscription is created
- **What it does**: Similar to checkout.session.completed
- **Note**: Usually not needed if you handle checkout.session.completed

### customer.subscription.updated
- **When**: Subscription changes (renewal, plan change, etc.)
- **What it does**:
  - Updates subscription status in database
  - Updates user_type based on new status
  - Updates billing dates

### customer.subscription.deleted
- **When**: Subscription is canceled or expires
- **What it does**:
  - Sets subscription status to 'canceled'
  - Sets user_type back to 'free'
  - Locks premium features

## Troubleshooting

### Webhook Returns 401 Unauthorized

**Cause**: JWT verification is enabled on the Edge Function

**Solution**: 
1. Go to Supabase Dashboard → Functions → stripe-webhook → Settings
2. Disable "Verify JWT"
3. Save changes

### Webhook Returns 400 Bad Request

**Cause**: Webhook signature verification failed

**Solution**:
1. Check that `STRIPE_WEBHOOK_SECRET` is set correctly in Supabase
2. Make sure you copied the correct secret from Stripe
3. Verify the secret starts with `whsec_`

### Webhook Returns 500 Internal Server Error

**Cause**: Error in the webhook function code

**Solution**:
1. Check Edge Function logs for error details
2. Verify all environment variables are set:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

### Events Not Being Received

**Cause**: Webhook not configured correctly in Stripe

**Solution**:
1. Verify webhook URL is correct
2. Check that events are selected
3. Make sure webhook is enabled (not disabled)
4. Try sending a test webhook from Stripe Dashboard

### Database Not Updating

**Cause**: Webhook is receiving events but failing to update database

**Solution**:
1. Check Edge Function logs for database errors
2. Verify RLS policies allow service role to update tables
3. Check that user_id in metadata matches a real user

## Security Notes

### Webhook Signature Verification

The webhook function verifies that requests come from Stripe by:
1. Checking the `Stripe-Signature` header
2. Using the webhook signing secret to verify the signature
3. Rejecting requests with invalid signatures

This is why JWT verification must be disabled - Stripe uses its own authentication method.

### Environment Variables

Keep these secrets secure:
- `STRIPE_SECRET_KEY` - Your Stripe API secret key
- `STRIPE_WEBHOOK_SECRET` - Webhook signing secret
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase admin key

Never commit these to version control or share them publicly.

## Monitoring

### Check Webhook Health

Regularly monitor:
1. **Stripe Dashboard** → Webhooks → Your webhook
   - Check success rate
   - Look for failed deliveries
   - Review event logs

2. **Supabase Dashboard** → Functions → stripe-webhook → Logs
   - Check for errors
   - Verify successful updates
   - Monitor response times

### Set Up Alerts

Consider setting up alerts for:
- Webhook failures (multiple 4xx or 5xx responses)
- Database update errors
- Missing metadata in events

## Production Checklist

Before going live:

- [ ] Test mode webhook working correctly
- [ ] All test subscriptions updating database
- [ ] Profile showing correct status
- [ ] Premium features unlocking properly
- [ ] JWT verification disabled on webhook
- [ ] All environment variables set
- [ ] Webhook signing secret configured
- [ ] Live mode webhook configured (when ready)
- [ ] Monitoring set up
- [ ] Error handling tested

## Summary

The webhook is the bridge between Stripe and your app. When configured correctly:

1. User completes checkout in Stripe
2. Stripe sends event to your webhook
3. Webhook updates database
4. App sees updated subscription status
5. Premium features unlock automatically

The most critical step is **disabling JWT verification** on the webhook function!
