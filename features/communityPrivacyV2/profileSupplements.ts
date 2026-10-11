import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientSession } from './communityProfileApi';
import type { ProfileSupplementAdapter } from './profileSupplementTypes';
import { createCommunityCompatibilityReader } from '../communityPrivacyV2Compatibility/communityCompatibility';
import { createSupabaseCompatibilityTransport } from '../communityPrivacyV2Compatibility/supabaseCompatibilityTransport';
import { createProfileSupplementTransport } from './profileSupplementTransport';

/** One independently invalidated connection reader per mounted profile; construction is inert. */
export function createProfileSupplements({ client, getSession }: {
  client: Pick<SupabaseClient, 'rpc' | 'from'>; getSession(): Promise<ClientSession | null>;
}): ProfileSupplementAdapter {
  const connections = createCommunityCompatibilityReader({ getSession,
    rpc: createSupabaseCompatibilityTransport({ client, getSession }), onInvalidate() {} });
  const transport = createProfileSupplementTransport({ client, getSession });
  return { connections: input => connections.connections(input), posts: transport.posts, block: transport.block,
    invalidate: connections.invalidate };
}
