/** Inert binding for the existing ordinary Supabase client. No new client or credentials. */
import { sameSession, validRpcCall, validSession } from './compatibilityContracts';
import type { ClientSession, CompatibilityRpc, CompatibilityRpcCall } from './compatibilityContracts';
/** Structural SDK 2.83.0 seam: checked against the actual installed SDK in tests. */
export interface CompatibilitySdkClient {
  rpc(name: string, args: Record<string, unknown>, options: { get: false; head: false }):
    PromiseLike<{ data: unknown; error: unknown }> & {
      setHeader(name: string, value: string): { abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }> };
    };
}
const failure = () => ({ data: null, error: { code: 'COMPATIBILITY_UNAVAILABLE' } });
export function createSupabaseCompatibilityTransport({ client, getSession, timeoutMs = 10000, now = Date.now }: {
  client: CompatibilitySdkClient;
  getSession(): Promise<ClientSession | null>;
  timeoutMs?: number;
  now?: () => number;
}): CompatibilityRpc {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new TypeError('Invalid compatibility timeout.');
  return async (call: CompatibilityRpcCall) => {
    if (!call?.signal || call.signal.aborted || !validRpcCall(call) || !validSession(call.session, now())) return failure();
    const externalSignal = call.signal;
    const started = Object.freeze({ ...call.session }), name = call.name;
    const args = call.name === 'discover_profiles'
      ? Object.freeze({ p_ids: Object.freeze([...call.args.p_ids]) })
      : call.name === 'visible_post_authors' ? Object.freeze({ p_post_ids: Object.freeze([...call.args.p_post_ids]) }) : Object.freeze({ ...call.args });
    const request = new AbortController();
    let settled = false, timer: ReturnType<typeof setTimeout>;
    let finish!: (value: { data: unknown; error: unknown }) => void;
    const result = new Promise<{ data: unknown; error: unknown }>(resolve => {
      finish = value => {
        if (settled) return;
        settled = true; clearTimeout(timer); externalSignal.removeEventListener('abort', cancel); resolve(value);
      };
    });
    const cancel = () => { request.abort(); finish(failure()); };
    externalSignal.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(cancel, timeoutMs);
    if (externalSignal.aborted) cancel();
    async function current() {
      const value = await getSession();
      return !settled && !request.signal.aborted && validSession(started, now()) && validSession(value, now()) && sameSession(started, value);
    }
    void (async () => {
      try {
        if (!(await current())) { finish(failure()); return; }
        // A request-local explicit JWT survives SDK/global account changes. Never set a global auth header.
        const response = await client.rpc(name, { ...args }, { get: false, head: false })
          .setHeader('Authorization', `Bearer ${started.accessToken}`).abortSignal(request.signal);
        if (!(await current())) { finish(failure()); return; }
        if (response.error) {
          const error = response.error as { code?: unknown };
          finish({ data: null, error: { code: ['28000', 'PGRST301', '42501'].includes(String(error.code)) ? String(error.code) : 'COMPATIBILITY_UNAVAILABLE' } });
          return;
        }
        finish({ data: response.data, error: null });
      } catch { finish(failure()); }
    })();
    return result;
  };
}
