import { MAX_NUTRITION_DAYS } from './profileContracts';
import type { ProfileResponseV2, PublicIdentityDto } from './profileContracts';
import type { CommunityIdentitiesResponseV2, DiscoveryIdentityDto, IdentityInput, IdentityRequest, ProfileInput } from './clientContracts';
import { MAX_IDENTITY_IDS, MAX_IDENTITY_SEARCH_RESULTS } from './clientContracts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nutrients = ['calories', 'protein', 'carbs', 'fats', 'fiber'] as const;
const unavailable = new Set(['authentication_required', 'invalid_target', 'profile_unavailable',
  'authorization_unavailable', 'approval_required', 'approval_pending', 'follow_required', 'nutrition_unavailable']);
const DAY_MS = 86_400_000;
type RecordValue = Record<string, unknown>;
function object(v: unknown): v is RecordValue { return typeof v === 'object' && v !== null && !Array.isArray(v); }
function keys(v: unknown, names: readonly string[]): v is RecordValue {
  return object(v) && Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k));
}
function isId(v: unknown): v is string { return typeof v === 'string' && UUID.test(v); }
function nullableString(v: unknown, max: number): boolean { return v === null || (typeof v === 'string' && v.length <= max); }
function booleanOrNull(v: unknown): boolean { return v === null || typeof v === 'boolean'; }
function amount(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v) && v >= 0; }
function dateMs(v: unknown): number | null {
  if (typeof v !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const ms = Date.parse(`${v}T00:00:00.000Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === v ? ms : null;
}
function sameNumber(a: number, b: number): boolean { return Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b)); }

export function validateProfileInput(input: ProfileInput): ProfileInput | null {
  if (!object(input) || !isId(input.userId)) return null;
  const from = dateMs(input.fromDate), to = dateMs(input.toDate), today = dateMs(input.today);
  if (today === null || today < Date.parse('0001-01-30T00:00:00.000Z') || from === null || to === null || to < from || (to - from) / DAY_MS + 1 > MAX_NUTRITION_DAYS) return null;
  return { userId: input.userId.toLowerCase(), fromDate: input.fromDate, toDate: input.toDate, today: input.today };
}
export function validateIdentityInput(input: IdentityInput): IdentityRequest | null {
  if (!object(input)) return null;
  if (input.mode === 'ids') {
    if (!Array.isArray(input.userIds) || input.userIds.length < 1 || input.userIds.length > MAX_IDENTITY_IDS || !input.userIds.every(isId)) return null;
    return { mode: 'ids', user_ids: [...new Set(input.userIds.map(id => id.toLowerCase()))].sort() };
  }
  if (input.mode !== 'search' || typeof input.query !== 'string') return null;
  const q = input.query.trim();
  const limit = input.limit ?? MAX_IDENTITY_SEARCH_RESULTS;
  // Proposed username search contract, to verify against actual registration constraints before rollout.
  if (!/^[A-Za-z0-9_.]{2,32}$/.test(q) || !Number.isInteger(limit) || limit < 1 || limit > MAX_IDENTITY_SEARCH_RESULTS) return null;
  return { mode: 'search', q, limit };
}
function identity(v: unknown): v is PublicIdentityDto {
  return keys(v, ['id', 'username', 'name', 'full_name', 'avatar_url', 'bio', 'is_premium']) &&
    isId(v.id) && nullableString(v.username, 100) && nullableString(v.name, 200) &&
    nullableString(v.full_name, 200) && nullableString(v.avatar_url, 2048) &&
    nullableString(v.bio, 4000) && booleanOrNull(v.is_premium);
}
function discoveryIdentity(v: unknown): v is DiscoveryIdentityDto {
  return keys(v, ['id', 'username', 'name', 'full_name', 'avatar_url']) && isId(v.id) &&
    nullableString(v.username, 100) && nullableString(v.name, 200) &&
    nullableString(v.full_name, 200) && nullableString(v.avatar_url, 2048);
}
function amounts(v: unknown, nullable = false): boolean {
  return keys(v, nutrients) && nutrients.every(k => amount(v[k]) || (nullable && v[k] === null));
}
function nutrition(v: unknown, input: ProfileInput): boolean {
  if (!keys(v, ['from_date', 'to_date', 'day_count', 'date_basis', 'calendar_basis', 'goals_scope',
    'current_goals', 'totals', 'daily_average', 'days', 'days_tracked', 'units'])) return false;
  const from = dateMs(input.fromDate)!, to = dateMs(input.toDate)!;
  const dayCount = (to - from) / DAY_MS + 1;
  const units = v.units;
  if (v.from_date !== input.fromDate || v.to_date !== input.toDate || v.day_count !== dayCount ||
    v.date_basis !== 'meal_date' || v.calendar_basis !== 'request_calendar_dates' || v.goals_scope !== 'current' ||
    !(v.current_goals === null || amounts(v.current_goals, true)) || !amounts(v.totals) || !amounts(v.daily_average) ||
    !Array.isArray(v.days) || v.days.length !== dayCount || !Number.isInteger(v.days_tracked) ||
    !keys(units, nutrients) || units.calories !== 'kcal' || nutrients.slice(1).some(k => units[k] !== 'g')) return false;
  const sums: Record<string, number> = Object.fromEntries(nutrients.map(k => [k, 0]));
  let tracked = 0;
  for (let i = 0; i < v.days.length; i += 1) {
    const day = v.days[i];
    if (!keys(day, ['date', ...nutrients, 'has_logged_items']) || dateMs(day.date) !== from + i * DAY_MS ||
      typeof day.has_logged_items !== 'boolean' || !nutrients.every(k => amount(day[k]))) return false;
    if (!day.has_logged_items && nutrients.some(k => day[k] !== 0)) return false;
    if (day.has_logged_items) tracked += 1;
    for (const k of nutrients) sums[k] += day[k] as number;
  }
  const totals = v.totals as Record<string, number>, averages = v.daily_average as Record<string, number>;
  return tracked === v.days_tracked && nutrients.every(k => amount(sums[k]) &&
    sameNumber(totals[k], sums[k]) && sameNumber(averages[k], sums[k] / dayCount));
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function countMetric(value: unknown): boolean {
  return (keys(value, ['status']) && value.status === 'unavailable') ||
    (keys(value, ['status', 'value']) && value.status === 'available' && nonnegativeInteger(value.value));
}
function metrics(value: unknown, today: string): boolean {
  if (!keys(value, ['streak', 'member_since', 'consistency', 'followers_count', 'following_count', 'posts_count'])) return false;
  const streak = value.streak, member = value.member_since, consistency = value.consistency;
  if (!((keys(streak, ['status']) && streak.status === 'unavailable') ||
    (keys(streak, ['status', 'current', 'best']) && streak.status === 'available' &&
      nonnegativeInteger(streak.current) && nonnegativeInteger(streak.best) && streak.best >= streak.current))) return false;
  if (!((keys(member, ['status']) && member.status === 'unavailable') ||
    (keys(member, ['status', 'month', 'calendar_basis']) && member.status === 'available' &&
      typeof member.month === 'string' && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(member.month) && member.calendar_basis === 'UTC'))) return false;
  if (!((keys(consistency, ['status']) && ['hidden', 'unavailable'].includes(consistency.status as string)) ||
    (keys(consistency, ['status', 'score', 'from_date', 'to_date', 'day_count']) && consistency.status === 'available' &&
      nonnegativeInteger(consistency.score) && consistency.score <= 100 && consistency.day_count === 30 &&
      consistency.to_date === today && dateMs(consistency.from_date) === dateMs(today)! - 29 * DAY_MS))) return false;
  return countMetric(value.followers_count) && countMetric(value.following_count) && countMetric(value.posts_count);
}

function followRequestDescriptor(value: unknown, state: unknown, own: boolean, discoverable: boolean): boolean {
  if (own) return value === null && state === null;
  if (!discoverable || state === null) return value === null;
  if (value === null) return state === 'none';
  if (!keys(value, ['request_id', 'revision', 'state']) || !isId(value.request_id) ||
    typeof value.revision !== 'string' || !/^[1-9]\d{0,18}$/.test(value.revision) ||
    BigInt(value.revision) > 9223372036854775807n ||
    !['pending', 'accepted', 'rejected', 'cancelled', 'revoked'].includes(value.state as string)) return false;
  return value.state === state || (state === 'none' && ['rejected', 'cancelled', 'revoked'].includes(value.state as string));
}

/** Exact allowlist parsing intentionally rejects additive fields: a new server DTO needs review.
 * No remote body, private column or diagnostics are retained on parse failure. */
export function parseProfileResponse(body: unknown, input: ProfileInput, callerId: string): ProfileResponseV2 | null {
  if (!keys(body, ['response_version', 'target_user_id', 'user', 'is_own_profile', 'is_following', 'is_mutual',
    'can_discover_profile', 'discovery', 'follow_request_state', 'follow_request', 'is_accepted_follower',
    'can_view_profile', 'can_view_nutrition', 'nutrition_unavailable_reason', 'nutrition', 'metrics'])) return null;
  if (body.response_version !== 2 || body.target_user_id !== input.userId ||
    body.is_own_profile !== (callerId === input.userId) || !booleanOrNull(body.is_following) ||
    !booleanOrNull(body.is_mutual) || typeof body.can_view_profile !== 'boolean' ||
    typeof body.can_view_nutrition !== 'boolean' || typeof body.can_discover_profile !== 'boolean' ||
    !booleanOrNull(body.is_accepted_follower) ||
    !(body.follow_request_state === null || ['none', 'pending', 'accepted'].includes(body.follow_request_state as string)) || (body.is_mutual === true && body.is_following !== true)) return null;
  if (!followRequestDescriptor(body.follow_request, body.follow_request_state, body.is_own_profile as boolean, body.can_discover_profile)) return null;
  // A plain follow, public flag, reverse approval or request cannot authorize a profile.
  const acceptedActive = body.follow_request_state === 'accepted' &&
    body.is_accepted_follower === true && body.is_following === true;
  if (body.is_accepted_follower === true && !acceptedActive) return null;
  if (body.can_discover_profile) {
    if (!discoveryIdentity(body.discovery) || body.discovery.id.toLowerCase() !== input.userId) return null;
  } else if (body.discovery !== null || body.can_view_profile || body.can_view_nutrition ||
    body.is_following !== null || body.is_mutual !== null || body.follow_request_state !== null ||
    body.is_accepted_follower !== null) return null;
  if (body.can_view_profile) {
    if (!body.can_discover_profile || (!body.is_own_profile && !acceptedActive)) return null;
    if (!identity(body.user) || body.user.id.toLowerCase() !== input.userId) return null;
    if (body.metrics !== null && !metrics(body.metrics, input.today)) return null;
  } else if (body.user !== null || body.can_view_nutrition || body.metrics !== null) return null;
  if (body.can_view_nutrition) {
    if (!body.can_view_profile || body.nutrition_unavailable_reason !== null ||
      (!body.is_own_profile && !acceptedActive) || !nutrition(body.nutrition, input)) return null;
  } else if (body.nutrition !== null || typeof body.nutrition_unavailable_reason !== 'string' ||
    !unavailable.has(body.nutrition_unavailable_reason)) return null;
  return body as unknown as ProfileResponseV2;
}
export function parseIdentityResponse(body: unknown, request: IdentityRequest): CommunityIdentitiesResponseV2 | null {
  if (!keys(body, ['response_version', 'request', 'users', 'unavailable_user_ids']) || body.response_version !== 2 ||
    !Array.isArray(body.users) || !body.users.every(discoveryIdentity) || !Array.isArray(body.unavailable_user_ids) ||
    !body.unavailable_user_ids.every(isId)) return null;
  const ids = body.users.map(user => user.id.toLowerCase());
  const unavailableIds = body.unavailable_user_ids.map(id => id.toLowerCase());
  if (new Set(ids).size !== ids.length || new Set(unavailableIds).size !== unavailableIds.length ||
    ids.some(id => unavailableIds.includes(id))) return null;
  if (request.mode === 'ids') {
    if (!keys(body.request, ['mode', 'user_ids']) || body.request.mode !== 'ids' ||
      !Array.isArray(body.request.user_ids) || body.request.user_ids.length !== request.user_ids.length ||
      body.request.user_ids.some((id, i) => id !== request.user_ids[i]) ||
      ids.length + unavailableIds.length !== request.user_ids.length ||
      [...ids, ...unavailableIds].some(id => !request.user_ids.includes(id))) return null;
  } else if (!keys(body.request, ['mode', 'q', 'limit']) || body.request.mode !== 'search' ||
    body.request.q !== request.q || body.request.limit !== request.limit ||
    ids.length > request.limit || unavailableIds.length !== 0) return null;
  return body as unknown as CommunityIdentitiesResponseV2;
}
