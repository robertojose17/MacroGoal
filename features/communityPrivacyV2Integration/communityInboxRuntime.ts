import type { SupabaseClient } from '@supabase/supabase-js';
import { createFollowRequestAdapter } from '../communityPrivacyV2/followRequestAdapter';
import { createFollowRequestController, inboxScopeKey } from '../communityPrivacyV2/followRequestController';
import { createSupabaseInboxAuthBinding } from '../communityPrivacyV2/supabaseInboxAuth';
import type { InboxAuthOptions } from '../communityPrivacyV2/supabaseInboxAuth';
import { createSupabaseFollowRequestTransport } from './supabaseFollowRequestTransport';

/** Constructed only inside the flag-gated Community child. Construction itself
 * registers no auth listeners, starts no timers, and performs no requests. */
export function createCommunityInboxRuntime(client: Pick<SupabaseClient, 'auth' | 'rpc'>, options: {
  auth?: InboxAuthOptions;
  transportTimeoutMs?: number;
} = {}) {
  const binding = createSupabaseInboxAuthBinding(client.auth, options.auth);
  const rpc = createSupabaseFollowRequestTransport({ client, getSession: binding.getSession,
    timeoutMs: options.transportTimeoutMs, now: options.auth?.now });
  const makeAdapter = () => createFollowRequestAdapter({ getSession: binding.getSession, rpc, now: options.auth?.now });
  let adapter = makeAdapter();
  const controller = createFollowRequestController({
    async list(input) {
      const startedAdapter = adapter;
      const result = await startedAdapter.list(input);
      // Closed badge reads retain only their count, including in the adapter's
      // internal row-capability cache. Reopening always obtains a fresh page.
      if (adapter === startedAdapter && !controller.getSnapshot().visible) adapter = makeAdapter();
      return result;
    },
    respond: input => adapter.respond(input),
  });
  let active = false;
  let unsubscribe: (() => void) | null = null;

  function reconcile() {
    const session = active ? binding.getSnapshot().session : null;
    if (controller.getSnapshot().scopeKey === inboxScopeKey(session)) return;
    adapter = makeAdapter(); // Discard old-scope identity/cursor capability state.
    controller.setSession(session);
    if (session) void controller.refresh();
  }
  function activate() {
    if (active) return;
    active = true;
    unsubscribe = binding.subscribe(reconcile);
    binding.start();
    reconcile();
  }
  function deactivate() {
    active = false;
    controller.setSession(null); // Synchronously clears UI and aborts old observations.
    adapter = makeAdapter();
    unsubscribe?.(); unsubscribe = null;
    binding.stop(); // Clears verified token, timers, pending auth work, and listener.
  }
  function close() {
    controller.close();
    adapter = makeAdapter(); // A reopened sheet must reacquire row capabilities.
  }
  return { activate, deactivate, getSnapshot: controller.getSnapshot, subscribe: controller.subscribe,
    open: controller.open, close, refresh: controller.refresh, loadMore: controller.loadMore, decide: controller.decide };
}
