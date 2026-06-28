import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import {
  loadOrGenerateFlashChallenges,
  acceptChallenge as apiAcceptChallenge,
  completeChallenge as apiCompleteChallenge,
  FlashChallenge,
  MetricType,
} from '@/utils/flashChallengesApi';
import {
  getStepsForDate,
  getActiveCaloriesForDate,
  getExerciseMinutesForDate,
  getDistanceMilesForDate,
  getFlightsClimbedForDate,
  requestAllHealthPermissions,
} from '@/utils/healthKit';
import { emitXpRefresh, emitLeagueRefresh } from '@/utils/xpEvents';

export interface FlashChallengeWithProgress extends FlashChallenge {
  progress: number;      // current value MINUS baseline_value (0 if not accepted)
  progressPct: number;   // 0-100
  timeRemaining: string; // per-challenge timer from expires_at
}

// Read a single metric for today
async function readMetricToday(metric: MetricType): Promise<number> {
  const date = new Date();
  try {
    switch (metric) {
      case 'steps': {
        const r = await getStepsForDate(date);
        return r.steps ?? 0;
      }
      case 'active_calories': {
        const r = await getActiveCaloriesForDate(date);
        return r.value ?? 0;
      }
      case 'exercise_minutes': {
        const r = await getExerciseMinutesForDate(date);
        return r.value ?? 0;
      }
      case 'distance': {
        const r = await getDistanceMilesForDate(date);
        return r.value ?? 0;
      }
      case 'floors': {
        const r = await getFlightsClimbedForDate(date);
        return r.value ?? 0;
      }
      default:
        return 0;
    }
  } catch {
    return 0;
  }
}

// Compute per-challenge countdown string from expires_at
function computeTimeRemaining(expiresAt: string): string {
  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  const diff = expiry - now;
  if (diff <= 0) return 'Expired';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m ${s}s left`;
  return `${s}s left`;
}

export function useFlashChallenges() {
  const [challenges, setChallenges] = useState<FlashChallengeWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  // Track which challenge IDs have had completeChallenge called this session
  const completingRef = useRef<Set<string>>(new Set());

  // Attach progress + timer to a list of raw challenges
  const attachProgress = useCallback(async (
    challengeList: FlashChallenge[]
  ): Promise<FlashChallengeWithProgress[]> => {
    return Promise.all(challengeList.map(async (c) => {
      const timeRemaining = computeTimeRemaining(c.expires_at);

      // Completed challenges: full bar
      if (c.challenge_status === 'completed' || c.completed) {
        return { ...c, progress: c.target_value, progressPct: 100, timeRemaining };
      }

      // Not yet accepted: no progress shown
      if (!c.accepted_at || c.challenge_status === 'available') {
        return { ...c, progress: 0, progressPct: 0, timeRemaining };
      }

      // Expired: no progress update needed
      if (c.challenge_status === 'expired' || timeRemaining === 'Expired') {
        return { ...c, progress: 0, progressPct: 0, timeRemaining: 'Expired' };
      }

      // Accepted: progress = current - baseline
      const currentValue = await readMetricToday(c.metric_type);
      const baseline = c.baseline_value ?? 0;
      const progress = Math.max(0, currentValue - baseline);
      const progressPct = Math.min(100, Math.round((progress / c.target_value) * 100));
      console.log(
        '[useFlashChallenges] progress for', c.metric_type,
        'current:', currentValue, 'baseline:', baseline,
        'progress:', progress, '/', c.target_value, '=', progressPct + '%'
      );
      return { ...c, progress: Math.round(progress * 10) / 10, progressPct, timeRemaining };
    }));
  }, []);

  // Full load: generate + fetch + attach progress
  const load = useCallback(async () => {
    console.log('[useFlashChallenges] load called');
    try {
      setLoading(true);
      await requestAllHealthPermissions().catch(() => {});
      const raw = await loadOrGenerateFlashChallenges();
      if (!mountedRef.current) return;
      // Hard cap: max 2 challenges, prefer active over expired
      const sorted = [...raw].sort((a, b) => {
        const order: Record<string, number> = { completed: 0, accepted: 1, available: 2, expired: 3 };
        return (order[a.challenge_status] ?? 2) - (order[b.challenge_status] ?? 2);
      });
      const capped = sorted.slice(0, 2);
      console.log('[useFlashChallenges] capped to', capped.length, 'of', raw.length, 'challenges');
      const withProgress = await attachProgress(capped);
      if (!mountedRef.current) return;
      setChallenges(withProgress);
      console.log('[useFlashChallenges] loaded', withProgress.length, 'challenges');
    } catch (e) {
      console.warn('[useFlashChallenges] load error:', e);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [attachProgress]);

  // Refresh timers + progress without re-fetching from DB
  const refreshTimers = useCallback(async () => {
    if (!mountedRef.current) return;
    setChallenges(prev => prev.map(c => ({
      ...c,
      timeRemaining: computeTimeRemaining(c.expires_at),
    })));
  }, []);

  // Accept a challenge: read current HealthKit value as baseline, call API, reload
  const acceptChallenge = useCallback(async (id: string, baselineValue: number) => {
    console.log('[useFlashChallenges] acceptChallenge called', { id, baselineValue });
    try {
      await apiAcceptChallenge(id, baselineValue);
      console.log('[useFlashChallenges] acceptChallenge succeeded, reloading');
      await load();
    } catch (e) {
      console.warn('[useFlashChallenges] acceptChallenge error:', e);
      throw e;
    }
  }, [load]);

  // Auto-complete accepted challenges that hit 100%
  const checkAndComplete = useCallback(async (challengeList: FlashChallengeWithProgress[]) => {
    for (const c of challengeList) {
      if (
        c.challenge_status === 'accepted' &&
        c.progressPct >= 100 &&
        !c.completed &&
        !completingRef.current.has(c.id)
      ) {
        completingRef.current.add(c.id);
        console.log('[useFlashChallenges] auto-completing challenge', c.id, 'xp_reward:', c.xp_reward);
        try {
          const result = await apiCompleteChallenge(c.id, c.xp_reward);
          console.log('[useFlashChallenges] challenge completed, xp_awarded:', result.xp_awarded);
          emitXpRefresh();
          emitLeagueRefresh();
          // Reload to get updated challenge_status
          await load();
        } catch (e) {
          console.warn('[useFlashChallenges] completeChallenge error:', e);
          completingRef.current.delete(c.id);
        }
        break; // reload handles the rest
      }
    }
  }, [load]);

  // Refresh progress values (HealthKit reads) and check for completions
  const refreshProgress = useCallback(async () => {
    if (!mountedRef.current) return;
    console.log('[useFlashChallenges] refreshProgress called');
    // Re-fetch from DB to get latest challenge_status
    try {
      const raw = await loadOrGenerateFlashChallenges();
      if (!mountedRef.current) return;
      // Hard cap: max 2 challenges, prefer active over expired
      const sorted = [...raw].sort((a, b) => {
        const order: Record<string, number> = { completed: 0, accepted: 1, available: 2, expired: 3 };
        return (order[a.challenge_status] ?? 2) - (order[b.challenge_status] ?? 2);
      });
      const capped = sorted.slice(0, 2);
      console.log('[useFlashChallenges] refreshProgress capped to', capped.length, 'of', raw.length, 'challenges');
      const withProgress = await attachProgress(capped);
      if (!mountedRef.current) return;
      setChallenges(withProgress);
      await checkAndComplete(withProgress);
    } catch (e) {
      console.warn('[useFlashChallenges] refreshProgress error:', e);
    }
  }, [attachProgress, checkAndComplete]);

  useEffect(() => {
    mountedRef.current = true;
    load();

    // Update timers every second
    intervalRef.current = setInterval(() => {
      refreshTimers();
    }, 1000);

    // Refresh progress every 30s
    const progressInterval = setInterval(() => {
      refreshProgress();
    }, 30000);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        console.log('[useFlashChallenges] app foregrounded — refreshing progress');
        refreshProgress();
      }
    });

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearInterval(progressInterval);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check for auto-completion whenever challenges update
  useEffect(() => {
    if (challenges.length > 0) {
      checkAndComplete(challenges);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenges]);

  return { challenges, loading, reload: load, acceptChallenge };
}
