import { todayInZone } from '../dynamic-tdee/data.ts';
import { dayNumber, dateForDay } from '../_shared/dynamic-tdee.ts';
export type { UserProfile, GoalRow, TdeeEstimateRow } from '../progress-intelligence/queries.ts';
type DB = any;
const PROFILE = 'id,sex,date_of_birth,height,current_weight,goal_weight,activity_level,weight_unit,journey_start_date,journey_start_weight,preferred_units,timezone';
const GOAL = 'id,updated_at,daily_calories,protein_g,carbs_g,fats_g,fiber_g,goal_type,loss_rate_lbs_per_week,macro_preset,base_daily_calories,last_adaptive_update,created_at,is_active,start_date';
export async function allRows(query: (a: number, b: number) => PromiseLike<any>): Promise<any[]> {
  const rows: any[] = []; let expected: number | null = null;
  for (let offset = 0; offset < 5000; offset += 500) {
    const { data, error, count } = await query(offset, offset + 499);
    if (error || !Array.isArray(data) || !Number.isInteger(count) || count < 0 || count > 5000)
      throw new Error('source_unavailable');
    if (expected !== null && expected !== count) throw new Error('source_changed');
    expected = count; rows.push(...data);
    if (rows.length === count) {
      if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error('source_changed');
      return rows;
    }
    if (data.length < 500 || rows.length > count) throw new Error('source_truncated');
  }
  throw new Error('source_limit');
}
function activeGoalAcceptedAt(activeGoal: any, now: Date): number {
  const value = activeGoal?.created_at;
  const parts = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(value) : null;
  const acceptedAt = parts ? Date.parse(value) : NaN;
  const year = Number(parts?.[1]), month = Number(parts?.[2]), day = Number(parts?.[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // Date.parse normalizes some invalid calendar dates and truncates fractions.
  // Refuse both rather than allowing a future microsecond to appear current.
  if (!parts || month < 1 || month > 12 || day < 1 || day > days[month - 1]
      || Number(parts[4]) > 23 || Number(parts[5]) > 59 || Number(parts[6]) > 59
      || !Number.isFinite(acceptedAt) || !Number.isFinite(now.getTime()) || acceptedAt > now.getTime()
      || (acceptedAt === now.getTime() && /[1-9]/.test((parts[7] ?? '').slice(3))))
    throw new Error('active_goal_unavailable');
  return acceptedAt;
}
export function assertCurrentGoalHistory(activeGoal: any, allGoals: any[], now: Date): void {
  const activeRows = allGoals.filter(row => row.is_active === true);
  if (activeGoal === null) {
    if (activeRows.length !== 0) throw new Error('context_changed');
    return;
  }
  activeGoalAcceptedAt(activeGoal, now);
  if (typeof activeGoal.id !== 'string' || !activeGoal.id || activeGoal.is_active !== true)
    throw new Error('active_goal_unavailable');
  const matches = allGoals.filter(row => row.id === activeGoal.id);
  if (matches.length !== 1 || activeRows.length !== 1 || activeRows[0].id !== activeGoal.id)
    throw new Error('context_changed');
  // Both reads select the same complete snapshot. A mixed historical/current
  // goal is unavailable even when the row ID or acceptance timestamp is reused.
  if (GOAL.split(',').some(key => matches[0][key] !== activeGoal[key]))
    throw new Error('context_changed');
}
export async function fetchPreviewData(db: DB, owner: string, now: Date) {
  const [{ data: profile, error: profileError }, { data: activeGoal, error: goalError }] = await Promise.all([
    db.from('users').select(PROFILE).eq('id', owner).single(),
    db.from('goals').select(GOAL).eq('user_id', owner).eq('is_active', true).maybeSingle(),
  ]);
  if (profileError || !profile || goalError) throw new Error('source_unavailable');
  if (activeGoal && (!['daily_calories','protein_g','carbs_g','fats_g','fiber_g'].every(key =>
    typeof activeGoal[key] === 'number' && Number.isFinite(activeGoal[key]) && activeGoal[key] >= 0) || activeGoal.daily_calories <= 0))
    throw new Error('active_goal_unavailable');
  if (activeGoal !== null) activeGoalAcceptedAt(activeGoal, now);
  const todayStr = todayInZone(now, profile.timezone), phaseStart = profile.journey_start_date;
  if (!phaseStart || dayNumber(phaseStart) === null || phaseStart > todayStr) throw new Error('phase_unavailable');
  const start = [phaseStart, dateForDay(dayNumber(todayStr)! - 60)].sort().at(-1)!;
  const tracker = await db.from('trackers').select('id,unit').eq('user_id', owner).eq('is_default', true).ilike('name','weight').limit(2);
  if (tracker.error || !Array.isArray(tracker.data) || tracker.data.length > 1) throw new Error('source_unavailable');
  const selected = tracker.data[0];
  if (selected && !['kg','kgs','kilograms','lb','lbs','pounds'].includes(String(selected.unit).toLowerCase())) throw new Error('weight_unit_unavailable');
  const [allGoals, checkInWeights, rawTracker, meals, tdeeEstimates] = await Promise.all([
    allRows((a,b) => db.from('goals').select(GOAL,{count:'exact'}).eq('user_id',owner).lte('created_at',now.toISOString()).order('id').range(a,b)),
    allRows((a,b) => db.from('check_ins').select('id,date,weight,updated_at',{count:'exact'}).eq('user_id',owner).not('weight','is',null).gte('date',phaseStart).lte('date',todayStr).order('id').range(a,b)),
    selected ? allRows((a,b) => db.from('tracker_entries').select('id,date,value',{count:'exact'}).eq('user_id',owner).eq('tracker_id',selected.id).gte('date',phaseStart).lte('date',todayStr).order('id').range(a,b)) : Promise.resolve([]),
    allRows((a,b) => db.from('meals').select('id,date,meal_type',{count:'exact'}).eq('user_id',owner).gte('date',start).lte('date',todayStr).order('id').range(a,b)),
    allRows((a,b) => db.from('tdee_estimates').select('id,week_start,created_at,estimated_tdee,prescribed_calories,adjustment_amount,adjustment_applied,skip_reason,avg_calories_eaten,avg_weight_lbs,data_days_count',{count:'exact'}).eq('user_id',owner).lte('week_start',todayStr).lte('created_at',now.toISOString()).order('id').range(a,b)),
  ]);
  assertCurrentGoalHistory(activeGoal, allGoals, now);
  if (meals.length > 500) throw new Error('source_limit');
  const items = meals.length ? await allRows((a,b) => db.from('meal_items').select('id,meal_id,calories,protein,carbs,fats',{count:'exact'}).in('meal_id',meals.map(m=>m.id)).eq('is_scheduled',false).order('id').range(a,b)) : [];
  for (const row of [...checkInWeights.map(r=>({value:r.weight})), ...rawTracker])
    if (!Number.isFinite(Number(row.value)) || Number(row.value) <= 0) throw new Error('source_unavailable');
  for (const row of items) for (const key of ['calories','protein','carbs','fats'])
    if (row[key] == null || !Number.isFinite(Number(row[key])) || Number(row[key]) < 0) throw new Error('source_unavailable');
  const kg = selected && ['kg','kgs','kilograms'].includes(String(selected.unit).toLowerCase());
  const trackerWeights = rawTracker.map(r=>({...r,value:Number(r.value)*(kg?2.20462:1)}));
  const nutritionRaw = meals.map(m=>({...m,meal_items:items.filter(i=>i.meal_id===m.id)}));
  const [profileAfter, goalAfter] = await Promise.all([
    db.from('users').select(PROFILE).eq('id',owner).single(),
    db.from('goals').select(GOAL).eq('user_id',owner).eq('is_active',true).maybeSingle(),
  ]);
  if (profileAfter.error || goalAfter.error || JSON.stringify(profileAfter.data)!==JSON.stringify(profile) || JSON.stringify(goalAfter.data)!==JSON.stringify(activeGoal))
    throw new Error('context_changed');
  tdeeEstimates.sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  // Bounded independent RLS reads, not an atomic or clinically validated snapshot.
  return {profile,activeGoal,allGoals,checkInWeights,trackerWeights,nutritionRaw,tdeeEstimates,todayStr};
}
