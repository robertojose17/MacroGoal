/** Inert headless review candidate. No server, native storage or application bindings exist here.
 * All read/accept dependencies must be authenticated server bindings, not client assertions.
 * acceptAtomic must repeat every gate and serialize sources, policy and goal/profile writes.
 * Journal prepare must atomically claim one unresolved request per owner, allow identical
 * replay only, persist before resolving, and reject competing requests across instances.
 * Definitive server rejection must itself have a durable idempotent receipt.
 * Bind cancel() to every blur/account change, including away-and-back transitions.
 * Cancellation never removes a journal or claims an in-flight server write was undone.
 */
export type AcceptanceRequest = Readonly<{ ownerId: string; requestId: string; proposalId: string; proposalDigest: string }>;
export type ReviewedProposal = Readonly<{
  type: 'persisted_reviewed_proposal'; actionable: true; ownerId: string; id: string; digest: string;
  policyVersion: string; engineVersion: string; expiresAt: string;
}>;
export type SafetyState = Readonly<{
  enabled: boolean; policyApproved: boolean; policyVersion: string; engineVersion: string;
  clinicalEligibility: 'verified' | 'unverified'; completeness: 'verified' | 'unverified';
  sourceWriteSerialization: 'verified' | 'unverified';
}>;
export type CommittedReceipt = { status: 'committed'; request: AcceptanceRequest;
  acceptedGoal: Readonly<{ id: string; updatedAt: string | null }>; goalState: 'current' | 'superseded' };
export type Receipt = { status: 'not_found' } |
  CommittedReceipt |
  { status: 'rejected'; request: AcceptanceRequest; reason: string };
export type JournalEntry = { status: 'pending'; request: AcceptanceRequest } |
  { status: 'rejected'; request: AcceptanceRequest; reason: string };
export interface AcceptanceDependencies {
  currentOwner(): string | null;
  isCurrent(): boolean;
  newRequestId(): string;
  journal: {
    load(ownerId: string): Promise<JournalEntry | null>;
    prepare(request: AcceptanceRequest): Promise<void>;
    // Both operations must compare exact request identity atomically. Never
    // resolve/replace another request that a different controller has claimed.
    resolve(request: AcceptanceRequest): Promise<void>;
    reject(request: AcceptanceRequest, reason: string): Promise<void>;
    // Atomic compare-and-clear of this rejected request only. Missing is an
    // idempotent no-op; a pending/different request must never be removed.
    clearRejected(request: AcceptanceRequest): Promise<void>;
  };
  loadProposal(ownerId: string, proposalId: string): Promise<unknown>;
  safetyState(ownerId: string): Promise<SafetyState | null>;
  readReceipt(request: AcceptanceRequest): Promise<Receipt>;
  acceptAtomic(request: AcceptanceRequest): Promise<Exclude<Receipt, { status: 'not_found' }>>;
  now?: () => number;
}
export type AcceptanceResult =
  { status: 'empty' | 'busy' | 'stale' | 'pending' } |
  { status: 'blocked'; reason: string } |
  { status: 'rejected'; reason: string; journalPending: boolean } |
  { status: 'rejection_acknowledged' } |
  (CommittedReceipt & { journalPending: boolean; refreshRequired: true });
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
// Preserve original offset/microseconds for CAS; Date.parse alone normalizes February 30.
function timestamp(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v)) return false;
  const civil = v.slice(0,10), day = new Date(civil + 'T00:00:00Z');
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0,10) === civil && Number.isFinite(Date.parse(v));
}
function committed(value: unknown, request: AcceptanceRequest): CommittedReceipt | null {
  if (!isRecord(value) || value.status !== 'committed' || !same(request,value.request) ||
      !isRecord(value.acceptedGoal) || !uuid(value.acceptedGoal.id) ||
      !(value.acceptedGoal.updatedAt === null || timestamp(value.acceptedGoal.updatedAt)) ||
      !['current','superseded'].includes(String(value.goalState))) return null;
  return {status:'committed',request,acceptedGoal:Object.freeze({id:value.acceptedGoal.id,updatedAt:value.acceptedGoal.updatedAt}),
    goalState:value.goalState === 'current' ? 'current' : 'superseded'};
}
function validRequest(value: unknown): value is AcceptanceRequest {
  return isRecord(value) && Object.keys(value).length === 4 &&
    nonempty(value.ownerId) && uuid(value.requestId) && nonempty(value.proposalId) && digest(value.proposalDigest);
}
function same(a: AcceptanceRequest, b: unknown): boolean {
  return validRequest(b) && a.ownerId === b.ownerId && a.requestId === b.requestId &&
    a.proposalId === b.proposalId && a.proposalDigest === b.proposalDigest;
}
function proposal(value: unknown, owner: string, id: string): ReviewedProposal | null {
  if (!isRecord(value) || value.type !== 'persisted_reviewed_proposal' || value.actionable !== true ||
      value.ownerId !== owner || value.id !== id || !digest(value.digest) || !nonempty(value.policyVersion) ||
      !nonempty(value.engineVersion) || !timestamp(value.expiresAt)) return null;
  return {type:'persisted_reviewed_proposal',actionable:true,ownerId:owner,id,digest:value.digest,
    policyVersion:value.policyVersion,engineVersion:value.engineVersion,expiresAt:value.expiresAt};
}
export function createAdaptiveAcceptanceController(deps: AcceptanceDependencies) {
  let busy = false;
  let generation = 0;
  let inFlightGeneration = 0;
  let rejectionJournalPending = false;
  let hydratedOwner: string | null = null;
  let pending: JournalEntry | null = null;
  let confirmed: CommittedReceipt | null = null;
  const current = (owner: string) => deps.isCurrent() && deps.currentOwner() === owner && (!busy || generation === inFlightGeneration);
  const blocked = (reason: string): AcceptanceResult => ({status:'blocked',reason});
  const immutable = (r: AcceptanceRequest): AcceptanceRequest => Object.freeze({ownerId:r.ownerId,requestId:r.requestId,proposalId:r.proposalId,proposalDigest:r.proposalDigest});
  async function finish(receipt: Exclude<Receipt,{status:'not_found'}>, request: AcceptanceRequest): Promise<AcceptanceResult> {
    if (!current(request.ownerId)) return {status:'stale'};
    if (!same(request,receipt.request)) return blocked('receipt_mismatch');
    if (receipt.status === 'rejected') {
      if (!nonempty(receipt.reason)) return blocked('receipt_invalid');
      pending = {status:'rejected',request,reason:receipt.reason};
      let journalPending = false;
      try { await deps.journal.reject(request,receipt.reason); } catch { journalPending = true; }
      rejectionJournalPending = journalPending;
      if (!current(request.ownerId)) return {status:'stale'};
      return {status:'rejected',reason:receipt.reason,journalPending};
    }
    const validated = committed(receipt,request);
    if (!validated) return blocked('receipt_invalid');
    confirmed = validated;
    let journalPending = false;
    try { await deps.journal.resolve(request); } catch { journalPending = true; }
    if (!current(request.ownerId)) return {status:'stale'};
    if (!journalPending) pending = null;
    // Even a receipt marked current is historical evidence, never a refreshed active goal.
    return {...validated,journalPending,refreshRequired:true};
  }
  async function reconcile(request: AcceptanceRequest): Promise<AcceptanceResult | null> {
    if (!current(request.ownerId)) return {status:'stale'};
    const receipt: unknown = await deps.readReceipt(request);
    if (!current(request.ownerId)) return {status:'stale'};
    if (!isRecord(receipt)) return blocked('receipt_invalid');
    if (receipt.status === 'not_found') return Object.keys(receipt).length === 1 ? null : blocked('receipt_invalid');
    if (!same(request,receipt.request)) return blocked('receipt_mismatch');
    if (receipt.status === 'committed') {
      const validated = committed(receipt,request);
      return validated ? finish(validated,request) : blocked('receipt_invalid');
    }
    if (receipt.status === 'rejected' && nonempty(receipt.reason)) return finish({status:'rejected',request,reason:receipt.reason},request);
    return blocked('receipt_invalid');
  }
  async function gate(owner: string, id: string, expectedDigest?: string): Promise<ReviewedProposal | AcceptanceResult> {
    if (!current(owner)) return {status:'stale'};
    const value = await deps.loadProposal(owner,id);
    if (!current(owner)) return {status:'stale'};
    const p = proposal(value,owner,id);
    if (!p || (expectedDigest !== undefined && p.digest !== expectedDigest)) return blocked('proposal_changed_or_invalid');
    const now = deps.now?.() ?? Date.now();
    if (!Number.isFinite(now) || Date.parse(p.expiresAt) <= now) return blocked('proposal_expired');
    const safety = await deps.safetyState(owner);
    if (!current(owner)) return {status:'stale'};
    if (!safety || safety.enabled !== true || safety.policyApproved !== true || safety.policyVersion !== p.policyVersion ||
        safety.engineVersion !== p.engineVersion || safety.clinicalEligibility !== 'verified' ||
        safety.completeness !== 'verified' || safety.sourceWriteSerialization !== 'verified') return blocked('safety_review_required');
    return p;
  }
  async function apply(request: AcceptanceRequest): Promise<AcceptanceResult> {
    if (!current(request.ownerId)) return {status:'stale'};
    await deps.journal.prepare(request);
    if (!current(request.ownerId)) return {status:'stale'};
    // No retries here. A thrown/ambiguous transport outcome leaves the exact request pending.
    const result: unknown = await deps.acceptAtomic(request);
    if (!current(request.ownerId)) return {status:'stale'};
    if (!isRecord(result) || !same(request,result.request)) return blocked('receipt_mismatch');
    if (result.status === 'committed') {
      const validated = committed(result,request);
      return validated ? finish(validated,request) : blocked('receipt_invalid');
    }
    if (result.status === 'rejected' && nonempty(result.reason)) return finish({status:'rejected',request,reason:result.reason},request);
    return blocked('receipt_invalid');
  }
  async function guarded(run: (owner: string) => Promise<AcceptanceResult>): Promise<AcceptanceResult> {
    if (busy) return {status:'busy'};
    const owner = deps.currentOwner();
    if (!owner || !current(owner)) return {status:'stale'};
    busy = true;
    inFlightGeneration = generation;
    try { return await run(owner); }
    catch { return current(owner) ? {status:'pending'} : {status:'stale'}; }
    finally { busy = false; }
  }
  return {
    cancel: () => { generation++; },
    hasPending: () => pending !== null && pending.request.ownerId === deps.currentOwner(),
    recover: () => guarded(async owner => {
      const loaded: unknown = await deps.journal.load(owner);
      if (!current(owner)) return {status:'stale'};
      if (loaded === null) {
        // An uncertain in-memory prepare must not be erased by an empty read.
        if (pending?.request.ownerId === owner) return {status:'pending'};
        hydratedOwner = owner; pending = null; confirmed = null; return {status:'empty'};
      }
      if (!isRecord(loaded) || !validRequest(loaded.request) || loaded.request.ownerId !== owner ||
          !['pending','rejected'].includes(String(loaded.status))) return blocked('journal_invalid');
      const request = immutable(loaded.request);
      hydratedOwner = owner;
      if (loaded.status === 'rejected') {
        if (!nonempty(loaded.reason)) return blocked('journal_invalid');
        pending = {status:'rejected',request,reason:loaded.reason};
        rejectionJournalPending = false;
        return {status:'rejected',reason:loaded.reason,journalPending:false};
      }
      pending = {status:'pending',request};
      return await reconcile(request) ?? {status:'pending'};
    }),
    accept: (proposalId: string) => guarded(async owner => {
      if (hydratedOwner !== owner) return blocked('recovery_required');
      if (pending?.request.ownerId === owner) return blocked('request_pending');
      if (!nonempty(proposalId)) return blocked('proposal_invalid');
      const p = await gate(owner,proposalId);
      if ('status' in p) return p;
      const request = immutable({ownerId:owner,requestId:deps.newRequestId(),proposalId:p.id,proposalDigest:p.digest});
      if (!validRequest(request)) return blocked('request_invalid');
      pending = {status:'pending',request}; confirmed = null;
      return apply(request);
    }),
    retry: () => guarded(async owner => {
      if (hydratedOwner !== owner || !pending || pending.request.ownerId !== owner) return blocked('recovery_required');
      const request = pending.request;
      if (pending.status === 'rejected') return {status:'rejected',reason:pending.reason,journalPending:rejectionJournalPending};
      if (confirmed && same(request,confirmed.request)) return finish(confirmed,request);
      const result = await reconcile(request);
      if (result) return result;
      const p = await gate(owner,request.proposalId,request.proposalDigest);
      if ('status' in p) return p;
      return apply(request);
    }),
    acknowledgeRejection: () => guarded(async owner => {
      if (hydratedOwner !== owner || !pending || pending.request.ownerId !== owner) return blocked('recovery_required');
      if (pending.status !== 'rejected') return blocked('request_uncertain');
      const request = pending.request;
      // A local rejection cannot authorize discarding a possibly committed write.
      // Reconcile even while new acceptance is OFF, without resending anything.
      const result = await reconcile(request);
      if (!result) return blocked('rejection_not_confirmed');
      if (result.status !== 'rejected' || result.journalPending) return result;
      if (!current(owner)) return {status:'stale'};
      await deps.journal.clearRejected(request);
      // Clear only the reconciled request, including after an account/blur change.
      // A stale screen still receives no result and must recover before new work.
      if (pending && same(request,pending.request)) pending = null;
      confirmed = null;
      rejectionJournalPending = false;
      if (!current(owner)) { hydratedOwner = null; return {status:'stale'}; }
      return {status:'rejection_acknowledged'};
    }),
  };
}
