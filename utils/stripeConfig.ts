
/**
 * Stripe Configuration
 * 
 * ⚠️ CRITICAL: You MUST use PRICE IDs, NOT PRODUCT IDs!
 * 
 * PRICE IDs start with "price_" (e.g., price_1ABC123...)
 * PRODUCT IDs start with "prod_" (e.g., prod_ABC123...)
 * 
 * To get your PRICE IDs (not Product IDs):
 * 1. Go to https://dashboard.stripe.com/test/products
 * 2. Click on your product "Elite Macro Tracker Premium"
 * 3. In the "Pricing" section, you'll see your prices
 * 4. Click on a price to see its details
 * 5. Copy the PRICE ID (starts with "price_") - NOT the Product ID!
 * 
 * Example:
 * ✅ CORRECT: price_1QqPxSDsUf4JA97FZvN8Ks3M (Price ID)
 * ❌ WRONG: prod_TWVql2YFPhAszU (Product ID)
 * 
 * For testing, use TEST mode Price IDs (they will have "test" in the dashboard URL)
 */

export const STRIPE_CONFIG = {
  // ⚠️ REPLACE THESE WITH YOUR ACTUAL STRIPE TEST **PRICE** IDs (NOT PRODUCT IDs!)
  // These should start with "price_" not "prod_"
  MONTHLY_PRICE_ID: 'price_1SZSojDsUf4JA97FuIWfvUfX',
  YEARLY_PRICE_ID: 'price_1SZSnyDsUf4JA97Fd7R9BMkD',
  
  // Pricing display (update if you change prices)
  MONTHLY_PRICE: 9.99,
  YEARLY_PRICE: 99.99,
  
  // Calculated values
  get YEARLY_MONTHLY_EQUIVALENT() {
    return (this.YEARLY_PRICE / 12).toFixed(2);
  },
  get YEARLY_SAVINGS_PERCENT() {
    const monthlyCost = this.MONTHLY_PRICE * 12;
    const savings = ((monthlyCost - this.YEARLY_PRICE) / monthlyCost) * 100;
    return Math.round(savings);
  },
};

/**
 * Environment Variables Required in Supabase Edge Functions:
 * 
 * Set these in your Supabase project settings:
 * https://supabase.com/dashboard/project/esgptfiofoaeguslgvcq/settings/functions
 * 
 * 1. STRIPE_SECRET_KEY - Your Stripe Secret Key (starts with sk_test_)
 *    ✅ Already set: sk_test_51SZKI8DsUf4JA97F...
 * 
 * 2. STRIPE_WEBHOOK_SECRET - Your Stripe Webhook Secret (starts with whsec_)
 *    ✅ Already set: whsec_EuaTsQ3bDtr9GEel10BLGb0JDqoOvIQ7
 * 
 * 3. You do NOT need to set STRIPE_MONTHLY_PRICE_ID or STRIPE_YEARLY_PRICE_ID
 *    as environment variables - they are passed from the app to the Edge Function.
 * 
 * To get your Stripe keys:
 * 1. Go to https://dashboard.stripe.com/test/apikeys
 * 2. Copy the "Secret key" (click "Reveal test key")
 * 3. For webhook secret, create a webhook endpoint pointing to:
 *    https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/stripe-webhook
 * 4. Copy the webhook signing secret
 */

// Validate configuration on load
if (STRIPE_CONFIG.MONTHLY_PRICE_ID.includes('REPLACE') || STRIPE_CONFIG.YEARLY_PRICE_ID.includes('REPLACE')) {
  console.error('❌ [Stripe Config] STRIPE NOT CONFIGURED!');
  console.error('❌ [Stripe Config] You provided PRODUCT IDs (prod_...) instead of PRICE IDs (price_...)');
  console.error('❌ [Stripe Config] Please update utils/stripeConfig.ts with your actual Stripe PRICE IDs');
  console.error('❌ [Stripe Config] See comments in stripeConfig.ts for instructions');
} else if (STRIPE_CONFIG.MONTHLY_PRICE_ID.startsWith('prod_') || STRIPE_CONFIG.YEARLY_PRICE_ID.startsWith('prod_')) {
  console.error('❌ [Stripe Config] ERROR: You are using PRODUCT IDs instead of PRICE IDs!');
  console.error('❌ [Stripe Config] Product IDs start with "prod_" - you need PRICE IDs that start with "price_"');
  console.error('❌ [Stripe Config] Go to your Stripe Dashboard → Products → Click your product → Copy the PRICE ID');
  console.error('❌ [Stripe Config] Monthly Price ID:', STRIPE_CONFIG.MONTHLY_PRICE_ID, '← This is a PRODUCT ID!');
  console.error('❌ [Stripe Config] Yearly Price ID:', STRIPE_CONFIG.YEARLY_PRICE_ID, '← This is a PRODUCT ID!');
} else {
  console.log('✅ [Stripe Config] Configuration loaded successfully');
  console.log('[Stripe Config] Monthly Price ID:', STRIPE_CONFIG.MONTHLY_PRICE_ID);
  console.log('[Stripe Config] Yearly Price ID:', STRIPE_CONFIG.YEARLY_PRICE_ID);
  console.log('[Stripe Config] Yearly savings:', STRIPE_CONFIG.YEARLY_SAVINGS_PERCENT + '%');
}
