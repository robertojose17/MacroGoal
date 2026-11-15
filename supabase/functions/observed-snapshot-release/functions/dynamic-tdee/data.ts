import type {UserEnteredNutritionEvidence} from './nutrient-evidence.ts';
import { dayNumber, dateForDay, emptyTdee, estimateDynamicTdee, hasSupportedAdultAge, type DynamicTdeeResult, type TdeeWeight } from '../_shared/dynamic-tdee.ts';
export interface DataSources {
  timezone: string; dateOfBirth: string | null; journeyStartDate?: string | null;
  nutritionFieldsVersion?: 'logged-macros-v1';
  nutritionEvidenceVersion?: 'user-entered-v1';
  trackers: Array<{ id: string; unit: string | null }>;
  trackerWeights: Array<{ tracker_id: string; date: string; value: number; created_at: string }>;
  checkIns: Array<{ date: string; weight: number; updated_at: string | null; created_at: string | null }>;
  meals: Array<{ id: string; date: string; meal_type: string }>;
  items: Array<{ id?: string; nutrition_revision?: string | null; nutrition_evidence?: UserEnteredNutritionEvidence | null; meal_id: string; calories: number; is_scheduled: boolean;
    protein?: number | null; carbs?: number | null; fats?: number | null; fiber?: number | null }>;
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
/** PostgreSQL timestamps have microsecond precision. Keep exact integer instants.
 * Missing optional check-in timestamps rank below every supported civil date.
 * Reject normalized/noncanonical clock fields (including 24:00) instead of guessing. */
const MISSING_READING_INSTANT = -1000000000000000000000000n;
function readingInstant(value: unknown): bigint | null {
  if (value === '' || value === null || value === undefined) return MISSING_READING_INSTANT;
  if (typeof value !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!m) return null;
  const day = dayNumber(m[1]), hours = Number(m[2]), minutes = Number(m[3]), seconds = Number(m[4]);
  const offsetHours = Number(m[8] ?? 0), offsetMinutes = Number(m[9] ?? 0);
  if (day === null || hours > 23 || minutes > 59 || seconds > 59 || offsetHours > 23 || offsetMinutes > 59) return null;
  const offset = m[6] === 'Z' ? 0 : (m[7] === '+' ? 1 : -1) * (offsetHours * 60 + offsetMinutes);
  const wholeSeconds = day * 86400 + hours * 3600 + minutes * 60 + seconds - offset * 60;
  return BigInt(wholeSeconds) * 1000000n + BigInt((m[5] ?? '').padEnd(6, '0'));
}
type LatestReading = { kg: number; at: bigint; conflict: boolean };
/** Only a contradictory maximum-instant group blocks. Row order cannot decide. */
function collectLatest(map: Map<string, LatestReading>, date: string, kg: number, at: bigint): void {
  const previous = map.get(date);
  if (!previous || at > previous.at) map.set(date, {kg, at, conflict:false});
  else if (at === previous.at && kg !== previous.kg) previous.conflict = true;
}
export function estimateFromSources(data: DataSources, now: Date): DynamicTdeeResult {
  let today: string;
  try { today = todayInZone(now, data.timezone); } catch { return emptyTdee('invalid_data'); }
  if (!hasSupportedAdultAge(data.dateOfBirth, today)) return emptyTdee('unsupported_age');
  const cutoff = dateForDay(dayNumber(today)! - 29);
  if (data.journeyStartDate != null && dayNumber(data.journeyStartDate) === null) return emptyTdee('invalid_data');
  const minDate = data.journeyStartDate && data.journeyStartDate > cutoff ? data.journeyStartDate : cutoff;
  const validDate = (date: string) => date >= minDate && date < today;
  const weights = normalizedDatedWeights(data, today, minDate);
  if (weights === null) return emptyTdee('invalid_data');
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
  if (!date || dayNumber(date) === null) return null;
  // Use the same conflict and timestamp rules as expenditure/pace diagnostics.
  const rows = normalizedDatedWeights(data, dateForDay(dayNumber(date)! + 1), date);
  return rows?.find(row => row.date === date)?.kg ?? null;
}

/** Shared weight normalization only; null means source conflict/unknown unit. */
export function normalizedDatedWeights(data: DataSources, today: string, minDate: string): TdeeWeight[] | null {
  if (dayNumber(today) === null || dayNumber(minDate) === null) return null;
  const checkIns = new Map<string, LatestReading>();
  const trackerWeights = new Map<string, LatestReading>();
  const validDate = (date: string) => date >= minDate && date < today;
  for (const row of data.checkIns) {
    if (!validDate(row.date)) continue;
    const at = readingInstant(row.updated_at ?? row.created_at ?? '');
    if (at === null) return null;
    const kg = sourceNumber(row.weight);
    collectLatest(checkIns, row.date, kg, at);
  }
  const units = new Map(data.trackers.map(t => [t.id, t.unit]));
  for (const row of data.trackerWeights) {
    if (!validDate(row.date)) continue;
    const at = readingInstant(row.created_at);
    if (at === null || at === MISSING_READING_INSTANT) return null;
    const unit = units.get(row.tracker_id)?.toLowerCase();
    // Storage contract: app weight tracker is lb; honor explicitly tagged kg, never guess.
    if (!unit || !['kg', 'lb', 'lbs'].includes(unit)) return null;
    const kg = sourceNumber(row.value) / (unit === 'kg' ? 1 : 2.2046226218);
    collectLatest(trackerWeights, row.date, kg, at);
  }
  if ([...checkIns.values(), ...trackerWeights.values()].some(value => value.conflict || !Number.isFinite(value.kg))) return null;
  const merged = new Map(checkIns);
  for (const [date, value] of trackerWeights) {
    const check = checkIns.get(date);
    if (check && Math.abs(check.kg - value.kg) > 0.5) return null;
    merged.set(date, check && check.at > value.at ? check : value);
  }
  return [...merged].map(([date, value]) => ({ date, kg: value.kg }));
}
