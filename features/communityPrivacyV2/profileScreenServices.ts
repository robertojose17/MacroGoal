import type { CommunityPrivacyActivation, CommunityPrivacyScope } from './communityPrivacyRolloutController';
import type { ClientSession, ClientDependencies } from './communityProfileApi';
import { createCommunityProfileClient, failure } from './communityProfileApi';
import { createOutboundFollowAdapter } from './outboundFollowAdapter';
import type { OutboundDependencies } from './outboundFollowAdapter';
import { createSupabaseInboxAuthBinding } from './supabaseInboxAuth';
import type { ProfileSupplementAdapter } from './profileSupplementTypes';
import type { SupabaseAuthSource } from './supabaseInboxAuth';

type ProfileReader = ReturnType<typeof createCommunityProfileClient>['fetchProfile'];

/** Bounds the complete frozen reader: session checks, fetch, body and validation.
 * Abort is advisory; the settled guard also ignores transports that ignore it. */
export function createBoundedProfileReader(reader: ProfileReader, timeoutMs = 10000): ProfileReader {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new TypeError('Invalid profile timeout.');
  return (input, options = {}) => {
    const signal = options.signal;
    if (signal?.aborted) return Promise.resolve(failure('aborted'));
    const request = new AbortController();
    return new Promise(resolve => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = (result: Awaited<ReturnType<ProfileReader>>) => {
        if (settled) return;
        settled = true;
        if (timer !== null) clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        resolve(result);
      };
      const cancel = () => { request.abort(); finish(failure('aborted')); };
      signal?.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => { request.abort(); finish(failure('network')); }, timeoutMs);
      if (signal?.aborted) cancel();
      // A deferred start catches synchronous reader exceptions and lets immediate cancellation win.
      void Promise.resolve().then(() => settled ? failure('aborted') : reader(input, { signal: request.signal }))
        .then(finish, () => finish(failure(signal?.aborted ? 'aborted' : 'network')));
    });
  };
}

/** Construction is inert. A reviewed provider is required; no endpoint/service-role fallback exists. */
export function createProfileScreenServices(deps: {
  auth: SupabaseAuthSource;
  functionsBaseUrl: string;
  profileRoute?: ClientDependencies['profileRoute'];
  /** Present only inside the normal verified protected route. No credential is stored here. */
  rollout?: {
    activation: CommunityPrivacyActivation;
    getActivation(): CommunityPrivacyActivation;
    getScope(): CommunityPrivacyScope;
  };
  fetch: typeof globalThis.fetch;
  profileTimeoutMs?: number;
  createSupplements?: (getSession: () => Promise<ClientSession | null>) => ProfileSupplementAdapter;
} & ({ rpc: OutboundDependencies['rpc']; createRpc?: never } | {
  createRpc: (getSession: () => Promise<ClientSession | null>) => OutboundDependencies['rpc']; rpc?: never;
})) {
  const binding = createSupabaseInboxAuthBinding(deps.auth);
  const rollout = deps.rollout;
  if ((deps.profileRoute === 'community-profile') !== !!rollout) {
    throw new TypeError('The v2 profile route requires a protected rollout context.');
  }
  function assertActivation() {
    if (!rollout) return;
    const activation = rollout.getActivation();
    if (activation !== rollout.activation || activation.status !== 'ready' || activation.mode !== 'protected'
        || !activation.actorId || !['pair', 'general'].includes(activation.rollout)) {
      throw new Error('Community data is unavailable.');
    }
  }
  // A separate verified auth binding must never cross the outer rollout generation,
  // including same-account sign-out/sign-in. All existing adapters get this guard.
  async function getSession(): Promise<ClientSession | null> {
    assertActivation();
    const session = await binding.getSession();
    assertActivation();
    if (session && rollout && session.userId !== rollout.activation.actorId) return null;
    return session;
  }
  const client = createCommunityProfileClient({ functionsBaseUrl: deps.functionsBaseUrl,
    fetch: deps.fetch, getSession, profileRoute: deps.profileRoute });
  const boundedProfile = createBoundedProfileReader(client.fetchProfile, deps.profileTimeoutMs);
  const fetchProfile: ProfileReader = async (input, options = {}) => {
    if (!rollout) return boundedProfile(input, options);
    let scope: CommunityPrivacyScope | null = null;
    const request = new AbortController();
    const abort = () => request.abort();
    try {
      assertActivation();
      scope = rollout.getScope();
      scope.assertCurrent();
      if (scope.activation !== rollout.activation) return failure('stale_response');
      scope.assertActor(rollout.activation.actorId);
      scope.signal.addEventListener('abort', abort, { once: true });
      options.signal?.addEventListener('abort', abort, { once: true });
      if (scope.signal.aborted || options.signal?.aborted) abort();
      // Keep the rollout scope alive through response text parsing, not just headers.
      const result = await boundedProfile(input, { signal: request.signal });
      assertActivation(); scope.assertCurrent();
      return result;
    } catch { return failure(options.signal?.aborted ? 'aborted' : 'stale_response'); }
    finally {
      scope?.signal.removeEventListener('abort', abort);
      options.signal?.removeEventListener('abort', abort);
      scope?.release();
    }
  };
  const rpc = deps.createRpc ? deps.createRpc(getSession) : deps.rpc;
  return { binding, createSupplements: deps.createSupplements ? () => deps.createSupplements!(getSession) : undefined, createAdapter: (onInvalidate: () => void) => createOutboundFollowAdapter({
    getSession, fetchProfile, rpc, onInvalidate,
  }) };
}
export type ProfileScreenServices = ReturnType<typeof createProfileScreenServices>;
