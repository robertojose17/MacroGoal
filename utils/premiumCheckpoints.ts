import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase/client';
import { newCheckpointId, newPremiumFlow, premiumRoute } from './premiumCheckpointContract';
import type { Attribution, CheckpointDetail, DisplayedOffer, PremiumFlow, PremiumSource } from './premiumCheckpointContract';
import { createCheckpointQueue, validDisplayedOffer } from './premiumCheckpointRuntime';
import type { ActorLease, CheckpointTransport } from './premiumCheckpointRuntime';

// No source-level switch can activate an unreviewed endpoint. Null until deployment review.
const transport: CheckpointTransport | null = null;
let lease: ActorLease | null = null;
let generation = 0;
let initialized = false;
const queue = createCheckpointQueue(() => lease, transport);
function acceptSession(session: { user: { id: string }; access_token: string } | null) {
  generation += 1;
  queue.invalidate();
  lease = session ? Object.freeze({ userId: session.user.id, accessToken: session.access_token, generation }) : null;
}
function initializeActor() {
  if (initialized) return;
  initialized = true;
  // Do not await Supabase operations inside its auth-state callback.
  supabase.auth.onAuthStateChange((_event, session) => acceptSession(session));
  const start = generation;
  void supabase.auth.getSession().then(({ data, error }) => {
    if (generation === start) acceptSession(error ? null : data.session);
  }).catch(() => { if (generation === start) acceptSession(null); });
}
export function checkpointActor(): ActorLease | null { initializeActor(); return lease; }
export function actorStillCurrent(actor: ActorLease | null): boolean { return !!actor && lease === actor; }
export function checkpoint(flow: PremiumFlow, detail: CheckpointDetail, actor = checkpointActor()): boolean {
  try {
    if (!actorStillCurrent(actor) || !['ios','android','web'].includes(Platform.OS)) return false;
    return queue.enqueue({ namespace: 'premium_checkpoint', schema_version: 1,
      eventId: newCheckpointId(), occurredAt: new Date().toISOString(), flow,
      platform: Platform.OS, detail }, actor);
  } catch { return false; }
}
/** Called at the original navigation boundary, never awaited by UI or billing. */
export function premiumEntry(source: PremiumSource, autoStart = false) {
  const flow = newPremiumFlow(source);
  checkpoint(flow, { name: 'entrypoint_clicked' });
  return premiumRoute(flow, autoStart);
}
export function displayedPackage(pkg: any, offeringId: unknown): DisplayedOffer | null {
  const value = { offeringId, packageId: pkg?.identifier, productId: pkg?.product?.identifier,
    priceString: pkg?.product?.priceString, currencyCode: pkg?.product?.currencyCode,
    subscriptionPeriod: pkg?.product?.subscriptionPeriod ?? null };
  return validDisplayedOffer(value) ? value as DisplayedOffer : null;
}
/** Reads SDK identity only; never configures, logs in, or changes the billing engine. */
export async function purchaseAttribution(sdk: any, actor: ActorLease | null): Promise<Attribution> {
  if (!actorStillCurrent(actor)) return 'unknown';
  try {
    const sdkActor = await sdk.getAppUserID();
    if (!actorStillCurrent(actor)) return 'unknown';
    return typeof sdkActor === 'string' ? sdkActor === actor!.userId ? 'consistent' : 'sdk_actor_mismatch' : 'unknown';
  } catch { return 'unknown'; }
}
/** RevenueCat error codes only: do not send messages, stack traces or user input. */
export function observedPurchaseError(error: any): 'canceled' | 'pending' | 'already_owned' | 'error' {
  const code = String(error?.code ?? '');
  if (error?.userCancelled === true || ['1','PURCHASE_CANCELLED_ERROR'].includes(code)) return 'canceled';
  if (['20','PAYMENT_PENDING_ERROR'].includes(code)) return 'pending';
  if (['6','PRODUCT_ALREADY_PURCHASED_ERROR','PRODUCT_ALREADY_PURCHASED'].includes(code)) return 'already_owned';
  return 'error';
}
