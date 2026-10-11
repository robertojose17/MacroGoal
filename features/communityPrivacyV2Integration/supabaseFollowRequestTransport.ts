import type { SupabaseClient } from '@supabase/supabase-js';
import type { FollowRequestRpcCall } from '../communityPrivacyV2/followRequestAdapter';
import type { VerifiedInboxClientSession } from '../communityPrivacyV2/supabaseInboxAuth';

const failure = () => ({ data: null, error: { code: 'INBOX_UNAVAILABLE' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Existing ordinary app client only. An explicit per-request header pins the user
 * JWT even if the global auth account changes while the SDK starts its fetch.
 * No credentials/configuration reads, secondary client, persistence, or retries. */
export function createSupabaseFollowRequestTransport({ client, getSession, timeoutMs = 10000, now = Date.now }: {
  client: Pick<SupabaseClient, 'rpc'>;
  getSession: () => Promise<VerifiedInboxClientSession | null>;
  timeoutMs?: number;
  now?: () => number;
}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new TypeError('Invalid inbox timeout.');

  return async function rpc(call: FollowRequestRpcCall): Promise<{ data: unknown; error: unknown }> {
    const started = Object.freeze({ ...call.session });
    const name = call.name;
    const args = Object.freeze({ ...call.args });
    const keys = Object.keys(args).sort().join(',');
    const validArgs = name === 'list_follow_request_inbox'
      ? keys === 'p_cursor,p_limit' && (args.p_cursor === null || (typeof args.p_cursor === 'string' && UUID.test(args.p_cursor))) &&
        typeof args.p_limit === 'number' && Number.isInteger(args.p_limit) && args.p_limit >= 1 && args.p_limit <= 50
      : keys === 'p_decision,p_expected_revision,p_request_id,p_requester_id' &&
        typeof args.p_request_id === 'string' && UUID.test(args.p_request_id) &&
        typeof args.p_requester_id === 'string' && UUID.test(args.p_requester_id) &&
        typeof args.p_expected_revision === 'string' && /^[1-9]\d{0,15}$/.test(args.p_expected_revision) &&
        BigInt(args.p_expected_revision) < 9007199254740991n && ['accept', 'reject'].includes(String(args.p_decision));
    if (call.signal.aborted || call.method !== 'POST' ||
      !['list_follow_request_inbox', 'respond_follow_request'].includes(name) || !validArgs ||
      !UUID.test(started.userId) || !started.sessionKey || started.isAnonymous !== false ||
      !started.accessToken || /[\s\u0000-\u001f\u007f]/.test(started.accessToken) ||
      !Number.isFinite(started.expiresAtSeconds) || started.expiresAtSeconds * 1000 <= now()) return failure();

    const request = new AbortController();
    let settled = false;
    let timeout: ReturnType<typeof setTimeout>;
    let finish!: (value: { data: unknown; error: unknown }) => void;
    const result = new Promise<{ data: unknown; error: unknown }>(resolve => {
      finish = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        call.signal.removeEventListener('abort', cancel);
        resolve(value);
      };
    });
    const cancel = () => { request.abort(); finish(failure()); };
    call.signal.addEventListener('abort', cancel, { once: true });
    timeout = setTimeout(cancel, timeoutMs);
    if (call.signal.aborted) cancel();

    const stillCurrent = async () => {
      const current = await getSession();
      return !settled && !request.signal.aborted && !!current && current.isAnonymous === false &&
        current.userId.toLowerCase() === started.userId.toLowerCase() && current.sessionKey === started.sessionKey &&
        current.expiresAtSeconds * 1000 > now() && started.expiresAtSeconds * 1000 > now();
    };
    void (async () => {
      try {
        if (!(await stillCurrent())) { finish(failure()); return; }
        // Supabase/PostgREST 2.83.0 preserves this explicit header; never rely on
        // the SDK's implicitly changing auth token for an owner-scoped operation.
        const response = await client.rpc(name, { ...args }, { get: false, head: false })
          .setHeader('Authorization', `Bearer ${started.accessToken}`)
          .abortSignal(request.signal);
        if (response.error || !(await stillCurrent())) { finish(failure()); return; }
        finish({ data: response.data, error: null });
      } catch { finish(failure()); }
    })();
    return result;
  };
}
