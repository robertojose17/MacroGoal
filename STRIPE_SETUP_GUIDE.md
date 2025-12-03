
# Stripe Subscription Setup Guide

This guide will walk you through setting up Stripe subscriptions for the Elite Macro Tracker app.

## 🎯 Overview

The app now includes a complete subscription system that:
- ✅ Restricts AI features (AI Meal Estimator) to subscribed users only
- ✅ Offers monthly and yearly subscription plans
- ✅ Provides a paywall screen for non-subscribed users
- ✅ Allows users to manage subscriptions via Stripe Customer Portal
- ✅ Automatically syncs subscription status via webhooks
- ✅ Stores subscription data securely in Supabase

## 📋 Prerequisites

1. A Stripe account (sign up at https://stripe.com)
2. Access to your Supabase project dashboard
3. The app code deployed and running

## 🚀 Step-by-Step Setup

### Step 1: Create Stripe Products and Prices

1. **Go to Stripe Dashboard (TEST MODE)**
   - Visit: https://dashboard.stripe.com/test/products
   - Make sure you're in TEST mode (toggle in top right)

2. **Create a Product**
   - Click "+ Add product"
   - Name: "Elite Macro Tracker Premium"
   - Description: "Access to AI-powered meal estimation and premium features"
   - Click "Add pricing"

3. **Create Monthly Price**
   - Pricing model: Standard pricing
   - Price: $9.99 USD
   - Billing period: Monthly
   - Click "Add price"
   - **Copy the Price ID** (starts with `price_`) - you'll need this!

4. **Create Yearly Price**
   - Click "Add another price" on the same product
   - Pricing model: Standard pricing
   - Price: $99.99 USD
   - Billing period: Yearly
   - Click "Add price"
   - **Copy the Price ID** (starts with `price_`) - you'll need this!

### Step 2: Get Your Stripe API Keys

1. **Get Secret Key**
   - Visit: https://dashboard.stripe.com/test/apikeys
   - Find "Secret key" section
   - Click "Reveal test key"
   - **Copy the key** (starts with `sk_test_`)

2. **Keep these keys safe** - you'll add them to Supabase in the next step

### Step 3: Configure Supabase Edge Functions

1. **Go to Supabase Dashboard**
   - Visit: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/settings/functions

2. **Add Environment Variables**
   Click "Add new secret" for each of these:

   ```
   STRIPE_SECRET_KEY = sk_test_YOUR_SECRET_KEY_HERE
   STRIPE_MONTHLY_PRICE_ID = price_YOUR_MONTHLY_PRICE_ID_HERE
   STRIPE_YEARLY_PRICE_ID = price_YOUR_YEARLY_PRICE_ID_HERE
   ```

   Replace the values with your actual keys from Steps 1 and 2.

### Step 4: Set Up Stripe Webhook

1. **Create Webhook Endpoint in Stripe**
   - Visit: https://dashboard.stripe.com/test/webhooks
   - Click "+ Add endpoint"
   - Endpoint URL: `https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/stripe-webhook`
   - Description: "Elite Macro Tracker Subscription Webhook"

2. **Select Events to Listen To**
   Select these events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

3. **Get Webhook Secret**
   - After creating the webhook, click on it
   - Click "Reveal" under "Signing secret"
   - **Copy the webhook secret** (starts with `whsec_`)

4. **Add Webhook Secret to Supabase**
   - Go back to Supabase Edge Functions settings
   - Add new secret:
     ```
     STRIPE_WEBHOOK_SECRET = whsec_YOUR_WEBHOOK_SECRET_HERE
     ```

### Step 5: Update App Configuration

1. **Open `utils/stripeConfig.ts`**

2. **Replace the placeholder Price IDs** with your actual Price IDs from Step 1:
   ```typescript
   export const STRIPE_CONFIG = {
     MONTHLY_PRICE_ID: 'price_YOUR_ACTUAL_MONTHLY_PRICE_ID',
     YEARLY_PRICE_ID: 'price_YOUR_ACTUAL_YEARLY_PRICE_ID',
     // ... rest of config
   };
   ```

3. **Save the file**

### Step 6: Configure Stripe Customer Portal (Optional but Recommended)

1. **Go to Customer Portal Settings**
   - Visit: https://dashboard.stripe.com/test/settings/billing/portal

2. **Configure Portal**
   - Enable "Allow customers to update their payment methods"
   - Enable "Allow customers to cancel subscriptions"
   - Set cancellation behavior (e.g., "Cancel at end of billing period")
   - Save changes

## 🧪 Testing the Subscription Flow

### Test Cards

Use these test card numbers in TEST mode:

- **Successful payment**: `4242 4242 4242 4242`
- **Payment requires authentication**: `4000 0025 0000 3155`
- **Payment is declined**: `4000 0000 0000 9995`

For all test cards:
- Use any future expiration date (e.g., 12/34)
- Use any 3-digit CVC (e.g., 123)
- Use any ZIP code (e.g., 12345)

### Testing Steps

1. **Test Paywall Access**
   - Open the app
   - Try to access AI Meal Estimator
   - Should see paywall screen

2. **Test Subscription Purchase**
   - Select a plan (monthly or yearly)
   - Click "Subscribe Now"
   - Complete checkout with test card `4242 4242 4242 4242`
   - Should redirect back to app

3. **Test AI Feature Access**
   - After subscribing, try AI Meal Estimator again
   - Should now have access

4. **Test Subscription Management**
   - Go to Profile tab
   - Should see "Active" subscription badge
   - Click "Manage Subscription"
   - Should open Stripe Customer Portal
   - Try canceling subscription

5. **Test Webhook Sync**
   - Make changes in Stripe Dashboard (e.g., cancel subscription)
   - Check that app reflects changes within a few seconds

## 🔍 Troubleshooting

### Subscription Not Showing as Active

1. Check Supabase logs:
   - Go to: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/logs/edge-functions
   - Look for errors in `stripe-webhook` function

2. Check Stripe webhook deliveries:
   - Go to: https://dashboard.stripe.com/test/webhooks
   - Click on your webhook
   - Check "Recent deliveries" for errors

3. Verify environment variables are set correctly in Supabase

### Checkout Not Opening

1. Verify Price IDs in `utils/stripeConfig.ts` match your Stripe dashboard
2. Check browser console for errors
3. Verify `STRIPE_SECRET_KEY` is set in Supabase Edge Functions

### Webhook Errors

1. Verify webhook URL is correct: `https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/stripe-webhook`
2. Verify `STRIPE_WEBHOOK_SECRET` is set correctly
3. Check that all required events are selected in webhook configuration

## 📱 Mobile Testing

The subscription flow works on both iOS and Android:

1. **iOS**: Opens Stripe Checkout in Safari
2. **Android**: Opens Stripe Checkout in Chrome
3. **Web**: Opens Stripe Checkout in new tab

After completing checkout, users are redirected back to the app.

## 🔐 Security Notes

- ✅ All Stripe API calls are made from secure Supabase Edge Functions
- ✅ Webhook signatures are verified to prevent tampering
- ✅ Subscription data is protected by Row Level Security (RLS)
- ✅ Users can only view/modify their own subscription
- ✅ Never expose Stripe Secret Key in client-side code

## 🚀 Going Live (Production)

When ready to accept real payments:

1. **Switch to Live Mode in Stripe**
   - Toggle from TEST to LIVE mode in Stripe Dashboard

2. **Create Live Products and Prices**
   - Repeat Step 1 in LIVE mode
   - Get new LIVE Price IDs

3. **Get Live API Keys**
   - Get LIVE Secret Key from https://dashboard.stripe.com/apikeys
   - Create LIVE webhook and get signing secret

4. **Update Supabase Environment Variables**
   - Replace TEST keys with LIVE keys
   - Update Price IDs to LIVE Price IDs

5. **Update App Configuration**
   - Update `utils/stripeConfig.ts` with LIVE Price IDs

6. **Test Thoroughly**
   - Test with real card (will charge real money!)
   - Verify webhooks work correctly
   - Test subscription management

## 📞 Support

If you encounter issues:

1. Check Supabase Edge Function logs
2. Check Stripe webhook delivery logs
3. Review this guide carefully
4. Check Stripe documentation: https://stripe.com/docs

## ✅ Checklist

Before launching:

- [ ] Stripe products and prices created
- [ ] Stripe API keys added to Supabase
- [ ] Webhook endpoint created and configured
- [ ] Webhook secret added to Supabase
- [ ] Price IDs updated in `utils/stripeConfig.ts`
- [ ] Tested subscription purchase flow
- [ ] Tested AI feature access control
- [ ] Tested subscription management
- [ ] Tested webhook synchronization
- [ ] Tested on iOS device
- [ ] Tested on Android device
- [ ] Customer Portal configured

---

**Note**: This setup uses Stripe TEST mode. No real charges will be made until you switch to LIVE mode.
