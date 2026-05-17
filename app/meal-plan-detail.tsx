
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { getMealPlan, deleteMealPlanItem, updateMealPlanItem, updateMealPlan, type MealPlanDetail, type MealPlanItem } from '@/utils/mealPlansApi';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MEAL_TYPES: { type: MealType; label: string; emoji: string }[] = [
  { type: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { type: 'lunch', label: 'Lunch', emoji: '☀️' },
  { type: 'dinner', label: 'Dinner', emoji: '🌙' },
  { type: 'snack', label: 'Snack', emoji: '🍎' },
];

type ItemEditState = {
  servings: string;
  selectedOptionKey: string;
  gramsPerUnit: number;
  servingOptions: { key: string; label: string; gramsPerUnit: number; isDefault: boolean }[];
  showOptions: boolean;
  baseCaloriesPerServing: number;
  baseProteinPerServing: number;
  baseCarbsPerServing: number;
  baseFatsPerServing: number;
  baseCaloriesPerGram: number;
  baseProteinPerGram: number;
  baseCarbsPerGram: number;
  baseFatsPerGram: number;
};

function getNumDays(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1);
}

function deduplicateItems(items: MealPlanItem[]): MealPlanItem[] {
  const seen = new Set<string>();
  const result: MealPlanItem[] = [];
  for (const item of items) {
    const key = item.food_name.toLowerCase().trim() + '|' + item.meal_type;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

function buildInitialStates(items: MealPlanItem[]): Record<string, ItemEditState> {
  const deduped = deduplicateItems(items);
  const initialStates: Record<string, ItemEditState> = {};
  for (const item of deduped) {
    const qty = item.quantity > 0 ? item.quantity : 1;
    // Per-serving base (always accurate — DB stores totals for qty servings)
    const baseCaloriesPerServing = (Number(item.calories) || 0) / qty;
    const baseProteinPerServing = (Number(item.protein) || 0) / qty;
    const baseCarbsPerServing = (Number(item.carbs) || 0) / qty;
    const baseFatsPerServing = (Number(item.fats) || 0) / qty;

    // Per-gram base (only accurate when grams is known)
    const totalGrams = item.grams != null ? item.grams : null;
    const gramsPerServing = totalGrams != null ? totalGrams / qty : null;
    const baseCaloriesPerGram = totalGrams != null && totalGrams > 0 ? (Number(item.calories) || 0) / totalGrams : 0;
    const baseProteinPerGram = totalGrams != null && totalGrams > 0 ? (Number(item.protein) || 0) / totalGrams : 0;
    const baseCarbsPerGram = totalGrams != null && totalGrams > 0 ? (Number(item.carbs) || 0) / totalGrams : 0;
    const baseFatsPerGram = totalGrams != null && totalGrams > 0 ? (Number(item.fats) || 0) / totalGrams : 0;

    // Default serving label
    const defaultLabel = item.serving_description
      ? item.serving_description
      : gramsPerServing != null
        ? `${Math.round(gramsPerServing)}g`
        : 'serving';

    // Serving options: always include default; only include g/oz/lb if grams are known
    const servingOptions: ItemEditState['servingOptions'] = [
      { key: 'default', label: defaultLabel, gramsPerUnit: gramsPerServing ?? 0, isDefault: true },
    ];
    if (gramsPerServing != null) {
      servingOptions.push(
        { key: 'g', label: '1 g', gramsPerUnit: 1, isDefault: false },
        { key: 'oz', label: '1 oz', gramsPerUnit: 28.35, isDefault: false },
        { key: 'lb', label: '1 lb', gramsPerUnit: 453.592, isDefault: false },
      );
    }

    initialStates[item.id] = {
      servings: item.serving_description ? '1' : String(qty),
      selectedOptionKey: 'default',
      gramsPerUnit: gramsPerServing ?? 0,
      servingOptions,
      showOptions: false,
      baseCaloriesPerServing,
      baseProteinPerServing,
      baseCarbsPerServing,
      baseFatsPerServing,
      baseCaloriesPerGram,
      baseProteinPerGram,
      baseCarbsPerGram,
      baseFatsPerGram,
    };
  }
  return initialStates;
}

function computeLiveMacros(es: ItemEditState, servingsStr: string) {
  const servings = parseFloat(servingsStr) || 0;
  const isDefaultOption = es.selectedOptionKey === 'default';
  if (isDefaultOption) {
    return {
      calories: Math.round(es.baseCaloriesPerServing * servings),
      protein: Math.round(es.baseProteinPerServing * servings * 10) / 10,
      carbs: Math.round(es.baseCarbsPerServing * servings * 10) / 10,
      fats: Math.round(es.baseFatsPerServing * servings * 10) / 10,
      grams: es.gramsPerUnit * servings,
    };
  } else {
    const grams = es.gramsPerUnit * servings;
    return {
      calories: Math.round(es.baseCaloriesPerGram * grams),
      protein: Math.round(es.baseProteinPerGram * grams * 10) / 10,
      carbs: Math.round(es.baseCarbsPerGram * grams * 10) / 10,
      fats: Math.round(es.baseFatsPerGram * grams * 10) / 10,
      grams,
    };
  }
}


export default function MealPlanDetailScreen() {
  const router = useRouter();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [plan, setPlan] = useState<MealPlanDetail | null>(null);
  const [planName, setPlanName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [itemEditStates, setItemEditStates] = useState<Record<string, ItemEditState>>({});

  // Recipe modal state
  const [recipeModalVisible, setRecipeModalVisible] = useState(false);
  const [recipeModalMeal, setRecipeModalMeal] = useState<string | null>(null);
  const [recipeIngredients, setRecipeIngredients] = useState<string[]>([]);
  const [recipeInstructions, setRecipeInstructions] = useState<string[]>([]);
  const [recipeLoading, setRecipeLoading] = useState(false);

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const borderColor = isDark ? colors.borderDark : colors.border;
  const cardBorderColor = isDark ? colors.cardBorderDark : colors.cardBorder;

  const loadPlan = useCallback(async () => {
    if (!planId) return;
    console.log('[MealPlanDetail] Loading plan:', planId);
    try {
      const data = await getMealPlan(planId);
      console.log('[MealPlanDetail] Plan loaded:', data.name, 'items:', data.items?.length ?? 0);
      setPlan(data);
      setPlanName(data.name);
      setItemEditStates(buildInitialStates(data.items));
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[MealPlanDetail] Error loading plan:', msg);
      setError('Failed to load meal plan.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [planId]);

  useFocusEffect(
    useCallback(() => {
      console.log('[MealPlanDetail] Screen focused');
      setLoading(true);
      loadPlan();
    }, [loadPlan])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadPlan();
  };

  const handleDeleteItem = (itemId: string) => {
    console.log('[MealPlanDetail] Delete item pressed:', itemId);
    Alert.alert('Remove Item', 'Remove this food from the plan?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setDeletingItemId(itemId);
          try {
            console.log('[MealPlanDetail] Deleting item:', itemId, 'from plan:', planId);
            await deleteMealPlanItem(planId, itemId);
            console.log('[MealPlanDetail] Item deleted successfully');
            setPlan(prev =>
              prev ? { ...prev, items: prev.items.filter(i => i.id !== itemId) } : prev
            );
            setItemEditStates(prev => {
              const next = { ...prev };
              delete next[itemId];
              return next;
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            console.error('[MealPlanDetail] Error deleting item:', msg);
            Alert.alert('Error', 'Failed to remove item. Please try again.');
          } finally {
            setDeletingItemId(null);
          }
        },
      },
    ]);
  };

  const handleSaveItem = async (item: MealPlanItem) => {
    const state = itemEditStates[item.id];
    if (!state) return;
    const servings = parseFloat(state.servings) || 0;
    if (servings <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid number greater than 0.');
      return;
    }
    const m = computeLiveMacros(state, state.servings);
    const newQuantity = servings;
    const newGrams = m.grams > 0 ? m.grams : null;
    console.log('[MealPlanDetail] Save item pressed:', item.id, 'food:', item.food_name, 'newGrams:', newGrams, 'newCalories:', m.calories, 'newQuantity:', newQuantity);
    try {
      await updateMealPlanItem(planId, item.id, {
        grams: newGrams ?? undefined,
        calories: m.calories,
        protein: m.protein,
        carbs: m.carbs,
        fats: m.fats,
        quantity: newQuantity,
      });
      console.log('[MealPlanDetail] Item updated successfully:', item.id);
      setPlan(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(i =>
            i.id === item.id
              ? { ...i, grams: newGrams ?? undefined, quantity: newQuantity, calories: m.calories, protein: m.protein, carbs: m.carbs, fats: m.fats }
              : i
          ),
        };
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Error', 'Failed to update quantity. Please try again.');
      console.error('[MealPlanDetail] Error updating item:', msg);
    }
  };

  const handleAddFood = (mealType: MealType) => {
    if (!plan) return;
    console.log('[MealPlanDetail] Add food pressed, meal:', mealType, 'planId:', planId);
    router.push({
      pathname: '/add-food',
      params: {
        meal: mealType,
        date: plan.start_date,
        mode: 'meal-plan',
        planId,
      },
    });
  };

  const handleOpenRecipe = useCallback(async (dishDescription: string | null, mealItems: MealPlanItem[]) => {
    console.log('[MealPlanDetail] ••• recipe button pressed, dish:', dishDescription, 'items count:', mealItems.length);
    setRecipeModalMeal(dishDescription);
    setRecipeIngredients([]);
    setRecipeInstructions([]);
    setRecipeLoading(true);
    setRecipeModalVisible(true);

    const foodsPayload = mealItems.map(item => ({
      name: item.food_name,
      serving_size: item.grams != null && item.grams > 0 ? item.grams : item.quantity,
      serving_unit: 'g',
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fats: item.fats,
    }));

    try {
      console.log('[MealPlanDetail] Calling recipe-details edge function for:', dishDescription);
      const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzZ3B0ZmlvZm9hZWd1c2xndmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1NDI4NjcsImV4cCI6MjA3OTExODg2N30.iC4P3lp4fJHLsYNWBwHwFwGP-WZuJONETOYd2q1lQWA";
      const response = await fetch('https://esgptfiofoaeguslgvcq.supabase.co/functions/v1/recipe-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ meal_name: dishDescription, foods: foodsPayload }),
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error('[MealPlanDetail] recipe-details error:', response.status, errText.slice(0, 200));
        setRecipeInstructions(['Failed to generate recipe. Please try again.']);
        return;
      }
      const data = await response.json();
      console.log('[MealPlanDetail] recipe-details response received, ingredients:', data.ingredients?.length, 'instructions:', data.instructions?.length);
      setRecipeIngredients(Array.isArray(data.ingredients) ? data.ingredients : []);
      setRecipeInstructions(Array.isArray(data.instructions) ? data.instructions : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[MealPlanDetail] recipe-details fetch error:', msg);
      setRecipeInstructions(['Failed to generate recipe. Please try again.']);
    } finally {
      setRecipeLoading(false);
    }
  }, []);

  const handleCloseRecipe = useCallback(() => {
    console.log('[MealPlanDetail] Recipe modal closed');
    setRecipeModalVisible(false);
    setRecipeIngredients([]);
    setRecipeInstructions([]);
    setRecipeLoading(false);
  }, []);

  const handleGroceryList = () => {
    console.log('[MealPlanDetail] Grocery list button pressed, planId:', planId);
    router.push({ pathname: '/meal-plan-grocery', params: { planId } });
  };

  const handleBack = () => {
    console.log('[MealPlanDetail] Back button pressed');
    router.back();
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
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
          <Text style={[styles.headerTitle, { color: textColor }]}>Meal Plan</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: textColor }]}>{error ?? 'Plan not found.'}</Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={loadPlan}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const dedupedItems = deduplicateItems(plan.items);

  // Live totals computed from itemEditStates
  const dayCaloriesDisplay = Math.round(dedupedItems.reduce((s, i) => {
    const es = itemEditStates[i.id];
    if (es) return s + computeLiveMacros(es, es.servings).calories;
    return s + (Number(i.calories) || 0);
  }, 0));
  const dayProteinDisplay = Math.round(dedupedItems.reduce((s, i) => {
    const es = itemEditStates[i.id];
    if (es) return s + computeLiveMacros(es, es.servings).protein;
    return s + (Number(i.protein) || 0);
  }, 0));
  const dayCarbsDisplay = Math.round(dedupedItems.reduce((s, i) => {
    const es = itemEditStates[i.id];
    if (es) return s + computeLiveMacros(es, es.servings).carbs;
    return s + (Number(i.carbs) || 0);
  }, 0));
  const dayFatsDisplay = Math.round(dedupedItems.reduce((s, i) => {
    const es = itemEditStates[i.id];
    if (es) return s + computeLiveMacros(es, es.servings).fats;
    return s + (Number(i.fats) || 0);
  }, 0));

  // Suppress unused variable warning
  void getNumDays(plan.start_date, plan.end_date);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <TextInput
            style={[styles.headerTitle, { color: textColor, flex: 1, borderWidth: 0, padding: 0 }]}
            value={planName}
            onChangeText={(val) => setPlanName(val)}
            onBlur={async () => {
              const trimmed = planName.trim();
              if (!plan || trimmed === plan.name) return;
              console.log('[MealPlanDetail] Plan name changed:', trimmed);
              try {
                await updateMealPlan(planId, { name: trimmed });
                setPlan(prev => prev ? { ...prev, name: trimmed } : prev);
              } catch (err) {
                console.error('[MealPlanDetail] Failed to update plan name:', err);
                setPlanName(plan.name);
              }
            }}
            selectTextOnFocus
          />
        </View>
        <TouchableOpacity style={styles.groceryButton} onPress={handleGroceryList} activeOpacity={0.7}>
          <Text style={styles.groceryButtonText}>🛒</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Macros Summary Card */}
        <View style={[styles.macroCard, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>
          <View style={styles.macroCardHeader}>
            <Text style={[styles.macroCardTitle, { color: textColor }]}>Plan Summary</Text>
          </View>

          {/* Per day row */}
          <View style={styles.macroRow}>
            <Text style={[styles.macroRowLabel, { color: secondaryColor }]}>Per day</Text>
            <View style={styles.macroPills}>
              <View style={[styles.macroPill, { backgroundColor: colors.calories + '22' }]}>
                <Text style={[styles.macroPillValue, { color: colors.calories }]}>{dayCaloriesDisplay}</Text>
                <Text style={[styles.macroPillUnit, { color: colors.calories }]}>kcal</Text>
              </View>
              <View style={[styles.macroPill, { backgroundColor: colors.protein + '22' }]}>
                <Text style={[styles.macroPillValue, { color: colors.protein }]}>{dayProteinDisplay}</Text>
                <Text style={[styles.macroPillUnit, { color: colors.protein }]}>P</Text>
              </View>
              <View style={[styles.macroPill, { backgroundColor: colors.carbs + '22' }]}>
                <Text style={[styles.macroPillValue, { color: colors.carbs }]}>{dayCarbsDisplay}</Text>
                <Text style={[styles.macroPillUnit, { color: colors.carbs }]}>C</Text>
              </View>
              <View style={[styles.macroPill, { backgroundColor: colors.fats + '22' }]}>
                <Text style={[styles.macroPillValue, { color: colors.fats }]}>{dayFatsDisplay}</Text>
                <Text style={[styles.macroPillUnit, { color: colors.fats }]}>F</Text>
              </View>
            </View>
          </View>

        </View>

        {/* Meal Sections */}
        {MEAL_TYPES.map((mealDef, mealIdx) => {
          const mealItems = dedupedItems.filter(i => i.meal_type === mealDef.type);
          const isLast = mealIdx === MEAL_TYPES.length - 1;
          const dishDescription = mealItems[0]?.dish_description ?? null;

          // Live meal totals
          const mealCalories = Math.round(mealItems.reduce((s, i) => {
            const es = itemEditStates[i.id];
            if (es) return s + computeLiveMacros(es, es.servings).calories;
            return s + (Number(i.calories) || 0);
          }, 0));
          const mealProtein = Math.round(mealItems.reduce((s, i) => {
            const es = itemEditStates[i.id];
            if (es) return s + computeLiveMacros(es, es.servings).protein;
            return s + (Number(i.protein) || 0);
          }, 0));
          const mealCarbs = Math.round(mealItems.reduce((s, i) => {
            const es = itemEditStates[i.id];
            if (es) return s + computeLiveMacros(es, es.servings).carbs;
            return s + (Number(i.carbs) || 0);
          }, 0));
          const mealFats = Math.round(mealItems.reduce((s, i) => {
            const es = itemEditStates[i.id];
            if (es) return s + computeLiveMacros(es, es.servings).fats;
            return s + (Number(i.fats) || 0);
          }, 0));

          return (
            <View
              key={mealDef.type}
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
                <TouchableOpacity
                  style={styles.addFoodButton}
                  onPress={() => handleAddFood(mealDef.type)}
                  activeOpacity={0.7}
                >
                  <IconSymbol
                    ios_icon_name="plus.circle.fill"
                    android_material_icon_name="add-circle"
                    size={20}
                    color={colors.primary}
                  />
                  <Text style={[styles.addFoodText, { color: colors.primary }]}>Add food</Text>
                </TouchableOpacity>
              </View>

              {/* Meal macro summary */}
              {mealItems.length > 0 && (
                <View style={styles.mealMacroRow}>
                  <View style={[styles.macroPill, { backgroundColor: colors.calories + '22' }]}>
                    <Text style={[styles.macroPillValue, { color: colors.calories }]}>{mealCalories}</Text>
                    <Text style={[styles.macroPillUnit, { color: colors.calories }]}>kcal</Text>
                  </View>
                  <View style={[styles.macroPill, { backgroundColor: colors.protein + '22' }]}>
                    <Text style={[styles.macroPillValue, { color: colors.protein }]}>{mealProtein}g</Text>
                    <Text style={[styles.macroPillUnit, { color: colors.protein }]}>P</Text>
                  </View>
                  <View style={[styles.macroPill, { backgroundColor: colors.carbs + '22' }]}>
                    <Text style={[styles.macroPillValue, { color: colors.carbs }]}>{mealCarbs}g</Text>
                    <Text style={[styles.macroPillUnit, { color: colors.carbs }]}>C</Text>
                  </View>
                  <View style={[styles.macroPill, { backgroundColor: colors.fats + '22' }]}>
                    <Text style={[styles.macroPillValue, { color: colors.fats }]}>{mealFats}g</Text>
                    <Text style={[styles.macroPillUnit, { color: colors.fats }]}>F</Text>
                  </View>
                </View>
              )}

              {/* Dish title row */}
              {!!dishDescription && (
                <View style={styles.dishTitleRow}>
                  <Text style={[styles.dishTitleText, { color: secondaryColor }]} numberOfLines={2}>
                    {dishDescription}
                  </Text>
                  <TouchableOpacity
                    style={styles.recipeDotsBtn}
                    onPress={() => handleOpenRecipe(dishDescription, mealItems)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.recipeDotsText, { color: colors.primary }]}>•••</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Items */}
              {mealItems.length === 0 ? (
                <Text style={[styles.emptyMealText, { color: secondaryColor }]}>No foods added yet</Text>
              ) : (
                mealItems.map((item, idx) => {
                  const isDeleting = deletingItemId === item.id;
                  const isLastItem = idx === mealItems.length - 1;
                  const editState = itemEditStates[item.id];

                  // Live macro values computed from edit state
                  const liveMacros = editState
                    ? computeLiveMacros(editState, editState.servings)
                    : { calories: Math.round(Number(item.calories) || 0), protein: Math.round(Number(item.protein) || 0), carbs: Math.round(Number(item.carbs) || 0), fats: Math.round(Number(item.fats) || 0), grams: 0 };
                  const liveCalories = liveMacros.calories;
                  const liveProtein = liveMacros.protein;
                  const liveCarbs = liveMacros.carbs;
                  const liveFats = liveMacros.fats;

                  const selectedOptionLabel = editState
                    ? (editState.servingOptions.find(o => o.key === editState.selectedOptionKey)?.label ?? '')
                    : '';

                  const proteinText = liveProtein + 'g';
                  const carbsText = liveCarbs + 'g';
                  const fatsText = liveFats + 'g';

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.foodItem,
                        idx === 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: borderColor },
                        !isLastItem && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: borderColor },
                      ]}
                    >
                      <View style={styles.foodItemInfo}>
                        <Text style={[styles.foodItemName, { color: textColor }]} numberOfLines={1}>
                          {item.food_name}
                        </Text>
                        {!!item.brand && (
                          <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>{item.brand}</Text>
                        )}

                        {/* Always-visible serving editor */}
                        <View style={styles.editServingRow}>
                          <TextInput
                            style={[styles.servingQtyInput, { color: textColor, borderColor: colors.primary }]}
                            value={editState ? editState.servings : String(item.quantity)}
                            onChangeText={(val) => {
                              console.log('[MealPlanDetail] Serving qty changed, item:', item.id, 'val:', val);
                              setItemEditStates(prev => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], servings: val },
                              }));
                            }}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                            placeholder="1"
                            placeholderTextColor={secondaryColor}
                          />
                          <TouchableOpacity
                            style={[styles.servingDropdownBtn, { borderColor: colors.primary, backgroundColor: cardBg }]}
                            onPress={() => {
                              console.log('[MealPlanDetail] Serving dropdown toggled, item:', item.id);
                              setItemEditStates(prev => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], showOptions: !prev[item.id].showOptions },
                              }));
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.servingDropdownText, { color: textColor }]} numberOfLines={1}>
                              {selectedOptionLabel}
                            </Text>
                            <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand-more" size={12} color={textColor} />
                          </TouchableOpacity>

                        </View>

                        {/* Serving options dropdown */}
                        {editState?.showOptions && (
                          <View style={[styles.servingOptionsList, { backgroundColor: cardBg, borderColor }]}>
                            {editState.servingOptions.map((option, optIdx) => {
                              const isSelected = option.key === editState.selectedOptionKey;
                              const isLastOpt = optIdx === editState.servingOptions.length - 1;
                              return (
                                <TouchableOpacity
                                  key={option.key}
                                  style={[
                                    styles.servingOptionItem,
                                    { borderBottomColor: borderColor, backgroundColor: isSelected ? (isDark ? '#2a2a2a' : '#f0f0f0') : undefined },
                                    isLastOpt && { borderBottomWidth: 0 },
                                  ]}
                                  onPress={() => {
                                    console.log('[MealPlanDetail] Serving option selected, item:', item.id, 'option:', option.key, option.label, 'gramsPerUnit:', option.gramsPerUnit);
                                    setItemEditStates(prev => ({
                                      ...prev,
                                      [item.id]: {
                                        ...prev[item.id],
                                        selectedOptionKey: option.key,
                                        gramsPerUnit: option.gramsPerUnit,
                                        servings: '1',
                                        showOptions: false,
                                      },
                                    }));
                                  }}
                                  activeOpacity={0.7}
                                >
                                  <Text style={[styles.servingOptionText, { color: textColor }]}>{option.label}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}

                        {/* Live P/C/F row */}
                        <View style={styles.macroPcfRow}>
                          <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                            {'P: '}
                          </Text>
                          <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                            {proteinText}
                          </Text>
                          <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                            {' · C: '}
                          </Text>
                          <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                            {carbsText}
                          </Text>
                          <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                            {' · F: '}
                          </Text>
                          <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                            {fatsText}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.foodItemRight}>
                        <Text style={[styles.foodItemCalories, { color: textColor }]}>{liveCalories}</Text>
                        <Text style={[styles.foodItemKcal, { color: secondaryColor }]}>kcal</Text>
                      </View>

                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => handleDeleteItem(item.id)}
                        disabled={isDeleting}
                        activeOpacity={0.7}
                      >
                        {isDeleting ? (
                          <ActivityIndicator size="small" color={colors.error} />
                        ) : (
                          <IconSymbol
                            ios_icon_name="trash"
                            android_material_icon_name="delete"
                            size={17}
                            color={colors.error}
                          />
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </View>
          );
        })}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Recipe Full Screen Modal */}
      <Modal
        visible={recipeModalVisible}
        transparent={false}
        animationType="slide"
        onRequestClose={handleCloseRecipe}
      >
        <View style={[styles.recipeModalOverlay, { backgroundColor: cardBg }]}>
          {/* Modal header */}
          <View style={[styles.recipeModalHeader, { borderBottomColor: borderColor }]}>
            <Text style={[styles.recipeModalTitle, { color: textColor }]} numberOfLines={2}>
              {recipeModalMeal ?? 'Recipe'}
            </Text>
            <TouchableOpacity onPress={handleCloseRecipe} style={styles.recipeCloseBtn} activeOpacity={0.7}>
              <Text style={[styles.recipeCloseBtnText, { color: colors.primary }]}>Close</Text>
            </TouchableOpacity>
          </View>

            {/* Content */}
            {recipeLoading ? (
              <View style={styles.recipeLoadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.recipeLoadingText, { color: secondaryColor }]}>Generating recipe...</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.recipeScrollView}
                contentContainerStyle={styles.recipeScrollContent}
                showsVerticalScrollIndicator
              >
                {recipeIngredients.length > 0 && (
                  <View style={styles.recipeSectionBlock}>
                    <Text style={[styles.recipeSectionHeader, { color: textColor }]}>Ingredients</Text>
                    {recipeIngredients.map((ing, i) => (
                      <View key={i} style={styles.recipeListItem}>
                        <Text style={[styles.recipeBullet, { color: colors.primary }]}>•</Text>
                        <Text style={[styles.recipeListText, { color: textColor }]}>{ing}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {recipeInstructions.length > 0 && (
                  <View style={styles.recipeSectionBlock}>
                    <Text style={[styles.recipeSectionHeader, { color: textColor }]}>Instructions</Text>
                    {recipeInstructions.map((step, i) => {
                      const stepNum = i + 1;
                      return (
                        <View key={i} style={styles.recipeListItem}>
                          <Text style={[styles.recipeStepNumber, { color: colors.primary }]}>{stepNum}.</Text>
                          <Text style={[styles.recipeListText, { color: textColor }]}>{step}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
                {recipeIngredients.length === 0 && recipeInstructions.length === 0 && (
                  <Text style={[styles.recipeLoadingText, { color: secondaryColor }]}>No recipe available.</Text>
                )}
              </ScrollView>
            )}
        </View>
      </Modal>
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
  headerCenter: { flex: 1 },
  headerTitle: { ...typography.h3 },
  headerRight: { width: 40 },
  groceryButton: { padding: spacing.xs, minWidth: 40, alignItems: 'center' },
  groceryButtonText: { fontSize: 22 },

  // Scroll
  scrollContent: { padding: spacing.md, paddingBottom: 60 },

  // Macro card
  macroCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.06)',
    elevation: 2,
  },
  macroCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  macroCardTitle: { ...typography.bodyBold },
  macroCardSubtitle: { ...typography.small },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  macroRowLabel: { ...typography.caption, minWidth: 60 },
  macroPills: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', justifyContent: 'flex-end' },
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
  macroDivider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.sm },

  // Meal card
  mealCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.06)',
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
  addFoodButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addFoodText: { fontSize: 13, fontWeight: '600' },
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
  foodItemName: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  foodItemMeta: { fontSize: 12, lineHeight: 16 },
  foodItemRight: { alignItems: 'flex-end', paddingTop: 2 },
  foodItemCalories: { fontSize: 15, fontWeight: '700' },
  foodItemKcal: { fontSize: 11 },
  deleteButton: { padding: spacing.xs, minWidth: 32, alignItems: 'center', paddingTop: 6 },

  // Inline edit
  editServingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  servingQtyInput: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 12,
    minWidth: 36,
    maxWidth: 48,
    textAlign: 'center',
  },
  servingDropdownBtn: {
    maxWidth: 110,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
  },
  servingDropdownText: { fontSize: 11, flex: 1 },
  servingOptionsList: {
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    marginTop: 2,
    borderWidth: 1,
  },
  servingOptionItem: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  servingOptionText: { fontSize: 12 },
  editActionBtn: { padding: 4 },
  editActionText: { fontSize: 16, fontWeight: '700' },

  macroPcfRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },

  mealMacroRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    flexWrap: 'wrap',
  },

  bottomSpacer: { height: 40 },

  // Dish title row
  dishTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  dishTitleText: {
    fontSize: 13,
    fontStyle: 'italic',
    flex: 1,
  },
  recipeDotsBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  recipeDotsText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
  },

  // Recipe modal
  recipeModalOverlay: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
  },
  recipeModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },
  recipeModalTitle: {
    ...typography.bodyBold,
    flex: 1,
    fontSize: 16,
  },
  recipeCloseBtn: {
    paddingVertical: 2,
    paddingLeft: spacing.sm,
  },
  recipeCloseBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  recipeLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  recipeLoadingText: {
    ...typography.caption,
    marginTop: spacing.sm,
  },
  recipeNoLinkText: {
    ...typography.body,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  recipeScrollView: {
    flex: 1,
  },
  recipeScrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  recipeSectionBlock: {
    marginBottom: spacing.lg,
  },
  recipeSectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: spacing.sm,
    letterSpacing: 0.3,
  },
  recipeListItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  recipeBullet: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    minWidth: 12,
  },
  recipeStepNumber: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    minWidth: 20,
  },
  recipeListText: {
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
});
