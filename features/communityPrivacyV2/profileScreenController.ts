import type { ProfileInput } from './clientContracts';
import type { ProfileResponseV2 } from './profileContracts';
import type { OutboundAction, OutboundSession, createOutboundFollowAdapter } from './outboundFollowAdapter';
import type { ConnectionDirection, ProfileConnectionsState, ProfilePostsState, ProfileSupplementAdapter } from './profileSupplementTypes';
import { validateProfileInput } from './responseValidation';

export type ProfileScreenAdapter = ReturnType<typeof createOutboundFollowAdapter>;
export interface ProfileScreenScope { session: OutboundSession; profile: ProfileInput }
export interface ProfileScreenState {
  scopeKey: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  profile: ProfileResponseV2 | null;
  busy: boolean;
  outcome: 'updated' | 'unconfirmed' | 'blocked' | 'block_unconfirmed' | null;
  blockBusy: boolean;
  connections: ProfileConnectionsState;
  posts: ProfilePostsState;
}
export function screenScopeKey(scope: ProfileScreenScope | null): string | null {
  return scope ? JSON.stringify([scope.session.userId, scope.session.sessionKey, scope.profile.userId,
    scope.profile.fromDate, scope.profile.toDate, scope.profile.today]) : null;
}
export function emptyProfileScreenState(scopeKey: string | null = null): ProfileScreenState {
  return { scopeKey, status: scopeKey ? 'loading' : 'idle', profile: null, busy: false, outcome: null, blockBusy: false,
    connections: { direction: null, status: 'idle', items: [] },
    posts: { status: 'idle', items: [], nextCursor: null, loadingMore: false } };
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
export function createProfileScreenController(createAdapter: (clear: () => void) => ProfileScreenAdapter,
  createSupplements?: () => ProfileSupplementAdapter) {
  let scope: ProfileScreenScope | null = null;
  let state = emptyProfileScreenState();
  let generation = 0;
  let readAbort: AbortController | null = null;
  let mutation: AbortController | null = null;
  let queuedRefresh = false;
  const listeners = new Set<() => void>();
  const emit = (next: ProfileScreenState) => { state = next; listeners.forEach(listener => listener()); };
  const supplements = createSupplements?.();
  let connectionsAbort: AbortController | null = null, postsAbort: AbortController | null = null;
  let connectionSerial = 0;
  function clearSupplements() {
    connectionSerial += 1; connectionsAbort?.abort(); connectionsAbort = null; postsAbort?.abort(); postsAbort = null;
    supplements?.invalidate();
  }
  const adapter = createAdapter(() => {
    clearSupplements();
    emit({ ...state, profile: null, outcome: null,
      connections: { direction: null, status: 'idle', items: [] },
      posts: { status: 'idle', items: [], nextCursor: null, loadingMore: false } });
  });
  const stopRead = () => { generation += 1; readAbort?.abort(); readAbort = null; };
  const current = (key: string, mine: number) => scope !== null && state.scopeKey === key && generation === mine;

  async function refresh() {
    if (!scope) return;
    if (mutation) { queuedRefresh = true; clearSupplements(); emit({ ...state, status: 'loading', profile: null,
      connections: { direction: null, status: 'idle', items: [] }, posts: { status: 'idle', items: [], nextCursor: null, loadingMore: false } }); return; }
    stopRead();
    const mine = generation, key = state.scopeKey!;
    const started = { session: { ...scope.session }, profile: { ...scope.profile } };
    const controller = new AbortController(); readAbort = controller;
    emit({ ...emptyProfileScreenState(key), status: 'loading' });
    try {
      const result = await adapter.refresh({ ...started, signal: controller.signal });
      if (!current(key, mine) || controller.signal.aborted) return;
      emit({ ...state, status: result.ok ? 'ready' : 'error', profile: result.ok ? result.value : null });
      if (result.ok && result.value.can_view_profile) void loadPosts();
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
    clearSupplements();
    emit({ ...state, profile: null, busy: true, outcome: null,
      connections: { direction: null, status: 'idle', items: [] },
      posts: { status: 'idle', items: [], nextCursor: null, loadingMore: false } }); // Clear before the first await or transport call.
    try {
      const result = await adapter.change({ ...started, signal: controller.signal, action,
        requestId: descriptor?.request_id ?? null, expectedRevision: descriptor?.revision ?? '0' });
      if (current(key, mine) && !controller.signal.aborted) {
        const profile = result.ok ? result.value.profile : result.profile;
        emit({ ...state, status: profile ? 'ready' : 'error', profile,
          outcome: result.ok ? 'updated' : 'unconfirmed' });
        if (profile?.can_view_profile) void loadPosts();
      }
    } catch {
      if (current(key, mine) && !controller.signal.aborted) emit({ ...state, status: 'error', profile: null, outcome: 'unconfirmed' });
    } finally {
      if (mutation === controller) mutation = null;
      emit({ ...state, busy: false });
      if (queuedRefresh && scope) { queuedRefresh = false; void refresh(); }
    }
  }
  function supplementFailure() {
    stopRead(); adapter.invalidate();
    emit({ ...state, status: 'error', profile: null }); // A denial may mean acceptance/block changed.
  }
  async function loadPosts() {
    if (!supplements || !scope || !state.profile?.can_view_profile) return;
    postsAbort?.abort(); const controller = new AbortController(); postsAbort = controller;
    const mine = generation, key = state.scopeKey!, started = { session: { ...scope.session }, targetUserId: scope.profile.userId };
    emit({ ...state, posts: { status: 'loading', items: [], nextCursor: null, loadingMore: false } });
    try {
      const result = await supplements.posts({ ...started, cursor: null, signal: controller.signal });
      if (!current(key, mine) || controller.signal.aborted || postsAbort !== controller) return;
      if (!result.ok || result.value.targetUserId !== started.targetUserId) { supplementFailure(); return; }
      emit({ ...state, posts: { status: 'ready', items: result.value.items,
        nextCursor: result.value.nextCursor, loadingMore: false } });
    } catch { if (current(key, mine) && !controller.signal.aborted) supplementFailure(); }
    finally { if (postsAbort === controller) postsAbort = null; }
  }
  async function openConnections(direction: ConnectionDirection) {
    if (!supplements || !scope || state.busy || !state.profile?.can_view_profile ||
      !['followers', 'following'].includes(direction)) return;
    connectionsAbort?.abort(); const controller = new AbortController(); connectionsAbort = controller;
    const serial = ++connectionSerial, mine = generation, key = state.scopeKey!;
    const started = { session: { ...scope.session }, targetUserId: scope.profile.userId };
    emit({ ...state, connections: { direction, status: 'loading', items: [] } });
    try {
      const result = await supplements.connections({ ...started, direction, signal: controller.signal });
      if (!current(key, mine) || controller.signal.aborted || serial !== connectionSerial) return;
      if (!result.ok || result.value.targetUserId !== started.targetUserId || result.value.direction !== direction) { supplementFailure(); return; }
      emit({ ...state, connections: { direction, status: 'ready', items: result.value.items } });
    } catch { if (current(key, mine) && !controller.signal.aborted && serial === connectionSerial) supplementFailure(); }
    finally { if (connectionsAbort === controller) connectionsAbort = null; }
  }
  function closeConnections() {
    connectionSerial += 1; connectionsAbort?.abort(); connectionsAbort = null; supplements?.invalidate();
    emit({ ...state, connections: { direction: null, status: 'idle', items: [] } });
  }
  /** The UI must show an explicit confirmation for this exact scope before calling. */
  async function block(confirmedScopeKey: string): Promise<boolean> {
    if (!supplements || mutation || !scope || state.status !== 'ready' || state.scopeKey !== confirmedScopeKey ||
      !state.profile?.can_discover_profile || state.profile.is_own_profile) return false;
    const started = { session: { ...scope.session }, targetUserId: scope.profile.userId };
    stopRead(); adapter.invalidate();
    const mine = generation, key = state.scopeKey!, controller = new AbortController(); mutation = controller;
    emit({ ...state, profile: null, status: 'loading', busy: true, blockBusy: true, outcome: null });
    let confirmed = false;
    try {
      const result = await supplements.block({ ...started, signal: controller.signal });
      if (!current(key, mine) || controller.signal.aborted) return false;
      confirmed = result.ok && result.value.blockerId === started.session.userId && result.value.targetUserId === started.targetUserId;
      emit({ ...state, status: confirmed ? 'ready' : 'error', profile: null,
        outcome: confirmed ? 'blocked' : 'block_unconfirmed' });
    } catch {
      if (current(key, mine) && !controller.signal.aborted) emit({ ...state, status: 'error', profile: null, outcome: 'block_unconfirmed' });
    } finally {
      if (mutation === controller) mutation = null;
      emit({ ...state, busy: false, blockBusy: false });
      if (queuedRefresh && scope) { queuedRefresh = false; void refresh(); }
    }
    return confirmed;
  }
  return { getSnapshot: () => state, subscribe: (listener: () => void) => {
    listeners.add(listener); return () => { listeners.delete(listener); };
  }, setScope, refresh, change, openConnections, closeConnections, block };
}
