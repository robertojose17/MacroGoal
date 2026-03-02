
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { TouchableOpacity } from 'react-native';

export default function TermsOfServiceScreen() {
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
          Terms of Service
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Agreement to Terms
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            By accessing and using this app, you accept and agree to be bound by the terms and provisions of this agreement.
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Use of Service
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            This app is provided for personal, non-commercial use. You agree to use the service only for lawful purposes and in accordance with these Terms of Service.
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            User Accounts
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Health Disclaimer
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            This app provides nutritional tracking and information for general purposes only. It is not intended as medical advice. Always consult with a qualified healthcare professional before making any changes to your diet or exercise routine.
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Subscription Terms
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Premium subscriptions are billed on a recurring basis. You may cancel your subscription at any time, and you will continue to have access to premium features until the end of your current billing period.
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Limitation of Liability
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            We shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the service.
          </Text>

          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Changes to Terms
          </Text>
          <Text style={[styles.paragraph, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            We reserve the right to modify these terms at any time. We will notify users of any material changes via email or in-app notification.
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
