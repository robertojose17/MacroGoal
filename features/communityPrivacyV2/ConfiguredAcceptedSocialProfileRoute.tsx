import React, { useMemo } from 'react';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';
import AcceptedSocialProfileRoute from './AcceptedSocialProfileRoute';
import { ProfileScreenProvider } from './ProfileScreenEnvironment';
import { createProfileScreenServices } from './profileScreenServices';
import { createSupabaseOutboundFollowTransport } from './supabaseOutboundFollowTransport';

/** The false-flag route never mounts this component. Imports/construction do no network/auth work. */
export default function ConfiguredAcceptedSocialProfileRoute() {
  const services = useMemo(() => {
    try {
      return createProfileScreenServices({
        auth: supabase.auth,
        functionsBaseUrl: `${SUPABASE_PROJECT_URL.replace(/\/$/, '')}/functions/v1`,
        fetch: (input, init) => globalThis.fetch(input, init),
        createRpc: getSession => createSupabaseOutboundFollowTransport({ client: supabase, getSession }),
      });
    } catch { return null; } // Invalid configuration fails closed with no token, URL or error logging.
  }, []);
  if (!services) return <AcceptedSocialProfileRoute />;
  return <ProfileScreenProvider services={services}><AcceptedSocialProfileRoute /></ProfileScreenProvider>;
}
