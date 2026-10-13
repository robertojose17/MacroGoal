import type { DiscoveryIdentityDto } from './profileContracts';
import type { OutboundSession } from './outboundFollowAdapter';
export type ConnectionDirection = 'followers' | 'following';
export interface SelectedProfilePost {
  id: string; content: string | null; created_at: string; likes_count: number; post_type: string;
  /** Server-vetted post-bound derivatives only; never original paths or URLs. */
  shared_media_ids?: string[];
}
export interface ProfilePostPage {
  targetUserId: string; items: SelectedProfilePost[]; hasMore: boolean; nextCursor: string | null;
}
export type SupplementResult<T> = { ok: true; value: T } | { ok: false };
export interface SupplementContext { session: OutboundSession; targetUserId: string; signal: AbortSignal }
export interface ProfileSupplementAdapter {
  connections(input: SupplementContext & { direction: ConnectionDirection }): Promise<SupplementResult<{
    targetUserId: string; direction: ConnectionDirection; items: DiscoveryIdentityDto[];
  }>>;
  posts(input: SupplementContext & { cursor: string | null }): Promise<SupplementResult<ProfilePostPage>>;
  block(input: SupplementContext): Promise<SupplementResult<{ blockerId: string; targetUserId: string }>>;
  invalidate(): void;
}
export interface ProfileConnectionsState {
  direction: ConnectionDirection | null; status: 'idle' | 'loading' | 'ready' | 'error'; items: DiscoveryIdentityDto[];
}
export interface ProfilePostsState {
  status: 'idle' | 'loading' | 'ready' | 'error'; items: SelectedProfilePost[]; nextCursor: string | null; loadingMore: boolean;
}
