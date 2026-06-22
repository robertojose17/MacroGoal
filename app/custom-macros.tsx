
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase/client';
import { calculateBMR, calculateTDEE, calculateTargetCalories, calculateAge } from '@/utils/calculations';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';

export default function CustomMacrosScreen() {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fats, setFats] = useState('');

  const proteinNum = parseFloat(protein) || 0;
  const carbsNum = parseFloat(carbs) || 0;
  const fatsNum = parseFloat(fats) || 0;
  const total = proteinNum + carbsNum + fatsNum;
  const totalDisplay = Math.round(total * 10) / 10;
  const isValid = Math.abs(total - 100) <= 0.5;

  useEffect(() => {
    loadCurrentGoal();
  }, []);

  const loadCurrentGoal = async () => {
    console.log('[CustomMacros] Loading current goal from Supabase');
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        console.log('[CustomMacros] No authenticated user found');
        setLoading(false);
        return;
      }

      const { data: goal, error } = await supabase
        .from('goals')
        .select('protein_g, carbs_g, fats_g, daily_calories')
        .eq('user_id', authUser.id)
        .eq('is_active', true)
        .single();

      if (error) {
        console.warn('[CustomMacros] Error loading goal:', error.message);
        setLoading(false);
        return;
      }

      if (goal && goal.daily_calories && goal.daily_calories > 0) {
        const cal = goal.daily_calories;
        const pPct = Math.round(((goal.protein_g * 4) / cal) * 100);
        const cPct = Math.round(((goal.carbs_g * 4) / cal) * 100);
        const fPct = Math.round(((goal.fats_g * 9) / cal) * 100);
        console.log('[CustomMacros] Pre-filling percentages:', { pPct, cPct, fPct });
        setProtein(String(pPct));
        setCarbs(String(cPct));
        setFats(String(fPct));
      } else {
        // Sensible defaults
        setProtein('30');
        setCarbs('40');
        setFats('30');
      }
    } catch (err) {
      console.error('[CustomMacros] Unexpected error loading goal:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = useCallback(async () => {
    console.log('[CustomMacros] Save button pressed — protein:', protein, 'carbs:', carbs, 'fats:', fats);

    if (!isValid) {
      Alert.alert('Invalid Split', `Percentages must sum to 100%. Current total: ${totalDisplay}%`);
      return;
    }

    setSaving(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');

      console.log('[CustomMacros] Fetching user profile from Supabase');
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (userError) throw userError;

      const age = calculateAge(userData.date_of_birth);
      if (!age || !userData.height || !userData.current_weight || !userData.sex || !userData.activity_level) {
        throw new Error('Missing required profile data to recalculate goals');
      }

      console.log('[CustomMacros] Fetching active goal from Supabase');
      const { data: currentGoal, error: goalError } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', authUser.id)
        .eq('is_active', true)
        .single();

      if (goalError) throw goalError;

      const bmr = calculateBMR(userData.current_weight, userData.height, age, userData.sex);
      const tdee = calculateTDEE(bmr, userData.activity_level);
      const targetCalories = calculateTargetCalories(
        tdee,
        currentGoal.goal_type,
        currentGoal.goal_type === 'lose' ? currentGoal.loss_rate_lbs_per_week : undefined
      );

      const proteinPct = proteinNum / 100;
      const carbsPct = carbsNum / 100;
      const fatsPct = fatsNum / 100;

      const protein_g = Math.round((targetCalories * proteinPct) / 4);
      const carbs_g = Math.round((targetCalories * carbsPct) / 4);
      const fats_g = Math.round((targetCalories * fatsPct) / 9);
      const fiber_g = Math.round((targetCalories / 1000) * 14);

      console.log('[CustomMacros] Recalculated macros:', { targetCalories, protein_g, carbs_g, fats_g, fiber_g });

      console.log('[CustomMacros] Deactivating current goal');
      await supabase
        .from('goals')
        .update({ is_active: false })
        .eq('user_id', authUser.id)
        .eq('is_active', true);

      const newGoalData: any = {
        user_id: authUser.id,
        goal_type: currentGoal.goal_type,
        goal_intensity: currentGoal.goal_intensity || 1,
        daily_calories: targetCalories,
        protein_g,
        carbs_g,
        fats_g,
        fiber_g,
        is_active: true,
        start_date: currentGoal.start_date || null,
        macro_preset: 'custom',
      };

      if (currentGoal.goal_type === 'lose') {
        newGoalData.loss_rate_lbs_per_week = currentGoal.loss_rate_lbs_per_week;
      }

      console.log('[CustomMacros] Inserting new goal into Supabase');
      const { error: insertError } = await supabase.from('goals').insert(newGoalData);
      if (insertError) throw insertError;

      console.log('[CustomMacros] Goal saved successfully');
      Alert.alert('Saved!', 'Your custom macro split has been applied.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      console.error('[CustomMacros] Error saving custom macros:', err);
      Alert.alert('Error', err.message || 'Failed to save custom macro split');
    } finally {
      setSaving(false);
    }
  }, [protein, carbs, fats, isValid, proteinNum, carbsNum, fatsNum, totalDisplay]);

  const bg = isDark ? colors.backgroundDark : colors.primaryBackground;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textPrimary = isDark ? colors.textDark : colors.primaryText;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const inputBg = isDark ? colors.cardDark : '#FFFFFF';
  const inputBorder = isDark ? colors.borderDark : colors.border;

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const totalColor = isValid ? colors.success : colors.error;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm, borderBottomColor: cardBorder }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            console.log('[CustomMacros] Back button pressed');
            router.back();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.backText, { color: colors.accent }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>Custom Macro Split</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.subtitle, { color: textSecondary }]}>
          Set the percentage of calories from each macronutrient. They must add up to 100%.
        </Text>

        {/* Macro Inputs Card */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <MacroRow
            label="Protein"
            color={colors.protein}
            value={protein}
            onChangeText={(v) => {
              console.log('[CustomMacros] Protein % changed:', v);
              setProtein(v);
            }}
            isDark={isDark}
            inputBg={inputBg}
            inputBorder={inputBorder}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
          />
          <View style={[styles.divider, { backgroundColor: cardBorder }]} />
          <MacroRow
            label="Carbs"
            color={colors.carbs}
            value={carbs}
            onChangeText={(v) => {
              console.log('[CustomMacros] Carbs % changed:', v);
              setCarbs(v);
            }}
            isDark={isDark}
            inputBg={inputBg}
            inputBorder={inputBorder}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
          />
          <View style={[styles.divider, { backgroundColor: cardBorder }]} />
          <MacroRow
            label="Fats"
            color={colors.fats}
            value={fats}
            onChangeText={(v) => {
              console.log('[CustomMacros] Fats % changed:', v);
              setFats(v);
            }}
            isDark={isDark}
            inputBg={inputBg}
            inputBorder={inputBorder}
            textPrimary={textPrimary}
            textSecondary={textSecondary}
          />
        </View>

        {/* Total indicator */}
        <View style={[styles.totalRow, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <Text style={[styles.totalLabel, { color: textSecondary }]}>Total</Text>
          <Text style={[styles.totalValue, { color: totalColor }]}>
            {totalDisplay}%
          </Text>
          {isValid ? (
            <Text style={[styles.totalBadge, { color: colors.success }]}>✓</Text>
          ) : (
            <Text style={[styles.totalBadge, { color: colors.error }]}>
              {total < 100 ? `${Math.round((100 - total) * 10) / 10}% short` : `${Math.round((total - 100) * 10) / 10}% over`}
            </Text>
          )}
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[
            styles.saveButton,
            { backgroundColor: isValid ? colors.accent : colors.disabled },
          ]}
          onPress={handleSave}
          disabled={!isValid || saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface MacroRowProps {
  label: string;
  color: string;
  value: string;
  onChangeText: (v: string) => void;
  isDark: boolean;
  inputBg: string;
  inputBorder: string;
  textPrimary: string;
  textSecondary: string;
}

function MacroRow({ label, color, value, onChangeText, inputBg, inputBorder, textPrimary, textSecondary }: MacroRowProps) {
  return (
    <View style={styles.macroRow}>
      <View style={[styles.macroColorDot, { backgroundColor: color }]} />
      <Text style={[styles.macroLabel, { color: textPrimary }]}>{label}</Text>
      <View style={styles.macroInputWrapper}>
        <TextInput
          style={[styles.macroInput, { backgroundColor: inputBg, borderColor: inputBorder, color: textPrimary }]}
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          maxLength={5}
          placeholder="0"
          placeholderTextColor={textSecondary}
          selectTextOnFocus
        />
        <Text style={[styles.percentSign, { color: textSecondary }]}>%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: {
    width: 70,
  },
  backText: {
    ...typography.body,
  },
  headerTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  subtitle: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  macroColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  macroLabel: {
    ...typography.bodyBold,
    flex: 1,
  },
  macroInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  macroInput: {
    width: 72,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  percentSign: {
    ...typography.bodyBold,
    width: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  totalLabel: {
    ...typography.bodyBold,
    flex: 1,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  totalBadge: {
    ...typography.caption,
    fontWeight: '600',
    minWidth: 70,
    textAlign: 'right',
  },
  saveButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
