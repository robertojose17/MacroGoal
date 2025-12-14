
# ✅ Stripe Subscription Fix - Checklist

## 🎯 Quick Status

| Item | Status | Action Required |
|------|--------|-----------------|
| Edge Functions Deployed | ✅ Done | None |
| Webhook Secret Set | ✅ Done | None |
| Stripe Secret Key Set | ✅ Done | None |
| Configuration File | ⚠️ Needs Update | **Update Price IDs** |
| Testing | ⏳ Pending | Test after config update |

---

## 📝 Step-by-Step Fix

### ☐ Step 1: Get Price IDs (5 minutes)

1. [ ] Go to https://dashboard.stripe.com/test/products
2. [ ] Click on your product
3. [ ] Click on Monthly price
4. [ ] Copy Price ID (starts with `price_`)
5. [ ] Click on Yearly price
6. [ ] Copy Price ID (starts with `price_`)

**What to copy:**
```
✅ price_1QqPxSDsUf4JA97FZvN8Ks3M  (Monthly)
✅ price_1QqPySDsUf4JA97FXvM9Kt4N  (Yearly)

❌ prod_TWVql2YFPhAszU  (This is wrong!)
```

---

### ☐ Step 2: Update Configuration (2 minutes)

1. [ ] Open `utils/stripeConfig.ts`
2. [ ] Replace `MONTHLY_PRICE_ID` with your monthly Price ID
3. [ ] Replace `YEARLY_PRICE_ID` with your yearly Price ID
4. [ ] Save the file

**Before:**
```typescript
MONTHLY_PRICE_ID: 'prod_TWVql2YFPhAszU',  // ❌ Wrong
YEARLY_PRICE_ID: 'prod_TWVpf5UQoEF0jw',   // ❌ Wrong
```

**After:**
```typescript
MONTHLY_PRICE_ID: 'price_1QqPxSDsUf4JA97FZvN8Ks3M',  // ✅ Correct
YEARLY_PRICE_ID: 'price_1QqPySDsUf4JA97FXvM9Kt4N',   // ✅ Correct
```

---

### ☐ Step 3: Verify Configuration (1 minute)

1. [ ] Start the app
2. [ ] Check console for validation message
3. [ ] Should see: `✅ [Stripe Config] Configuration loaded successfully`
4. [ ] Should NOT see: `❌ [Stripe Config] ERROR`

---

### ☐ Step 4: Test Subscription Flow (5 minutes)

#### Mobile Preview (Priority!)

1. [ ] Open app in mobile preview
2. [ ] Navigate to Profile tab
3. [ ] Tap "Unlock AI Features"
4. [ ] Select Monthly plan
5. [ ] Tap "Subscribe Now"
6. [ ] Stripe Checkout opens in browser
7. [ ] Enter test card: 4242 4242 4242 4242
8. [ ] Enter any future expiry date
9. [ ] Enter any 3-digit CVC
10. [ ] Complete payment
11. [ ] Redirected back to app
12. [ ] AI features are unlocked

#### Test AI Features

13. [ ] Navigate to Food tab
14. [ ] Tap "AI Meal Estimator"
15. [ ] Should NOT see paywall
16. [ ] Can describe a meal
17. [ ] Receives AI estimate
18. [ ] Can log the meal

---

### ☐ Step 5: Test Error Handling (Optional)

1. [ ] Try subscribing without internet
2. [ ] Should see friendly error message
3. [ ] Check console for detailed logs
4. [ ] Verify no crashes

---

### ☐ Step 6: Test Subscription Management (Optional)

1. [ ] Go to Profile tab
2. [ ] Tap "Manage Subscription"
3. [ ] Stripe Customer Portal opens
4. [ ] Can view subscription details
5. [ ] Can cancel subscription
6. [ ] AI features lock after cancellation

---

## 🔍 Verification Checklist

### Configuration

- [ ] Price IDs start with `price_` not `prod_`
- [ ] No placeholder text in config file
- [ ] Console shows success message on startup
- [ ] No error alerts when opening paywall

### Subscription Flow

- [ ] Paywall screen loads correctly
- [ ] Can select plans
- [ ] Subscribe button works
- [ ] Stripe Checkout opens
- [ ] Payment completes successfully
- [ ] Redirected back to app
- [ ] Subscription saved in database

### AI Features

- [ ] Non-subscribers see paywall
- [ ] Subscribers can access AI Meal Estimator
- [ ] AI estimates work correctly
- [ ] Can log meals from AI estimates

### Edge Functions

- [ ] No errors in Supabase logs
- [ ] Webhooks are received
- [ ] Database updates correctly

---

## 🚨 Troubleshooting

### If you see "No such price" error:

- [ ] Verify Price IDs start with `price_`
- [ ] Check you copied the full Price ID
- [ ] Ensure you're using TEST mode Price IDs
- [ ] Restart the app after config change

### If Checkout doesn't open:

- [ ] Check console for errors
- [ ] Verify internet connection
- [ ] Check Edge Function logs
- [ ] Ensure user is logged in

### If AI features don't unlock:

- [ ] Check subscriptions table in database
- [ ] Verify webhook was received
- [ ] Check subscription status
- [ ] Try refreshing the app

---

## 📊 Success Criteria

You'll know it's working when:

✅ No error messages on app startup  
✅ Stripe Checkout opens when tapping "Subscribe Now"  
✅ Payment completes successfully  
✅ Redirected back to app  
✅ AI Meal Estimator is accessible  
✅ Can describe meals and get estimates  
✅ Can log meals from AI estimates  

---

## 🎉 Completion

Once all checkboxes are ticked:

- [ ] Configuration is correct
- [ ] Subscription flow works
- [ ] AI features are accessible
- [ ] Error handling works
- [ ] Ready for production

**Estimated Total Time:** 15-20 minutes

---

## 📞 Need Help?

Check these files:
- `STRIPE_SUBSCRIPTION_FIXED.md` - Complete documentation
- `GET_YOUR_PRICE_IDS.md` - How to get Price IDs
- `PRODUCT_VS_PRICE_ID.md` - Visual explanation

Or check:
- Console logs for detailed errors
- Supabase Edge Function logs
- Stripe Dashboard for webhook events

---

**Current Status:** ⚠️ Waiting for Price IDs to be updated

**Next Action:** Get Price IDs from Stripe Dashboard and update config file
