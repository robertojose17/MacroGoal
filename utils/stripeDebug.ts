
/**
 * Stripe Debugging Utility
 * 
 * This file helps diagnose Stripe subscription issues
 */

import { STRIPE_CONFIG } from './stripeConfig';

export function validateStripeConfig(): {
  ok: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Safely get price IDs with fallback to empty string
  const monthlyPriceId = STRIPE_CONFIG?.MONTHLY_PRICE_ID ?? '';
  const yearlyPriceId = STRIPE_CONFIG?.YEARLY_PRICE_ID ?? '';

  // Check if Price IDs exist
  if (!monthlyPriceId) {
    errors.push('Monthly Price ID is missing or undefined');
  } else if (monthlyPriceId.includes('REPLACE')) {
    errors.push('Monthly Price ID not configured (contains REPLACE)');
  } else if (monthlyPriceId.startsWith('prod_')) {
    errors.push('Monthly Price ID is a PRODUCT ID (prod_...) - you need a PRICE ID (price_...)');
  } else if (monthlyPriceId.includes('_test_')) {
    warnings.push('Using TEST mode Monthly Price ID (this is correct for development)');
  }

  if (!yearlyPriceId) {
    errors.push('Yearly Price ID is missing or undefined');
  } else if (yearlyPriceId.includes('REPLACE')) {
    errors.push('Yearly Price ID not configured (contains REPLACE)');
  } else if (yearlyPriceId.startsWith('prod_')) {
    errors.push('Yearly Price ID is a PRODUCT ID (prod_...) - you need a PRICE ID (price_...)');
  } else if (yearlyPriceId.includes('_test_')) {
    warnings.push('Using TEST mode Yearly Price ID (this is correct for development)');
  }

  const ok = errors.length === 0;

  return { ok, errors, warnings };
}

export function logStripeConfig() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 [Stripe Debug] Configuration Check');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const validation = validateStripeConfig();

  // Safely access config properties
  const monthlyPriceId = STRIPE_CONFIG?.MONTHLY_PRICE_ID ?? 'NOT SET';
  const yearlyPriceId = STRIPE_CONFIG?.YEARLY_PRICE_ID ?? 'NOT SET';
  const monthlyPrice = STRIPE_CONFIG?.MONTHLY_PRICE ?? 0;
  const yearlyPrice = STRIPE_CONFIG?.YEARLY_PRICE ?? 0;
  const yearlySavings = STRIPE_CONFIG?.YEARLY_SAVINGS_PERCENT ?? 0;

  console.log('Monthly Price ID:', monthlyPriceId);
  console.log('Yearly Price ID:', yearlyPriceId);
  console.log('Monthly Price: $' + monthlyPrice);
  console.log('Yearly Price: $' + yearlyPrice);
  console.log('Yearly Savings:', yearlySavings + '%');

  if (validation.errors.length > 0) {
    console.log('\n❌ ERRORS:');
    validation.errors.forEach(error => console.log('  - ' + error));
  }

  if (validation.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    validation.warnings.forEach(warning => console.log('  - ' + warning));
  }

  if (validation.ok) {
    console.log('\n✅ Configuration is valid!');
  } else {
    console.log('\n❌ Configuration has errors - subscription flow will fail!');
    console.log('\n📖 How to fix:');
    console.log('1. Go to https://dashboard.stripe.com/products');
    console.log('2. Click on your product');
    console.log('3. In the Pricing section, click on a price');
    console.log('4. Copy the PRICE ID (starts with "price_")');
    console.log('5. Update utils/stripeConfig.ts with the correct PRICE IDs');
    console.log('\nCurrent config location: utils/stripeConfig.ts');
    console.log('Update PRICE_IDS.monthly and PRICE_IDS.annual');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return validation;
}

export function logSubscriptionAttempt(priceId: string, planType: string) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💳 [Stripe Debug] Subscription Attempt');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Plan Type:', planType);
  console.log('Price ID:', priceId || 'NOT SET');
  
  if (priceId) {
    console.log('Price ID Format:', priceId.startsWith('price_') ? '✅ Correct (price_...)' : '❌ Wrong (should start with price_)');
  } else {
    console.log('Price ID Format: ❌ Price ID is missing or undefined');
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}
