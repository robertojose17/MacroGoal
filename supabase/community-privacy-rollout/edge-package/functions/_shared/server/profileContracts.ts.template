/** Draft v2 wire contract. No raw row, entitlement, private-media or post payloads. */
export const MAX_NUTRITION_DAYS = 366;

export type NutritionUnavailableReason =
  | 'authentication_required'
  | 'invalid_target'
  | 'profile_unavailable'
  | 'authorization_unavailable'
  | 'approval_required'
  | 'approval_pending'
  | 'follow_required'
  | 'nutrition_unavailable';

export type FollowRequestState = 'none' | 'pending' | 'accepted';
export interface FollowRequestDescriptor {
  request_id: string;
  /** Canonical positive decimal bigint string; never convert to Number. */
  revision: string;
  state: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'revoked';
}

export interface ProfileAccess {
  can_discover_profile: boolean;
  follow_request_state: FollowRequestState | null;
  follow_request: FollowRequestDescriptor | null;
  is_accepted_follower: boolean | null;
  can_view_profile: boolean;
  can_view_nutrition: boolean;
  nutrition_unavailable_reason: NutritionUnavailableReason | null;
  is_own_profile: boolean;
  is_following: boolean | null;
  is_mutual: boolean | null;
}

export interface DiscoveryIdentityDto {
  id: string;
  username: string | null;
  name: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export interface PublicIdentityDto extends DiscoveryIdentityDto {
  bio: string | null;
  /** Display only. Never an authorization or paid-feature entitlement. */
  is_premium: boolean | null;
}

export interface NutrientAmounts {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
}

export type CurrentGoalsDto = { [K in keyof NutrientAmounts]: number | null };
export interface NutritionDayDto extends NutrientAmounts {
  date: string;
  has_logged_items: boolean;
}

export interface NutritionDto {
  from_date: string;
  to_date: string;
  day_count: number;
  date_basis: 'meal_date';
  calendar_basis: 'request_calendar_dates';
  goals_scope: 'current';
  current_goals: CurrentGoalsDto | null;
  totals: NutrientAmounts;
  daily_average: NutrientAmounts;
  days: NutritionDayDto[];
  days_tracked: number;
  units: { calories: 'kcal'; protein: 'g'; carbs: 'g'; fats: 'g'; fiber: 'g' };
}

/** Protected screenshot metrics. Unavailable/hidden values carry no numeric payload. */
export type CountMetric = { status: 'available'; value: number } | { status: 'unavailable' };
export interface ProfileMetricsDto {
  streak: { status: 'available'; current: number; best: number } | { status: 'unavailable' };
  member_since: { status: 'available'; month: string; calendar_basis: 'UTC' } | { status: 'unavailable' };
  consistency:
    | { status: 'available'; score: number; from_date: string; to_date: string; day_count: 30 }
    | { status: 'hidden' | 'unavailable' };
  followers_count: CountMetric;
  following_count: CountMetric;
  posts_count: CountMetric;
}

export interface ProfileResponseV2 extends ProfileAccess {
  response_version: 2;
  target_user_id: string;
  discovery: DiscoveryIdentityDto | null;
  user: PublicIdentityDto | null;
  nutrition: NutritionDto | null;
  metrics: ProfileMetricsDto | null;
}
