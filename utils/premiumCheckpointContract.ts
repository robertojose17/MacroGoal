/** Versioned client observations. Never evidence of a verified payment. */
export const PREMIUM_SOURCES = [
  'unknown', 'onboarding_complete', 'settings_upgrade', 'home_recipe_limit',
  'home_ai_plan', 'coach_preview', 'chatbot_upgrade', 'ai_meal_estimator',
  'ai_meal_planner', 'community_club', 'template_plan', 'feature_gate',
  'floating_badge', 'coach_daily_saved', 'coach_daily_preview',
  'coach_meal_saved', 'coach_meal_preview', 'coach_conversation',
] as const;
export type PremiumSource = typeof PREMIUM_SOURCES[number];
export const CHECKPOINT_ID_PATTERN = /^[A-Za-z0-9_-]{8,96}$/;
export type PremiumFlow = Readonly<{ flowId: string; source: PremiumSource }>;
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
export function newPremiumFlow(source: PremiumSource): PremiumFlow {
  return Object.freeze({ flowId: newCheckpointId(), source: premiumSource(source) });
}
/** Capture once per screen instance; navigation params never include an actor. */
export function capturePremiumFlow(source: unknown, flowId: unknown): PremiumFlow {
  return Object.freeze({
    source: premiumSource(source),
    flowId: typeof flowId === 'string' && CHECKPOINT_ID_PATTERN.test(flowId)
      ? flowId : newCheckpointId(),
  });
}
export function premiumRoute(flow: PremiumFlow, autoStart = false) {
  return {
    pathname: '/subscription' as const,
    params: { source: flow.source, flowId: flow.flowId,
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
