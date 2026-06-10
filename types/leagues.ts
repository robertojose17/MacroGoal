/**
 * League Types
 *
 * Type definitions for the Weekly Leagues system (Duolingo-style competitive XP leagues).
 * Mirrors the backend contract from the `league-weekly` Supabase edge function.
 */

export type LeagueTier =
  | 'bronze' | 'silver' | 'gold' | 'sapphire' | 'ruby'
  | 'emerald' | 'amethyst' | 'pearl' | 'obsidian' | 'diamond';

export type LeagueLeaderboardEntry = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  xp_this_week: number;
  rank: number;
  is_you: boolean;
};

export type LeagueStatus = {
  tier: LeagueTier;
  tier_label: string;
  tier_emoji: string;
  week_start: string;        // ISO date "2025-01-13"
  week_end_iso: string;      // ISO datetime
  room_id: string;
  member_count: number;
  user_position: number;
  user_xp_this_week: number;
  promotion_zone_size: number;   // 5
  demotion_zone_size: number;    // 5
  is_in_promotion_zone: boolean;
  is_in_demotion_zone: boolean;
  xp_to_promotion: number;
  xp_to_safety: number;
  leaderboard: LeagueLeaderboardEntry[];
  is_first_assignment: boolean;
};

export const TIER_METADATA: Record<LeagueTier, {
  label: string;
  emoji: string;
  /** Gradient pair for the badge / banner */
  gradient: [string, string];
  /** Solid accent color for borders, "you are here" highlight */
  accent: string;
}> = {
  bronze:   { label: 'Bronze League',   emoji: '🥉', gradient: ['#B87333', '#8B5A2B'], accent: '#B87333' },
  silver:   { label: 'Silver League',   emoji: '🥈', gradient: ['#C0C0C0', '#8C8C8C'], accent: '#A8A8A8' },
  gold:     { label: 'Gold League',     emoji: '🥇', gradient: ['#FFD700', '#B8860B'], accent: '#D4A017' },
  sapphire: { label: 'Sapphire League', emoji: '💎', gradient: ['#0F52BA', '#082567'], accent: '#1E5FBF' },
  ruby:     { label: 'Ruby League',     emoji: '❤️', gradient: ['#E0115F', '#9B0F46'], accent: '#C8104F' },
  emerald:  { label: 'Emerald League',  emoji: '💚', gradient: ['#50C878', '#2E8B57'], accent: '#3DAA63' },
  amethyst: { label: 'Amethyst League', emoji: '💜', gradient: ['#9966CC', '#6B3FA0'], accent: '#8455B5' },
  pearl:    { label: 'Pearl League',    emoji: '🤍', gradient: ['#F5F5F5', '#C8C8C8'], accent: '#D8D8D8' },
  obsidian: { label: 'Obsidian League', emoji: '🖤', gradient: ['#3D3D3D', '#1A1A1A'], accent: '#2B2B2B' },
  diamond:  { label: 'Diamond League',  emoji: '💠', gradient: ['#B9F2FF', '#7FDFFF'], accent: '#9DEAFF' },
};

/** Ordered list of tiers from lowest to highest */
export const TIER_ORDER: LeagueTier[] = [
  'bronze', 'silver', 'gold', 'sapphire', 'ruby',
  'emerald', 'amethyst', 'pearl', 'obsidian', 'diamond',
];

/** Returns the next tier above the given one, or null if already at diamond */
export function getNextTier(tier: LeagueTier): LeagueTier | null {
  const idx = TIER_ORDER.indexOf(tier);
  if (idx === -1 || idx === TIER_ORDER.length - 1) return null;
  return TIER_ORDER[idx + 1];
}

/** Returns the previous tier below the given one, or null if already at bronze */
export function getPrevTier(tier: LeagueTier): LeagueTier | null {
  const idx = TIER_ORDER.indexOf(tier);
  if (idx <= 0) return null;
  return TIER_ORDER[idx - 1];
}
