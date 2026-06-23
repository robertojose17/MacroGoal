import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';
import { toLocalDateString } from '@/utils/dateUtils';

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZ3B0ZmlvZm9hZWd1c2xndmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1NDI4NjcsImV4cCI6MjA3OTExODg2N30.iC4P3lp4fJHLsYNWBwHwFwGP-WZuJONETOYd2q1lQWA';

export interface Tracker {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  tracker_type: 'binary' | 'count' | 'numeric' | 'duration';
  unit: string | null;
  goal_value: number | null;
  frequency: 'daily' | 'weekly';
  is_default: boolean;
  sort_order: number;
  created_at: string;
}

export interface TrackerEntry {
  id: string;
  tracker_id: string;
  user_id: string;
  date: string;
  value: number;
  notes: string | null;
  created_at: string;
}

export interface TrackerStats {
  current_streak: number;
  best_streak: number;
  completion_rate: number;
  days_tracked: number;
  days_goal_met: number;
  this_week_count: number;
  last_week_count: number;
  total_entries: number;
  avg_value: number | null;
  status: 'on_track' | 'improving' | 'behind' | 'no_data' | 'off_track';
}

async function getCurrentUserId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Not authenticated');
  return user.id;
}

export async function listTrackers(): Promise<Tracker[]> {
  console.log('[TrackersApi] listTrackers()');
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('trackers')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[TrackersApi] listTrackers error:', error.message);
    throw new Error(error.message);
  }

  const trackers = data ?? [];

  // Seed default trackers if none exist
  if (trackers.length === 0) {
    console.log('[TrackersApi] No trackers found, seeding defaults');
    const defaults = [
      { user_id: userId, name: 'weight', emoji: '⚖️', tracker_type: 'numeric', unit: 'lb', goal_value: null, frequency: 'daily', is_default: true, sort_order: 0 },
      { user_id: userId, name: 'steps',  emoji: '👟', tracker_type: 'numeric', unit: 'steps', goal_value: 10000, frequency: 'daily', is_default: true, sort_order: 1 },
      { user_id: userId, name: 'gym',    emoji: '🏋️', tracker_type: 'binary',  unit: null, goal_value: null, frequency: 'daily', is_default: true, sort_order: 2 },
    ];
    const { data: created, error: createError } = await supabase
      .from('trackers')
      .insert(defaults)
      .select();
    if (createError) {
      console.error('[TrackersApi] Seed error:', createError.message);
      throw new Error(createError.message);
    }
    console.log('[TrackersApi] Seeded', created?.length, 'default trackers');
    return created ?? [];
  }

  // Fix existing weight tracker records that have the wrong unit (kg instead of lb)
  const weightTracker = trackers.find(t => t.name.toLowerCase() === 'weight');
  if (weightTracker && weightTracker.unit !== 'lb') {
    console.log('[TrackersApi] Weight tracker has wrong unit:', weightTracker.unit, '— updating to lb');
    await supabase.from('trackers').update({ unit: 'lb' }).eq('id', weightTracker.id);
    weightTracker.unit = 'lb'; // update in memory too
  }

  console.log('[TrackersApi] Loaded', trackers.length, 'trackers');
  return trackers;
}

export async function createTracker(data: Partial<Tracker>): Promise<Tracker> {
  console.log('[TrackersApi] createTracker()', data);
  const userId = await getCurrentUserId();

  const { data: result, error } = await supabase
    .from('trackers')
    .insert({ ...data, user_id: userId })
    .select()
    .single();

  if (error) {
    console.error('[TrackersApi] createTracker error:', error.message);
    throw new Error(error.message);
  }
  console.log('[TrackersApi] Created tracker:', result.id);
  return result;
}

export async function updateTracker(id: string, data: Partial<Tracker>): Promise<Tracker> {
  console.log('[TrackersApi] updateTracker()', id);
  const userId = await getCurrentUserId();

  const { data: result, error } = await supabase
    .from('trackers')
    .update(data)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('[TrackersApi] updateTracker error:', error.message);
    throw new Error(error.message);
  }
  return result;
}

export async function updateTrackerGoal(trackerId: string, goalValue: number | null): Promise<void> {
  console.log('[TrackersApi] updateTrackerGoal()', trackerId, goalValue);
  const { error } = await supabase
    .from('trackers')
    .update({ goal_value: goalValue, updated_at: new Date().toISOString() })
    .eq('id', trackerId);
  if (error) {
    console.error('[trackersApi] updateTrackerGoal error:', error);
    throw new Error(error.message);
  }
  console.log('[TrackersApi] updateTrackerGoal success for tracker:', trackerId);
}

export async function deleteTracker(id: string): Promise<void> {
  console.log('[TrackersApi] deleteTracker()', id);
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from('trackers')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    console.error('[TrackersApi] deleteTracker error:', error.message);
    throw new Error(error.message);
  }
}

export async function listEntries(trackerId: string, limit = 90): Promise<TrackerEntry[]> {
  console.log('[TrackersApi] listEntries()', trackerId);
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('tracker_entries')
    .select('*')
    .eq('tracker_id', trackerId)
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[TrackersApi] listEntries error:', error.message);
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function logEntry(
  trackerId: string,
  date: string,
  value: number,
  notes?: string,
): Promise<TrackerEntry> {
  console.log('[TrackersApi] logEntry()', trackerId, date, value);
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('tracker_entries')
    .upsert(
      { tracker_id: trackerId, user_id: userId, date, value, notes: notes ?? null },
      { onConflict: 'tracker_id,date' }
    )
    .select()
    .single();

  if (error) {
    console.error('[TrackersApi] logEntry error:', error.message);
    throw new Error(error.message);
  }
  return data;
}

export async function updateEntry(
  trackerId: string,
  entryId: string,
  data: Partial<TrackerEntry>,
): Promise<TrackerEntry> {
  console.log('[TrackersApi] updateEntry()', entryId);
  const userId = await getCurrentUserId();

  const { data: result, error } = await supabase
    .from('tracker_entries')
    .update({ value: data.value, notes: data.notes })
    .eq('id', entryId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('[TrackersApi] updateEntry error:', error.message);
    throw new Error(error.message);
  }
  return result;
}

export async function deleteEntry(
  trackerId: string,
  entryId: string,
  opts?: { syncCheckIns?: boolean; date?: string },
): Promise<void> {
  console.log('[TrackersApi] deleteEntry()', entryId, opts);
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from('tracker_entries')
    .delete()
    .eq('id', entryId)
    .eq('user_id', userId);

  if (error) {
    console.error('[TrackersApi] deleteEntry error:', error.message);
    throw new Error(error.message);
  }

  // Bidirectional sync: also null-out the weight column on the matching check_ins row.
  // check_ins has no 'type' column — weight rows are identified by weight IS NOT NULL.
  // We null the weight field rather than deleting the whole row (the row may have
  // other fields like steps that should be preserved).
  if (opts?.syncCheckIns && opts.date) {
    console.log('[TrackersApi] deleteEntry — nulling check_ins.weight for date:', opts.date);
    const { error: ciError } = await supabase
      .from('check_ins')
      .update({ weight: null })
      .eq('user_id', userId)
      .eq('date', opts.date);

    if (ciError) {
      // Non-fatal: log but don't throw — tracker_entries row is already gone
      console.warn('[TrackersApi] deleteEntry check_ins sync error:', ciError.message);
    } else {
      console.log('[TrackersApi] deleteEntry — check_ins.weight nulled for date:', opts.date);
    }
  }
}

/**
 * Backfill tracker_entries from check_ins for the weight tracker.
 *
 * Mirrors EXACTLY what ProgressCard.loadWeightCheckIns does:
 *   - Table: check_ins
 *   - Columns: date, weight
 *   - Filter: user_id, weight IS NOT NULL
 *   - Conversion: weight (kg) * 2.20462 → lbs  (ProgressCard always does this)
 *
 * The weight tracker unit is 'lb', so every entry is stored in lbs to match
 * the dots shown on the Weight Progress graph.
 */
export async function backfillWeightFromCheckIns(weightTrackerId: string): Promise<void> {
  console.log('[TrackersApi] backfillWeightFromCheckIns() trackerId:', weightTrackerId);
  const userId = await getCurrentUserId();

  // Fetch ALL check_ins rows that have a weight value — no date range restriction,
  // so every dot on the graph gets a matching tracker_entries row.
  const { data: checkIns, error: ciError } = await supabase
    .from('check_ins')
    .select('date, weight')
    .eq('user_id', userId)
    .not('weight', 'is', null)
    .order('date', { ascending: false });

  if (ciError) {
    console.warn('[TrackersApi] backfillWeightFromCheckIns fetch error:', ciError.message);
    return;
  }

  if (!checkIns || checkIns.length === 0) {
    console.log('[TrackersApi] backfillWeightFromCheckIns — no weight check_ins to backfill');
    return;
  }

  console.log('[TrackersApi] backfillWeightFromCheckIns — found', checkIns.length, 'check_ins rows');

  // ProgressCard always converts kg → lbs with * 2.20462 — we do the same so
  // the value stored here matches the dot position on the graph exactly.
  const rows = checkIns.map((ci: { date: string; weight: number }) => {
    const valueLbs = Number(ci.weight) * 2.20462;
    return {
      tracker_id: weightTrackerId,
      user_id: userId,
      date: ci.date,
      value: Math.round(valueLbs * 10) / 10, // 1 decimal place, matches graph display
      notes: null,
    };
  });

  const { error: upsertError } = await supabase
    .from('tracker_entries')
    .upsert(rows, { onConflict: 'tracker_id,date' });

  if (upsertError) {
    console.warn('[TrackersApi] backfillWeightFromCheckIns upsert error:', upsertError.message);
  } else {
    console.log('[TrackersApi] backfillWeightFromCheckIns — upserted', rows.length, 'rows (kg→lbs) successfully');
  }
}

export async function getStats(trackerId: string): Promise<TrackerStats> {
  console.log('[TrackersApi] getStats()', trackerId);
  const userId = await getCurrentUserId();

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = toLocalDateString(thirtyDaysAgo);

  const [entriesResult, trackerResult] = await Promise.all([
    supabase
      .from('tracker_entries')
      .select('date, value, created_at')
      .eq('tracker_id', trackerId)
      .eq('user_id', userId)
      .gte('date', thirtyDaysAgoStr)
      .order('date', { ascending: false }),
    supabase
      .from('trackers')
      .select('goal_value')
      .eq('id', trackerId)
      .eq('user_id', userId)
      .single(),
  ]);

  if (entriesResult.error) {
    console.error('[TrackersApi] getStats entries error:', entriesResult.error.message);
    throw new Error(entriesResult.error.message);
  }

  const entries = entriesResult.data ?? [];
  const tracker = trackerResult.data;

  // All entry dates (for non-streak metrics — backdating still counts here)
  const entryDates = new Set(entries.map((e: { date: string }) => e.date));
  const daysTracked = entryDates.size;

  // ── Get streak from user_xp (single source of truth) ──
  let finalStreak = 0;
  let bestStreak = 0;

  try {
    const { data: userXpData } = await supabase
      .from('user_xp')
      .select('current_streak, longest_streak')
      .eq('user_id', userId)
      .maybeSingle();

    finalStreak = userXpData?.current_streak ?? 0;
    bestStreak = userXpData?.longest_streak ?? 0;
    console.log('[TrackersApi] streak from user_xp — current:', finalStreak, 'best:', bestStreak);
  } catch (e) {
    console.warn('[TrackersApi] user_xp streak read failed, using 0:', e);
  }

  // Days goal met
  let daysGoalMet = 0;
  if (tracker?.goal_value != null) {
    daysGoalMet = entries.filter((e: { value: number }) => e.value >= tracker.goal_value).length;
  }

  // This week / last week
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() + mondayOffset);
  thisMonday.setHours(0, 0, 0, 0);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setDate(thisMonday.getDate() - 1);

  const thisMondayStr = toLocalDateString(thisMonday);
  const lastMondayStr = toLocalDateString(lastMonday);
  const lastSundayStr = toLocalDateString(lastSunday);

  const thisWeekCount = entries.filter((e: { date: string }) => e.date >= thisMondayStr).length;
  const lastWeekCount = entries.filter((e: { date: string }) => e.date >= lastMondayStr && e.date <= lastSundayStr).length;

  const avgValue = daysTracked > 0
    ? entries.reduce((sum: number, e: { value: number }) => sum + Number(e.value), 0) / daysTracked
    : null;

  let status: TrackerStats['status'] = 'no_data';
  if (daysTracked > 0) {
    status = finalStreak > 0 || thisWeekCount > 0 ? 'on_track' : 'off_track';
  }

  return {
    current_streak: finalStreak,
    best_streak: bestStreak,
    completion_rate: daysTracked / 30,
    days_tracked: daysTracked,
    days_goal_met: daysGoalMet,
    this_week_count: thisWeekCount,
    last_week_count: lastWeekCount,
    total_entries: daysTracked,
    avg_value: avgValue,
    status,
  };
}
