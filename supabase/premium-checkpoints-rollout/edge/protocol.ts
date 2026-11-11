// Closed protocol shared with the app. The parity regression must pass.
/** Versioned client observations. Never evidence of a verified payment. */
export const PREMIUM_SOURCES = [
  'unknown', 'onboarding_complete', 'settings_upgrade', 'home_recipe_limit',
  'home_ai_plan', 'coach_preview', 'chatbot_upgrade', 'ai_meal_estimator',
  'ai_meal_planner', 'community_club', 'template_plan', 'feature_gate',
  'floating_badge', 'coach_daily_saved', 'coach_daily_preview',
  'coach_meal_saved', 'coach_meal_preview', 'coach_conversation',
] as const;
export type PremiumSource = typeof PREMIUM_SOURCES[number];
// Closed labels only. Never store a URL, route parameter, query, or user-entered label.
export const PREMIUM_HOST_SCREENS = ['home', 'dashboard', 'check_ins', 'profile', 'unknown'] as const;
export type PremiumHostScreen = typeof PREMIUM_HOST_SCREENS[number];
export function premiumHostScreen(value: unknown): PremiumHostScreen {
  if (typeof value !== 'string') return 'unknown';
  const route = value.split(/[?#]/, 1)[0];
  if (!route.startsWith('/') || route.includes('//')) return 'unknown';
  const path = route.replace(/\/$/, '') || '/';
  switch (path) {
    case '/': case '/(home)': case '/(tabs)': case '/(tabs)/(home)': return 'home';
    case '/dashboard': case '/(tabs)/dashboard': return 'dashboard';
    case '/check-ins': case '/(tabs)/check-ins': return 'check_ins';
    case '/profile': case '/(tabs)/profile': return 'profile';
    default: return 'unknown';
  }
}
export function premiumScreenLabel(value: unknown): PremiumHostScreen {
  return typeof value === 'string' && (PREMIUM_HOST_SCREENS as readonly string[]).includes(value)
    ? value as PremiumHostScreen : 'unknown';
}
export const CHECKPOINT_ID_PATTERN = /^[A-Za-z0-9_-]{8,96}$/;
export type PremiumFlow = Readonly<{ flowId: string; source: PremiumSource; screen?: PremiumHostScreen }>;
export type DisplayedOffer = Readonly<{
  offeringId: string; packageId: string; productId: string;
  priceString: string; currencyCode: string; subscriptionPeriod: string | null;
}>;
export type Attribution = 'consistent' | 'unknown' | 'sdk_actor_mismatch';
export type ClientPurchaseResult = 'sdk_returned_entitlement' | 'sdk_returned_no_entitlement' |
  'canceled' | 'pending' | 'already_owned' | 'error';
export type TransactionCorrelation = Readonly<{
  transactionId: string; productId: string;
  store?: 'APP_STORE' | 'PLAY_STORE';
  environment?: 'PRODUCTION' | 'SANDBOX';
}>;
export type CheckpointDetail =
  | { name: 'inline_impression' | 'entrypoint_clicked' }
  | { name: 'offer_displayed'; offer: DisplayedOffer }
  | { name: 'purchase_attempt'; attemptId: string; offer: DisplayedOffer;
      trigger: 'manual' | 'auto_start'; attribution: Attribution }
  | { name: 'purchase_result'; attemptId: string; outcome: ClientPurchaseResult;
      attribution: Attribution; correlation?: TransactionCorrelation }
  | { name: 'restore_attempt'; attemptId: string }
  | { name: 'restore_result'; attemptId: string; attribution: Attribution;
      outcome: 'restored_entitlement' | 'no_entitlement' | 'canceled' | 'pending' | 'error' };
export type PremiumCheckpoint = Readonly<{
  namespace: 'premium_checkpoint'; schema_version: 1; eventId: string;
  occurredAt: string; flow: PremiumFlow; platform: 'ios' | 'android' | 'web';
  detail: CheckpointDetail;
}>;

let sequence = 0;
/** Correlation only, never authentication. Server detects conflicting ID reuse. */
export function newCheckpointId(): string {
  sequence = (sequence + 1) % 0x100000000;
  let random = '';
  for (let i = 0; i < 4; i += 1) {
    random += Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  }
  return 'pc_' + Date.now().toString(36) + '_' + sequence.toString(36) + '_' + random;
}
export function premiumSource(value: unknown): PremiumSource {
  return typeof value === 'string' &&
    (PREMIUM_SOURCES as readonly string[]).includes(value)
    ? value as PremiumSource : 'unknown';
}
export function newPremiumFlow(source: PremiumSource, screen?: PremiumHostScreen): PremiumFlow {
  return Object.freeze({ flowId: newCheckpointId(), source: premiumSource(source),
    ...(screen !== undefined ? { screen: premiumScreenLabel(screen) } : {}) });
}
/** Capture once per screen instance; navigation params never include an actor. */
export function capturePremiumFlow(source: unknown, flowId: unknown, screen?: unknown): PremiumFlow {
  return Object.freeze({
    source: premiumSource(source),
    ...(screen !== undefined ? { screen: premiumScreenLabel(screen) } : {}),
    flowId: typeof flowId === 'string' && CHECKPOINT_ID_PATTERN.test(flowId)
      ? flowId : newCheckpointId(),
  });
}
export function premiumRoute(flow: PremiumFlow, autoStart = false) {
  return {
    pathname: '/subscription' as const,
    params: { source: flow.source, flowId: flow.flowId,
      ...(flow.screen !== undefined ? { originScreen: flow.screen } : {}),
      ...(autoStart ? { autoStart: 'true' } : {}) },
  };
}
/** Keep this observer in a per-flow ref. Capacity never evicts earlier impressions. */
export function createFlowImpressionObserver() {
  const seen = new Set<string>();
  return Object.freeze({
    claim(key: string): boolean {
      if (seen.has(key) || seen.size >= 32) return false;
      seen.add(key);
      return true;
    },
  });
}

// Deliberately no network transport or legacy analytics fallback in this module.
// Enable ingestion only after the private endpoint and actor lease are reviewed.

type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Obj, required: string[], optional: string[] = []) =>
  required.every(k => Object.prototype.hasOwnProperty.call(v, k)) &&
  Object.keys(v).every(k => required.includes(k) || optional.includes(k));
const id = (v: unknown) => typeof v === 'string' && CHECKPOINT_ID_PATTERN.test(v);
const catalogId = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_.:$+/-]{1,256}$/.test(v);
const oneOf = (v: unknown, choices: readonly string[]) => typeof v === 'string' && choices.includes(v);
const offerKeys = ['offeringId', 'packageId', 'productId', 'priceString', 'currencyCode', 'subscriptionPeriod'];
export function validDisplayedOffer(v: unknown): boolean {
  if (!object(v) || !exact(v, offerKeys)) return false;
  return catalogId(v.offeringId) && catalogId(v.packageId) && catalogId(v.productId) &&
    typeof v.priceString === 'string' && v.priceString.length > 0 && v.priceString.length <= 80 &&
    // eslint-disable-next-line no-control-regex -- Reject ASCII control characters in untrusted input.
    !/[\u0000-\u001f\u007f]/.test(v.priceString) &&
    typeof v.currencyCode === 'string' && /^[A-Z]{3}$/.test(v.currencyCode) &&
    (v.subscriptionPeriod === null || (typeof v.subscriptionPeriod === 'string' && /^P[0-9]{1,3}[DWMY]$/.test(v.subscriptionPeriod)));
}
export function validCheckpoint(v: unknown): v is PremiumCheckpoint {
  if (!object(v) || !exact(v, ['namespace','schema_version','eventId','occurredAt','flow','platform','detail']) ||
      v.namespace !== 'premium_checkpoint' || v.schema_version !== 1 || !id(v.eventId) ||
      !oneOf(v.platform, ['ios','android','web']) || typeof v.occurredAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v.occurredAt) ||
      !Number.isFinite(Date.parse(v.occurredAt)) || new Date(v.occurredAt).toISOString() !== v.occurredAt ||
      !object(v.flow) || !exact(v.flow, ['flowId','source'], ['screen']) || !id(v.flow.flowId) ||
      !oneOf(v.flow.source, PREMIUM_SOURCES) ||
      (Object.prototype.hasOwnProperty.call(v.flow, 'screen') && !oneOf(v.flow.screen, PREMIUM_HOST_SCREENS)) || !object(v.detail)) return false;
  const d = v.detail;
  switch (d.name) {
    case 'inline_impression': case 'entrypoint_clicked': return exact(d, ['name']);
    case 'offer_displayed': return exact(d, ['name','offer']) && validDisplayedOffer(d.offer);
    case 'purchase_attempt': return exact(d, ['name','attemptId','offer','trigger','attribution']) &&
      id(d.attemptId) && validDisplayedOffer(d.offer) && oneOf(d.trigger, ['manual','auto_start']) &&
      oneOf(d.attribution, ['consistent','unknown','sdk_actor_mismatch']);
    case 'purchase_result': return exact(d, ['name','attemptId','outcome','attribution'], ['correlation']) &&
      id(d.attemptId) && oneOf(d.outcome, ['sdk_returned_entitlement','sdk_returned_no_entitlement','canceled','pending','already_owned','error']) &&
      oneOf(d.attribution, ['consistent','unknown','sdk_actor_mismatch']) &&
      (d.correlation === undefined || (object(d.correlation) && exact(d.correlation, ['transactionId','productId'], ['store','environment']) &&
        catalogId(d.correlation.transactionId) && catalogId(d.correlation.productId) &&
        (d.correlation.store === undefined || oneOf(d.correlation.store, ['APP_STORE','PLAY_STORE'])) &&
        (d.correlation.environment === undefined || oneOf(d.correlation.environment, ['PRODUCTION','SANDBOX']))));
    case 'restore_attempt': return exact(d, ['name','attemptId']) && id(d.attemptId);
    case 'restore_result': return exact(d, ['name','attemptId','outcome','attribution']) && id(d.attemptId) &&
      oneOf(d.attribution, ['consistent','unknown','sdk_actor_mismatch']) &&
      oneOf(d.outcome, ['restored_entitlement','no_entitlement','canceled','pending','error']);
    default: return false;
  }
}
/** JSON copy is mandatory: queued events must never follow mutations of caller objects. */
export function checkpointBody(value: unknown): string | null {
  try {
    const body = JSON.stringify(value);
    if (!body || body.length > 8192) return null;
    let bytes = 0;
    for (const char of body) { const cp = char.codePointAt(0)!; bytes += cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4; }
    if (bytes > 8192 || !validCheckpoint(JSON.parse(body))) return null;
    return body;
  } catch { return null; }
}

