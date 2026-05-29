/**
 * Streak Milestone Tracking
 *
 * Tracks which streak milestones have been celebrated so we don't
 * show the same modal twice. Uses AsyncStorage for persistence.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@macro_goal/streak_milestones_seen';
const MILESTONES = [7, 30, 90, 365];

export async function getCelebratedMilestones(): Promise<number[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('[streakMilestones] read error:', e);
    return [];
  }
}

export async function markMilestoneCelebrated(milestone: number): Promise<void> {
  try {
    const seen = await getCelebratedMilestones();
    if (!seen.includes(milestone)) {
      seen.push(milestone);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
    }
  } catch (e) {
    console.warn('[streakMilestones] write error:', e);
  }
}

/**
 * Returns the highest un-celebrated milestone the user has reached, or null.
 */
export async function getPendingMilestone(currentStreak: number): Promise<number | null> {
  const seen = await getCelebratedMilestones();
  const reached = MILESTONES.filter((m) => currentStreak >= m && !seen.includes(m));
  return reached.length > 0 ? Math.max(...reached) : null;
}

/**
 * Reset all milestones (e.g. when streak resets to 0).
 */
export async function resetMilestones(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('[streakMilestones] reset error:', e);
  }
}
