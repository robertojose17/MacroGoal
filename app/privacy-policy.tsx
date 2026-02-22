
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { TouchableOpacity } from 'react-native';

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  console.log('[PrivacyPolicy] Screen loaded');

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
          Privacy Policy
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Your Privacy Matters
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            We are committed to protecting your privacy and ensuring the security of your personal information.
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Information We Collect
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            - Account information (email, name){'\n'}
            - Health and fitness data (weight, height, goals){'\n'}
            - Food and nutrition logs{'\n'}
            - Usage data and analytics
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            How We Use Your Information
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Your data is used to provide personalized nutrition tracking, calculate your daily targets, and improve your experience with our app. We never sell your personal information to third parties.
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Data Security
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            We use industry-standard encryption and security measures to protect your data. Your information is stored securely and accessed only when necessary to provide our services.
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Your Rights
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            You have the right to access, modify, or delete your personal data at any time. You can manage your data through your profile settings or contact us for assistance.
          </Text>

          <Text style={[styles.lastUpdated, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Last updated: {new Date().toLocaleDateString()}
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
