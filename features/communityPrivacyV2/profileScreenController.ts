import type { ProfileInput } from './clientContracts';
import type { ProfileResponseV2 } from './profileContracts';
import type { OutboundAction, OutboundSession, createOutboundFollowAdapter } from './outboundFollowAdapter';
import { validateProfileInput } from './responseValidation';

export type ProfileScreenAdapter = ReturnType<typeof createOutboundFollowAdapter>;
export interface ProfileScreenScope { session: OutboundSession; profile: ProfileInput }
export interface ProfileScreenState {
  scopeKey: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  profile: ProfileResponseV2 | null;
  busy: boolean;
  outcome: 'updated' | 'unconfirmed' | null;
}
export function screenScopeKey(scope: ProfileScreenScope | null): string | null {
  return scope ? JSON.stringify([scope.session.userId, scope.session.sessionKey, scope.profile.userId,
    scope.profile.fromDate, scope.profile.toDate, scope.profile.today]) : null;
}
export function emptyProfileScreenState(scopeKey: string | null = null): ProfileScreenState {
  return { scopeKey, status: scopeKey ? 'loading' : 'idle', profile: null, busy: false, outcome: null };
}
export function profileAction(profile: ProfileResponseV2 | null): OutboundAction | null {
  if (!profile || profile.is_own_profile || !profile.can_discover_profile) return null;
  const request = profile.follow_request;
  if (profile.follow_request_state === 'none' && (!request || ['rejected', 'cancelled', 'revoked'].includes(request.state))) return 'request';
  if (profile.follow_request_state === 'pending' && request?.state === 'pending') return 'cancel';
  if (profile.follow_request_state === 'accepted' && request?.state === 'accepted' &&
    profile.is_accepted_follower === true && profile.is_following === true) return 'unfollow';
  return null;
}

/** Pure, one-view controller. The adapter owns exact revision validation and authoritative action refresh. */
export function createProfileScreenController(createAdapter: (clear: () => void) => ProfileScreenAdapter) {
  let scope: ProfileScreenScope | null = null;
  let state = emptyProfileScreenState();
  let generation = 0;
  let readAbort: AbortController | null = null;
  let mutation: AbortController | null = null;
  let queuedRefresh = false;
  const listeners = new Set<() => void>();
  const emit = (next: ProfileScreenState) => { state = next; listeners.forEach(listener => listener()); };
  const adapter = createAdapter(() => emit({ ...state, profile: null, outcome: null }));
  const stopRead = () => { generation += 1; readAbort?.abort(); readAbort = null; };
  const current = (key: string, mine: number) => scope !== null && state.scopeKey === key && generation === mine;

  async function refresh() {
    if (!scope) return;
    if (mutation) { queuedRefresh = true; emit({ ...state, status: 'loading', profile: null }); return; }
    stopRead();
    const mine = generation, key = state.scopeKey!;
    const started = { session: { ...scope.session }, profile: { ...scope.profile } };
    const controller = new AbortController(); readAbort = controller;
    emit({ ...emptyProfileScreenState(key), status: 'loading' });
    try {
      const result = await adapter.refresh({ ...started, signal: controller.signal });
      if (!current(key, mine) || controller.signal.aborted) return;
      emit({ ...state, status: result.ok ? 'ready' : 'error', profile: result.ok ? result.value : null });
    } catch {
      if (current(key, mine) && !controller.signal.aborted) emit({ ...state, status: 'error', profile: null });
    } finally { if (readAbort === controller) readAbort = null; }
  }
  function setScope(next: ProfileScreenScope | null) {
    const input = next && validateProfileInput(next.profile);
    const clean = next && input && next.session.userId && next.session.sessionKey ?
      { session: { userId: next.session.userId.toLowerCase(), sessionKey: next.session.sessionKey }, profile: input } : null;
    const key = screenScopeKey(clean);
    if (key === state.scopeKey) return;
    stopRead(); mutation?.abort(); adapter.invalidate(); queuedRefresh = false;
    scope = clean; emit(emptyProfileScreenState(key));
    if (scope) void refresh();
  }
  async function change(action: OutboundAction) {
    if (mutation || !scope || state.status !== 'ready' || action !== profileAction(state.profile)) return;
    const selected = state.profile!;
    const started = { session: { ...scope.session }, profile: { ...scope.profile } };
    const descriptor = selected.follow_request;
    stopRead();
    const mine = generation, key = state.scopeKey!;
    const controller = new AbortController(); mutation = controller;
    emit({ ...state, profile: null, busy: true, outcome: null }); // Clear before the first await or transport call.
    try {
      const result = await adapter.change({ ...started, signal: controller.signal, action,
        requestId: descriptor?.request_id ?? null, expectedRevision: descriptor?.revision ?? '0' });
      if (current(key, mine) && !controller.signal.aborted) {
        const profile = result.ok ? result.value.profile : result.profile;
        emit({ ...state, status: profile ? 'ready' : 'error', profile,
          outcome: result.ok ? 'updated' : 'unconfirmed' });
      }
    } catch {
      if (current(key, mine) && !controller.signal.aborted) emit({ ...state, status: 'error', profile: null, outcome: 'unconfirmed' });
    } finally {
      if (mutation === controller) mutation = null;
      emit({ ...state, busy: false });
      if (queuedRefresh && scope) { queuedRefresh = false; void refresh(); }
    }
  }
  return { getSnapshot: () => state, subscribe: (listener: () => void) => {
    listeners.add(listener); return () => { listeners.delete(listener); };
  }, setScope, refresh, change };
}
