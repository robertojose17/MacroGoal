
/**
 * Stripe Configuration
 * 
 * Contains Stripe price IDs and configuration for subscription management.
 * Update these values with your actual Stripe price IDs from the Stripe Dashboard.
 */

export const STRIPE_CONFIG = {
  // Stripe Price IDs
  prices: {
    monthly: 'price_1SjTCm7srrOKlxJ1lI1gsjwN',
    yearly: 'price_1SjTM17srrOKlxJ14i5bhDTx',
  },
  
  // Display pricing (update to match your actual prices)
  displayPrices: {
    monthly: '$9.99',
    yearly: '$79.99',
  },
  
  // Savings calculation for yearly plan
  yearlySavings: '33%',
} as const;

export type StripePriceId = typeof STRIPE_CONFIG.prices[keyof typeof STRIPE_CONFIG.prices];
