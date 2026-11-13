import type { ObservationContext } from './handler.ts';
import { todayInZone, type DataSources } from '../dynamic-tdee/data.ts';
import { dayNumber, dateForDay } from '../_shared/dynamic-tdee.ts';

export interface ObservedSnapshot {
  version: 'observed-snapshot-v1'; ownerId: string; capturedAt: string;
  context: ObservationContext; sourceFingerprint: string;
  counts: { trackers: number; trackerWeights: number; checkIns: number; meals: number; items: number } | null;
  sources: DataSources | null;
}
function fail(): never { throw new Error('snapshot_invalid'); }
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const civil = (v: unknown): v is string => typeof v === 'string' && dayNumber(v) !== null;
const timestamp = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && civil(v.slice(0,10)) && Number.isFinite(Date.parse(v));
export function parseObservationContext(value: unknown, owner: string): ObservationContext {
  if (!record(value) || value.ownerId !== owner || typeof value.premium !== 'boolean' || typeof value.enabled !== 'boolean' ||
      !Number.isInteger(value.reviewDay) || Number(value.reviewDay) < 0 || Number(value.reviewDay) > 6 ||
      !civil(value.today) || !civil(value.nextReviewDate) || value.reviewDue !== false || value.proposal !== null ||
      !hash(value.fingerprint) || !record(value.safety) || value.safety.enabled !== false || value.safety.eligibility !== 'unverified') fail();
  const goal = value.currentGoal;
  if (goal !== null) {
    if (!record(goal) || !text(goal.id) || !['daily_calories','protein_g','carbs_g','fats_g','fiber_g'].every(k => finite(goal[k]) && goal[k] >= 0) ||
        Number(goal.daily_calories) <= 0 || !(goal.macro_preset === null || typeof goal.macro_preset === 'string')) fail();
  }
  return value as unknown as ObservationContext;
}
/** Validate the full atomic RPC envelope. Never repair, paginate or fall back to legacy reads. */
export function parseObservedSnapshot(value: unknown, owner: string): ObservedSnapshot {
  if (!record(value) || value.version !== 'observed-snapshot-v1' || value.ownerId !== owner || !text(owner) ||
      !timestamp(value.capturedAt) || !hash(value.sourceFingerprint)) fail();
  const context = parseObservationContext(value.context, owner);
  if (!context.premium || !context.enabled) {
    if (value.counts !== null || value.sources !== null) fail();
    return value as unknown as ObservedSnapshot;
  }
  const sources = value.sources, counts = value.counts;
  if (!record(sources) || !record(counts) || !text(sources.timezone) ||
      !(sources.dateOfBirth === null || civil(sources.dateOfBirth)) ||
      !(sources.journeyStartDate === null || civil(sources.journeyStartDate))) fail();
  let today: string;
  try { today = todayInZone(new Date(value.capturedAt), sources.timezone); } catch { return fail(); }
  if (today !== context.today) fail();
  const start = dateForDay(dayNumber(today)! - 29);
  const inWindow = (v: unknown) => civil(v) && v >= start && v < today;
  const rows: Record<string, Record<string, unknown>[]> = {};
  for (const [name, limit] of Object.entries({trackers:1,trackerWeights:5000,checkIns:5000,meals:500,items:5000})) {
    const list = sources[name], count = counts[name];
    if (!Array.isArray(list) || !Number.isInteger(count) || count !== list.length || list.length > limit ||
        !list.every(row => record(row) && text(row.id)) || new Set(list.map(row => row.id)).size !== list.length) fail();
    rows[name] = list;
  }
  const trackerIds = new Set(rows.trackers.map(row => row.id));
  const mealIds = new Set(rows.meals.map(row => row.id));
  if (!rows.trackers.every(r => r.unit === null || typeof r.unit === 'string') ||
      !rows.trackerWeights.every(r => trackerIds.has(r.tracker_id) && inWindow(r.date) && finite(r.value) && timestamp(r.created_at)) ||
      !rows.checkIns.every(r => inWindow(r.date) && finite(r.weight) && (r.updated_at === null || timestamp(r.updated_at)) && (r.created_at === null || timestamp(r.created_at))) ||
      !rows.meals.every(r => inWindow(r.date) && typeof r.meal_type === 'string') ||
      !rows.items.every(r => mealIds.has(r.meal_id) && finite(r.calories) && r.is_scheduled === false)) fail();
  return value as unknown as ObservedSnapshot;
}
