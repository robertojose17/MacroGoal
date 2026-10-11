import React from 'react';
import { CommunityPrivacyRolloutBoundary } from '@/features/communityPrivacyV2/CommunityPrivacyRolloutBoundary';
import LegacySocialProfileViewScreen from '@/features/communityPrivacyV2/LegacySocialProfileViewScreen';
import ConfiguredAcceptedSocialProfileRoute from '@/features/communityPrivacyV2/ConfiguredAcceptedSocialProfileRoute';

/** Eligibility resolves before either branch mounts its hooks/effects. */
export default function SocialProfileViewScreen() {
  return <CommunityPrivacyRolloutBoundary>{activation => activation.mode === 'protected' ? <ConfiguredAcceptedSocialProfileRoute /> : <LegacySocialProfileViewScreen />}</CommunityPrivacyRolloutBoundary>;
}
