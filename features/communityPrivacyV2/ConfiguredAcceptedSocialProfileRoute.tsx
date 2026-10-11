import React, { useMemo } from 'react';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';
import AcceptedSocialProfileRoute from './AcceptedSocialProfileRoute';
import { ProfileScreenProvider } from './ProfileScreenEnvironment';
import { createProfileScreenServices } from './profileScreenServices';
import { createProfileSupplements } from './profileSupplements';
import { createSupabaseOutboundFollowTransport } from './supabaseOutboundFollowTransport';
import { getCommunityPrivacyActivation, getCommunityPrivacyScope } from './communityPrivacyRollout';

/** The normal route boundary mounts this only for a verified protected generation.
 * Imports and service construction do no network/auth work. The boundary keys its lifetime. */
export default function ConfiguredAcceptedSocialProfileRoute() {
  const services = useMemo(() => {
    try {
      const activation = getCommunityPrivacyActivation();
      if (activation.status !== 'ready' || activation.mode !== 'protected') return null;
      return createProfileScreenServices({
        auth: supabase.auth,
        profileRoute: 'community-profile',
        rollout: { activation, getActivation: getCommunityPrivacyActivation, getScope: getCommunityPrivacyScope },
        functionsBaseUrl: `${SUPABASE_PROJECT_URL.replace(/\/$/, '')}/functions/v1`,
        fetch: (input, init) => globalThis.fetch(input, init),
        createSupplements: getSession => createProfileSupplements({ client: supabase, getSession }),
        createRpc: getSession => createSupabaseOutboundFollowTransport({ client: supabase, getSession }),
      });
    } catch { return null; } // Invalid configuration fails closed with no token, URL or error logging.
  }, []);
  if (!services) return <AcceptedSocialProfileRoute />;
  return <ProfileScreenProvider services={services}><AcceptedSocialProfileRoute /></ProfileScreenProvider>;
}
