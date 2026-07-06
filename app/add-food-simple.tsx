
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Platform, Alert, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';
import { addToDraft } from '@/utils/myMealsDraft';
import { toLocalDateString } from '@/utils/dateUtils';
import { tryAwardMealLogged, evaluateDailyGoals } from '@/utils/xpAwarder';
import { emitMealLogged } from '@/utils/xpEvents';
import { trackFirstMealIfNeeded } from '@/utils/onboardingAnalytics';
import { logFoodUsage } from '@/utils/logFoodUsage';

export default function AddFoodSimpleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const mode = (params.mode as string) || 'diary';
  const mealType = (params.meal as string) || 'breakfast';
  const date = (params.date as string) || toLocalDateString();
  const returnTo = (params.returnTo as string) || undefined;
  const myMealId = (params.mealId as string) || undefined;

  // Pre-fill parameters from AI Estimator
  const prefillName = (params.prefillName as string) || '';
  const prefillCalories = (params.prefillCalories as string) || '';
  const prefillProtein = (params.prefillProtein as string) || '';
  const prefillCarbs = (params.prefillCarbs as string) || '';
  const prefillFats = (params.prefillFats as string) || '';
  const prefillFiber = (params.prefillFiber as string) || '';

  const [foodName, setFoodName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fats, setFats] = useState('');
  const [fiber, setFiber] = useState('');
  const [saving, setSaving] = useState(false);

  // Pre-fill form when component mounts
  useEffect(() => {
    console.log('[AddFoodSimple] Checking for pre-fill data');
    if (prefillName) {
      console.log('[AddFoodSimple] Pre-filling form with AI estimate data');
      setFoodName(prefillName);
      setCalories(prefillCalories);
      setProtein(prefillProtein);
      setCarbs(prefillCarbs);
      setFats(prefillFats);
      setFiber(prefillFiber);
    }
  }, [prefillName, prefillCalories, prefillProtein, prefillCarbs, prefillFats, prefillFiber]);

  const handleSave = async () => {
    if (!foodName.trim() || !calories.trim()) {
      Alert.alert('Error', 'Please enter at least food name and calories');
      return;
    }

    setSaving(true);

    try {
      console.log('[AddFoodSimple] Starting Quick Add save process...');
      console.log('[AddFoodSimple] Mode:', mode);
      console.log('[AddFoodSimple] Meal:', mealType, 'Date:', date);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[AddFoodSimple] No user found');
        Alert.alert('Error', 'You must be logged in to add food');
        setSaving(false);
        return;
      }

      console.log('[AddFoodSimple] User ID:', user.id);

      // Create food entry
      const foodPayload = {
        name: foodName.trim(),
        serving_amount: 1,
        serving_unit: 'serving',
        calories: parseFloat(calories) || 0,
        protein: parseFloat(protein) || 0,
        carbs: parseFloat(carbs) || 0,
        fats: parseFloat(fats) || 0,
        fiber: parseFloat(fiber) || 0,
        user_created: true,
        created_by: user.id,
      };

      console.log('[AddFoodSimple] Creating food with payload:', foodPayload);

      const { data: foodData, error: foodError } = await supabase
        .from('foods')
        .insert(foodPayload)
        .select()
        .single();

      if (foodError) {
        console.error('[AddFoodSimple] Error creating food:', foodError);
        Alert.alert('Error', `Failed to create food entry: ${foodError.message}`);
        setSaving(false);
        return;
      }

      console.log('[AddFoodSimple] Food created successfully:', foodData);

      const finalCalories = parseFloat(calories) || 0;
      const finalProtein = parseFloat(protein) || 0;
      const finalCarbs = parseFloat(carbs) || 0;
      const finalFats = parseFloat(fats) || 0;
      const finalFiber = parseFloat(fiber) || 0;

      // CHECK MODE: If mymeal, add to draft and navigate back to the meal builder
      if (mode === 'mymeal') {
        console.log('[AddFoodSimple] Mode is mymeal, adding food to meal draft');

        await addToDraft({
          food_id: foodData.id,
          food_name: foodData.name,
          food_brand: foodData.brand || undefined,
          serving_amount: 1,
          serving_unit: 'serving',
          servings_count: 1,
          calories: finalCalories,
          protein: finalProtein,
          carbs: finalCarbs,
          fats: finalFats,
          fiber: finalFiber,
        });

        console.log('[AddFoodSimple] ✅ Food added to draft, navigating back to meal builder');

        setSaving(false);
        // Pop back through add-food to my-meals-create so useFocusEffect reloads the draft
        router.dismiss();
        router.dismiss();
        return;
      }

      // NORMAL DIARY MODE: Log to diary via RPC
      console.log('[AddFoodSimple] Calling log_food RPC for food:', foodData.name, 'mealType:', mealType, 'date:', date);
      const { data: rpcData, error: rpcError } = await supabase.rpc('log_food', {
        p_user_id: user.id,
        p_date: date,
        p_meal_type: mealType,
        p_food_id: foodData.id,
        p_food_item_id: null,
        p_quantity: 1,
        p_calories: finalCalories,
        p_protein: finalProtein,
        p_carbs: finalCarbs,
        p_fats: finalFats,
        p_fiber: finalFiber,
        p_serving_description: '1 serving',
        p_grams: null,
        p_logged_at: new Date().toISOString(),
      });

      if (rpcError) {
        console.error('[AddFoodSimple] log_food RPC error:', rpcError);
        Alert.alert('Error', `Failed to add food to meal: ${rpcError.message}`);
        setSaving(false);
        return;
      }

      const mealId = rpcData?.meal_id;
      console.log('[AddFoodSimple] ✅ log_food RPC success, meal_id:', mealId, 'meal_item_id:', rpcData?.meal_item_id);
      console.log('[AddFoodSimple] Quick Add complete! Dismissing modal back to diary...');

      // ── Log food usage (fire-and-forget) ─────────────────────────────────
      console.log('[AddFoodSimple] Logging food usage, food_id:', foodData.id);
      logFoodUsage(foodData.id, 'search');

      // ── XP: award meal_logged (fire-and-forget) ──────────────────────────
      const xpSourceId = rpcData?.meal_item_id ?? `${mealId}_${foodData.id}_${date}`;
      console.log('[AddFoodSimple] awarding meal XP, source_id:', xpSourceId);
      tryAwardMealLogged(xpSourceId, mealType, date);
      evaluateDailyGoals(date);

      // Notify challenge hook that a meal was logged
      emitMealLogged();
      trackFirstMealIfNeeded();
      
      // Success! Navigate back
      setSaving(false);
      
      // Dismiss the modal stack to return to the existing Food tab without pushing a new one
      router.dismiss();
      
    } catch (error) {
      console.error('[AddFoodSimple] Unexpected error in handleSave:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
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
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow_back"
              size={24}
              color={isDark ? colors.textDark : colors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
            Quick Add
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
              Food Details
            </Text>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                Food Name *
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                placeholder="e.g., Homemade Smoothie"
                placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                value={foodName}
                onChangeText={setFoodName}
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                Calories *
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                placeholder="e.g., 250"
                placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                keyboardType="decimal-pad"
                value={calories}
                onChangeText={setCalories}
                returnKeyType="next"
              />
            </View>

            <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text, marginTop: spacing.lg }]}>
              Macros (Optional)
            </Text>

            <View style={styles.macroRow}>
              <View style={styles.macroInput}>
                <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                  Protein (g)
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                  placeholder="0"
                  placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                  keyboardType="decimal-pad"
                  value={protein}
                  onChangeText={setProtein}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.macroInput}>
                <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                  Carbs (g)
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                  placeholder="0"
                  placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                  keyboardType="decimal-pad"
                  value={carbs}
                  onChangeText={setCarbs}
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.macroRow}>
              <View style={styles.macroInput}>
                <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                  Fats (g)
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                  placeholder="0"
                  placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                  keyboardType="decimal-pad"
                  value={fats}
                  onChangeText={setFats}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.macroInput}>
                <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                  Fiber (g)
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                  placeholder="0"
                  placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                  keyboardType="decimal-pad"
                  value={fiber}
                  onChangeText={setFiber}
                  returnKeyType="done"
                />
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>
                {mode === 'mymeal' ? 'Add to My Meal' : `Add to ${mealType.charAt(0).toUpperCase() + mealType.slice(1)}`}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.h3,
    flex: 1,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.bodyBold,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  macroInput: {
    flex: 1,
  },
  saveButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  bottomSpacer: {
    height: 100,
  },
});
