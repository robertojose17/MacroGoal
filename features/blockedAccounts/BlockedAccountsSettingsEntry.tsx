import React from 'react';
import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '@/styles/commonStyles';
import { blockedStrings } from './strings';
export function BlockedAccountsSettingsEntry() {
  const router = useRouter();
  const { i18n } = useTranslation();
  return <Pressable accessibilityRole="button" onPress={() => router.push('/blocked-accounts')}
    style={{ minHeight: 52, padding: 16, justifyContent: 'center' }}>
    <Text style={{ color: colors.primary, fontSize: 16 }}>{blockedStrings(i18n.resolvedLanguage || i18n.language || 'en').title}</Text>
  </Pressable>;
}
