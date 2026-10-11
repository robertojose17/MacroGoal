/** LOCAL ADDITIVE DRAFT. Not part of the frozen inactive 14-file package. */
import type { ClientSession, ApiResult } from './communityProfileApi';
import type { ProfileInput } from './clientContracts';
import type { ProfileResponseV2, FollowRequestDescriptor } from './profileContracts';
import { parseProfileResponse, validateProfileInput } from './responseValidation';
export type OutboundAction = 'request' | 'cancel' | 'unfollow';
export interface OutboundSession { userId: string; sessionKey: string }
export interface OutboundConfirmation {
  requesterUserId: string; targetUserId: string; action: OutboundAction;
  previousRevision: string; follow_request: FollowRequestDescriptor;
}
export interface OutboundDependencies {
  getSession(): Promise<ClientSession | null>;
  fetchProfile(input: ProfileInput, options: { signal: AbortSignal }): Promise<ApiResult<ProfileResponseV2>>;
  /** Bind this POST to the supplied user JWT, never a service-role/global mutable account. */
  rpc(call: { name: 'change_outbound_follow'; method: 'POST'; args: {
    p_target_id: string; p_request_id: string | null; p_expected_revision: string; p_action: OutboundAction;
  }; session: Readonly<ClientSession>; signal: AbortSignal }): Promise<{ data: unknown; error: unknown }>;
  /** Clear rendered/cached protected profile immediately, including on unfollow. */
  onInvalidate(): void;
  now?: () => number;
}
export interface OutboundContext { session: OutboundSession; profile: ProfileInput; signal: AbortSignal }
export interface OutboundChangeInput extends OutboundContext {
  action: OutboundAction;
  requestId: string | null;
  expectedRevision: string;
}
export type OutboundReadResult = { ok: true; value: ProfileResponseV2 } | { ok: false };
export type OutboundChangeResult =
  | { ok: true; value: { confirmation: OutboundConfirmation; profile: ProfileResponseV2 | null } }
  | { ok: false; profile: ProfileResponseV2 | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_REVISION = 9007199254740991n; // Existing SQL constraint; snapshot read type is wider.
const noChange = (): OutboundChangeResult => ({ ok: false, profile: null });
function record(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
function keys(v: unknown, names: string[]): v is Record<string, unknown> {
  return record(v) && Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
}
function revision(v: unknown, zero = false): v is string {
  return typeof v === 'string' && (zero ? /^(0|[1-9]\d{0,15})$/ : /^[1-9]\d{0,15}$/).test(v) && BigInt(v) <= MAX_REVISION;
}
function descriptor(v: unknown): v is FollowRequestDescriptor {
  return keys(v, ['request_id', 'revision', 'state']) && typeof v.request_id === 'string' && UUID.test(v.request_id) &&
    revision(v.revision) && ['pending','accepted','rejected','cancelled','revoked'].includes(v.state as string);
}
function scope(session: OutboundSession, p: ProfileInput): string {
  return JSON.stringify([session.userId.toLowerCase(), session.sessionKey, p.userId, p.fromDate, p.toDate, p.today]);
}
function validExpected(s: OutboundSession): boolean {
  return !!s && typeof s.userId === 'string' && UUID.test(s.userId.toLowerCase()) && typeof s.sessionKey === 'string' && s.sessionKey.length > 0;
}
function confirmed(raw: unknown, input: OutboundChangeInput, p: ProfileInput): OutboundConfirmation | null {
  if (!keys(raw, ['requesterUserId','targetUserId','action','previousRevision','follow_request']) ||
    raw.requesterUserId !== input.session.userId.toLowerCase() || raw.targetUserId !== p.userId || raw.action !== input.action ||
    !revision(raw.previousRevision, true) || !descriptor(raw.follow_request) ||
    (input.requestId !== null && raw.follow_request.request_id !== input.requestId)) return null;
  const previous = BigInt(raw.previousRevision), expected = BigInt(input.expectedRevision), next = BigInt(raw.follow_request.revision);
  if (input.action === 'request') {
    // Canonical SQL request is idempotent for an already pending/accepted row, including a concurrent creator.
    if (!(raw.follow_request.state === 'pending' || raw.follow_request.state === 'accepted')) return null;
    const transitioned = previous === expected && next === previous + 1n && raw.follow_request.state === 'pending';
    const unchanged = previous >= expected && previous > 0n && next === previous;
    if (!transitioned && !unchanged) return null;
  } else if (previous !== expected || next !== previous + 1n ||
    raw.follow_request.state !== (input.action === 'cancel' ? 'cancelled' : 'revoked')) return null;
  return { requesterUserId: raw.requesterUserId, targetUserId: p.userId, action: input.action,
    previousRevision: raw.previousRevision, follow_request: { ...raw.follow_request } };
}

/** One instance per profile view. Keeps only the observed action descriptor, never protected profile data. */
export function createOutboundFollowAdapter(deps: OutboundDependencies) {
  let generation = 0, busy = false;
  let observation: { key: string; requestId: string | null; revision: string; actions: OutboundAction[] } | null = null;
  const now = deps.now ?? Date.now;
  function invalidate() { generation += 1; observation = null; deps.onInvalidate(); }
  async function auth(expected: OutboundSession, signal: AbortSignal): Promise<ClientSession | null> {
    if (signal.aborted || !validExpected(expected)) return null;
    try {
      const s = await deps.getSession();
      if (signal.aborted || !s || typeof s.userId !== 'string' || s.userId.toLowerCase() !== expected.userId.toLowerCase() ||
        s.sessionKey !== expected.sessionKey || s.isAnonymous !== false || typeof s.accessToken !== 'string' ||
        !s.accessToken || /[\s\u0000-\u001f\u007f]/.test(s.accessToken) || !Number.isFinite(s.expiresAtSeconds) || s.expiresAtSeconds * 1000 <= now()) return null;
      return { userId: s.userId.toLowerCase(), sessionKey: s.sessionKey, accessToken: s.accessToken,
        isAnonymous: false, expiresAtSeconds: s.expiresAtSeconds };
    } catch { return null; }
  }
  async function read(context: OutboundContext, p: ProfileInput, mine: number, arm: boolean, minimum?: OutboundConfirmation | null): Promise<ProfileResponseV2 | null> {
    if (!(await auth(context.session, context.signal)) || mine !== generation) return null;
    try {
      const result = await deps.fetchProfile(p, { signal: context.signal });
      if (!result.ok || !(await auth(context.session, context.signal)) || mine !== generation) return null;
      // Revalidate the injected reader's output against this exact caller/target/date contract.
      const value = parseProfileResponse(result.value, p, context.session.userId.toLowerCase());
      if (!value) return null;
      if (minimum && value.can_discover_profile) {
        const d = value.follow_request, confirmed = minimum.follow_request;
        if (!d || d.request_id !== confirmed.request_id || BigInt(d.revision) < BigInt(confirmed.revision) ||
          (d.revision === confirmed.revision && d.state !== confirmed.state)) return null;
      }
      if (arm) {
        const d = value.follow_request;
        const actions: OutboundAction[] = [];
        if (!value.is_own_profile && value.can_discover_profile && (d === null || descriptor(d))) {
          if (value.follow_request_state === 'none' && (d === null || ['rejected','cancelled','revoked'].includes(d.state))) actions.push('request');
          if (value.follow_request_state === 'pending' && d?.state === 'pending') actions.push('cancel');
          if (value.follow_request_state === 'accepted' && d?.state === 'accepted' && value.is_accepted_follower === true && value.is_following === true) actions.push('unfollow');
        }
        observation = { key: scope(context.session, p), requestId: d?.request_id ?? null, revision: d?.revision ?? '0', actions };
      }
      return value;
    } catch { return null; }
  }
  return {
    invalidate,
    async refresh(context: OutboundContext): Promise<OutboundReadResult> {
      try { invalidate(); } catch { return { ok: false }; }
      const mine = generation;
      const p = validateProfileInput(context.profile);
      if (!p || !validExpected(context.session)) return { ok: false };
      const value = await read(context, p, mine, !busy);
      return value ? { ok: true, value } : { ok: false };
    },
    async change(input: OutboundChangeInput): Promise<OutboundChangeResult> {
      const p = validateProfileInput(input.profile);
      if (busy || !p || !validExpected(input.session) || input.signal.aborted || !['request','cancel','unfollow'].includes(input.action) ||
        !(input.requestId === null || (typeof input.requestId === 'string' && UUID.test(input.requestId))) ||
        !revision(input.expectedRevision, true) || BigInt(input.expectedRevision) >= MAX_REVISION ||
        !observation || observation.key !== scope(input.session, p) || observation.requestId !== input.requestId ||
        observation.revision !== input.expectedRevision || !observation.actions.includes(input.action)) return noChange();
      busy = true; // Synchronous before any await: double taps cannot dispatch twice.
      try { invalidate(); } catch { busy = false; return noChange(); }
      const mine = generation;
      try {
        const started = await auth(input.session, input.signal);
        if (!started || mine !== generation) return noChange();
        let raw: unknown = null;
        try {
          const result = await deps.rpc({ name: 'change_outbound_follow', method: 'POST', args: {
            p_target_id: p.userId, p_request_id: input.requestId, p_expected_revision: input.expectedRevision, p_action: input.action,
          }, session: Object.freeze(started), signal: input.signal });
          if (!result.error) raw = result.data;
        } catch { /* Unknown commit outcome: never repeat the mutation or retain diagnostic text. */ }
        if (!(await auth(input.session, input.signal)) || mine !== generation) return noChange();
        const confirmation = confirmed(raw, input, p);
        // Read current server state even after an unknown outcome. No mutation retries or optimistic grant.
        const profile = await read(input, p, mine, true, confirmation);
        if (mine !== generation || !(await auth(input.session, input.signal))) return noChange();
        return confirmation ? { ok: true, value: { confirmation, profile } } : { ok: false, profile };
      } finally { busy = false; }
    },
  };
}
