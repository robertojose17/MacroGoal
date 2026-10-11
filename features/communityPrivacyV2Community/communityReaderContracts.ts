import type { DiscoveryIdentityDto } from '../communityPrivacyV2/profileContracts';
export type { DiscoveryIdentityDto };
export interface ReadScope { userId: string; sessionKey: string }
export type ReadResult<T> = { ok: true; value: T } | { ok: false };
export interface CommunityIdentity {
  id: string; username: string; name: string | null; full_name: string | null; avatar_url: string | null; user_type: null;
}
export interface CommunityReadPost extends Record<string, unknown> {
  id: string; user_id: string; content: string; created_at: string; author: CommunityIdentity;
  liked_by_me: boolean; saved_by_me: boolean;
  top_comment: { id: string; content: string; author: CommunityIdentity } | null;
}
export interface CommunityReadComment {
  id: string; post_id: string; user_id: string; content: string; created_at: string; author: CommunityIdentity;
}
export interface CommunityReadCommitment {
  id: string; user_id: string; partner_id: string; target_days: number; week_start: string;
  status: 'active' | 'pending' | 'completed'; partner: CommunityIdentity; requester: CommunityIdentity;
}
export interface WeeklyTracking {
  targetUserId: string; fromDate: string; toDate: string;
  consistency: { status: 'available'; score: number; noActivity: boolean } | { status: 'hidden' | 'unavailable' };
  tracking: { status: 'available'; mealDays: number; dayFlags: boolean[] } | { status: 'hidden' | 'unavailable' };
}
export interface OutboundRow {
  targetId: string; requestId: string | null; revision: string;
  state: 'none' | 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'revoked';
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function identity(value: DiscoveryIdentityDto): CommunityIdentity {
  return { id: value.id, username: value.username ?? '', name: value.name, full_name: value.full_name,
    avatar_url: value.avatar_url, user_type: null };
}
export function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
export function calendarDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null;
}
export function parseWeekly(raw: unknown, targetId: string, fromDate: string, toDate: string): WeeklyTracking | null {
  const from = calendarDate(fromDate), to = calendarDate(toDate);
  if (from === null || to === null) return null;
  const days = (to - from) / 86400000 + 1;
  if (!Number.isInteger(days) || days < 1 || days > 7 ||
    !exact(raw, ['targetUserId', 'fromDate', 'toDate', 'consistency', 'tracking']) ||
    raw.targetUserId !== targetId || raw.fromDate !== fromDate || raw.toDate !== toDate ||
    !object(raw.consistency) || !object(raw.tracking)) return null;
  const c = raw.consistency, t = raw.tracking;
  if (c.status === 'available') {
    if (!exact(c, ['status', 'score', 'noActivity']) || !Number.isSafeInteger(c.score) ||
      (c.score as number) < 0 || (c.score as number) > 100 || typeof c.noActivity !== 'boolean') return null;
  } else if (!exact(c, ['status']) || !['hidden', 'unavailable'].includes(String(c.status))) return null;
  if (t.status === 'available') {
    if (!exact(t, ['status', 'mealDays', 'dayFlags']) || !Number.isSafeInteger(t.mealDays) ||
      (t.mealDays as number) < 0 || (t.mealDays as number) > days || !Array.isArray(t.dayFlags) ||
      t.dayFlags.length !== days || t.dayFlags.some(value => typeof value !== 'boolean') ||
      t.dayFlags.filter(Boolean).length !== t.mealDays) return null;
  } else if (!exact(t, ['status']) || !['hidden', 'unavailable'].includes(String(t.status))) return null;
  return { targetUserId: targetId, fromDate, toDate,
    consistency: c.status === 'available' ? { status: 'available', score: c.score as number, noActivity: c.noActivity as boolean }
      : { status: c.status as 'hidden' | 'unavailable' },
    tracking: t.status === 'available' ? { status: 'available', mealDays: t.mealDays as number, dayFlags: [...t.dayFlags as boolean[]] }
      : { status: t.status as 'hidden' | 'unavailable' } };
}
