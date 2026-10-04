import { supabase } from '@/lib/supabase/client';
import { createPost } from '@/utils/socialApi';

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

/** Auto-post a streak milestone to the community feed */
export async function autoShareStreak(streakDays: number): Promise<void> {
  console.log('[autoShare] autoShareStreak — streakDays:', streakDays);
  if (!(await isAutoShareEnabled())) return;
  const messages: Record<number, string> = {
    7:   '7-day streak! Consistency is everything. #MacroGoal',
    14:  '14 days straight! Two weeks of showing up. #MacroGoal',
    30:  '30-day streak! A full month of discipline. #MacroGoal',
    60:  '60 days strong! Habits are forming. #MacroGoal',
    90:  '90-day streak! Three months of consistency. #MacroGoal',
    180: '180 days! Half a year of showing up every day. #MacroGoal',
    365: '365-day streak! A full year of discipline. Legend. #MacroGoal',
  };
  const content = messages[streakDays];
  if (!content) return; // Only post at milestone numbers

  // Dedup: skip if already posted for this streak milestone
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  const storageKey = `auto_share_streak_milestone_${streakDays}`;
  const alreadyPosted = await AsyncStorage.getItem(storageKey);
  if (alreadyPosted) {
    console.log('[autoShare] autoShareStreak already posted for streak:', streakDays, 'days, skipping');
    return;
  }

  console.log('[autoShare] posting streak milestone:', streakDays, 'days');
  try {
    await createPost({ post_type: 'streak', content, streak_days: streakDays, is_public: true });
    await AsyncStorage.setItem(storageKey, new Date().toISOString().split('T')[0]);
    console.log('[autoShare] streak post succeeded');
  } catch (e) {
    console.warn('[autoShare] streak post failed (non-fatal):', e);
  }
}

/**
 * Auto-post a streak milestone (7, 14, 30, 60, 100 days).
 * Uses AsyncStorage to avoid duplicate posts for the same milestone.
 */
export async function autoShareStreakMilestone(streakDays: number): Promise<void> {
  console.log('[autoShare] autoShareStreakMilestone — streakDays:', streakDays);
  const MILESTONE_DAYS = [7, 14, 30, 60, 100];
  if (!MILESTONE_DAYS.includes(streakDays)) return;
  if (!(await isStreakAutoShareEnabled())) return;

  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  const storageKey = `auto_share_streak_${streakDays}`;
  const alreadyPosted = await AsyncStorage.getItem(storageKey);
  if (alreadyPosted) {
    console.log('[autoShare] streak milestone already posted for', streakDays, 'days, skipping');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const messages: Record<number, string> = {
    7:   '🔥 7-day streak! One week of showing up every day. #MacroGoal',
    14:  '🔥 14-day streak! Two weeks of consistency. #MacroGoal',
    30:  '🔥 30-day streak! A full month of discipline. #MacroGoal',
    60:  '🔥 60-day streak! Two months strong. Habits are forming. #MacroGoal',
    100: '🔥 100-day streak! Triple digits. Absolute legend. #MacroGoal',
  };
  const content = messages[streakDays] ?? `🔥 ${streakDays}-day streak! #MacroGoal`;

  console.log('[autoShare] posting streak milestone:', streakDays, 'days');
  try {
    await createPost({
      post_type: 'milestone',
      post_type_v2: 'auto',
      content,
      streak_days: streakDays,
      is_public: true,
      auto_post_type: 'streak_milestone',
      auto_post_date: today,
    });
    await AsyncStorage.setItem(storageKey, today);
    console.log('[autoShare] streak milestone post succeeded');
  } catch (e) {
    console.warn('[autoShare] streak milestone post failed (non-fatal):', e);
  }
}

/**
 * Auto-post a new personal best streak.
 * Combines with streak milestone if both happen on the same day.
 */
export async function autoShareNewPersonalBest(streakDays: number, previousBest: number): Promise<void> {
  console.log('[autoShare] autoShareNewPersonalBest — streakDays:', streakDays, 'previousBest:', previousBest);
  if (!(await isStreakAutoShareEnabled())) return;

  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  const today = new Date().toISOString().split('T')[0];
  const storageKey = `auto_share_personal_best_${today}`;
  const alreadyPosted = await AsyncStorage.getItem(storageKey);
  if (alreadyPosted) {
    console.log('[autoShare] personal best already posted today, skipping');
    return;
  }

  // Check if a streak milestone was also posted today — if so, skip to avoid double-posting
  const MILESTONE_DAYS = [7, 14, 30, 60, 100];
  if (MILESTONE_DAYS.includes(streakDays)) {
    const milestoneKey = `auto_share_streak_${streakDays}`;
    const milestonePosted = await AsyncStorage.getItem(milestoneKey);
    if (milestonePosted === today) {
      console.log('[autoShare] streak milestone already posted today, skipping personal best to avoid duplicate');
      return;
    }
  }

  const content = `🏆 New personal best! ${streakDays}-day streak — beat my previous record of ${previousBest} days. #MacroGoal`;
  console.log('[autoShare] posting personal best:', streakDays, 'days');
  try {
    await createPost({
      post_type: 'milestone',
      post_type_v2: 'auto',
      content,
      streak_days: streakDays,
      is_public: true,
      auto_post_type: 'personal_best',
      auto_post_date: today,
    });
    await AsyncStorage.setItem(storageKey, today);
    console.log('[autoShare] personal best post succeeded');
  } catch (e) {
    console.warn('[autoShare] personal best post failed (non-fatal):', e);
  }
}

/**
 * Auto-post a weekly recap (call on Sunday or Monday when opening app).
 */
export async function autoShareWeeklyRecap(weekScore: number, daysTracked: number): Promise<void> {
  console.log('[autoShare] autoShareWeeklyRecap — weekScore:', weekScore, 'daysTracked:', daysTracked);
  if (!(await isWeeklyRecapAutoShareEnabled())) return;

  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  const today = new Date().toISOString().split('T')[0];
  const storageKey = `auto_share_weekly_recap_${today}`;
  const alreadyPosted = await AsyncStorage.getItem(storageKey);
  if (alreadyPosted) {
    console.log('[autoShare] weekly recap already posted today, skipping');
    return;
  }

  const scoreEmoji = weekScore >= 80 ? '🌟' : weekScore >= 60 ? '💪' : '📈';
  const content = `${scoreEmoji} Weekly recap: ${daysTracked}/7 days tracked, consistency score ${weekScore}. Every week is a new chance to improve. #MacroGoal`;
  console.log('[autoShare] posting weekly recap, score:', weekScore);
  try {
    await createPost({
      post_type: 'stats',
      post_type_v2: 'auto',
      content,
      is_public: true,
      auto_post_type: 'weekly_recap',
      auto_post_date: today,
    });
    await AsyncStorage.setItem(storageKey, today);
    console.log('[autoShare] weekly recap post succeeded');
  } catch (e) {
    console.warn('[autoShare] weekly recap post failed (non-fatal):', e);
  }
}

/**
 * Auto-post when the user completes their first full tracked week.
 */
export async function autoShareFirstWeek(): Promise<void> {
  console.log('[autoShare] autoShareFirstWeek triggered');
  if (!(await isWeeklyRecapAutoShareEnabled())) return;

  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  const storageKey = 'auto_share_first_week_done';
  const alreadyPosted = await AsyncStorage.getItem(storageKey);
  if (alreadyPosted) {
    console.log('[autoShare] first week already posted, skipping');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const content = '🎉 Just completed my first full week of tracking! The journey starts here. #MacroGoal';
  console.log('[autoShare] posting first week achievement');
  try {
    await createPost({
      post_type: 'milestone',
      post_type_v2: 'auto',
      content,
      is_public: true,
      auto_post_type: 'first_week',
      auto_post_date: today,
    });
    await AsyncStorage.setItem(storageKey, 'true');
    console.log('[autoShare] first week post succeeded');
  } catch (e) {
    console.warn('[autoShare] first week post failed (non-fatal):', e);
  }
}

/** Auto-post a calorie goal hit to the community feed */
export async function autoShareCalorieGoal(): Promise<void> {
  console.log('[autoShare] autoShareCalorieGoal triggered');
  if (!(await isAutoShareEnabled())) return;

  // Dedup: only post once per calendar day
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  const today = new Date().toISOString().split('T')[0];
  const storageKey = `auto_share_calorie_goal_${today}`;
  const alreadyPosted = await AsyncStorage.getItem(storageKey);
  if (alreadyPosted) {
    console.log('[autoShare] calorie goal already posted today, skipping');
    return;
  }

  const messages = [
    'Hit my calorie goal today! Dialed in. #MacroGoal',
    'Nailed my calories today. Every day counts. #MacroGoal',
    'On target with calories today! #MacroGoal',
  ];
  const content = messages[Math.floor(Math.random() * messages.length)];
  console.log('[autoShare] posting calorie goal achievement');
  try {
    await createPost({ post_type: 'stats', content, is_public: true });
    await AsyncStorage.setItem(storageKey, 'true');
    console.log('[autoShare] calorie goal post succeeded');
  } catch (e) {
    console.warn('[autoShare] calorie goal post failed (non-fatal):', e);
  }
}

/** Auto-post a protein goal hit to the community feed */
export async function autoShareProteinGoal(): Promise<void> {
  console.log('[autoShare] autoShareProteinGoal triggered');
  if (!(await isAutoShareEnabled())) return;

  // Dedup: only post once per calendar day
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  const today = new Date().toISOString().split('T')[0];
  const storageKey = `auto_share_protein_goal_${today}`;
  const alreadyPosted = await AsyncStorage.getItem(storageKey);
  if (alreadyPosted) {
    console.log('[autoShare] protein goal already posted today, skipping');
    return;
  }

  const messages = [
    'Hit my protein goal today! Gains incoming. #MacroGoal',
    'Protein on point today. #MacroGoal',
    'Crushed my protein target today! #MacroGoal',
  ];
  const content = messages[Math.floor(Math.random() * messages.length)];
  console.log('[autoShare] posting protein goal achievement');
  try {
    await createPost({ post_type: 'stats', content, is_public: true });
    await AsyncStorage.setItem(storageKey, 'true');
    console.log('[autoShare] protein goal post succeeded');
  } catch (e) {
    console.warn('[autoShare] protein goal post failed (non-fatal):', e);
  }
}

/**
 * Auto-post a daily check-in summary once per day.
 * Checks AsyncStorage to ensure it only posts once per calendar day.
 * Posts the user's current streak + a motivational message.
 */
export async function autoShareDailySummary(): Promise<void> {
  console.log('[autoShare] autoShareDailySummary triggered');
  if (!(await isAutoShareEnabled())) return;

  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  const today = new Date().toISOString().split('T')[0];
  const lastPosted = await AsyncStorage.getItem('daily_summary_post_date');
  if (lastPosted === today) {
    console.log('[autoShare] daily summary already posted today, skipping');
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Get streak
  const { data: xpData } = await supabase
    .from('user_xp')
    .select('current_streak')
    .eq('user_id', user.id)
    .maybeSingle();

  const streak = xpData?.current_streak ?? 0;

  const messages = [
    streak > 0
      ? `Day ${streak} of my streak! Showing up every day. 💪 #MacroGoal`
      : `Starting fresh today. Every day is a new chance. #MacroGoal`,
    `Tracking my macros and staying consistent. Day ${streak > 0 ? streak : 1}. #MacroGoal`,
    `Another day, another step toward my goal. Streak: ${streak} days. #MacroGoal`,
    `Logged in and ready to crush today's goals. #MacroGoal`,
  ];
  const content = messages[Math.floor(Math.random() * messages.length)];

  try {
    await createPost({
      post_type: 'stats',
      post_type_v2: 'auto',
      content,
      is_public: true,
      auto_post_type: 'daily_summary',
      auto_post_date: today,
    });
    await AsyncStorage.setItem('daily_summary_post_date', today);
    console.log('[autoShare] daily summary posted successfully');
  } catch (e) {
    console.warn('[autoShare] daily summary post failed (non-fatal):', e);
  }
}

/** Auto-post a weight check-in milestone */
export async function autoShareWeightCheckin(weightKg: number): Promise<void> {
  console.log('[autoShare] autoShareWeightCheckin — weightKg:', weightKg);
  if (!(await isAutoShareEnabled())) return;
  // Only post every 5th check-in to avoid spam — check count
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { count } = await supabase
    .from('check_ins')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  console.log('[autoShare] weight check-in count:', count);
  if (!count || count % 5 !== 0) return; // Post on 5th, 10th, 15th... check-in

  // Dedup: only post once per calendar day
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  const today = new Date().toISOString().split('T')[0];
  const storageKey = `auto_share_weight_checkin_${today}`;
  const alreadyPosted = await AsyncStorage.getItem(storageKey);
  if (alreadyPosted) {
    console.log('[autoShare] weight check-in already posted today, skipping');
    return;
  }

  const content = `Just logged check-in #${count}! Tracking progress one day at a time. #MacroGoal`;
  console.log('[autoShare] posting weight check-in milestone #', count);
  try {
    await createPost({ post_type: 'milestone', content, is_public: true });
    await AsyncStorage.setItem(storageKey, 'true');
    console.log('[autoShare] weight check-in post succeeded');
  } catch (e) {
    console.warn('[autoShare] weight checkin post failed (non-fatal):', e);
  }
}
