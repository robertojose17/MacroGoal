import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientSession } from './communityProfileApi';
import type { OutboundSession } from './outboundFollowAdapter';
import type { ProfilePostPage, SupplementContext, SupplementResult } from './profileSupplementTypes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failed = (): { ok: false } => ({ ok: false });
function exact(value: unknown, names: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
}
function validSession(value: ClientSession | null, expected: OutboundSession, now: number): value is ClientSession {
  return !!value && UUID.test(value.userId) && value.userId.toLowerCase() === expected.userId.toLowerCase() &&
    value.sessionKey === expected.sessionKey && value.isAnonymous === false && typeof value.accessToken === 'string' &&
    // eslint-disable-next-line no-control-regex
    !!value.accessToken && !/[\s\u0000-\u001f\u007f]/.test(value.accessToken) &&
    Number.isFinite(value.expiresAtSeconds) && value.expiresAtSeconds * 1000 > now;
}
/** Exact source-backed post projection. Never accepts media URLs, raw weight, galleries or author rows. */
export function parseProfilePostPage(raw: unknown, target: string, priorCursor: string | null): ProfilePostPage | null {
  if (!exact(raw, ['targetUserId', 'items', 'hasMore', 'nextCursor']) || raw.targetUserId !== target ||
    !Array.isArray(raw.items) || raw.items.length > 20 || typeof raw.hasMore !== 'boolean' ||
    !(raw.nextCursor === null || typeof raw.nextCursor === 'string' && raw.nextCursor.length > 0 && raw.nextCursor.length <= 160) ||
    (raw.hasMore ? raw.items.length !== 20 || raw.nextCursor === null || raw.nextCursor === priorCursor : raw.nextCursor !== null)) return null;
  const ids = new Set<string>();
  let previous: { stamp: string; id: string } | null = null;
  const items: ProfilePostPage['items'] = [];
  for (const row of raw.items) {
    const hasMedia = !!row && typeof row === 'object' && Object.hasOwn(row, 'shared_media_ids');
    if (!exact(row, hasMedia ? ['id', 'content', 'created_at', 'likes_count', 'post_type', 'shared_media_ids'] : ['id', 'content', 'created_at', 'likes_count', 'post_type']) || typeof row.id !== 'string' || !UUID.test(row.id) || row.id !== row.id.toLowerCase() || ids.has(row.id) ||
      !(row.content === null || typeof row.content === 'string' && row.content.length <= 100000) ||
      typeof row.created_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(row.created_at) || !Number.isFinite(Date.parse(row.created_at)) ||
      typeof row.likes_count !== 'number' || !Number.isSafeInteger(row.likes_count) || row.likes_count < 0 ||
      typeof row.post_type !== 'string' || row.post_type.length > 100) return null;
    const media = hasMedia ? row.shared_media_ids : undefined;
    if (hasMedia && (!Array.isArray(media) || media.length > 4 ||
      media.some(id => typeof id !== 'string' || !UUID.test(id) || id !== id.toLowerCase()) ||
      new Set(media).size !== media.length)) return null;
    const current = { stamp: row.created_at, id: row.id.toLowerCase() };
    if (previous && (current.stamp > previous.stamp || current.stamp === previous.stamp && current.id >= previous.id)) return null;
    previous = current; ids.add(row.id);
    items.push({ id: row.id, content: row.content, created_at: row.created_at, likes_count: row.likes_count, post_type: row.post_type, ...(hasMedia ? { shared_media_ids: [...media as string[]] } : {}) });
  }
  return { targetUserId: target, items, hasMore: raw.hasMore, nextCursor: raw.nextCursor };
}

/** Inert factory. Uses only the existing ordinary SDK client and verified captured user JWT. */
export function createProfileSupplementTransport({ client, getSession, timeoutMs = 10000, now = Date.now }: {
  client: Pick<SupabaseClient, 'rpc' | 'from'>;
  getSession(): Promise<ClientSession | null>;
  timeoutMs?: number; now?: () => number;
}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new TypeError('Invalid profile operation timeout.');
  function execute<T>(context: SupplementContext,
    run: (session: Readonly<ClientSession>, signal: AbortSignal) => PromiseLike<{ data: unknown; error: unknown }>,
    parse: (data: unknown, actorId: string) => T | null): Promise<SupplementResult<T>> {
    const expected = { ...context.session };
    const signal = context.signal;
    if (signal.aborted || !UUID.test(expected.userId) || !expected.sessionKey || !UUID.test(context.targetUserId)) return Promise.resolve(failed());
    const request = new AbortController();
    return new Promise(resolve => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = (value: SupplementResult<T>) => {
        if (settled) return; settled = true;
        if (timer !== null) clearTimeout(timer);
        signal.removeEventListener('abort', cancel); resolve(value);
      };
      const cancel = () => { request.abort(); finish(failed()); };
      signal.addEventListener('abort', cancel, { once: true }); timer = setTimeout(cancel, timeoutMs);
      if (signal.aborted) cancel();
      void (async () => {
        try {
          if (settled) return;
          const verified = await getSession();
          if (settled || !validSession(verified, expected, now())) { finish(failed()); return; }
          const started = Object.freeze({ ...verified });
          const result = await run(started, request.signal);
          if (settled) return;
          const current = await getSession();
          if (settled || result.error || !validSession(current, expected, now()) || started.expiresAtSeconds * 1000 <= now()) { finish(failed()); return; }
          const value = parse(result.data, started.userId.toLowerCase());
          finish(value === null ? failed() : { ok: true, value });
        } catch { finish(failed()); }
      })();
    });
  }
  return {
    posts(input: SupplementContext & { cursor: string | null }): Promise<SupplementResult<ProfilePostPage>> {
      const target = input.targetUserId.toLowerCase(), cursor = input.cursor;
      if (!(cursor === null || typeof cursor === 'string' && cursor.length > 0 && cursor.length <= 160)) return Promise.resolve(failed());
      return execute(input, (session, signal) => client.rpc('list_profile_posts_with_media', {
        p_target_id: target, p_limit: 20, p_cursor: cursor,
      }, { get: false, head: false }).setHeader('Authorization', `Bearer ${session.accessToken}`).abortSignal(signal),
      data => parseProfilePostPage(data, target, cursor));
    },
    block(input: SupplementContext): Promise<SupplementResult<{ blockerId: string; targetUserId: string }>> {
      const target = input.targetUserId.toLowerCase();
      if (input.session.userId.toLowerCase() === target) return Promise.resolve(failed());
      return execute(input, (session, signal) => client.from('blocked_users')
        .insert({ blocker_id: session.userId.toLowerCase(), blocked_id: target })
        .select('blocker_id,blocked_id')
        .setHeader('Authorization', `Bearer ${session.accessToken}`).abortSignal(signal).single(), (data, actorId) =>
        exact(data, ['blocker_id', 'blocked_id']) && data.blocker_id === actorId && data.blocked_id === target ?
          { blockerId: actorId, targetUserId: target } : null);
    },
  };
}
