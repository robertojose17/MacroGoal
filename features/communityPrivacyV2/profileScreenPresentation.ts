import { getAppLocale } from '@/lib/localization';
import { socialT as t } from '@/features/communityPrivacyV2/socialTranslations';
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
  return metric?.status === 'available' ? metric.value.toLocaleString(getAppLocale()) : t('localization.social.unavailable');
}
export function metricText(metrics: ProfileMetricsDto | null) {
  return {
    streak: metrics?.streak.status === 'available' ? metrics.streak.current.toLocaleString(getAppLocale()) : t('localization.social.unavailable'),
    best: metrics?.streak.status === 'available' ? metrics.streak.best.toLocaleString(getAppLocale()) : t('localization.social.unavailable'),
    score: metrics?.consistency.status === 'available' ? metrics.consistency.score.toLocaleString(getAppLocale()) :
      metrics?.consistency.status === 'hidden' ? t('localization.social.hidden') : t('localization.social.unavailable'),
    // Display the server's explicit UTC month directly. Never reinterpret it in a local timezone.
    since: metrics?.member_since.status === 'available' ? new Date(`${metrics.member_since.month}-01T00:00:00Z`).toLocaleDateString(getAppLocale(), { month: 'short', year: 'numeric', timeZone: 'UTC' }) : t('localization.social.unavailable'),
    posts: countText(metrics?.posts_count), followers: countText(metrics?.followers_count),
    following: countText(metrics?.following_count),
  };
}
export function amountText(value: number | null | undefined): string {
  return value === null || value === undefined ? t('localization.social.unavailable') : Math.round(value).toLocaleString(getAppLocale());
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
  if (diffMins < 1) return t('localization.social.just_now');
  if (diffMins < 60) return t('localization.social.minutes_ago', { count: diffMins });
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return t('localization.social.hours_ago', { count: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return t('localization.social.days_ago', { count: diffDays });
  return new Date(dateStr).toLocaleDateString(getAppLocale(), { month: 'short', day: 'numeric' });
}
