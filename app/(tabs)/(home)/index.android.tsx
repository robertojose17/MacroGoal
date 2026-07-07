
import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, ActivityIndicator, Animated, Dimensions, ScrollView } from 'react-native';
import { useStreakRescue } from '@/hooks/useStreakRescue';
import StreakRescueModal from '@/components/StreakRescueModal';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow';
import { supabase } from '@/lib/supabase/client';
import { listMealPlans, type MealPlan as ApiMealPlan } from '@/utils/mealPlansApi';
import { formatServing } from '@/utils/servingFormat';
import { toLocalDateString } from '@/utils/dateUtils';
import { calcMacros } from '@/utils/macros';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface FoodItem {
  id: string;
  quantity: number;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  serving_description: string | null;
  grams: number | null;
  food_item_id?: string | null;
  food_name?: string | null;
  food_brand?: string | null;
  name?: string;
  brand?: string;
  food_items?: {
    id: string;
    name: string;
    brand: string | null;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    serving_size: number;
    macros_per: string | null;
  } | null;
}

interface MealData {
  type: MealType;
  label: string;
  items: FoodItem[];
  totalCalories: number;
}

interface MealPlan {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  created_at: string;
}

const getServingDisplayText = (item: FoodItem): string => {
  // 1. Best: use the saved serving description (e.g. "2 eggs", "1 slice")
  if (item.serving_description) return item.serving_description;
  // 2. Use grams if available (e.g. "63 g")
  if (item.grams && item.grams > 0) return formatServing(item.grams, 'g');
  // 3. Fallback: quantity
  const quantity = item.quantity || 1;
  return formatServing(quantity * 100, 'g');
};

const formatDateRange = (start: string, end: string): string => {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`;
};

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [activeTab, setActiveTab] = useState<'tracking' | 'planning'>('tracking');
  const slideAnim = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;

  // ── Streak Rescue ──
  const {
    canRescue,
    lostStreakValue,
    priceLabel,
    purchasing,
    executePurchase,
    dismissRescue,
    refresh: refreshRescue,
  } = useStreakRescue();

  const [goal, setGoal] = useState<any>(null);
  const [meals, setMeals] = useState<MealData[]>([
    { type: 'breakfast', label: 'Breakfast', items: [], totalCalories: 0 },
    { type: 'lunch', label: 'Lunch', items: [], totalCalories: 0 },
    { type: 'dinner', label: 'Dinner', items: [], totalCalories: 0 },
    { type: 'snack', label: 'Snacks', items: [], totalCalories: 0 },
  ]);
  const [totalCalories, setTotalCalories] = useState(0);
  const [totalMacros, setTotalMacros] = useState({ protein: 0, carbs: 0, fats: 0, fiber: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [error, setError] = useState<string | null>(null);

  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error('[Home Android] Error getting user:', userError);
        setError('Failed to authenticate. Please try logging in again.');
        setLoading(false);
        return;
      }
      if (!user) {
        console.log('[Home Android] No user found');
        setError('No user session found. Please log in.');
        setLoading(false);
        return;
      }

      console.log('[Home Android] Loading data for user:', user.id);

      const { data: goalData, error: goalError } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (goalError) {
        console.error('[Home Android] Error loading goal:', goalError);
      } else if (goalData) {
        console.log('[Home Android] Goal loaded:', goalData);
        setGoal(goalData);
      } else {
        console.log('[Home Android] No active goal found, using defaults');
        setGoal({ daily_calories: 2000, protein_g: 150, carbs_g: 200, fats_g: 65, fiber_g: 30 });
      }

      const dateString = toLocalDateString(selectedDate);
      console.log('[Home Android] Loading meals for date:', dateString);

      const { data: mealsData, error: mealsError } = await supabase
        .from('meals')
        .select(`
          id,
          meal_type,
          date,
          meal_items (
            id,
            food_id,
            food_item_id,
            quantity,
            calories,
            protein,
            carbs,
            fats,
            fiber,
            serving_description,
            grams,
            food_name,
            food_brand,
            food_items!meal_items_food_item_id_fkey (
              id,
              name,
              brand,
              calories,
              protein,
              carbs,
              fat,
              fiber,
              serving_size,
              macros_per
            ),
          )
        `)
        .eq('user_id', user.id)
        .eq('date', dateString);

      if (mealsError) {
        console.error('[Home Android] Error loading meals:', mealsError);
      } else {
        console.log('[Home Android] Meals loaded:', mealsData);

        const mealsByType: Record<MealType, FoodItem[]> = {
          breakfast: [], lunch: [], dinner: [], snack: [],
        };

        let totalCals = 0, totalP = 0, totalC = 0, totalF = 0, totalFib = 0;

        if (mealsData && mealsData.length > 0) {
          mealsData.forEach((meal: any) => {
            if (meal.meal_items) {
              meal.meal_items.forEach((item: any) => {
                const hasStoredMacros = item.calories != null && item.calories > 0;
                const fi = item.food_items;
                const grams = item.grams ?? 0;
                const macros = hasStoredMacros
                  ? { calories: item.calories ?? 0, protein: item.protein ?? 0, carbs: item.carbs ?? 0, fats: item.fats ?? 0, fiber: item.fiber ?? 0 }
                  : fi
                    ? (() => { const r = calcMacros(fi, grams); return { calories: r.calories, protein: r.protein, carbs: r.carbs, fats: r.fat, fiber: r.fiber }; })()
                    : { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 };
                console.log('[Home Android] macros for item', item.id, '(stored:', hasStoredMacros, '):', macros);
                const enriched = {
                  ...item,
                  ...macros,
                  name: item.food_name ?? item.food_items?.name ?? 'Unknown Food',
                  brand: item.food_brand ?? item.food_items?.brand ?? undefined,
                };
                mealsByType[meal.meal_type as MealType].push(enriched);
                totalCals += macros.calories;
                totalP    += macros.protein;
                totalC    += macros.carbs;
                totalF    += macros.fats;
                totalFib  += macros.fiber;
              });
            }
          });
        }

        const updatedMeals: MealData[] = [
          { type: 'breakfast', label: 'Breakfast', items: [...mealsByType.breakfast], totalCalories: mealsByType.breakfast.reduce((sum, item) => sum + (item.calories || 0), 0) },
          { type: 'lunch', label: 'Lunch', items: [...mealsByType.lunch], totalCalories: mealsByType.lunch.reduce((sum, item) => sum + (item.calories || 0), 0) },
          { type: 'dinner', label: 'Dinner', items: [...mealsByType.dinner], totalCalories: mealsByType.dinner.reduce((sum, item) => sum + (item.calories || 0), 0) },
          { type: 'snack', label: 'Snacks', items: [...mealsByType.snack], totalCalories: mealsByType.snack.reduce((sum, item) => sum + (item.calories || 0), 0) },
        ];

        setMeals(updatedMeals);
        setTotalCalories(totalCals);
        setTotalMacros({ protein: totalP, carbs: totalC, fats: totalF, fiber: totalFib });
      }
    } catch (err: any) {
      console.error('[Home Android] Error in loadData:', err);
      setError(err?.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  const loadPlans = useCallback(async () => {
    console.log('[Home Android] Loading meal plans');
    setPlansLoading(true);
    setPlansError(null);
    try {
      const data = await listMealPlans();
      console.log('[Home Android] Meal plans loaded:', data.plans?.length || 0);
      setPlans(data.plans || []);
    } catch (err: any) {
      console.error('[Home Android] Error loading meal plans:', err);
      setPlansError('Failed to load meal plans.');
    } finally {
      setPlansLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      console.log('[Home Android] Screen focused, loading data');
      // Auto-advance to today if the date has changed (e.g. app left open overnight)
      setSelectedDate(prev => {
        const today = new Date();
        const prevStr = toLocalDateString(prev);
        const todayStr = toLocalDateString(today);
        return prevStr === todayStr ? prev : today;
      });
      loadData();
      loadPlans();
    }, [loadData, loadPlans])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
    loadPlans();
  };

  const handleAddFood = (mealType: MealType) => {
    console.log('[Home Android] Opening add food for meal:', mealType);
    const dateString = toLocalDateString(selectedDate);
    router.push(`/add-food?meal=${mealType}&date=${dateString}`);
  };

  const handleEditFood = (item: FoodItem, isSwiping: boolean) => {
    if (isSwiping) {
      console.log('[Home Android] Blocked edit - swipe gesture is active');
      return;
    }
    console.log('[Home Android] Opening edit food:', item.id);
    const dateString = toLocalDateString(selectedDate);
    router.push({ pathname: '/edit-food', params: { itemId: item.id, date: dateString } });
  };

  const handleDeleteFood = useCallback(async (itemId: string) => {
    console.log('[Home Android] Delete requested for item:', itemId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user found');

      let deletedItem: FoodItem | null = null;

      setMeals(prevMeals => {
        const newMeals = prevMeals.map(meal => {
          const itemToDelete = meal.items.find(i => i.id === itemId);
          if (itemToDelete) deletedItem = itemToDelete;
          const filteredItems = meal.items.filter(i => i.id !== itemId);
          return { ...meal, items: filteredItems, totalCalories: filteredItems.reduce((sum, i) => sum + (i.calories || 0), 0) };
        });
        console.log('[Home Android] UI state updated - item removed from list');
        return newMeals;
      });

      if (deletedItem) {
        setTotalCalories(prev => prev - ((deletedItem as FoodItem).calories || 0));
        setTotalMacros(prev => ({
          protein: prev.protein - ((deletedItem as FoodItem).protein || 0),
          carbs: prev.carbs - ((deletedItem as FoodItem).carbs || 0),
          fats: prev.fats - ((deletedItem as FoodItem).fats || 0),
          fiber: prev.fiber - ((deletedItem as FoodItem).fiber || 0),
        }));
      }

      const { error } = await supabase.from('meal_items').delete().eq('id', itemId);
      if (error) {
        console.error('[Home Android] Database delete error:', error);
        throw error;
      }
      console.log('[Home Android] Successfully deleted from database');
    } catch (error: any) {
      console.error('[Home Android] Error in handleDeleteFood:', error);
      Alert.alert('Delete Failed', error?.message || 'Failed to delete food entry. Please try again.', [{ text: 'OK' }]);
      loadData();
    }
  }, [loadData]);

  const goToPreviousDay = () => {
    console.log('[Home Android] Navigating to previous day');
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const goToNextDay = () => {
    console.log('[Home Android] Navigating to next day');
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
  };

  const goToToday = () => {
    console.log('[Home Android] Navigating to today');
    setSelectedDate(new Date());
  };

  const isToday = () => selectedDate.toDateString() === new Date().toDateString();

  const isTodayOrFuture = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    return selected >= today;
  };

  const handleTabPress = (tab: 'tracking' | 'planning') => {
    console.log('[Home Android] Segmented control pressed:', tab);
    setActiveTab(tab);
    Animated.spring(slideAnim, {
      toValue: tab === 'tracking' ? 0 : -screenWidth,
      damping: 20,
      stiffness: 120,
      mass: 1,
      useNativeDriver: true,
    }).start();
  };

  const handlePlanPress = (plan: MealPlan) => {
    console.log('[Home Android] Meal plan pressed:', plan.id, plan.name);
    router.push({ pathname: '/meal-plan-detail', params: { planId: plan.id } });
  };

  const handleCreatePlan = () => {
    console.log('[Home Android] Create new meal plan pressed');
    router.push('/meal-plan-create');
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.errorContainer}>
          <IconSymbol ios_icon_name="exclamationmark.triangle" android_material_icon_name="warning" size={48} color={colors.error} />
          <Text style={[styles.errorText, { color: isDark ? colors.textDark : colors.text }]}>{error}</Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={loadData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const caloriesRemaining = (goal?.daily_calories || 2000) - totalCalories;
  const caloriesProgress = Math.min((totalCalories / (goal?.daily_calories || 2000)) * 100, 100);
  const leftArrowDisabled = false;
  const rightArrowDisabled = isTodayOrFuture();

  const renderFoodItem = ({ item }: { item: FoodItem }) => {
    const foodName = item.name ?? item.food_name ?? item.food_items?.name ?? 'Unknown Food';
    const foodBrand = item.brand ?? item.food_brand ?? item.food_items?.brand ?? undefined;
    return (
      <SwipeToDeleteRow onDelete={() => handleDeleteFood(item.id)}>
        {(isSwiping: boolean) => (
          <TouchableOpacity
            style={styles.foodItem}
            onPress={() => handleEditFood(item, isSwiping)}
            activeOpacity={0.7}
            disabled={isSwiping}
          >
            <View style={styles.foodInfo}>
              <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text }]}>
                {foodName}
              </Text>
              {foodBrand && (
                <Text style={[styles.foodBrand, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  {foodBrand}
                </Text>
              )}
              <Text style={[styles.foodDetails, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {getServingDisplayText(item)}
              </Text>
            </View>
            <View style={styles.foodCalories}>
              <Text style={[styles.foodCaloriesValue, { color: isDark ? colors.textDark : colors.text }]}>
                {Math.round(item.calories)}
              </Text>
              <Text style={[styles.foodCaloriesLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                kcal
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </SwipeToDeleteRow>
    );
  };

  const renderTrackingContent = () => (
    <View>
      <View style={[styles.dateNavigation, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
        <TouchableOpacity onPress={goToPreviousDay} style={styles.dateButton} disabled={leftArrowDisabled} activeOpacity={leftArrowDisabled ? 1 : 0.7}>
          <IconSymbol ios_icon_name="arrow.left" android_material_icon_name="arrow-back" size={24} color={isDark ? colors.textDark : colors.text} style={{ opacity: leftArrowDisabled ? 0.4 : 1 }} />
        </TouchableOpacity>
        <View style={styles.dateCenter}>
          <Text style={[styles.dateLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {isToday() ? 'Today' : selectedDate.toLocaleDateString('en-US', { weekday: 'short' })}
          </Text>
          <Text style={[styles.dateText, { color: isDark ? colors.textDark : colors.text }]}>
            {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        </View>
        <TouchableOpacity onPress={goToNextDay} style={styles.dateButton} disabled={rightArrowDisabled} activeOpacity={rightArrowDisabled ? 1 : 0.7}>
          <IconSymbol ios_icon_name="arrow.right" android_material_icon_name="arrow-forward" size={24} color={isDark ? colors.textDark : colors.text} style={{ opacity: rightArrowDisabled ? 0.4 : 1 }} />
        </TouchableOpacity>
      </View>

      {!isToday() && (
        <TouchableOpacity style={[styles.todayButton, { backgroundColor: colors.primary }]} onPress={goToToday}>
          <Text style={styles.todayButtonText}>Go to Today</Text>
        </TouchableOpacity>
      )}

      <View style={[styles.summaryCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>Goal</Text>
            <Text style={[styles.summaryValue, { color: isDark ? colors.textDark : colors.text }]}>{goal?.daily_calories || 2000}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>Eaten</Text>
            <Text style={[styles.summaryValue, { color: colors.calories }]}>{Math.round(totalCalories)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>Remaining</Text>
            <Text style={[styles.summaryValue, { color: caloriesRemaining >= 0 ? colors.success : colors.error }]}>{Math.round(caloriesRemaining)}</Text>
          </View>
        </View>
        <View style={[styles.progressBarContainer, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
          <View style={[styles.progressBarFill, { width: `${caloriesProgress}%`, backgroundColor: caloriesRemaining >= 0 ? colors.success : colors.error }]} />
        </View>
        <View style={styles.macrosSummary}>
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: colors.protein }]}>{Math.round(totalMacros.protein)}g</Text>
            <Text style={[styles.macroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>Protein</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: colors.carbs }]}>{Math.round(totalMacros.carbs)}g</Text>
            <Text style={[styles.macroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>Carbs</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: colors.fats }]}>{Math.round(totalMacros.fats)}g</Text>
            <Text style={[styles.macroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>Fats</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: colors.fiber }]}>{Math.round(totalMacros.fiber)}g</Text>
            <Text style={[styles.macroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>Fiber</Text>
          </View>
        </View>
      </View>

      {meals.map((meal) => (
        <View key={meal.type} style={[styles.mealCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <View style={styles.mealHeader}>
            <View>
              <Text style={[styles.mealTitle, { color: isDark ? colors.textDark : colors.text }]}>{meal.label}</Text>
              <Text style={[styles.mealCalories, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>{Math.round(meal.totalCalories)} kcal</Text>
            </View>
            <TouchableOpacity style={styles.addMealButton} onPress={() => handleAddFood(meal.type)}>
              <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add" size={28} color={colors.info} />
            </TouchableOpacity>
          </View>

          {meal.items.length === 0 ? (
            <TouchableOpacity style={styles.emptyMeal} onPress={() => handleAddFood(meal.type)}>
              <Text style={[styles.emptyMealText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>Tap to add food</Text>
            </TouchableOpacity>
          ) : (
            <FlatList
              data={meal.items}
              renderItem={renderFoodItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
            />
          )}
        </View>
      ))}
    </View>
  );

  const renderPlanningContent = () => {
    if (plansLoading) {
      return (
        <View style={styles.plansLoadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (plansError) {
      return (
        <View style={styles.plansEmptyContainer}>
          <Text style={[styles.plansEmptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {plansError}
          </Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary, marginTop: spacing.md }]} onPress={loadPlans}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View>
        {plans.length === 0 ? (
          <View style={[styles.plansEmptyCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <IconSymbol ios_icon_name="calendar" android_material_icon_name="calendar-today" size={40} color={isDark ? colors.textSecondaryDark : colors.textSecondary} />
            <Text style={[styles.plansEmptyTitle, { color: isDark ? colors.textDark : colors.text }]}>No meal plans yet</Text>
            <Text style={[styles.plansEmptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Create your first plan to get started.
            </Text>
          </View>
        ) : (
          plans.map((plan) => {
            const dateRange = formatDateRange(plan.start_date, plan.end_date);
            return (
              <TouchableOpacity
                key={plan.id}
                style={[styles.planCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
                onPress={() => handlePlanPress(plan)}
                activeOpacity={0.7}
              >
                <View style={styles.planCardContent}>
                  <View style={styles.planCardLeft}>
                    <Text style={[styles.planName, { color: isDark ? colors.textDark : colors.text }]}>{plan.name}</Text>
                    <Text style={[styles.planDateRange, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>{dateRange}</Text>
                  </View>
                  <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={18} color={isDark ? colors.textSecondaryDark : colors.textSecondary} />
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <TouchableOpacity
          style={[styles.createPlanButton, { backgroundColor: colors.primary }]}
          onPress={handleCreatePlan}
          activeOpacity={0.8}
        >
          <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={20} color="#fff" />
          <Text style={styles.createPlanButtonText}>Create New Plan</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
      {/* Top header: always-visible segmented control */}
      <View style={[styles.segmentedControlWrapper, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
        <View style={[styles.segmentedControl, { backgroundColor: isDark ? colors.cardDark : '#E8EAF0' }]}>
          <TouchableOpacity
            style={[styles.segmentButton, activeTab === 'tracking' && { backgroundColor: colors.primary }]}
            onPress={() => handleTabPress('tracking')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentButtonText, { color: activeTab === 'tracking' ? '#fff' : (isDark ? colors.textSecondaryDark : colors.textSecondary) }]}>
              Tracking
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentButton, activeTab === 'planning' && { backgroundColor: colors.primary }]}
            onPress={() => handleTabPress('planning')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentButtonText, { color: activeTab === 'planning' ? '#fff' : (isDark ? colors.textSecondaryDark : colors.textSecondary) }]}>
              Planning
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flex: 1, overflow: 'hidden' }}>
        <Animated.View
          style={{
            flex: 1,
            flexDirection: 'row',
            width: screenWidth * 2,
            transform: [{ translateX: slideAnim }],
          }}
        >
          {/* Tracking panel */}
          <ScrollView
            style={{ width: screenWidth }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.scrollContent}
          >
            {renderTrackingContent()}
            <View style={styles.bottomSpacer} />
          </ScrollView>
          {/* Planning panel */}
          <ScrollView
            style={{ width: screenWidth }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {renderPlanningContent()}
            <View style={styles.bottomSpacer} />
          </ScrollView>
        </Animated.View>
      </View>

      {/* Streak Rescue Modal */}
      <StreakRescueModal
        visible={canRescue}
        lostStreakValue={lostStreakValue}
        priceLabel={priceLabel}
        purchasing={purchasing}
        onPurchase={async () => {
          console.log('[Home Android] Streak rescue purchase initiated');
          const result = await executePurchase();
          if (result.success) {
            console.log('[Home Android] Streak rescue purchase succeeded, streak restored to:', lostStreakValue);
            Alert.alert('¡Racha restaurada!', `¡Tu racha de ${lostStreakValue} días fue restaurada!`);
            await refreshRescue();
          } else if (result.error) {
            console.warn('[Home Android] Streak rescue purchase failed:', result.error);
            Alert.alert('Error', result.error);
          }
        }}
        onDismiss={() => {
          console.log('[Home Android] Streak rescue dismissed');
          dismissRescue();
        }}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...typography.body },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorText: { ...typography.body, textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.lg },
  retryButton: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: borderRadius.md },
  retryButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
  segmentedControlWrapper: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: borderRadius.full,
    padding: 3,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonText: { fontSize: 14, fontWeight: '600' },

  scrollContent: { paddingHorizontal: spacing.md, paddingBottom: 120 },
  dateNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  dateButton: { padding: spacing.sm, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dateCenter: { alignItems: 'center', flex: 1 },
  dateLabel: { ...typography.caption, marginBottom: 2 },
  dateText: { ...typography.h3 },
  todayButton: { borderRadius: borderRadius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignItems: 'center', marginBottom: spacing.md },
  todayButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  summaryCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing.md },
  summaryItem: { alignItems: 'center' },
  summaryLabel: { ...typography.caption, marginBottom: spacing.xs },
  summaryValue: { ...typography.h2 },
  summaryDivider: { width: 1, backgroundColor: colors.border },
  progressBarContainer: { height: 8, borderRadius: borderRadius.full, overflow: 'hidden', marginBottom: spacing.md },
  progressBarFill: { height: '100%', borderRadius: borderRadius.full },
  macrosSummary: { flexDirection: 'row', justifyContent: 'space-around' },
  macroItem: { alignItems: 'center' },
  macroValue: { ...typography.bodyBold, fontSize: 18 },
  macroLabel: { ...typography.caption },
  mealCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  mealTitle: { ...typography.h3 },
  mealCalories: { ...typography.caption, marginTop: 2 },
  addMealButton: { padding: spacing.xs },
  emptyMeal: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    borderStyle: 'dashed',
  },
  emptyMealText: { ...typography.body },
  itemSeparator: { height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: spacing.xs },
  foodItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  foodInfo: { flex: 1 },
  foodName: { ...typography.bodyBold, marginBottom: 2 },
  foodBrand: { ...typography.caption, marginBottom: 2 },
  foodDetails: { ...typography.caption },
  foodCalories: { alignItems: 'flex-end' },
  foodCaloriesValue: { ...typography.bodyBold, fontSize: 18 },
  foodCaloriesLabel: { ...typography.caption },
  bottomSpacer: { height: 40 },
  // Planning styles
  plansLoadingContainer: { paddingVertical: spacing.xxl, alignItems: 'center' },
  plansEmptyCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginBottom: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  plansEmptyContainer: { paddingVertical: spacing.xl, alignItems: 'center' },
  plansEmptyTitle: { ...typography.h3, marginTop: spacing.sm },
  plansEmptyText: { ...typography.body, textAlign: 'center' },
  planCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  planCardContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planCardLeft: { flex: 1 },
  planName: { ...typography.bodyBold, marginBottom: 2 },
  planDateRange: { ...typography.caption },
  createPlanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  createPlanButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
