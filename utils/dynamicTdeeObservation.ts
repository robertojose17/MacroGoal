/** Production observation transport. Never a prescription or legacy fallback. */
export const observationRolloutEnabled = () => process.env.EXPO_PUBLIC_TDEE_MODE === 'observation-v1';
export type ObservationSession = { access_token: string; user: { id: string } };
export type ObservationKind = 'program' | 'progress';
export interface ObservationEstimate {
  version: 'observed-v1'; observationOnly: true; observationVersion: 'observation-v1';
  status: 'estimated' | 'collecting' | 'paused' | 'stale' | 'unavailable';
  reason: string; kcalPerDay: number | null; asOf: string | null;
  confidence: 'low' | null; loggingCompleteness: 'unverified';
  coverage: {
    start: string; end: string; days: number; loggedDays: number; weightDays: number;
    sensitivityKcal: { low: number; high: number };
  } | null;
}
export interface ObservationProgram {
  version: 'dynamic-program-v1'; observationOnly: true; observationVersion: 'observation-v1';
  premium: boolean; enabled: boolean; reviewDay: number; today: string; nextReviewDate: string;
  reviewDue: false; proposal: null; reviewPeriod: null; reason: string;
  estimate: ObservationEstimate | null;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw Error('invalid_observation');
  return value;
}
export function nullableNumber(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('invalid_observation');
  return value;
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value + 'T12:00:00Z')) || new Date(value + 'T12:00:00Z').toISOString().slice(0,10) !== value) throw Error('invalid_observation');
  return value;
}
export function parseObservationProgram(value: unknown, now = Date.now()): ObservationProgram {
  const v = record(value);
  if (v.version !== 'dynamic-program-v1' || v.observationOnly !== true || v.observationVersion !== 'observation-v1' ||
      typeof v.premium !== 'boolean' || typeof v.enabled !== 'boolean' || typeof v.reviewDay !== 'number' ||
      !Number.isInteger(v.reviewDay) || v.reviewDay < 0 || v.reviewDay > 6 || v.reviewDue !== false ||
      v.proposal !== null || v.reviewPeriod !== null || typeof v.reason !== 'string') throw Error('invalid_observation');
  const today = date(v.today), nextReviewDate = date(v.nextReviewDate);
  // Civil dates may differ from UTC by one day. A wrong device clock fails
  // closed rather than allowing an indefinitely old, internally coherent payload.
  if (!Number.isFinite(now) || Math.abs(Date.parse(today) - Math.floor(now / 86400000) * 86400000) > 86400000) throw Error('invalid_observation');
  let estimate: ObservationEstimate | null = null;
  if (v.estimate !== null) {
    const e = record(v.estimate), kcal = nullableNumber(e.kcalPerDay);
    if (e.version !== 'observed-v1' || e.observationOnly !== true || e.observationVersion !== 'observation-v1' ||
        e.loggingCompleteness !== 'unverified' || (e.confidence !== null && e.confidence !== 'low') ||
        typeof e.reason !== 'string' || !['estimated','collecting','paused','stale','unavailable'].includes(String(e.status))) throw Error('invalid_observation');
    const asOf = e.asOf === null ? null : date(e.asOf);
    let coverage: ObservationEstimate['coverage'] = null;
    if (e.status === 'estimated') {
      // These mirror the deployed engine's contract, not clinical safety limits.
      // Today is incomplete and is never part of an observed-v1 estimate.
      if (!v.premium || !v.enabled || kcal === null || kcal < 1000 || kcal > 5000 || kcal % 50 !== 0 ||
          e.confidence !== 'low' || e.reason !== 'ready' || asOf === null ||
          Date.parse(today) - Date.parse(asOf) <= 0 || Date.parse(today) - Date.parse(asOf) > 3 * 86400000) throw Error('invalid_observation');
      const start = date(e.windowStart), days = (Date.parse(asOf) - Date.parse(start)) / 86400000;
      if (days < 21 || days > 28 || e.windowDays !== days || e.loggedDays !== days ||
          typeof e.weightDays !== 'number' || !Number.isInteger(e.weightDays) || e.weightDays < 10 || e.weightDays > days + 1 ||
          typeof e.weightTrendKgPerWeek !== 'number' || !Number.isFinite(e.weightTrendKgPerWeek)) throw Error('invalid_observation');
      const sensitivity = record(e.sensitivityKcal), low = nullableNumber(sensitivity.low), high = nullableNumber(sensitivity.high);
      if (low === null || high === null || low < 0 || low > kcal || high < kcal || high <= low ||
          low % 50 !== 0 || high % 50 !== 0) throw Error('invalid_observation');
      coverage = { start, end: asOf, days, loggedDays: days, weightDays: e.weightDays, sensitivityKcal: { low, high } };
    }
    if (e.status !== 'estimated' && kcal !== null) throw Error('invalid_observation');
    const status = e.status;
    if (status !== 'estimated' && status !== 'collecting' && status !== 'paused' && status !== 'stale' && status !== 'unavailable') throw Error('invalid_observation');
    estimate = { version: 'observed-v1', observationOnly: true, observationVersion:'observation-v1', status,
      reason:e.reason, kcalPerDay:kcal, asOf, confidence:e.confidence, loggingCompleteness:'unverified', coverage };
  }
  return { version:'dynamic-program-v1', observationOnly:true, observationVersion:'observation-v1', premium:v.premium,
    enabled:v.enabled, reviewDay:v.reviewDay, today, nextReviewDate, reviewDue:false, proposal:null, reviewPeriod:null, reason:v.reason, estimate };
}
export async function requestObservation(input: {
  kind: ObservationKind; endpoint: string; apiKey: string; session: ObservationSession;
  expectedOwner: string; signal: AbortSignal; isCurrent: () => boolean; enabled: boolean;
  settings?: { enabled: boolean; reviewDay: number }; fetcher?: typeof fetch;
}): Promise<unknown> {
  if (!input.enabled) throw Error('observation_unavailable');
  if (input.signal.aborted || !input.isCurrent() || input.session.user.id !== input.expectedOwner) throw Error('account_changed');
  if (input.settings && (input.kind !== 'program' || typeof input.settings.enabled !== 'boolean' || !Number.isInteger(input.settings.reviewDay) || input.settings.reviewDay < 0 || input.settings.reviewDay > 6)) throw Error('invalid_request');
  const mode = input.kind === 'program' ? 'observed-program-v1' : 'observed-progress-v1';
  const body = input.settings ? { action:'dynamic_settings', ...input.settings } : input.kind === 'progress' ? { userId: input.expectedOwner } : undefined;
  const response = await (input.fetcher ?? fetch)(input.endpoint + '?mode=' + mode, {
    method:body ? 'POST' : 'GET', signal:input.signal, cache:'no-store',
    headers: { Authorization:'Bearer ' + input.session.access_token, apikey:input.apiKey, 'Content-Type':'application/json' },
    ...(body ? {body:JSON.stringify(body)} : {}),
  });
  if (input.signal.aborted || !input.isCurrent()) throw Error('account_changed');
  if (!response.ok) throw Error(response.status === 403 ? 'observation_unavailable' : 'observation_request_failed');
  if (response.headers.get('X-Macrogoal-Observation') !== (input.kind === 'program' ? 'observation-v1' : 'observed-progress-v1')) throw Error('invalid_observation');
  const data: unknown = await response.json();
  const payload = record(data);
  if ('userId' in payload && payload.userId !== input.expectedOwner) throw Error('account_changed');
  if (input.signal.aborted || !input.isCurrent()) throw Error('account_changed');
  return data;
}
