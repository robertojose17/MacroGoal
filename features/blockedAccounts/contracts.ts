export interface BlockedAccount { userId: string; displayName: string | null; username: string | null }
export interface BlockedPage { items: BlockedAccount[]; hasMore: boolean; nextCursor: string | null }
export interface BlockedSession { userId: string; sessionKey: string }
export interface BlockedContext { session: BlockedSession; signal: AbortSignal }
export type Result<T> = { ok: true; value: T } | { ok: false };
export interface BlockedTransport {
  list(input: BlockedContext & { cursor: string | null }): Promise<Result<BlockedPage>>;
  unblock(input: BlockedContext & { targetUserId: string }): Promise<Result<{ targetUserId: string; blocked: false }>>;
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const scopeKey = (session: BlockedSession) => `${session.userId}:${session.sessionKey}`;
