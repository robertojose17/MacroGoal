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

    if (action === 'start_session') {
      const { user_id } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: 'user_id required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

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

      const session_id = crypto.randomUUID();
      const { error } = await supabase.from('onboarding_funnel').insert({
        session_id,
        user_id,
        max_step_reached: 0,
        completed: false,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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

    if (action === 'track_event') {
      const { session_id, user_id, event, step, properties } = body;
      if (!session_id || !event) {
        return new Response(JSON.stringify({ error: 'session_id and event required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error: eventError } = await supabase.from('onboarding_events').insert({
        session_id,
        user_id: user_id ?? null,
        event,
        step: step ?? null,
        properties: properties ?? null,
        created_at: new Date().toISOString(),
      });

      if (eventError) {
        console.error('[track-onboarding] event insert error:', eventError);
      }

      const now = new Date().toISOString();

      if (typeof step === 'number') {
        const { data: current } = await supabase
          .from('onboarding_funnel')
          .select('max_step_reached')
          .eq('session_id', session_id)
          .single();
        if (current && step > (current.max_step_reached ?? 0)) {
          await supabase
            .from('onboarding_funnel')
            .update({ max_step_reached: step, updated_at: now })
            .eq('session_id', session_id);
        }
      }

      if (event === 'onboarding_paywall_start_trial') {
        await supabase
          .from('onboarding_funnel')
          .update({ first_paywall_action: 'trial', paywall_action_at: now, paywall_shown_at: now, updated_at: now })
          .eq('session_id', session_id)
          .is('first_paywall_action', null);
      }

      if (event === 'onboarding_paywall_skip') {
        await supabase
          .from('onboarding_funnel')
          .update({ first_paywall_action: 'skip', paywall_action_at: now, paywall_shown_at: now, updated_at: now })
          .eq('session_id', session_id)
          .is('first_paywall_action', null);
      }

      if (event === 'first_meal_logged') {
        await supabase
          .from('onboarding_funnel')
          .update({ first_meal_at: now, updated_at: now })
          .eq('session_id', session_id)
          .is('first_meal_at', null);
      }

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
