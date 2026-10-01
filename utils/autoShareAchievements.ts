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

/** Auto-post a streak milestone to the community feed */
export async function autoShareStreak(streakDays: number): Promise<void> {
  console.log('[autoShare] autoShareStreak — streakDays:', streakDays);
  if (!(await isAutoShareEnabled())) return;
  const messages: Record<number, string> = {
    7:   '🔥 7-day streak! Consistency is everything. #MacroGoal',
    14:  '🔥 14 days straight! Two weeks of showing up. #MacroGoal',
    30:  '🔥 30-day streak! A full month of discipline. #MacroGoal',
    60:  '🔥 60 days strong! Habits are forming. #MacroGoal',
    90:  '🔥 90-day streak! Three months of consistency. #MacroGoal',
    180: '🔥 180 days! Half a year of showing up every day. #MacroGoal',
    365: '🔥 365-day streak! A full year of discipline. Legend. #MacroGoal',
  };
  const content = messages[streakDays];
  if (!content) return; // Only post at milestone numbers
  console.log('[autoShare] posting streak milestone:', streakDays, 'days');
  try {
    await createPost({ post_type: 'streak', content, streak_days: streakDays, is_public: true });
    console.log('[autoShare] streak post succeeded');
  } catch (e) {
    console.warn('[autoShare] streak post failed (non-fatal):', e);
  }
}

/** Auto-post a calorie goal hit to the community feed */
export async function autoShareCalorieGoal(): Promise<void> {
  console.log('[autoShare] autoShareCalorieGoal triggered');
  if (!(await isAutoShareEnabled())) return;
  const messages = [
    '✅ Hit my calorie goal today! Dialed in. #MacroGoal',
    '✅ Nailed my calories today. Every day counts. #MacroGoal',
    '✅ On target with calories today! #MacroGoal',
  ];
  const content = messages[Math.floor(Math.random() * messages.length)];
  console.log('[autoShare] posting calorie goal achievement');
  try {
    await createPost({ post_type: 'stats', content, is_public: true });
    console.log('[autoShare] calorie goal post succeeded');
  } catch (e) {
    console.warn('[autoShare] calorie goal post failed (non-fatal):', e);
  }
}

/** Auto-post a protein goal hit to the community feed */
export async function autoShareProteinGoal(): Promise<void> {
  console.log('[autoShare] autoShareProteinGoal triggered');
  if (!(await isAutoShareEnabled())) return;
  const messages = [
    '💪 Hit my protein goal today! Gains incoming. #MacroGoal',
    '💪 Protein on point today. #MacroGoal',
    '💪 Crushed my protein target today! #MacroGoal',
  ];
  const content = messages[Math.floor(Math.random() * messages.length)];
  console.log('[autoShare] posting protein goal achievement');
  try {
    await createPost({ post_type: 'stats', content, is_public: true });
    console.log('[autoShare] protein goal post succeeded');
  } catch (e) {
    console.warn('[autoShare] protein goal post failed (non-fatal):', e);
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
  const content = `📊 Just logged check-in #${count}! Tracking progress one day at a time. #MacroGoal`;
  console.log('[autoShare] posting weight check-in milestone #', count);
  try {
    await createPost({ post_type: 'milestone', content, is_public: true });
    console.log('[autoShare] weight check-in post succeeded');
  } catch (e) {
    console.warn('[autoShare] weight checkin post failed (non-fatal):', e);
  }
}
