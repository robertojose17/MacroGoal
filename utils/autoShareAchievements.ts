import { supabase } from '@/lib/supabase/client';

/** Returns true if the current user has auto-sharing enabled (default: true) */
export async function isAutoShareEnabled(): Promise<boolean> {
  console.log('[autoShare] checking isAutoShareEnabled');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('users')
    .select('auto_share_achievements')
    .eq('id', user.id)
    .single();
  // Default to true if column is null (new users before migration)
  const enabled = data?.auto_share_achievements !== false;
  console.log('[autoShare] isAutoShareEnabled:', enabled);
  return enabled;
}

/** Returns true if the user has streak auto-sharing enabled */
async function isStreakAutoShareEnabled(): Promise<boolean> {
  console.log('[autoShare] checking isStreakAutoShareEnabled');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('users')
    .select('auto_share_streaks, auto_share_achievements')
    .eq('id', user.id)
    .single();
  // auto_share_streaks defaults to true if null
  const enabled = data?.auto_share_achievements !== false && data?.auto_share_streaks !== false;
  console.log('[autoShare] isStreakAutoShareEnabled:', enabled);
  return enabled;
}

/** Returns true if the user has weekly recap auto-sharing enabled */
async function isWeeklyRecapAutoShareEnabled(): Promise<boolean> {
  console.log('[autoShare] checking isWeeklyRecapAutoShareEnabled');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('users')
    .select('auto_share_weekly_recap, auto_share_achievements')
    .eq('id', user.id)
    .single();
  const enabled = data?.auto_share_achievements !== false && data?.auto_share_weekly_recap !== false;
  console.log('[autoShare] isWeeklyRecapAutoShareEnabled:', enabled);
  return enabled;
}

/**
 * Auto-post a streak milestone (7, 14, 30, 60, 100 days).
 * Uses DB unique index as the sole dedup gate — no AsyncStorage needed.
 */
export async function autoShareStreakMilestone(streakDays: number): Promise<void> {
  console.log('[autoShare] autoShareStreakMilestone — streakDays:', streakDays);
  const MILESTONE_DAYS = [7, 14, 30, 60, 100];
  if (!MILESTONE_DAYS.includes(streakDays)) {
    console.log('[autoShare] autoShareStreakMilestone: not a milestone, skipping');
    return;
  }
  if (!(await isStreakAutoShareEnabled())) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: userData } = await supabase
    .from('users')
    .select('auto_share_audience')
    .eq('id', user.id)
    .single();
  const audience = userData?.auto_share_audience ?? 'public';
  const isPublic = audience !== 'followers';

  console.log('[autoShare] autoShareStreakMilestone: posting streak milestone:', streakDays, 'days, audience:', audience);
  try {
    const { error } = await supabase
      .from('social_posts')
      .upsert({
        user_id: user.id,
        post_type: 'milestone',
        post_type_v2: 'auto',
        auto_post_type: 'streak_milestone',
        streak_days: streakDays,
        content: null,
        is_public: isPublic,
      }, { onConflict: 'user_id,auto_post_type,streak_days', ignoreDuplicates: true });
    if (error) {
      console.warn('[autoShare] autoShareStreakMilestone upsert error (non-fatal):', error.message);
    } else {
      console.log('[autoShare] autoShareStreakMilestone: streak milestone post succeeded for', streakDays, 'days');
    }
  } catch (e) {
    console.warn('[autoShare] autoShareStreakMilestone failed (non-fatal):', e);
  }
}

/**
 * Auto-post a weekly recap when consistency score >= 70%.
 * Uses DB unique index as the sole dedup gate — no AsyncStorage needed.
 */
export async function autoShareWeeklyRecap(
  weekScore: number,
  daysTracked: number,
  weekStart: string,
  dayFlags: boolean[],
): Promise<void> {
  console.log('[autoShare] autoShareWeeklyRecap — weekScore:', weekScore, 'daysTracked:', daysTracked, 'weekStart:', weekStart);
  if (weekScore < 70) {
    console.log('[autoShare] autoShareWeeklyRecap: score below 70, skipping');
    return;
  }
  if (!(await isWeeklyRecapAutoShareEnabled())) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: userData } = await supabase
    .from('users')
    .select('auto_share_audience')
    .eq('id', user.id)
    .single();
  const audience = userData?.auto_share_audience ?? 'public';
  const isPublic = audience !== 'followers';

  console.log('[autoShare] autoShareWeeklyRecap: posting weekly recap, score:', weekScore, 'audience:', audience);
  try {
    const { error } = await supabase
      .from('social_posts')
      .upsert({
        user_id: user.id,
        post_type: 'stats',
        post_type_v2: 'auto',
        auto_post_type: 'weekly_recap',
        weekly_recap_score: weekScore,
        weekly_recap_days_tracked: daysTracked,
        weekly_recap_week_start: weekStart,
        weekly_recap_day_flags: dayFlags,
        content: null,
        is_public: isPublic,
      }, { onConflict: 'user_id,auto_post_type,weekly_recap_week_start', ignoreDuplicates: true });
    if (error) {
      console.warn('[autoShare] autoShareWeeklyRecap upsert error (non-fatal):', error.message);
    } else {
      console.log('[autoShare] autoShareWeeklyRecap: weekly recap post succeeded for week:', weekStart);
    }
  } catch (e) {
    console.warn('[autoShare] autoShareWeeklyRecap failed (non-fatal):', e);
  }
}

// ── Disabled no-op functions — kept for call-site compatibility ──

/** @deprecated No-op. Use autoShareStreakMilestone instead. */
export async function autoShareStreak(_streakDays: number): Promise<void> {
  return;
}

/** @deprecated No-op. */
export async function autoShareCalorieGoal(): Promise<void> {
  return;
}

/** @deprecated No-op. */
export async function autoShareProteinGoal(): Promise<void> {
  return;
}

/** @deprecated No-op. */
export async function autoShareDailySummary(): Promise<void> {
  return;
}

/** @deprecated No-op. */
export async function autoShareWeightCheckin(_weightKg: number): Promise<void> {
  return;
}

/** @deprecated No-op. */
export async function autoShareNewPersonalBest(_streakDays: number, _previousBest: number): Promise<void> {
  return;
}

/** @deprecated No-op. */
export async function autoShareFirstWeek(): Promise<void> {
  return;
}
