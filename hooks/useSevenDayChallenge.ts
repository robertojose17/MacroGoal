/**
 * useSevenDayChallenge
 *
 * Hook that manages the 7-Day Challenge state.
 * Fetches on mount and on focus, exposes challenge data and actions.
 */

import { useState, useCallback, useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { SevenDayChallenge } from '@/types/challenge';
import {
  acceptChallenge as apiAcceptChallenge,
  getChallenge,
  completeChallengeDay as apiCompleteChallengeDay,
} from '@/utils/sevenDayChallengeApi';
import { XP_EVENTS } from '@/utils/xpEvents';

interface CompleteDayResult {
  completed: boolean;
  badgeEarned: boolean;
  xpAwarded: number;
}

interface UseSevenDayChallengeReturn {
  challenge: SevenDayChallenge | null;
  isActive: boolean;
  todaysMission: SevenDayChallenge['todays_mission'] | undefined;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  acceptChallenge: () => Promise<void>;
  completeTodaysMission: () => Promise<CompleteDayResult>;
}

export function useSevenDayChallenge(): UseSevenDayChallengeReturn {
  const [challenge, setChallenge] = useState<SevenDayChallenge | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      console.log('[useSevenDayChallenge] refresh called');
      setLoading(true);
      setError(null);
      const { challenge: fetched } = await getChallenge();
      setChallenge(fetched);
      console.log('[useSevenDayChallenge] challenge fetched:', fetched?.status ?? 'null');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[useSevenDayChallenge] refresh error:', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when screen is focused
  useFocusEffect(
    useCallback(() => {
      console.log('[useSevenDayChallenge] screen focused — refreshing challenge');
      refresh();
    }, [refresh])
  );

  // Re-fetch when a meal is logged anywhere in the app
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(XP_EVENTS.MEAL_LOGGED, () => {
      console.log('[useSevenDayChallenge] meal:logged received — refreshing challenge');
      refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const acceptChallenge = useCallback(async () => {
    console.log('[useSevenDayChallenge] acceptChallenge called');
    setLoading(true);
    setError(null);
    try {
      const result = await apiAcceptChallenge();
      console.log('[useSevenDayChallenge] challenge accepted:', result.challenge.id);
      setChallenge(result.challenge);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[useSevenDayChallenge] acceptChallenge error:', msg);
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const completeTodaysMission = useCallback(async (): Promise<CompleteDayResult> => {
    console.log('[useSevenDayChallenge] completeTodaysMission called');
    setLoading(true);
    setError(null);
    try {
      const result = await apiCompleteChallengeDay();
      console.log('[useSevenDayChallenge] day completed — xp:', result.xp_awarded, 'badge:', result.badge_earned);
      setChallenge(result.challenge);
      return {
        completed: result.completed,
        badgeEarned: result.badge_earned,
        xpAwarded: result.xp_awarded,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[useSevenDayChallenge] completeTodaysMission error:', msg);
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const isActive = challenge?.status === 'active';
  const todaysMission = challenge?.todays_mission;

  return {
    challenge,
    isActive,
    todaysMission,
    loading,
    error,
    refresh,
    acceptChallenge,
    completeTodaysMission,
  };
}
