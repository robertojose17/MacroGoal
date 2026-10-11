import type { InboxSession } from './followRequestTypes';

/** Minimal structural subset of supabase.auth. No Supabase dependency or network implementation here. */
export interface SupabaseAuthUser { id: string; is_anonymous?: boolean }
export interface SupabaseAuthSession {
  access_token: string;
  expires_at?: number;
  user: SupabaseAuthUser;
}
export interface SupabaseAuthSource {
  getSession(): Promise<{ data: { session: SupabaseAuthSession | null }; error: unknown }>;
  getUser(jwt?: string): Promise<{ data: { user: SupabaseAuthUser | null }; error: unknown }>;
  onAuthStateChange(callback: (event: string, session: SupabaseAuthSession | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
}
/** Private transport only. Never put this object in React context, storage, logs or RPC args. */
export interface VerifiedInboxClientSession extends InboxSession {
  accessToken: string;
  isAnonymous: false;
  expiresAtSeconds: number;
}
export interface InboxAuthSnapshot {
  session: InboxSession | null;
  status: 'loading' | 'ready' | 'signed_out' | 'error';
}
export interface InboxAuthOptions {
  now?: () => number;
  timeoutMs?: number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}
let instanceCounter = 0;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bridges Supabase session events to a non-secret UI generation and verified private transport session. */
export function createSupabaseInboxAuthBinding(auth: SupabaseAuthSource, options: InboxAuthOptions = {}) {
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? ((fn, delay) => setTimeout(fn, delay));
  const clearTimer = options.clearTimer ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const timeoutMs = options.timeoutMs ?? 10000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new TypeError('Invalid auth timeout.');
  const namespace = `inbox-auth-${now()}-${++instanceCounter}`; // Non-secret, instance-local freshness namespace.
  let generation = 0, serial = 0, lifecycle = 0;
  let running = false;
  let unsubscribe: (() => void) | null = null;
  let current: VerifiedInboxClientSession | null = null;
  let snapshot: InboxAuthSnapshot = { session: null, status: 'signed_out' };
  let expiryTimer: unknown = null;
  const deferred = new Set<unknown>();
  const waiters = new Set<() => void>();
  const listeners = new Set<() => void>();
  function emit(next: InboxAuthSnapshot) { snapshot = next; listeners.forEach(listener => listener()); }
  function clearExpiry() { if (expiryTimer !== null) clearTimer(expiryTimer); expiryTimer = null; }
  function invalidate(status: InboxAuthSnapshot['status']) {
    serial += 1; generation += 1; current = null; clearExpiry();
    for (const cancel of [...waiters]) cancel();
    emit({ session: null, status });
  }
  function usable(raw: SupabaseAuthSession | null): raw is SupabaseAuthSession & { expires_at: number } {
    return !!raw && !!raw.user && typeof raw.user.id === 'string' && UUID.test(raw.user.id) && raw.user.is_anonymous !== true &&
      // eslint-disable-next-line no-control-regex
      typeof raw.access_token === 'string' && !!raw.access_token && !/[\s\u0000-\u001f\u007f]/.test(raw.access_token) &&
      typeof raw.expires_at === 'number' && Number.isFinite(raw.expires_at) && raw.expires_at * 1000 > now();
  }
  function bounded<T>(operation: () => Promise<T>): Promise<T | null> {
    return new Promise(resolve => {
      let done = false;
      const finish = (value: T | null) => {
        if (done) return;
        done = true; clearTimer(timer); waiters.delete(cancel); resolve(value);
      };
      const cancel = () => finish(null);
      const timer = setTimer(cancel, timeoutMs);
      waiters.add(cancel);
      Promise.resolve().then(() => done ? null : operation()).then(value => finish(value), () => finish(null));
    });
  }

  function defer(operation: () => void) {
    let handle: unknown;
    handle = setTimer(() => { deferred.delete(handle); operation(); }, 0);
    deferred.add(handle);
  }
  function installExpiry() {
    clearExpiry();
    if (!current) return;
    const remaining = Math.max(0, current.expiresAtSeconds * 1000 - now());
    expiryTimer = setTimer(() => {
      expiryTimer = null;
      if (!running || !current) return;
      if (current.expiresAtSeconds * 1000 > now()) { installExpiry(); return; }
      invalidate('signed_out');
      // One bounded re-read permits a refresh event already underway to establish a new generation.
      void refresh();
    }, Math.min(remaining, 2147483647));
  }
  async function verify(candidate: SupabaseAuthSession & { expires_at: number }, key: string, mine: number) {
    const userId = candidate.user.id.toLowerCase();
    const token = candidate.access_token;
    const expiresAtSeconds = candidate.expires_at;
    const result = await bounded(() => auth.getUser(token));
    if (!running || mine !== serial) return;
    if (!result || result.error || !result.data?.user || typeof result.data.user.id !== 'string' || result.data.user.id.toLowerCase() !== userId ||
      result.data.user.is_anonymous !== false || expiresAtSeconds * 1000 <= now()) {
      invalidate('error'); return;
    }
    current = { userId, sessionKey: key, accessToken: token, isAnonymous: false, expiresAtSeconds };
    emit({ session: { userId, sessionKey: key }, status: 'ready' }); installExpiry();
  }
  function acceptEvent(event: string, raw: SupabaseAuthSession | null) {
    if (!running) return;
    if (event === 'SIGNED_OUT' || !raw) { invalidate('signed_out'); return; }
    if (!usable(raw)) { invalidate('error'); return; }
    const userId = raw.user.id.toLowerCase();
    const retain = (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') &&
      current?.userId === userId && current.expiresAtSeconds * 1000 > now();
    const key = retain ? current!.sessionKey : `${namespace}:${++generation}`;
    const mine = ++serial;
    for (const cancel of [...waiters]) cancel();
    const candidate = { access_token: raw.access_token, expires_at: raw.expires_at,
      user: { id: userId, is_anonymous: raw.user.is_anonymous } };
    if (!retain) { current = null; clearExpiry(); emit({ session: null, status: 'loading' }); }
    // NEVER await/call another Supabase auth method inside onAuthStateChange's callback.
    // Defer beyond the auth callback/SDK lock; ignore obsolete work before starting it.
    defer(() => { if (running && mine === serial) void verify(candidate, key, mine); });
  }
  async function refresh() {
    if (!running) return;
    const mine = ++serial;
    const result = await bounded(() => auth.getSession());
    if (!running || mine !== serial) return;
    if (!result || result.error) { invalidate('error'); return; }
    // Re-reading an existing live session can retain generation, while sign-in events always rotate it.
    acceptEvent('TOKEN_REFRESHED', result.data?.session ?? null);
  }
  function start() {
    if (running) return;
    running = true; const startedLifecycle = ++lifecycle;
    invalidate('loading'); const bootstrapSerial = serial;
    try {
      const subscription = auth.onAuthStateChange((event, session) => {
        if (running && startedLifecycle === lifecycle) acceptEvent(event, session);
      }).data.subscription;
      unsubscribe = () => subscription.unsubscribe();
    } catch { running = false; invalidate('error'); return; }
    // Subscribe first; any auth event wins over this possibly stale bootstrap getSession result.
    void bounded(() => auth.getSession()).then(result => {
      if (!running || startedLifecycle !== lifecycle || serial !== bootstrapSerial) return;
      if (!result || result.error) { invalidate('error'); return; }
      acceptEvent('INITIAL_SESSION', result.data?.session ?? null);
    });
  }
  function stop() {
    if (!running && !unsubscribe) return;
    running = false; lifecycle += 1;
    try { unsubscribe?.(); } catch { /* Generic, no credential/error logging. */ }
    unsubscribe = null;
    for (const handle of deferred) clearTimer(handle);
    deferred.clear(); invalidate('signed_out');
  }
  async function getSession(): Promise<VerifiedInboxClientSession | null> {
    if (!running || !current) return null;
    if (current.expiresAtSeconds * 1000 <= now()) { invalidate('signed_out'); return null; }
    return { ...current }; // Caller cannot mutate the binding's in-memory credential snapshot.
  }
  return { start, stop, refresh, getSession, getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
}
export type SupabaseInboxAuthBinding = ReturnType<typeof createSupabaseInboxAuthBinding>;
