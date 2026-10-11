import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientSession } from '../communityPrivacyV2/communityProfileApi';
import { createSupabaseOutboundFollowTransport } from '../communityPrivacyV2/supabaseOutboundFollowTransport';
import { createCommunityScopedQuery } from './communityScopedQuery';
import { UUID, object } from './communityReaderContracts';
import type { OutboundRow, ReadResult, ReadScope } from './communityReaderContracts';
import type { CommunityReaderClient } from './communityReaderClient';
const fail = <T>(): ReadResult<T> => ({ ok: false });
const key = (scope: ReadScope, target: string) => JSON.stringify([scope.userId, scope.sessionKey, target]);
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 1;
/** Participant-only descriptors are mutation freshness metadata, NEVER profile
 * authorization. Accepted directory membership comes from the canonical RPC. */
export function createCommunityOutboundClient({ client, getSession, readers }: {
  client: Pick<SupabaseClient, 'from' | 'rpc'>;
  getSession(): Promise<ClientSession | null>;
  readers: CommunityReaderClient;
}) {
  const run = createCommunityScopedQuery(getSession);
  const rpc = createSupabaseOutboundFollowTransport({ client, getSession });
  const observed = new Map<string, OutboundRow>();
  const busy = new Set<string>();
  let generation = 0;
  function invalidate() { generation += 1; observed.clear(); }
  async function read(scope: ReadScope, signal: AbortSignal, targetIds: string[]): Promise<ReadResult<OutboundRow[]>> {
    invalidate(); const mine = generation;
    const ids = [...new Set(targetIds)];
    if (ids.length > 1000 || ids.some(id => !UUID.test(id) || id === scope.userId)) return fail();
    const discovered = await readers.discover(scope, signal, ids);
    if (!discovered.ok || signal.aborted || mine !== generation) return fail();
    const allowed = ids.filter(id => discovered.value.has(id));
    const relationships = new Map<string, OutboundRow>();
    const requestIds = new Set<string>();
    for (let offset = 0; offset < allowed.length; offset += 50) {
      const batch = allowed.slice(offset, offset + 50);
      const result = await run(scope, signal, (session, abort) => client.from('follow_requests')
        .select('id,requester_id,owner_id,state,revision').eq('requester_id', session.userId).in('owner_id', batch)
        .limit(51).setHeader('Authorization', `Bearer ${session.accessToken}`).abortSignal(abort));
      if (!result.ok || !Array.isArray(result.value) || result.value.length > batch.length || signal.aborted || mine !== generation) return fail();
      for (const row of result.value as unknown[]) {
        if (!object(row) || Object.keys(row).sort().join(',') !== 'id,owner_id,requester_id,revision,state' ||
          typeof row.id !== 'string' || !UUID.test(row.id) || row.requester_id !== scope.userId ||
          typeof row.owner_id !== 'string' || !batch.includes(row.owner_id) || relationships.has(row.owner_id) || requestIds.has(row.id) ||
          !revision(row.revision) || !['pending', 'accepted', 'rejected', 'cancelled', 'revoked'].includes(String(row.state))) return fail();
        requestIds.add(row.id);
        relationships.set(row.owner_id, { targetId: row.owner_id, requestId: row.id, revision: String(row.revision), state: row.state as OutboundRow['state'] });
      }
    }
    if (signal.aborted || mine !== generation) return fail();
    const values = allowed.map(targetId => relationships.get(targetId) ?? { targetId, requestId: null, revision: '0', state: 'none' as const });
    for (const row of values) observed.set(key(scope, row.targetId), { ...row });
    return { ok: true, value: values };
  }
  async function change(scope: ReadScope, signal: AbortSignal, row: OutboundRow): Promise<{ confirmed: boolean; row: OutboundRow | null }> {
    const scopeKey = key(scope, row.targetId), current = observed.get(scopeKey);
    const action = row.state === 'pending' ? 'cancel' : row.state === 'accepted' ? 'unfollow' : 'request';
    if (signal.aborted || busy.has(scopeKey) || !current || current.requestId !== row.requestId ||
      current.revision !== row.revision || current.state !== row.state || !UUID.test(row.targetId)) return { confirmed: false, row: null };
    busy.add(scopeKey); invalidate();
    try {
      const session = await getSession();
      if (!session || session.userId !== scope.userId || session.sessionKey !== scope.sessionKey || signal.aborted) return { confirmed: false, row: null };
      const result = await rpc({ name: 'change_outbound_follow', method: 'POST', session: Object.freeze({ ...session }), signal,
        args: { p_target_id: row.targetId, p_request_id: row.requestId, p_expected_revision: row.revision, p_action: action } });
      let confirmed = false;
      const raw = result.data;
      if (!result.error && object(raw) && Object.keys(raw).sort().join(',') === 'action,follow_request,previousRevision,requesterUserId,targetUserId' &&
        raw.requesterUserId === scope.userId && raw.targetUserId === row.targetId && raw.action === action &&
        typeof raw.previousRevision === 'string' && /^(0|[1-9]\d{0,15})$/.test(raw.previousRevision) &&
        BigInt(raw.previousRevision) <= 9007199254740991n && object(raw.follow_request)) {
        const d = raw.follow_request;
        if (Object.keys(d).sort().join(',') === 'request_id,revision,state' && typeof d.request_id === 'string' && UUID.test(d.request_id) &&
          (row.requestId === null || d.request_id === row.requestId) && typeof d.revision === 'string' && /^[1-9]\d{0,15}$/.test(d.revision) &&
          BigInt(d.revision) <= 9007199254740991n) {
          const previous = BigInt(raw.previousRevision), expected = BigInt(row.revision), next = BigInt(d.revision);
          confirmed = action === 'request'
            ? (d.state === 'pending' && previous === expected && next === previous + 1n) ||
              (['pending', 'accepted'].includes(String(d.state)) && previous >= expected && previous > 0n && next === previous)
            : previous === expected && next === previous + 1n && d.state === (action === 'cancel' ? 'cancelled' : 'revoked');
        }
      }
      // Unknown outcomes get one fresh status read, never another mutation.
      const fresh = await read(scope, signal, [row.targetId]);
      return { confirmed, row: fresh.ok ? fresh.value.find(item => item.targetId === row.targetId) ?? null : null };
    } catch { return { confirmed: false, row: null }; }
    finally { busy.delete(scopeKey); }
  }
  return { read, change, invalidate };
}
