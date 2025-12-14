
# Subscription System Checklist

## ✅ Completed

- [x] Updated `stripe-webhook` Edge Function to sync `users.user_type`
- [x] Created `sync-subscription` Edge Function for manual sync
- [x] Profile screen displays subscription status correctly
- [x] Profile screen has "Sync Subscription Status" button
- [x] Webhook handles `checkout.session.completed` event
- [x] Webhook handles `customer.subscription.updated` event
- [x] Webhook handles `customer.subscription.deleted` event
- [x] Subscription hook has `syncSubscription()` method
- [x] Real-time subscription updates configured
- [x] Documentation created

## ⚠️ Action Required

### 1. Disable JWT Verification on Webhook (CRITICAL!)

**Status:** ❌ Not Done

**Priority:** 🔴 HIGHEST

**Steps:**
1. Go to: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/functions
2. Click on `stripe-webhook`
3. Go to Settings tab
4. Disable "Verify JWT" toggle
5. Save changes

**Why:** Stripe webhooks use signature-based auth, not JWT. All webhook calls are currently failing with 401 errors.

**Impact:** Without this, subscriptions will NOT update automatically after checkout.

---

### 2. Configure Stripe Webhook

**Status:** ⚠️ Needs Verification

**Priority:** 🟡 HIGH

**Steps:**
1. Go to: https://dashboard.stripe.com/test/webhooks
2. Add endpoint: `https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/stripe-webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy webhook signing secret
5. Add to Supabase secrets as `STRIPE_WEBHOOK_SECRET`

**Verify:**
- [ ] Webhook endpoint exists in Stripe Dashboard
- [ ] Webhook URL is correct
- [ ] Events are selected
- [ ] Webhook signing secret is set in Supabase

---

### 3. Test the Full Flow

**Status:** ⏳ Pending (waiting for JWT verification to be disabled)

**Priority:** 🟢 MEDIUM

**Test Steps:**

1. **Start as Free User**
   - [ ] Open app
   - [ ] Go to Profile
   - [ ] Verify shows "Free" badge

2. **Subscribe**
   - [ ] Tap "Upgrade to Premium"
   - [ ] Select Monthly or Yearly plan
   - [ ] Use test card: `4242 4242 4242 4242`
   - [ ] Complete checkout

3. **Verify Subscription**
   - [ ] Return to app
   - [ ] Profile shows "⭐ Premium" badge
   - [ ] Subscription card shows "Active" status
   - [ ] Shows correct plan type (Monthly/Yearly)
   - [ ] Shows renewal date

4. **Verify Premium Access**
   - [ ] AI Meal Estimator works
   - [ ] No paywall appears for premium features

5. **Verify Webhook**
   - [ ] Check Edge Function logs
   - [ ] Should see 200 OK responses
   - [ ] Should see success messages in logs

6. **Test Manual Sync**
   - [ ] Tap "Sync Subscription Status" button
   - [ ] Should show success message
   - [ ] Profile updates correctly

---

## 🔍 Verification Queries

### Check Subscription in Database

```sql
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

**Expected Result:**
- `user_type`: `premium`
- `status`: `active`
- `plan_type`: `monthly` or `yearly`
- `stripe_subscription_id`: Should have a value
- `current_period_end`: Should be a future date

### Check Webhook Logs

**Location:** Supabase Dashboard → Functions → stripe-webhook → Logs

**Look for:**
```
[Webhook] ✅ Checkout completed
[Webhook] ✅ Subscription upserted successfully
[Webhook] ✅ User type updated to: premium
```

**Should NOT see:**
```
POST | 401 | stripe-webhook
```

---

## 📊 Current Status

### What's Working ✅

- Stripe checkout session creation
- Payment processing
- Test card payments
- Paywall UI
- Profile screen display
- Manual sync button
- Edge Functions deployed

### What's NOT Working ❌

- Automatic webhook processing (401 errors)
- Automatic subscription status updates
- Automatic user_type updates

### Root Cause 🔍

JWT verification is enabled on the webhook, causing all Stripe webhook calls to fail with 401 Unauthorized.

### Solution 🔧

Disable JWT verification on the `stripe-webhook` Edge Function in Supabase Dashboard.

---

## 🎯 Next Steps

1. **Immediate (Do Now):**
   - [ ] Disable JWT verification on webhook
   - [ ] Test with a subscription
   - [ ] Verify Profile shows Premium

2. **Short Term (Today):**
   - [ ] Verify webhook is configured in Stripe
   - [ ] Test on both mobile and web
   - [ ] Check all premium features work

3. **Before Production:**
   - [ ] Set up live mode webhook
   - [ ] Test with real payment methods
   - [ ] Set up monitoring/alerts
   - [ ] Document for team

---

## 🚨 Known Issues

### Issue: Webhook Returns 401

**Cause:** JWT verification enabled

**Status:** Known, documented

**Fix:** Disable JWT verification (see Action #1)

**Workaround:** Use "Sync Subscription Status" button

---

### Issue: Profile Shows Free After Payment

**Cause:** Webhook not processing events

**Status:** Will be fixed when JWT verification is disabled

**Fix:** Disable JWT verification

**Workaround:** Use "Sync Subscription Status" button

---

## 📝 Notes

- The webhook code is correct and ready to go
- The sync function works and can be used as a workaround
- The Profile screen correctly displays subscription status
- All database tables and columns are set up correctly
- The only blocker is JWT verification on the webhook

---

## 🎉 Success Criteria

The subscription system will be fully working when:

- [ ] Webhook returns 200 OK (not 401)
- [ ] After checkout, Profile automatically shows Premium
- [ ] `users.user_type` is automatically set to `premium`
- [ ] `subscriptions` table is automatically updated
- [ ] Premium features are automatically unlocked
- [ ] No manual sync needed

---

## 📚 Documentation

- **SUBSCRIPTION_FIX_IMPLEMENTATION.md** - Technical details
- **QUICK_FIX_SUBSCRIPTION.md** - Quick reference
- **STRIPE_WEBHOOK_SETUP.md** - Webhook setup guide
- **README_SUBSCRIPTION_FIX.md** - Overview
- **SUBSCRIPTION_CHECKLIST.md** - This file

---

## 🔗 Quick Links

- [Supabase Functions](https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/functions)
- [Stripe Webhooks](https://dashboard.stripe.com/test/webhooks)
- [Edge Function Logs](https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/functions/stripe-webhook/logs)
- [Database Editor](https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/editor)

---

**Last Updated:** 2025-01-31

**Status:** Ready for testing after JWT verification is disabled
