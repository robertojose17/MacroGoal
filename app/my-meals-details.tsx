
import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, TextInput, ActivityIndicator, Animated } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase, TABLE_SAVED_MEALS, TABLE_SAVED_MEAL_ITEMS } from '@/lib/supabase/client';
import { loadDraft, clearDraft } from '@/utils/myMealsDraft';
import { addMealPlanItem } from '@/utils/mealPlansApi';
import { toLocalDateString } from '@/utils/dateUtils';
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow';
import { calcMacros } from '@/utils/macros';


interface SavedMealItem {
  id: string;
  food_item_id: string | null;
  food_id: string | null;
  food_name: string | null;
  food_brand: string | null;
  serving_amount: number;
  serving_unit: string;
  servings_count: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  food_items: {
    id: string;
    name: string;
    brand: string | null;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number | null;
    serving_size: number;
    macros_per: string | null;
  } | null;
  foods: {
    id: string;
    name: string;
    brand: string | null;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    fiber: number | null;
    serving_amount: number;
    serving_unit: string;
  } | null;
}

function calcItemMacros(item: SavedMealItem, multiplier: number) {
  const fi = item.food_items;
  const fd = item.foods;
  const grams = item.serving_amount * item.servings_count * multiplier;

  console.log('[calcItemMacros] item:', item.food_name, 'grams:', grams, 'multiplier:', multiplier, 'fi:', fi, 'fd:', fd);

  // Tier 1: food_items join (has serving_size and macros_per)
  if (fi) {
    const safefi = fi.serving_size > 0 ? fi : { ...fi, serving_size: 100, macros_per: '100g' as string | null };
    const result = calcMacros(safefi, grams);
    console.log('[calcItemMacros] Tier 1 result:', result);
    if (result.calories > 0 || result.protein > 0 || result.carbs > 0 || result.fat > 0) {
      return { calories: result.calories, protein: result.protein, carbs: result.carbs, fats: result.fat, fiber: result.fiber };
    }
  }

  // Tier 2: foods table join (calories/protein/carbs/fats are per-serving)
  if (fd && (fd.calories > 0 || fd.protein > 0 || fd.carbs > 0 || fd.fats > 0)) {
    const servingSize = fd.serving_amount > 0 ? fd.serving_amount : 100;
    const ratio = grams / servingSize;
    console.log('[calcItemMacros] Tier 2 fallback — using foods join, servingSize:', servingSize, 'grams:', grams, 'ratio:', ratio);
    return {
      calories: fd.calories * ratio,
      protein: fd.protein * ratio,
      carbs: fd.carbs * ratio,
      fats: fd.fats * ratio,
      fiber: (fd.fiber ?? 0) * ratio,
    };
  }

  // Tier 3: stored macro columns on saved_meal_items (denormalized at save time)
  if (item.calories != null && item.calories > 0) {
    console.log('[calcItemMacros] Tier 3 fallback — using stored macros');
    return {
      calories: (item.calories ?? 0) * multiplier,
      protein: (item.protein ?? 0) * multiplier,
      carbs: (item.carbs ?? 0) * multiplier,
      fats: (item.fat ?? 0) * multiplier,
      fiber: (item.fiber ?? 0) * multiplier,
    };
  }

  console.log('[calcItemMacros] All tiers failed — returning zeros');
  return { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 };
}

interface SavedMeal {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  saved_meal_items: SavedMealItem[];
}

export default function MyMealsDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const mealId = params.mealId as string;
  const mealType = (params.meal as string) || 'breakfast';
  const date = (params.date as string) || toLocalDateString();
  const returnTo = (params.returnTo as string) || undefined;
  const mode = (params.mode as string) || '';
  const planId = (params.planId as string) || '';

  const [savedMeal, setSavedMeal] = useState<SavedMeal | null>(null);
  const [loading, setLoading] = useState(false);
  const [servingsMultiplier, setServingsMultiplier] = useState('1');
  const [adding, setAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [bannerQueue, setBannerQueue] = useState<string[]>([]);
  const [currentBanner, setCurrentBanner] = useState<string | null>(null);
  const [bannerOpacity] = useState(new Animated.Value(0));
  const isShowingBannerRef = useRef(false);
  const bannerTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadSavedMeal = useCallback(async () => {
    if (!mealId) return;

    try {
      setLoading(true);
      console.log('[MyMealsDetails] ========== LOADING SAVED MEAL ==========');
      console.log('[MyMealsDetails] Meal ID:', mealId);

      const { data, error } = await supabase
        .from(TABLE_SAVED_MEALS)
        .select(`
          id,
          name,
          created_at,
          updated_at,
          saved_meal_items (
            id,
            food_item_id,
            food_id,
            food_name,
            food_brand,
            serving_amount,
            serving_unit,
            servings_count,
            calories,
            protein,
            carbs,
            fat,
            fiber,
            food_items!saved_meal_items_food_item_id_fkey (
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
            foods!saved_meal_items_food_id_fkey (
              id,
              name,
              brand,
              calories,
              protein,
              carbs,
              fats,
              fiber,
              serving_amount,
              serving_unit
            )
          )
        `)
        .eq('id', mealId)
        .single();

      if (error) {
        console.error('[MyMealsDetails] ❌ Error loading saved meal:', error);
        console.error('[MyMealsDetails] Error code:', error.code);
        console.error('[MyMealsDetails] Error message:', error.message);
        console.error('[MyMealsDetails] Error details:', error.details);
        Alert.alert('Error', 'Failed to load meal details');
        router.back();
        return;
      }

      console.log('[MyMealsDetails] ✅ Loaded meal:', data.name);
      console.log('[MyMealsDetails] Items count:', data.saved_meal_items?.length || 0);
      
      // DEBUG: Log each item
      console.log('[MyMealsDetails] ========== MEAL ITEMS ==========');
      data.saved_meal_items?.forEach((item: any, index: number) => {
        console.log(`[MyMealsDetails] Item ${index + 1}:`, {
          id: item.id,
          food_item_id: item.food_item_id,
          food_id: item.food_id,
          food_name: item.food_items?.name ?? item.food_name ?? 'MISSING',
          serving_amount: item.serving_amount,
          serving_unit: item.serving_unit,
          servings_count: item.servings_count,
        });
        
        if (!item.food_items && !item.food_name) {
          console.error('[MyMealsDetails] ❌ MISSING FOOD DATA for item:', item.id);
          console.error('[MyMealsDetails] food_item_id:', item.food_item_id);
        }
      });

      setSavedMeal(data as SavedMeal);
      setLoading(false);
    } catch (error) {
      console.error('[MyMealsDetails] ❌ Error in loadSavedMeal:', error);
      if (error instanceof Error) {
        console.error('[MyMealsDetails] Error message:', error.message);
        console.error('[MyMealsDetails] Error stack:', error.stack);
      }
      Alert.alert('Error', 'An unexpected error occurred');
      router.back();
      setLoading(false);
    }
  }, [mealId, router]);

  useFocusEffect(
    useCallback(() => {
      console.log('[MyMealsDetails] Screen focused');
      const flushDraftAndLoad = async () => {
        const draft = await loadDraft();
        console.log('[MyMealsDetails] Draft items found:', draft.length);
        if (draft.length > 0 && mealId) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            console.log('[MyMealsDetails] Flushing', draft.length, 'draft items into saved_meal_items for mealId:', mealId);
            const itemsToInsert = draft.map(item => ({
              saved_meal_id: mealId,
              food_id: item.food_id || null,
              food_item_id: item.food_item_id || null,
              food_name: item.food_name,
              food_brand: item.food_brand || null,
              serving_amount: item.serving_amount,
              serving_unit: item.serving_unit,
              servings_count: item.servings_count,
              calories: item.calories,
              protein: item.protein,
              carbs: item.carbs,
              fat: item.fats,
              fiber: item.fiber,
            }));
            const { error } = await supabase.from(TABLE_SAVED_MEAL_ITEMS).insert(itemsToInsert);
            if (error) {
              console.error('[MyMealsDetails] Error flushing draft items:', error);
            } else {
              console.log('[MyMealsDetails] Draft items flushed successfully');
            }
            await clearDraft();
          }
        }
        loadSavedMeal();
      };
      flushDraftAndLoad();
    }, [loadSavedMeal, mealId])
  );

  const calculateTotals = () => {
    if (!savedMeal) return { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 };

    const multiplier = parseFloat(servingsMultiplier) || 1;
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFats = 0;
    let totalFiber = 0;

    savedMeal.saved_meal_items.forEach(item => {
      if (!item.food_items && !item.foods && !item.food_name) {
        console.warn('[MyMealsDetails] Skipping item with missing food data:', item.id);
        return;
      }
      const macros = calcItemMacros(item, multiplier);
      totalCalories += macros.calories;
      totalProtein += macros.protein;
      totalCarbs += macros.carbs;
      totalFats += macros.fats;
      totalFiber += macros.fiber;
    });

    return {
      calories: totalCalories,
      protein: totalProtein,
      carbs: totalCarbs,
      fats: totalFats,
      fiber: totalFiber,
    };
  };

  const showSuccessBanner = useCallback((message: string) => {
    console.log('[MyMealsDetails] Adding banner to queue:', message);
    setBannerQueue(prev => [...prev, message]);
  }, []);

  React.useEffect(() => {
    if (bannerQueue.length === 0 || isShowingBannerRef.current) {
      return;
    }

    console.log('[MyMealsDetails] Showing next banner');
    isShowingBannerRef.current = true;

    const nextBanner = bannerQueue[0];
    setCurrentBanner(nextBanner);

    bannerOpacity.setValue(1);

    bannerTimerRef.current = setTimeout(() => {
      bannerOpacity.setValue(0);
      setBannerQueue(prev => prev.slice(1));
      setCurrentBanner(null);
      isShowingBannerRef.current = false;
    }, 500);
  }, [bannerQueue, bannerOpacity]);

  React.useEffect(() => {
    return () => {
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
      }
    };
  }, []);

  const handleEditMeal = () => {
    console.log('[MyMealsDetails] Navigating to edit meal');
    router.push({
      pathname: '/my-meals-edit',
      params: {
        mealId: mealId,
      },
    });
  };

  const handleDeleteItem = useCallback(async (itemId: string) => {
    console.log('[MyMealsDetails] Deleting item:', itemId);
    const { error } = await supabase.from(TABLE_SAVED_MEAL_ITEMS).delete().eq('id', itemId);
    if (error) {
      console.error('[MyMealsDetails] Error deleting item:', error);
      Alert.alert('Error', 'Failed to delete item');
      return;
    }
    console.log('[MyMealsDetails] Item deleted successfully:', itemId);
    setSavedMeal(prev => prev ? {
      ...prev,
      saved_meal_items: prev.saved_meal_items.filter(i => i.id !== itemId),
    } : null);
    showSuccessBanner('Item removed');
  }, [showSuccessBanner]);

  const handleItemPress = useCallback((item: SavedMealItem) => {
    console.log('[MyMealsDetails] Tapped food item:', item.food_name ?? item.food_items?.name ?? 'Unknown', 'id:', item.id);
    router.push({
      pathname: '/edit-saved-meal-item',
      params: {
        itemId: item.id,
      },
    });
  }, [router]);

  const handleAddToMeal = async () => {
    if (!savedMeal) return;

    const multiplier = parseFloat(servingsMultiplier);
    if (!multiplier || multiplier <= 0) {
      Alert.alert('Error', 'Please enter a valid number of servings');
      return;
    }

    console.log('[MyMealsDetails] ========== ADDING SAVED MEAL TO DIARY ==========');
    console.log('[MyMealsDetails] Meal:', mealType);
    console.log('[MyMealsDetails] Date:', date);
    console.log('[MyMealsDetails] Multiplier:', multiplier);
    setAdding(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to add food');
        setAdding(false);
        return;
      }

      // MEAL PLAN MODE: add all items directly to plan
      if (mode === 'meal-plan' && planId) {
        console.log('[MyMealsDetails] ========== ADDING SAVED MEAL TO PLAN ==========');
        console.log('[MyMealsDetails] Plan ID:', planId, '| Meal type:', mealType, '| Date:', date);
        const validItems = savedMeal.saved_meal_items.filter(item => item.food_items || item.foods || item.food_name);
        console.log('[MyMealsDetails] Adding', validItems.length, 'items to meal plan');
        for (const item of validItems) {
          const macros = calcItemMacros(item, multiplier);
          const itemName = item.food_items?.name ?? item.foods?.name ?? item.food_name ?? '';
          console.log('[MyMealsDetails] addMealPlanItem:', itemName);
          await addMealPlanItem(planId, {
            date,
            meal_type: mealType,
            food_name: itemName,
            brand: item.food_items?.brand ?? item.foods?.brand ?? undefined,
            quantity: item.servings_count * multiplier,
            grams: Math.round(item.serving_amount * item.servings_count * multiplier),
            serving_description: `${Math.round(item.servings_count * multiplier)} × ${Math.round(item.serving_amount)} ${item.serving_unit}`,
            calories: macros.calories,
            protein: macros.protein,
            carbs: macros.carbs,
            fats: macros.fats,
            fiber: macros.fiber,
            food_item_id: item.food_item_id || null,
            food_id: item.food_id || null,
          });
        }
        console.log('[MyMealsDetails] ✅ Saved meal added to plan successfully!');
        showSuccessBanner('Added to plan');
        setAdding(false);
        setTimeout(() => { router.back(); }, 600);
        return;
      }

      // Add all items from saved meal via RPC (one call per item)
      const validItems = savedMeal.saved_meal_items.filter(item => item.food_items || item.foods || item.food_name);
      console.log('[MyMealsDetails] Logging', validItems.length, 'items via log_food RPC');

      for (const item of validItems) {
        const macros = calcItemMacros(item, multiplier);
        const itemName = item.food_items?.name ?? item.foods?.name ?? item.food_name ?? '';
        console.log('[MyMealsDetails] Calling log_food RPC for item:', itemName);
        const { data: rpcData, error: rpcError } = await supabase.rpc('log_food', {
          p_user_id: user.id,
          p_date: date,
          p_meal_type: mealType,
          p_food_id: item.food_id ?? null,
          p_food_item_id: item.food_item_id ?? null,
          p_quantity: item.servings_count * multiplier,
          p_calories: macros.calories,
          p_protein: macros.protein,
          p_carbs: macros.carbs,
          p_fats: macros.fats,
          p_fiber: macros.fiber,
          p_serving_description: `${Math.round(item.servings_count * multiplier)} × ${Math.round(item.serving_amount)} ${item.serving_unit}`,
          p_grams: Math.round(item.serving_amount * item.servings_count * multiplier),
          p_logged_at: new Date().toISOString(),
        });

        if (rpcError) {
          console.error('[MyMealsDetails] log_food RPC error for item:', itemName, rpcError);
          Alert.alert('Error', 'Failed to add foods to meal');
          setAdding(false);
          return;
        }

        console.log('[MyMealsDetails] log_food RPC success for', itemName, 'meal_id:', rpcData?.meal_id, 'meal_item_id:', rpcData?.meal_item_id);
      }

      console.log('[MyMealsDetails] ✅ Saved meal added successfully!');

      const mealLabels: Record<string, string> = {
        breakfast: 'Breakfast',
        lunch: 'Lunch',
        dinner: 'Dinner',
        snack: 'Snacks',
      };

      showSuccessBanner(`Added to ${mealLabels[mealType]}`);
      setAdding(false);

      setTimeout(() => {
        router.back();
      }, 600);
    } catch (error) {
      console.error('[MyMealsDetails] Error in handleAddToMeal:', error);
      Alert.alert('Error', 'An unexpected error occurred');
      setAdding(false);
    }
  };

  if (loading || !savedMeal) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
        edges={['top']}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            Loading meal details...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const totals = calculateTotals();
  const mealLabels: Record<string, string> = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snacks',
  };

  // Filter out items with missing food data for display
  const validItems = savedMeal.saved_meal_items.filter(item => item.food_items || item.foods || item.food_name);
  const missingItemsCount = savedMeal.saved_meal_items.length - validItems.length;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { console.log('[MyMealsDetails] Back button pressed'); router.back(); }} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={isDark ? colors.textDark : colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? colors.textDark : colors.text }]}>
          Meal Details
        </Text>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => {
            const next = !isEditing;
            console.log('[MyMealsDetails] Edit toggle pressed, isEditing:', next);
            setIsEditing(next);
          }}
        >
          <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>
            {isEditing ? 'Done' : 'Edit'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mealHeader}>
          <Text style={[styles.mealName, { color: isDark ? colors.textDark : colors.text }]}>
            {savedMeal.name}
          </Text>
          <Text style={[styles.mealMeta, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {validItems.length} {validItems.length === 1 ? 'item' : 'items'}
            {missingItemsCount > 0 && ` (${missingItemsCount} missing)`}
          </Text>
        </View>

        {missingItemsCount > 0 && (
          <View style={[styles.warningCard, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle.fill"
              android_material_icon_name="warning"
              size={20}
              color="#F59E0B"
            />
            <Text style={[styles.warningText, { color: '#92400E' }]}>
              {missingItemsCount} {missingItemsCount === 1 ? 'food is' : 'foods are'} missing from this meal. They may have been deleted.
            </Text>
          </View>
        )}

        <View style={[styles.servingsCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <Text style={[styles.servingsLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Servings of this meal
          </Text>
          <TextInput
            style={[
              styles.servingsInput,
              {
                backgroundColor: isDark ? colors.backgroundDark : colors.background,
                borderColor: isDark ? colors.borderDark : colors.border,
                color: isDark ? colors.textDark : colors.text,
              }
            ]}
            placeholder="1"
            placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
            keyboardType="decimal-pad"
            value={servingsMultiplier}
            onChangeText={setServingsMultiplier}
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {'Foods ('}
            {validItems.length}
            {')'}
          </Text>
          {isEditing && (
            <TouchableOpacity
              style={[styles.addFoodButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                console.log('[MyMealsDetails] Add Food button pressed, navigating to /add-food with context: my_meals_builder, mealId:', mealId);
                router.push({
                  pathname: '/add-food',
                  params: {
                    context: 'my_meals_builder',
                    meal: mealType,
                    date: date,
                    returnTo: '/my-meals-details',
                  },
                });
              }}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="plus"
                android_material_icon_name="add"
                size={16}
                color="#FFFFFF"
              />
              <Text style={styles.addFoodButtonText}>Add Food</Text>
            </TouchableOpacity>
          )}
        </View>

        {validItems.map((item) => {
          const itemMacros = calcItemMacros(item, parseFloat(servingsMultiplier) || 1);
          const itemCaloriesRounded = Math.round(itemMacros.calories);
          const itemProteinRounded = Math.round(itemMacros.protein);
          const itemCarbsRounded = Math.round(itemMacros.carbs);
          const itemFatsRounded = Math.round(itemMacros.fats);
          const foodName = item.food_items?.name ?? item.foods?.name ?? item.food_name ?? 'Unknown Food';
          const foodBrand = item.food_items?.brand ?? item.foods?.brand ?? item.food_brand;
          const count = item.servings_count ?? 1;
          const amount = Math.round(item.serving_amount ?? 100);
          const unit = item.serving_unit ?? 'g';
          const servingText = count === 1 ? `${amount} ${unit}` : `${count} × ${amount} ${unit}`;

          return (
            <SwipeToDeleteRow key={item.id} onDelete={() => handleDeleteItem(item.id)}>
              {(isSwiping) => (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => { if (!isSwiping) handleItemPress(item); }}
                  disabled={isSwiping}
                  style={[styles.foodItem, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
                >
                  <View style={styles.foodInfo}>
                    <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text }]}>
                      {foodName}
                    </Text>
                    {foodBrand ? (
                      <Text style={[styles.foodBrand, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                        {foodBrand}
                      </Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Text style={[styles.foodDetails, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                        {servingText}
                      </Text>
                      <Text style={[styles.foodDetails, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                        {'  ·  '}
                      </Text>
                      <Text style={[styles.foodDetails, { color: colors.protein }]}>
                        {itemProteinRounded}{'P'}
                      </Text>
                      <Text style={[styles.foodDetails, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                        {'  '}
                      </Text>
                      <Text style={[styles.foodDetails, { color: colors.carbs }]}>
                        {itemCarbsRounded}{'C'}
                      </Text>
                      <Text style={[styles.foodDetails, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                        {'  '}
                      </Text>
                      <Text style={[styles.foodDetails, { color: colors.fats }]}>
                        {itemFatsRounded}{'F'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.foodCalories}>
                    <Text style={[styles.foodCaloriesValue, { color: isDark ? colors.textDark : colors.text }]}>
                      {itemCaloriesRounded}
                    </Text>
                    <Text style={[styles.foodCaloriesLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      kcal
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </SwipeToDeleteRow>
          );
        })}

        <View style={[styles.totalsCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <Text style={[styles.totalsTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Total Nutrition
          </Text>
          <View style={styles.totalsRow}>
            <View style={styles.totalItem}>
              <Text style={[styles.totalValue, { color: colors.calories }]}>
                {Math.round(totals.calories)}
              </Text>
              <Text style={[styles.totalLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Calories
              </Text>
            </View>
            <View style={styles.totalItem}>
              <Text style={[styles.totalValue, { color: colors.protein }]}>
                {Math.round(totals.protein)}g
              </Text>
              <Text style={[styles.totalLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Protein
              </Text>
            </View>
            <View style={styles.totalItem}>
              <Text style={[styles.totalValue, { color: colors.carbs }]}>
                {Math.round(totals.carbs)}g
              </Text>
              <Text style={[styles.totalLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Carbs
              </Text>
            </View>
            <View style={styles.totalItem}>
              <Text style={[styles.totalValue, { color: colors.fats }]}>
                {Math.round(totals.fats)}g
              </Text>
              <Text style={[styles.totalLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Fat
              </Text>
            </View>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.primary, opacity: adding ? 0.7 : 1 }]}
          onPress={() => { console.log('[MyMealsDetails] Add to meal button pressed, meal:', mealType, 'date:', date); handleAddToMeal(); }}
          disabled={adding || validItems.length === 0}
          activeOpacity={0.7}
        >
          {adding ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.addButtonText}>Add to {mealLabels[mealType]}</Text>
          )}
        </TouchableOpacity>
      </View>

      {currentBanner && (
        <Animated.View
          style={[
            styles.bannerContainer,
            {
              opacity: bannerOpacity,
            }
          ]}
        >
          <View style={styles.banner}>
            <IconSymbol
              ios_icon_name="checkmark.circle.fill"
              android_material_icon_name="check_circle"
              size={20}
              color="#FFFFFF"
            />
            <Text style={styles.bannerText}>{currentBanner}</Text>
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  loadingText: {
    ...typography.body,
    fontSize: 15,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.sm,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    ...typography.h3,
    fontSize: 18,
    flex: 1,
    textAlign: 'center',
  },
  editButton: {
    padding: spacing.xs,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  mealHeader: {
    marginBottom: spacing.md,
  },
  mealName: {
    ...typography.h2,
    fontSize: 24,
    marginBottom: spacing.xs,
  },
  mealMeta: {
    ...typography.body,
    fontSize: 14,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  warningText: {
    ...typography.body,
    fontSize: 13,
    flex: 1,
  },
  servingsCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
    elevation: 1,
  },
  servingsLabel: {
    ...typography.caption,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  servingsInput: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 18,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.bodyBold,
    fontSize: 16,
  },
  addFoodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  addFoodButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  itemCard: {
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
    elevation: 1,
    padding: spacing.md,
  },
  itemInfo: {
    flex: 1,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  itemName: {
    ...typography.bodyBold,
    fontSize: 16,
  },
  customBadge: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
  },
  itemBrand: {
    ...typography.caption,
    fontSize: 13,
    marginBottom: 2,
  },
  itemServing: {
    ...typography.caption,
    fontSize: 13,
    marginBottom: 2,
  },
  itemMacros: {
    ...typography.caption,
    fontSize: 12,
  },
  foodItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
    elevation: 1,
  },
  foodInfo: { flex: 1 },
  foodName: { ...typography.bodyBold, marginBottom: 2 },
  foodBrand: { ...typography.caption, marginBottom: 2 },
  foodDetails: { ...typography.caption },
  foodCalories: { alignItems: 'flex-end' },
  foodCaloriesValue: { ...typography.bodyBold, fontSize: 18 },
  foodCaloriesLabel: { ...typography.caption },
  totalsCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
    elevation: 1,
  },
  totalsTitle: {
    ...typography.bodyBold,
    fontSize: 16,
    marginBottom: spacing.md,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  totalItem: {
    alignItems: 'center',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  totalLabel: {
    ...typography.caption,
    fontSize: 12,
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border + '30',
  },
  addButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  bannerContainer: {
    position: 'absolute',
    bottom: 100,
    left: spacing.md,
    right: spacing.md,
    alignItems: 'center',
    zIndex: 1000,
    pointerEvents: 'none',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.3)',
    elevation: 8,
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
