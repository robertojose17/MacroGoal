
import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, TextInput, ActivityIndicator, Animated } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase, TABLE_SAVED_MEALS, TABLE_SAVED_MEAL_ITEMS } from '@/lib/supabase/client';
import { toLocalDateString } from '@/utils/dateUtils';
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow';

interface SavedMealItem {
  id: string;
  food_id: string;
  serving_amount: number;
  serving_unit: string;
  servings_count: number;
  foods: {
    id: string;
    name: string;
    brand?: string;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    fiber: number;
    user_created: boolean;
    created_by?: string;
  };
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

  const [savedMeal, setSavedMeal] = useState<SavedMeal | null>(null);
  const [loading, setLoading] = useState(false);
  const [servingsMultiplier, setServingsMultiplier] = useState('1');
  const [adding, setAdding] = useState(false);

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
            food_id,
            serving_amount,
            serving_unit,
            servings_count,
            foods (
              id,
              name,
              brand,
              calories,
              protein,
              carbs,
              fats,
              fiber,
              user_created,
              created_by
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
          food_id: item.food_id,
          food_name: item.foods?.name || 'MISSING',
          food_user_created: item.foods?.user_created,
          food_created_by: item.foods?.created_by,
          serving_amount: item.serving_amount,
          serving_unit: item.serving_unit,
          servings_count: item.servings_count,
        });
        
        if (!item.foods) {
          console.error('[MyMealsDetails] ❌ MISSING FOOD DATA for item:', item.id);
          console.error('[MyMealsDetails] food_id:', item.food_id);
        }
      });
      
      // Check for items with missing food data
      const itemsWithMissingFood = data.saved_meal_items?.filter((item: any) => !item.foods) || [];
      if (itemsWithMissingFood.length > 0) {
        console.error('[MyMealsDetails] ❌ CRITICAL: Found', itemsWithMissingFood.length, 'items with missing food data');
        itemsWithMissingFood.forEach((item: any) => {
          console.error('[MyMealsDetails] Missing food for item:', {
            item_id: item.id,
            food_id: item.food_id,
          });
        });
        
        // Try to fetch the missing foods directly
        console.log('[MyMealsDetails] Attempting to fetch missing foods directly...');
        const missingFoodIds = itemsWithMissingFood.map((item: any) => item.food_id);
        const { data: missingFoods, error: missingFoodsError } = await supabase
          .from('foods')
          .select('*')
          .in('id', missingFoodIds);
        
        if (missingFoodsError) {
          console.error('[MyMealsDetails] ❌ Error fetching missing foods:', missingFoodsError);
        } else {
          console.log('[MyMealsDetails] Missing foods query result:', missingFoods);
          if (missingFoods && missingFoods.length > 0) {
            console.log('[MyMealsDetails] ✅ Found', missingFoods.length, 'missing foods');
            missingFoods.forEach((food: any) => {
              console.log('[MyMealsDetails] Missing food:', {
                id: food.id,
                name: food.name,
                user_created: food.user_created,
                created_by: food.created_by,
              });
            });
          } else {
            console.error('[MyMealsDetails] ❌ Missing foods not found in database!');
          }
        }
      }

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
      loadSavedMeal();
    }, [loadSavedMeal])
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
      if (!item.foods) {
        console.warn('[MyMealsDetails] Skipping item with missing food data:', item.id);
        return;
      }
      
      const itemMultiplier = (item.serving_amount / 100) * item.servings_count * multiplier;
      totalCalories += item.foods.calories * itemMultiplier;
      totalProtein += item.foods.protein * itemMultiplier;
      totalCarbs += item.foods.carbs * itemMultiplier;
      totalFats += item.foods.fats * itemMultiplier;
      totalFiber += item.foods.fiber * itemMultiplier;
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
    console.log('[MyMealsDetails] Tapped food item:', item.foods?.name, 'id:', item.id);
    const offData = {
      product_name: item.foods.name,
      brands: item.foods.brand || '',
      nutriments: {
        'energy-kcal_100g': item.foods.calories,
        protein_100g: item.foods.protein,
        carbohydrates_100g: item.foods.carbs,
        fat_100g: item.foods.fats,
        fiber_100g: item.foods.fiber,
      },
      serving_quantity: item.serving_amount,
      serving_quantity_unit: item.serving_unit,
      food_id: item.food_id,
    };
    router.push({
      pathname: '/food-details',
      params: {
        offData: JSON.stringify(offData),
        meal: mealType,
        date: date,
        food_item_id: item.food_item_id || '',
        returnTo: 'my-meals-details',
        mealId: mealId,
      },
    });
  }, [router, mealType, date, mealId]);

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

      // Add all items from saved meal via RPC (one call per item)
      const validItems = savedMeal.saved_meal_items.filter(item => item.foods);
      console.log('[MyMealsDetails] Logging', validItems.length, 'items via log_food RPC');

      for (const item of validItems) {
        const itemMultiplier = (item.serving_amount / 100) * item.servings_count * multiplier;
        console.log('[MyMealsDetails] Calling log_food RPC for item:', item.foods.name);
        const { data: rpcData, error: rpcError } = await supabase.rpc('log_food', {
          p_user_id: user.id,
          p_date: date,
          p_meal_type: mealType,
          p_food_id: item.food_id,
          p_food_item_id: null,
          p_quantity: item.servings_count * multiplier,
          p_calories: (Number(item.foods.calories) || 0) * itemMultiplier,
          p_protein: (Number(item.foods.protein) || 0) * itemMultiplier,
          p_carbs: (Number(item.foods.carbs) || 0) * itemMultiplier,
          p_fats: (Number(item.foods.fats) || 0) * itemMultiplier,
          p_fiber: (Number(item.foods.fiber) || 0) * itemMultiplier,
          p_serving_description: `${Math.round(item.servings_count * multiplier)} × ${Math.round(item.serving_amount)} ${item.serving_unit}`,
          p_grams: Math.round(item.serving_amount * item.servings_count * multiplier),
          p_logged_at: new Date().toISOString(),
        });

        if (rpcError) {
          console.error('[MyMealsDetails] log_food RPC error for item:', item.foods.name, rpcError);
          Alert.alert('Error', 'Failed to add foods to meal');
          setAdding(false);
          return;
        }

        console.log('[MyMealsDetails] log_food RPC success for', item.foods.name, 'meal_id:', rpcData?.meal_id, 'meal_item_id:', rpcData?.meal_item_id);
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
  const validItems = savedMeal.saved_meal_items.filter(item => item.foods);
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
        <View style={styles.editButton} />
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

        <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
          Foods
        </Text>

        {validItems.map((item) => {
          const multiplier = (item.serving_amount / 100) * item.servings_count * (parseFloat(servingsMultiplier) || 1);
          const itemCalories = item.foods.calories * multiplier;
          const itemProtein = item.foods.protein * multiplier;
          const itemCarbs = item.foods.carbs * multiplier;
          const itemFats = item.foods.fats * multiplier;
          const itemCaloriesRounded = Math.round(itemCalories);
          const itemProteinRounded = Math.round(itemProtein);
          const itemCarbsRounded = Math.round(itemCarbs);
          const itemFatsRounded = Math.round(itemFats);
          const servingAmountRounded = Math.round(item.serving_amount);
          const foodName = item.foods.name;
          const foodBrand = item.foods.brand;
          const isUserCreated = item.foods.user_created;

          return (
            <SwipeToDeleteRow key={item.id} onDelete={() => handleDeleteItem(item.id)}>
              {(isSwiping) => (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => { if (!isSwiping) handleItemPress(item); }}
                  disabled={isSwiping}
                  style={[styles.itemCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
                >
                  <View style={styles.itemInfo}>
                    <View style={styles.itemNameRow}>
                      <Text style={[styles.itemName, { color: isDark ? colors.textDark : colors.text }]}>
                        {foodName}
                      </Text>
                      {isUserCreated && (
                        <Text style={[styles.customBadge, { color: colors.primary }]}>
                          {' (My Food)'}
                        </Text>
                      )}
                    </View>
                    {foodBrand ? (
                      <Text style={[styles.itemBrand, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                        {foodBrand}
                      </Text>
                    ) : null}
                    <Text style={[styles.itemServing, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      {item.servings_count}
                      {' × '}
                      {servingAmountRounded}
                      {' '}
                      {item.serving_unit}
                      {' • '}
                      {itemCaloriesRounded}
                      {' cal'}
                    </Text>
                    <Text style={[styles.itemMacros, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      {'P: '}
                      {itemProteinRounded}
                      {'g • C: '}
                      {itemCarbsRounded}
                      {'g • F: '}
                      {itemFatsRounded}
                      {'g'}
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
  sectionTitle: {
    ...typography.bodyBold,
    fontSize: 16,
    marginBottom: spacing.sm,
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
