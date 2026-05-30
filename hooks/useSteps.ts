/**
 * useSteps — React hook for reading daily step count
 *
 * Wraps utils/healthKit.ts with React state management.
 * The dashboard (Phase 4) will consume this hook.
 *
 * Behavior:
 * - On mount: checks permission; if granted, fetches today's steps.
 * - requestPermission(): triggers OS dialog, refetches on grant.
 * - refresh(): re-reads steps (call on foreground or after long gaps).
 * - Auto-refreshes when the app comes back to the foreground.
 * - Does NOT poll — only refreshes on foreground or manual call.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  getTodaySteps,
  initializeHealthData,
  requestStepsPermission,
  type PermissionStatus,
} from '@/utils/healthKit';

export type UseStepsResult = {
  steps: number | null;
  permission: PermissionStatus | 'unknown';
  loading: boolean;
  error: string | null;
  requestPermission: () => Promise<void>;
  refresh: () => Promise<void>;
};

export function useSteps(): UseStepsResult {
  const [steps, setSteps] = useState<number | null>(null);
  const [permission, setPermission] = useState<PermissionStatus | 'unknown'>('unknown');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guard against state updates after unmount
  const mountedRef = useRef(true);

  // ─── Core fetch ────────────────────────────────────────────────────────────

  const fetchSteps = useCallback(async () => {
    console.log('[useSteps] fetchSteps called');
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);

    try {
      const result = await getTodaySteps();
      if (!mountedRef.current) return;

      console.log('[useSteps] fetchSteps result:', result);
      setPermission(result.permission);
      setSteps(result.steps);
      if (result.error) setError(result.error);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[useSteps] fetchSteps error:', msg);
      if (mountedRef.current) setError(msg);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // ─── Mount: initialize + check permission + fetch if granted ───────────────

  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      console.log('[useSteps] mount — initializing health data');
      try {
        const { available } = await initializeHealthData();
        if (!mountedRef.current) return;

        if (!available) {
          console.log('[useSteps] health data not available on this device');
          setPermission('denied');
          setLoading(false);
          return;
        }

        // Fetch steps (getTodaySteps internally checks permission)
        await fetchSteps();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn('[useSteps] init error:', msg);
        if (mountedRef.current) {
          setError(msg);
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchSteps]);

  // ─── AppState: refresh on foreground + 60s polling while active ───────────

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let previousState: AppStateStatus = AppState.currentState;

    const startPolling = () => {
      if (intervalId) return; // already running
      console.log('[useSteps] starting 60s polling');
      intervalId = setInterval(() => {
        console.log('[useSteps] interval tick — refreshing steps');
        fetchSteps();
      }, 60_000);
    };

    const stopPolling = () => {
      if (intervalId) {
        console.log('[useSteps] stopping polling');
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    // Start immediately if app is already active
    if (AppState.currentState === 'active') {
      startPolling();
    }

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasBackground = previousState === 'background' || previousState === 'inactive';
      const isNowActive = nextState === 'active';
      previousState = nextState;

      if (wasBackground && isNowActive) {
        console.log('[useSteps] app foregrounded — refreshing + restarting polling');
        fetchSteps();
        startPolling();
      } else if (nextState !== 'active') {
        stopPolling();
      }
    });

    return () => {
      stopPolling();
      subscription.remove();
    };
  }, [fetchSteps]);

  // ─── Public actions ────────────────────────────────────────────────────────

  const requestPermission = useCallback(async () => {
    console.log('[useSteps] requestPermission called');
    setLoading(true);
    try {
      const status = await requestStepsPermission();
      console.log('[useSteps] permission result:', status);
      if (!mountedRef.current) return;
      setPermission(status);

      if (status === 'granted') {
        await fetchSteps();
      } else {
        setLoading(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[useSteps] requestPermission error:', msg);
      if (mountedRef.current) {
        setError(msg);
        setLoading(false);
      }
    }
  }, [fetchSteps]);

  const refresh = useCallback(async () => {
    console.log('[useSteps] refresh called');
    await fetchSteps();
  }, [fetchSteps]);

  return { steps, permission, loading, error, requestPermission, refresh };
}
