import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase/client';
import { useRouter } from 'expo-router';

interface WelcomeBackModalProps {
  visible: boolean;
  userId: string;
  onDismiss: () => void;
}

type Step = 'recalculate' | 'history';

export default function WelcomeBackModal({
  visible,
  userId,
  onDismiss,
}: WelcomeBackModalProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [step, setStep] = useState<Step>('recalculate');
  const [willRecalculate, setWillRecalculate] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleRecalculateYes = () => {
    console.log('[WelcomeBackModal] User chose: Yes, recalculate calories');
    setWillRecalculate(true);
    setStep('history');
  };

  const handleKeepCurrentGoal = () => {
    console.log('[WelcomeBackModal] User chose: Keep current goal');
    setWillRecalculate(false);
    setStep('history');
  };

  const handleKeepHistory = () => {
    console.log('[WelcomeBackModal] User chose: Keep history');
    handleComplete(willRecalculate, false);
  };

  const handleStartFresh = () => {
    console.log('[WelcomeBackModal] User chose: Start fresh');
    handleComplete(willRecalculate, true);
  };

  const handleComplete = async (recalculate: boolean, startFresh: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      const auth = await supabase.auth.getUser();
      if (auth.error || auth.data.user?.id !== userId) {
        Alert.alert(t('common.error'), 'Account changed. Reopen this screen.');
        return;
      }
      // Never apply a formula, delete estimates, or reset profile/history here.
      // The dedicated screen captures a fresh snapshot for explicit review.
      onDismiss();
      if (startFresh) {
        Alert.alert('Review journey restart', 'Your targets and history have not changed. Review the restart date and recorded starting weight in Settings.', [
          { text: t('common.cancel'), style: 'cancel' },
          { text: 'Open Settings', onPress: () => router.push('/settings') },
        ]);
      } else if (recalculate) {
        router.push('/edit-goals');
      }
      setStep('recalculate');
      setWillRecalculate(false);
    } catch {
      Alert.alert(t('common.error'), 'Nothing was changed. Please try again when your account can be verified.');
    } finally { setSaving(false); }
  };

  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const titleColor = isDark ? colors.textDark : colors.primaryText;
  const bodyColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const overlayBg = isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.5)';

  const isRecalculateStep = step === 'recalculate';

  const stepTitle = isRecalculateStep
    ? t('welcomeBack.title', 'Welcome back!')
    : t('welcomeBack.historyTitle', 'Your progress history');

  const stepBody = isRecalculateStep
    ? t(
        'welcomeBack.reviewCurrentGoals',
        'Would you like to review your current nutrition targets? Nothing will be recalculated or saved without your confirmation in the goal editor.'
      )
    : t(
        'welcomeBack.reviewJourney',
        'Keep your current journey, or review a restart in Settings. Your history will not be deleted.'
      );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // Prevent hardware back from dismissing — user must make a choice
      }}
    >
      <View style={[styles.overlay, { backgroundColor: overlayBg }]}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: cardBg,
              borderColor: cardBorder,
            },
          ]}
        >
          {/* Icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.emoji}>👋</Text>
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: titleColor }]}>{stepTitle}</Text>

          {/* Body */}
          <Text style={[styles.body, { color: bodyColor }]}>{stepBody}</Text>

          {/* Buttons */}
          {saving ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : isRecalculateStep ? (
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.accent }]}
                onPress={handleRecalculateYes}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>
                  {t('welcomeBack.yesRecalculate', 'Yes, recalculate')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: cardBorder }]}
                onPress={handleKeepCurrentGoal}
                activeOpacity={0.7}
              >
                <Text style={[styles.secondaryButtonText, { color: bodyColor }]}>
                  {t('welcomeBack.keepCurrentGoal', 'Keep my current goal')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.accent }]}
                onPress={handleKeepHistory}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>
                  {t('welcomeBack.keepHistory', 'Keep my history')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: cardBorder }]}
                onPress={handleStartFresh}
                activeOpacity={0.7}
              >
                <Text style={[styles.secondaryButtonText, { color: bodyColor }]}>
                  {t('welcomeBack.startFresh', 'Start fresh')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: spacing.md,
  },
  emoji: {
    fontSize: 48,
    lineHeight: 56,
  },
  title: {
    ...typography.h2,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 24,
  },
  buttonGroup: {
    width: '100%',
    gap: spacing.sm,
  },
  primaryButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    ...typography.bodyBold,
  },
  secondaryButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    ...typography.body,
  },
  loadingContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
