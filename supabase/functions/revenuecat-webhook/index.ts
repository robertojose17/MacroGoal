
/**
 * RevenueCat Webhook Handler - PRODUCTION VERSION
 * 
 * This Edge Function receives webhook events from RevenueCat and syncs
 * subscription status to the Supabase database.
 * 
 * Setup Instructions:
 * 1. Deploy this function: supabase functions deploy revenuecat-webhook
 * 2. Get the function URL from Supabase Dashboard
 * 3. Go to RevenueCat Dashboard > Settings > Integrations > Webhooks
 * 4. Add webhook URL: https://YOUR_PROJECT.supabase.co/functions/v1/revenuecat-webhook
 * 5. Generate a webhook secret in RevenueCat and add it to Supabase secrets as REVENUECAT_WEBHOOK_SECRET
 * 6. Select events to send (recommended: all events)
 * 
 * Webhook Events Handled:
 * - INITIAL_PURCHASE: User makes first purchase
 * - RENEWAL: Subscription renews
 * - CANCELLATION: User cancels (still active until expiration)
 * - UNCANCELLATION: User re-enables auto-renew
 * - NON_RENEWING_PURCHASE: One-time purchase
 * - EXPIRATION: Subscription expires
 * - BILLING_ISSUE: Payment failed
 * - PRODUCT_CHANGE: User switches plans
 * - SUBSCRIBER_ALIAS: User identity changed
 * 
 * Security:
 * - Webhook signature verification using REVENUECAT_WEBHOOK_SECRET
 * - Service role key for bypassing RLS
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createHmac } from 'https://deno.land/std@0.208.0/node/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RevenueCatEvent {
  event: {
    type: string;
    app_user_id: string;
    original_app_user_id: string;
    product_id: string;
    entitlement_ids: string[];
    period_type: string;
    purchased_at_ms: number;
    expiration_at_ms: number;
    store: string;
    environment: string;
    price_in_purchased_currency?: number;
    currency?: string;
    is_trial_conversion?: boolean;
    cancel_reason?: string;
  };
  api_version: string;
}

// Currency conversion rates (approximate - use real-time API in production)
const CONVERSION_RATES: { [key: string]: number } = {
  'USD': 1.0,
  'EUR': 1.10,
  'GBP': 1.27,
  'CAD': 0.74,
  'AUD': 0.66,
  'JPY': 0.0068,
  'MXN': 0.050,
  'BRL': 0.20,
  'INR': 0.012,
  'CNY': 0.14,
};

function convertToUSD(amount: number, currency: string): number {
  const rate = CONVERSION_RATES[currency] || 1.0;
  return amount * rate;
}

// Verify webhook signature
function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  try {
    const hmac = createHmac('sha256', secret);
    hmac.update(body);
    const expectedSignature = hmac.digest('hex');
    return signature === expectedSignature;
  } catch (error) {
    console.error('[RevenueCat Webhook] Signature verification error:', error);
    return false;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('[RevenueCat Webhook] 📨 Received webhook request');

    // Get raw body for signature verification
    const bodyText = await req.text();
    const signature = req.headers.get('X-RevenueCat-Signature') || req.headers.get('x-revenuecat-signature');
    
    // Verify webhook signature
    const webhookSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
    if (webhookSecret && signature) {
      const isValid = verifyWebhookSignature(bodyText, signature, webhookSecret);
      if (!isValid) {
        console.warn('[RevenueCat Webhook] ⚠️ Invalid webhook signature');
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid signature' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log('[RevenueCat Webhook] ✅ Signature verified');
    } else if (webhookSecret) {
      console.warn('[RevenueCat Webhook] ⚠️ Webhook secret configured but no signature provided');
    } else {
      console.warn('[RevenueCat Webhook] ⚠️ No webhook secret configured - skipping signature verification');
    }

    // Parse webhook payload
    const payload: RevenueCatEvent = JSON.parse(bodyText);
    console.log('[RevenueCat Webhook] Event type:', payload.event.type);
    console.log('[RevenueCat Webhook] App user ID:', payload.event.app_user_id);

    // Initialize Supabase client with service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const event = payload.event;
    const userId = event.app_user_id;

    // Extract price information
    const priceInPurchasedCurrency = event.price_in_purchased_currency || 0;
    const currency = event.currency || 'USD';
    const amountUSD = convertToUSD(priceInPurchasedCurrency, currency);

    console.log('[RevenueCat Webhook] Price:', priceInPurchasedCurrency, currency);
    console.log('[RevenueCat Webhook] Amount USD:', amountUSD.toFixed(2));

    // Store raw event for audit trail
    const { error: eventError } = await supabase
      .from('revenuecat_events')
      .insert({
        event_type: event.type,
        app_user_id: event.app_user_id,
        original_app_user_id: event.original_app_user_id,
        product_id: event.product_id,
        entitlement_ids: event.entitlement_ids,
        period_type: event.period_type,
        purchased_at: event.purchased_at_ms ? new Date(event.purchased_at_ms).toISOString() : null,
        expiration_at: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null,
        store: event.store,
        environment: event.environment,
        price_in_purchased_currency: priceInPurchasedCurrency,
        currency: currency,
        amount_usd: amountUSD,
        raw_event: payload,
      });

    if (eventError) {
      console.error('[RevenueCat Webhook] ❌ Error storing event:', eventError);
    } else {
      console.log('[RevenueCat Webhook] ✅ Event stored successfully');
    }

    // Update subscription status based on event type
    const now = new Date().toISOString();
    const expirationDate = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;
    const purchasedDate = event.purchased_at_ms ? new Date(event.purchased_at_ms).toISOString() : null;

    let subscriptionUpdate: any = {
      revenuecat_app_user_id: event.app_user_id,
      revenuecat_original_app_user_id: event.original_app_user_id,
      entitlement_ids: event.entitlement_ids,
      store: event.store,
      environment: event.environment,
      product_id: event.product_id,
      period_type: event.period_type,
      purchased_at: purchasedDate,
      expiration_at: expirationDate,
      updated_at: now,
    };

    switch (event.type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
        console.log('[RevenueCat Webhook] 🎉 Activating subscription');
        subscriptionUpdate.status = 'active';
        subscriptionUpdate.plan_name = event.product_id;
        subscriptionUpdate.will_renew = true;
        subscriptionUpdate.unsubscribe_detected_at = null;
        subscriptionUpdate.billing_issues_detected_at = null;
        subscriptionUpdate.current_period_start = purchasedDate;
        subscriptionUpdate.current_period_end = expirationDate;
        break;

      case 'CANCELLATION':
        console.log('[RevenueCat Webhook] ⚠️ Subscription cancelled (still active until expiration)');
        subscriptionUpdate.will_renew = false;
        subscriptionUpdate.unsubscribe_detected_at = now;
        // Keep status as 'active' until expiration
        subscriptionUpdate.status = 'active';
        break;

      case 'EXPIRATION':
        console.log('[RevenueCat Webhook] ❌ Subscription expired');
        subscriptionUpdate.status = 'inactive';
        subscriptionUpdate.will_renew = false;
        break;

      case 'BILLING_ISSUE':
        console.log('[RevenueCat Webhook] ⚠️ Billing issue detected');
        subscriptionUpdate.billing_issues_detected_at = now;
        subscriptionUpdate.status = 'past_due';
        break;

      case 'PRODUCT_CHANGE':
        console.log('[RevenueCat Webhook] 🔄 Product changed');
        subscriptionUpdate.status = 'active';
        subscriptionUpdate.plan_name = event.product_id;
        subscriptionUpdate.current_period_start = purchasedDate;
        subscriptionUpdate.current_period_end = expirationDate;
        break;

      case 'NON_RENEWING_PURCHASE':
        console.log('[RevenueCat Webhook] 💰 One-time purchase');
        subscriptionUpdate.status = 'active';
        subscriptionUpdate.plan_name = event.product_id;
        subscriptionUpdate.will_renew = false;
        subscriptionUpdate.current_period_start = purchasedDate;
        subscriptionUpdate.current_period_end = expirationDate;
        break;

      default:
        console.log('[RevenueCat Webhook] ℹ️ Unhandled event type:', event.type);
    }

    // Upsert subscription record
    const { error: upsertError } = await supabase
      .from('subscriptions')
      .upsert(
        {
          user_id: userId,
          ...subscriptionUpdate,
        },
        {
          onConflict: 'user_id',
        }
      );

    if (upsertError) {
      console.error('[RevenueCat Webhook] ❌ Error updating subscription:', upsertError);
      return new Response(
        JSON.stringify({ success: false, error: upsertError.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('[RevenueCat Webhook] ✅ Subscription updated successfully');

    // Update user_type in users table for backward compatibility
    const newUserType = subscriptionUpdate.status === 'active' ? 'premium' : 'free';
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({ user_type: newUserType, updated_at: now })
      .eq('id', userId);

    if (userUpdateError) {
      console.error('[RevenueCat Webhook] ⚠️ Error updating user_type:', userUpdateError);
      // Don't fail the webhook - subscription is already updated
    } else {
      console.log('[RevenueCat Webhook] ✅ User type updated to:', newUserType);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook processed successfully',
        event_type: event.type,
        user_id: userId,
        amount_usd: amountUSD.toFixed(2),
        user_type: newUserType,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('[RevenueCat Webhook] ❌ Error processing webhook:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
