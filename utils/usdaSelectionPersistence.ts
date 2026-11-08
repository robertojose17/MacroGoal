import { supabase } from '@/lib/supabase/client';
import type { OpenFoodFactsProduct } from './openFoodFacts';
import { exactFdcId } from './catalogSelection';

/** Client continuity only. The server remains responsible for authentication. */
export interface PendingUsdaIdentity {
  userId: string;
  sessionEpoch: string;
  fdcId: string;
  operationId: string;
}
export type UsdaSelectionOutcome =
  | { status: 'not_applicable' }
  | { status: 'unknown'; identity: PendingUsdaIdentity | null; portionEvidence?: unknown; continuity?: { epoch: number }; reason?: 'capacity' }
  | { status: 'persisted'; identity: PendingUsdaIdentity; foodItemId: string; portionEvidence?: unknown };

type Session = { user: { id: string }; access_token: string };
type Operation = {
  identity: PendingUsdaIdentity;
  completion: Promise<UsdaSelectionOutcome>;
  initial: Promise<UsdaSelectionOutcome>;
  result?: UsdaSelectionOutcome;
  readback?: Promise<UsdaSelectionOutcome>;
};
type Scope = { userId: string; sessionId: string; epoch: string; operations: Map<string, Operation>; completed: Map<string, Operation> };
const MAX_UNCERTAIN_OPERATIONS = 128;
const MAX_ACKNOWLEDGED_OPERATIONS = 64;
const unknown = (identity: PendingUsdaIdentity | null): UsdaSelectionOutcome => ({ status: 'unknown', identity });
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
let scope: Scope | null = null;
let initialized = false;
let authRevision = 0;
let continuityEpoch = 0;
let observedAuth = false;
let operationSequence = 0;
let sessionSequence = 0;
const processEpoch = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Never store, log or use credentials as a cache key. */
function sessionId(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part || part.length > 20000) return null;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let buffer = 0, bits = 0, decoded = '';
    for (const char of part.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')) {
      const value = alphabet.indexOf(char);
      if (value < 0) return null;
      buffer = (buffer << 6) | value; bits += 6;
      if (bits >= 8) { bits -= 8; decoded += String.fromCharCode((buffer >> bits) & 255); }
    }
    const payload: unknown = JSON.parse(decoded);
    return record(payload) && uuid(payload.session_id) ? payload.session_id : null;
  } catch { return null; }
}
function acceptSession(session: Session | null, event?: string) {
  if (event) authRevision++;
  const id = session ? sessionId(session.access_token) : null;
  const unchanged = scope && session && id
    ? scope.userId === session.user.id && scope.sessionId === id
    : !scope && !id;
  const wasObserved = observedAuth;
  observedAuth = true;
  if (unchanged && event !== 'SIGNED_OUT' && !(event && event !== 'INITIAL_SESSION' && !scope)) return;
  // A first SDK snapshot identifies existing continuity. Real auth transitions retire it.
  if (wasObserved || event && event !== 'INITIAL_SESSION') continuityEpoch++;
  scope = session && id ? { userId: session.user.id, sessionId: id, epoch: `${processEpoch}-${++sessionSequence}`, operations: new Map(), completed: new Map() } : null;
}
function initializeSessionObserver() {
  if (initialized) return;
  initialized = true;
  supabase.auth.onAuthStateChange((event, session) => acceptSession(session, event));
}

async function currentScope(): Promise<Scope | null> {
  initializeSessionObserver();
  const revision = authRevision;
  const startingScope = scope;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (revision === authRevision) {
      // A read error is not a sign-out. Retain the operation map to avoid replay.
      if (error) return null;
      acceptSession(data.session);
      if (startingScope && scope !== startingScope) return null;
    } else return startingScope && scope === startingScope ? scope : null;
    // Refresh may keep the same epoch; a gesture must never migrate to a new one.
  } catch { return null; }
  return scope;
}
async function stillCurrent(owner: Scope): Promise<boolean> { return await currentScope() === owner; }
function operationFor(owner: Scope | null, identity: PendingUsdaIdentity): Operation | undefined {
  if (!owner || owner.userId !== identity.userId || owner.epoch !== identity.sessionEpoch) return;
  const pending = owner.operations.get(identity.fdcId);
  if (pending?.identity.operationId === identity.operationId) return pending;
  const completed = owner.completed.get(identity.operationId);
  if (completed?.identity.fdcId !== identity.fdcId) return;
  // Refresh LRU order when an original acknowledged operation is still in use.
  owner.completed.delete(identity.operationId);
  owner.completed.set(identity.operationId, completed);
  return completed;
}
export function usdaIdentityIsCurrent(identity: PendingUsdaIdentity): boolean {
  // Auth-state notifications retire the local epoch synchronously. No extra UI wait.
  // A transient read failure cannot retire a known epoch or block valid nutrition.
  // UUID acceptance separately requires a verified response/read in stillCurrent.
  return !!scope && scope.userId === identity.userId && scope.epoch === identity.sessionEpoch;
}
/** Stable event continuity also protects legacy logging when the optional identity read
 * is unavailable. This token has no user identity and can never authorize UUID linkage.
 */
export function usdaSelectionIsCurrent(outcome: UsdaSelectionOutcome): boolean {
  if (outcome.status === 'not_applicable') return true;
  if (outcome.identity) return usdaIdentityIsCurrent(outcome.identity);
  return outcome.status === 'unknown' && outcome.continuity?.epoch === continuityEpoch;
}
async function bounded<T>(promise: Promise<T>, fallback: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<T>(resolve => { timer = setTimeout(() => resolve(fallback()), 1800); })]); }
  finally { if (timer) clearTimeout(timer); }
}
function persistedResponse(response: unknown, identity: PendingUsdaIdentity): UsdaSelectionOutcome {
  if (!record(response) || response.error || !record(response.data)) return unknown(identity);
  const data = response.data;
  if (data.fdc_id !== identity.fdcId) return unknown(identity);
  if (!uuid(data.food_item_id)) return { status: 'unknown', identity, portionEvidence: data.portion_evidence };
  return { status: 'persisted', identity, foodItemId: data.food_item_id, portionEvidence: data.portion_evidence };
}

/** One in-flight/uncertain write per exact FDC/session. Acknowledged success may refresh.
 * The 1.8s wait is a UI budget, not evidence of cancellation or rollback.
 */
export async function persistUsdaSelection(product: OpenFoodFactsProduct): Promise<UsdaSelectionOutcome> {
  const fdcId = exactFdcId(product._usda_fdc_id);
  if (!fdcId || product._serving_authority === 'confirmed_correction') return { status: 'not_applicable' };
  initializeSessionObserver();
  const continuity = { epoch: continuityEpoch };
  let admitting = true;
  let identity: PendingUsdaIdentity | null = null;
  const run = async (): Promise<UsdaSelectionOutcome> => {
    const owner = await currentScope();
    // The UI budget includes local auth. A late auth result must not start a write.
    if (!owner || !admitting) return unknown(null);
    const existing = owner.operations.get(fdcId);
    if (existing) {
      identity = existing.identity;
      const result = existing.result?.status === 'persisted' ? existing.result : await existing.initial;
      return await stillCurrent(owner) ? result : unknown(existing.identity);
    }
    // Never evict an uncertain write to make it replayable. Optional catalog capture
    // pauses at capacity; valid nutrition logging and all search results continue.
    if (owner.operations.size >= MAX_UNCERTAIN_OPERATIONS) return { status: 'unknown', identity: null, reason: 'capacity' };
    const pending: PendingUsdaIdentity = {
      userId: owner.userId, sessionEpoch: owner.epoch, fdcId,
      operationId: `${Date.now()}-${++operationSequence}`,
    };
    identity = pending;
    // Defer I/O until registration, so concurrent clicks cannot duplicate it.
    const completion = Promise.resolve().then(async (): Promise<UsdaSelectionOutcome> => {
      if (!await stillCurrent(owner) || !admitting) return unknown(pending);
      try {
        const response: unknown = await supabase.functions.invoke('lookup-barcode', { body: { operation: 'usda_portions_v1', fdc_id: fdcId } });
        return await stillCurrent(owner) ? persistedResponse(response, pending) : unknown(pending);
      } catch { return unknown(pending); }
    });
    const operation: Operation = { identity: pending, completion, initial };
    owner.operations.set(fdcId, operation);
    void completion.then(result => {
      if (operation.result?.status !== 'persisted') operation.result = result;
      // Only the original acknowledged response releases the write reservation.
      // A positive readback proves identity, not completion of a lost request.
      if (result.status === 'persisted') {
        if (owner.operations.get(fdcId) === operation) owner.operations.delete(fdcId);
        owner.completed.set(pending.operationId, operation);
        while (owner.completed.size > MAX_ACKNOWLEDGED_OPERATIONS) {
          const oldest = owner.completed.keys().next().value;
          if (oldest === undefined) break;
          owner.completed.delete(oldest);
        }
      }
    });
    return completion;
  };
  const initial = bounded(run(), () => unknown(identity));
  try {
    const result = await initial;
    return result.status === 'unknown' && !result.identity ? { ...result, continuity } : result;
  } finally { admitting = false; }
}

/** Exact-ID readback only. Empty, aborted and failed reads all remain unknown. */
export async function reconcileUsdaSelection(identity: PendingUsdaIdentity): Promise<UsdaSelectionOutcome> {
  const owner = await currentScope();
  const operation = operationFor(owner, identity);
  if (!owner || !operation) return unknown(identity);
  if (operation.result?.status === 'persisted') return operation.result;
  if (!operation.readback) {
    operation.readback = bounded(Promise.resolve().then(async (): Promise<UsdaSelectionOutcome> => {
      if (!await stillCurrent(owner)) return unknown(identity);
      try {
        const { data, error } = await supabase.from('food_items').select('id,usda_fdc_id').eq('usda_fdc_id', identity.fdcId).maybeSingle();
        if (!await stillCurrent(owner) || error || !data || exactFdcId(data.usda_fdc_id) !== identity.fdcId || !uuid(data.id)) return unknown(identity);
        const result: UsdaSelectionOutcome = { status: 'persisted', identity, foodItemId: data.id };
        operation.result = result;
        return result;
      } catch { return unknown(identity); }
    }), () => unknown(identity));
  }
  return operation.readback;
}

/** Observe the original request, never resend it after a timeout or a transport error. */
export async function continueUsdaSelection(identity: PendingUsdaIdentity): Promise<UsdaSelectionOutcome> {
  const owner = await currentScope();
  const operation = operationFor(owner, identity);
  if (!owner || !operation) return unknown(identity);
  const result = await operation.completion;
  if (!await stillCurrent(owner)) return unknown(identity);
  return result.status === 'persisted' ? result : reconcileUsdaSelection(identity);
}

/** Reuse the existing auth-session epoch for optional detail capture. No credential is exposed. */
export async function selectedNutritionScope():Promise<{userId:string;epoch:string}|null>{
 const owner=await currentScope();return owner?{userId:owner.userId,epoch:owner.epoch}:null;
}
export async function invokeSelectedNutritionCapture(expected:{userId:string;epoch:string},body:Record<string,string>):Promise<unknown>{
 const owner=await currentScope();
 if(!owner||owner.userId!==expected.userId||owner.epoch!==expected.epoch)throw Error('selection_owner_changed');
 const {data,error}=await supabase.auth.getSession();
 const session=data?.session;
 if(error||!session||session.user.id!==owner.userId||sessionId(session.access_token)!==owner.sessionId||!await stillCurrent(owner))throw Error('selection_owner_changed');
 // Bind this dispatch to the admitted session, not a later SDK account snapshot.
 return supabase.functions.invoke('lookup-barcode',{body,headers:{Authorization:'Bearer '+session.access_token}});
}

