/** Local additive candidate: one instance per independently displayed read surface. */
import { PAGE_SIZE, UUID, canonicalId, exact, normalizedQuery, parseIdentity, sameSession,
  safeFailureKind, validExpected, validSession } from './compatibilityContracts';
import type { AcceptedConnections, ClientSession, CompatibilityContext, CompatibilityDependencies, CompatibilityDirection,
  CompatibilityFailureKind, CompatibilityResult, CompatibilityRpcCall, DiscoveredIdentities, DiscoveryIdentityDto, SearchIdentities, VisiblePostAuthor, VisiblePostAuthors } from './compatibilityContracts';
export type { CompatibilitySession, CompatibilityDirection, CompatibilityDependencies, CompatibilityResult,
  AcceptedConnections, DiscoveredIdentities, DiscoveryIdentityDto, SearchIdentities, VisiblePostAuthor, VisiblePostAuthors } from './compatibilityContracts';

class ReadFailure extends Error {
  kind: CompatibilityFailureKind;
  constructor(kind: CompatibilityFailureKind) { super(kind); this.kind = kind; }
}
const fail = <T>(kind: CompatibilityFailureKind): CompatibilityResult<T> => ({ ok: false, error: { kind } });
export function createCommunityCompatibilityReader(deps: CompatibilityDependencies) {
  const timeoutMs = deps.timeoutMs ?? 10000, maxItems = deps.maxItems ?? 1000, now = deps.now ?? Date.now;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000 || !Number.isInteger(maxItems) || maxItems < 1 || maxItems > 5000) {
    throw new TypeError('Invalid compatibility operation limits.');
  }
  let current: { cancel(kind: CompatibilityFailureKind): void } | null = null;
  function invalidate() {
    current?.cancel('stale'); current = null;
    deps.onInvalidate();
  }
  function run<T>(context: CompatibilityContext, work: (rpc: (request: RequestSpec) => Promise<unknown>) => Promise<T>): Promise<CompatibilityResult<T>> {
    try { invalidate(); } catch { return Promise.resolve(fail('unavailable')); }
    if (!context || !context.signal || !validExpected(context.session)) return Promise.resolve(fail('invalid_input'));
    const signal = context.signal;
    const expected = Object.freeze({ userId: canonicalId(context.session.userId)!, sessionKey: context.session.sessionKey });
    if (signal.aborted) return Promise.resolve(fail('aborted'));
    const request = new AbortController();
    let settled = false, timer: ReturnType<typeof setTimeout>;
    let finish!: (result: CompatibilityResult<T>) => void;
    const result = new Promise<CompatibilityResult<T>>(resolve => {
      finish = value => {
        if (settled) return;
        settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
        if (current === operation) current = null;
        resolve(value);
      };
    });
    const operation = { cancel(kind: CompatibilityFailureKind) { request.abort(); finish(fail(kind)); } };
    const abort = () => { operation.cancel('aborted'); try { deps.onInvalidate(); } catch { /* fail closed */ } };
    current = operation;
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => operation.cancel('timeout'), timeoutMs);
    if (signal.aborted) abort();
    async function auth(): Promise<Readonly<ClientSession>> {
      if (settled || request.signal.aborted) throw new ReadFailure('stale');
      let session: ClientSession | null;
      try { session = await deps.getSession(); } catch { throw new ReadFailure('unavailable'); }
      if (settled || request.signal.aborted) throw new ReadFailure('stale');
      if (!validSession(session, now())) throw new ReadFailure('unauthenticated');
      if (!sameSession(session, expected)) throw new ReadFailure('stale');
      return Object.freeze({ userId: canonicalId(session.userId)!, sessionKey: session.sessionKey,
        accessToken: session.accessToken, isAnonymous: false, expiresAtSeconds: session.expiresAtSeconds });
    }
    const rpc = async (spec: RequestSpec): Promise<unknown> => {
      const session = await auth();
      const response = await deps.rpc({ ...spec, method: 'POST', session, signal: request.signal } as CompatibilityRpcCall);
      await auth();
      if (response.error) throw new ReadFailure(safeFailureKind(response.error));
      return response.data;
    };
    void (async () => {
      try { await auth(); const value = await work(rpc); await auth(); finish({ ok: true, value }); }
      catch (error) { finish(fail(error instanceof ReadFailure ? error.kind : 'unavailable')); }
    })();
    return result;
  }
  type RequestSpec = CompatibilityRpcCall extends infer C ? C extends CompatibilityRpcCall ? Pick<C, 'name' | 'args'> : never : never;
  function rows(raw: unknown, after: string | null, limit: number, requested?: Set<string>): DiscoveryIdentityDto[] {
    if (!Array.isArray(raw) || raw.length > limit) throw new ReadFailure('invalid_response');
    let previous = after;
    return raw.map(rawItem => {
      const item = parseIdentity(rawItem);
      if (!item || (previous !== null && item.id <= previous) || (requested && !requested.has(item.id))) throw new ReadFailure('invalid_response');
      previous = item.id; return item;
    });
  }
  async function traverse(rpc: (request: RequestSpec) => Promise<unknown>, spec: { query: string } | { targetUserId: string; direction: CompatibilityDirection }) {
    let cursor: string | null = null;
    const items: DiscoveryIdentityDto[] = [];
    for (;;) {
      const raw = 'query' in spec
        ? await rpc({ name: 'search_profile_identities', args: { p_query: spec.query, p_limit: PAGE_SIZE, p_after_id: cursor } })
        : await rpc({ name: 'list_accepted_profile_connections', args: { p_target_id: spec.targetUserId, p_direction: spec.direction, p_limit: PAGE_SIZE, p_after_id: cursor } });
      if (!exact(raw, 'query' in spec ? ['query', 'items', 'hasMore', 'nextCursor'] : ['targetUserId', 'direction', 'items', 'hasMore', 'nextCursor']) ||
        ('query' in spec ? raw.query !== spec.query : raw.targetUserId !== spec.targetUserId || raw.direction !== spec.direction) ||
        typeof raw.hasMore !== 'boolean') throw new ReadFailure('invalid_response');
      const page = rows(raw.items, cursor, PAGE_SIZE);
      if (raw.hasMore ? page.length !== PAGE_SIZE || typeof raw.nextCursor !== 'string' || !UUID.test(raw.nextCursor) || raw.nextCursor !== page.at(-1)?.id : raw.nextCursor !== null) {
        throw new ReadFailure('invalid_response');
      }
      if (items.length + page.length > maxItems || (raw.hasMore && items.length + page.length >= maxItems)) throw new ReadFailure('limit_exceeded');
      items.push(...page);
      if (!raw.hasMore) return items;
      cursor = raw.nextCursor as string;
    }
  }
  return {
    invalidate,
    search(input: CompatibilityContext & { query: string }): Promise<CompatibilityResult<SearchIdentities>> {
      const query = normalizedQuery(input?.query);
      return run(input, async rpc => {
        if (query === null) throw new ReadFailure('invalid_input');
        return { query, items: await traverse(rpc, { query }) };
      });
    },
    connections(input: CompatibilityContext & { targetUserId: string; direction: CompatibilityDirection }): Promise<CompatibilityResult<AcceptedConnections>> {
      const targetUserId = canonicalId(input?.targetUserId), direction = input?.direction;
      return run(input, async rpc => {
        if (!targetUserId || (direction !== 'followers' && direction !== 'following')) throw new ReadFailure('invalid_input');
        return { targetUserId, direction, items: await traverse(rpc, { targetUserId, direction }) };
      });
    },
    postAuthors(input: CompatibilityContext & { postIds: readonly string[] }): Promise<CompatibilityResult<VisiblePostAuthors>> {
      const ids = Array.isArray(input?.postIds) && input.postIds.length <= maxItems ? input.postIds.map(canonicalId) : null;
      return run(input, async rpc => {
        if (!ids || ids.some(id => id === null) || new Set(ids).size !== ids.length) throw new ReadFailure('invalid_input');
        const ordered = (ids as string[]).sort(), items: VisiblePostAuthor[] = [];
        for (let offset = 0; offset < ordered.length; offset += PAGE_SIZE) {
          const chunk = ordered.slice(offset, offset + PAGE_SIZE), requested = new Set(chunk);
          const raw = await rpc({ name: 'visible_post_authors', args: { p_post_ids: Object.freeze(chunk) } });
          if (!exact(raw, ['items']) || !Array.isArray(raw.items) || raw.items.length > chunk.length) throw new ReadFailure('invalid_response');
          let previous: string | null = null;
          for (const row of raw.items) {
            if (!exact(row, ['postId', 'identity']) || typeof row.postId !== 'string' || !UUID.test(row.postId) ||
              !requested.has(row.postId) || (previous !== null && row.postId <= previous) ||
              !exact(row.identity, ['id', 'username', 'name', 'full_name', 'avatar_url', 'is_premium']) || typeof row.identity.is_premium !== 'boolean') {
              throw new ReadFailure('invalid_response');
            }
            const { is_premium, ...discovery } = row.identity;
            const identity = parseIdentity(discovery);
            if (!identity) throw new ReadFailure('invalid_response');
            items.push({ postId: row.postId, identity: { ...identity, is_premium } });
            previous = row.postId;
          }
        }
        const found = new Set(items.map(item => item.postId));
        return { items, unavailablePostIds: ordered.filter(id => !found.has(id)) };
      });
    },
    discover(input: CompatibilityContext & { ids: readonly string[] }): Promise<CompatibilityResult<DiscoveredIdentities>> {
      const ids = Array.isArray(input?.ids) && input.ids.length <= maxItems ? input.ids.map(canonicalId) : null;
      return run(input, async rpc => {
        if (!ids || ids.some(id => id === null) || new Set(ids).size !== ids.length) throw new ReadFailure('invalid_input');
        const ordered = (ids as string[]).sort(), items: DiscoveryIdentityDto[] = [];
        for (let offset = 0; offset < ordered.length; offset += PAGE_SIZE) {
          const chunk = ordered.slice(offset, offset + PAGE_SIZE);
          const raw = await rpc({ name: 'discover_profiles', args: { p_ids: Object.freeze(chunk) } });
          items.push(...rows(raw, null, chunk.length, new Set(chunk)));
        }
        const found = new Set(items.map(item => item.id));
        return { items, unavailableIds: ordered.filter(id => !found.has(id)) };
      });
    },
  };
}
