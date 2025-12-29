
# ✅ Stripe Subscription - Final Checklist

## 🎯 Before Testing

### Stripe Configuration
- [ ] Stripe account in **test mode**
- [ ] Test API keys configured
- [ ] Webhook endpoint added to Stripe dashboard
- [ ] Webhook signing secret configured in Supabase

### Supabase Configuration
- [ ] Edge Functions deployed
- [ ] Environment variables set:
  - [ ] `STRIPE_SECRET_KEY`
  - [ ] `STRIPE_WEBHOOK_SECRET`
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Database migration applied (`user_stripe_customers` table exists)

### App Configuration
- [ ] Price IDs configured in `utils/stripeConfig.ts`
- [ ] Deep linking configured
- [ ] App can connect to Supabase

## 🧪 Testing

### Test 1: Complete Payment Flow
- [ ] Open app
- [ ] Navigate to Profile
- [ ] Tap "Upgrade to Premium"
- [ ] Select Monthly plan
- [ ] Enter test card: `4242 4242 4242 4242`
- [ ] Complete checkout
- [ ] See success page in Stripe
- [ ] App redirects back automatically
- [ ] Profile shows "Premium" badge
- [ ] Subscription card shows "Active"
- [ ] AI features are unlocked

### Test 2: Database Verification
```sql
-- Run these queries in Supabase SQL Editor:

-- 1. Customer mapping exists
SELECT * FROM user_stripe_customers 
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your-test-email@example.com');
-- Expected: 1 row

-- 2. Subscription is active
SELECT * FROM subscriptions 
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your-test-email@example.com');
-- Expected: status = 'active', plan_type = 'monthly'

-- 3. User type is premium
SELECT user_type FROM users 
WHERE id = (SELECT id FROM auth.users WHERE email = 'your-test-email@example.com');
-- Expected: user_type = 'premium'
```

- [ ] Customer mapping exists
- [ ] Subscription status is 'active'
- [ ] User type is 'premium'

### Test 3: Webhook Verification
- [ ] Open Supabase Dashboard
- [ ] Go to Edge Functions → stripe-webhook → Logs
- [ ] Find recent webhook event
- [ ] Verify logs show:
  - [ ] ✅ Signature verified
  - [ ] ✅ User ID resolved
  - [ ] ✅ Subscription upserted
  - [ ] ✅ User type updated

### Test 4: Persistence
- [ ] Close app completely
- [ ] Reopen app
- [ ] Go to Profile
- [ ] Still shows "Premium" badge
- [ ] AI features still unlocked

### Test 5: Stripe Dashboard
- [ ] Open Stripe Dashboard
- [ ] Go to Customers
- [ ] Find your test customer
- [ ] Verify subscription is active
- [ ] Check subscription metadata has `supabase_user_id`

## 🐛 Troubleshooting

### If Premium Doesn't Unlock

#### Step 1: Force Refresh
- [ ] Pull down on Profile screen to refresh
- [ ] Wait 5 seconds
- [ ] Check if Premium appears

#### Step 2: Check Webhook
- [ ] Open webhook logs
- [ ] Look for errors
- [ ] Verify user_id was resolved

#### Step 3: Check Database
```sql
-- Check all three tables:
SELECT * FROM user_stripe_customers WHERE user_id = '<your-user-id>';
SELECT * FROM subscriptions WHERE user_id = '<your-user-id>';
SELECT user_type FROM users WHERE id = '<your-user-id>';
```

#### Step 4: Manual Fix (if needed)
```sql
-- If customer mapping is missing:
INSERT INTO user_stripe_customers (user_id, stripe_customer_id)
VALUES ('<your-user-id>', '<stripe-customer-id>');

-- If user type is wrong:
UPDATE users SET user_type = 'premium' WHERE id = '<your-user-id>';
```

#### Step 5: Force Sync
- [ ] Close and reopen app
- [ ] App will auto-sync on focus
- [ ] Check Profile again

### Common Issues

**Issue**: "No checkout URL returned"
- **Fix**: Check Edge Function logs for errors
- **Verify**: Price IDs are correct (start with `price_`, not `prod_`)

**Issue**: "Could not resolve user_id" in webhook
- **Fix**: Manually add customer mapping (see Step 4 above)
- **Prevent**: Ensure metadata is passed in checkout session

**Issue**: Webhook not receiving events
- **Fix**: Add webhook endpoint in Stripe Dashboard
- **URL**: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
- **Events**: Select all `customer.subscription.*` and `checkout.session.completed`

## ✅ Success Criteria

All of these must be true:
- [ ] Payment completes without errors
- [ ] App returns to Profile automatically
- [ ] Profile shows "Premium" badge
- [ ] Subscription card shows "Active" status
- [ ] AI Meal Estimator is accessible
- [ ] Customer mapping exists in database
- [ ] Subscription record exists in database
- [ ] User type is 'premium' in database
- [ ] Webhook logs show successful processing
- [ ] Premium status persists after app restart
- [ ] No duplicate customers in Stripe
- [ ] No errors in any logs

## 📊 Health Check

Run this query to verify system health:

```sql
SELECT 
  'Total Users' as metric,
  COUNT(*) as count
FROM users
UNION ALL
SELECT 'Premium Users', COUNT(*) FROM users WHERE user_type = 'premium'
UNION ALL
SELECT 'Active Subscriptions', COUNT(*) FROM subscriptions WHERE status IN ('active', 'trialing')
UNION ALL
SELECT 'Customer Mappings', COUNT(*) FROM user_stripe_customers
UNION ALL
SELECT 'Orphaned Subscriptions', COUNT(*)
FROM subscriptions s
LEFT JOIN user_stripe_customers usc ON s.stripe_customer_id = usc.stripe_customer_id
WHERE usc.user_id IS NULL AND s.stripe_customer_id IS NOT NULL;
```

**Expected**:
- Premium Users = Active Subscriptions
- Customer Mappings ≥ Active Subscriptions
- Orphaned Subscriptions = 0

## 🎉 Final Verification

- [ ] All tests pass
- [ ] All database checks pass
- [ ] All webhook logs show success
- [ ] Health check shows no issues
- [ ] No errors in any logs
- [ ] Premium features work correctly

## 🚀 Ready for Production

Once all items are checked:
- [ ] Switch Stripe to live mode
- [ ] Update API keys to live keys
- [ ] Update webhook endpoint to production URL
- [ ] Test with real card (small amount)
- [ ] Verify everything works in production
- [ ] Monitor webhook logs for first few days

## 📝 Monitoring

After deployment, monitor:
- [ ] Webhook success rate (should be 100%)
- [ ] User ID resolution rate (should be 100%)
- [ ] Customer mapping coverage (should be 100%)
- [ ] Subscription sync time (should be < 3 seconds)
- [ ] Error logs (should be minimal)

## 🎯 Done!

If all items are checked, your subscription system is:
- ✅ Fully functional
- ✅ Production-ready
- ✅ Self-healing
- ✅ Bulletproof

**Congratulations! The subscription bug is FIXED!** 🎉
