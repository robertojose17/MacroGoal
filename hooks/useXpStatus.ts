/**
 * useXpStatus
 *
 * React hook that manages XP state for the dashboard.
 * - Fetches from server on mount and on app foreground
 * - Auto-refreshes every 5 minutes while mounted
 * - Supports optimistic updates for instant UI feedback
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus, DeviceEventEmitter } from 'react-native';
import { getXpStatus } from '@/utils/xpApi';
import { XP_EVENTS } from '@/utils/xpEvents';
import type { XpStatus } from '@/types/xp';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export type UseXpStatusResult = {
  status: XpStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  optimisticAward: (event_type: string, projected_xp: number) => void;
};

export function useXpStatus(): UseXpStatusResult {
  const [status, setStatus] = useState<XpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isMounted = useRef(true);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    console.log('[useXpStatus] refresh called');
    try {
      const data = await getXpStatus();
      if (isMounted.current) {
        setStatus(data);
        setError(null);
        console.log('[useXpStatus] status updated — level:', data.current_level, 'xp_today:', data.xp_today);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[useXpStatus] refresh error (non-fatal):', msg);
      if (isMounted.current) {
        setError(msg);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, []);

  // Optimistic update — bumps local XP immediately; server response replaces it on next refresh
  const optimisticAward = useCallback((event_type: string, projected_xp: number) => {
    console.log('[useXpStatus] optimisticAward:', event_type, '+', projected_xp, 'XP');
    setStatus((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        xp_today: prev.xp_today + projected_xp,
        total_xp: prev.total_xp + projected_xp,
      };
    });
  }, []);

  // Initial fetch
  useEffect(() => {
    isMounted.current = true;
    refresh();

    return () => {
      isMounted.current = false;
    };
  }, [refresh]);

  // AppState foreground listener
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        console.log('[useXpStatus] app foregrounded — refreshing XP');
        refresh();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [refresh]);

  // Listen for XP_EVENTS.REFRESH emitted by xpAwarder after successful awards
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(XP_EVENTS.REFRESH, () => {
      console.log('[useXpStatus] received xp:refresh event — refreshing XP status');
      refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // 5-minute polling while mounted
  useEffect(() => {
    pollTimer.current = setInterval(() => {
      if (AppState.currentState === 'active') {
        console.log('[useXpStatus] poll interval — refreshing XP');
        refresh();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
      }
    };
  }, [refresh]);

  return { status, loading, error, refresh, optimisticAward };
}
