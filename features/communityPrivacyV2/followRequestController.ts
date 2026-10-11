import type {
  FollowDecision, FollowRequestAdapter, FollowRequestConfirmation, FollowRequestIdentity,
  FollowRequestPage, InboxSession, InboxSnapshot,
} from './followRequestTypes';

export function inboxScopeKey(session: InboxSession | null): string | null {
  return session?.userId && session.sessionKey ? JSON.stringify([session.userId, session.sessionKey]) : null;
}
export function requestKey(row: Pick<FollowRequestIdentity, 'requestId' | 'requesterId' | 'revision'>): string {
  return JSON.stringify([row.requestId, row.requesterId, row.revision]);
}
export function emptyInboxSnapshot(scopeKey: string | null = null): InboxSnapshot {
  return { scopeKey, visible: false, status: 'idle', items: [], totalPending: null, nextCursor: null,
    loadingMore: false, moreError: false, pending: {}, rowErrors: {}, announcement: null };
}
const positiveRevision = /^[1-9][0-9]*$/;
function nextRevision(value: string): string {
  const digits = value.split('');
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    if (digits[index] !== '9') { digits[index] = String(Number(digits[index]) + 1); return digits.join(''); }
    digits[index] = '0';
  }
  return `1${digits.join('')}`;
}
function validPage(page: FollowRequestPage, owner: string, current: readonly FollowRequestIdentity[], cursor: string | null): boolean {
  if (!page || page.ownerUserId !== owner || !Array.isArray(page.items) || !Number.isSafeInteger(page.totalPending) ||
    page.totalPending < 0 || !(page.nextCursor === null || (typeof page.nextCursor === 'string' && page.nextCursor.length > 0)) ||
    (page.nextCursor !== null && page.nextCursor === cursor)) return false;
  const ids = new Set(current.map(row => row.requestId));
  const requesters = new Set(current.map(row => row.requesterId));
  for (const row of page.items) {
    if (!row || typeof row.requestId !== 'string' || !row.requestId || typeof row.requesterId !== 'string' ||
      !row.requesterId || row.requesterId === owner || typeof row.revision !== 'string' || !positiveRevision.test(row.revision) ||
      ids.has(row.requestId) || requesters.has(row.requesterId) ||
      !(row.displayName === null || typeof row.displayName === 'string') ||
      !(row.username === null || typeof row.username === 'string') ||
      !(row.avatarUrl === null || typeof row.avatarUrl === 'string')) return false;
    ids.add(row.requestId); requesters.add(row.requesterId);
  }
  return page.nextCursor === null ? page.totalPending === ids.size : page.items.length > 0 && page.totalPending > ids.size;
}
function projectIdentity(row: FollowRequestIdentity): FollowRequestIdentity {
  // Explicit projection, never spread an API/profile object into UI state.
  return { requestId: row.requestId, requesterId: row.requesterId, revision: row.revision,
    displayName: row.displayName, username: row.username, avatarUrl: row.avatarUrl };
}
function confirms(value: FollowRequestConfirmation, session: InboxSession, row: FollowRequestIdentity, decision: FollowDecision): boolean {
  return !!value && value.ownerUserId === session.userId && value.requestId === row.requestId &&
    value.requesterId === row.requesterId && value.previousRevision === row.revision &&
    value.revision === nextRevision(row.revision) && value.state === (decision === 'accept' ? 'accepted' : 'rejected');
}

/** Pure injected-callback state machine. No credentials, network, persistence, logging or notifications. */
export function createFollowRequestController(adapter: FollowRequestAdapter) {
  let session: InboxSession | null = null;
  let snapshot = emptyInboxSnapshot();
  let generation = 0;
  let readSerial = 0;
  let readAbort: AbortController | null = null;
  let deferredRefresh = false;
  let disposed = false;
  const listeners = new Set<() => void>();
  // Kept until the callback settles, even after Close. Aborting a request does not undo a server commit.
  const actions = new Map<string, { scopeKey: string; abort: AbortController }>();
  const emit = (next: InboxSnapshot) => { snapshot = next; listeners.forEach(listener => listener()); };
  const hasActions = () => [...actions.values()].some(action => action.scopeKey === snapshot.scopeKey);
  const stopRead = () => { readSerial += 1; readAbort?.abort(); readAbort = null; };
  const sameScope = (scopeKey: string | null) => !disposed && scopeKey !== null && scopeKey === snapshot.scopeKey;

  function setSession(next: InboxSession | null) {
    const key = inboxScopeKey(next);
    if (disposed || key === snapshot.scopeKey) return;
    generation += 1; stopRead(); deferredRefresh = false;
    for (const action of actions.values()) action.abort.abort();
    session = key && next ? { userId: next.userId, sessionKey: next.sessionKey } : null;
    emit(emptyInboxSnapshot(key));
  }

  async function read(more: boolean, preserveOutcome = false) {
    if (disposed || !session || !snapshot.scopeKey) return;
    if (hasActions()) {
      if (!more) {
        deferredRefresh = true;
        emit({ ...snapshot, items: [], status: snapshot.visible ? 'loading' : 'idle', totalPending: null,
          nextCursor: null, loadingMore: false, moreError: false, pending: {}, rowErrors: {}, announcement: null });
      }
      return;
    }
    if (more && (!snapshot.visible || snapshot.status !== 'ready' || snapshot.loadingMore || !snapshot.nextCursor)) return;
    stopRead();
    const serial = readSerial;
    const viewGeneration = generation;
    const scopeKey = snapshot.scopeKey;
    const started = { ...session };
    const cursor = more ? snapshot.nextCursor : null;
    const prior = more ? snapshot.items : [];
    const outcome = preserveOutcome ? snapshot.announcement : null;
    const retainedErrors = preserveOutcome ? snapshot.rowErrors : {};
    const controller = new AbortController(); readAbort = controller;
    emit(more ? { ...snapshot, loadingMore: true, moreError: false, announcement: null } :
      { ...snapshot, status: snapshot.visible ? 'loading' : 'idle', items: [], totalPending: null,
        nextCursor: null, loadingMore: false, moreError: false, pending: {}, rowErrors: retainedErrors, announcement: outcome });
    try {
      const result = await adapter.list({ session: started, cursor, signal: controller.signal });
      if (!sameScope(scopeKey) || generation !== viewGeneration || serial !== readSerial || controller.signal.aborted) return;
      if (!result.ok || !validPage(result.value, started.userId, prior, cursor)) throw new Error('unavailable');
      const page = result.value;
      emit({ ...snapshot, status: snapshot.visible ? 'ready' : 'idle',
        items: snapshot.visible ? [...prior, ...page.items.map(projectIdentity)] : [],
        totalPending: page.totalPending, nextCursor: snapshot.visible ? page.nextCursor : null,
        loadingMore: false, moreError: false,
        rowErrors: Object.fromEntries(Object.entries(snapshot.rowErrors).filter(([key]) =>
          [...prior, ...page.items].some(row => requestKey(row) === key))) });
    } catch {
      if (!sameScope(scopeKey) || generation !== viewGeneration || serial !== readSerial || controller.signal.aborted) return;
      emit(more ? { ...snapshot, loadingMore: false, moreError: true, nextCursor: null } :
        { ...snapshot, status: snapshot.visible ? 'error' : 'idle', items: [], totalPending: null,
          nextCursor: null, loadingMore: false, moreError: false });
    } finally { if (readAbort === controller) readAbort = null; }
  }

  function open() {
    if (disposed || !session || snapshot.visible) return;
    generation += 1; stopRead();
    emit({ ...emptyInboxSnapshot(snapshot.scopeKey), visible: true, status: 'loading' });
    void read(false);
  }
  function close() {
    if (disposed || !snapshot.visible) return;
    generation += 1; stopRead(); deferredRefresh = false;
    const count = hasActions() ? null : snapshot.totalPending;
    emit({ ...emptyInboxSnapshot(snapshot.scopeKey), totalPending: count });
    // Do not abort a live mutation just because a sheet closes. Keep its deduplication lock until settled.
  }

  async function decide(row: FollowRequestIdentity, decision: FollowDecision) {
    if (disposed || !session || !snapshot.visible || snapshot.status !== 'ready' || snapshot.loadingMore ||
      (decision !== 'accept' && decision !== 'reject')) return;
    const key = requestKey(row);
    const current = snapshot.items.find(item => requestKey(item) === key);
    if (!current || snapshot.rowErrors[key]) return;
    const scopeKey = snapshot.scopeKey!;
    const lockKey = JSON.stringify([scopeKey, key]);
    if (actions.has(lockKey)) return;
    const started = { ...session };
    const requested = projectIdentity(current);
    const viewGeneration = generation;
    const controller = new AbortController();
    actions.set(lockKey, { scopeKey, abort: controller }); // Synchronous, before callback/await/render.
    emit({ ...snapshot, pending: { ...snapshot.pending, [key]: decision },
      nextCursor: null, moreError: false, announcement: null });
    let confirmed = false;
    try {
      const result = await adapter.respond({ session: started, requestId: requested.requestId,
        requesterId: requested.requesterId, expectedRevision: requested.revision, decision, signal: controller.signal });
      confirmed = result.ok && confirms(result.value, started, requested, decision);
    } catch { /* Never retain or display exception text. */ }
    actions.delete(lockKey);
    if (!sameScope(scopeKey)) return;
    const liveRow = snapshot.items.some(item => requestKey(item) === key);
    if (snapshot.visible && generation === viewGeneration && liveRow) {
      const pending = { ...snapshot.pending }; delete pending[key];
      emit(confirmed ? { ...snapshot, pending, items: snapshot.items.filter(item => requestKey(item) !== key),
        totalPending: snapshot.totalPending === null ? null : Math.max(0, snapshot.totalPending - 1),
        announcement: decision === 'accept' ? 'accepted' : 'rejected' } :
        { ...snapshot, pending, rowErrors: { ...snapshot.rowErrors, [key]: true }, announcement: null });
    } else {
      // Never apply a late acknowledgement to the current rows. Obtain a new owner-scoped list instead.
      deferredRefresh = true;
    }
    // SQL consumes/invalidate snapshots on every mutation attempt, including unknown outcomes.
    // Coalesce this mutation batch into one first-page read only after all actions settle.
    deferredRefresh = true;
    if (!hasActions()) { deferredRefresh = false; void read(false, true); }
  }
  function dispose() {
    if (disposed) return;
    disposed = true; generation += 1; stopRead();
    for (const action of actions.values()) action.abort.abort();
    session = null; snapshot = emptyInboxSnapshot(); listeners.clear();
  }
  return { getSnapshot: () => snapshot, subscribe: (listener: () => void) => {
    listeners.add(listener); return () => { listeners.delete(listener); };
  }, setSession, open, close, refresh: () => read(false), loadMore: () => read(true), decide, dispose };
}
export type FollowRequestController = ReturnType<typeof createFollowRequestController>;
