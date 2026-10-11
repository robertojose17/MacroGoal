/** LOCAL STAGING ONLY. Authenticated RPC adapter; not connected to application code. */
import type { ClientSession } from './communityProfileApi';
import type { InboxSession, InboxResult, FollowRequestAdapter, FollowRequestPage,
  FollowRequestIdentity, FollowRequestConfirmation, FollowDecision } from './followRequestTypes';

export type FollowRequestRpcName = 'list_follow_request_inbox' | 'respond_follow_request';
export interface FollowRequestRpcCall {
  name: FollowRequestRpcName;
  method: 'POST';
  args: Readonly<Record<string, string | number | null>>;
  /** Private transport context. Bind the RPC to THIS user JWT, not a global changing account.
   * Never log, persist, serialize into RPC args, or expose this context to UI. */
  session: Readonly<ClientSession>;
  signal: AbortSignal;
}
export interface FollowRequestDependencies {
  getSession(): Promise<ClientSession | null>;
  /** Implement using a user-scoped Supabase RPC client, never a service-role client. */
  rpc(call: FollowRequestRpcCall): Promise<{ data: unknown; error: unknown }>;
  now?: () => number;
  pageSize?: number;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_REVISION = 9007199254740991n; // Current canonical SQL revision constraint; never convert to Number.
const fail = (): { ok: false } => ({ ok: false });
function obj(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return obj(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function id(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
function revision(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) && BigInt(value) <= MAX_REVISION;
}
// eslint-disable-next-line no-control-regex
function text(value: unknown, limit: number): value is string | null { return value === null || (typeof value === 'string' && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value)); }
function sessionScope(s: InboxSession): string { return JSON.stringify([s.userId.toLowerCase(), s.sessionKey]); }
function validSession(s: ClientSession | null, expected: InboxSession, now: number): s is ClientSession {
  return !!s && typeof s.userId === 'string' && id(s.userId.toLowerCase()) && s.userId.toLowerCase() === expected.userId.toLowerCase() &&
    s.isAnonymous === false && typeof s.sessionKey === 'string' && s.sessionKey.length > 0 && s.sessionKey === expected.sessionKey &&
    // eslint-disable-next-line no-control-regex
    typeof s.accessToken === 'string' && s.accessToken.length > 0 && !/[\s\u0000-\u001f\u007f]/.test(s.accessToken) &&
    Number.isFinite(s.expiresAtSeconds) && s.expiresAtSeconds * 1000 > now;
}
function validExpected(s: InboxSession): boolean {
  return !!s && typeof s.userId === 'string' && id(s.userId.toLowerCase()) && typeof s.sessionKey === 'string' && s.sessionKey.length > 0;
}
/** Exact verified app-upload location. Equality intentionally rejects credentials,
 * alternate owners/origins, private/signed buckets, encodings, query and fragment. */
function approvedAvatar(value: unknown, requesterId: string): value is string | null {
  return value === null || value === `https://esgptfiofoaeguslgvcq.supabase.co/storage/v1/object/public/avatars/${requesterId}/avatar.jpg`;
}
function item(value: unknown, owner: string): FollowRequestIdentity | null {
  if (!exact(value, ['requestId', 'requesterId', 'revision', 'displayName', 'username', 'avatarUrl']) ||
    !id(value.requestId) || !id(value.requesterId) || value.requesterId === owner || !revision(value.revision) ||
    !text(value.displayName, 200) || !text(value.username, 100) || !approvedAvatar(value.avatarUrl, value.requesterId)) return null;
  return { requestId: value.requestId, requesterId: value.requesterId, revision: value.revision,
    displayName: value.displayName, username: value.username, avatarUrl: value.avatarUrl };
}
function page(value: unknown, owner: string, limit: number): FollowRequestPage | null {
  if (!exact(value, ['ownerUserId', 'items', 'totalPending', 'nextCursor']) || value.ownerUserId !== owner ||
    !Array.isArray(value.items) || value.items.length > limit || typeof value.totalPending !== 'number' ||
    !Number.isSafeInteger(value.totalPending) || value.totalPending < value.items.length || value.totalPending > 10000 ||
    !(value.nextCursor === null || id(value.nextCursor))) return null;
  const items: FollowRequestIdentity[] = [];
  const seen = new Set<string>(), requesters = new Set<string>();
  for (const raw of value.items) {
    const parsed = item(raw, owner);
    if (!parsed || seen.has(parsed.requestId) || requesters.has(parsed.requesterId)) return null;
    seen.add(parsed.requestId); requesters.add(parsed.requesterId); items.push(parsed);
  }
  if (value.nextCursor !== null && (items.length !== limit || value.totalPending <= items.length)) return null;
  return { ownerUserId: owner, items, totalPending: value.totalPending, nextCursor: value.nextCursor as string | null };
}
function confirmation(value: unknown, owner: string, requestId: string, requesterId: string,
  expectedRevision: string, decision: FollowDecision): FollowRequestConfirmation | null {
  if (!exact(value, ['ownerUserId', 'requestId', 'requesterId', 'previousRevision', 'revision', 'state']) ||
    value.ownerUserId !== owner || value.requestId !== requestId || value.requesterId !== requesterId ||
    value.previousRevision !== expectedRevision || !revision(value.revision) ||
    BigInt(value.revision) !== BigInt(expectedRevision) + 1n || value.state !== (decision === 'accept' ? 'accepted' : 'rejected')) return null;
  return { ownerUserId: owner, requestId, requesterId, previousRevision: expectedRevision,
    revision: value.revision, state: decision === 'accept' ? 'accepted' : 'rejected' };
}

/** One instance per inbox controller. Fresh lists authorize only displayed pending rows.
 * No auto-retry after mutations: a lost acknowledgement may still mean the transaction committed. */
export function createFollowRequestAdapter(deps: FollowRequestDependencies): FollowRequestAdapter {
  const limit = deps.pageSize ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new TypeError('Inbox page size must be between 1 and 50.');
  const now = deps.now ?? Date.now;
  let scope: string | null = null, epoch = 0, readSerial = 0, pendingCount: number | null = null;
  let nextCursor: string | null = null;
  const observed = new Map<string, FollowRequestIdentity>();
  const seenRequesters = new Set<string>();
  const inFlight = new Set<string>();
  function invalidatePages() { epoch += 1; nextCursor = null; pendingCount = null; }
  function bind(expected: InboxSession) {
    const next = sessionScope(expected);
    if (scope !== next) { scope = next; invalidatePages(); observed.clear(); seenRequesters.clear(); }
  }
  async function auth(expected: InboxSession, signal: AbortSignal): Promise<ClientSession | null> {
    if (signal.aborted || !validExpected(expected)) return null;
    try {
      const current = await deps.getSession();
      return !signal.aborted && validSession(current, expected, now()) ? {
        userId: current.userId.toLowerCase(), accessToken: current.accessToken, sessionKey: current.sessionKey,
        isAnonymous: false, expiresAtSeconds: current.expiresAtSeconds,
      } : null;
    } catch { return null; }
  }
  async function call(name: FollowRequestRpcName, args: Record<string, string | number | null>, expected: InboxSession,
    started: ClientSession, signal: AbortSignal): Promise<unknown | null> {
    try {
      const result = await deps.rpc({ name, method: 'POST', args, session: Object.freeze({ ...started }), signal });
      // Never retain an RPC error/body/exception. A changed auth generation invalidates all results.
      if (result.error || !(await auth(expected, signal))) return null;
      return result.data;
    } catch { return null; }
  }
  return {
    async list(input): Promise<InboxResult<FollowRequestPage>> {
      if (!validExpected(input.session) || (input.cursor !== null && !id(input.cursor))) return fail();
      const serial = ++readSerial;
      const started = await auth(input.session, input.signal);
      if (!started || serial !== readSerial) return fail();
      bind(input.session);
      if (input.cursor === null) { invalidatePages(); observed.clear(); seenRequesters.clear(); }
      else if (input.cursor !== nextCursor) return fail();
      const mine = epoch, key = scope;
      const previousCount = pendingCount, previousSize = observed.size;
      nextCursor = null; // A continuation cannot be replayed or raced in this adapter.
      const raw = await call('list_follow_request_inbox', { p_cursor: input.cursor, p_limit: limit }, input.session, started, input.signal);
      if (mine !== epoch || serial !== readSerial || key !== scope || raw === null) return fail();
      const parsed = page(raw, started.userId.toLowerCase(), limit);
      if (!parsed || (input.cursor !== null && parsed.totalPending !== previousCount) ||
        parsed.items.some(row => observed.has(row.requestId) || seenRequesters.has(row.requesterId)) ||
        (parsed.nextCursor !== null && parsed.nextCursor === input.cursor) ||
        (parsed.nextCursor === null && previousSize + parsed.items.length !== parsed.totalPending) ||
        (parsed.nextCursor !== null && previousSize + parsed.items.length >= parsed.totalPending)) return fail();
      for (const row of parsed.items) { observed.set(row.requestId, { ...row }); seenRequesters.add(row.requesterId); }
      pendingCount = parsed.totalPending; nextCursor = parsed.nextCursor;
      return { ok: true, value: parsed };
    },
    async respond(input): Promise<InboxResult<FollowRequestConfirmation>> {
      if (!validExpected(input.session) || !id(input.requestId) || !id(input.requesterId) || !revision(input.expectedRevision) ||
        BigInt(input.expectedRevision) >= MAX_REVISION || !['accept', 'reject'].includes(input.decision) || input.signal.aborted) return fail();
      // Synchronous lock before any await, including session reads.
      const key = JSON.stringify([sessionScope(input.session), input.requestId, input.expectedRevision]);
      if (inFlight.has(key)) return fail();
      inFlight.add(key);
      let claimed = false;
      try {
        const started = await auth(input.session, input.signal);
        if (!started || scope !== sessionScope(input.session)) return fail();
        const row = observed.get(input.requestId);
        if (!row || row.requesterId !== input.requesterId || row.revision !== input.expectedRevision) return fail();
        claimed = true; observed.delete(input.requestId); invalidatePages();
        const raw = await call('respond_follow_request', {
          p_request_id: input.requestId, p_requester_id: input.requesterId,
          p_expected_revision: input.expectedRevision, p_decision: input.decision,
        }, input.session, started, input.signal);
        if (raw === null || scope !== sessionScope(input.session)) return fail();
        const value = confirmation(raw, started.userId.toLowerCase(), input.requestId, input.requesterId, input.expectedRevision, input.decision);
        return value ? { ok: true, value } : fail();
      } finally {
        inFlight.delete(key);
        // A list racing a mutation must not re-authorize the obsolete revision.
        if (claimed && scope === sessionScope(input.session)) {
          invalidatePages();
          if (observed.get(input.requestId)?.revision === input.expectedRevision) observed.delete(input.requestId);
        }
      }
    },
  };
}
