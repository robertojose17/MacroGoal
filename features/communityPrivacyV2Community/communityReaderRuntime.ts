import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseInboxAuthBinding } from '../communityPrivacyV2/supabaseInboxAuth';
import { createCommunityReaderClient } from './communityReaderClient';
import { createCommunityOutboundClient } from './communityOutboundClient';
import { createCommunityScopedQuery } from './communityScopedQuery';
import { UUID } from './communityReaderContracts';
import type { ReadScope } from './communityReaderContracts';
export interface CommunityReadSnapshot { scopeKey: string | null; userId: string | null; viewKey: string; status: 'loading' | 'ready' | 'signed_out' | 'error'; }
export const EMPTY_COMMUNITY_READ_STATE: CommunityReadSnapshot = { scopeKey: null, userId: null, viewKey: 'unavailable', status: 'signed_out' };
export function createCommunityReaderRuntime(client: Pick<SupabaseClient, 'auth' | 'from' | 'rpc'>) {
  const binding = createSupabaseInboxAuthBinding(client.auth);
  const readers = createCommunityReaderClient({ client, getSession: binding.getSession });
  const outbound = createCommunityOutboundClient({ client, getSession: binding.getSession, readers });
  const run = createCommunityScopedQuery(binding.getSession);
  let active = false, version = 0, snapshot = EMPTY_COMMUNITY_READ_STATE;
  let exclusive: 'block' | 'outbound' | null = null;
  let unsubscribe: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const serials = new Map<string, number>();
  const operations = new Map<string, { abort: AbortController; viewKey: string; finish(): void }>();
  const scopeKey = (scope: ReadScope | null) => scope ? JSON.stringify([scope.userId, scope.sessionKey]) : null;
  const emit = (retainedSurface?: string) => {
    version += 1; snapshot = { ...snapshot, viewKey: `${snapshot.scopeKey ?? 'unavailable'}:${version}` };
    if (retainedSurface) { const retained = operations.get(retainedSurface); if (retained) retained.viewKey = snapshot.viewKey; }
    listeners.forEach(fn => fn());
  };
  function cancel(surface: string) {
    serials.set(surface, (serials.get(surface) ?? 0) + 1);
    const operation = operations.get(surface); operation?.abort.abort(); operation?.finish();
  }
  function clear(except?: string) {
    for (const surface of [...operations.keys()]) if (surface !== except) cancel(surface);
    outbound.invalidate(); emit(except);
  }
  function reconcile() {
    const auth = binding.getSnapshot(), session = active ? auth.session : null, key = scopeKey(session);
    const status = active ? auth.status : 'signed_out';
    if (key === snapshot.scopeKey && status === snapshot.status) return;
    snapshot = { scopeKey: key, userId: session?.userId ?? null, viewKey: '', status }; clear();
  }
  function activate() {
    if (active) return; active = true;
    unsubscribe = binding.subscribe(reconcile); binding.start(); reconcile();
  }
  function deactivate() {
    active = false; snapshot = { ...EMPTY_COMMUNITY_READ_STATE }; clear();
    unsubscribe?.(); unsubscribe = null; binding.stop();
  }
  function begin(surface: string) {
    if (exclusive && !['owner', 'avatar'].includes(surface)) return null;
    cancel(surface);
    const session = active ? binding.getSnapshot().session : null;
    if (!session || scopeKey(session) !== snapshot.scopeKey) return null;
    const captured = { ...session }, expected = snapshot.scopeKey, abort = new AbortController();
    const serial = (serials.get(surface) ?? 0) + 1; serials.set(surface, serial);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const operation = { abort, viewKey: snapshot.viewKey, finish() {
      if (timer !== null) clearTimeout(timer); timer = null;
      if (operations.get(surface) === operation) { operations.delete(surface); if (exclusive === surface) exclusive = null; }
    } };
    operations.set(surface, operation);
    if (surface === 'block' || surface === 'outbound') exclusive = surface;
    timer = setTimeout(() => { abort.abort(); operation.finish(); }, 12000);
    return { session: captured, signal: abort.signal,
      current: () => active && !abort.signal.aborted && expected === snapshot.scopeKey && operation.viewKey === snapshot.viewKey && operations.get(surface) === operation,
      alive: () => active && expected === snapshot.scopeKey && operation.viewKey === snapshot.viewKey && serials.get(surface) === serial,
      finish: operation.finish };
  }
  async function block(scope: ReadScope, signal: AbortSignal, targetId: string) {
    if (!UUID.test(targetId) || targetId === scope.userId) return false;
    const result = await run(scope, signal, (session, abort) => client.from('blocked_users')
      .insert({ blocker_id: session.userId, blocked_id: targetId }).select('blocker_id,blocked_id').limit(1)
      .setHeader('Authorization', `Bearer ${session.accessToken}`).abortSignal(abort));
    return result.ok && Array.isArray(result.value) && result.value.length === 1 &&
      result.value[0].blocker_id === scope.userId && result.value[0].blocked_id === targetId;
  }
  return { activate, deactivate, begin, cancel, clear, readers, outbound, block,
    releaseExclusive: (surface: 'block' | 'outbound') => { if (exclusive === surface) exclusive = null; },
    getSnapshot: () => snapshot, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
}
export type CommunityReaderRuntime = ReturnType<typeof createCommunityReaderRuntime>;
