import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    const food_item_id = body?.food_item_id;

    if (typeof food_item_id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(food_item_id)) {
      return new Response(
        JSON.stringify({ error: 'A valid catalog food_item_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Legacy clients send the public key, so keep aggregate usage compatible.
    // Never attribute an event using the caller-controlled body user_id.
    let verifiedUserId: string | null = null;
    const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') ?? '');
    const token = match?.[1];
    if (token && token !== Deno.env.get('SUPABASE_ANON_KEY')) {
      try {
        const { data, error } = await supabase.auth.getUser(token);
        if (!error && data?.user?.id) verifiedUserId = data.user.id;
      } catch {
        // Preserve anonymous aggregate counters; do not fall back to body identity.
      }
    }

    // 1. Insert usage log row
    const { error: insertError } = await supabase
      .from('food_usage_logs')
      .insert({
        food_item_id,
        user_id: verifiedUserId,
        logged_at: new Date().toISOString(),
      });

    if (insertError) {
      // External/stale food IDs can be logged as meals without being catalog rows.
      // Skip optional analytics for this exact FK only; never attribute a fake event.
      if (insertError.code === '23503' && insertError.message.includes('food_usage_logs_food_item_id_fkey')) {
        return new Response(JSON.stringify({ success: true, recorded: false, reason: 'not_in_catalog' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.error('[log-food-usage] Insert failed:', insertError.code);
      return new Response(
        JSON.stringify({ error: 'Food usage unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Recompute all three counters + last_logged_at atomically via RPC
    const { error: rpcError } = await supabase.rpc('update_food_item_log_counts', {
      p_food_item_id: food_item_id,
    });

    if (rpcError) {
      console.error('[log-food-usage] Counter refresh failed:', rpcError.code);
      return new Response(
        JSON.stringify({ error: 'Food usage unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
