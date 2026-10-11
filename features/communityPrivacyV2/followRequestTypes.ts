/** UI boundary only. The API adapter must validate/allowlist its wire response first. */
export interface InboxSession {
  userId: string;
  /** Non-secret auth generation. New on sign-out/sign-in/account switch, including same user. */
  sessionKey: string;
}
export interface FollowRequestIdentity {
  requestId: string;
  requesterId: string;
  /** Lossless positive decimal bigint string, never a JavaScript number. */
  revision: string;
  displayName: string | null;
  username: string | null;
  /** Already-vetted public discovery avatar URL, or null. No private/signed health media. */
  avatarUrl: string | null;
}
export type FollowDecision = 'accept' | 'reject';
export interface FollowRequestPage {
  ownerUserId: string;
  items: readonly FollowRequestIdentity[];
  totalPending: number;
  nextCursor: string | null;
}
export interface FollowRequestConfirmation {
  ownerUserId: string;
  requestId: string;
  requesterId: string;
  previousRevision: string;
  revision: string;
  state: 'accepted' | 'rejected';
}
/** A thrown error or ok:false is deliberately generic; response bodies must never reach UI/logs. */
export type InboxResult<T> = { ok: true; value: T } | { ok: false };
export interface FollowRequestAdapter {
  list(input: { session: InboxSession; cursor: string | null; signal: AbortSignal }): Promise<InboxResult<FollowRequestPage>>;
  respond(input: {
    session: InboxSession;
    requestId: string;
    requesterId: string;
    expectedRevision: string;
    decision: FollowDecision;
    signal: AbortSignal;
  }): Promise<InboxResult<FollowRequestConfirmation>>;
}
export interface InboxSnapshot {
  scopeKey: string | null;
  visible: boolean;
  status: 'idle' | 'loading' | 'ready' | 'error';
  items: readonly FollowRequestIdentity[];
  totalPending: number | null;
  nextCursor: string | null;
  loadingMore: boolean;
  moreError: boolean;
  pending: Readonly<Record<string, FollowDecision>>;
  rowErrors: Readonly<Record<string, true>>;
  announcement: 'accepted' | 'rejected' | null;
}
