import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { loadOrGenerateFlashChallenges, FlashChallenge, MetricType } from '@/utils/flashChallengesApi';
import {
  getStepsForDate,
  getActiveCaloriesForDate,
  getExerciseMinutesForDate,
  getDistanceMilesForDate,
  getFlightsClimbedForDate,
  requestAllHealthPermissions,
} from '@/utils/healthKit';

export interface FlashChallengeWithProgress extends FlashChallenge {
  progress: number;   // current value from HealthKit
  progressPct: number; // 0-100
}

// Read a single metric for a given date offset (0 = today, 1 = yesterday, etc.)
async function readMetricForDay(metric: MetricType, daysBack: number): Promise<number> {
  const date = new Date();
  if (daysBack > 0) {
    date.setDate(date.getDate() - daysBack);
  }

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

export function useFlashChallenges() {
  const [challenges, setChallenges] = useState<FlashChallengeWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Build 7-day history for each metric
  const buildHistory = useCallback(async (): Promise<Partial<Record<MetricType, number[]>>> => {
    console.log('[useFlashChallenges] buildHistory — requesting health permissions');
    await requestAllHealthPermissions().catch(() => {});

    const metrics: MetricType[] = ['steps', 'active_calories', 'exercise_minutes', 'distance', 'floors'];
    const history: Partial<Record<MetricType, number[]>> = {};

    await Promise.all(metrics.map(async (metric) => {
      const days: number[] = [];
      for (let i = 1; i <= 7; i++) {
        const val = await readMetricForDay(metric, i);
        days.push(val);
      }
      history[metric] = days;
      console.log('[useFlashChallenges] history for', metric, ':', days);
    }));

    return history;
  }, []);

  // Read today's progress for each challenge
  const readProgress = useCallback(async (
    challengeList: FlashChallenge[]
  ): Promise<FlashChallengeWithProgress[]> => {
    return Promise.all(challengeList.map(async (c) => {
      if (c.completed) {
        return { ...c, progress: c.target_value, progressPct: 100 };
      }
      const progress = await readMetricForDay(c.metric_type, 0);
      const progressPct = Math.min(100, Math.round((progress / c.target_value) * 100));
      console.log('[useFlashChallenges] progress for', c.metric_type, ':', progress, '/', c.target_value, '=', progressPct + '%');
      return { ...c, progress: Math.round(progress * 10) / 10, progressPct };
    }));
  }, []);

  // Update countdown timer
  const updateTimer = useCallback(() => {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(23, 59, 59, 999);
    const diff = midnight.getTime() - now.getTime();
    if (diff <= 0) {
      setTimeRemaining('Expired');
      return;
    }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    setTimeRemaining(`${h}h ${m}m ${s}s`);
  }, []);

  const load = useCallback(async () => {
    console.log('[useFlashChallenges] load called');
    try {
      setLoading(true);
      const history = await buildHistory();
      const raw = await loadOrGenerateFlashChallenges(history);
      if (!mountedRef.current) return;
      const withProgress = await readProgress(raw);
      if (!mountedRef.current) return;
      setChallenges(withProgress);
      console.log('[useFlashChallenges] loaded', withProgress.length, 'challenges');
    } catch (e) {
      console.warn('[useFlashChallenges] load error:', e);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [buildHistory, readProgress]);

  // Refresh progress only (no regeneration)
  const refreshProgress = useCallback(async () => {
    if (challenges.length === 0) return;
    console.log('[useFlashChallenges] refreshProgress called');
    const withProgress = await readProgress(challenges);
    if (mountedRef.current) setChallenges(withProgress);
  }, [challenges, readProgress]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    updateTimer();

    intervalRef.current = setInterval(() => {
      updateTimer();
    }, 1000);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        console.log('[useFlashChallenges] app foregrounded — refreshing progress');
        refreshProgress();
      }
    });

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { challenges, loading, timeRemaining, reload: load, refreshProgress };
}
