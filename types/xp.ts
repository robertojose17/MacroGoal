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
 *   - unlock-mission-slot
 */

// ─── Event types accepted by award-xp ────────────────────────────────────────

export type XpEventType =
  | 'meal_logged'
  | 'protein_goal'
  | 'calorie_goal'
  | 'workout'
  | 'steps'
  | 'weight_checkin'
  | 'progress_photo'
  | 'share_progress';

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
  streak_multiplier?: number;    // e.g. 1.0, 1.1, 1.25, 1.5, 2.0
  premium_multiplier?: number;   // 1.0 for free, 1.5 for premium
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

// ─── Unlock Mission Slot types ────────────────────────────────────────────────

export type UnlockedSlot = {
  slot_index: number;
  mission_type: string;       // e.g. 'complete_workout'
  target: number;
  xp_reward: number;
  completed: boolean;
  completed_at: string | null;
};

export type NextUnlockGate = {
  type: 'level' | 'days_active';
  current: number;
  target: number;
  message: string;
};

export type UnlockSlotStatus = {
  max_slots: number;          // 0, 1, or 2
  used_slots: number;
  remaining_slots: number;
  unlock_bonus_xp: number;    // 50
  next_unlock_at: NextUnlockGate | null;
  slots: UnlockedSlot[];
};

export type UnlockMissionSlotResult = {
  success: boolean;
  slot: UnlockedSlot;
  xp_awarded: number;
  remaining_slots: number;
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

  /** Premium & streak multiplier fields — optional until backend rolls out */
  is_premium?: boolean;
  streak_multiplier?: number;      // current effective streak multiplier
  premium_multiplier?: number;     // 1.0 or 1.5
  streak_freeze_count?: number;    // freezes available
  weekly_freeze_max?: number;      // 1 for free, 3 for premium

  /** Unlock slot status — replaces mission_tier / tier_progress */
  unlock_slot_status?: UnlockSlotStatus;

  /** @deprecated — replaced by unlock_slot_status */
  mission_tier?: number;
  /** @deprecated — replaced by unlock_slot_status */
  tier_progress?: TierProgress | null;
};

// ─── Mission tier progress (kept for back-compat) ─────────────────────────────

export type TierProgress = {
  current: number;              // current days_active
  target: number;               // days needed to unlock next tier
  next_tier: number;            // 2 or 3
  message: string;              // backend-provided motivating message
  locked_missions?: string[];   // mission types locked at this tier (e.g. ['hit_protein_goal'])
};
