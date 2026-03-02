
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Platform, Alert, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Sex, GoalType, ActivityLevel } from '@/types';
import { supabase } from '@/app/integrations/supabase/client';
import { calculateBMR, calculateTDEE, calculateTargetCalories, calculateMacrosWithPreset } from '@/utils/calculations';
import { IconSymbol } from '@/components/IconSymbol';

type MacroPreset = 'balanced' | 'high_protein' | 'low_carb' | 'keto' | 'custom';

export default function EditGoalsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // User data
  const [userId, setUserId] = useState<string>('');
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
  const [macroPreset, setMacroPreset] = useState<MacroPreset>('balanced');
  const [customProteinPercent, setCustomProteinPercent] = useState('30');
  const [customCarbsPercent, setCustomCarbsPercent] = useState('40');
  const [customFatsPercent, setCustomFatsPercent] = useState('30');
  const [macroError, setMacroError] = useState('');

  const loadCurrentGoals = useCallback(async () => {
    try {
      setLoading(true);
      console.log('[EditGoals] Loading current goals and user data...');
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        Alert.alert('Error', 'You must be logged in');
        router.back();
        return;
      }

      setUserId(user.id);

      // Load user profile
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (userError) throw userError;

      if (userData) {
        console.log('[EditGoals] User data loaded:', userData);
        setSex(userData.sex || 'male');
        setHeightCm(userData.height || 170);
        setWeightKg(userData.current_weight || 70);
        setUnits(userData.preferred_units || 'metric');
        setActivityLevel(userData.activity_level || 'moderate');

        // Calculate age from date_of_birth
        if (userData.date_of_birth) {
          const birthDate = new Date(userData.date_of_birth);
          const today = new Date();
          let calculatedAge = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            calculatedAge--;
          }
          setAge(calculatedAge);
        }
      }

      // Load active goal
      const { data: goalData, error: goalError } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (goalError) throw goalError;

      if (goalData) {
        console.log('[EditGoals] Goal data loaded:', goalData);
        setGoalType(goalData.goal_type);
        if (goalData.loss_rate_lbs_per_week) {
          setLossRateLbsPerWeek(goalData.loss_rate_lbs_per_week);
        }
        
        // Try to detect which preset was used based on macro ratios
        const totalCals = goalData.daily_calories;
        const proteinPercent = Math.round((goalData.protein_g * 4 / totalCals) * 100);
        const carbsPercent = Math.round((goalData.carbs_g * 4 / totalCals) * 100);
        const fatsPercent = Math.round((goalData.fats_g * 9 / totalCals) * 100);
        
        console.log('[EditGoals] Current macro percentages:', { proteinPercent, carbsPercent, fatsPercent });
        
        // Check if it matches a preset (with 2% tolerance)
        if (Math.abs(proteinPercent - 30) <= 2 && Math.abs(carbsPercent - 40) <= 2 && Math.abs(fatsPercent - 30) <= 2) {
          setMacroPreset('balanced');
        } else if (Math.abs(proteinPercent - 40) <= 2 && Math.abs(carbsPercent - 35) <= 2 && Math.abs(fatsPercent - 25) <= 2) {
          setMacroPreset('high_protein');
        } else if (Math.abs(proteinPercent - 35) <= 2 && Math.abs(carbsPercent - 25) <= 2 && Math.abs(fatsPercent - 40) <= 2) {
          setMacroPreset('low_carb');
        } else if (Math.abs(proteinPercent - 25) <= 2 && Math.abs(carbsPercent - 5) <= 2 && Math.abs(fatsPercent - 70) <= 2) {
          setMacroPreset('keto');
        } else {
          setMacroPreset('custom');
          setCustomProteinPercent(proteinPercent.toString());
          setCustomCarbsPercent(carbsPercent.toString());
          setCustomFatsPercent(fatsPercent.toString());
        }
      }
    } catch (error: any) {
      console.error('[EditGoals] Error loading data:', error);
      Alert.alert('Error', 'Failed to load your current goals');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadCurrentGoals();
  }, [loadCurrentGoals]);

  const validateMacros = (): boolean => {
    if (macroPreset !== 'custom') return true;

    const protein = parseFloat(customProteinPercent) || 0;
    const carbs = parseFloat(customCarbsPercent) || 0;
    const fats = parseFloat(customFatsPercent) || 0;
    const total = protein + carbs + fats;

    if (Math.abs(total - 100) > 0.5) {
      setMacroError(`Macros must total 100% (currently ${total.toFixed(1)}%)`);
      return false;
    }

    setMacroError('');
    return true;
  };

  const handleSave = async () => {
    if (!validateMacros()) {
      Alert.alert('Invalid Macros', macroError);
      return;
    }

    setSaving(true);

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

      // Deactivate current goals
      await supabase
        .from('goals')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('is_active', true);

      // Create new goal
      const goalData: any = {
        user_id: userId,
        goal_type: goalType,
        goal_intensity: 1,
        daily_calories: targetCalories,
        protein_g: macros.protein,
        carbs_g: macros.carbs,
        fats_g: macros.fats,
        fiber_g: macros.fiber,
        is_active: true,
      };

      if (goalType === 'lose') {
        goalData.loss_rate_lbs_per_week = lossRateLbsPerWeek;
      }

      const { error: goalError } = await supabase
        .from('goals')
        .insert(goalData);

      if (goalError) throw goalError;

      // Update user activity level if changed
      await supabase
        .from('users')
        .update({
          activity_level: activityLevel,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      console.log('[EditGoals] ✅ Goals updated successfully');

      // Show success message
      Alert.alert(
        'Goals Updated!',
        `Your new daily calorie target is ${targetCalories} kcal`,
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (error: any) {
      console.error('[EditGoals] Error:', error);
      Alert.alert('Error', error.message || 'Failed to update your goals. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            Loading your goals...
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
              android_material_icon_name="arrow_back"
              size={24}
              color={isDark ? colors.textDark : colors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Edit Goals
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Goal Type */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>Goal *</Text>
            <View style={styles.goalOptions}>
              <TouchableOpacity
                style={[
                  styles.goalOption,
                  { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border },
                  goalType === 'lose' && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setGoalType('lose')}
              >
                <Text style={styles.goalIcon}>📉</Text>
                <Text style={[styles.goalText, { color: isDark ? colors.textDark : colors.text }, goalType === 'lose' && { color: '#FFFFFF' }]}>
                  Lose Weight
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
                  Maintain
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
                <Text style={styles.goalIcon}>📈</Text>
                <Text style={[styles.goalText, { color: isDark ? colors.textDark : colors.text }, goalType === 'gain' && { color: '#FFFFFF' }]}>
                  Gain Weight
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Weight Loss Rate */}
          {goalType === 'lose' && (
            <View style={styles.section}>
              <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                Weight Loss Rate *
              </Text>
              <View style={styles.activityOptions}>
                <LossRateOption
                  label="0.5 lb per week"
                  description="Slow and steady"
                  value={0.5}
                  selected={lossRateLbsPerWeek === 0.5}
                  onPress={() => setLossRateLbsPerWeek(0.5)}
                  isDark={isDark}
                />
                <LossRateOption
                  label="1.0 lb per week"
                  description="Moderate"
                  value={1.0}
                  selected={lossRateLbsPerWeek === 1.0}
                  onPress={() => setLossRateLbsPerWeek(1.0)}
                  isDark={isDark}
                />
                <LossRateOption
                  label="1.5 lb per week"
                  description="Fast"
                  value={1.5}
                  selected={lossRateLbsPerWeek === 1.5}
                  onPress={() => setLossRateLbsPerWeek(1.5)}
                  isDark={isDark}
                />
                <LossRateOption
                  label="2.0 lb per week"
                  description="Very aggressive"
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
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>Activity Level *</Text>
            <View style={styles.activityOptions}>
              <ActivityOption
                label="Sedentary"
                description="Little or no exercise"
                selected={activityLevel === 'sedentary'}
                onPress={() => setActivityLevel('sedentary')}
                isDark={isDark}
              />
              <ActivityOption
                label="Light"
                description="Exercise 1-3 days/week"
                selected={activityLevel === 'light'}
                onPress={() => setActivityLevel('light')}
                isDark={isDark}
              />
              <ActivityOption
                label="Moderate"
                description="Exercise 3-5 days/week"
                selected={activityLevel === 'moderate'}
                onPress={() => setActivityLevel('moderate')}
                isDark={isDark}
              />
              <ActivityOption
                label="Very Active"
                description="Exercise 6-7 days/week"
                selected={activityLevel === 'very_active'}
                onPress={() => setActivityLevel('very_active')}
                isDark={isDark}
              />
            </View>
          </View>

          {/* Macro Presets */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
              Macro Split *
            </Text>
            <Text style={[styles.helperText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Choose a preset or customize your macro percentages
            </Text>
            
            <View style={styles.presetOptions}>
              <MacroPresetOption
                label="Balanced"
                description="30% protein / 40% carbs / 30% fats"
                value="balanced"
                selected={macroPreset === 'balanced'}
                onPress={() => setMacroPreset('balanced')}
                isDark={isDark}
              />
              <MacroPresetOption
                label="High Protein"
                description="40% protein / 35% carbs / 25% fats"
                value="high_protein"
                selected={macroPreset === 'high_protein'}
                onPress={() => setMacroPreset('high_protein')}
                isDark={isDark}
              />
              <MacroPresetOption
                label="Low Carb"
                description="35% protein / 25% carbs / 40% fats"
                value="low_carb"
                selected={macroPreset === 'low_carb'}
                onPress={() => setMacroPreset('low_carb')}
                isDark={isDark}
              />
              <MacroPresetOption
                label="Keto"
                description="25% protein / 5% carbs / 70% fats"
                value="keto"
                selected={macroPreset === 'keto'}
                onPress={() => setMacroPreset('keto')}
                isDark={isDark}
              />
              <MacroPresetOption
                label="Custom"
                description="Set your own percentages"
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
                      Protein %
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
                      Carbs %
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
                      Fats %
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
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Save Changes</Text>
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
