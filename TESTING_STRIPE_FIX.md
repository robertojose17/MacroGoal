
# 🧪 Testing Guide: Stripe NOT_FOUND Fix

## Quick Test Checklist

### ✅ Pre-Test Setup
- [ ] App is running on a physical device or simulator
- [ ] You're logged into a test account
- [ ] Stripe is in **test mode**
- [ ] You have the test card number ready: `4242 4242 4242 4242`

---

## 🎯 Test Scenario 1: Monthly Subscription

### Steps:
1. Open the app
2. Navigate to **Profile** tab
3. Tap **"Go Premium"** or **"Upgrade to Premium"**
4. Select **Monthly Plan** ($9.99/month)
5. Tap **"Subscribe Now"**
6. Wait for Stripe Checkout to open
7. Fill in payment details:
   - **Card Number:** `4242 4242 4242 4242`
   - **Expiry:** Any future date (e.g., `12/25`)
   - **CVC:** Any 3 digits (e.g., `123`)
   - **Name:** Any name
   - **Email:** Your test email
8. Tap **"Subscribe"**
9. Wait for payment to process

### ✅ Expected Results:
- [ ] Stripe shows green checkmark ✅
- [ ] Browser/WebView redirects to a page with "Payment Successful!" message
- [ ] Page shows "Returning to the app..." with a spinner
- [ ] App automatically returns to Profile screen (within 3 seconds)
- [ ] Profile shows **"Premium"** instead of "Free"
- [ ] Subscription details show **"Monthly"** plan
- [ ] **NO** NOT_FOUND error appears
- [ ] **NO** JSON error message appears

---

## 🎯 Test Scenario 2: Yearly Subscription

### Steps:
1. If you just completed Test 1, cancel the subscription first:
   - Go to Profile → Tap "Manage Subscription"
   - Cancel the subscription in Stripe portal
   - Wait a moment for sync
2. Repeat Test 1 steps, but select **Yearly Plan** ($99.99/year)

### ✅ Expected Results:
- Same as Test 1, but:
- [ ] Subscription details show **"Yearly"** plan
- [ ] Savings badge shows "Save 17%"

---

## 🎯 Test Scenario 3: Cancelled Checkout

### Steps:
1. Navigate to Paywall
2. Select any plan
3. Tap "Subscribe Now"
4. When Stripe Checkout opens, tap **"Close"** or **"Cancel"**

### ✅ Expected Results:
- [ ] Returns to Paywall screen
- [ ] No error messages
- [ ] Profile still shows "Free"

---

## 🎯 Test Scenario 4: Premium Features

After successfully subscribing (Test 1 or 2):

### Steps:
1. Navigate to **Home** tab
2. Tap **"AI Meal Estimator"** (or any premium feature)
3. Describe a meal (e.g., "chicken breast with rice and broccoli")
4. Tap **"Estimate"**

### ✅ Expected Results:
- [ ] **NO** paywall appears
- [ ] AI estimation works immediately
- [ ] Results show ingredient breakdown
- [ ] Can adjust portions
- [ ] Can log individual ingredients

---

## 🚨 What to Check If Something Goes Wrong

### If you see NOT_FOUND error:
1. Check the URL in the error - does it contain `esgptfiofoaeguslgvcq`?
2. Check Edge Function logs:
   - Go to: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/logs/edge-functions
   - Filter by: `create-checkout-session`
   - Look for the "Using project URL" log message
3. Verify the `checkout-redirect` function is deployed:
   - Go to: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/functions
   - Confirm `checkout-redirect` is listed and active

### If Premium doesn't unlock:
1. Check the `sync-subscription` logs
2. Verify the webhook is receiving events:
   - Go to: https://dashboard.stripe.com/test/webhooks
   - Check recent events
3. Manually trigger sync:
   - Force close the app
   - Reopen the app
   - Navigate to Profile (should auto-sync)

### If deep link doesn't work:
1. Check the app scheme is configured: `elitemacrotracker://`
2. Verify `app/_layout.tsx` has deep link handling
3. Try manually opening the deep link:
   ```
   elitemacrotracker://profile?subscription_success=true
   ```

---

## 📊 Success Criteria

The fix is working correctly if:

✅ **No NOT_FOUND errors appear**
✅ **Checkout redirects back to app automatically**
✅ **Premium unlocks within 3 seconds of payment**
✅ **Profile shows correct subscription plan**
✅ **Premium features work without paywall**

---

## 🔍 Debugging Commands

### Check Stripe Customer:
```bash
# In Stripe Dashboard
1. Go to: https://dashboard.stripe.com/test/customers
2. Search for your test email
3. Verify customer has active subscription
```

### Check Supabase Database:
```sql
-- Check user subscription
SELECT * FROM subscriptions WHERE user_id = '<your-user-id>';

-- Check user type
SELECT id, email, user_type FROM users WHERE id = '<your-user-id>';

-- Check customer mapping
SELECT * FROM user_stripe_customers WHERE user_id = '<your-user-id>';
```

### Check Edge Function Logs:
1. Go to: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/logs/edge-functions
2. Filter by function name
3. Look for error messages or warnings

---

## 📞 Need Help?

If tests fail:
1. Check the Edge Function logs first
2. Verify Stripe webhook is receiving events
3. Ensure environment variables are set correctly
4. Try the manual sync command in the app

**The fix should work immediately - no app rebuild required!** 🚀
