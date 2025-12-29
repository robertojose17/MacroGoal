
# Quick Start: Stripe Subscription Setup

## 🎯 Goal
Get your Stripe subscription system up and running in 15 minutes.

## ⚡ Quick Setup (5 Steps)

### Step 1: Create Stripe Account (2 min)
1. Go to https://stripe.com
2. Click "Sign up"
3. Complete registration
4. **Stay in TEST mode** (toggle in top right)

### Step 2: Create Products (3 min)
1. Go to https://dashboard.stripe.com/test/products
2. Click "+ Add product"
3. Name: "Elite Macro Tracker Premium"
4. Add two prices:
   - **Monthly**: $9.99/month
   - **Yearly**: $99.99/year
5. **Copy both Price IDs** (they start with `price_`)

### Step 3: Get API Keys (2 min)
1. Go to https://dashboard.stripe.com/test/apikeys
2. Click "Reveal test key" under "Secret key"
3. **Copy the Secret Key** (starts with `sk_test_`)

### Step 4: Set Up Webhook (3 min)
1. Go to https://dashboard.stripe.com/test/webhooks
2. Click "+ Add endpoint"
3. URL: `https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/stripe-webhook`
4. Select these events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Click "Add endpoint"
6. **Copy the Webhook Secret** (starts with `whsec_`)

### Step 5: Configure App (5 min)

#### A. Add Secrets to Supabase
1. Go to https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/settings/functions
2. Click "Add new secret" for each:
   ```
   STRIPE_SECRET_KEY = sk_test_51SZKI8DsUf4JA97FbnAgMt2BoptuxgUdbOv2VWI2VuReriU61bZ8B516kRSSh4V3HbuYocCC1QOL7FrxkTcLZDO200Fhn6p1BJ
   STRIPE_WEBHOOK_SECRET = whsec_EuaTsQ3bDtr9GEel10BLGb0JDqoOvIQ7
   STRIPE_MONTHLY_PRICE_ID = prod_TWVql2YFPhAszU
   STRIPE_YEARLY_PRICE_ID = prod_TWVpf5UQoEF0jw
   ```

#### B. Update App Code
1. Open `utils/stripeConfig.ts`
2. Replace these lines:
   ```typescript
   MONTHLY_PRICE_ID: 'price_YOUR_ACTUAL_MONTHLY_PRICE_ID',
   YEARLY_PRICE_ID: 'price_YOUR_ACTUAL_YEARLY_PRICE_ID',
   ```
3. Save the file

## ✅ Test It!

### Test Subscription Purchase
1. Open the app
2. Try to access "AI Meal Estimator"
3. You'll see the paywall
4. Select a plan
5. Click "Subscribe Now"
6. Use test card: `4242 4242 4242 4242`
7. Expiry: Any future date (e.g., `12/34`)
8. CVC: Any 3 digits (e.g., `123`)
9. Complete checkout
10. You should now have access to AI features!

### Test Subscription Management
1. Go to Profile tab
2. You should see "Active" subscription
3. Click "Manage Subscription"
4. Stripe Customer Portal opens
5. Try canceling the subscription
6. Confirm it updates in the app

## 🎉 You're Done!

Your subscription system is now live in TEST mode.

## 🔍 Troubleshooting

### "No checkout URL returned"
- Check that Price IDs in `stripeConfig.ts` match your Stripe dashboard
- Verify `STRIPE_SECRET_KEY` is set in Supabase

### "Subscription not showing as active"
- Check Supabase Edge Function logs
- Verify webhook secret is correct
- Check Stripe webhook delivery logs

### "Cannot access AI features after subscribing"
- Wait 5-10 seconds for webhook to process
- Pull down to refresh on Profile screen
- Check subscription status in Supabase database

## 📚 Full Documentation

For detailed information, see:
- **STRIPE_SETUP_GUIDE.md** - Complete setup instructions
- **SUBSCRIPTION_IMPLEMENTATION_SUMMARY.md** - Technical details

## 🚀 Going Live

When ready for production:
1. Switch Stripe to LIVE mode
2. Create LIVE products and prices
3. Get LIVE API keys
4. Update Supabase secrets with LIVE keys
5. Update `stripeConfig.ts` with LIVE Price IDs
6. Test with real card (will charge!)

---

**Important**: You're in TEST mode - no real charges will be made!

**Need Help?** Check the full setup guide or Stripe documentation.
