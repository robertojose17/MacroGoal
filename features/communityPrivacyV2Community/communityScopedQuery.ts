import type { ClientSession } from '../communityPrivacyV2/communityProfileApi';
import type { ReadResult, ReadScope } from './communityReaderContracts';
/** Every table/RPC operation uses the captured verified user JWT and a bounded
 * request. This helper has no client, listener, timer or network side effect until called. */
export function createCommunityScopedQuery(getSession: () => Promise<ClientSession | null>, timeoutMs = 10000) {
  return function query<T>(scope: ReadScope, signal: AbortSignal,
    operation: (session: Readonly<ClientSession>, signal: AbortSignal) => PromiseLike<{ data: T | null; error: unknown }>): Promise<ReadResult<T>> {
    if (signal.aborted) return Promise.resolve({ ok: false });
    const expected = { userId: scope.userId, sessionKey: scope.sessionKey };
    const request = new AbortController();
    return new Promise(resolve => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = (value: ReadResult<T>) => {
        if (settled) return; settled = true;
        if (timer !== null) clearTimeout(timer);
        signal.removeEventListener('abort', cancel); resolve(value);
      };
      const cancel = () => { request.abort(); finish({ ok: false }); };
      signal.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(cancel, timeoutMs);
      const live = async () => {
        const session = await getSession();
        return !settled && !request.signal.aborted && session?.isAnonymous === false &&
          session.userId === expected.userId && session.sessionKey === expected.sessionKey &&
          session.expiresAtSeconds * 1000 > Date.now() && session.accessToken &&
          // eslint-disable-next-line no-control-regex
          !/[\s\u0000-\u001f\u007f]/.test(session.accessToken) ? Object.freeze({ ...session }) : null;
      };
      if (signal.aborted) cancel();
      void (async () => {
        try {
          const session = await live();
          if (!session) { finish({ ok: false }); return; }
          const response = await operation(session, request.signal);
          if (response.error || response.data === null || !(await live()) || session.expiresAtSeconds * 1000 <= Date.now()) {
            finish({ ok: false }); return;
          }
          finish({ ok: true, value: response.data });
        } catch { finish({ ok: false }); }
      })();
    });
  };
}
