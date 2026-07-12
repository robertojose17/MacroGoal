
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import {
  getTemplatePlanDetail,
  type TemplatePlanDetail,
  type TemplateMealItem,
  type TemplateItem,
  type SelectedProteins,
} from '@/utils/templatePlansApi';
import { supabase } from '@/lib/supabase/client';
import { toLocalDateString } from '@/utils/dateUtils';
import { usePremium } from '@/hooks/usePremium';

const GOLD = '#F59E0B';

type MealKey = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MEAL_DEFS: { key: MealKey; label: string; emoji: string }[] = [
  { key: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { key: 'lunch', label: 'Lunch', emoji: '☀️' },
  { key: 'dinner', label: 'Dinner', emoji: '🌙' },
  { key: 'snack', label: 'Snack', emoji: '🍎' },
];

const DEFAULT_PROTEINS: SelectedProteins = {
  breakfast: 'Eggs',
  lunch: 'Chicken',
  dinner: 'Salmon',
  snack: 'Greek Yogurt',
};

async function createMealPlanFromTemplate(
  plan: TemplatePlanDetail,
  selectedProtein: string
): Promise<void> {
  console.log('[TemplatePlanDetail] createMealPlanFromTemplate start:', plan.name, selectedProtein);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 6);
  const startDate = toLocalDateString(today);
  const endDate = toLocalDateString(nextWeek);
  const planName = plan.name;

  console.log('[TemplatePlanDetail] Inserting meal_plan:', planName);
  const { data: newPlan, error: planError } = await supabase
    .from('meal_plans')
    .insert({
      user_id: user.id,
      name: planName,
      description: plan.description || '',
      start_date: startDate,
      end_date: endDate,
    })
    .select()
    .single();

  if (planError || !newPlan) {
    console.error('[TemplatePlanDetail] Failed to create meal plan:', planError?.message);
    throw new Error(planError?.message || 'Failed to create meal plan');
  }

  console.log('[TemplatePlanDetail] Meal plan created:', newPlan.id);

  const meals = plan.day?.meals;
  if (!meals) {
    console.warn('[TemplatePlanDetail] No meals in template day');
    return;
  }

  const insertItems: object[] = [];

  for (const mealDef of MEAL_DEFS) {
    const items: TemplateItem[] = meals[mealDef.key] ?? [];
    for (const item of items) {
      const grams = Math.round(Number(item.grams) || 0);
      const calories = Math.round(Number(item.calories) || 0);
      const protein = Math.round(Number(item.protein_g) || 0);
      const carbs = Math.round(Number(item.carbs_g) || 0);
      const fats = Math.round(Number(item.fats_g) || 0);

      insertItems.push({
        plan_id: newPlan.id,
        date: startDate,
        meal_type: mealDef.key,
        food_name: item.food_name,
        quantity: 1,
        grams: grams > 0 ? grams : null,
        serving_unit: grams > 0 ? 'g' : null,
        serving_description: grams > 0 ? grams + 'g' : null,
        calories,
        protein,
        carbs,
        fats,
        fiber: 0,
        food_item_id: item.food_item_id || null,
      });
    }
  }

  if (insertItems.length > 0) {
    console.log('[TemplatePlanDetail] Inserting', insertItems.length, 'meal_plan_items');
    const { error: itemsError } = await supabase
      .from('meal_plan_items')
      .insert(insertItems);
    if (itemsError) {
      console.error('[TemplatePlanDetail] Failed to insert meal plan items:', itemsError.message);
      throw new Error(itemsError.message);
    }
  }

  console.log('[TemplatePlanDetail] createMealPlanFromTemplate complete');
}

export default function TemplatePlanDetailScreen() {
  const router = useRouter();
  const { templateId } = useLocalSearchParams<{ templateId: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { isPremium, loading: premiumLoading } = usePremium();

  const [plan, setPlan] = useState<TemplatePlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProteins, setSelectedProteins] = useState<SelectedProteins>(DEFAULT_PROTEINS);
  const [proteinLoadingMeal, setProteinLoadingMeal] = useState<string | null>(null);

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const borderColor = isDark ? colors.borderDark : colors.border;
  const cardBorderColor = isDark ? colors.cardBorderDark : colors.cardBorder;

  const loadPlan = useCallback(async (proteins?: SelectedProteins) => {
    if (!templateId) return;
    const proteinsToUse = proteins ?? selectedProteins;
    console.log('[TemplatePlanDetail] Loading template plan:', templateId, 'proteins:', proteinsToUse);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error('Not authenticated');
      const result = await getTemplatePlanDetail(templateId, userId, undefined, proteinsToUse);
      if (!result) throw new Error('No data returned');
      console.log('[TemplatePlanDetail] Plan loaded:', result?.name, 'selected_proteins:', result?.selected_proteins);
      setPlan(result);
      if (result.selected_proteins && Object.keys(result.selected_proteins).length > 0) {
        setSelectedProteins(result.selected_proteins);
      }
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[TemplatePlanDetail] Error loading plan:', msg);
      setError('Failed to load plan. Please try again.');
    } finally {
      setLoading(false);
      setProteinLoadingMeal(null);
    }
  }, [templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      if (!premiumLoading && !isPremium) {
        console.log('[TemplatePlanDetail] Non-premium user, redirecting to subscription');
        router.replace('/subscription');
      }
    }, [isPremium, premiumLoading, router])
  );

  useFocusEffect(
    useCallback(() => {
      console.log('[TemplatePlanDetail] Screen focused');
      setLoading(true);
      loadPlan({ breakfast: 'Eggs', lunch: 'Chicken', dinner: 'Salmon', snack: 'Greek Yogurt' });
    }, [loadPlan])
  );

  const handleBack = () => {
    console.log('[TemplatePlanDetail] Back button pressed');
    router.back();
  };

  const handleProteinSelect = (mealKey: string, proteinName: string) => {
    if (proteinName === selectedProteins[mealKey] || proteinLoadingMeal !== null) return;
    console.log('[TemplatePlanDetail] Protein chip pressed — meal:', mealKey, 'protein:', proteinName);
    const newProteins = { ...selectedProteins, [mealKey]: proteinName };
    setSelectedProteins(newProteins);
    setProteinLoadingMeal(mealKey);
    loadPlan(newProteins);
  };

  const handleAddToMyPlans = async () => {
    if (!plan) return;
    const lunchProtein = selectedProteins.lunch ?? 'Chicken';
    console.log('[TemplatePlanDetail] Add to My Plans pressed, lunch protein:', lunchProtein);
    setSaving(true);
    try {
      await createMealPlanFromTemplate(plan, lunchProtein);
      console.log('[TemplatePlanDetail] Plan saved successfully');
      Alert.alert(
        'Added to My Plans!',
        'You can now assign it to days in your calendar.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[TemplatePlanDetail] Save error:', msg);
      Alert.alert('Error', 'Failed to save plan. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (premiumLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: textColor }]}>Plan Details</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !plan) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: textColor }]}>Plan Details</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: textColor }]}>{error ?? 'Plan not found.'}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              console.log('[TemplatePlanDetail] Retry button pressed');
              setLoading(true);
              loadPlan(selectedProteins);
            }}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const caloriesGoal = plan.user_calories_goal;
  const proteinGoal = plan.user_protein_goal;
  const carbsGoal = plan.user_carbs_goal;
  const fatsGoal = plan.user_fats_goal;

  const dayMeals = plan.day?.meals;

  // Calculate plan day totals across all meals
  const allItems = dayMeals
    ? [...(dayMeals.breakfast ?? []), ...(dayMeals.lunch ?? []), ...(dayMeals.dinner ?? []), ...(dayMeals.snack ?? [])]
    : [];
  const planAvgCalories = Math.round(allItems.reduce((s, i) => s + (Number(i.calories) || 0), 0));
  const planAvgProtein = Math.round(allItems.reduce((s, i) => s + (Number(i.protein_g) || 0), 0));
  const planAvgCarbs = Math.round(allItems.reduce((s, i) => s + (Number(i.carbs_g) || 0), 0));
  const planAvgFats = Math.round(allItems.reduce((s, i) => s + (Number(i.fats_g) || 0), 0));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEmoji}>{plan.emoji}</Text>
          <Text style={[styles.headerTitle, { color: textColor }]} numberOfLines={1}>
            {plan.name}
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary card */}
        <View style={[styles.summaryCard, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>
          <Text style={[styles.summaryCardTitle, { color: textColor }]}>Adjusted to your goals</Text>

          {/* Divider */}
          <View style={[styles.summaryDivider, { backgroundColor: isDark ? colors.borderDark : colors.border }]} />

          {/* Goal row */}
          <View style={styles.summaryTableRow}>
            <Text style={[styles.summaryTableLabel, { color: secondaryColor }]}>Goal</Text>
            <View style={styles.summaryTablePills}>
              <View style={[styles.macroPill, { backgroundColor: colors.calories + '22' }]}>
                <Text style={[styles.macroPillValue, { color: colors.calories }]}>{caloriesGoal}</Text>
                <Text style={[styles.macroPillUnit, { color: colors.calories }]}>kcal</Text>
              </View>
              <View style={[styles.macroPill, { backgroundColor: colors.protein + '22' }]}>
                <Text style={[styles.macroPillValue, { color: colors.protein }]}>{proteinGoal}</Text>
                <Text style={[styles.macroPillUnit, { color: colors.protein }]}>P</Text>
              </View>
              <View style={[styles.macroPill, { backgroundColor: colors.carbs + '22' }]}>
                <Text style={[styles.macroPillValue, { color: colors.carbs }]}>{carbsGoal}</Text>
                <Text style={[styles.macroPillUnit, { color: colors.carbs }]}>C</Text>
              </View>
              <View style={[styles.macroPill, { backgroundColor: colors.fats + '22' }]}>
                <Text style={[styles.macroPillValue, { color: colors.fats }]}>{fatsGoal}</Text>
                <Text style={[styles.macroPillUnit, { color: colors.fats }]}>F</Text>
              </View>
            </View>
          </View>

          {/* Plan Avg row */}
          <View style={[styles.summaryTableRow, styles.summaryTableRowLast]}>
            <Text style={[styles.summaryTableLabel, { color: secondaryColor }]}>Plan Avg</Text>
            <View style={styles.summaryTablePills}>
              <View style={[styles.macroPill, { backgroundColor: colors.calories + '22' }]}>
                <Text style={[styles.macroPillValue, { color: colors.calories }]}>{planAvgCalories}</Text>
                <Text style={[styles.macroPillUnit, { color: colors.calories }]}>kcal</Text>
              </View>
              <View style={[styles.macroPill, { backgroundColor: colors.protein + '22' }]}>
                <Text style={[styles.macroPillValue, { color: colors.protein }]}>{planAvgProtein}</Text>
                <Text style={[styles.macroPillUnit, { color: colors.protein }]}>P</Text>
              </View>
              <View style={[styles.macroPill, { backgroundColor: colors.carbs + '22' }]}>
                <Text style={[styles.macroPillValue, { color: colors.carbs }]}>{planAvgCarbs}</Text>
                <Text style={[styles.macroPillUnit, { color: colors.carbs }]}>C</Text>
              </View>
              <View style={[styles.macroPill, { backgroundColor: colors.fats + '22' }]}>
                <Text style={[styles.macroPillValue, { color: colors.fats }]}>{planAvgFats}</Text>
                <Text style={[styles.macroPillUnit, { color: colors.fats }]}>F</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Meal sections */}
        {MEAL_DEFS.map((mealDef, mealIdx) => {
          const items: TemplateItem[] = dayMeals?.[mealDef.key] ?? [];
          const isLast = mealIdx === MEAL_DEFS.length - 1;

          const mealCalories = Math.round(items.reduce((s, i) => s + (Number(i.calories) || 0), 0));
          const mealProtein = Math.round(items.reduce((s, i) => s + (Number(i.protein_g) || 0), 0));
          const mealCarbs = Math.round(items.reduce((s, i) => s + (Number(i.carbs_g) || 0), 0));
          const mealFats = Math.round(items.reduce((s, i) => s + (Number(i.fats_g) || 0), 0));

          const mealProteinOptions = plan.protein_options_by_meal?.[mealDef.key] ?? [];
          const currentProtein = selectedProteins[mealDef.key];
          const isMealLoading = proteinLoadingMeal === mealDef.key;

          return (
            <View
              key={mealDef.key}
              style={[
                styles.mealCard,
                { backgroundColor: cardBg, borderColor: cardBorderColor },
                !isLast && styles.mealCardSpacing,
              ]}
            >
              {/* Meal header */}
              <View style={styles.mealHeader}>
                <View style={styles.mealHeaderLeft}>
                  <Text style={styles.mealEmoji}>{mealDef.emoji}</Text>
                  <Text style={[styles.mealTitle, { color: textColor }]}>{mealDef.label}</Text>
                </View>
                {items.length > 0 && (
                  <Text style={[styles.mealCaloriesLabel, { color: secondaryColor }]}>
                    {mealCalories}
                    {' kcal'}
                  </Text>
                )}
              </View>

              {/* Per-meal protein selector */}
              {mealProteinOptions.length > 0 && (
                <View style={styles.mealProteinRow}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.mealProteinChipsContent}
                  >
                    {mealProteinOptions.map((option) => {
                      const isSelected = option.protein_name === currentProtein;
                      return (
                        <TouchableOpacity
                          key={option.protein_name}
                          style={[
                            styles.mealProteinChip,
                            isSelected
                              ? { backgroundColor: colors.primary, borderColor: colors.primary }
                              : { backgroundColor: cardBg, borderColor: isDark ? colors.borderDark : colors.border },
                          ]}
                          onPress={() => handleProteinSelect(mealDef.key, option.protein_name)}
                          activeOpacity={0.7}
                          disabled={proteinLoadingMeal !== null}
                        >
                          <Text style={[
                            styles.mealProteinChipText,
                            { color: isSelected ? '#fff' : textColor },
                          ]}>
                            {option.protein_name}
                          </Text>
                          {isMealLoading && isSelected && (
                            <ActivityIndicator size="small" color="#fff" style={{ marginLeft: 4 }} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Meal macro summary */}
              {items.length > 0 && (
                <View style={styles.mealMacroRow}>
                  <View style={[styles.macroPill, { backgroundColor: colors.protein + '22' }]}>
                    <Text style={[styles.macroPillValue, { color: colors.protein }]}>{mealProtein}</Text>
                    <Text style={[styles.macroPillUnit, { color: colors.protein }]}>P</Text>
                  </View>
                  <View style={[styles.macroPill, { backgroundColor: colors.carbs + '22' }]}>
                    <Text style={[styles.macroPillValue, { color: colors.carbs }]}>{mealCarbs}</Text>
                    <Text style={[styles.macroPillUnit, { color: colors.carbs }]}>C</Text>
                  </View>
                  <View style={[styles.macroPill, { backgroundColor: colors.fats + '22' }]}>
                    <Text style={[styles.macroPillValue, { color: colors.fats }]}>{mealFats}</Text>
                    <Text style={[styles.macroPillUnit, { color: colors.fats }]}>F</Text>
                  </View>
                </View>
              )}

              {/* Items */}
              {items.length === 0 ? (
                <Text style={[styles.emptyMealText, { color: secondaryColor }]}>No foods for this meal</Text>
              ) : (
                items.map((item, idx) => {
                  const isLastItem = idx === items.length - 1;
                  const itemCalories = Math.round(Number(item.calories) || 0);
                  const itemProtein = Math.round(Number(item.protein_g) || 0);
                  const itemCarbs = Math.round(Number(item.carbs_g) || 0);
                  const itemFats = Math.round(Number(item.fats_g) || 0);
                  const itemGrams = Math.round(Number(item.grams) || 0);
                  const gramsText = itemGrams > 0 ? itemGrams + 'g' : '';
                  const proteinText = itemProtein + 'g';
                  const carbsText = itemCarbs + 'g';
                  const fatsText = itemFats + 'g';
                  const isProteinItem = item.protein_role != null;

                  return (
                    <View
                      key={idx}
                      style={[
                        styles.foodItem,
                        idx === 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: borderColor },
                        !isLastItem && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: borderColor },
                      ]}
                    >
                      <View style={styles.foodItemInfo}>
                        <View style={styles.foodItemNameRow}>
                          <Text style={[styles.foodItemName, { color: textColor }]} numberOfLines={2}>
                            {item.food_name}
                          </Text>
                          {isProteinItem && (
                            <Text style={styles.proteinBadge}>{'💪'}</Text>
                          )}
                        </View>
                        <View style={styles.foodItemMetaRow}>
                          {gramsText !== '' && (
                            <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                              {gramsText}
                            </Text>
                          )}
                          {gramsText !== '' && (
                            <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                              {'  ·  '}
                            </Text>
                          )}
                          <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                            {'P: '}
                          </Text>
                          <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                            {proteinText}
                          </Text>
                          <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                            {'  ·  C: '}
                          </Text>
                          <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                            {carbsText}
                          </Text>
                          <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                            {'  ·  F: '}
                          </Text>
                          <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                            {fatsText}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.foodItemRight}>
                        <Text style={[styles.foodItemCalories, { color: textColor }]}>{itemCalories}</Text>
                        <Text style={[styles.foodItemKcal, { color: secondaryColor }]}>kcal</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          );
        })}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Sticky Add to My Plans button */}
      <View style={[styles.stickyFooter, { backgroundColor: bgColor, borderTopColor: borderColor }]}>
        <TouchableOpacity
          style={[
            styles.addButton,
            { backgroundColor: colors.primary },
            saving && styles.addButtonDisabled,
          ]}
          onPress={handleAddToMyPlans}
          activeOpacity={0.85}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.addButtonText}>{'+ Add to My Plans'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorText: { ...typography.body, textAlign: 'center', marginBottom: spacing.lg },
  retryButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
  },
  retryButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { padding: spacing.xs, marginRight: spacing.sm },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerEmoji: { fontSize: 22 },
  headerTitle: { ...typography.h3, flex: 1 },
  headerRight: { width: 40 },

  // Scroll
  scrollContent: { padding: spacing.md, paddingBottom: 24 },

  // Summary card
  summaryCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
    elevation: 2,
  },
  summaryCardTitle: { ...typography.bodyBold, marginBottom: 4 },

  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  summaryTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryTableRowLast: {
    marginBottom: 0,
  },
  summaryTableLabel: {
    fontSize: 13,
    fontWeight: '500',
    width: 64,
  },
  summaryTablePills: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'nowrap',
  },

  // Macro pills
  macroPills: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  macroPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  macroPillValue: { fontSize: 13, fontWeight: '700' },
  macroPillUnit: { fontSize: 10, fontWeight: '600' },

  // Meal card
  mealCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 2,
  },
  mealCardSpacing: { marginBottom: spacing.md },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  mealHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mealEmoji: { fontSize: 18 },
  mealTitle: { ...typography.bodyBold },
  mealCaloriesLabel: { fontSize: 13, fontWeight: '600' },

  // Per-meal protein chips
  mealProteinRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  mealProteinChipsContent: {
    gap: 6,
    paddingRight: 16,
  },
  mealProteinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  mealProteinChipText: {
    fontSize: 13,
    fontWeight: '500',
  },

  mealMacroRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  emptyMealText: {
    ...typography.caption,
    fontStyle: 'italic',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },

  // Food item
  foodItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  foodItemInfo: { flex: 1 },
  foodItemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  foodItemName: { fontSize: 14, fontWeight: '600', lineHeight: 20, flexShrink: 1 },
  proteinBadge: { fontSize: 13 },
  foodItemMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  foodItemMeta: { fontSize: 12, lineHeight: 16 },
  foodItemRight: { alignItems: 'flex-end', paddingTop: 2 },
  foodItemCalories: { fontSize: 15, fontWeight: '700' },
  foodItemKcal: { fontSize: 11 },

  // Sticky footer
  stickyFooter: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addButton: {
    borderRadius: borderRadius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: { opacity: 0.6 },
  addButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  bottomSpacer: { height: 16 },
});
