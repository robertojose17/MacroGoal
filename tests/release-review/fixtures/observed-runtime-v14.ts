import { createClient } from 'npm:@supabase/supabase-js@2.83.0';
import { createObservationHandler, type ObservationContext } from './handler.ts';
import { todayInZone } from '../dynamic-tdee/data.ts';
import { dayNumber, dateForDay } from '../_shared/dynamic-tdee.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_ANON_KEY')!;
const client = (authorization?: string) => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  ...(authorization ? { global: { headers: { Authorization: authorization } } } : {}),
});
// Refuse incomplete/truncated source pages. These are ordinary caller-RLS reads,
// not a transactionally coherent clinical evidence snapshot.
async function allRows<T>(query: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown; count: number | null }>): Promise<T[]> {
  const rows: T[] = [];
  let expected: number | null = null;
  for (let offset = 0; offset < 5000; offset += 500) {
    const { data, error, count } = await query(offset, offset + 499);
    if (error || !Array.isArray(data) || !Number.isInteger(count) || count === null || count < 0 || count > 5000) throw new Error('source_unavailable');
    if (expected !== null && expected !== count) throw new Error('source_changed');
    expected = count;
    rows.push(...data);
    if (rows.length === count) {
      if (new Set(rows.map(row => (row as {id: unknown}).id)).size !== rows.length) throw new Error('source_changed');
      return rows;
    }
    if (data.length < 500 || rows.length > count) throw new Error('source_truncated');
  }
  throw new Error('source_limit');
}
export async function readObservedSources(owner: string, authorization: string, now: Date) {
  const db = client(authorization);
  const profile = await db.from('users').select('timezone, date_of_birth, journey_start_date').eq('id', owner).single();
  if (profile.error || !profile.data) throw new Error('profile_unavailable');
  const today = todayInZone(now, profile.data.timezone);
  const start = dateForDay(dayNumber(today)! - 29);
  const trackerResult = await db.from('trackers').select('id, unit').eq('user_id', owner).eq('is_default', true).ilike('name', 'weight').limit(2);
  if (trackerResult.error || !trackerResult.data || trackerResult.data.length > 1) throw new Error('tracker_unavailable');
  const trackers = trackerResult.data;
  const [checkIns, trackerWeights, meals] = await Promise.all([
    allRows((a, b) => db.from('check_ins').select('id, date, weight, updated_at, created_at', { count: 'exact' }).eq('user_id', owner).not('weight', 'is', null).gte('date', start).lt('date', today).order('id').range(a, b)),
    trackers.length ? allRows((a, b) => db.from('tracker_entries').select('id, tracker_id, date, value, created_at', { count: 'exact' }).eq('user_id', owner).eq('tracker_id', trackers[0].id).gte('date', start).lt('date', today).order('id').range(a, b)) : Promise.resolve([]),
    allRows((a, b) => db.from('meals').select('id, date, meal_type', { count: 'exact' }).eq('user_id', owner).gte('date', start).lt('date', today).order('id').range(a, b)),
  ]);
  if (meals.length > 500) throw new Error('meal_limit');
  const items = meals.length ? await allRows((a, b) => db.from('meal_items').select('id, meal_id, calories, is_scheduled', { count: 'exact' }).in('meal_id', meals.map(m => m.id)).eq('is_scheduled', false).order('id').range(a, b)) : [];
  return { timezone: profile.data.timezone, dateOfBirth: profile.data.date_of_birth, journeyStartDate: profile.data.journey_start_date,
    trackers, trackerWeights, checkIns, meals, items };
}
async function rpc(authorization: string, name: string, params?: Record<string, unknown>): Promise<ObservationContext> {
  const { data, error } = await client(authorization).rpc(name, params);
  if (error || !data) throw new Error(error?.message ?? 'source_error');
  return data as ObservationContext;
}
export const handleObservation = createObservationHandler({
  authenticate: async token => { const { data, error } = await client().auth.getUser(token); return error ? null : data.user?.id ?? null; },
  context: authorization => rpc(authorization, 'observed_get_dynamic_tdee_context_v1'),
  settings: (authorization, enabled, reviewDay) => rpc(authorization, 'observed_set_dynamic_tdee_settings_v1', { p_enabled: enabled, p_review_day: reviewDay }),
  read: readObservedSources,
});
