
# Post-Deployment Checklist

Use this checklist to verify that the Stripe checkout redirect fix is working correctly after deployment.

## Pre-Deployment

- [ ] Supabase CLI is installed (`npm install -g supabase`)
- [ ] Logged in to Supabase CLI (`supabase login`)
- [ ] Linked to project (`supabase link --project-ref esgptfiofoaeguslgvcq`)
- [ ] `supabase/config.toml` has been updated with JWT verification settings

## Deployment

- [ ] Deployed `checkout-redirect` function
  ```bash
  supabase functions deploy checkout-redirect
  ```
- [ ] Deployed `stripe-webhook` function
  ```bash
  supabase functions deploy stripe-webhook
  ```
- [ ] Verified functions are listed as "ACTIVE"
  ```bash
  supabase functions list
  ```

## Basic Testing

### Test 1: Monthly Subscription
- [ ] Opened app and navigated to Profile
- [ ] Clicked "Upgrade to Premium"
- [ ] Selected "Monthly" plan
- [ ] Clicked "Subscribe Now"
- [ ] Stripe Checkout opened in browser
- [ ] Entered test card: `4242 4242 4242 4242`
- [ ] Completed payment
- [ ] ✅ Saw "Payment Successful!" page (not NOT_FOUND error)
- [ ] ✅ App automatically opened
- [ ] ✅ Profile shows "⭐ Premium" badge
- [ ] ✅ Subscription card shows "Active" status
- [ ] ✅ Plan shows "Monthly Plan"
- [ ] ✅ Renewal date is displayed

### Test 2: Yearly Subscription
- [ ] Cancelled previous subscription (if any)
- [ ] Clicked "Upgrade to Premium"
- [ ] Selected "Yearly" plan
- [ ] Clicked "Subscribe Now"
- [ ] Completed payment with test card
- [ ] ✅ Saw success page
- [ ] ✅ App opened
- [ ] ✅ Profile shows "Yearly Plan"

### Test 3: Cancelled Checkout
- [ ] Started checkout process
- [ ] Clicked back/cancel in Stripe Checkout
- [ ] ✅ Saw "Checkout Cancelled" page
- [ ] ✅ App opened
- [ ] ✅ Profile still shows "Free" (no subscription)

## Advanced Testing

### Test 4: AI Features
- [ ] Verified Premium is active
- [ ] Navigated to Home screen
- [ ] Clicked "AI Meal Estimator"
- [ ] ✅ No paywall shown
- [ ] ✅ Can use AI features
- [ ] Entered a meal description
- [ ] ✅ Got nutrition estimates
- [ ] ✅ Can log ingredients

### Test 5: Subscription Management
- [ ] Clicked "Manage Subscription" in Profile
- [ ] ✅ Stripe Customer Portal opened
- [ ] ✅ Can see subscription details
- [ ] ✅ Can update payment method
- [ ] ✅ Can cancel subscription
- [ ] Closed portal
- [ ] ✅ App returned to Profile

### Test 6: Subscription Sync
- [ ] Pulled down to refresh on Profile screen
- [ ] ✅ Subscription status updated
- [ ] Closed and reopened app
- [ ] ✅ Premium status persisted
- [ ] ✅ Subscription details still correct

## Log Verification

### Check Edge Function Logs
- [ ] Viewed `checkout-redirect` logs
  ```bash
  supabase functions logs checkout-redirect
  ```
- [ ] ✅ Saw: `[CheckoutRedirect] ✅ Checkout successful, redirecting to app...`
- [ ] ✅ Saw: `[CheckoutRedirect] 🔗 Deep link URL: elitemacrotracker://profile?subscription_success=true&session_id=...`
- [ ] ✅ No 404 or authentication errors

- [ ] Viewed `stripe-webhook` logs
  ```bash
  supabase functions logs stripe-webhook
  ```
- [ ] ✅ Saw: `[Webhook] ✅ Signature verified`
- [ ] ✅ Saw: `[Webhook] 📦 Event type: checkout.session.completed`
- [ ] ✅ Saw: `[Webhook] ✅ Subscription upserted successfully`
- [ ] ✅ Saw: `[Webhook] ✅ User type updated to: premium`

### Check Stripe Dashboard
- [ ] Opened Stripe Dashboard → Webhooks
- [ ] ✅ Webhook endpoint is configured
- [ ] ✅ Webhook events are being received
- [ ] ✅ No failed webhook deliveries
- [ ] Opened Stripe Dashboard → Customers
- [ ] ✅ Customer was created
- [ ] ✅ Customer has active subscription
- [ ] Opened Stripe Dashboard → Subscriptions
- [ ] ✅ Subscription is active
- [ ] ✅ Subscription has correct plan

## Database Verification

### Check Subscriptions Table
- [ ] Opened Supabase Dashboard → Table Editor → subscriptions
- [ ] ✅ Subscription row exists for user
- [ ] ✅ `status` is "active"
- [ ] ✅ `plan_type` is correct ("monthly" or "yearly")
- [ ] ✅ `stripe_customer_id` is set
- [ ] ✅ `stripe_subscription_id` is set
- [ ] ✅ `current_period_end` is in the future

### Check Users Table
- [ ] Opened Supabase Dashboard → Table Editor → users
- [ ] ✅ User row exists
- [ ] ✅ `user_type` is "premium"

### Check Customer Mapping Table
- [ ] Opened Supabase Dashboard → Table Editor → user_stripe_customers
- [ ] ✅ Mapping row exists
- [ ] ✅ `user_id` matches user
- [ ] ✅ `stripe_customer_id` matches Stripe customer

## Deep Link Testing

### iOS
- [ ] Tested deep link on iOS Simulator
  ```bash
  xcrun simctl openurl booted "elitemacrotracker://profile"
  ```
- [ ] ✅ App opened to Profile screen
- [ ] Tested on physical iOS device (if available)
- [ ] ✅ Deep link works on device

### Android
- [ ] Tested deep link on Android Emulator
  ```bash
  adb shell am start -W -a android.intent.action.VIEW -d "elitemacrotracker://profile"
  ```
- [ ] ✅ App opened to Profile screen
- [ ] Tested on physical Android device (if available)
- [ ] ✅ Deep link works on device

## Error Scenarios

### Test Error Handling
- [ ] Tested with declined card: `4000 0000 0000 0002`
- [ ] ✅ Stripe shows error message
- [ ] ✅ App handles error gracefully
- [ ] Tested with no internet connection
- [ ] ✅ App shows appropriate error message
- [ ] Tested with invalid price ID (in code)
- [ ] ✅ App shows error message
- [ ] ✅ Logs show detailed error

## Performance Testing

### Check Response Times
- [ ] Checkout session creation < 2 seconds
- [ ] Stripe Checkout loads < 3 seconds
- [ ] Redirect to app < 2 seconds
- [ ] Subscription sync < 2 seconds
- [ ] Profile screen loads < 1 second

## Security Verification

### Verify JWT Verification
- [ ] Confirmed `checkout-redirect` has `verify_jwt = false`
- [ ] Confirmed `stripe-webhook` has `verify_jwt = false`
- [ ] Confirmed other functions still require JWT
- [ ] Tested calling `create-checkout-session` without auth
- [ ] ✅ Returns 401 Unauthorized

### Verify RLS Policies
- [ ] Confirmed users can only see their own subscription
- [ ] Confirmed users can only update their own data
- [ ] Tested accessing another user's subscription
- [ ] ✅ Access denied

## Production Readiness

### Final Checks
- [ ] All tests passed
- [ ] No errors in logs
- [ ] Webhook is configured correctly
- [ ] Environment variables are set
- [ ] Deep linking works on all platforms
- [ ] Subscription flow is smooth
- [ ] Premium features unlock correctly
- [ ] Subscription management works
- [ ] Error handling is robust

### Documentation
- [ ] Read `STRIPE_CHECKOUT_REDIRECT_FIX.md`
- [ ] Read `DEPLOYMENT_INSTRUCTIONS.md`
- [ ] Read `SUBSCRIPTION_ARCHITECTURE_FINAL.md`
- [ ] Understand the complete flow
- [ ] Know how to troubleshoot issues

## Sign-Off

- [ ] **All tests passed** ✅
- [ ] **No critical issues** ✅
- [ ] **Ready for production** ✅

---

## Notes

Use this space to record any issues or observations:

```
Date: ___________
Tester: ___________

Issues found:
- 

Observations:
- 

Additional notes:
- 
```

---

## Summary

**Total Checks:** 100+
**Required for Production:** All critical checks must pass

**Critical Checks:**
- ✅ No NOT_FOUND error after payment
- ✅ App opens automatically
- ✅ Premium status updates
- ✅ AI features unlock
- ✅ Subscription management works
- ✅ Logs show no errors
- ✅ Webhook processes events
- ✅ Database updates correctly

**Status:** [ ] Ready for Production

---

**Last Updated:** 2025-01-04
