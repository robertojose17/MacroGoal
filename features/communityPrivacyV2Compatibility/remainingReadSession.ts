import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseInboxAuthBinding } from '../communityPrivacyV2/supabaseInboxAuth';
import type { SupabaseAuthSource, VerifiedInboxClientSession } from '../communityPrivacyV2/supabaseInboxAuth';
import { createCommunityCompatibilityReader } from './communityCompatibility';
import { createSupabaseCompatibilityTransport } from './supabaseCompatibilityTransport';

export type RemainingReadClient = Pick<SupabaseClient, 'from' | 'rpc'> & { auth: SupabaseAuthSource };
export interface RemainingReadContext {
  session: VerifiedInboxClientSession;
  signal: AbortSignal;
  identities: ReturnType<typeof createCommunityCompatibilityReader>;
  assertCurrent(): Promise<void>;
}
const unavailable = () => new Error('Community data is unavailable.');

/** One bounded, private auth binding per operation; no shared row/token cache.
 * Auth loss aborts immediately. Every SDK request must explicitly pin this session's JWT. */
export async function withRemainingReadSession<T>(client: RemainingReadClient,
  work: (context: RemainingReadContext) => Promise<T>, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 10000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw unavailable();
  const request = new AbortController();
  const binding = createSupabaseInboxAuthBinding(client.auth, { timeoutMs });
  let timer: ReturnType<typeof setTimeout> | undefined, unsubscribe = () => {}, detach = () => {};
  let expected: VerifiedInboxClientSession | null = null;
  let finish!: (result: { value: T } | { error: Error }) => void;
  let settled = false;
  const result = new Promise<T>((resolve, reject) => {
    finish = outcome => {
      if (settled) return;
      settled = true;
      request.abort();
      if (timer !== undefined) clearTimeout(timer);
      unsubscribe(); detach(); binding.stop();
      if ('error' in outcome) reject(outcome.error); else resolve(outcome.value);
    };
  });
  const abort = () => finish({ error: unavailable() });
  options.signal?.addEventListener('abort', abort, { once: true });
  detach = () => options.signal?.removeEventListener('abort', abort);
  timer = setTimeout(abort, timeoutMs);
  if (options.signal?.aborted) { abort(); return result; }
  const same = (next: VerifiedInboxClientSession | null) => !!expected && !!next &&
    next.userId === expected.userId && next.sessionKey === expected.sessionKey &&
    next.expiresAtSeconds * 1000 > Date.now() && expected.expiresAtSeconds * 1000 > Date.now();
  const assertCurrent = async () => {
    if (settled || request.signal.aborted || !same(await binding.getSession())) throw unavailable();
  };
  let started = false;
  const startWork = async () => {
    if (settled || started) return;
    const snapshot = binding.getSnapshot();
    if (snapshot.status === 'loading') return;
    if (!snapshot.session) { abort(); return; }
    started = true;
    try {
      expected = await binding.getSession();
      await assertCurrent();
      const identities = createCommunityCompatibilityReader({ getSession: binding.getSession,
        rpc: createSupabaseCompatibilityTransport({ client, getSession: binding.getSession, timeoutMs }),
        onInvalidate: () => {}, timeoutMs });
      const value = await work({ session: expected!, signal: request.signal, identities, assertCurrent });
      await assertCurrent();
      finish({ value });
    } catch { abort(); }
  };
  unsubscribe = binding.subscribe(() => {
    if (expected) {
      const session = binding.getSnapshot().session;
      if (!session || session.userId !== expected.userId || session.sessionKey !== expected.sessionKey) { abort(); return; }
    }
    void startWork();
  });
  binding.start();
  return result;
}
