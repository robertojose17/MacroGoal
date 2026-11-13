import { dayNumber, dateForDay, emptyTdee, estimateDynamicTdee, hasSupportedAdultAge, type DynamicTdeeResult, type TdeeWeight } from '../_shared/dynamic-tdee.ts';
export interface DataSources {
  timezone: string; dateOfBirth: string | null; journeyStartDate?: string | null;
  trackers: Array<{ id: string; unit: string | null }>;
  trackerWeights: Array<{ tracker_id: string; date: string; value: number; created_at: string }>;
  checkIns: Array<{ date: string; weight: number; updated_at: string | null; created_at: string | null }>;
  meals: Array<{ id: string; date: string; meal_type: string }>;
  items: Array<{ meal_id: string; calories: number; is_scheduled: boolean }>;
}
export function todayInZone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
// Accept finite numeric database values, including decimal strings from adapters.
// Unknown values, empty strings, booleans and objects must not become zero.
function sourceNumber(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' ||
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))) return NaN;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}
export function estimateFromSources(data: DataSources, now: Date): DynamicTdeeResult {
  let today: string;
  try { today = todayInZone(now, data.timezone); } catch { return emptyTdee('invalid_data'); }
  if (!hasSupportedAdultAge(data.dateOfBirth, today)) return emptyTdee('unsupported_age');
  const cutoff = dateForDay(dayNumber(today)! - 29);
  if (data.journeyStartDate != null && dayNumber(data.journeyStartDate) === null) return emptyTdee('invalid_data');
  const minDate = data.journeyStartDate && data.journeyStartDate > cutoff ? data.journeyStartDate : cutoff;
  const checkIns = new Map<string, { kg: number; at: string }>();
  const trackerWeights = new Map<string, { kg: number; at: string }>();
  const validDate = (date: string) => date >= minDate && date < today;
  for (const row of data.checkIns) {
    if (!validDate(row.date)) continue;
    const at = row.updated_at ?? row.created_at ?? '';
    const kg = sourceNumber(row.weight);
    if (checkIns.has(row.date) && at === checkIns.get(row.date)!.at && kg !== checkIns.get(row.date)!.kg) return emptyTdee('invalid_data');
    if (!checkIns.has(row.date) || at > checkIns.get(row.date)!.at) checkIns.set(row.date, { kg, at });
  }
  const units = new Map(data.trackers.map(t => [t.id, t.unit]));
  for (const row of data.trackerWeights) {
    if (!validDate(row.date)) continue;
    const unit = units.get(row.tracker_id)?.toLowerCase();
    // Storage contract: app weight tracker is lb; honor explicitly tagged kg, never guess.
    if (!unit || !['kg', 'lb', 'lbs'].includes(unit)) return emptyTdee('invalid_data');
    const kg = sourceNumber(row.value) / (unit === 'kg' ? 1 : 2.2046226218);
    if (trackerWeights.has(row.date) && row.created_at === trackerWeights.get(row.date)!.at && kg !== trackerWeights.get(row.date)!.kg) return emptyTdee('invalid_data');
    if (!trackerWeights.has(row.date) || row.created_at > trackerWeights.get(row.date)!.at) trackerWeights.set(row.date, { kg, at: row.created_at });
  }
  if ([...checkIns.values(), ...trackerWeights.values()].some(value => !Number.isFinite(value.kg))) return emptyTdee('invalid_data');
  const merged = new Map(checkIns);
  for (const [date, value] of trackerWeights) {
    const check = checkIns.get(date);
    if (check && Math.abs(check.kg - value.kg) > 0.5) return emptyTdee('invalid_data');
    merged.set(date, check && check.at > value.at ? check : value);
  }
  const weights: TdeeWeight[] = [...merged].map(([date, value]) => ({ date, kg: value.kg }));
  const meals = new Map(data.meals.map(m => [m.id, m]));
  const daily = new Map<string, { calories: number; types: Set<string> }>();
  for (const item of data.items) {
    if (item.is_scheduled === true) continue;
    if (item.is_scheduled !== false) return emptyTdee('invalid_data');
    const meal = meals.get(item.meal_id);
    if (!meal) return emptyTdee('invalid_data');
    if (!validDate(meal.date)) continue;
    const calories = sourceNumber(item.calories);
    if (!Number.isFinite(calories) || calories < 0) return emptyTdee('invalid_data');
    // Legacy writers store both unknown energy and declared zero as 0. Without
    // persisted provenance neither is safe evidence for expenditure estimation.
    // Retain the diary entry, but withhold this estimate instead of undercounting.
    if (calories === 0) return emptyTdee('unknown_calorie_provenance', 'paused');
    const day = daily.get(meal.date) ?? { calories: 0, types: new Set<string>() };
    day.calories += calories;
    if (calories > 0 && meal.meal_type) day.types.add(meal.meal_type);
    daily.set(meal.date, day);
  }
  return estimateDynamicTdee({ today, weights, intake: [...daily].map(([date, d]) => ({ date, calories: d.calories, mealTypes: d.types.size })) });
}

/** Same dated sources as the estimator. Never use an old profile weight for lean-body macros. */
export function weightAtEstimateDate(data: DataSources, date: string | null): number | null {
  if (!date) return null;
  const units = new Map(data.trackers.map(t => [t.id, t.unit?.toLowerCase()]));
  const readings = [
    ...data.checkIns.filter(w => w.date === date).map(w => ({ kg: sourceNumber(w.weight), at: w.updated_at ?? w.created_at ?? '' })),
    ...data.trackerWeights.filter(w => w.date === date).map(w => ({ kg: units.get(w.tracker_id) === 'kg' ? sourceNumber(w.value) : ['lb','lbs'].includes(units.get(w.tracker_id) ?? '') ? sourceNumber(w.value) / 2.2046226218 : NaN, at: w.created_at })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return readings.length && Number.isFinite(readings[0].kg) ? readings[0].kg : null;
}
