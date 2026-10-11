import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { retryCommunityPrivacyRollout, useCommunityPrivacyRollout } from './communityPrivacyRollout';
import type { CommunityPrivacyActivation } from './communityPrivacyRollout';

/** Branch factories are never evaluated before per-session eligibility settles. */
export function CommunityPrivacyRolloutBoundary({ children }: {
  children: (activation: CommunityPrivacyActivation) => React.ReactNode;
}) {
  const activation = useCommunityPrivacyRollout();
  if (activation.status === 'pending') return <View accessibilityRole="summary"><ActivityIndicator /></View>;
  if (activation.status === 'signed_out' || activation.status === 'error') return <RolloutUnavailable status={activation.status} />;
  return <React.Fragment key={activation.scopeKey}>{children(activation)}</React.Fragment>;
}

function RolloutUnavailable({ status }: { status: 'signed_out' | 'error' }) {
  const { i18n } = useTranslation();
  const spanish = (i18n.resolvedLanguage ?? i18n.language).toLowerCase().startsWith('es');
  if (status === 'signed_out') return <View accessibilityRole="summary">
    <Text>{spanish ? 'Inicia sesión para ver este contenido.' : 'Sign in to view this content.'}</Text>
  </View>;
  return <View accessibilityRole="summary">
    <Text>{spanish ? 'Los datos de la comunidad no están disponibles.' : 'Community data is unavailable.'}</Text>
    <Pressable accessibilityRole="button" onPress={retryCommunityPrivacyRollout}>
      <Text>{spanish ? 'Intentar de nuevo' : 'Try again'}</Text>
    </Pressable>
  </View>;
}
