/**
 * useLeague
 *
 * React hook that manages Weekly League state for the dashboard.
 * - Fetches from server on mount and on app foreground
 * - Auto-refreshes every 5 minutes while mounted
 * - Listens for LEAGUE_EVENTS.REFRESH emitted by xpAwarder after XP awards
 *
 * Mirrors the pattern from hooks/useXpStatus.ts.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus, DeviceEventEmitter } from 'react-native';
import { getLeagueStatus } from '@/utils/leagueApi';
import { LEAGUE_EVENTS } from '@/utils/xpEvents';
import type { LeagueStatus } from '@/types/leagues';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export type UseLeagueResult = {
  status: LeagueStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useLeague(): UseLeagueResult {
  const [status, setStatus] = useState<LeagueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isMounted = useRef(true);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    console.log('[useLeague] refresh called');
    try {
      const data = await getLeagueStatus();
      if (isMounted.current) {
        setStatus(data);
        setError(null);
        console.log(
          '[useLeague] status updated — tier:', data.tier,
          'position:', data.user_position,
          'xp_this_week:', data.user_xp_this_week,
          'is_first_assignment:', data.is_first_assignment
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[useLeague] refresh error (non-fatal):', msg);
      if (isMounted.current) {
        setError(msg);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
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
        console.log('[useLeague] app foregrounded — refreshing league status');
        refresh();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [refresh]);

  // Listen for LEAGUE_EVENTS.REFRESH emitted by xpAwarder after successful awards
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(LEAGUE_EVENTS.REFRESH, () => {
      console.log('[useLeague] received league:refresh event — refreshing league status');
      refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // 5-minute polling while mounted
  useEffect(() => {
    pollTimer.current = setInterval(() => {
      if (AppState.currentState === 'active') {
        console.log('[useLeague] poll interval — refreshing league status');
        refresh();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
      }
    };
  }, [refresh]);

  return { status, loading, error, refresh };
}
