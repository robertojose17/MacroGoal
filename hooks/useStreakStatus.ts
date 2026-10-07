/**
 * useStreakStatus
 * Reads current_streak and longest_streak from user_xp.
 * Detects uncelebrated streak milestones and auto-shares them.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '@/lib/supabase/client';
import { getPendingMilestone, markMilestoneCelebrated } from '@/utils/streakMilestones';
import { autoShareStreakMilestone } from '@/utils/autoShareAchievements';

export interface StreakStatus {
  current_streak: number;
  longest_streak: number;
}

export interface UseStreakStatusResult {
  streak: StreakStatus | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useStreakStatus(): UseStreakStatusResult {
  const [streak, setStreak] = useState<StreakStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const isMounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('user_xp')
        .select('current_streak, longest_streak')
        .eq('user_id', user.id)
        .maybeSingle();
      if (isMounted.current) {
        const current = data?.current_streak ?? 0;
        const longest = data?.longest_streak ?? 0;
        setStreak({ current_streak: current, longest_streak: longest });
        if (current > 0) {
          getPendingMilestone(current).then((milestone) => {
            if (milestone !== null) {
              markMilestoneCelebrated(milestone);
              autoShareStreakMilestone(milestone);
            }
          }).catch(() => {});
        }
      }
    } catch (e) {
      // non-fatal
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    refresh();
    return () => { isMounted.current = false; };
  }, [refresh]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') refresh();
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [refresh]);

  return { streak, loading, refresh };
}
