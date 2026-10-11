import type { ClientSession } from './communityProfileApi';
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
  fetch: typeof globalThis.fetch;
  profileTimeoutMs?: number;
  createSupplements?: (getSession: () => Promise<ClientSession | null>) => ProfileSupplementAdapter;
} & ({ rpc: OutboundDependencies['rpc']; createRpc?: never } | {
  createRpc: (getSession: () => Promise<ClientSession | null>) => OutboundDependencies['rpc']; rpc?: never;
})) {
  const binding = createSupabaseInboxAuthBinding(deps.auth);
  const client = createCommunityProfileClient({ functionsBaseUrl: deps.functionsBaseUrl,
    fetch: deps.fetch, getSession: binding.getSession });
  const fetchProfile = createBoundedProfileReader(client.fetchProfile, deps.profileTimeoutMs);
  const rpc = deps.createRpc ? deps.createRpc(binding.getSession) : deps.rpc;
  return { binding, createSupplements: deps.createSupplements ? () => deps.createSupplements!(binding.getSession) : undefined, createAdapter: (onInvalidate: () => void) => createOutboundFollowAdapter({
    getSession: binding.getSession, fetchProfile, rpc, onInvalidate,
  }) };
}
export type ProfileScreenServices = ReturnType<typeof createProfileScreenServices>;
