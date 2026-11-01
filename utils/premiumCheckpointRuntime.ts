import { CHECKPOINT_ID_PATTERN, PREMIUM_SOURCES } from './premiumCheckpointContract';
import type { PremiumCheckpoint } from './premiumCheckpointContract';

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
      !object(v.flow) || !exact(v.flow, ['flowId','source']) || !id(v.flow.flowId) ||
      !oneOf(v.flow.source, PREMIUM_SOURCES) || !object(v.detail)) return false;
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

export type ActorLease = Readonly<{ userId: string; sessionId: string; generation: number; credentials: { accessToken: string } }>;
export type CheckpointTransport = (body: string, lease: ActorLease, signal: AbortSignal) => Promise<'ack' | 'retry' | 'reject'>;
export const CHECKPOINT_ENDPOINT = 'https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/track-onboarding/premium-checkpoint';
/** Exact shared endpoint verified against deployed track-onboarding v20 on 2026-11-01. */
export function pinnedCheckpointTransport(
  endpoint: string,
  current: () => ActorLease | null,
  verify: (lease: ActorLease) => Promise<boolean>,
  request: typeof fetch = fetch,
): CheckpointTransport {
  if (endpoint !== CHECKPOINT_ENDPOINT) throw new Error('unapproved_checkpoint_endpoint');
  return async (body, lease, signal) => {
    try {
      if (signal.aborted || current() !== lease || !(await verify(lease)) || current() !== lease || signal.aborted) return 'reject';
      const response = await request(endpoint, { method: 'POST', redirect: 'error', credentials: 'omit',
        headers: { Authorization: 'Bearer ' + lease.credentials.accessToken, 'Content-Type': 'application/json' }, body, signal });
      if (signal.aborted || current() !== lease) return 'reject';
      if (response.status === 408 || response.status === 429 || response.status >= 500) return 'retry';
      if (response.status !== 200 && response.status !== 202) return 'reject';
      const ack = await response.json();
      const eventId = JSON.parse(body).eventId;
      return object(ack) && exact(ack, ['eventId','status']) && ack.eventId === eventId &&
        ((response.status === 202 && ack.status === 'accepted') || (response.status === 200 && ack.status === 'duplicate')) ? 'ack' : 'retry';
    } catch { return signal.aborted || current() !== lease ? 'reject' : 'retry'; }
  };
}

/** In-memory, bounded, nonblocking delivery. No actor/token is placed in event JSON. */
export function createCheckpointQueue(current: () => ActorLease | null, transport: CheckpointTransport | null) {
  type Entry = { body: string; lease: ActorLease; tries: number; created: number };
  const pending: Entry[] = [];
  let running = false;
  let stopped = false;
  let active: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const run = async () => {
    if (running || stopped || !transport) return;
    running = true;
    try {
      while (!stopped && pending.length) {
        const item = pending[0];
        if (current() !== item.lease || Date.now() - item.created > 120000 || item.tries >= 3) { pending.shift(); continue; }
        active = new AbortController();
        const controller = active;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let result: 'ack' | 'retry' | 'reject' = 'retry';
        try {
          item.tries += 1;
          result = await Promise.race([
            Promise.resolve().then(() => transport(item.body, item.lease, controller.signal)),
            new Promise<'retry'>(resolve => { timeout = setTimeout(() => { controller.abort(); resolve('retry'); }, 8000); }),
          ]);
        } catch { result = 'retry'; }
        finally { if (timeout) clearTimeout(timeout); active = null; }
        if (pending[0] !== item) continue;
        if (result !== 'retry' || current() !== item.lease || item.tries >= 3) { pending.shift(); continue; }
        retryTimer = setTimeout(() => { retryTimer = null; void run(); }, item.tries * 1500);
        break;
      }
    } finally { running = false; }
  };
  return Object.freeze({
    enqueue(event: unknown, lease: ActorLease | null = current()): boolean {
      if (stopped || !transport || !lease || current() !== lease || pending.length >= 64) return false;
      const body = checkpointBody(event);
      if (!body) return false;
      pending.push({ body, lease, tries: 0, created: Date.now() });
      if (!retryTimer) void run();
      return true;
    },
    invalidate() {
      active?.abort();
      pending.splice(0);
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    },
    stop() {
      stopped = true; active?.abort(); pending.splice(0);
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    },
  });
}
