
/**
 * Stripe Debugging Utility
 * 
 * This file helps diagnose Stripe subscription issues
 */

import { STRIPE_CONFIG } from './stripeConfig';

export function validateStripeConfig(): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if Price IDs are configured
  if (STRIPE_CONFIG.MONTHLY_PRICE_ID.includes('REPLACE')) {
    errors.push('Monthly Price ID not configured');
  }
  if (STRIPE_CONFIG.YEARLY_PRICE_ID.includes('REPLACE')) {
    errors.push('Yearly Price ID not configured');
  }

  // Check if using Product IDs instead of Price IDs
  if (STRIPE_CONFIG.MONTHLY_PRICE_ID.startsWith('prod_')) {
    errors.push('Monthly Price ID is a PRODUCT ID (prod_...) - you need a PRICE ID (price_...)');
  }
  if (STRIPE_CONFIG.YEARLY_PRICE_ID.startsWith('prod_')) {
    errors.push('Yearly Price ID is a PRODUCT ID (prod_...) - you need a PRICE ID (price_...)');
  }

  // Check if using test mode
  if (STRIPE_CONFIG.MONTHLY_PRICE_ID.includes('_test_')) {
    warnings.push('Using TEST mode Price IDs (this is correct for development)');
  }

  const isValid = errors.length === 0;

  return { isValid, errors, warnings };
}

export function logStripeConfig() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 [Stripe Debug] Configuration Check');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const validation = validateStripeConfig();

  console.log('Monthly Price ID:', STRIPE_CONFIG.MONTHLY_PRICE_ID);
  console.log('Yearly Price ID:', STRIPE_CONFIG.YEARLY_PRICE_ID);
  console.log('Monthly Price: $' + STRIPE_CONFIG.MONTHLY_PRICE);
  console.log('Yearly Price: $' + STRIPE_CONFIG.YEARLY_PRICE);
  console.log('Yearly Savings:', STRIPE_CONFIG.YEARLY_SAVINGS_PERCENT + '%');

  if (validation.errors.length > 0) {
    console.log('\n❌ ERRORS:');
    validation.errors.forEach(error => console.log('  - ' + error));
  }

  if (validation.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    validation.warnings.forEach(warning => console.log('  - ' + warning));
  }

  if (validation.isValid) {
    console.log('\n✅ Configuration is valid!');
  } else {
    console.log('\n❌ Configuration has errors - subscription flow will fail!');
    console.log('\n📖 How to fix:');
    console.log('1. Go to https://dashboard.stripe.com/test/products');
    console.log('2. Click on your product');
    console.log('3. In the Pricing section, click on a price');
    console.log('4. Copy the PRICE ID (starts with "price_")');
    console.log('5. Update utils/stripeConfig.ts with the correct PRICE IDs');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return validation;
}

export function logSubscriptionAttempt(priceId: string, planType: string) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💳 [Stripe Debug] Subscription Attempt');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Plan Type:', planType);
  console.log('Price ID:', priceId);
  console.log('Price ID Format:', priceId.startsWith('price_') ? '✅ Correct (price_...)' : '❌ Wrong (should start with price_)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}
