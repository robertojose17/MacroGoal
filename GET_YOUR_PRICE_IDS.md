
# 🎯 How to Get Your Stripe PRICE IDs

## Quick Steps

### 1. Go to Stripe Dashboard
Visit: https://dashboard.stripe.com/test/products

### 2. Find Your Product
Look for your product (e.g., "Elite Macro Tracker Premium")

### 3. Click on Your Product
This will show you the product details

### 4. Find the Pricing Section
You'll see a section called **"Pricing"** with your prices listed:
- Monthly: $9.99/month
- Yearly: $99.99/year

### 5. Click on Each Price
Click on the monthly price, then copy the **Price ID**  
Click on the yearly price, then copy the **Price ID**

### 6. Identify the Correct ID

**✅ CORRECT - Price ID:**
```
price_1QqPxSDsUf4JA97FZvN8Ks3M
```
- Starts with `price_`
- Usually longer
- This is what you need!

**❌ WRONG - Product ID:**
```
prod_TWVql2YFPhAszU
```
- Starts with `prod_`
- This is what you currently have
- This will NOT work!

### 7. Update Configuration

Open `utils/stripeConfig.ts` and replace:

```typescript
export const STRIPE_CONFIG = {
  MONTHLY_PRICE_ID: 'price_YOUR_MONTHLY_ID',  // ← Paste here
  YEARLY_PRICE_ID: 'price_YOUR_YEARLY_ID',    // ← Paste here
  // ...
};
```

### 8. Test!

1. Open app in mobile preview
2. Go to Profile → "Unlock AI Features"
3. Tap "Subscribe Now"
4. Complete test payment (card: 4242 4242 4242 4242)
5. Verify AI features unlock

## 🎉 Done!

Once you update the Price IDs, the subscription flow will work perfectly!

---

**Still confused?** Check `STRIPE_SUBSCRIPTION_FIXED.md` for detailed instructions.
