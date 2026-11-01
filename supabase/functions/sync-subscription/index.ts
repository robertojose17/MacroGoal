import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};


type PremiumState = 'active' | 'inactive' | 'unknown';
const PREMIUM_ALIASES = ['Macrogoal Pro', 'Premium', 'premium', 'macrogoal_pro', 'pro'];
function isObject(value: any): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function timestamp(value: any): number | null {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value))
    ? Date.parse(value) : null;
}
function classifyProvider(body: any, status: number, now: number): PremiumState {
  if (status !== 200 || !isObject(body?.subscriber?.entitlements)) return 'unknown';
  const { entitlements, subscriptions } = body.subscriber;
  let uncertain = false;
  for (const alias of PREMIUM_ALIASES) {
    if (!Object.prototype.hasOwnProperty.call(entitlements, alias)) continue;
    const entitlement = entitlements[alias];
    if (!isObject(entitlement)) { uncertain = true; continue; }
    let malformed = false;
    const graceValues = [entitlement.grace_period_expires_date];
    if (typeof entitlement.product_identifier === 'string' && isObject(subscriptions)) {
      const subscription = subscriptions[entitlement.product_identifier];
      if (subscription !== undefined && !isObject(subscription)) malformed = true;
      if (isObject(subscription)) graceValues.push(subscription.grace_period_expires_date);
    }
    for (const grace of graceValues) {
      if (grace === undefined || grace === null) continue;
      const graceEnd = timestamp(grace);
      if (graceEnd === null) malformed = true;
      else if (graceEnd > now) return 'active';
    }
    // Explicit null on an actual entitlement object, not missing/malformed.
    if (entitlement.expires_date === null) return 'active';
    const expiry = timestamp(entitlement.expires_date);
    if (expiry !== null && expiry > now) return 'active';
    if (expiry === null || malformed) uncertain = true;
  }
  return uncertain ? 'unknown' : 'inactive';
}
function classifyMirror(subscription: any, existingPremium: boolean, now: number): PremiumState {
  if (!isObject(subscription)) return 'unknown';
  // Preserve v37 legacy active/no-primary-expiry behavior without granting lifetime.
  // Do not infer expiration from a stale secondary current_period_end.
  if (subscription.status === 'active' &&
      (subscription.expiration_at === null || subscription.expiration_at === undefined)) {
    return 'unknown';
  }
  const rawExpiry = subscription.expiration_at ?? subscription.current_period_end;
  const expiry = timestamp(rawExpiry);
  if (rawExpiry !== null && rawExpiry !== undefined && expiry === null) return 'unknown';
  if (subscription.status === 'active' && expiry !== null && expiry > now) return 'active';
  const knownStatuses = ['active', 'inactive', 'canceled', 'unpaid', 'past_due', 'trialing'];
  if (expiry !== null && expiry <= now && knownStatuses.includes(subscription.status)) return 'inactive';
  if (subscription.status === 'inactive' && expiry === null && !existingPremium) return 'inactive';
  return 'unknown';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const rcApiKey = Deno.env.get('REVENUECAT_API_KEY') ?? '';

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, svcKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || authError) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const unavailable = () => new Response(
      JSON.stringify({ error: 'Subscription verification unavailable' }),
      {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      },
    );
    const { data: profile, error: profileError } = await admin
      .from('users').select('updated_at, user_type').eq('id', user.id).maybeSingle();
    if (profileError || !profile) return unavailable();
    const existingPremium = profile.user_type === 'premium';
    let providerState: PremiumState = 'unknown';

    if (rcApiKey.trim()) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(
          `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`,
          {
            headers: { Authorization: `Bearer ${rcApiKey}`, 'Content-Type': 'application/json' },
            signal: controller.signal,
          },
        );
        // HTTP 201 may mean a newly created subscriber; never use it to revoke.
        if (response.status === 200) {
          providerState = classifyProvider(await response.json(), response.status, Date.now());
        } else {
          console.warn('[sync-premium] Provider verification unavailable', response.status);
        }
      } catch {
        console.warn('[sync-premium] Provider verification unavailable');
      } finally {
        clearTimeout(timeout);
      }
    }

    let mirrorState: PremiumState = 'unknown';
    if (providerState !== 'active') {
      const { data: subscription, error: subscriptionError } = await admin
        .from('subscriptions').select('status, expiration_at, current_period_end')
        .eq('user_id', user.id).maybeSingle();
      if (!subscriptionError) {
        mirrorState = classifyMirror(subscription, existingPremium, Date.now());
      }
    }

    let is_premium: boolean;
    if (providerState === 'active' || mirrorState === 'active') {
      is_premium = true;
    } else if (providerState === 'inactive' && mirrorState === 'inactive') {
      is_premium = false;
    } else {
      return unavailable();
    }

    const newUserType = is_premium ? 'premium' : 'free';
    let update = admin.from('users').update({
      user_type: newUserType,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);
    update = profile.updated_at === null
      ? update.is('updated_at', null)
      : update.eq('updated_at', profile.updated_at);
    const { data: updated, error: updateError } = await update.select('id').maybeSingle();
    if (updateError || !updated) return unavailable();

    console.log('[sync-premium] Subscription state synchronized');
    return new Response(JSON.stringify({ is_premium, user_type: newUserType }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[sync-premium] error:', e);
    return new Response(JSON.stringify({ error: e.message ?? 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
