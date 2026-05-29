/**
 * XP Level Rewards
 *
 * Static table mapping level milestones to cosmetic rewards.
 * Purely cosmetic for now — used by NextUnlockCard.
 */

export type XpReward = {
  type: 'badge' | 'frame' | 'theme' | 'rank';
  name: string;
  description: string;
  icon: string; // emoji
};

export const LEVEL_REWARDS: Record<number, XpReward[]> = {
  5: [{ type: 'badge', name: 'First Steps Badge', description: 'Earned your first 5 levels', icon: '🥉' }],
  10: [
    { type: 'badge', name: 'Rookie Graduate', description: 'Completed Rookie rank', icon: '🎖️' },
    { type: 'theme', name: 'Bronze Share Card', description: 'New share card style', icon: '🎨' },
  ],
  15: [{ type: 'frame', name: 'Bronze Frame', description: 'Profile frame upgrade', icon: '🖼️' }],
  20: [{ type: 'badge', name: 'Consistent Hero', description: 'Demonstrated true consistency', icon: '⭐' }],
  25: [
    { type: 'rank', name: 'Athlete Rank', description: 'Welcome to Athlete tier', icon: '💪' },
    { type: 'frame', name: 'Silver Frame', description: 'Profile frame upgrade', icon: '🖼️' },
    { type: 'theme', name: 'Silver Share Card', description: 'New share card style', icon: '🎨' },
  ],
  30: [{ type: 'badge', name: 'Iron Will Badge', description: '30 levels of dedication', icon: '🔥' }],
  40: [{ type: 'badge', name: 'Athlete Master', description: 'Mastered the Athlete tier', icon: '🏆' }],
  50: [
    { type: 'rank', name: 'Iron Mind Rank', description: 'Welcome to Iron Mind tier', icon: '🧠' },
    { type: 'frame', name: 'Gold Frame', description: 'Profile frame upgrade', icon: '🖼️' },
    { type: 'theme', name: 'Gold Share Card', description: 'Premium share card style', icon: '🎨' },
  ],
  75: [
    { type: 'rank', name: 'Elite Rank', description: 'You are now Elite', icon: '👑' },
    { type: 'frame', name: 'Platinum Frame', description: 'Profile frame upgrade', icon: '🖼️' },
  ],
  100: [
    { type: 'rank', name: 'Beast Rank', description: 'Welcome to Beast tier', icon: '🦁' },
    { type: 'badge', name: 'Centurion Badge', description: '100 levels conquered', icon: '🎯' },
    { type: 'theme', name: 'Diamond Share Card', description: 'Legendary share card style', icon: '💎' },
  ],
  150: [{ type: 'rank', name: 'Legend Rank', description: 'You are a Legend', icon: '⚡' }],
};

/** Find the next level > currentLevel that has rewards. */
export function findNextUnlock(currentLevel: number): { level: number; rewards: XpReward[] } | null {
  const milestoneLevels = Object.keys(LEVEL_REWARDS).map(Number).sort((a, b) => a - b);
  const next = milestoneLevels.find((lvl) => lvl > currentLevel);
  if (!next) return null;
  return { level: next, rewards: LEVEL_REWARDS[next] };
}
