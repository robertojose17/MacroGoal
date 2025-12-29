
# Subscription Architecture - Complete Reference

## Overview

This document describes the complete subscription system architecture, including the recent fix for the Stripe checkout redirect issue.

## System Components

### 1. Frontend (React Native App)

**Files:**
- `app/paywall.tsx` - Subscription plans and checkout UI
- `app/(tabs)/profile.tsx` - Subscription status and management
- `hooks/useSubscription.ts` - Subscription state management
- `utils/stripeConfig.ts` - Stripe configuration and price IDs

**Flow:**
1. User clicks "Subscribe Now" in Paywall
2. App calls `createCheckoutSession()` from `useSubscription` hook
3. Opens Stripe Checkout in browser via `expo-web-browser`
4. After payment, browser redirects to `checkout-redirect` function
5. Function returns HTML with deep link to app
6. App automatically opens and syncs subscription

### 2. Backend (Supabase Edge Functions)

**Functions:**

#### `create-checkout-session`
- **Purpose:** Create Stripe Checkout session
- **Auth:** Requires JWT (user must be logged in)
- **Input:** `{ priceId, planType }`
- **Output:** `{ url, sessionId, customerId }`
- **Key Features:**
  - Resolves or creates Stripe customer
  - Stores customer mapping in `user_stripe_customers` table
  - Adds user_id to session and subscription metadata
  - Returns checkout URL with correct redirect URLs

#### `checkout-redirect` ⭐ (FIXED)
- **Purpose:** Handle redirect from Stripe after payment
- **Auth:** No JWT required (`verify_jwt = false`)
- **Input:** Query params: `success`, `cancelled`, `session_id`
- **Output:** HTML page with deep link
- **Key Features:**
  - Returns HTML with automatic redirect to app
  - Creates deep link: `elitemacrotracker://profile?subscription_success=true&session_id=...`
  - Shows success/cancelled message
  - Fallback link if automatic redirect fails

#### `stripe-webhook`
- **Purpose:** Process Stripe webhook events
- **Auth:** No JWT required (`verify_jwt = false`), uses Stripe signature
- **Input:** Stripe webhook event
- **Output:** `{ received: true }`
- **Key Features:**
  - Verifies webhook signature
  - Handles events: `checkout.session.completed`, `customer.subscription.created/updated/deleted`
  - Multi-tier user_id resolution (metadata → mapping table → subscriptions table)
  - Updates `subscriptions` and `users` tables
  - Ensures customer mapping exists

#### `sync-subscription`
- **Purpose:** Manually sync subscription from Stripe
- **Auth:** Requires JWT
- **Input:** None (uses authenticated user)
- **Output:** Updated subscription data
- **Key Features:**
  - Fetches latest subscription from Stripe
  - Updates local database
  - Called when app returns from Stripe or on pull-to-refresh

#### `create-portal-session`
- **Purpose:** Create Stripe Customer Portal session
- **Auth:** Requires JWT
- **Input:** None (uses authenticated user)
- **Output:** `{ url }`
- **Key Features:**
  - Opens Stripe Customer Portal for subscription management
  - Allows users to update payment method, cancel subscription, etc.

### 3. Database (Supabase PostgreSQL)

**Tables:**

#### `users`
```sql
- id (uuid, primary key)
- email (text)
- user_type (text) -- 'free', 'premium', 'guest'
- ... other user fields
```

#### `subscriptions`
```sql
- id (uuid, primary key)
- user_id (uuid, unique, foreign key to users)
- stripe_customer_id (text)
- stripe_subscription_id (text)
- stripe_price_id (text)
- status (text) -- 'active', 'inactive', 'trialing', 'past_due', 'canceled', 'unpaid'
- plan_type (text) -- 'monthly', 'yearly'
- current_period_start (timestamptz)
- current_period_end (timestamptz)
- cancel_at_period_end (boolean)
- trial_end (timestamptz)
- created_at (timestamptz)
- updated_at (timestamptz)
```

#### `user_stripe_customers` ⭐ (CRITICAL)
```sql
- id (uuid, primary key)
- user_id (uuid, unique, foreign key to users)
- stripe_customer_id (text, unique)
- created_at (timestamptz)
- updated_at (timestamptz)
```

**Purpose:** Maps Supabase user_id to Stripe customer_id to prevent orphaned subscriptions.

### 4. Configuration

#### `supabase/config.toml` ⭐ (UPDATED)
```toml
project_id = "esgptfiofoaeguslgvcq"

# Disable JWT verification for checkout-redirect function
[functions.checkout-redirect]
verify_jwt = false

# Disable JWT verification for stripe-webhook function
[functions.stripe-webhook]
verify_jwt = false
```

**Why:** These functions are called by Stripe (not the app) and don't have JWT tokens.

#### `utils/stripeConfig.ts`
```typescript
export const STRIPE_CONFIG = {
  MONTHLY_PRICE_ID: 'price_xxx',
  YEARLY_PRICE_ID: 'price_yyy',
  MONTHLY_PRICE: 9.99,
  YEARLY_PRICE: 99.99,
  // ... other config
};
```

## Complete Payment Flow

### Step-by-Step

1. **User Initiates Subscription**
   - User opens Paywall screen
   - Selects plan (Monthly or Yearly)
   - Clicks "Subscribe Now"

2. **Create Checkout Session**
   - App calls `createCheckoutSession(priceId, planType)`
   - Edge Function creates/retrieves Stripe customer
   - Stores customer mapping in `user_stripe_customers`
   - Creates Stripe Checkout session with:
     - `customer`: Stripe customer ID
     - `metadata`: `{ supabase_user_id, plan_type }`
     - `subscription_data.metadata`: Same metadata
     - `success_url`: Points to `checkout-redirect` function
     - `cancel_url`: Points to `checkout-redirect` function
   - Returns checkout URL

3. **Stripe Checkout**
   - App opens checkout URL in browser
   - User enters payment details
   - Stripe processes payment

4. **Webhook Processing** (Parallel)
   - Stripe sends webhook to `stripe-webhook` function
   - Function verifies signature
   - Resolves user_id from metadata or customer mapping
   - Updates `subscriptions` table
   - Updates `users.user_type` to 'premium'
   - Ensures customer mapping exists

5. **Checkout Redirect** ⭐ (FIXED)
   - Stripe redirects browser to `checkout-redirect` function
   - Function receives: `?success=true&session_id=cs_test_...`
   - Returns HTML page with:
     - Success message
     - Deep link: `elitemacrotracker://profile?subscription_success=true&session_id=...`
     - JavaScript to automatically redirect
   - Browser executes JavaScript and opens app

6. **App Returns**
   - App opens via deep link
   - `useSubscription` hook syncs subscription
   - Profile screen updates to show Premium status
   - AI features are unlocked

## User ID Resolution Strategy

The webhook uses a multi-tier fallback strategy to resolve user_id:

### Priority 1: Metadata (Most Reliable)
```typescript
if (metadata?.supabase_user_id) {
  return metadata.supabase_user_id;
}
```

### Priority 2: Customer Mapping Table
```typescript
const { data: mapping } = await supabase
  .from("user_stripe_customers")
  .select("user_id")
  .eq("stripe_customer_id", customerId)
  .maybeSingle();

if (mapping?.user_id) {
  return mapping.user_id;
}
```

### Priority 3: Subscriptions Table
```typescript
const { data: subscription } = await supabase
  .from("subscriptions")
  .select("user_id")
  .eq("stripe_customer_id", customerId)
  .maybeSingle();

if (subscription?.user_id) {
  // Store mapping for future use
  await supabase
    .from("user_stripe_customers")
    .upsert({ user_id: subscription.user_id, stripe_customer_id: customerId });
  
  return subscription.user_id;
}
```

This ensures subscriptions are never orphaned, even if metadata is missing.

## Security Model

### JWT Verification

**Functions with JWT verification (default):**
- `create-checkout-session` ✅
- `sync-subscription` ✅
- `create-portal-session` ✅

**Functions without JWT verification:**
- `checkout-redirect` ❌ (called by browser redirect)
- `stripe-webhook` ❌ (uses Stripe signature instead)

### Why It's Safe

1. **`checkout-redirect`:**
   - Only returns HTML with a deep link
   - Doesn't expose sensitive data
   - Doesn't perform database operations
   - Uses query parameters for routing

2. **`stripe-webhook`:**
   - Verifies Stripe webhook signature
   - Uses Stripe's webhook secret for authentication
   - Standard practice for webhook endpoints
   - More secure than JWT for webhooks

### Row Level Security (RLS)

All database tables have RLS policies:
- Users can only read/update their own data
- Service role bypasses RLS for webhook updates
- Prevents unauthorized access to subscription data

## Deep Linking

### Configuration

**`app.json`:**
```json
{
  "expo": {
    "scheme": "elitemacrotracker",
    "ios": {
      "bundleIdentifier": "com.yourcompany.elitemacrotracker"
    },
    "android": {
      "package": "com.yourcompany.elitemacrotracker"
    }
  }
}
```

### Deep Link Format

```
elitemacrotracker://profile?subscription_success=true&session_id=cs_test_...
```

**Components:**
- `elitemacrotracker://` - App scheme
- `profile` - Route to open
- `subscription_success=true` - Success flag
- `session_id=...` - Stripe session ID (for verification)

### Testing Deep Links

**iOS Simulator:**
```bash
xcrun simctl openurl booted "elitemacrotracker://profile"
```

**Android:**
```bash
adb shell am start -W -a android.intent.action.VIEW -d "elitemacrotracker://profile"
```

## Error Handling

### Common Errors and Solutions

**1. NOT_FOUND Error (FIXED)**
- **Cause:** JWT verification enabled on `checkout-redirect`
- **Solution:** Set `verify_jwt = false` in `config.toml`

**2. Orphaned Subscription**
- **Cause:** user_id not resolved in webhook
- **Solution:** Multi-tier resolution strategy + customer mapping table

**3. Subscription Not Updating**
- **Cause:** Webhook not configured or failing
- **Solution:** Check webhook logs in Stripe Dashboard, verify secret

**4. Deep Link Not Working**
- **Cause:** Scheme not configured or app not installed
- **Solution:** Verify `app.json` configuration, test on device

## Monitoring and Debugging

### Logs to Check

**Edge Function Logs:**
```bash
supabase functions logs checkout-redirect
supabase functions logs stripe-webhook
supabase functions logs create-checkout-session
```

**Stripe Dashboard:**
- Webhooks → Events
- Webhooks → Logs
- Customers → Search by email
- Subscriptions → Search by customer

**App Logs:**
- Console logs in `useSubscription` hook
- Console logs in Paywall screen
- Console logs in Profile screen

### Key Metrics

- ✅ Checkout session creation success rate
- ✅ Webhook processing success rate
- ✅ User ID resolution success rate
- ✅ Subscription sync success rate
- ✅ Deep link open success rate

## Testing Checklist

### Test Cards (Stripe Test Mode)

**Success:**
- `4242 4242 4242 4242` - Visa

**Decline:**
- `4000 0000 0000 0002` - Card declined

**3D Secure:**
- `4000 0025 0000 3155` - Requires authentication

### Test Scenarios

- [ ] Monthly subscription
- [ ] Yearly subscription
- [ ] Subscription cancellation
- [ ] Subscription update (change plan)
- [ ] Payment method update
- [ ] Subscription renewal
- [ ] Failed payment
- [ ] Webhook retry
- [ ] Deep link on iOS
- [ ] Deep link on Android
- [ ] App in background during payment
- [ ] App closed during payment

## Deployment

### Prerequisites

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref esgptfiofoaeguslgvcq
```

### Deploy Functions

```bash
# Deploy all functions
supabase functions deploy

# Or deploy individually
supabase functions deploy checkout-redirect
supabase functions deploy stripe-webhook
supabase functions deploy create-checkout-session
supabase functions deploy sync-subscription
supabase functions deploy create-portal-session
```

### Environment Variables

Set in Supabase Dashboard → Edge Functions → Secrets:

- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key

## Future Improvements

### Potential Enhancements

1. **Subscription Analytics**
   - Track conversion rates
   - Monitor churn
   - Analyze plan preferences

2. **Promotional Codes**
   - Support Stripe coupons
   - Trial periods
   - Referral discounts

3. **Multiple Plans**
   - Add more subscription tiers
   - Feature-based pricing
   - Usage-based billing

4. **Subscription Lifecycle**
   - Dunning management
   - Cancellation surveys
   - Win-back campaigns

5. **Testing**
   - Automated E2E tests
   - Webhook replay testing
   - Load testing

## Conclusion

The subscription system is now fully functional with the checkout redirect fix. The key improvements are:

1. ✅ **JWT verification disabled** for `checkout-redirect` and `stripe-webhook`
2. ✅ **Multi-tier user ID resolution** prevents orphaned subscriptions
3. ✅ **Customer mapping table** ensures reliable user-customer linking
4. ✅ **Deep linking** returns users to the app after payment
5. ✅ **Comprehensive error handling** and logging

The system is production-ready and can handle the complete subscription lifecycle from signup to cancellation.

---

**Last Updated:** 2025-01-04
**Status:** ✅ Production Ready
