import { getAppLocale } from '@/lib/localization';

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Platform, Alert, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Sex, GoalType, ActivityLevel } from '@/types';
import { useAcceptedGoalEditor } from '@/hooks/useAcceptedGoalEditor';
import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/types';
import { calculateBMR, calculateTDEE, calculateTargetCalories, calculateMacrosWithPreset } from '@/utils/calculations';
import { IconSymbol } from '@/components/IconSymbol';
import { useTranslation } from 'react-i18next';

type MacroPreset = 'balanced' | 'high_protein' | 'low_carb' | 'lean_body' | 'custom';

export default function EditGoalsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation();

  const editor = useAcceptedGoalEditor();
  const { loading, busy: saving, snapshot: loadedSnapshot, isCurrent: actorCurrent } = editor;
  const [formError, setFormError] = useState('');

  // Coach banner state
  const [lastCoachMacroAction, setLastCoachMacroAction] = useState<Database['public']['Tables']['coach_actions']['Row'] | null>(null);
  const [isCoachModified, setIsCoachModified] = useState(false);

  // User data
  const [sex, setSex] = useState<Sex>('male');
  const [age, setAge] = useState(0);
  const [heightCm, setHeightCm] = useState(0);
  const [weightKg, setWeightKg] = useState(0);
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  
  // Goal data
  const [goalType, setGoalType] = useState<GoalType>('lose');
  const [lossRateLbsPerWeek, setLossRateLbsPerWeek] = useState<number>(1.0);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  
  // Macro preset
  const [macroPreset, setMacroPreset] = useState<MacroPreset>('lean_body');
  const [customProteinPercent, setCustomProteinPercent] = useState('30');
  const [customCarbsPercent, setCustomCarbsPercent] = useState('40');
  const [customFatsPercent, setCustomFatsPercent] = useState('30');
  const [macroError, setMacroError] = useState('');

  useEffect(() => {
    const snapshot = loadedSnapshot;
    setFormError(''); setIsCoachModified(false); setLastCoachMacroAction(null);
    if (!snapshot) return;
    const { profile: userData, goal: goalData } = snapshot;
    const activity = userData.activity_level;
    const preset = goalData.macro_preset;
    const dob = userData.date_of_birth ? new Date(userData.date_of_birth + 'T12:00:00') : null;
    const today = new Date();
    let calculatedAge = dob ? today.getFullYear() - dob.getFullYear() : NaN;
    if (dob && (today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate()))) calculatedAge--;
    if ((userData.sex !== 'male' && userData.sex !== 'female') || !userData.height || !userData.current_weight ||
      !Number.isFinite(calculatedAge) || calculatedAge < 18 || calculatedAge > 100 ||
      (activity !== 'sedentary' && activity !== 'light' && activity !== 'moderate' && activity !== 'active' && activity !== 'very_active') ||
      (preset !== 'custom' && preset !== 'balanced' && preset !== 'high_protein' && preset !== 'low_carb' && preset !== 'lean_body') ||
      (goalData.goal_type !== 'lose' && goalData.goal_type !== 'gain' && goalData.goal_type !== 'maintain') ||
      (userData.preferred_units !== 'metric' && userData.preferred_units !== 'imperial') || goalData.daily_calories <= 0) {
      setFormError('A verified adult profile and complete accepted goal are required. Review your profile first.'); return;
    }
    setSex(userData.sex); setHeightCm(userData.height); setWeightKg(userData.current_weight); setAge(calculatedAge);
    setUnits(userData.preferred_units); setActivityLevel(activity); setGoalType(goalData.goal_type); setMacroPreset(preset);
    setLossRateLbsPerWeek(goalData.loss_rate_lbs_per_week ?? NaN);
    setCustomProteinPercent(String(Math.round(goalData.protein_g * 4 / goalData.daily_calories * 100)));
    setCustomCarbsPercent(String(Math.round(goalData.carbs_g * 4 / goalData.daily_calories * 100)));
    setCustomFatsPercent(String(Math.round(goalData.fats_g * 9 / goalData.daily_calories * 100)));
    let cancelled = false;
    void supabase.from('coach_actions').select('*').eq('user_id', userData.id).eq('action_type', 'adjust_macros').order('created_at', { ascending: false }).limit(1).then(({ data, error }) => {
      if (cancelled || error || !actorCurrent(userData.id)) return;
      const action = data?.[0], value = action?.new_value;
      if (action && value && typeof value === 'object' && !Array.isArray(value)) {
        setLastCoachMacroAction(action);
        setIsCoachModified(value.daily_calories === goalData.daily_calories && value.protein_g === goalData.protein_g && value.carbs_g === goalData.carbs_g && value.fats_g === goalData.fats_g);
      }
    });
    return () => { cancelled = true; };
  }, [loadedSnapshot, actorCurrent]);

  const validateMacros = (): boolean => {
    if (macroPreset !== 'custom') return true;

    const protein = customProteinPercent.trim() === '' ? NaN : Number(customProteinPercent);
    const carbs = customCarbsPercent.trim() === '' ? NaN : Number(customCarbsPercent);
    const fats = customFatsPercent.trim() === '' ? NaN : Number(customFatsPercent);
    const total = protein + carbs + fats;

    if (![protein, carbs, fats].every(n => Number.isFinite(n) && n >= 0 && n <= 100) || Math.abs(total - 100) > 0.5) {
      setMacroError(t('editGoals.macrosTotalError', { total: total.toFixed(1) }));
      return false;
    }

    setMacroError('');
    return true;
  };

  const handleSave = async () => {
    if (!validateMacros()) {
      Alert.alert(t('editGoals.invalidMacros'), macroError);
      return;
    }

    const snapshot = editor.snapshot;
    if (!snapshot || editor.pending || editor.busy || formError) return;

    try {
      console.log('[EditGoals] Calculating new goals...');

      // Calculate BMR and TDEE
      const bmr = calculateBMR(weightKg, heightCm, age, sex);
      const tdee = calculateTDEE(bmr, activityLevel);
      
      // Calculate target calories
      const targetCalories = calculateTargetCalories(
        tdee, 
        goalType, 
        goalType === 'lose' ? lossRateLbsPerWeek : undefined
      );
      
      // Calculate macros based on preset or custom values
      let macros;
      if (macroPreset === 'custom') {
        const proteinPercent = parseFloat(customProteinPercent) / 100;
        const carbsPercent = parseFloat(customCarbsPercent) / 100;
        const fatsPercent = parseFloat(customFatsPercent) / 100;
        
        macros = {
          protein: Math.round((targetCalories * proteinPercent) / 4),
          carbs: Math.round((targetCalories * carbsPercent) / 4),
          fats: Math.round((targetCalories * fatsPercent) / 9),
          fiber: Math.round(targetCalories / 1000 * 14),
        };
      } else {
        macros = calculateMacrosWithPreset(targetCalories, weightKg, macroPreset);
      }

      console.log('[EditGoals] New calculations:', {
        bmr,
        tdee,
        targetCalories,
        macros,
        preset: macroPreset,
      });

      const target = snapshot.goal.target_weight;
      if ((goalType === 'lose' && (target == null || target >= weightKg)) || (goalType === 'gain' && (target == null || target <= weightKg))) throw new Error('Review the target weight before changing goal direction.');
      if (goalType === 'lose' && (!Number.isFinite(lossRateLbsPerWeek) || lossRateLbsPerWeek <= 0 || lossRateLbsPerWeek > 2)) throw new Error('Review the loss rate.');
      await editor.run('save', {
        userId: snapshot.profile.id, expectedProfileUpdatedAt: snapshot.profile.updated_at,
        expectedGoal: snapshot.goal, operation: 'manual_goal', profile: { activity_level: activityLevel },
        isCurrent: () => editor.isCurrent(snapshot.profile.id),
        goal: { goal_type: goalType, daily_calories: targetCalories, protein_g: macros.protein,
          carbs_g: macros.carbs, fats_g: macros.fats, fiber_g: macros.fiber, macro_preset: macroPreset,
          ...(goalType === 'lose' ? { loss_rate_lbs_per_week: lossRateLbsPerWeek } : {}),
        },
      });

      // Show success message
      Alert.alert(
        t('editGoals.goalsUpdated'),
        t('editGoals.goalsUpdatedMessage', { calories: targetCalories }),
        [
          {
            text: t('common.ok'),
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error: any) {
      console.error('[EditGoals] Error:', error);
      Alert.alert(t('common.error'), error.message || t('editGoals.failedToSave'));
    }
  };

  if (!loading && (!editor.snapshot || formError)) {
    return <SafeAreaView style={{ flex: 1, padding: 24 }}>
      <Text accessibilityRole="alert">{editor.error || formError || 'No verified active goal is available.'}</Text>
      {editor.canRetrySave && <TouchableOpacity disabled={saving} onPress={() => { void editor.run('save').catch(() => {}); }}><Text>Retry the same save</Text></TouchableOpacity>}
      <TouchableOpacity disabled={saving} onPress={() => { void editor.review().catch(() => {}); }}><Text>Review current goals</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => router.back()}><Text>Back</Text></TouchableOpacity>
    </SafeAreaView>;
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            {t('editGoals.loadingGoals')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol
              ios_icon_name="arrow.left"
              android_material_icon_name="arrow-back"
              size={24}
              color={isDark ? colors.textDark : colors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('editGoals.title')}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Coach Banner */}
          {isCoachModified && lastCoachMacroAction && (
            <View style={[styles.coachBanner, { backgroundColor: isDark ? '#2D1B4E' : '#EDE7F6', borderColor: isDark ? '#7B1FA2' : '#CE93D8' }]}>
              <Text style={styles.coachBannerIcon}>{'⚠️'}</Text>
              <Text style={[styles.coachBannerText, { color: isDark ? '#CE93D8' : '#4A148C' }]}>
                {t('localization.screens.coachAdjusted')}
                {new Date(lastCoachMacroAction.created_at ?? '').toLocaleDateString(getAppLocale(), { month: 'long', day: 'numeric', year: 'numeric' })}
                {t('localization.screens.coachOverride')}
              </Text>
            </View>
          )}

          {!!(editor.error || formError) && <Text accessibilityRole="alert">{editor.error || formError}</Text>}
          {editor.canRetrySave && <TouchableOpacity disabled={saving} onPress={() => { void editor.run('save').catch(() => {}); }}><Text>Retry the same save</Text></TouchableOpacity>}
          <TouchableOpacity disabled={saving} onPress={() => { void editor.review().catch(() => {}); }}><Text>Review current goals</Text></TouchableOpacity>
          {/* Goal Type */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>{t('editGoals.goalLabel')}</Text>
            <View style={styles.goalOptions}>
              <TouchableOpacity
                style={[
                  styles.goalOption,
                  { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border },
                  goalType === 'lose' && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setGoalType('lose')}
              >
                <IconSymbol ios_icon_name="arrow.down.circle.fill" android_material_icon_name="trending_down" size={28} color="#EF4444" />
                <Text style={[styles.goalText, { color: isDark ? colors.textDark : colors.text }, goalType === 'lose' && { color: '#FFFFFF' }]}>
                  {t('editGoals.loseWeight')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.goalOption,
                  { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border },
                  goalType === 'maintain' && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setGoalType('maintain')}
              >
                <Text style={styles.goalIcon}>⚖️</Text>
                <Text style={[styles.goalText, { color: isDark ? colors.textDark : colors.text }, goalType === 'maintain' && { color: '#FFFFFF' }]}>
                  {t('editGoals.maintain')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.goalOption,
                  { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border },
                  goalType === 'gain' && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setGoalType('gain')}
              >
                <IconSymbol ios_icon_name="arrow.up.circle.fill" android_material_icon_name="trending_up" size={28} color="#22C55E" />
                <Text style={[styles.goalText, { color: isDark ? colors.textDark : colors.text }, goalType === 'gain' && { color: '#FFFFFF' }]}>
                  {t('editGoals.gainWeight')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Weight Loss Rate */}
          {goalType === 'lose' && (
            <View style={styles.section}>
              <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                {t('editGoals.weightLossRate')}
              </Text>
              <View style={styles.activityOptions}>
                <LossRateOption
                  label={t('editGoals.lossRate05')}
                  description={t('editGoals.lossRateSlow')}
                  value={0.5}
                  selected={lossRateLbsPerWeek === 0.5}
                  onPress={() => setLossRateLbsPerWeek(0.5)}
                  isDark={isDark}
                />
                <LossRateOption
                  label={t('editGoals.lossRate10')}
                  description={t('editGoals.lossRateModerate')}
                  value={1.0}
                  selected={lossRateLbsPerWeek === 1.0}
                  onPress={() => setLossRateLbsPerWeek(1.0)}
                  isDark={isDark}
                />
                <LossRateOption
                  label={t('editGoals.lossRate15')}
                  description={t('editGoals.lossRateFast')}
                  value={1.5}
                  selected={lossRateLbsPerWeek === 1.5}
                  onPress={() => setLossRateLbsPerWeek(1.5)}
                  isDark={isDark}
                />
                <LossRateOption
                  label={t('editGoals.lossRate20')}
                  description={t('editGoals.lossRateAggressive')}
                  value={2.0}
                  selected={lossRateLbsPerWeek === 2.0}
                  onPress={() => setLossRateLbsPerWeek(2.0)}
                  isDark={isDark}
                />
              </View>
            </View>
          )}

          {/* Activity Level */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>{t('editGoals.activityLevel')}</Text>
            <View style={styles.activityOptions}>
              <ActivityOption
                label={t('editGoals.sedentary')}
                description={t('editGoals.sedentaryDesc')}
                selected={activityLevel === 'sedentary'}
                onPress={() => setActivityLevel('sedentary')}
                isDark={isDark}
              />
              <ActivityOption
                label={t('editGoals.light')}
                description={t('editGoals.lightDesc')}
                selected={activityLevel === 'light'}
                onPress={() => setActivityLevel('light')}
                isDark={isDark}
              />
              <ActivityOption
                label={t('editGoals.moderate')}
                description={t('editGoals.moderateDesc')}
                selected={activityLevel === 'moderate'}
                onPress={() => setActivityLevel('moderate')}
                isDark={isDark}
              />
              <ActivityOption
                label={t('editGoals.veryActive')}
                description={t('editGoals.veryActiveDesc')}
                selected={activityLevel === 'very_active'}
                onPress={() => setActivityLevel('very_active')}
                isDark={isDark}
              />
            </View>
          </View>

          {/* Macro Presets */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
              {t('editGoals.macroSplit')}
            </Text>
            <Text style={[styles.helperText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {t('editGoals.macroSplitHelper')}
            </Text>
            
            <View style={styles.presetOptions}>
              <MacroPresetOption
                label={t('editGoals.leanBodyFormula')}
                description={t('editGoals.leanBodyFormulaDesc')}
                value="lean_body"
                selected={macroPreset === 'lean_body'}
                onPress={() => {
                  console.log('[EditGoals] Preset selected: lean_body');
                  setMacroPreset('lean_body');
                }}
                isDark={isDark}
              />
              <MacroPresetOption
                label={t('editGoals.balanced')}
                description={t('editGoals.balancedDesc')}
                value="balanced"
                selected={macroPreset === 'balanced'}
                onPress={() => setMacroPreset('balanced')}
                isDark={isDark}
              />
              <MacroPresetOption
                label={t('editGoals.highProtein')}
                description={t('editGoals.highProteinDesc')}
                value="high_protein"
                selected={macroPreset === 'high_protein'}
                onPress={() => setMacroPreset('high_protein')}
                isDark={isDark}
              />
              <MacroPresetOption
                label={t('editGoals.lowCarb')}
                description={t('editGoals.lowCarbDesc')}
                value="low_carb"
                selected={macroPreset === 'low_carb'}
                onPress={() => setMacroPreset('low_carb')}
                isDark={isDark}
              />
              <MacroPresetOption
                label={t('editGoals.custom')}
                description={t('editGoals.customDesc')}
                value="custom"
                selected={macroPreset === 'custom'}
                onPress={() => setMacroPreset('custom')}
                isDark={isDark}
              />
            </View>

            {/* Custom Macro Inputs */}
            {macroPreset === 'custom' && (
              <View style={styles.customMacroInputs}>
                <View style={styles.macroInputRow}>
                  <View style={styles.macroInputContainer}>
                    <Text style={[styles.macroInputLabel, { color: isDark ? colors.textDark : colors.text }]}>
                      {t('editGoals.proteinPct')}
                    </Text>
                    <TextInput
                      style={[styles.macroInput, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                      placeholder="30"
                      placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                      keyboardType="decimal-pad"
                      value={customProteinPercent}
                      onChangeText={(text) => {
                        setCustomProteinPercent(text);
                        setMacroError('');
                      }}
                      onBlur={validateMacros}
                    />
                  </View>
                  <View style={styles.macroInputContainer}>
                    <Text style={[styles.macroInputLabel, { color: isDark ? colors.textDark : colors.text }]}>
                      {t('editGoals.carbsPct')}
                    </Text>
                    <TextInput
                      style={[styles.macroInput, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                      placeholder="40"
                      placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                      keyboardType="decimal-pad"
                      value={customCarbsPercent}
                      onChangeText={(text) => {
                        setCustomCarbsPercent(text);
                        setMacroError('');
                      }}
                      onBlur={validateMacros}
                    />
                  </View>
                  <View style={styles.macroInputContainer}>
                    <Text style={[styles.macroInputLabel, { color: isDark ? colors.textDark : colors.text }]}>
                      {t('editGoals.fatsPct')}
                    </Text>
                    <TextInput
                      style={[styles.macroInput, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                      placeholder="30"
                      placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                      keyboardType="decimal-pad"
                      value={customFatsPercent}
                      onChangeText={(text) => {
                        setCustomFatsPercent(text);
                        setMacroError('');
                      }}
                      onBlur={validateMacros}
                    />
                  </View>
                </View>
                {macroError ? (
                  <Text style={[styles.errorText, { color: colors.error }]}>
                    {macroError}
                  </Text>
                ) : null}
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
            onPress={handleSave}
            disabled={saving || editor.pending || !editor.snapshot || !!formError}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>{t('editGoals.saveChanges')}</Text>
            )}
          </TouchableOpacity>
          
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LossRateOption({ label, description, value, selected, onPress, isDark }: any) {
  return (
    <TouchableOpacity
      style={[
        styles.activityOption,
        { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border },
        selected && { backgroundColor: colors.primary, borderColor: colors.primary },
      ]}
      onPress={onPress}
    >
      <View style={styles.activityContent}>
        <Text style={[styles.activityLabel, { color: isDark ? colors.textDark : colors.text }, selected && { color: '#FFFFFF' }]}>
          {label}
        </Text>
        <Text style={[styles.activityDescription, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }, selected && { color: 'rgba(255,255,255,0.8)' }]}>
          {description}
        </Text>
      </View>
      <View style={[styles.radio, { borderColor: selected ? '#FFFFFF' : (isDark ? colors.borderDark : colors.border) }]}>
        {selected && <View style={styles.radioInner} />}
      </View>
    </TouchableOpacity>
  );
}

function ActivityOption({ label, description, selected, onPress, isDark }: any) {
  return (
    <TouchableOpacity
      style={[
        styles.activityOption,
        { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border },
        selected && { backgroundColor: colors.primary, borderColor: colors.primary },
      ]}
      onPress={onPress}
    >
      <View style={styles.activityContent}>
        <Text style={[styles.activityLabel, { color: isDark ? colors.textDark : colors.text }, selected && { color: '#FFFFFF' }]}>
          {label}
        </Text>
        <Text style={[styles.activityDescription, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }, selected && { color: 'rgba(255,255,255,0.8)' }]}>
          {description}
        </Text>
      </View>
      <View style={[styles.radio, { borderColor: selected ? '#FFFFFF' : (isDark ? colors.borderDark : colors.border) }]}>
        {selected && <View style={styles.radioInner} />}
      </View>
    </TouchableOpacity>
  );
}

function MacroPresetOption({ label, description, value, selected, onPress, isDark }: any) {
  return (
    <TouchableOpacity
      style={[
        styles.presetOption,
        { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border },
        selected && { backgroundColor: colors.primary, borderColor: colors.primary },
      ]}
      onPress={onPress}
    >
      <View style={styles.presetContent}>
        <Text style={[styles.presetLabel, { color: isDark ? colors.textDark : colors.text }, selected && { color: '#FFFFFF' }]}>
          {label}
        </Text>
        <Text style={[styles.presetDescription, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }, selected && { color: 'rgba(255,255,255,0.8)' }]}>
          {description}
        </Text>
      </View>
      <View style={[styles.radio, { borderColor: selected ? '#FFFFFF' : (isDark ? colors.borderDark : colors.border) }]}>
        {selected && <View style={styles.radioInner} />}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  coachBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: spacing.md,
  },
  coachBannerIcon: {
    fontSize: 15,
    marginTop: 1,
  },
  coachBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
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
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.h2,
  },
  headerSpacer: {
    width: 44,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  section: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.bodyBold,
    marginBottom: spacing.sm,
  },
  helperText: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
  goalOptions: {
    gap: spacing.sm,
  },
  goalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  goalIcon: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  goalText: {
    ...typography.bodyBold,
  },
  activityOptions: {
    gap: spacing.sm,
  },
  activityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  activityContent: {
    flex: 1,
  },
  activityLabel: {
    ...typography.bodyBold,
    marginBottom: 2,
  },
  activityDescription: {
    ...typography.caption,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  presetOptions: {
    gap: spacing.sm,
  },
  presetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  presetContent: {
    flex: 1,
  },
  presetLabel: {
    ...typography.bodyBold,
    marginBottom: 2,
  },
  presetDescription: {
    ...typography.caption,
  },
  customMacroInputs: {
    marginTop: spacing.md,
  },
  macroInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  macroInputContainer: {
    flex: 1,
  },
  macroInputLabel: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  macroInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    textAlign: 'center',
  },
  errorText: {
    ...typography.caption,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  button: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  bottomSpacer: {
    height: 100,
  },
});
