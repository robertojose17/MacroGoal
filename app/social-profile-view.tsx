import React from 'react';
import { COMMUNITY_PRIVACY_V2_ENABLED } from '@/features/communityPrivacyV2/featureFlag';
import LegacySocialProfileViewScreen from '@/features/communityPrivacyV2/LegacySocialProfileViewScreen';
import ConfiguredAcceptedSocialProfileRoute from '@/features/communityPrivacyV2/ConfiguredAcceptedSocialProfileRoute';

/** False retains the exact original component. Only the selected branch mounts hooks/effects. */
export default function SocialProfileViewScreen() {
  return COMMUNITY_PRIVACY_V2_ENABLED
    ? <ConfiguredAcceptedSocialProfileRoute />
    : <LegacySocialProfileViewScreen />;
}
