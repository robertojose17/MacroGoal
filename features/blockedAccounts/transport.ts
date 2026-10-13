import { UUID, type BlockedContext, type BlockedPage, type BlockedSession, type BlockedTransport, type Result } from './contracts';
import type { VerifiedInboxClientSession } from '../communityPrivacyV2/supabaseInboxAuth';
interface Request extends PromiseLike<{ data: unknown; error: unknown }> {
  setHeader(name: string, value: string): Request;
  abortSignal(signal: AbortSignal): Request;
}
export interface BlockedRpcClient { rpc(name: string, args: Record<string, unknown>, options: { get: false; head: false }): Request }
function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function label(value: unknown): value is string | null { return value === null || typeof value === 'string' && value.length <= 200; }
export function parseBlockedPage(raw: unknown, actor: string, cursor: string | null): BlockedPage | null {
  if (!exact(raw, ['items', 'hasMore', 'nextCursor']) || !Array.isArray(raw.items) || raw.items.length > 20 || typeof raw.hasMore !== 'boolean' ||
    !(raw.nextCursor === null || typeof raw.nextCursor === 'string' && UUID.test(raw.nextCursor))) return null;
  const items: BlockedPage['items'] = [];
  let previous = cursor;
  for (const item of raw.items) {
    if (!exact(item, ['userId', 'displayName', 'username']) || typeof item.userId !== 'string' || !UUID.test(item.userId) ||
      item.userId === actor || previous !== null && item.userId <= previous || !label(item.displayName) || !label(item.username)) return null;
    items.push({ userId: item.userId, displayName: item.displayName, username: item.username }); previous = item.userId;
  }
  if (raw.hasMore ? items.length !== 20 || raw.nextCursor !== previous : raw.nextCursor !== null) return null;
  return { items, hasMore: raw.hasMore, nextCursor: raw.nextCursor };
}
export function createBlockedTransport({ client, getSession, isCurrent, timeoutMs = 10000, now = Date.now }: {
  client: BlockedRpcClient; getSession(): Promise<VerifiedInboxClientSession | null>;
  isCurrent(session: BlockedSession): boolean; timeoutMs?: number; now?: () => number;
}): BlockedTransport {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new TypeError('Invalid operation timeout.');
  function valid(value: VerifiedInboxClientSession | null, expected: BlockedSession): value is VerifiedInboxClientSession {
    return !!value && isCurrent(expected) && UUID.test(value.userId) && value.userId === expected.userId && value.sessionKey === expected.sessionKey &&
      value.isAnonymous === false && value.expiresAtSeconds * 1000 > now() && typeof value.accessToken === 'string' &&
      value.accessToken.length > 0 && value.accessToken.length <= 16384 && !/[\s\u0000-\u001f\u007f]/.test(value.accessToken);
  }
  function execute<T>(input: BlockedContext, name: string, args: Record<string, unknown>, parse: (raw: unknown) => T | null): Promise<Result<T>> {
    const expected = { ...input.session };
    if (input.signal.aborted || !UUID.test(expected.userId) || !expected.sessionKey || !isCurrent(expected)) return Promise.resolve({ ok: false });
    const abort = new AbortController();
    return new Promise(resolve => {
      let done = false;
      const finish = (result: Result<T>) => { if (done) return; done = true; clearTimeout(timer); input.signal.removeEventListener('abort', cancel); resolve(result); };
      const cancel = () => { abort.abort(); finish({ ok: false }); };
      const timer = setTimeout(cancel, timeoutMs);
      input.signal.addEventListener('abort', cancel, { once: true });
      if (input.signal.aborted) cancel();
      void (async () => {
        try {
          const started = await getSession();
          if (done || !valid(started, expected)) { finish({ ok: false }); return; }
          const result = await client.rpc(name, args, { get: false, head: false })
            .setHeader('Authorization', `Bearer ${started.accessToken}`).abortSignal(abort.signal);
          if (done) return;
          const current = await getSession();
          if (done || result.error || !valid(current, expected) || started.expiresAtSeconds * 1000 <= now()) { finish({ ok: false }); return; }
          const parsed = parse(result.data); finish(parsed === null ? { ok: false } : { ok: true, value: parsed });
        } catch { finish({ ok: false }); }
      })();
    });
  }
  return {
    list(input) {
      if (!(input.cursor === null || UUID.test(input.cursor))) return Promise.resolve({ ok: false });
      return execute(input, 'list_my_blocked_accounts', { p_limit: 20, p_cursor: input.cursor }, raw => parseBlockedPage(raw, input.session.userId, input.cursor));
    },
    unblock(input) {
      if (!UUID.test(input.targetUserId) || input.targetUserId === input.session.userId) return Promise.resolve({ ok: false });
      return execute(input, 'unblock_my_account', { p_target_id: input.targetUserId }, raw =>
        exact(raw, ['targetUserId', 'blocked']) && raw.targetUserId === input.targetUserId && raw.blocked === false ?
          { targetUserId: input.targetUserId, blocked: false as const } : null);
    },
  };
}
