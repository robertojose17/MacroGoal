/**
 * Macro Tier Logic
 *
 * Client-side tier calculation that mirrors the backend `set-macro-tier` logic
 * exactly. Used for instant UI feedback in NutritionMissionCard.
 *
 * IMPORTANT: The server is the source of truth for XP awards. This module is
 * only for local display — do not use it to award XP directly.
 */

export type MacroKey = 'calories' | 'protein' | 'carbs' | 'fats';

export interface TierResult {
  tier: 0 | 1 | 2;
  xp: number;
}

export const MACRO_KEYS: MacroKey[] = ['calories', 'protein', 'carbs', 'fats'];

/**
 * Maximum possible XP across all 4 macros.
 * Set to 0 — real XP values come from the backend xp_event_config table.
 */
export const MAX_MACRO_XP = 0;

/**
 * Compute the XP tier for a single macro.
 * Must match the backend `getMacroTier` function EXACTLY.
 *
 * NOTE: xp is always 0 here — real XP comes from the backend.
 * Only the tier (0/1/2) is used for local UI feedback.
 */
export function getMacroTier(macro: MacroKey, current: number, goal: number): TierResult {
  if (goal <= 0) return { tier: 0, xp: 0 };
  const ratio = current / goal;

  switch (macro) {
    case 'calories': {
      const dev = Math.abs(ratio - 1);
      if (dev <= 0.05) return { tier: 1, xp: 0 };
      if (dev <= 0.10) return { tier: 2, xp: 0 };
      return { tier: 0, xp: 0 };
    }
    case 'protein': {
      if (ratio >= 1.00) return { tier: 1, xp: 0 };
      if (ratio >= 0.80) return { tier: 2, xp: 0 };
      return { tier: 0, xp: 0 };
    }
    case 'carbs':
    case 'fats': {
      const dev = Math.abs(ratio - 1);
      if (dev <= 0.10) return { tier: 1, xp: 0 };
      if (dev <= 0.20) return { tier: 2, xp: 0 };
      return { tier: 0, xp: 0 };
    }
  }
}

/**
 * Sum the live XP across all provided macros.
 * Always returns 0 — real XP comes from the backend xp_event_config table.
 */
export function totalLiveXp(
  _macros: { macro: MacroKey; current: number; goal: number }[]
): number {
  return 0;
}
