
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { usePremium } from '@/hooks/usePremium';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';

interface PremiumFeatureGateProps {
  children: React.ReactNode;
  featureName?: string;
  fallbackMessage?: string;
}

/**
 * Component that gates premium features behind a subscription check
 * 
 * Shows the children if user is premium, otherwise shows an upgrade prompt
 * 
 * @example
 * ```tsx
 * <PremiumFeatureGate featureName="Advanced Analytics">
 *   <AdvancedAnalyticsChart />
 * </PremiumFeatureGate>
 * ```
 */
export function PremiumFeatureGate({ 
  children, 
  featureName = 'This feature',
  fallbackMessage,
}: PremiumFeatureGateProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { isPremium, loading } = usePremium();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isPremium) {
    return <>{children}</>;
  }

  const defaultMessage = `${featureName} is a premium feature. Upgrade to unlock advanced analytics, custom recipes, and more!`;
  const message = fallbackMessage || defaultMessage;

  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
      <View style={[styles.iconCircle, { backgroundColor: colors.primary + '20' }]}>
        <IconSymbol
          ios_icon_name="star.fill"
          android_material_icon_name="star"
          size={48}
          color={colors.primary}
        />
      </View>
      
      <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
        Premium Feature
      </Text>
      
      <Text style={[styles.message, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
        {message}
      </Text>

      <TouchableOpacity
        style={[styles.upgradeButton, { backgroundColor: colors.primary }]}
        onPress={() => router.push('/subscription')}
      >
        <IconSymbol
          ios_icon_name="star.fill"
          android_material_icon_name="star"
          size={20}
          color="#FFFFFF"
        />
        <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    margin: spacing.md,
  },
  loadingContainer: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h2,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
