import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase/client';
import {
  calculateBMR,
  calculateTDEE,
  calculateTargetCalories,
  calculateMacrosWithPreset,
} from '@/utils/calculations';
import { toLocalDateString } from '@/utils/dateUtils';

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
    console.log('[WelcomeBackModal] handleComplete — recalculate:', recalculate, 'startFresh:', startFresh);
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        console.warn('[WelcomeBackModal] No auth user found, dismissing');
        onDismiss();
        return;
      }

      const todayStr = toLocalDateString(new Date());

      if (recalculate) {
        console.log('[WelcomeBackModal] Fetching user profile for recalculation...');
        const { data: userData } = await supabase
          .from('users')
          .select('sex, date_of_birth, height, current_weight, activity_level, weight_unit')
          .eq('id', user.id)
          .maybeSingle();

        console.log('[WelcomeBackModal] Fetching active goal...');
        const { data: goalData } = await supabase
          .from('goals')
          .select('loss_rate_lbs_per_week, macro_preset, goal_type, fiber_g')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (userData && goalData) {
          const dob = new Date(userData.date_of_birth);
          const age = Math.floor(
            (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
          );

          const bmr = calculateBMR(
            Number(userData.current_weight),
            Number(userData.height),
            age,
            userData.sex
          );
          const tdee = calculateTDEE(bmr, userData.activity_level);
          const targetCalories = calculateTargetCalories(
            tdee,
            goalData.goal_type,
            Number(goalData.loss_rate_lbs_per_week)
          );
          const macros = calculateMacrosWithPreset(
            targetCalories,
            goalData.macro_preset || 'lean_body'
          );

          console.log('[WelcomeBackModal] Recalculated — BMR:', bmr, 'TDEE:', tdee, 'Target:', targetCalories, 'Macros:', macros);

          console.log('[WelcomeBackModal] Updating active goal with new calories...');
          await supabase
            .from('goals')
            .update({
              daily_calories: targetCalories,
              protein_g: macros.protein,
              carbs_g: macros.carbs,
              fats_g: macros.fats,
              base_daily_calories: targetCalories,
              last_adaptive_update: null,
            })
            .eq('user_id', user.id)
            .eq('is_active', true);

          console.log('[WelcomeBackModal] Clearing tdee_estimates for fresh calibration...');
          await supabase
            .from('tdee_estimates')
            .delete()
            .eq('user_id', user.id);

          console.log('[WelcomeBackModal] Recalculation complete');
        } else {
          console.warn('[WelcomeBackModal] Missing userData or goalData — skipping recalculation');
        }
      }

      if (startFresh) {
        console.log('[WelcomeBackModal] Starting fresh journey — fetching current journey data...');
        const { data: currentUser } = await supabase
          .from('users')
          .select('journey_start_date, journey_restart_count')
          .eq('id', user.id)
          .maybeSingle();

        const newRestartCount = (Number(currentUser?.journey_restart_count) || 0) + 1;
        console.log('[WelcomeBackModal] Resetting journey — restart count will be:', newRestartCount);

        await supabase
          .from('users')
          .update({
            previous_journey_start_date: currentUser?.journey_start_date,
            journey_start_date: todayStr,
            journey_restart_count: newRestartCount,
            last_app_open: todayStr,
          })
          .eq('id', user.id);
      } else {
        console.log('[WelcomeBackModal] Keeping history — updating last_app_open only');
        await supabase
          .from('users')
          .update({ last_app_open: todayStr })
          .eq('id', user.id);
      }

      console.log('[WelcomeBackModal] All updates complete, dismissing modal');
      onDismiss();
    } catch (e) {
      console.error('[WelcomeBackModal] Error:', e);
      onDismiss();
    } finally {
      setSaving(false);
    }
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
        'welcomeBack.recalculateBody',
        "It's been a while. Your calorie goal was set based on your previous weight. Want us to recalculate it based on where you are now?"
      )
    : t(
        'welcomeBack.historyBody',
        'Do you want to keep your full progress history, or start fresh from today?'
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
