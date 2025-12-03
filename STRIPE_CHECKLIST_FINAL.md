
# ✅ Stripe Subscription - Final Checklist

## 🎯 Current Status

**Code:** ✅ Complete and deployed
**Configuration:** ⚠️ Needs manual JWT verification disable

## 📋 Pre-Flight Checklist

### Supabase Configuration

- [ ] **JWT Verification Disabled** (CRITICAL!)
  - Go to: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/functions
  - Click `stripe-webhook`
  - Disable "Verify JWT"
  - This is the ONLY thing preventing it from working!

- [ ] **Environment Variables Set**
  - Go to: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/settings/functions
  - Verify these are set:
    - `STRIPE_SECRET_KEY` (starts with `sk_test_`)
    - `STRIPE_WEBHOOK_SECRET` (starts with `whsec_`)
    - `SUPABASE_URL`
    - `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Edge Functions Deployed**
  - `stripe-webhook` (v16) ✅
  - `create-checkout-session` (v13) ✅
  - `create-portal-session` ✅
  - `sync-subscription` (v1) ✅

### Stripe Configuration

- [ ] **Webhook Endpoint Created**
  - URL: `https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/stripe-webhook`
  - Status: Active
  - Mode: Test

- [ ] **Webhook Events Enabled**
  - `checkout.session.completed` ✅
  - `customer.subscription.created` ✅
  - `customer.subscription.updated` ✅
  - `customer.subscription.deleted` ✅

- [ ] **Price IDs Configured**
  - Monthly: `price_1SZSojDsUf4JA97FuIWfvUfX` ✅
  - Yearly: `price_1SZSnyDsUf4JA97Fd7R9BMkD` ✅
  - Both start with `price_` (not `prod_`) ✅

- [ ] **Test Mode Enabled**
  - Using test API keys
  - Using test price IDs
  - Webhook in test mode

### Database Schema

- [ ] **Tables Exist**
  - `users` table with `user_type` column ✅
  - `subscriptions` table with all required columns ✅

- [ ] **RLS Policies**
  - Users can read their own subscription ✅
  - Service role can update subscriptions ✅

## 🧪 Testing Checklist

### 1. Webhook Test (Do This First!)

- [ ] Go to Stripe Dashboard → Webhooks
- [ ] Click on your webhook endpoint
- [ ] Click "Send test webhook"
- [ ] Select "checkout.session.completed"
- [ ] **Verify response is 200** (not 401!)
- [ ] Check Supabase logs for success messages

**If you see 401:** JWT verification is still enabled!

### 2. Full Flow Test

- [ ] Open app and log in
- [ ] Go to Profile screen
- [ ] Verify shows "Free" plan
- [ ] Tap "Upgrade to Premium"
- [ ] Select a plan
- [ ] Tap "Subscribe Now"
- [ ] Complete checkout with `4242 4242 4242 4242`
- [ ] Return to app
- [ ] Wait 2-3 seconds
- [ ] **Verify Profile shows "Premium"**

### 3. Database Verification

```sql
-- Run this in Supabase SQL Editor
SELECT 
  u.email,
  u.user_type,
  s.status,
  s.stripe_subscription_id,
  s.plan_type,
  s.created_at,
  s.updated_at
FROM users u
LEFT JOIN subscriptions s ON u.id = s.user_id
ORDER BY s.updated_at DESC
LIMIT 5;
```

Expected after successful subscription:
- `user_type` = `'premium'`
- `status` = `'active'`
- `stripe_subscription_id` = `'sub_...'`
- `plan_type` = `'monthly'` or `'yearly'`

### 4. Feature Access Test

- [ ] Go to Home screen
- [ ] Tap AI Meal Estimator
- [ ] **Should work without showing paywall**
- [ ] Verify ingredient breakdown shows
- [ ] Verify can adjust portions

### 5. Subscription Management Test

- [ ] Go to Profile screen
- [ ] Tap "Manage Subscription"
- [ ] Stripe portal opens
- [ ] Can view subscription details
- [ ] Can cancel subscription (test only!)
- [ ] Return to app
- [ ] Profile updates to show cancellation

## 🐛 Troubleshooting Guide

### Problem: Webhook returns 401

**Cause:** JWT verification is enabled

**Solution:**
1. Go to Supabase Dashboard → Functions
2. Click `stripe-webhook`
3. Disable "Verify JWT"
4. Test again

### Problem: Webhook returns 200 but database not updated

**Possible causes:**
- User ID not in metadata
- Database permissions issue
- Subscription ID not found

**Debug:**
1. Check webhook logs for error messages
2. Verify metadata includes `supabase_user_id`
3. Check database permissions

### Problem: Profile still shows "Free"

**Possible causes:**
- Webhook didn't run
- Database not updated
- App not refreshing

**Debug:**
1. Check webhook logs
2. Run SQL query to check database
3. Pull-to-refresh on Profile screen
4. Check real-time listener is working

### Problem: "No checkout URL returned"

**Possible causes:**
- Price ID is wrong
- Stripe API key is wrong
- Edge Function error

**Debug:**
1. Verify Price IDs in `stripeConfig.ts`
2. Check Edge Function logs
3. Verify Stripe API key is set

## 📊 Success Indicators

### Webhook Logs Should Show:

```
[Webhook] 📥 Received webhook
[Webhook] ✅ Signature verified
[Webhook] 📦 Event type: checkout.session.completed
[Webhook] 👤 User ID: [uuid]
[Webhook] 📋 Plan Type: monthly
[Webhook] 💳 Customer ID: cus_...
[Webhook] 🔑 Subscription ID: sub_...
[Webhook] 💾 Upserting subscription
[Webhook] ✅ Subscription upserted successfully
[Webhook] 🔄 Updating user_type to: premium
[Webhook] ✅ User type updated to: premium
```

### App Logs Should Show:

```
[useSubscription] 💳 Creating checkout session
[useSubscription] ✅ User authenticated
[useSubscription] 🚀 Calling Edge Function: create-checkout-session
[useSubscription] ✅ Edge Function response
[useSubscription] 🌐 Opening checkout URL
[useSubscription] 📱 WebBrowser result: dismiss
[useSubscription] 🔄 Browser closed, syncing subscription...
[useSubscription] ✅ Subscription synced
[Profile] 🔔 Subscription changed
[Profile] User type: premium
```

## 🎉 When Everything Works

You'll know it's working when:

1. ✅ Webhook logs show 200 status
2. ✅ Database shows `user_type = 'premium'`
3. ✅ Profile screen shows "Premium" badge
4. ✅ AI features work without paywall
5. ✅ No manual sync needed
6. ✅ Updates happen automatically

## 📞 Support

If you're still having issues after following this checklist:

1. Check all logs (webhook, Edge Functions, app console)
2. Verify JWT verification is actually disabled
3. Test webhook directly from Stripe dashboard
4. Check database directly with SQL query
5. Review the detailed guides:
   - `SUBSCRIPTION_FIX_COMPLETE.md`
   - `STRIPE_WEBHOOK_JWT_FIX.md`
   - `READY_TO_TEST_SUBSCRIPTIONS.md`

---

## 🚀 Quick Start

**The fastest way to get this working:**

1. Disable JWT verification for `stripe-webhook` (2 minutes)
2. Send test webhook from Stripe dashboard (30 seconds)
3. Verify logs show 200 status (30 seconds)
4. Test full flow in app (2 minutes)

**Total time: ~5 minutes**

---

**Last Updated:** January 31, 2025
**Status:** Ready to test after JWT verification disable
