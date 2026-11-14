import { createTesterRefresh } from './scoped-tester-refresh.mjs';
import { createClient } from 'npm:@supabase/supabase-js@2.83.0';
import { createObservationHandler, type ObservationContext } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_ANON_KEY')!;
const client = (authorization?: string) => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  ...(authorization ? { global: { headers: { Authorization: authorization } } } : {}),
});
async function rpc(authorization: string, name: string, params?: Record<string, unknown>): Promise<ObservationContext> {
  const { data, error } = await client(authorization).rpc(name, params);
  if (error || !data) throw new Error(error?.message ?? 'source_error');
  return data as ObservationContext;
}
const prepare = createTesterRefresh({
 readContext: authorization => rpc(authorization, 'observed_get_dynamic_tdee_context_v1'),
 refreshAuthority: async authorization => {
  const response=await fetch(url+'/functions/v1/common-premium-authority',{
   method:'GET',headers:{Authorization:authorization,apikey:key},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('observation_unavailable');
  return response.json();
 },
});
export const handleObservation = createObservationHandler({
  prepare,
  authenticate: async token => { const { data, error } = await client().auth.getUser(token); return error ? null : data.user?.id ?? null; },
  context: authorization => rpc(authorization, 'observed_get_dynamic_tdee_context_v1'),
  settings: (authorization, enabled, reviewDay) => rpc(authorization, 'observed_set_dynamic_tdee_settings_v1', { p_enabled: enabled, p_review_day: reviewDay }),
  snapshot: async authorization => {
    const { data, error } = await client(authorization).rpc('observed_get_tdee_snapshot_v1');
    if (error || !data) throw new Error(error?.message ?? 'source_error');
    return data;
  },
});
