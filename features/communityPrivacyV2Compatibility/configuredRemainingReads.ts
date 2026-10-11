import { supabase } from '@/lib/supabase/client';
import { createRemainingCommunityReads } from './remainingCommunityReads';

/** Factory construction is inert; no auth listener, data request, token or cached rows. */
export const remainingCommunityReads = createRemainingCommunityReads(supabase);

export async function acceptedConnectionCount(targetUserId: string, direction: 'followers' | 'following') {
  try { return { count: (await remainingCommunityReads.connections(targetUserId, direction)).length, error: null }; }
  catch { return { count: null, error: new Error('Accepted connections are unavailable.') }; }
}
