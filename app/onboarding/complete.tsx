
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Platform, Alert, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Sex, GoalType, ActivityLevel } from '@/types';
import { supabase } from '@/app/integrations/supabase/client';
import { calculateBMR, calculateTDEE, calculateTargetCalories, calculateMacros } from '@/utils/calculations';

export default function CompleteOnboardingScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Personal Info
  const [sex, setSex] = useState<Sex>('male');
  const [age, setAge] = useState('');
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  
  // Height
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [heightCm, setHeightCm] = useState('');
  
  // Weight
  const [weight, setWeight] = useState('');
  
  // Goal
  const [goalType, setGoalType] = useState<GoalType>('lose');
  
  // Weight Loss Rate (only for 'lose' goal)
  const [lossRateLbsPerWeek, setLossRateLbsPerWeek] = useState<number>(1.0);
  
  // Activity
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  
  const [saving, setSaving] = useState(false);

  const handleComplete = async () => {
    // Validation
    if (!age || !weight) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (units === 'imperial') {
      if (!heightFeet || !heightInches) {
        Alert.alert('Error', 'Please enter both feet and inches for height');
        return;
      }
    } else {
      if (!heightCm) {
        Alert.alert('Error', 'Please enter your height');
        return;
      }
    }

    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        Alert.alert('Error', 'You must be logged in');
        setSaving(false);
        return;
      }

      // Convert height to cm for storage
      let heightInCm: number;
      if (units === 'imperial') {
        const totalInches = parseInt(heightFeet) * 12 + parseInt(heightInches);
        heightInCm = totalInches * 2.54;
      } else {
        heightInCm = parseInt(heightCm);
      }

      // Convert weight to kg for storage
      let weightInKg: number;
      if (units === 'imperial') {
        weightInKg = parseFloat(weight) * 0.453592;
      } else {
        weightInKg = parseFloat(weight);
      }

      const ageNum = parseInt(age);

      console.log('[Onboarding] Calculating goals with:', {
        weight: weightInKg,
        height: heightInCm,
        age: ageNum,
        sex,
        activityLevel,
        goalType,
        lossRateLbsPerWeek: goalType === 'lose' ? lossRateLbsPerWeek : null,
      });

      // Calculate BMR and TDEE
      const bmr = calculateBMR(weightInKg, heightInCm, ageNum, sex);
      const tdee = calculateTDEE(bmr, activityLevel);
      
      // Calculate target calories based on goal type and loss rate
      const targetCalories = calculateTargetCalories(
        tdee, 
        goalType, 
        goalType === 'lose' ? lossRateLbsPerWeek : undefined
      );
      
      const macros = calculateMacros(targetCalories, weightInKg, 'balanced');

      console.log('[Onboarding] Calculated:', {
        bmr,
        tdee,
        targetCalories,
        macros,
        lossRateLbsPerWeek: goalType === 'lose' ? lossRateLbsPerWeek : null,
      });

      // Calculate date of birth
      const currentYear = new Date().getFullYear();
      const birthYear = currentYear - ageNum;
      const dateOfBirth = `${birthYear}-01-01`;

      // Update user profile
      const { error: userError } = await supabase
        .from('users')
        .update({
          sex,
          date_of_birth: dateOfBirth,
          height: heightInCm,
          current_weight: weightInKg,
          activity_level: activityLevel,
          preferred_units: units,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (userError) {
        console.error('[Onboarding] User update error:', userError);
        throw userError;
      }

      console.log('[Onboarding] User profile updated');

      // Deactivate any existing goals
      await supabase
        .from('goals')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('is_active', true);

      // Create new goal with loss rate if applicable
      const goalData: any = {
        user_id: user.id,
        goal_type: goalType,
        goal_intensity: 1,
        daily_calories: targetCalories,
        protein_g: macros.protein,
        carbs_g: macros.carbs,
        fats_g: macros.fats,
        fiber_g: macros.fiber,
        is_active: true,
      };

      // Add loss rate only for weight loss goal
      if (goalType === 'lose') {
        goalData.loss_rate_lbs_per_week = lossRateLbsPerWeek;
      }

      const { error: goalError } = await supabase
        .from('goals')
        .insert(goalData);

      if (goalError) {
        console.error('[Onboarding] Goal creation error:', goalError);
        throw goalError;
      }

      console.log('[Onboarding] Goal created successfully');

      Alert.alert(
        'Success!',
        `Your daily calorie target is ${targetCalories} kcal`,
        [
          {
            text: 'Start Tracking',
            onPress: () => router.replace('/(tabs)/(home)/'),
          },
        ]
      );
    } catch (error: any) {
      console.error('[Onboarding] Error:', error);
      Alert.alert('Error', error.message || 'Failed to save your information. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={0}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
              Complete Your Profile
            </Text>
            <Text style={[styles.subtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              We&apos;ll calculate your personalized nutrition goals
            </Text>
          </View>

          {/* Sex */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>Sex *</Text>
            <View style={styles.optionRow}>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border },
                  sex === 'male' && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setSex('male')}
              >
                <Text style={[styles.optionText, { color: isDark ? colors.textDark : colors.text }, sex === 'male' && { color: '#FFFFFF' }]}>
                  Male
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border },
                  sex === 'female' && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setSex('female')}
              >
                <Text style={[styles.optionText, { color: isDark ? colors.textDark : colors.text }, sex === 'female' && { color: '#FFFFFF' }]}>
                  Female
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Age */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>Age *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
              placeholder="Enter your age"
              placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
              keyboardType="number-pad"
              value={age}
              onChangeText={setAge}
              returnKeyType="next"
            />
          </View>

          {/* Units */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>Preferred Units *</Text>
            <View style={styles.optionRow}>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border },
                  units === 'metric' && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setUnits('metric')}
              >
                <Text style={[styles.optionText, { color: isDark ? colors.textDark : colors.text }, units === 'metric' && { color: '#FFFFFF' }]}>
                  Metric
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border },
                  units === 'imperial' && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setUnits('imperial')}
              >
                <Text style={[styles.optionText, { color: isDark ? colors.textDark : colors.text }, units === 'imperial' && { color: '#FFFFFF' }]}>
                  Imperial
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Height */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
              Height *
            </Text>
            {units === 'imperial' ? (
              <View style={styles.heightRow}>
                <View style={styles.heightInputContainer}>
                  <Text style={[styles.heightLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    Feet
                  </Text>
                  <TextInput
                    style={[styles.input, styles.heightInput, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                    placeholder="5"
                    placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                    keyboardType="number-pad"
                    value={heightFeet}
                    onChangeText={setHeightFeet}
                    returnKeyType="next"
                  />
                </View>
                <View style={styles.heightInputContainer}>
                  <Text style={[styles.heightLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    Inches
                  </Text>
                  <TextInput
                    style={[styles.input, styles.heightInput, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                    placeholder="9"
                    placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                    keyboardType="number-pad"
                    value={heightInches}
                    onChangeText={setHeightInches}
                    returnKeyType="next"
                  />
                </View>
              </View>
            ) : (
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                placeholder="e.g., 175"
                placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                keyboardType="number-pad"
                value={heightCm}
                onChangeText={setHeightCm}
                returnKeyType="next"
              />
            )}
          </View>

          {/* Weight */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
              Current Weight ({units === 'metric' ? 'kg' : 'lbs'}) *
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
              placeholder={units === 'metric' ? 'e.g., 75' : 'e.g., 165'}
              placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
              keyboardType="decimal-pad"
              value={weight}
              onChangeText={setWeight}
              returnKeyType="next"
            />
          </View>

          {/* Goal */}
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

          {/* Weight Loss Rate - Only show when goal is 'lose' */}
          {goalType === 'lose' && (
            <View style={styles.section}>
              <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                How fast do you want to lose weight? *
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

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
            onPress={handleComplete}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Complete Setup</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'android' ? spacing.xxl : spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.h1,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
  },
  section: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.bodyBold,
    marginBottom: spacing.sm,
  },
  optionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  optionButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    alignItems: 'center',
  },
  optionText: {
    ...typography.bodyBold,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  heightRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  heightInputContainer: {
    flex: 1,
  },
  heightLabel: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  heightInput: {
    marginBottom: 0,
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
