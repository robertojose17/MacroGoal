import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const { action } = body;

    // ─── start_session ──────────────────────────────────────────────────────────
    if (action === 'start_session') {
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: 'user_id required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Return existing incomplete session if one exists
      const { data: existing } = await supabase
        .from('onboarding_funnel')
        .select('session_id')
        .eq('user_id', user_id)
        .eq('completed', false)
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      if (existing?.session_id) {
        return new Response(JSON.stringify({ session_id: existing.session_id }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create new session
      const session_id = crypto.randomUUID();
      const now = new Date().toISOString();
      const { error } = await supabase.from('onboarding_funnel').insert({
        session_id,
        user_id,
        max_step_reached: 0,
        completed: false,
        paywall_shown: false,
        trial_started: false,
        trial_skipped: false,
        started_at: now,
        updated_at: now,
      });

      if (error) {
        console.error('[track-onboarding] start_session insert error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ session_id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─── track_event ────────────────────────────────────────────────────────────
    if (action === 'track_event') {
      const { session_id, user_id, event, step, properties } = body;
      if (!session_id || !event) {
        return new Response(JSON.stringify({ error: 'session_id and event required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const now = new Date().toISOString();

      // ── Ensure a funnel row exists for this session (atomic, race-safe) ────────
      const { error: ensureErr } = await supabase
        .from('onboarding_funnel')
        .upsert(
          {
            session_id,
            user_id: user_id ?? null,
            max_step_reached: typeof step === 'number' ? step : 0,
            completed: false,
            paywall_shown: false,
            trial_started: false,
            trial_skipped: false,
            started_at: now,
            updated_at: now,
          },
          { onConflict: 'session_id', ignoreDuplicates: true }
        );

      if (ensureErr) {
        console.warn('[track-onboarding] ensure funnel row error (non-fatal):', ensureErr.message);
      }

      // Insert event record
      const { error: eventError } = await supabase.from('onboarding_events').insert({
        session_id,
        user_id: user_id ?? null,
        event,
        step: step ?? null,
        properties: properties ?? null,
        created_at: now,
      });

      if (eventError) {
        console.error('[track-onboarding] event insert error:', eventError);
        // Non-fatal: continue to funnel updates
      }

      // ── Backfill user_id on funnel row if it's currently null and we have a user_id
      if (user_id) {
        await supabase
          .from('onboarding_funnel')
          .update({ user_id, updated_at: now })
          .eq('session_id', session_id)
          .is('user_id', null);
      }

      // ── Update max_step_reached ───────────────────────────────────────────────
      if (typeof step === 'number') {
        const { data: funnelRow } = await supabase
          .from('onboarding_funnel')
          .select('max_step_reached')
          .eq('session_id', session_id)
          .single();

        const currentStep = funnelRow?.max_step_reached ?? 0;
        if (step > currentStep) {
          await supabase
            .from('onboarding_funnel')
            .update({ max_step_reached: step, updated_at: now })
            .eq('session_id', session_id);
        } else {
          await supabase
            .from('onboarding_funnel')
            .update({ updated_at: now })
            .eq('session_id', session_id);
        }
      }

      // ── Paywall: trial ────────────────────────────────────────────────────────
      if (event === 'onboarding_paywall_start_trial') {
        await supabase
          .from('onboarding_funnel')
          .update({
            first_paywall_action: 'trial',
            paywall_action_at: now,
            paywall_shown_at: now,
            paywall_shown: true,
            trial_started: true,
            updated_at: now,
          })
          .eq('session_id', session_id)
          .is('first_paywall_action', null);
      }

      // ── Paywall: skip ─────────────────────────────────────────────────────────
      if (event === 'onboarding_paywall_skip') {
        await supabase
          .from('onboarding_funnel')
          .update({
            first_paywall_action: 'skip',
            paywall_action_at: now,
            paywall_shown_at: now,
            paywall_shown: true,
            trial_skipped: true,
            updated_at: now,
          })
          .eq('session_id', session_id)
          .is('first_paywall_action', null);
      }

      // ── Paywall shown (view only, no action yet) ───────────────────────────────
      if (event === 'onboarding_paywall_shown') {
        await supabase
          .from('onboarding_funnel')
          .update({ paywall_shown: true, paywall_shown_at: now, updated_at: now })
          .eq('session_id', session_id)
          .is('paywall_shown_at', null);
      }

      // ── Completed ─────────────────────────────────────────────────────────────
      if (event === 'onboarding_completed') {
        await supabase
          .from('onboarding_funnel')
          .update({ completed: true, completed_at: now, updated_at: now })
          .eq('session_id', session_id);
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('[track-onboarding] unhandled error:', e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
