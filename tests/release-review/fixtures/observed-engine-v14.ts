/**
 * Observational, provisional expenditure estimate. Never a calorie prescription.
 * This is not MacroFactor's proprietary algorithm or a validated metabolic model.
 * No goals, historical TDEE rows, exercise calories, writes, or imputed intake.
 */
export type TdeeStatus = 'estimated' | 'collecting' | 'paused' | 'stale' | 'unavailable';
export type TdeeReason = 'ready' | 'insufficient_weights' | 'insufficient_history' |
  'missing_intake' | 'possible_partial_logging' | 'stale_weight' | 'invalid_data' |
  'unstable_weight' | 'implausible_estimate' | 'unsupported_age' | 'source_error' | 'unknown_calorie_provenance';
export interface DynamicTdeeResult {
  version: 'observed-v1';
  status: TdeeStatus;
  reason: TdeeReason;
  kcalPerDay: number | null;
  confidence: 'low' | null;
  loggingCompleteness: 'unverified';
  asOf: string | null;
  windowStart: string | null;
  windowDays: number;
  loggedDays: number;
  weightDays: number;
  // A sensitivity band, not a statistical confidence interval.
  sensitivityKcal: { low: number; high: number } | null;
  weightTrendKgPerWeek: number | null;
}
export interface TdeeWeight { date: string; kg: number }
export interface TdeeIntake { date: string; calories: number; mealTypes: number }
export const DAY_MS = 86400000;
export function dayNumber(date: string): number | null {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date ? time / DAY_MS : null;
}
/** Reuse the observation program's existing adult scope; missing age never grants eligibility. */
export function hasSupportedAdultAge(dateOfBirth: unknown, today: string): boolean {
  if (typeof dateOfBirth !== 'string' || dayNumber(dateOfBirth) === null || dayNumber(today) === null) return false;
  const adultDate = `${Number(today.slice(0, 4)) - 18}${today.slice(4)}`;
  const oldestDate = `${Number(today.slice(0, 4)) - 100}${today.slice(4)}`;
  return dateOfBirth <= adultDate && dateOfBirth >= oldestDate;
}
export function dateForDay(day: number): string { return new Date(day * DAY_MS).toISOString().slice(0, 10); }
export function emptyTdee(reason: TdeeReason = 'source_error', status: TdeeStatus = 'unavailable'): DynamicTdeeResult {
  return { version: 'observed-v1', status, reason, kcalPerDay: null, confidence: null,
    loggingCompleteness: 'unverified', asOf: null, windowStart: null, windowDays: 0,
    loggedDays: 0, weightDays: 0, sensitivityKcal: null, weightTrendKgPerWeek: null };
}
function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b), m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
function slopeOf(weights: { day: number; kg: number }[]): number | null {
  const slopes: number[] = [];
  for (let i = 0; i < weights.length; i++) for (let j = i + 1; j < weights.length; j++) {
    const gap = weights[j].day - weights[i].day;
    if (gap >= 7) slopes.push((weights[j].kg - weights[i].kg) / gap);
  }
  return slopes.length ? median(slopes) : null;
}
function hasSustainedStep(weights: { day: number; kg: number }[]): boolean {
  // Scan observed splits, not just the calendar midpoint: alternating weigh-ins
  // can straddle a persistent water shift and fool a single global robust line.
  for (let split = 4; split <= weights.length - 4; split++) {
    const left = weights.slice(0, split), right = weights.slice(split);
    if (left.at(-1)!.day - left[0].day < 7 || right.at(-1)!.day - right[0].day < 7 || right[0].day - left.at(-1)!.day > 5) continue;
    const a = slopeOf(left), b = slopeOf(right);
    if (a === null || b === null) continue;
    const boundary = (left.at(-1)!.day + right[0].day) / 2;
    const l = median(left.map(w => w.kg - a * (w.day - boundary)));
    const r = median(right.map(w => w.kg - b * (w.day - boundary)));
    const residual = (side: typeof weights, slope: number, center: number) => {
      const errors = side.map(w => Math.abs(w.kg - center - slope * (w.day - boundary))).sort((x, y) => x - y);
      return errors[Math.floor(errors.length * 0.75)];
    };
    if (Math.abs(l - r) > 0.7 && residual(left, a, l) <= 0.6 && residual(right, b, r) <= 0.6) return true;
  }
  return false;
}
const round50 = (n: number) => Math.round(n / 50) * 50;
export function estimateDynamicTdee(input: {
  today: string; weights: TdeeWeight[]; intake: TdeeIntake[];
}): DynamicTdeeResult {
  const today = dayNumber(input.today);
  if (today === null) return emptyTdee('invalid_data');
  const base = emptyTdee('insufficient_weights', 'collecting');
  // Up to 28 completed calendar days. Never recover an old estimate from history.
  const weights: { day: number; kg: number }[] = [];
  const seen = new Set<number>();
  for (const w of input.weights) {
    const day = dayNumber(w.date);
    if (day === null) return emptyTdee('invalid_data');
    if (day >= today || day < today - 29) continue;
    if (!Number.isFinite(w.kg) || w.kg < 30 || w.kg > 350 || seen.has(day)) return emptyTdee('invalid_data');
    seen.add(day); weights.push({ day, kg: w.kg });
  }
  weights.sort((a, b) => a.day - b.day);
  base.weightDays = weights.length;
  if (!weights.length) return base;
  const last = weights[weights.length - 1];
  base.asOf = dateForDay(last.day);
  if (today - last.day > 3) return { ...base, status: 'stale', reason: 'stale_weight' };
  const first = weights[0];
  const span = last.day - first.day;
  base.windowStart = dateForDay(first.day); base.windowDays = span;
  if (span < 21) return { ...base, reason: 'insufficient_history' };
  if (weights.length < 10) return base;
  // At least two weigh-ins in every seven-day block, including the final week.
  for (let end = last.day; end - first.day >= 7; end -= 7) {
    if (weights.filter(w => w.day > end - 7 && w.day <= end).length < 2) return base;
  }
  for (let i = 1; i < weights.length; i++) if (weights[i].day - weights[i - 1].day > 7) return base;
  const daily = new Map<number, TdeeIntake>();
  for (const d of input.intake) {
    const day = dayNumber(d.date);
    if (day === null) return { ...base, status: 'paused', reason: 'invalid_data' };
    // Weight at the end bounds the preceding intake interval, excluding its day.
    if (day < first.day || day >= last.day) continue;
    if (daily.has(day) || !Number.isFinite(d.calories) || d.calories < 0 ||
      !Number.isInteger(d.mealTypes) || d.mealTypes < 0) return { ...base, status: 'paused', reason: 'invalid_data' };
    daily.set(day, d);
  }
  base.loggedDays = daily.size;
  // No zero-filling, averaging only logged days, or assuming missing weekends match weekdays.
  if (daily.size !== span) return { ...base, status: 'paused', reason: 'missing_intake' };
  const values = [...daily.values()];
  const medianIntake = median(values.map(d => d.calories));
  // Conservative data-quality gates, NOT nutrition recommendations or proof of completeness.
  // One-meal patterns and fasting need a future explicit complete-day workflow.
  if (values.some(d => d.calories < 800 || d.calories > 6000 ||
    d.calories < medianIntake * 0.6 || d.mealTypes < 2)) {
    return { ...base, status: 'paused', reason: 'possible_partial_logging' };
  }
  const slope = slopeOf(weights);
  if (slope === null) return base;
  const centerWeight = median(weights.map(w => w.kg));
  const intercept = median(weights.map(w => w.kg - slope * (w.day - first.day)));
  const residuals = weights.map(w => Math.abs(w.kg - intercept - slope * (w.day - first.day)));
  const noise = median(residuals) * 1.4826;
  const upperResidual = [...residuals].sort((a, b) => a - b)[Math.floor(residuals.length * 0.75)];
  // Water shifts, rapid loss/gain and structural changes are not reliable tissue-energy signals.
  const leftSlope = slopeOf(weights.filter(w => w.day <= first.day + span / 2));
  const rightSlope = slopeOf(weights.filter(w => w.day >= first.day + span / 2));
  if (Math.abs(slope) * 7 > centerWeight * 0.01 || noise > 0.8 || upperResidual > 1.2 || hasSustainedStep(weights) ||
    (leftSlope !== null && rightSlope !== null && (Math.abs(leftSlope - rightSlope) > 0.08 ||
      (Math.abs(slope - leftSlope) > 0.04 && Math.abs(slope - rightSlope) > 0.04)))) {
    return { ...base, status: 'paused', reason: 'unstable_weight' };
  }
  const averageIntake = values.reduce((sum, d) => sum + d.calories, 0) / span;
  // Short-window energy-balance approximation only. 7700 is uncertain, particularly
  // with water changes, gain/loss composition and adaptation. Never use to project goal dates.
  const raw = averageIntake - slope * 7700;
  if (!Number.isFinite(raw) || raw < 1000 || raw > 5000) return { ...base, status: 'paused', reason: 'implausible_estimate' };
  const uncertainty = Math.max(300, raw * 0.20, noise * 7700 / span + Math.abs(slope) * 2000);
  return { ...base, status: 'estimated', reason: 'ready', kcalPerDay: round50(raw), confidence: 'low',
    sensitivityKcal: { low: Math.floor(Math.max(0, raw - uncertainty) / 50) * 50, high: Math.ceil((raw + uncertainty) / 50) * 50 },
    weightTrendKgPerWeek: Math.round(slope * 7 * 100) / 100 };
}
