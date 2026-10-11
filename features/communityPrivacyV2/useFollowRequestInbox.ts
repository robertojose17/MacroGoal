import { useCallback, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { createFollowRequestController, emptyInboxSnapshot, inboxScopeKey } from './followRequestController';
import type { FollowRequestAdapter, InboxSession } from './followRequestTypes';

/** Adapter identity must be stable. Pass a LIVE auth scope, not a mount-only user ID. */
export function useFollowRequestInbox(session: InboxSession | null, adapter: FollowRequestAdapter) {
  const controller = useMemo(() => createFollowRequestController(adapter), [adapter]);
  const observed = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const userId = session?.userId ?? null;
  const sessionKey = session?.sessionKey ?? null;
  const key = inboxScopeKey(session);
  // Mask old-account data in render itself, before layout-effect cleanup.
  const state = observed.scopeKey === key ? observed : emptyInboxSnapshot(key);
  useLayoutEffect(() => {
    controller.setSession(userId && sessionKey ? { userId, sessionKey } : null);
    void controller.refresh();
    // Reusable in StrictMode. Avoid permanently disposing the useMemo instance on effect replay.
    return () => controller.setSession(null);
  }, [controller, userId, sessionKey]);
  const refresh = useCallback(() => { void controller.refresh(); }, [controller]);
  return { state, open: controller.open, close: controller.close, refresh,
    loadMore: controller.loadMore, decide: controller.decide };
}
