
# 🚨 URGENT: Disable JWT Verification for Stripe Webhook

## The Problem

Your Stripe webhook is returning **401 Unauthorized** errors because:

- Supabase Edge Functions have JWT verification **enabled by default**
- Stripe webhooks use **signature verification**, not JWT tokens
- The webhook code already implements signature verification correctly
- But Supabase rejects the request before the code even runs

## The Solution (2 minutes)

### Option 1: Supabase Dashboard (Recommended)

1. **Go to Edge Functions:**
   https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/functions

2. **Click on `stripe-webhook`**

3. **Find the JWT setting:**
   - Look for "Verify JWT" toggle
   - Or "Enforce JWT Verification" checkbox
   - Or in the "Settings" tab

4. **Disable it:**
   - Turn the toggle OFF
   - Or uncheck the checkbox
   - Save changes

5. **Test it:**
   - Go to Stripe Dashboard → Webhooks
   - Send a test event
   - Should now return 200 instead of 401

### Option 2: Supabase CLI (Alternative)

If you have the Supabase CLI installed:

```bash
# In your project directory
supabase functions deploy stripe-webhook --no-verify-jwt
```

## How to Verify It's Fixed

### 1. Check the Logs

Go to: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/functions/stripe-webhook/logs

**Before fix:**
```
POST | 401 | https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/stripe-webhook
```

**After fix:**
```
POST | 200 | https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/stripe-webhook
[Webhook] ✅ Signature verified
[Webhook] 📦 Event type: checkout.session.completed
[Webhook] ✅ Subscription upserted successfully
[Webhook] ✅ User type updated to: premium
```

### 2. Test with Stripe

1. Go to: https://dashboard.stripe.com/test/webhooks
2. Click on your webhook endpoint
3. Click "Send test webhook"
4. Select "checkout.session.completed"
5. Check the response - should be 200

### 3. Test in the App

1. Open the app
2. Go to Profile → Upgrade to Premium
3. Complete checkout with test card: `4242 4242 4242 4242`
4. Return to app
5. Profile should show "Premium" within 2-3 seconds

## Why This Matters

**Without this fix:**
- ❌ Webhook returns 401
- ❌ Database never updates
- ❌ User stays on "Free" plan
- ❌ Premium features don't unlock
- ❌ Manual sync is the only workaround

**With this fix:**
- ✅ Webhook returns 200
- ✅ Database updates automatically
- ✅ User becomes "Premium"
- ✅ Premium features unlock
- ✅ Everything works seamlessly

## Security Note

**Q: Is it safe to disable JWT verification?**

**A: YES, for webhooks!**

- Stripe webhooks use **signature verification** (more secure than JWT for webhooks)
- The webhook code verifies the `stripe-signature` header
- This is the **recommended approach** by both Stripe and Supabase
- JWT verification is meant for client-to-server requests, not webhook events

The webhook code already has this security:

```typescript
const signature = req.headers.get("stripe-signature");
if (!signature) {
  return new Response("No signature", { status: 400 });
}

// Verify the webhook signature
const event = await stripe.webhooks.constructEventAsync(
  body,
  signature,
  STRIPE_WEBHOOK_SECRET!,
  // ...
);
```

This is **more secure** than JWT for webhooks because:
- Each request has a unique signature
- Signatures expire after a few minutes
- Signatures are tied to the exact request body
- Replay attacks are prevented

## Still Having Issues?

### Check These:

1. **JWT verification is actually disabled:**
   - Go back to the Edge Function settings
   - Verify the toggle is OFF
   - Try deploying again if needed

2. **Webhook secret is correct:**
   - Go to: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/settings/functions
   - Check that `STRIPE_WEBHOOK_SECRET` is set
   - Should start with `whsec_`

3. **Webhook URL is correct in Stripe:**
   - Should be: `https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/stripe-webhook`
   - Check in: https://dashboard.stripe.com/test/webhooks

4. **Events are enabled:**
   - In Stripe webhook settings
   - Enable: `checkout.session.completed`
   - Enable: `customer.subscription.created`
   - Enable: `customer.subscription.updated`
   - Enable: `customer.subscription.deleted`

## Need Help?

If you're still seeing 401 errors after disabling JWT verification:

1. Check the Edge Function logs for detailed error messages
2. Verify the webhook secret matches between Stripe and Supabase
3. Try redeploying the Edge Function
4. Test with Stripe's webhook testing tool

---

**This is the ONLY manual step required to fix the subscription sync issue.**

Once JWT verification is disabled, everything else will work automatically! 🎉
