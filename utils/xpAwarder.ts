/**
 * XP Awarder
 *
 * Fire-and-forget helpers that call awardXp() and never throw.
 * All functions are safe to call without awaiting — they catch every error
 * internally so the caller's primary action (saving a meal, check-in, etc.)
 * is never blocked or broken by an XP failure.
 *
 * After a successful award that triggers a level-up or mission completion,
 * an XP_EVENTS.REFRESH event is emitted so the dashboard updates if mounted.
 */

import { awardXp } from '@/utils/xpApi';
import { supabase } from '@/lib/supabase/client';
import { emitXpRefresh, emitLeagueRefresh } from '@/utils/xpEvents';
import { recordWeeklyXp } from '@/utils/leagueApi';
import type { AwardXpResult } from '@/types/xp';

// ─── Internal helper ──────────────────────────────────────────────────────────

function handleResult(result: AwardXpResult, label: string): void {
  console.log(`[xpAwarder] ${label} awarded=${result.awarded} level_up=${result.level_up} missions=${result.missions_just_completed.length}`);
  if (result.awarded > 0 || result.level_up || result.missions_just_completed.length > 0) {
    emitXpRefresh();
  }
  // Piggyback: record XP in the weekly league and refresh the league UI
  if (result.awarded > 0) {
    console.log(`[xpAwarder] ${label} — recording ${result.awarded} XP in weekly league`);
    recordWeeklyXp(result.awarded)
      .catch((err) => console.warn('[xpAwarder] recordWeeklyXp failed (non-fatal):', err?.message ?? err));
    emitLeagueRefresh();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Award XP for logging a meal item.
 * @param meal_item_id  The newly inserted meal_items.id (used as source_id for dedup)
 * @param meal_type     breakfast | lunch | dinner | snack
 */
export function tryAwardMealLogged(meal_item_id: string, meal_type: string): void {
  console.log('[xpAwarder] tryAwardMealLogged', meal_item_id, meal_type);
  awardXp({
    event_type: 'meal_logged',
    source_id: meal_item_id,
    metadata: { meal_type },
  })
    .then((result) => handleResult(result, 'meal_logged'))
    .catch((err) => console.warn('[xpAwarder] meal_logged award failed (non-fatal):', err?.message ?? err));
}

/**
 * Award XP for a gym workout check-in.
 * @param check_in_id  The check_ins.id (used as source_id for dedup)
 */
export function tryAwardWorkout(check_in_id: string): void {
  console.log('[xpAwarder] tryAwardWorkout', check_in_id);
  awardXp({
    event_type: 'workout',
    source_id: check_in_id,
    metadata: { completed: true },
  })
    .then((result) => handleResult(result, 'workout'))
    .catch((err) => console.warn('[xpAwarder] workout award failed (non-fatal):', err?.message ?? err));
}

/**
 * Award XP for logging a weight check-in.
 * @param check_in_id  The check_ins.id (used as source_id for dedup)
 * @param weight       Weight value (in kg, as stored in DB)
 */
export function tryAwardWeightCheckin(check_in_id: string, weight: number): void {
  console.log('[xpAwarder] tryAwardWeightCheckin', check_in_id, weight);
  awardXp({
    event_type: 'weight_checkin',
    source_id: check_in_id,
    metadata: { weight },
  })
    .then((result) => handleResult(result, 'weight_checkin'))
    .catch((err) => console.warn('[xpAwarder] weight_checkin award failed (non-fatal):', err?.message ?? err));
}

/**
 * Award XP for uploading a progress photo.
 * @param source_id  A unique identifier for the photo (check_in_id or photo URL)
 */
export function tryAwardProgressPhoto(source_id: string): void {
  console.log('[xpAwarder] tryAwardProgressPhoto', source_id);
  awardXp({
    event_type: 'progress_photo',
    source_id,
    metadata: {},
  })
    .then((result) => handleResult(result, 'progress_photo'))
    .catch((err) => console.warn('[xpAwarder] progress_photo award failed (non-fatal):', err?.message ?? err));
}

/**
 * Evaluate whether today's nutrition totals hit protein/calorie goals and
 * award the corresponding XP tiers. Safe to call after every meal log —
 * the backend deduplicates by (user_id, event_type, source_id, date).
 *
 * Goals are read from the `goals` table (daily_calories, protein_g).
 * Totals are summed from meal_items joined through meals for the given date.
 *
 * @param date  ISO date string YYYY-MM-DD
 */
export async function evaluateDailyGoals(date: string): Promise<void> {
  console.log('[xpAwarder] evaluateDailyGoals for date:', date);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('[xpAwarder] evaluateDailyGoals: no authenticated user, skipping');
      return;
    }

    // Fetch user's active goal and today's meal totals in parallel
    const [goalsResult, mealsResult] = await Promise.all([
      supabase
        .from('goals')
        .select('daily_calories, protein_g')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle(),
      supabase
        .from('meals')
        .select('meal_items(calories, protein)')
        .eq('user_id', user.id)
        .eq('date', date),
    ]);

    const goal = goalsResult.data;
    if (!goal) {
      console.warn('[xpAwarder] evaluateDailyGoals: no active goal found, skipping');
      return;
    }

    const calorieGoal = Number(goal.daily_calories) || 0;
    const proteinGoal = Number(goal.protein_g) || 0;

    if (calorieGoal <= 0 || proteinGoal <= 0) {
      console.warn('[xpAwarder] evaluateDailyGoals: goal values are zero, skipping');
      return;
    }

    // Sum today's totals from meal_items
    let totalCalories = 0;
    let totalProtein = 0;

    const meals = mealsResult.data ?? [];
    for (const meal of meals) {
      const items = (meal as any).meal_items ?? [];
      for (const item of items) {
        totalCalories += Number(item.calories) || 0;
        totalProtein += Number(item.protein) || 0;
      }
    }

    const caloriePct = (totalCalories / calorieGoal) * 100;
    const proteinPct = (totalProtein / proteinGoal) * 100;

    console.log('[xpAwarder] evaluateDailyGoals totals — calories:', totalCalories, '/', calorieGoal, `(${caloriePct.toFixed(1)}%)`, '| protein:', totalProtein, '/', proteinGoal, `(${proteinPct.toFixed(1)}%)`);

    // Award protein_goal if >= 80% of target
    if (proteinPct >= 80) {
      console.log('[xpAwarder] evaluateDailyGoals: protein >= 80%, awarding protein_goal');
      awardXp({
        event_type: 'protein_goal',
        source_id: date,
        metadata: { percentage_of_goal: Math.round(proteinPct) },
      })
        .then((result) => handleResult(result, 'protein_goal'))
        .catch((err) => console.warn('[xpAwarder] protein_goal award failed (non-fatal):', err?.message ?? err));
    }

    // Award calorie_goal if within 90–110% of target (within 10%)
    if (caloriePct >= 90 && caloriePct <= 110) {
      console.log('[xpAwarder] evaluateDailyGoals: calories within 90-110%, awarding calorie_goal');
      awardXp({
        event_type: 'calorie_goal',
        source_id: date,
        metadata: { percentage_of_goal: Math.round(caloriePct) },
      })
        .then((result) => handleResult(result, 'calorie_goal'))
        .catch((err) => console.warn('[xpAwarder] calorie_goal award failed (non-fatal):', err?.message ?? err));
    }
  } catch (err) {
    // Never throw — this is always fire-and-forget
    console.warn('[xpAwarder] evaluateDailyGoals error (non-fatal):', (err as Error)?.message ?? err);
  }
}
