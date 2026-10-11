import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase/client';
import { COMMUNITY_PRIVACY_PAIR_PILOT_OPT_IN, COMMUNITY_PRIVACY_V2_ENABLED, isCommunityPrivacyRolloutRequested } from './featureFlag';
import { createSupabaseInboxAuthBinding } from './supabaseInboxAuth';
import { createCommunityPrivacyRolloutController } from './communityPrivacyRolloutController';
import type { CommunityPrivacyScope, CommunityPrivacyRequest } from './communityPrivacyRolloutController';
export type { CommunityPrivacyActivation, CommunityPrivacyScope } from './communityPrivacyRolloutController';

// Generated Database types predate this inactive RPC. Keep the seam narrow and parse its unknown reply.
const eligibilityClient = supabase as unknown as {
  rpc(name: 'community_privacy_eligibility', args: Record<string, never>, options: { get: false; head: false }):
    CommunityPrivacyRequest<{ data: unknown; error: unknown }>;
};

/** Construction/import is inert. The normal root owns the single auth/eligibility lifetime. */
const controller = createCommunityPrivacyRolloutController({
  requested: isCommunityPrivacyRolloutRequested(COMMUNITY_PRIVACY_V2_ENABLED, COMMUNITY_PRIVACY_PAIR_PILOT_OPT_IN,
    typeof __DEV__ !== 'undefined' && __DEV__),
  requireGeneral: COMMUNITY_PRIVACY_V2_ENABLED,
  createAuthBinding: () => createSupabaseInboxAuthBinding(supabase.auth),
  async eligibility(session, signal) {
    const result = await eligibilityClient.rpc('community_privacy_eligibility', {}, { get: false, head: false })
      .setHeader('Authorization', `Bearer ${session.accessToken}`).abortSignal(signal);
    if (result.error) throw new Error('Community data is unavailable.');
    return result.data;
  },
});
export const getCommunityPrivacyActivation = controller.getSnapshot;
export const getCommunityPrivacyScope = controller.getScope;
export const retryCommunityPrivacyRollout = controller.retry;
export function useCommunityPrivacyRollout() {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
export function useCommunityPrivacyRolloutLifecycle() {
  useEffect(() => { controller.start(); return controller.stop; }, []);
}
export async function withCommunityPrivacyScope<T>(work: (scope: CommunityPrivacyScope) => Promise<T>, expectedScopeKey?: string): Promise<T> {
  const scope = getCommunityPrivacyScope();
  try {
    if (expectedScopeKey !== undefined && scope.activation.scopeKey !== expectedScopeKey) throw new Error('Community data is unavailable.');
    const value = await work(scope); scope.assertCurrent(); return value; }
  finally { scope.release(); }
}
