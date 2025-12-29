
# 🧪 Quick Subscription Testing Guide

## 🚀 Quick Test (5 minutes)

### 1. Test Payment Flow
```bash
# 1. Open app
# 2. Go to Profile
# 3. Tap "Upgrade to Premium"
# 4. Select Monthly plan
# 5. Use test card: 4242 4242 4242 4242
# 6. Complete checkout
# 7. Wait for redirect back to app
```

### 2. Verify Success
```bash
# Check Profile screen:
✅ Shows "Premium" badge
✅ Shows "Active" subscription
✅ Shows plan type (Monthly/Yearly)
✅ Shows renewal date

# Check AI features:
✅ Can access AI Meal Estimator
✅ No paywall blocking premium features
```

### 3. Check Database
```sql
-- Run in Supabase SQL Editor:

-- 1. Check customer mapping
SELECT * FROM user_stripe_customers 
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your-test-email@example.com');
-- Expected: 1 row with stripe_customer_id

-- 2. Check subscription
SELECT * FROM subscriptions 
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your-test-email@example.com');
-- Expected: status = 'active', plan_type = 'monthly' or 'yearly'

-- 3. Check user type
SELECT user_type FROM users 
WHERE id = (SELECT id FROM auth.users WHERE email = 'your-test-email@example.com');
-- Expected: user_type = 'premium'
```

### 4. Check Webhook Logs
```bash
# In Supabase Dashboard:
# 1. Go to Edge Functions
# 2. Click "stripe-webhook"
# 3. Click "Logs"
# 4. Look for recent entries

# Expected logs:
[Webhook] ✅ Signature verified
[Webhook] 📦 Event type: checkout.session.completed
[Webhook] ✅ Found user_id in metadata
[Webhook] ✅ Subscription upserted successfully
[Webhook] ✅ User type updated to: premium
```

## 🐛 If Something Goes Wrong

### Problem: Profile still shows "Free"

**Quick Fix:**
1. Pull down to refresh Profile screen
2. Wait 5 seconds
3. Check again

**If still not working:**
```sql
-- Check if webhook processed:
SELECT * FROM subscriptions WHERE user_id = '<your-user-id>';

-- If subscription exists but user_type is wrong:
UPDATE users SET user_type = 'premium' WHERE id = '<your-user-id>';
```

### Problem: "Could not resolve user_id" in webhook logs

**Quick Fix:**
```sql
-- Manually create customer mapping:
INSERT INTO user_stripe_customers (user_id, stripe_customer_id)
VALUES (
  '<your-user-id>',
  '<stripe-customer-id-from-stripe-dashboard>'
);

-- Then trigger sync:
-- In app: Pull down to refresh Profile screen
```

### Problem: Webhook not receiving events

**Quick Fix:**
1. Go to Stripe Dashboard → Developers → Webhooks
2. Check if endpoint exists: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
3. If not, add it
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copy webhook signing secret
6. Update in Supabase: Edge Functions → stripe-webhook → Secrets → `STRIPE_WEBHOOK_SECRET`

## 📊 Health Check Query

Run this to check overall system health:

```sql
-- Subscription System Health Check
SELECT 
  'Total Users' as metric,
  COUNT(*) as count
FROM users
UNION ALL
SELECT 
  'Premium Users',
  COUNT(*)
FROM users WHERE user_type = 'premium'
UNION ALL
SELECT 
  'Active Subscriptions',
  COUNT(*)
FROM subscriptions WHERE status IN ('active', 'trialing')
UNION ALL
SELECT 
  'Customer Mappings',
  COUNT(*)
FROM user_stripe_customers
UNION ALL
SELECT 
  'Orphaned Subscriptions',
  COUNT(*)
FROM subscriptions s
LEFT JOIN user_stripe_customers usc ON s.stripe_customer_id = usc.stripe_customer_id
WHERE usc.user_id IS NULL AND s.stripe_customer_id IS NOT NULL;
```

**Expected Results:**
- Premium Users = Active Subscriptions
- Customer Mappings ≥ Active Subscriptions
- Orphaned Subscriptions = 0

## ✅ Success Checklist

After testing, verify:
- [ ] Payment completes successfully
- [ ] App returns to Profile automatically
- [ ] Profile shows "Premium" badge
- [ ] Subscription card shows correct plan
- [ ] AI features are unlocked
- [ ] Database has customer mapping
- [ ] Database has subscription record
- [ ] User type is 'premium'
- [ ] Webhook logs show success
- [ ] No errors in any logs

## 🎯 Test Cards

Use these Stripe test cards:

| Card Number | Description |
|-------------|-------------|
| 4242 4242 4242 4242 | Success |
| 4000 0000 0000 0002 | Declined |
| 4000 0000 0000 9995 | Insufficient funds |

**For all cards:**
- Expiry: Any future date
- CVC: Any 3 digits
- ZIP: Any 5 digits

## 📞 Support

If tests fail after following this guide:
1. Check all webhook logs
2. Check all database tables
3. Check Stripe dashboard
4. Review `SUBSCRIPTION_FIX_COMPLETE.md` for detailed debugging

**The system is designed to be self-healing** - most issues will resolve automatically on the next sync.
