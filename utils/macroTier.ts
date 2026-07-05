/**
 * Macro tier calculation utilities.
 * Used for instant UI feedback in TodaysMissionsCard.
 */

export type MacroKey = 'calories' | 'protein' | 'carbs' | 'fats';

export const MACRO_KEYS: MacroKey[] = ['calories', 'protein', 'carbs', 'fats'];

export type MacroTier = 'none' | 'bronze' | 'silver' | 'gold';

/**
 * Returns the tier achieved for a single macro based on current vs goal.
 */
export function getMacroTier(
  _macro: MacroKey,
  current: number,
  goal: number
): MacroTier {
  if (!goal || goal <= 0) return 'none';
  const ratio = current / goal;
  if (ratio >= 0.95 && ratio <= 1.1) return 'gold';
  if (ratio >= 0.8) return 'silver';
  if (ratio >= 0.5) return 'bronze';
  return 'none';
}

const TIER_XP: Record<MacroTier, number> = {
  none: 0,
  bronze: 10,
  silver: 25,
  gold: 50,
};

/**
 * Returns total live XP across all macros.
 */
export function totalLiveXp(
  inputs: { macro: MacroKey; current: number; goal: number }[]
): number {
  return inputs.reduce((sum, { macro, current, goal }) => {
    const tier = getMacroTier(macro, current, goal);
    return sum + TIER_XP[tier];
  }, 0);
}
