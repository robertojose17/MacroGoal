/** Local additive candidate. Factories are inert; no application activation. */
import type { ClientSession } from '../communityPrivacyV2/communityProfileApi';
import type { DiscoveryIdentityDto } from '../communityPrivacyV2/profileContracts';
export type { ClientSession, DiscoveryIdentityDto };
export interface CompatibilitySession { userId: string; sessionKey: string }
export type CompatibilityDirection = 'followers' | 'following';
export type CompatibilityFailureKind = 'invalid_input' | 'unauthenticated' | 'unavailable' |
  'invalid_response' | 'aborted' | 'stale' | 'limit_exceeded' | 'timeout';
export type CompatibilityResult<T> = { ok: true; value: T } | { ok: false; error: { kind: CompatibilityFailureKind } };
export type CompatibilityRpcCall = {
  method: 'POST'; session: Readonly<ClientSession>; signal: AbortSignal;
} & (
  { name: 'discover_profiles'; args: { p_ids: readonly string[] } } |
  { name: 'visible_post_authors'; args: { p_post_ids: readonly string[] } } |
  { name: 'search_profile_identities'; args: { p_query: string; p_limit: number; p_after_id: string | null } } |
  { name: 'list_accepted_profile_connections'; args: { p_target_id: string; p_direction: CompatibilityDirection; p_limit: number; p_after_id: string | null } }
);
export type CompatibilityRpc = (call: CompatibilityRpcCall) => Promise<{ data: unknown; error: unknown }>;
export interface CompatibilityContext { session: CompatibilitySession; signal: AbortSignal }
export interface CompatibilityDependencies {
  getSession(): Promise<ClientSession | null>;
  rpc: CompatibilityRpc;
  /** Synchronously clear the surface's old rows on start, invalidation, and cancellation. */
  onInvalidate(): void;
  /** Whole-operation deadline, including every auth check and every page. Default 10 seconds. */
  timeoutMs?: number;
  /** Complete-result limit (default 1000, maximum 5000). Overflow is failure, never truncation. */
  maxItems?: number;
  now?: () => number;
}
export interface SearchIdentities { query: string; items: DiscoveryIdentityDto[] }
export interface DiscoveredIdentities { items: DiscoveryIdentityDto[]; unavailableIds: string[] }
/** Only this separately authorized real-post context may carry a presentation badge. */
export interface VisiblePostAuthor { postId: string; identity: DiscoveryIdentityDto & { is_premium: boolean } }
export interface VisiblePostAuthors { items: VisiblePostAuthor[]; unavailablePostIds: string[] }
export interface AcceptedConnections { targetUserId: string; direction: CompatibilityDirection; items: DiscoveryIdentityDto[] }
export const PAGE_SIZE = 50;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function canonicalId(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value.toLowerCase()) ? value.toLowerCase() : null;
}
export function exact(value: unknown, names: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === names.length &&
    names.every(k => Object.hasOwn(value, k));
}
export function normalizedQuery(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64 || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return null;
  // SQL btrim(text) removes ASCII spaces; do not silently change Unicode query semantics.
  const query = value.replace(/^ +| +$/g, '');
  return query.length >= 2 ? query : null;
}
export function validSession(value: ClientSession | null, now: number): value is ClientSession {
  return !!value && canonicalId(value.userId) !== null && value.isAnonymous === false &&
    typeof value.sessionKey === 'string' && value.sessionKey.length > 0 && value.sessionKey.length <= 256 &&
    typeof value.accessToken === 'string' && value.accessToken.length > 0 && value.accessToken.length <= 8192 &&
    !/[\s\u0000-\u001f\u007f]/.test(value.accessToken) && Number.isFinite(value.expiresAtSeconds) && value.expiresAtSeconds * 1000 > now;
}
export function validExpected(value: CompatibilitySession): boolean {
  return !!value && canonicalId(value.userId) !== null && typeof value.sessionKey === 'string' &&
    value.sessionKey.length > 0 && value.sessionKey.length <= 256;
}
export function sameSession(a: CompatibilitySession, b: CompatibilitySession): boolean {
  return canonicalId(a.userId) === canonicalId(b.userId) && a.sessionKey === b.sessionKey;
}
export function safeFailureKind(error: unknown): CompatibilityFailureKind {
  if (error && typeof error === 'object' && 'code' in error &&
    ['28000', 'PGRST301', '42501'].includes(String(error.code))) return 'unauthenticated';
  return 'unavailable';
}
export function parseIdentity(raw: unknown): DiscoveryIdentityDto | null {
  if (!exact(raw, ['id', 'username', 'name', 'full_name', 'avatar_url']) ||
    typeof raw.id !== 'string' || !UUID.test(raw.id)) return null;
  const text = (v: unknown, limit: number) => v === null || (typeof v === 'string' && v.length <= limit && !/[\u0000-\u001f\u007f-\u009f]/.test(v));
  if (!text(raw.username, 100) || !text(raw.name, 200) || !text(raw.full_name, 200) || raw.name !== raw.full_name) return null;
  const avatar = `https://esgptfiofoaeguslgvcq.supabase.co/storage/v1/object/public/avatars/${raw.id}/avatar.jpg`;
  if (raw.avatar_url !== null && raw.avatar_url !== avatar) return null;
  return { id: raw.id, username: raw.username as string | null, name: raw.name as string | null,
    full_name: raw.full_name as string | null, avatar_url: raw.avatar_url as string | null };
}
export function validRpcCall(call: CompatibilityRpcCall): boolean {
  if (!call || call.method !== 'POST') return false;
  const args: unknown = call.args;
  if (call.name === 'discover_profiles') return exact(args, ['p_ids']) && Array.isArray(args.p_ids) && args.p_ids.length <= PAGE_SIZE &&
    args.p_ids.every((id: unknown) => typeof id === 'string' && UUID.test(id)) && new Set(args.p_ids).size === args.p_ids.length;
  if (call.name === 'visible_post_authors') return exact(args, ['p_post_ids']) && Array.isArray(args.p_post_ids) && args.p_post_ids.length <= PAGE_SIZE &&
    args.p_post_ids.every((id: unknown) => typeof id === 'string' && UUID.test(id)) && new Set(args.p_post_ids).size === args.p_post_ids.length;
  if (call.name !== 'search_profile_identities' && call.name !== 'list_accepted_profile_connections') return false;
  if (!exact(args, call.name === 'search_profile_identities' ? ['p_query', 'p_limit', 'p_after_id'] : ['p_target_id', 'p_direction', 'p_limit', 'p_after_id']) ||
    typeof args.p_limit !== 'number' || !Number.isInteger(args.p_limit) || args.p_limit < 1 || args.p_limit > PAGE_SIZE ||
    !(args.p_after_id === null || (typeof args.p_after_id === 'string' && UUID.test(args.p_after_id)))) return false;
  return call.name === 'search_profile_identities'
    ? normalizedQuery(args.p_query) === args.p_query && args.p_query !== null
    : typeof args.p_target_id === 'string' && UUID.test(args.p_target_id) && (args.p_direction === 'followers' || args.p_direction === 'following');
}
