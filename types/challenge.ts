/**
 * 7-Day Challenge Types
 *
 * Shared TypeScript types for the 7-Day Challenge feature.
 * These match the response shapes from the Supabase Edge Functions:
 *   - accept-seven-day-challenge
 *   - get-seven-day-challenge
 *   - complete-challenge-day
 */

export type ChallengeStatus = 'active' | 'completed' | 'expired';

export type ChallengeMissionType =
  | 'log_first_meal'
  | 'hit_calorie_goal'
  | 'hit_protein_goal'
  | 'walk_5000_steps'
  | 'log_three_meals'
  | 'complete_workout'
  | 'hit_all_three';

export interface ChallengeTodaysMission {
  day: number;
  mission_type: ChallengeMissionType;
  title_en: string;
  title_es: string;
  target: number;
  current: number;
  unit?: string;
}

export interface SevenDayChallenge {
  id: string;
  start_date: string;
  current_day: number;
  completed_days: string[];
  status: ChallengeStatus;
  badge_awarded: boolean;
  is_today_completed?: boolean;
  todays_mission?: ChallengeTodaysMission;
  days_remaining?: number;
}
