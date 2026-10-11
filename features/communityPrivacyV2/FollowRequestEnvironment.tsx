import React, { createContext, useContext, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import type { FollowRequestAdapter, InboxSession } from './followRequestTypes';
import type { SupabaseInboxAuthBinding } from './supabaseInboxAuth';

/** Safe unconfigured state: no network, no cached count, no enabled actions. */
const unavailableAdapter: FollowRequestAdapter = {
  list: async () => ({ ok: false }),
  respond: async () => ({ ok: false }),
};
const defaultEnvironment = { session: null as InboxSession | null, adapter: unavailableAdapter };
const FollowRequestEnvironment = createContext(defaultEnvironment);

/** Authenticated app integration owns this provider. Never derive session from mount-only profile state. */
export function FollowRequestProvider({ session, adapter, children }: {
  session: InboxSession | null;
  adapter: FollowRequestAdapter;
  children: React.ReactNode;
}) {
  const userId = session?.userId ?? null;
  const sessionKey = session?.sessionKey ?? null;
  const value = useMemo(() => ({
    session: userId && sessionKey ? { userId, sessionKey } : null,
    adapter,
  }), [userId, sessionKey, adapter]);
  return <FollowRequestEnvironment.Provider value={value}>{children}</FollowRequestEnvironment.Provider>;
}
export function useFollowRequestEnvironment() {
  return useContext(FollowRequestEnvironment);
}

/** Actual auth-event bridge. Build a stable binding from supabase.auth and a stable adapter using binding.getSession. */
export function LiveFollowRequestProvider({ binding, adapter, children }: {
  binding: SupabaseInboxAuthBinding;
  adapter: FollowRequestAdapter;
  children: React.ReactNode;
}) {
  const auth = useSyncExternalStore(binding.subscribe, binding.getSnapshot, binding.getSnapshot);
  useLayoutEffect(() => { binding.start(); return binding.stop; }, [binding]);
  return <FollowRequestProvider session={auth.session} adapter={adapter}>{children}</FollowRequestProvider>;
}
