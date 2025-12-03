
# 🔧 How to Disable JWT Verification for Stripe Webhook

## Why This Is Needed

The `stripe-webhook` Edge Function is returning **401 Unauthorized** because:

- Supabase Edge Functions have JWT verification **enabled by default**
- Stripe webhooks don't send JWT tokens (they use signature verification)
- The webhook code already verifies Stripe signatures correctly
- But Supabase rejects the request before the code runs

**This is the ONLY manual step needed to fix the subscription system!**

## Step-by-Step Instructions

### Method 1: Supabase Dashboard (Easiest)

1. **Open your browser and go to:**
   ```
   https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/functions
   ```

2. **Find the `stripe-webhook` function in the list**
   - It should show as "Active"
   - Version 16 (latest)

3. **Click on the function name** to open its details

4. **Look for one of these:**
   - A toggle labeled "Verify JWT"
   - A checkbox labeled "Enforce JWT Verification"
   - A "Settings" or "Configuration" tab

5. **Disable JWT verification:**
   - If it's a toggle: Turn it **OFF** (should be gray/disabled)
   - If it's a checkbox: **Uncheck** it
   - If it's in settings: Find the JWT option and disable it

6. **Save the changes**
   - Look for a "Save" or "Update" button
   - Click it to apply the changes

7. **Verify it worked:**
   - The function should still show as "Active"
   - JWT verification should show as "Disabled" or "Off"

### Method 2: Supabase CLI (Alternative)

If you have the Supabase CLI installed:

```bash
# Navigate to your project directory
cd /path/to/your/project

# Deploy the function with JWT verification disabled
supabase functions deploy stripe-webhook --no-verify-jwt
```

## How to Test It Worked

### Test 1: Send Test Webhook from Stripe

1. Go to: https://dashboard.stripe.com/test/webhooks

2. Click on your webhook endpoint (should end with `/stripe-webhook`)

3. Click "Send test webhook"

4. Select event type: `checkout.session.completed`

5. Click "Send test webhook"

6. **Check the response:**
   - **Before fix:** Status 401 Unauthorized ❌
   - **After fix:** Status 200 OK ✅

### Test 2: Check Supabase Logs

1. Go to: https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/functions/stripe-webhook/logs

2. Look at the most recent requests

3. **Before fix:**
   ```
   POST | 401 | https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/stripe-webhook
   ```

4. **After fix:**
   ```
   POST | 200 | https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/stripe-webhook
   [Webhook] ✅ Signature verified
   [Webhook] 📦 Event type: checkout.session.completed
   ```

### Test 3: Full App Flow

1. Open the app
2. Go to Profile → Upgrade to Premium
3. Complete checkout with test card: `4242 4242 4242 4242`
4. Return to app
5. Wait 2-3 seconds
6. **Profile should show "Premium"** ✅

## Troubleshooting

### "I can't find the JWT verification setting"

Try these locations:

1. **Function details page:**
   - Click on the function name
   - Look for a "Settings" tab
   - Look for "Configuration" section

2. **Function settings:**
   - Click the gear icon next to the function
   - Look for "JWT" or "Authentication" settings

3. **Function deployment settings:**
   - Click "Deploy" or "Redeploy"
   - Look for JWT options in the deployment form

### "I disabled it but still getting 401"

1. **Verify the change was saved:**
   - Refresh the page
   - Check if the setting is still disabled

2. **Try redeploying:**
   - Click "Redeploy" on the function
   - Make sure JWT verification is disabled in the deployment form

3. **Check the function version:**
   - Should be version 16 or higher
   - If not, the deployment might have failed

4. **Use the CLI method:**
   - Install Supabase CLI
   - Run: `supabase functions deploy stripe-webhook --no-verify-jwt`

### "The toggle/checkbox doesn't exist"

The UI might have changed. Try:

1. **Look for these terms:**
   - "JWT"
   - "Verify"
   - "Authentication"
   - "Authorization"
   - "Token"

2. **Check the deployment form:**
   - Click "Deploy" or "Redeploy"
   - Look for JWT options there

3. **Use the CLI method instead:**
   - It's more reliable and doesn't depend on UI

## What This Does

### Before (JWT Verification Enabled):

```
Stripe sends webhook
    ↓
Supabase checks for JWT token
    ↓
No JWT token found
    ↓
Returns 401 Unauthorized ❌
    ↓
Your code never runs
    ↓
Database never updates
```

### After (JWT Verification Disabled):

```
Stripe sends webhook
    ↓
Supabase passes request to your code
    ↓
Your code verifies Stripe signature ✅
    ↓
Updates database ✅
    ↓
Returns 200 OK ✅
    ↓
Subscription works! 🎉
```

## Security Note

**Q: Is it safe to disable JWT verification?**

**A: YES! It's actually MORE secure for webhooks!**

Here's why:

1. **Stripe uses signature verification** (already implemented in the code)
2. **Signatures are unique per request** (can't be reused)
3. **Signatures expire quickly** (prevents replay attacks)
4. **Signatures are tied to the request body** (prevents tampering)

The webhook code verifies the signature like this:

```typescript
const signature = req.headers.get("stripe-signature");
const event = await stripe.webhooks.constructEventAsync(
  body,
  signature,
  STRIPE_WEBHOOK_SECRET!
);
```

This is the **recommended approach** by both Stripe and Supabase for webhooks.

JWT verification is meant for **client-to-server** requests, not **server-to-server** webhooks.

## After Disabling JWT Verification

Once you've disabled JWT verification:

1. ✅ Webhook will return 200 instead of 401
2. ✅ Database will update automatically
3. ✅ Users will become "Premium" after payment
4. ✅ No manual sync needed
5. ✅ Everything works seamlessly

**This is the ONLY manual step required!**

All the code is already deployed and working. It's just waiting for this one configuration change.

---

**Need help?** Check the logs at:
https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/functions/stripe-webhook/logs

**Last Updated:** January 31, 2025
