import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

function getAmountUSD(event) {
  const raw = event.price_in_purchased_currency;
  const currency = (event.currency || 'USD').toUpperCase();
  if (raw && raw > 0) return Number(raw);
  const pid = (event.product_id || '').toLowerCase();
  if (pid.includes('year') || pid.includes('annual')) return 49.99;
  return 9.99;
}

async function processReferralCommission(supabase, event, amountUSD) {
  const appUserId = event.app_user_id;
  const productId = event.product_id || '';
  console.log(`[Referral] Checking referral for user ${appUserId}`);
  const { data: referral, error: refErr } = await supabase.from('referrals').select('id, referrer_id, referred_id').eq('referred_id', appUserId).eq('converted_to_premium', false).maybeSingle();
  if (refErr) { console.error('[Referral] Error querying referrals:', refErr); return; }
  if (!referral) { console.log(`[Referral] No unconverted referral found for user ${appUserId}`); return; }
  console.log(`[Referral] Found referral: referrer=${referral.referrer_id}`);
  const commissionAmount = Math.round(amountUSD * 0.35 * 100) / 100;
  const now = new Date();
  const availableAt = new Date(now.getTime() + 35 * 24 * 60 * 60 * 1000).toISOString();
  const rcEventId = `${event.type}_${appUserId}_${Date.now()}`;
  const { error: commErr } = await supabase.from('referral_commissions').insert({ referrer_id: referral.referrer_id, referred_id: referral.referred_id, referral_id: referral.id, product_id: productId, purchase_amount: amountUSD, commission_amount: commissionAmount, status: 'pending', available_at: availableAt, revenuecat_event_id: rcEventId });
  if (commErr) { if (commErr.code === '23505') { console.log('[Referral] Duplicate commission — skipping'); return; } console.error('[Referral] Error inserting commission:', commErr); return; }
  console.log('[Referral] Commission inserted successfully');
  await supabase.from('referrals').update({ converted_to_premium: true, premium_converted_at: now.toISOString(), status: 'completed', completed_at: now.toISOString() }).eq('id', referral.id);
  await supabase.from('users').update({ user_type: 'premium', updated_at: now.toISOString() }).eq('id', appUserId);
}

async function processTransferCommission(supabase, event) {
  const transferredFrom = event.transferred_from || [];
  const transferredTo = event.transferred_to || [];
  console.log(`[Referral] TRANSFER event: from=${JSON.stringify(transferredFrom)}, to=${JSON.stringify(transferredTo)}`);
  for (const newUserId of transferredTo) {
    const { data: referral, error: refErr } = await supabase.from('referrals').select('id, referrer_id, referred_id').eq('referred_id', newUserId).eq('converted_to_premium', false).maybeSingle();
    if (refErr || !referral) { console.log(`[Referral] No unconverted referral for transferred user ${newUserId}`); continue; }
    let productId = event.product_id || '';
    let amountUSD = getAmountUSD(event);
    if (transferredFrom.length > 0) {
      const { data: oldEvent } = await supabase.from('revenuecat_events').select('product_id, amount_usd').in('app_user_id', transferredFrom).in('event_type', ['INITIAL_PURCHASE', 'RENEWAL']).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (oldEvent) { productId = oldEvent.product_id || productId; amountUSD = oldEvent.amount_usd || amountUSD; }
    }
    await processReferralCommission(supabase, { ...event, app_user_id: newUserId, product_id: productId, type: 'TRANSFER' }, amountUSD);
  }
}

// ─── Affiliate commission logic (INITIAL_PURCHASE, annual + non-trial only) ───
async function processAffiliateCommission(supabase, event, amountUSD, priceInPurchasedCurrency, currency, purchasedDate) {
  try {
    const appUserId = event.app_user_id;
    const productId = event.product_id || '';
    const periodType = (event.period_type || '').toUpperCase();

    const isAnnual = productId.toLowerCase().includes('annual') || productId.toLowerCase().includes('yearly');
    if (!isAnnual) {
      console.log(`[RevenueCat Webhook] Skipping affiliate commission — not an annual plan (product_id: ${productId})`);
      return;
    }

    if (periodType === 'TRIAL') {
      console.log(`[RevenueCat Webhook] Skipping affiliate commission — period_type is TRIAL for product ${productId}`);
      return;
    }

    console.log(`[RevenueCat Webhook] Processing affiliate commission — product: ${productId}, period: ${periodType}`);

    let resolvedCode = null;
    let attributionSource = 'subscriber_attribute';
    const attrCode = event.subscriber_attributes?.['$affiliate_code']?.value;
    if (attrCode && attrCode.trim()) {
      resolvedCode = attrCode.trim().toUpperCase();
      console.log(`[RevenueCat Webhook] Found affiliate code in subscriber_attributes: ${resolvedCode}`);
    }

    if (!resolvedCode) {
      const { data: attribution, error: attrErr } = await supabase.from('affiliate_attributions').select('affiliate_code, affiliate_profile_id').eq('customer_user_id', appUserId).maybeSingle();
      if (attrErr) { console.error('[RevenueCat Webhook] Error querying affiliate_attributions:', attrErr); }
      else if (attribution?.affiliate_code) {
        resolvedCode = attribution.affiliate_code.toUpperCase();
        attributionSource = 'attribution_table';
        console.log(`[RevenueCat Webhook] Found affiliate code in affiliate_attributions: ${resolvedCode}`);
      }
    }

    if (!resolvedCode) {
      console.log(`[RevenueCat Webhook] No affiliate code found for user ${appUserId} — skipping commission`);
      return;
    }

    const { data: profile, error: profileErr } = await supabase.from('affiliate_profiles').select('id, commission_rate, hold_period_days, status, apple_code_status, total_sales').eq('affiliate_code', resolvedCode).eq('status', 'active').maybeSingle();
    if (profileErr) { console.error('[RevenueCat Webhook] Error querying affiliate_profiles:', profileErr); return; }
    if (!profile) {
      console.log(`[RevenueCat Webhook] No active affiliate profile for code ${resolvedCode} — skipping`);
      return;
    }

    const priceUSD = amountUSD;
    const storeNet = priceUSD * 0.70;
    const commission = storeNet * 0.50;

    const holdDays = Number(profile.hold_period_days) || 35;
    const availableAt = new Date(Date.now() + holdDays * 24 * 60 * 60 * 1000).toISOString();

    const rcEventId = event.id ?? null;
    if (rcEventId) {
      const { data: existing } = await supabase.from('affiliate_commissions').select('id').eq('revenuecat_event_id', rcEventId).maybeSingle();
      if (existing) { console.log(`[RevenueCat Webhook] Commission already recorded for event ${rcEventId} — skipping`); return; }
    }

    const transactionId = event.transaction_id || event.original_transaction_id || `${appUserId}_${event.purchased_at_ms ?? Date.now()}`;

    const { error: insertErr } = await supabase.from('affiliate_commissions').insert({
      affiliate_profile_id: profile.id,
      customer_user_id: appUserId,
      revenuecat_transaction_id: transactionId,
      revenuecat_event_id: rcEventId,
      product_id: productId,
      plan_type: 'annual',
      purchase_amount: priceInPurchasedCurrency,
      currency,
      purchase_amount_usd: priceUSD,
      commission_rate: 50,
      commission_amount: commission,
      status: 'pending',
      available_at: availableAt,
      offer_code_used: resolvedCode,
      attribution_source: attributionSource,
      purchased_at: purchasedDate,
    });

    if (insertErr) {
      if (insertErr.code === '23505') { console.log('[RevenueCat Webhook] Commission already exists (duplicate key) — skipping'); return; }
      console.error('[RevenueCat Webhook] Error inserting affiliate commission:', insertErr);
      return;
    }

    console.log(`[RevenueCat Webhook] ✅ Affiliate commission recorded: $${commission.toFixed(2)} for affiliate code ${resolvedCode}`);

    await supabase.from('affiliate_profiles').update({ total_sales: (profile.total_sales || 0) + 1 }).eq('id', profile.id);

    if (attributionSource === 'attribution_table') {
      await supabase.from('affiliate_attributions').update({ status: 'converted', revenuecat_transaction_id: transactionId }).eq('customer_user_id', appUserId);
    }
  } catch (err) {
    console.error('[RevenueCat Webhook] Affiliate commission processing error (non-fatal):', err);
  }
}

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Allow: 'POST, OPTIONS' },
    });
  }

  // Authenticate every POST before reading its body or using privileged clients.
  // Configure the exact same complete Authorization value on the RevenueCat sender.
  // Never log credentials, digests, headers, request bodies, or exception details here.
  try {
    const expectedAuthorization = Deno.env.get('REVENUECAT_WEBHOOK_AUTHORIZATION');
    if (!expectedAuthorization || !expectedAuthorization.trim()) {
      console.error('[RC Webhook] Authorization is not configured');
      return new Response(JSON.stringify({ success: false, error: 'Webhook unavailable' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    const providedAuthorization = req.headers.get('Authorization');
    if (!providedAuthorization) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    const { createHash, timingSafeEqual } = await import('node:crypto');
    const providedDigest = createHash('sha256').update(providedAuthorization, 'utf8').digest();
    const expectedDigest = createHash('sha256').update(expectedAuthorization, 'utf8').digest();
    if (!timingSafeEqual(providedDigest, expectedDigest)) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
  } catch {
    console.error('[RC Webhook] Authorization check unavailable');
    return new Response(JSON.stringify({ success: false, error: 'Webhook unavailable' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  try {
    console.log('[RC Webhook] Received authenticated request');
    const bodyText = await req.text();
    const payload = JSON.parse(bodyText);
    // Authenticated TEST events never reach application data, including later retries.
    if (payload?.event?.type === 'TEST') {
      return new Response(
        JSON.stringify({ diagnostic: 'MG_RC_AUTH_CHECK_V2_20261011', authorized: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
      );
    }

    const event = payload.event;
    const eventType = event.type;
    const appUserId = event.app_user_id;
    console.log(`[RC Webhook] Event type: ${eventType}, user: ${appUserId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, svcKey);

    const priceInPurchasedCurrency = event.price_in_purchased_currency || 0;
    const currency = event.currency || 'USD';
    const amountUSD = getAmountUSD(event);
    const now = new Date().toISOString();
    console.log(`[RC Webhook] Price: ${priceInPurchasedCurrency} ${currency} → USD ${amountUSD}`);

    // 1. Store raw event
    const { error: eventError } = await supabase.from('revenuecat_events').insert({ event_type: eventType, app_user_id: appUserId, original_app_user_id: event.original_app_user_id, product_id: event.product_id, entitlement_ids: event.entitlement_ids, period_type: event.period_type, purchased_at: event.purchased_at_ms ? new Date(event.purchased_at_ms).toISOString() : null, expiration_at: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null, store: event.store, environment: event.environment, price_in_purchased_currency: priceInPurchasedCurrency, currency, amount_usd: amountUSD, raw_event: payload, event_data: payload });
    if (eventError) { console.error('[RC Webhook] Error storing event:', eventError); } else { console.log('[RC Webhook] Event stored'); }

    // 2. Build subscription update
    const expirationDate = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;
    const purchasedDate = event.purchased_at_ms ? new Date(event.purchased_at_ms).toISOString() : null;
    let subscriptionUpdate: any = { revenuecat_app_user_id: appUserId, revenuecat_original_app_user_id: event.original_app_user_id, entitlement_ids: event.entitlement_ids, store: event.store, environment: event.environment, product_id: event.product_id, period_type: event.period_type, purchased_at: purchasedDate, expiration_at: expirationDate, updated_at: now };

    switch (eventType) {
      case 'INITIAL_PURCHASE': case 'RENEWAL': case 'UNCANCELLATION':
        subscriptionUpdate = { ...subscriptionUpdate, status: 'active', plan_name: event.product_id, will_renew: true, unsubscribe_detected_at: null, billing_issues_detected_at: null, current_period_start: purchasedDate, current_period_end: expirationDate };
        break;
      case 'CANCELLATION':
        // Keep status = 'active', only set will_renew = false (user still has access until expiration)
        subscriptionUpdate = { ...subscriptionUpdate, status: 'active', will_renew: false, unsubscribe_detected_at: now };
        break;
      case 'EXPIRATION':
        // Only on EXPIRATION do we set status = 'inactive' and downgrade user_type
        subscriptionUpdate = { ...subscriptionUpdate, status: 'inactive', will_renew: false };
        break;
      case 'BILLING_ISSUE':
        subscriptionUpdate = { ...subscriptionUpdate, status: 'past_due', billing_issues_detected_at: now };
        break;
      case 'PRODUCT_CHANGE':
        subscriptionUpdate = { ...subscriptionUpdate, status: 'active', plan_name: event.product_id, current_period_start: purchasedDate, current_period_end: expirationDate };
        break;
      case 'NON_RENEWING_PURCHASE':
        subscriptionUpdate = { ...subscriptionUpdate, status: 'active', plan_name: event.product_id, will_renew: false, current_period_start: purchasedDate, current_period_end: expirationDate };
        break;
      default:
        console.log(`[RC Webhook] Unhandled event type: ${eventType}`);
    }

    // 3. Upsert subscription
    const { error: upsertError } = await supabase.from('subscriptions').upsert({ user_id: appUserId, ...subscriptionUpdate }, { onConflict: 'user_id' });
    if (upsertError) { console.error('[RC Webhook] Error upserting subscription:', upsertError); } else { console.log('[RC Webhook] Subscription upserted'); }

    // 4. Update users.user_type
    // CANCELLATION: keep premium (still active until expiration) — do NOT downgrade
    // EXPIRATION: downgrade to free — club posts are preserved (not deleted)
    let newUserType: string | null = null;
    if (['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE'].includes(eventType)) {
      newUserType = 'premium';
    } else if (eventType === 'EXPIRATION') {
      newUserType = 'free';
      // Club posts are intentionally preserved — we do NOT delete them on expiration
      console.log(`[RC Webhook] EXPIRATION: downgrading user ${appUserId} to free. Club posts preserved.`);
    } else if (eventType === 'CANCELLATION') {
      // CANCELLATION: user still has access until expiration — keep premium
      newUserType = 'premium';
      console.log(`[RC Webhook] CANCELLATION: keeping user ${appUserId} as premium (will_renew=false, still active until expiration)`);
    }
    // BILLING_ISSUE: don't change user_type (leave as-is, let EXPIRATION handle it)

    if (newUserType !== null) {
      const { error: userUpdateError } = await supabase.from('users').update({ user_type: newUserType, updated_at: now }).eq('id', appUserId);
      if (userUpdateError) { console.error('[RC Webhook] Error updating user_type:', userUpdateError); } else { console.log(`[RC Webhook] user_type set to ${newUserType}`); }
    }

    // 5. Referral commission logic
    if (eventType === 'INITIAL_PURCHASE' || eventType === 'RENEWAL') {
      console.log(`[Referral] Processing commission for ${eventType}`);
      await processReferralCommission(supabase, event, amountUSD);
    } else if (eventType === 'TRANSFER') {
      console.log('[Referral] Processing TRANSFER commission');
      await processTransferCommission(supabase, event);
    }

    // 6. Affiliate commission logic (INITIAL_PURCHASE, annual + non-trial only)
    if (eventType === 'INITIAL_PURCHASE') {
      await processAffiliateCommission(supabase, event, amountUSD, priceInPurchasedCurrency, currency, purchasedDate);
    }

    return new Response(JSON.stringify({ success: true, event_type: eventType, user_id: appUserId, amount_usd: amountUSD, user_type: newUserType }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[RC Webhook] Unhandled error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message || 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
