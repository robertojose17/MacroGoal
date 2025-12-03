
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { LinearGradient } from 'expo-linear-gradient';

export default function AuthWelcomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top', 'bottom']}>
      <LinearGradient
        colors={isDark ? [colors.backgroundDark, colors.primaryDark] : [colors.background, colors.primary]}
        style={styles.gradient}
      >
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>💪</Text>
          </View>
          
          <Text style={[styles.title, { color: isDark ? colors.textDark : '#FFFFFF' }]}>
            Elite Macro Tracker
          </Text>
          
          <Text style={[styles.subtitle, { color: isDark ? colors.textSecondaryDark : 'rgba(255,255,255,0.9)' }]}>
            Your professional fitness & nutrition companion
          </Text>

          <View style={styles.features}>
            <FeatureItem
              icon="🎯"
              text="Calculate personalized daily macros"
              isDark={isDark}
            />
            <FeatureItem
              icon="📊"
              text="Track food & progress effortlessly"
              isDark={isDark}
            />
            <FeatureItem
              icon="📈"
              text="Get premium analytics & insights"
              isDark={isDark}
            />
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.accent }]}
            onPress={() => router.push('/auth/signup')}
          >
            <Text style={styles.buttonText}>Sign Up</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.button, styles.buttonOutline, { borderColor: isDark ? colors.textDark : '#FFFFFF' }]}
            onPress={() => router.push('/auth/login')}
          >
            <Text style={[styles.buttonTextOutline, { color: isDark ? colors.textDark : '#FFFFFF' }]}>
              Log In
            </Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

function FeatureItem({ icon, text, isDark }: { icon: string; text: string; isDark: boolean }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text style={[styles.featureText, { color: isDark ? colors.textDark : '#FFFFFF' }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl * 2,
    alignItems: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  icon: {
    fontSize: 64,
  },
  title: {
    ...typography.h1,
    fontSize: 36,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.xxl,
  },
  features: {
    width: '100%',
    marginTop: spacing.lg,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  featureIcon: {
    fontSize: 32,
    marginRight: spacing.md,
  },
  featureText: {
    ...typography.body,
    flex: 1,
  },
  buttonContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  button: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  buttonTextOutline: {
    fontSize: 18,
    fontWeight: '700',
  },
});
