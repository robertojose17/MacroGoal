
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { TouchableOpacity } from 'react-native';

export default function TermsOfServiceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  console.log('[TermsOfService] Screen loaded');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={isDark ? colors.textDark : colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
          {t('termsOfService.title')}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('termsOfService.agreementToTerms')}
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsOfService.agreementDesc')}
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('termsOfService.useOfService')}
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsOfService.useOfServiceDesc')}
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('termsOfService.userAccounts')}
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsOfService.userAccountsDesc')}
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('termsOfService.healthDisclaimer')}
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsOfService.healthDisclaimerDesc')}
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('termsOfService.subscriptionTerms')}
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsOfService.subscriptionTermsDesc')}
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('termsOfService.limitationOfLiability')}
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsOfService.limitationDesc')}
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('termsOfService.changesToTerms')}
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsOfService.changesToTermsDesc')}
          </Text>

          <Text style={[styles.lastUpdated, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsOfService.lastUpdated', { date: new Date().toLocaleDateString() })}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.md,
  },
  backButton: {
    padding: spacing.xs,
  },
  title: {
    ...typography.h2,
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  sectionTitle: {
    ...typography.h3,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  paragraph: {
    ...typography.body,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  lastUpdated: {
    ...typography.caption,
    marginTop: spacing.lg,
    fontStyle: 'italic',
  },
});
