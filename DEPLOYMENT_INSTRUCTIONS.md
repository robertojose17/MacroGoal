
# Deployment Instructions - Fix Stripe Checkout Redirect

## Quick Summary

The NOT_FOUND error after Stripe payment has been fixed by disabling JWT verification for the `checkout-redirect` and `stripe-webhook` Edge Functions. You just need to deploy the updated configuration.

## Prerequisites

Make sure you have:
- ✅ Supabase CLI installed (`npm install -g supabase`)
- ✅ Logged in to Supabase CLI (`supabase login`)
- ✅ Linked to your project (`supabase link --project-ref esgptfiofoaeguslgvcq`)

## Step 1: Deploy Edge Functions

Deploy the Edge Functions with the updated configuration:

```bash
# Deploy checkout-redirect function
supabase functions deploy checkout-redirect

# Deploy stripe-webhook function (optional, but recommended)
supabase functions deploy stripe-webhook
```

**What this does:**
- Reads the `supabase/config.toml` file
- Applies the `verify_jwt = false` setting
- Deploys the functions with the new configuration

## Step 2: Verify Deployment

Check that the functions are deployed correctly:

```bash
# List all functions
supabase functions list

# Check checkout-redirect logs
supabase functions logs checkout-redirect --tail
```

You should see the functions listed with status "ACTIVE".

## Step 3: Test the Payment Flow

### Test with Stripe Test Mode

1. **Open the app** and go to Profile
2. **Click "Upgrade to Premium"**
3. **Select a plan** (Monthly or Yearly)
4. **Click "Subscribe Now"**
5. **Use Stripe test card:**
   ```
   Card Number: 4242 4242 4242 4242
   Expiry: 12/34 (any future date)
   CVC: 123 (any 3 digits)
   ZIP: 12345 (any 5 digits)
   ```
6. **Complete the payment**

### Expected Results

✅ **Success Page:**
- Browser shows "Payment Successful! 🎉"
- "Returning to the app..." message
- Automatic redirect to the app

✅ **App Updates:**
- Profile screen shows "⭐ Premium" badge
- Subscription card shows "Active" status
- Plan type is displayed (Monthly or Yearly)
- Renewal date is shown

✅ **AI Features Unlocked:**
- AI Meal Estimator is accessible
- No paywall when trying to use AI features

### If Something Goes Wrong

**Still seeing NOT_FOUND error?**
```bash
# Redeploy the function
supabase functions deploy checkout-redirect

# Check the logs
supabase functions logs checkout-redirect --tail
```

**App doesn't open after payment?**
- Check that the deep link scheme is configured in `app.json`
- Verify the scheme is `elitemacrotracker`
- Test the deep link manually:
  ```bash
  # iOS Simulator
  xcrun simctl openurl booted "elitemacrotracker://profile"
  
  # Android
  adb shell am start -W -a android.intent.action.VIEW -d "elitemacrotracker://profile"
  ```

**Subscription doesn't update?**
- Pull down to refresh on Profile screen
- Check webhook logs in Stripe Dashboard
- Verify webhook secret is set in Supabase Edge Function secrets
- Manually sync: restart the app

## Step 4: Monitor Logs

After testing, check the logs to ensure everything is working:

```bash
# View checkout-redirect logs
supabase functions logs checkout-redirect

# View stripe-webhook logs
supabase functions logs stripe-webhook

# View create-checkout-session logs
supabase functions logs create-checkout-session
```

### What to Look For

**✅ Good Logs (checkout-redirect):**
```
[CheckoutRedirect] ✅ Checkout successful, redirecting to app...
[CheckoutRedirect] 🔗 Deep link URL: elitemacrotracker://profile?subscription_success=true&session_id=...
```

**✅ Good Logs (stripe-webhook):**
```
[Webhook] ✅ Signature verified
[Webhook] 📦 Event type: checkout.session.completed
[Webhook] ✅ Found user_id in metadata: ...
[Webhook] ✅ Subscription upserted successfully
[Webhook] ✅ User type updated to: premium
```

**❌ Bad Logs:**
```
404 NOT_FOUND
401 Unauthorized
Could not resolve user_id
```

## Step 5: Production Checklist

Before going to production:

- [ ] Test with multiple test cards
- [ ] Test both Monthly and Yearly plans
- [ ] Test cancellation flow
- [ ] Test subscription management portal
- [ ] Verify webhook is configured in Stripe Dashboard
- [ ] Verify webhook secret is correct
- [ ] Test on both iOS and Android
- [ ] Test deep linking on physical devices
- [ ] Check all logs for errors
- [ ] Verify RLS policies are correct

## Configuration Files Modified

1. **`supabase/config.toml`**
   - Added `[functions.checkout-redirect]` section
   - Set `verify_jwt = false`
   - Added `[functions.stripe-webhook]` section
   - Set `verify_jwt = false`

## Technical Details

### Why JWT Verification Was Disabled

**Before:**
- `checkout-redirect` required JWT token
- Stripe browser redirect had no JWT token
- Result: 404 NOT_FOUND error

**After:**
- `checkout-redirect` accepts requests without JWT
- Stripe browser redirect works
- Result: Success page and deep link to app

### Security Considerations

**Is it safe to disable JWT verification?**

✅ **Yes, for these specific functions:**

1. **`checkout-redirect`:**
   - Only returns HTML with a deep link
   - Doesn't expose sensitive data
   - Doesn't perform database operations
   - Uses query parameters for routing

2. **`stripe-webhook`:**
   - Verifies webhook signature from Stripe
   - Uses Stripe's webhook secret for authentication
   - Doesn't rely on JWT for security
   - Standard practice for webhook endpoints

**What's still protected:**
- All other Edge Functions require JWT
- Database has Row Level Security (RLS)
- Subscription validation happens in webhook
- User authentication is still required for app features

## Troubleshooting

### Common Issues

**Issue: Function not found after deployment**
```bash
# Solution: Wait a few seconds and try again
sleep 5
supabase functions list
```

**Issue: Configuration not applied**
```bash
# Solution: Redeploy the function
supabase functions deploy checkout-redirect --no-verify-jwt
```

**Issue: Webhook not receiving events**
```bash
# Solution: Check webhook configuration in Stripe Dashboard
# 1. Go to Stripe Dashboard > Developers > Webhooks
# 2. Verify the endpoint URL is correct
# 3. Verify the webhook secret matches your Edge Function secret
# 4. Check the webhook logs in Stripe Dashboard
```

**Issue: Deep link not working**
```bash
# Solution: Check app.json configuration
# Verify the scheme is set correctly:
{
  "expo": {
    "scheme": "elitemacrotracker"
  }
}
```

## Support

If you encounter any issues:

1. **Check the logs** first (see Step 4)
2. **Review the error messages** in the console
3. **Verify all environment variables** are set correctly
4. **Test with Stripe test mode** before going to production
5. **Check Stripe Dashboard** for webhook events and logs

## Success Criteria

✅ **Deployment Successful:**
- Functions are listed as "ACTIVE"
- No errors in deployment logs
- Configuration is applied

✅ **Payment Flow Working:**
- No NOT_FOUND error
- Success page displays
- App opens automatically
- Subscription updates

✅ **Premium Features Unlocked:**
- Profile shows Premium badge
- AI features are accessible
- Subscription details are correct

---

**Status:** Ready to deploy! 🚀

Run the deployment commands above and test the payment flow.
