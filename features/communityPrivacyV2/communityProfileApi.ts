/** Local migration draft. Deliberately not imported by any application route. */
import type { ProfileResponseV2, PublicIdentityDto } from './profileContracts';
import type { ProfileInput, IdentityInput, CommunityIdentitiesResponseV2 } from './clientContracts';
import { parseProfileResponse, parseIdentityResponse, validateProfileInput, validateIdentityInput } from './responseValidation';

export type { ProfileResponseV2, PublicIdentityDto } from './profileContracts';
export type { ProfileInput, IdentityInput, IdentityRequest, DiscoveryIdentityDto, CommunityIdentitiesResponseV2 } from './clientContracts';
export { MAX_IDENTITY_IDS, MAX_IDENTITY_SEARCH_RESULTS } from './clientContracts';

/** sessionKey is a non-secret auth generation, changed on sign-out/sign-in/account switch.
 * It must NOT be a token, and must not be reused if the same account signs back in.
 * A token refresh alone may retain it. An auth-state subscription owns this key. */
export interface ClientSession {
  userId: string;
  accessToken: string;
  sessionKey: string;
  isAnonymous: false;
  expiresAtSeconds: number;
}
export type FailureKind = 'invalid_input' | 'unauthenticated' | 'session_unavailable' |
  'forbidden' | 'not_found' | 'rate_limited' | 'network' | 'server' |
  'invalid_response' | 'aborted' | 'stale_response';
export type ApiResult<T> = { ok: true; value: T } | {
  ok: false; error: { kind: FailureKind; retryable: boolean; status?: number };
};
export interface ClientDependencies {
  /** Explicit trusted configuration, e.g. the existing exported SUPABASE_PROJECT_URL + /functions/v1. */
  functionsBaseUrl: string;
  /** Explicit protected-branch selection. Omission preserves the existing route. */
  profileRoute?: 'social-profile' | 'community-profile';
  getSession: () => Promise<ClientSession | null>;
  fetch: typeof globalThis.fetch;
  now?: () => number;
}
export interface RequestOptions { signal?: AbortSignal }
export const MAX_RESPONSE_CHARACTERS = 1024 * 1024;

export function failure<T = never>(kind: FailureKind, status?: number): ApiResult<T> {
  return { ok: false, error: {
    kind, retryable: ['network', 'server', 'rate_limited', 'session_unavailable'].includes(kind),
    ...(status === undefined ? {} : { status }),
  } };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validSession(session: ClientSession | null, now: number): session is ClientSession {
  return !!session && uuid.test(session.userId) && session.isAnonymous === false &&
    typeof session.accessToken === 'string' && session.accessToken.length > 0 &&
    // eslint-disable-next-line no-control-regex
    !/[\s\u0000-\u001f\u007f]/.test(session.accessToken) &&
    typeof session.sessionKey === 'string' && session.sessionKey.length > 0 &&
    Number.isFinite(session.expiresAtSeconds) && session.expiresAtSeconds * 1000 > now;
}
function sameSession(a: ClientSession, b: ClientSession): boolean {
  return a.userId.toLowerCase() === b.userId.toLowerCase() && a.sessionKey === b.sessionKey;
}

export function createCommunityProfileClient(deps: ClientDependencies) {
  // Fail at construction, before any access token can be sent to a bad destination.
  const base = new URL(deps.functionsBaseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw new TypeError('A trusted HTTPS functions base URL without credentials, query, or fragment is required.');
  }
  const baseUrl = base.toString().replace(/\/$/, '');
  const profileRoute = deps.profileRoute ?? 'social-profile';
  if (profileRoute !== 'social-profile' && profileRoute !== 'community-profile') {
    throw new TypeError('Invalid profile route');
  }
  const now = deps.now ?? Date.now;

  async function request<T>(path: string, params: URLSearchParams,
    parse: (body: unknown, callerId: string) => T | null, options: RequestOptions): Promise<ApiResult<T>> {
    const signal = options.signal;
    if (signal?.aborted) return failure('aborted');
    let session: ClientSession | null;
    try { session = await deps.getSession(); }
    catch { return failure(signal?.aborted ? 'aborted' : 'session_unavailable'); }
    if (signal?.aborted) return failure('aborted');
    if (!validSession(session, now())) return failure('unauthenticated');
    // Snapshot primitives: an injected provider must not mutate our in-flight context.
    const started = { ...session };
    let response: Response;
    try {
      response = await deps.fetch(`${baseUrl}${path}?${params.toString()}`, {
        method: 'GET', headers: { Authorization: `Bearer ${started.accessToken}`, Accept: 'application/json' },
        credentials: 'omit', cache: 'no-store', redirect: 'error', signal,
      });
    } catch {
      // Never retain/stringify the exception: platform errors can include URL, headers or response data.
      return failure(signal?.aborted ? 'aborted' : 'network');
    }
    if (signal?.aborted) return failure('aborted');

    async function checkContext(): Promise<FailureKind | null> {
      if (signal?.aborted) return 'aborted';
      let current: ClientSession | null;
      try { current = await deps.getSession(); }
      catch { return signal?.aborted ? 'aborted' : 'session_unavailable'; }
      if (signal?.aborted) return 'aborted';
      if (!validSession(current, now()) || !sameSession(started, current)) return 'stale_response';
      return null;
    }
    let contextFailure = await checkContext();
    if (contextFailure) return failure(contextFailure);
    if (!response.ok) {
      // Do not read error bodies: no server diagnostics or sensitive data escape to UI/logs.
      const kind: FailureKind = response.status === 401 ? 'unauthenticated' :
        response.status === 403 ? 'forbidden' : response.status === 404 ? 'not_found' :
        response.status === 429 ? 'rate_limited' : response.status >= 500 ? 'server' : 'invalid_response';
      return failure(kind, response.status);
    }
    if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
      return failure('invalid_response', response.status);
    }
    const announcedLength = response.headers.get('content-length');
    if (announcedLength && (!/^\d+$/.test(announcedLength) || Number(announcedLength) > MAX_RESPONSE_CHARACTERS)) {
      return failure('invalid_response', response.status);
    }
    let text: string;
    try { text = await response.text(); }
    catch { return failure(signal?.aborted ? 'aborted' : 'network'); }
    contextFailure = await checkContext();
    if (contextFailure) return failure(contextFailure);
    if (text.length > MAX_RESPONSE_CHARACTERS) return failure('invalid_response', response.status);
    let value: T | null;
    try { value = parse(JSON.parse(text), started.userId.toLowerCase()); }
    catch { return failure('invalid_response', response.status); }
    if (value === null) return failure('invalid_response', response.status);
    return { ok: true, value };
  }

  async function fetchProfile(input: ProfileInput, options: RequestOptions = {}): Promise<ApiResult<ProfileResponseV2>> {
    const clean = validateProfileInput(input);
    if (!clean) return failure('invalid_input');
    return request(`/${profileRoute}`, new URLSearchParams({ response_version: '2', user_id: clean.userId,
      from_date: clean.fromDate, to_date: clean.toDate, today: clean.today }),
      (body, callerId) => parseProfileResponse(body, clean, callerId), options);
  }

  async function fetchIdentities(input: IdentityInput, options: RequestOptions = {}): Promise<ApiResult<CommunityIdentitiesResponseV2>> {
    const clean = validateIdentityInput(input);
    if (!clean) return failure('invalid_input');
    const params = new URLSearchParams({ response_version: '2' });
    if (clean.mode === 'ids') params.set('user_ids', clean.user_ids.join(','));
    else { params.set('q', clean.q); params.set('limit', String(clean.limit)); }
    return request('/community-identities', params, body => parseIdentityResponse(body, clean), options);
  }

  /** One scope per consuming view. A new load clears old sensitive UI synchronously.
   * Call invalidate() on auth change, blur/unmount, unfollow/block, and privacy errors/events.
   * This is not a cache. Apply the result only while the screen still owns this scope. */
  function createProfileScope(onClear: () => void) {
    let generation = 0;
    let active: AbortController | null = null;
    function invalidate() {
      generation += 1;
      active?.abort();
      active = null;
      onClear();
    }
    async function load(input: ProfileInput, options: RequestOptions = {}): Promise<ApiResult<ProfileResponseV2>> {
      invalidate();
      const current = generation;
      const controller = new AbortController();
      active = controller;
      const onAbort = () => controller.abort();
      if (options.signal?.aborted) controller.abort();
      else options.signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const result = await fetchProfile(input, { signal: controller.signal });
        if (current !== generation) return failure('stale_response');
        return result;
      } finally {
        options.signal?.removeEventListener('abort', onAbort);
        if (active === controller) active = null;
      }
    }
    return { load, invalidate };
  }
  return { fetchProfile, fetchIdentities, createProfileScope };
}
