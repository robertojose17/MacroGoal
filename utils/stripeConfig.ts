
/**
 * Stripe Configuration
 * 
 * IMPORTANT: When switching to LIVE mode:
 * 1. Replace STRIPE_PUBLISHABLE_KEY with your live publishable key (pk_live_...)
 * 2. Replace PRICE_IDS with your live price IDs (price_...)
 * 3. Update Supabase secrets: STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET
 * 4. Redeploy all Stripe-related Edge Functions
 */

// ============================================
// LIVE MODE CONFIGURATION
// ============================================
// Replace these with your LIVE Stripe keys
export const STRIPE_PUBLISHABLE_KEY = 'pk_live_51SZK7g7srrOKlxJ1UOLSMuXKrzygctxiHiTnEzuH5AqcU2WNEjxuhLochFQqUWSmVBDWlhbmQIR9q95YXZiB9keG00tqZCYrJn';

export const PRICE_IDS = {
  monthly: 'price_1SjTCm7srrOKlxJ1lI1gsjwN',
  annual: 'price_1SjTM17srrOKlxJ14i5bhDTx',
};

// Pricing display values
export const PRICING = {
  monthly: 9.99,
  yearly: 99.99,
};

// ============================================
// TEST MODE CONFIGURATION (for reference)
// ============================================
// Keep these commented out for reference
// export const STRIPE_PUBLISHABLE_KEY = 'pk_test_...';
// export const PRICE_IDS = {
//   monthly: 'price_test_...',
//   annual: 'price_test_...',
// };

// Calculate savings
const yearlySavings = Math.round((1 - (PRICING.yearly / 12) / PRICING.monthly) * 100);
const yearlyMonthlyEquivalent = (PRICING.yearly / 12).toFixed(2);

export const STRIPE_CONFIG = {
  publishableKey: STRIPE_PUBLISHABLE_KEY,
  priceIds: PRICE_IDS,
  
  // Legacy property names for backward compatibility
  MONTHLY_PRICE_ID: PRICE_IDS.monthly,
  YEARLY_PRICE_ID: PRICE_IDS.annual,
  MONTHLY_PRICE: PRICING.monthly,
  YEARLY_PRICE: PRICING.yearly,
  YEARLY_SAVINGS_PERCENT: yearlySavings,
  YEARLY_MONTHLY_EQUIVALENT: yearlyMonthlyEquivalent,
};

// Validation helper
export function validateStripeConfig() {
  if (STRIPE_PUBLISHABLE_KEY.includes('test')) {
    console.warn('⚠️ WARNING: Using TEST Stripe keys. Switch to LIVE keys for production!');
    return false;
  }
  
  if (Object.values(PRICE_IDS).some(id => id?.includes('test'))) {
    console.warn('⚠️ WARNING: Using TEST price IDs. Switch to LIVE price IDs for production!');
    return false;
  }
  
  console.log('✅ Stripe configured for LIVE mode');
  return true;
}
