import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { supabase } from '@/lib/supabase/client';
import { createSupabaseInboxAuthBinding } from './supabaseInboxAuth';
import { getCommunityPrivacyActivation, withCommunityPrivacyScope } from './communityPrivacyRollout';
import type { CommunityPrivacyActivation } from './communityPrivacyRollout';
import { createIncomingFollowerTransport } from './incomingFollowerTransport';
import type { FollowerContext, FollowerScope, FollowerRpcClient, IncomingFollowerTransport } from './incomingFollowerTransport';
import { createIncomingFollowerController, incomingFollowerScopeKey } from './incomingFollowerController';
import type { IncomingFollowerSnapshot } from './incomingFollowerController';
import { FollowerActionsSheet } from './FollowerActionsSheet';

interface Props {
  activation: CommunityPrivacyActivation;
  ownerId: string;
  requester: { id: string; name: string };
  onClose(pendingMutation?: boolean): void;
  onViewProfile(): void;
  onRelationshipChanged(): void;
  onRelationshipInvalidated(): void;
}
const masked: IncomingFollowerSnapshot = { status: 'idle', scopeKey: null, descriptor: null,
  confirmationKey: null, reconciledNotFollowing: false };
/** Mount only from this actor's own Followers list after the two backend RPCs are verified. */
export function ConfiguredFollowerActions({ activation, ownerId, requester, onClose, onViewProfile,
  onRelationshipChanged, onRelationshipInvalidated }: Props) {
  const focused = useIsFocused();
  const [appState, setAppState] = useState(AppState.currentState);
  const [windowFocused, setWindowFocused] = useState(true);
  const active = focused && windowFocused && appState === 'active';
  const activeRef = useRef(active);
  activeRef.current = active;
  const services = useMemo(() => {
    const binding = createSupabaseInboxAuthBinding(supabase.auth);
    const current = (scope: FollowerScope) => activeRef.current &&
      getCommunityPrivacyActivation() === activation && activation.status === 'ready' &&
      activation.mode === 'protected' && activation.rollout === 'general' &&
      activation.actorId === ownerId && scope.session.userId === ownerId && scope.requesterId === requester.id;
    // Generated Database types predate these two reviewed RPCs. Keep this structural seam local.
    const base = createIncomingFollowerTransport({ client: supabase as unknown as FollowerRpcClient,
      getSession: async () => {
        const session = await binding.getSession();
        return session && current({ session, requesterId: requester.id }) ? session : null;
      }, isGlobalScopeCurrent: current });
    async function guarded<T extends FollowerContext, R>(input: T, run: (context: T) => Promise<R>): Promise<R> {
      return withCommunityPrivacyScope(async scope => {
        scope.assertActor(ownerId); scope.assertCurrent();
        if (!current(input)) throw new Error('Relationship is unavailable.');
        const request = new AbortController();
        const abort = () => request.abort();
        scope.signal.addEventListener('abort', abort, { once: true });
        input.signal.addEventListener('abort', abort, { once: true });
        if (scope.signal.aborted || input.signal.aborted) abort();
        try {
          const result = await run({ ...input, signal: request.signal });
          scope.assertCurrent();
          if (!current(input) || request.signal.aborted) throw new Error('Relationship is unavailable.');
          return result;
        } finally {
          scope.signal.removeEventListener('abort', abort);
          input.signal.removeEventListener('abort', abort);
        }
      }, activation.scopeKey);
    }
    const transport: IncomingFollowerTransport = {
      read: input => guarded(input, base.read),
      remove: input => guarded(input, base.remove),
    };
    return { binding, controller: createIncomingFollowerController({ transport, isGlobalScopeCurrent: current }) };
  }, [activation, ownerId, requester.id]);
  const auth = useSyncExternalStore(services.binding.subscribe, services.binding.getSnapshot, services.binding.getSnapshot);
  const observed = useSyncExternalStore(services.controller.subscribe, services.controller.getSnapshot, services.controller.getSnapshot);
  const allowed = active && auth.status === 'ready' && auth.session?.userId === ownerId &&
    activation.mode === 'protected' && activation.status === 'ready' && activation.rollout === 'general' &&
    activation.actorId === ownerId && getCommunityPrivacyActivation() === activation;
  const scope = allowed && auth.session ? { session: auth.session, requesterId: requester.id } : null;
  const key = scope ? incomingFollowerScopeKey(scope) : null;
  const state = key && observed.scopeKey === key ? observed : masked;
  const changedRef = useRef(onRelationshipChanged);
  changedRef.current = onRelationshipChanged;
  const reported = useRef<string | null>(null);
  useLayoutEffect(() => { services.binding.start(); return services.binding.stop; }, [services]);
  useLayoutEffect(() => {
    const change = AppState.addEventListener('change', next => {
      if (next !== 'active') activeRef.current = false;
      setAppState(next);
    });
    const blur = AppState.addEventListener('blur', () => { activeRef.current = false; setWindowFocused(false); });
    const focus = AppState.addEventListener('focus', () => setWindowFocused(true));
    return () => { change.remove(); blur.remove(); focus.remove(); };
  }, []);
  useLayoutEffect(() => {
    services.controller.setScope(scope);
    if (scope) void services.controller.load();
    return () => services.controller.setScope(null);
    // The serialized key covers every owner/session/requester field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services, key]);
  useEffect(() => {
    if (!key || !(state.status === 'removed' || state.status === 'not_following' ||
      state.status === 'unconfirmed' && state.reconciledNotFollowing)) return;
    const marker = `${key}:${state.status}`;
    if (reported.current === marker) return;
    reported.current = marker;
    changedRef.current(); // Authoritative incoming list/count refresh only, never optimistic decrement.
  }, [key, state.status, state.reconciledNotFollowing]);
  const stillAllowed = () => {
    const liveAuth = services.binding.getSnapshot();
    return activeRef.current && !!scope && liveAuth.status === 'ready' &&
      liveAuth.session?.userId === scope.session.userId && liveAuth.session?.sessionKey === scope.session.sessionKey &&
      getCommunityPrivacyActivation() === activation;
  };
  const close = () => {
    const latest = services.controller.getSnapshot();
    const pending = latest.status === 'removing' || latest.status === 'unconfirmed' && !latest.reconciledNotFollowing;
    services.controller.setScope(null);
    onClose(pending);
  };
  return <FollowerActionsSheet state={state} name={requester.name} unavailable={!allowed}
    onClose={close} onViewProfile={() => { services.controller.setScope(null); onViewProfile(); }}
    onBeginRemove={() => { if (stillAllowed()) services.controller.beginConfirm(); }}
    onConfirmRemove={confirmationKey => {
      if (!stillAllowed()) return;
      const before = services.controller.getSnapshot();
      const operation = services.controller.remove(confirmationKey);
      if (before.status === 'confirming' && services.controller.getSnapshot().status === 'removing') {
        onRelationshipInvalidated(); // Clear parent count/list before the first response, including close/abort.
      }
      void operation;
    }}
    onCancelRemove={() => { services.controller.cancelConfirm(); close(); }}
    onRetry={() => { if (stillAllowed()) void services.controller.load(); }} />;
}
