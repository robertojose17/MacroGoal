
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function TermsOfUseEULAScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation();

  console.log('[TermsOfUseEULA] Screen loaded');

  const handleOpenAppleEULA = async () => {
    const url = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    }
  };

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
          {t('termsEula.title')}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('termsEula.endUserLicenseAgreement')}
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsEula.eulaDesc')}
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('termsEula.licenseGrant')}
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsEula.licenseGrantDesc')}
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('termsEula.restrictions')}
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsEula.restrictionsDesc')}
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('termsEula.intellectualProperty')}
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsEula.intellectualPropertyDesc')}
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('termsEula.termination')}
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsEula.terminationDesc')}
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('termsEula.disclaimerOfWarranties')}
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsEula.disclaimerDesc')}
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('termsEula.limitationOfLiability')}
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsEula.limitationDesc')}
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('termsEula.appleAppStoreEula')}
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsEula.appleAppStoreDesc')}
          </Text>
          <TouchableOpacity onPress={handleOpenAppleEULA} style={styles.linkButton}>
            <Text style={[styles.linkText, { color: colors.primary }]}>
              {t('termsEula.viewAppleEula')}
            </Text>
            <IconSymbol
              ios_icon_name="arrow.up.right"
              android_material_icon_name="open_in_new"
              size={16}
              color={colors.primary}
            />
          </TouchableOpacity>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('termsEula.governingLaw')}
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsEula.governingLawDesc')}
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('termsEula.changesToEula')}
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsEula.changesToEulaDesc')}
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('termsEula.contactUs')}
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsEula.contactUsDesc')}
          </Text>

          <Text style={[styles.lastUpdated, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {t('termsEula.lastUpdated', { date: new Date().toLocaleDateString() })}
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
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
  },
  linkText: {
    ...typography.bodyBold,
    textDecorationLine: 'underline',
  },
  lastUpdated: {
    ...typography.caption,
    marginTop: spacing.lg,
    fontStyle: 'italic',
  },
});
