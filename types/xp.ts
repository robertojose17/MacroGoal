/**
 * XP System Types
 *
 * Shared TypeScript types for the Fitness XP gamification system.
 * These match the response shapes from the Supabase Edge Functions:
 *   - award-xp
 *   - get-xp-status
 *   - generate-daily-missions
 *   - calculate-rankings
 *   - confirm-level-up-seen
 */

// ─── Event types accepted by award-xp ────────────────────────────────────────

export type XpEventType =
  | 'meal_logged'
  | 'protein_goal'
  | 'calorie_goal'
  | 'workout'
  | 'steps'
  | 'weight_checkin'
  | 'progress_photo';

// ─── award-xp request / response ─────────────────────────────────────────────

export type AwardXpInput = {
  event_type: XpEventType;
  /** Idempotency key — use today's ISO date for daily events, item ID for per-item events */
  source_id: string;
  metadata?: Record<string, unknown>;
};

export type AwardXpResult = {
  awarded: number;
  base_xp: number;
  multiplier: number;
  xp_today: number;
  total_xp: number;
  current_level: number;
  current_rank: string;
  level_up: boolean;
  pending_level_up_to: number | null;
  missions_just_completed: string[];
  all_missions_done: boolean;
  current_streak: number;
};

// ─── get-xp-status response ───────────────────────────────────────────────────

export type DailyMission = {
  id: string;
  mission_type: string;
  title: string;
  description: string;
  xp_reward: number;
  target_value: number;
  current_value: number;
  completed: boolean;
  completed_at: string | null;
};

export type LevelProgress = {
  current_level: number;
  xp_in_current_level: number;
  xp_needed_for_next_level: number;
  progress_percent: number;
};

export type XpToday = {
  xp_today: number;
  last_xp_date: string | null;
};

export type UserRanking = {
  rank_position: number | null;
  total_users: number;
  percentile: number | null;
  // NEW — lifetime consistency-based ranking
  consistency_score: number;          // 0-100, default 0 if no meals ever
  consistency_rank: number | null;    // null if user has no meals
  consistency_percentile: number;     // 0-100, default 0 if no meals ever
};

export type XpBreakdownEntry = {
  event_type: string;
  label: string;
  xp: number;
};

export type XpStatus = {
  /** Core user XP state */
  total_xp: number;
  current_level: number;
  current_rank: string;
  current_streak: number;
  longest_streak: number;
  xp_today: number;
  last_xp_date: string | null;
  pending_level_up: boolean;
  pending_level_up_to: number | null;
  pending_rank_change: string | null;

  /** Derived progress info */
  level_progress: LevelProgress;

  /** Today's missions */
  missions: DailyMission[];

  /** Leaderboard position */
  ranking: UserRanking | null;

  /** Per-event XP breakdown for today — optional, requires updated backend */
  today_breakdown?: XpBreakdownEntry[];
};
