
# 🚨 STRIPE QUICK FIX

## The Problem
You provided **PRODUCT IDs** instead of **PRICE IDs**:

```
❌  ← PRODUCT ID (wrong!)
❌  ← PRODUCT ID (wrong!)
```

## The Solution

### 1. Get Your PRICE IDs

Go to: https://dashboard.stripe.com/test/products

1. Click your product
2. In the "Pricing" section, click on a price
3. Copy the **Price ID** (starts with `price_`)

### 2. Update Configuration

Edit `utils/stripeConfig.ts`:

```typescript
export const STRIPE_CONFIG = {
  MONTHLY_PRICE_ID: 'price_YOUR_MONTHLY_ID_HERE',  // ← Paste here
  YEARLY_PRICE_ID: 'price_YOUR_YEARLY_ID_HERE',    // ← Paste here
  // ...
};
```

### 3. Test

1. Open app in mobile preview
2. Go to Profile → "Unlock AI Features"
3. Tap "Subscribe Now"
4. Complete test payment (card: 4242 4242 4242 4242)
5. Verify AI features unlock

## ✅ Done!

The Edge Functions are already deployed and working. You just need to update the Price IDs in the config file.

---

**Need help?** Check `STRIPE_FIX_COMPLETE.md` for detailed instructions.
