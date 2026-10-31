import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase/client';
import { newCheckpointId, newPremiumFlow, premiumRoute } from './premiumCheckpointContract';
import type { Attribution, CheckpointDetail, DisplayedOffer, PremiumFlow, PremiumSource, TransactionCorrelation } from './premiumCheckpointContract';
import { createCheckpointQueue, validDisplayedOffer } from './premiumCheckpointRuntime';
import type { ActorLease, CheckpointTransport } from './premiumCheckpointRuntime';

// No source-level switch can activate an unreviewed endpoint. Null until deployment review.
const transport: CheckpointTransport | null = null;
let lease: ActorLease | null = null;
let generation = 0;
let initialized = false;
const queue = createCheckpointQueue(() => lease, transport);
let authRevision = 0;
function acceptSession(session: { user: { id: string }; access_token: string } | null) {
  authRevision += 1;
  const sessionId = session ? checkpointSessionId(session.access_token) : null;
  if (lease && session && sessionId && lease.userId === session.user.id && lease.sessionId === sessionId) {
    lease.credentials.accessToken = session.access_token;
    return;
  }
  generation += 1;
  queue.invalidate();
  lease = session && sessionId ? Object.freeze({ userId: session.user.id, sessionId,
    credentials: { accessToken: session.access_token }, generation }) : null;
}
function initializeActor() {
  if (initialized) return;
  initialized = true;
  // Do not await Supabase operations inside its auth-state callback.
  supabase.auth.onAuthStateChange((_event, session) => acceptSession(session));
  const start = authRevision;
  void supabase.auth.getSession().then(({ data, error }) => {
    if (authRevision === start) acceptSession(error ? null : data.session);
  }).catch(() => { if (authRevision === start) acceptSession(null); });
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
export function premiumEntry(source: PremiumSource, autoStart = false, existingFlow?: PremiumFlow) {
  const flow = existingFlow?.source === source ? existingFlow : newPremiumFlow(source);
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
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const sdkActor = await Promise.race([
      Promise.resolve().then(() => sdk.getAppUserID()),
      new Promise<null>(resolve => { timeout = setTimeout(() => resolve(null), 500); }),
    ]).finally(() => { if (timeout) clearTimeout(timeout); });
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

/** Only whitelisted SDK fields; never copy transaction.purchaseToken or receipts. */
export function transactionCandidate(result: any): TransactionCorrelation | undefined {
  const transactionId = result?.transaction?.transactionIdentifier;
  const productId = result?.transaction?.productIdentifier;
  const safe = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_.:$+/-]{1,256}$/.test(v);
  if (!safe(transactionId) || !safe(productId) || result?.productIdentifier !== productId) return undefined;
  const candidate: TransactionCorrelation = { transactionId, productId };
  const subscription = result?.customerInfo?.subscriptionsByProductIdentifier?.[productId];
  if (subscription?.storeTransactionId !== transactionId || subscription?.productIdentifier !== productId) return candidate;
  const store = subscription.store === 'APP_STORE' || subscription.store === 'PLAY_STORE' ? subscription.store : undefined;
  const environment = typeof subscription.isSandbox === 'boolean' ? subscription.isSandbox ? 'SANDBOX' : 'PRODUCTION' : undefined;
  return { ...candidate, ...(store ? { store } : {}), ...(environment ? { environment } : {}) };
}

/** JWT payload is used only for client continuity, never server authorization. */
export function checkpointSessionId(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part || part.length > 20000) return null;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let buffer = 0, bits = 0, decoded = '';
    for (const char of part.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')) {
      const value = alphabet.indexOf(char); if (value < 0) return null;
      buffer = (buffer << 6) | value; bits += 6;
      if (bits >= 8) { bits -= 8; decoded += String.fromCharCode((buffer >> bits) & 255); }
    }
    const value = JSON.parse(decoded).session_id;
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
  } catch { return null; }
}
