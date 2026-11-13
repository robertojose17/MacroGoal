import type { AcceptanceDependencies, AcceptanceRequest, JournalEntry } from '../acceptanceController';

/** Identity-only journal: never stores calorie targets, weights, tokens or profile data. */
export type AdaptiveJournalStorage = {
  read(key: string): Promise<string | null>;
  /** The read/update/write must be one exclusive transaction, including across web tabs. */
  transact(key: string, update: (old: string | null) => string | null): Promise<void>;
};
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function validRequest(v: unknown): v is AcceptanceRequest {
  return record(v) && Object.keys(v).length === 4 && uuid(v.ownerId) && uuid(v.requestId) && uuid(v.proposalId) &&
    typeof v.proposalDigest === 'string' && /^[a-f0-9]{64}$/.test(v.proposalDigest);
}
function same(a: AcceptanceRequest, b: AcceptanceRequest): boolean {
  return a.ownerId === b.ownerId && a.requestId === b.requestId && a.proposalId === b.proposalId && a.proposalDigest === b.proposalDigest;
}
function decode(raw: string | null, owner: string): JournalEntry | null {
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (!record(value) || !validRequest(value.request) || value.request.ownerId !== owner ||
      (value.status !== 'pending' && value.status !== 'rejected') ||
      Object.keys(value).some(k => !['status','request','reason'].includes(k)) ||
      (value.status === 'pending' && 'reason' in value) ||
      (value.status === 'rejected' && (typeof value.reason !== 'string' || !value.reason || value.reason.length > 200))) {
    throw new Error('adaptive_journal_invalid');
  }
  return value.status === 'pending' ? {status:'pending',request:value.request} :
    {status:'rejected',request:value.request,reason:value.reason as string};
}
export function createAdaptiveTdeeJournal(project: string, storage: AdaptiveJournalStorage): AcceptanceDependencies['journal'] {
  if (!/^[a-z0-9-]{6,80}$/.test(project)) throw new Error('adaptive_journal_invalid');
  const key = (owner: string) => {
    if (!uuid(owner)) throw new Error('adaptive_journal_invalid');
    return `adaptive_tdee_v1.${project}.${owner}`;
  };
  const change = (request: AcceptanceRequest, fn: (entry: JournalEntry | null) => JournalEntry | null) => {
    if (!validRequest(request)) throw new Error('adaptive_journal_invalid');
    return storage.transact(key(request.ownerId), raw => {
      const old = decode(raw,request.ownerId);
      if (old && !same(old.request,request)) throw new Error('adaptive_request_pending');
      const next = fn(old);
      return next ? JSON.stringify(next) : null;
    });
  };
  return {
    load: async owner => decode(await storage.read(key(owner)),owner),
    prepare: request => change(request, old => {
      if (old?.status === 'rejected') throw new Error('adaptive_request_rejected');
      return old ?? {status:'pending',request:{...request}};
    }),
    resolve: request => change(request, () => null),
    reject: (request,reason) => change(request, old => {
      if (!old || !reason || reason.length > 200) throw new Error('adaptive_journal_invalid');
      if (old.status === 'rejected' && old.reason !== reason) throw new Error('adaptive_receipt_changed');
      return {status:'rejected',request:{...request},reason};
    }),
    clearRejected: request => change(request, old => {
      if (old?.status === 'pending') throw new Error('adaptive_request_uncertain');
      return null;
    }),
  };
}
