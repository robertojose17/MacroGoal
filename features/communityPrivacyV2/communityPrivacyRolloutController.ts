import type { SupabaseInboxAuthBinding, VerifiedInboxClientSession } from './supabaseInboxAuth';

export type CommunityPrivacyActivation = Readonly<{
  status: 'disabled' | 'pending' | 'ready' | 'signed_out' | 'error';
  mode: 'legacy' | 'protected' | null;
  rollout: 'none' | 'pair' | 'general';
  actorId: string | null;
  scopeKey: string;
}>;
export interface CommunityPrivacyRequest<T> extends PromiseLike<T> {
  setHeader(name: string, value: string): { abortSignal(signal: AbortSignal): PromiseLike<T> };
}
export interface CommunityPrivacyScope {
  readonly activation: CommunityPrivacyActivation;
  readonly signal: AbortSignal;
  assertCurrent(): void;
  assertActor(actorId: string | undefined | null): void;
  request<T>(query: CommunityPrivacyRequest<T>): Promise<T>;
  fetch(input: string, init?: RequestInit): Promise<Response>;
  release(): void;
}
export interface CommunityPrivacyRolloutDependencies {
  requested: boolean;
  /** Global builds stay unavailable unless the server confirms general availability. */
  requireGeneral?: boolean;
  createAuthBinding(): SupabaseInboxAuthBinding;
  eligibility(session: VerifiedInboxClientSession, signal: AbortSignal): Promise<unknown>;
  now?: () => number;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}
const unavailable = () => new Error('Community data is unavailable.');
const DISABLED: CommunityPrivacyActivation = Object.freeze({ status: 'disabled', mode: 'legacy', rollout: 'none', actorId: null, scopeKey: 'disabled' });

/** No session credentials or backend cohort IDs are exposed through this store. */
export function createCommunityPrivacyRolloutController(dependencies: CommunityPrivacyRolloutDependencies) {
  const now = dependencies.now ?? Date.now;
  const timeoutMs = dependencies.timeoutMs ?? 10000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new TypeError('Invalid rollout timeout.');
  let generation = 0, running = false;
  let snapshot: CommunityPrivacyActivation = dependencies.requested
    ? Object.freeze({ status: 'pending', mode: null, rollout: 'none', actorId: null, scopeKey: 'rollout:0' }) : DISABLED;
  let auth: SupabaseInboxAuthBinding | null = null;
  let session: VerifiedInboxClientSession | null = null;
  let unsubscribe: (() => void) | null = null;
  let eligibilityAbort: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const scopes = new Set<AbortController>();
  const listeners = new Set<() => void>();
  function emit(value: CommunityPrivacyActivation) {
    snapshot = Object.freeze(value);
    for (const listener of [...listeners]) listener();
  }
  function invalidate(status: 'pending' | 'signed_out' | 'error') {
    ++generation; session = null;
    eligibilityAbort?.abort(); eligibilityAbort = null;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (expiryTimer !== undefined) clearTimeout(expiryTimer);
    expiryTimer = undefined;
    for (const scope of scopes) scope.abort();
    scopes.clear();
    emit({ status, mode: null, rollout: 'none', actorId: null, scopeKey: `rollout:${generation}` });
  }
  // React snapshot reads stay pure. Timers/auth events publish changes outside render.
  function getSnapshot(): CommunityPrivacyActivation { return snapshot; }
  function expireIfNeeded() {
    if (session && session.expiresAtSeconds * 1000 <= now()) invalidate('signed_out');
  }
  function scheduleExpiry() {
    if (expiryTimer !== undefined) clearTimeout(expiryTimer);
    if (!session) return;
    expiryTimer = setTimeout(() => {
      expiryTimer = undefined; expireIfNeeded();
      if (session) scheduleExpiry();
    }, Math.min(Math.max(0, session.expiresAtSeconds * 1000 - now()), 2147483647));
  }
  async function onAuthChange() {
    if (!running || !auth) return;
    const state = auth.getSnapshot();
    if (state.status !== 'ready' || !state.session) {
      invalidate(state.status === 'loading' ? 'pending' : state.status === 'error' ? 'error' : 'signed_out');
      return;
    }
    invalidate('pending');
    const mine = generation, binding = auth;
    const controller = new AbortController(); eligibilityAbort = controller;
    timer = setTimeout(() => { if (running && mine === generation) invalidate('error'); }, timeoutMs);
    try {
      const verified = await binding.getSession();
      if (!running || mine !== generation || controller.signal.aborted) return;
      if (!verified || verified.isAnonymous !== false || verified.expiresAtSeconds * 1000 <= now() ||
          verified.userId !== state.session.userId || verified.sessionKey !== state.session.sessionKey) throw unavailable();
      const result = await dependencies.eligibility(verified, controller.signal);
      if (!running || mine !== generation || controller.signal.aborted) return;
      const current = await binding.getSession();
      if (!running || mine !== generation || controller.signal.aborted) return;
      if (!current || current.userId !== verified.userId || current.sessionKey !== verified.sessionKey ||
          current.accessToken !== verified.accessToken || current.expiresAtSeconds * 1000 <= now()) throw unavailable();
      const row = result as Record<string, unknown> | null;
      if (!row || typeof row !== 'object' || Array.isArray(row) || row.version !== 1 || typeof row.enabled !== 'boolean' ||
          !(row.enabled ? row.rollout === 'pair' || row.rollout === 'general' : row.rollout === 'closed')) throw unavailable();
      if (dependencies.requireGeneral && (!row.enabled || row.rollout !== 'general')) throw unavailable();
      clearTimeout(timer); timer = undefined; eligibilityAbort = null;
      session = { ...current };
      scheduleExpiry();
      emit({ status: 'ready', mode: row.enabled ? 'protected' : 'legacy',
        rollout: row.enabled ? row.rollout as 'pair' | 'general' : 'none', actorId: current.userId, scopeKey: `rollout:${mine}` });
    } catch {
      if (running && mine === generation) invalidate('error');
    }
  }
  function start() {
    if (!dependencies.requested || running) return;
    running = true;
    try {
      auth = dependencies.createAuthBinding();
      unsubscribe = auth.subscribe(() => { void onAuthChange(); });
      auth.start();
    } catch { invalidate('error'); }
  }
  function stop() {
    if (!dependencies.requested) return;
    running = false;
    unsubscribe?.(); unsubscribe = null;
    auth?.stop(); auth = null;
    invalidate('pending');
  }
  function retry() {
    if (!dependencies.requested || !running || !auth) return;
    invalidate('pending');
    void auth.refresh();
  }
  function getScope(): CommunityPrivacyScope {
    expireIfNeeded();
    const activation = getSnapshot();
    if (activation.status !== 'disabled' && activation.status !== 'ready') throw unavailable();
    const credential = session ? { ...session } : null;
    const abort = new AbortController();
    let released = false;
    if (activation.status !== 'disabled') scopes.add(abort);
    function assertCurrent() {
      if (released || abort.signal.aborted) throw unavailable();
      if (activation.status === 'disabled') return;
      expireIfNeeded();
      if (getSnapshot() !== activation || !running || !credential || credential.expiresAtSeconds * 1000 <= now()) throw unavailable();
    }
    function assertActor(actorId: string | undefined | null) {
      assertCurrent();
      if (activation.status !== 'disabled' && actorId?.toLowerCase() !== activation.actorId) throw unavailable();
    }
    return { activation, signal: abort.signal, assertCurrent, assertActor,
      async request<T>(query: CommunityPrivacyRequest<T>): Promise<T> {
        assertCurrent();
        const result = await (credential ? query.setHeader('Authorization', `Bearer ${credential.accessToken}`).abortSignal(abort.signal) : query);
        assertCurrent(); return result;
      },
      async fetch(input, init = {}) {
        assertCurrent();
        const fetcher = dependencies.fetch ?? globalThis.fetch;
        if (!credential) return fetcher(input, init);
        const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${credential.accessToken}`);
        const result = await fetcher(input, { ...init, headers, signal: abort.signal });
        assertCurrent(); return result;
      },
      release() { released = true; scopes.delete(abort); abort.abort(); },
    };
  }
  return { start, stop, retry, getSnapshot, getScope,
    subscribe(listener: () => void) {
      if (!dependencies.requested) return () => {};
      listeners.add(listener); return () => { listeners.delete(listener); };
    },
  };
}
