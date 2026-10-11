import type { CountMetric, ProfileMetricsDto, ProfileResponseV2 } from './profileContracts';
import type { ProfileInput } from './clientContracts';
import { validateProfileInput } from './responseValidation';

export type NutritionRange = 'today' | '7d' | '30d' | 'custom';
export function localCalendarDate(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
/** Calendar arithmetic, not elapsed milliseconds: safe across DST boundaries. */
export function profileRangeInput(userId: string, range: NutritionRange, now: Date,
  custom?: { fromDate: string; toDate: string }): ProfileInput | null {
  const today = localCalendarDate(now);
  const start = new Date(now);
  if (range === '7d') start.setDate(start.getDate() - 6);
  if (range === '30d') start.setDate(start.getDate() - 29);
  if (range === 'custom' && !custom) return null;
  return validateProfileInput({ userId, today,
    fromDate: range === 'custom' ? custom!.fromDate : localCalendarDate(start),
    toDate: range === 'custom' ? custom!.toDate : today });
}
export function countText(metric: CountMetric | undefined): string {
  return metric?.status === 'available' ? String(metric.value) : 'Unavailable';
}
export function metricText(metrics: ProfileMetricsDto | null) {
  return {
    streak: metrics?.streak.status === 'available' ? String(metrics.streak.current) : 'Unavailable',
    best: metrics?.streak.status === 'available' ? String(metrics.streak.best) : 'Unavailable',
    score: metrics?.consistency.status === 'available' ? String(metrics.consistency.score) :
      metrics?.consistency.status === 'hidden' ? 'Hidden' : 'Unavailable',
    // Display the server's explicit UTC month directly. Never reinterpret it in a local timezone.
    since: metrics?.member_since.status === 'available' ? metrics.member_since.month : 'Unavailable',
    posts: countText(metrics?.posts_count), followers: countText(metrics?.followers_count),
    following: countText(metrics?.following_count),
  };
}
export function amountText(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Unavailable' : String(Math.round(value));
}
export function goalProgress(eaten: number, goal: number | null | undefined): number | null {
  return goal === null || goal === undefined || goal <= 0 ? null : Math.min(100, Math.max(0, eaten / goal * 100));
}
/** Defense in depth; authority and wire validation remain server/client responsibilities. */
export function visibleProfile(profile: ProfileResponseV2 | null) {
  if (!profile?.can_discover_profile) return { identity: null, user: null, metrics: null, nutrition: null };
  const approved = profile.can_view_profile && (profile.is_own_profile ||
    (profile.is_accepted_follower === true && profile.is_following === true && profile.follow_request_state === 'accepted'));
  return { identity: profile.discovery, user: approved ? profile.user : null,
    metrics: approved ? profile.metrics : null,
    nutrition: approved && profile.can_view_nutrition ? profile.nutrition : null };
}
/** The only image displayed here is the reviewed public avatar path. */
export function safeProfileAvatar(userId: string, value: string | null | undefined): string | null {
  const expected = `https://esgptfiofoaeguslgvcq.supabase.co/storage/v1/object/public/avatars/${userId}/avatar.jpg`;
  return value === expected ? expected : null;
}

/** Same relative timestamp presentation as the original profile post cards. */
export function relativePostTime(dateStr: string): string {
  const diffMins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
