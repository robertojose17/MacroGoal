
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import ProgressCircle from '@/components/ProgressCircle';
import { IconSymbol } from '@/components/IconSymbol';
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow';
import { supabase } from '@/app/integrations/supabase/client';

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
  foods: {
    id: string;
    name: string;
    brand: string | null;
    serving_amount: number;
    serving_unit: string;
    user_created: boolean;
  } | null;
}

interface MealData {
  type: MealType;
  label: string;
  items: FoodItem[];
  totalCalories: number;
}

const formatDateForStorage = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getServingDisplayText = (item: FoodItem): string => {
  if (item.serving_description) {
    return item.serving_description;
  }
  if (item.grams) {
    return `${Math.round(item.grams)} g`;
  }
  const quantity = item.quantity || 1;
  const servingAmount = item.foods?.serving_amount || 100;
  const servingUnit = item.foods?.serving_unit || 'g';
  
  if (quantity === 1) {
    return `${servingAmount} ${servingUnit}`;
  }
  
  return `${quantity}x ${servingAmount} ${servingUnit}`;
};

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
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
  const [earliestLogDate, setEarliestLogDate] = useState<Date | null>(null);

  const loadEarliestLogDate = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('meals')
        .select('date')
        .eq('user_id', user.id)
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setEarliestLogDate(new Date(data.date + 'T00:00:00'));
      }
    } catch (error) {
      console.error('[Home iOS] Error loading earliest log date:', error);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[Home iOS] No user found');
        setLoading(false);
        return;
      }

      console.log('[Home iOS] Loading data for user:', user.id);

      const { data: goalData, error: goalError } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (goalError) {
        console.error('[Home iOS] Error loading goal:', goalError);
      } else if (goalData) {
        console.log('[Home iOS] Goal loaded:', goalData);
        setGoal(goalData);
      } else {
        console.log('[Home iOS] No active goal found, using defaults');
        setGoal({
          daily_calories: 2000,
          protein_g: 150,
          carbs_g: 200,
          fats_g: 65,
          fiber_g: 30,
        });
      }

      const dateString = formatDateForStorage(selectedDate);
      console.log('[Home iOS] Loading meals for date:', dateString);
      
      const { data: mealsData, error: mealsError } = await supabase
        .from('meals')
        .select(`
          id,
          meal_type,
          date,
          meal_items (
            id,
            quantity,
            calories,
            protein,
            carbs,
            fats,
            fiber,
            serving_description,
            grams,
            foods (
              id,
              name,
              brand,
              serving_amount,
              serving_unit,
              user_created
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('date', dateString);

      if (mealsError) {
        console.error('[Home iOS] Error loading meals:', mealsError);
      } else {
        console.log('[Home iOS] Meals loaded for', dateString, ':', mealsData?.length || 0, 'meals');
        
        const mealsByType: Record<MealType, FoodItem[]> = {
          breakfast: [],
          lunch: [],
          dinner: [],
          snack: [],
        };

        let totalCals = 0;
        let totalP = 0;
        let totalC = 0;
        let totalF = 0;
        let totalFib = 0;

        if (mealsData && mealsData.length > 0) {
          mealsData.forEach((meal: any) => {
            if (meal.meal_items) {
              meal.meal_items.forEach((item: any) => {
                mealsByType[meal.meal_type as MealType].push(item);
                totalCals += item.calories || 0;
                totalP += item.protein || 0;
                totalC += item.carbs || 0;
                totalF += item.fats || 0;
                totalFib += item.fiber || 0;
              });
            }
          });
        }

        const updatedMeals: MealData[] = [
          { 
            type: 'breakfast', 
            label: 'Breakfast', 
            items: [...mealsByType.breakfast],
            totalCalories: mealsByType.breakfast.reduce((sum, item) => sum + (item.calories || 0), 0)
          },
          { 
            type: 'lunch', 
            label: 'Lunch', 
            items: [...mealsByType.lunch],
            totalCalories: mealsByType.lunch.reduce((sum, item) => sum + (item.calories || 0), 0)
          },
          { 
            type: 'dinner', 
            label: 'Dinner', 
            items: [...mealsByType.dinner],
            totalCalories: mealsByType.dinner.reduce((sum, item) => sum + (item.calories || 0), 0)
          },
          { 
            type: 'snack', 
            label: 'Snacks', 
            items: [...mealsByType.snack],
            totalCalories: mealsByType.snack.reduce((sum, item) => sum + (item.calories || 0), 0)
          },
        ];

        setMeals(updatedMeals);
        setTotalCalories(totalCals);
        setTotalMacros({ protein: totalP, carbs: totalC, fats: totalF, fiber: totalFib });
      }
    } catch (error) {
      console.error('[Home iOS] Error in loadData:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      console.log('[Home iOS] Screen focused, loading data');
      loadData();
      loadEarliestLogDate();
    }, [loadData, loadEarliestLogDate])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleAddFood = (mealType: MealType) => {
    console.log('[Home iOS] Opening add food for meal:', mealType);
    const dateString = formatDateForStorage(selectedDate);
    console.log('[Home iOS] Passing date to add-food:', dateString);
    router.push(`/add-food?meal=${mealType}&date=${dateString}`);
  };

  const handleEditFood = (item: FoodItem, isSwiping: boolean) => {
    if (isSwiping) {
      console.log('[Home iOS] ❌ Blocked edit - swipe gesture is active');
      return;
    }
    console.log('[Home iOS] ✅ Opening edit food:', item.id);
    const dateString = formatDateForStorage(selectedDate);
    router.push({
      pathname: '/edit-food',
      params: {
        itemId: item.id,
        date: dateString,
      },
    });
  };

  const handleDeleteFood = useCallback(async (itemId: string) => {
    console.log('[Home iOS] ========== DELETE FOOD ==========');
    console.log('[Home iOS] Delete requested for item:', itemId);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('No authenticated user found');
      }
      
      console.log('[Home iOS] Step 1: Remove from UI state immediately');
      
      let deletedItem: FoodItem | null = null;
      
      setMeals(prevMeals => {
        const newMeals = prevMeals.map(meal => {
          const itemToDelete = meal.items.find(i => i.id === itemId);
          if (itemToDelete) {
            deletedItem = itemToDelete;
          }
          
          const filteredItems = meal.items.filter(i => i.id !== itemId);
          
          return {
            ...meal,
            items: filteredItems,
            totalCalories: filteredItems.reduce((sum, i) => sum + (i.calories || 0), 0)
          };
        });
        
        console.log('[Home iOS] ✅ UI state updated - item removed from list');
        return newMeals;
      });
      
      if (deletedItem) {
        setTotalCalories(prev => prev - (deletedItem.calories || 0));
        setTotalMacros(prev => ({
          protein: prev.protein - (deletedItem.protein || 0),
          carbs: prev.carbs - (deletedItem.carbs || 0),
          fats: prev.fats - (deletedItem.fats || 0),
          fiber: prev.fiber - (deletedItem.fiber || 0),
        }));
      }
      
      console.log('[Home iOS] Step 2: Delete from database');
      
      const { error } = await supabase
        .from('meal_items')
        .delete()
        .eq('id', itemId);
      
      if (error) {
        console.error('[Home iOS] ❌ Database delete error:', error);
        throw error;
      }
      
      console.log('[Home iOS] ✅ Successfully deleted from database');
      
    } catch (error: any) {
      console.error('[Home iOS] ❌ Error in handleDeleteFood:', error);
      
      Alert.alert(
        'Delete Failed', 
        error?.message || 'Failed to delete food entry. Please try again.',
        [{ text: 'OK' }]
      );
      
      console.log('[Home iOS] Reloading data to sync UI with database...');
      loadData();
    }
  }, [loadData]);

  const goToPreviousDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const goToNextDay = () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const isToday = () => {
    const today = new Date();
    return selectedDate.toDateString() === today.toDateString();
  };

  const isFutureDate = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    return selected >= today;
  };

  const isEarliestDate = () => {
    if (!earliestLogDate) return false;
    const earliest = new Date(earliestLogDate);
    earliest.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    return selected <= earliest;
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            Loading...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const caloriesRemaining = (goal?.daily_calories || 2000) - totalCalories;

  const leftArrowDisabled = isEarliestDate();
  const rightArrowDisabled = isFutureDate();

  const renderFoodItem = ({ item }: { item: FoodItem }) => (
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
              {item.foods?.name || 'Unknown Food'}
            </Text>
            {item.foods?.brand && (
              <Text style={[styles.foodBrand, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {item.foods.brand}
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
      <FlatList
        data={[{ key: 'content' }]}
        renderItem={() => (
          <View>
            <View style={[styles.dateNavigation, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
              <TouchableOpacity 
                onPress={goToPreviousDay} 
                style={styles.dateButton}
                disabled={leftArrowDisabled}
                activeOpacity={leftArrowDisabled ? 1 : 0.7}
              >
                <IconSymbol
                  ios_icon_name="arrow.left"
                  android_material_icon_name="arrow_back"
                  size={24}
                  color={isDark ? colors.textDark : colors.text}
                  style={{ opacity: leftArrowDisabled ? 0.4 : 1 }}
                />
              </TouchableOpacity>
              
              <View style={styles.dateCenter}>
                <Text style={[styles.dateLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  {isToday() ? 'Today' : selectedDate.toLocaleDateString('en-US', { weekday: 'short' })}
                </Text>
                <Text style={[styles.dateText, { color: isDark ? colors.textDark : colors.text }]}>
                  {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>

              <TouchableOpacity 
                onPress={goToNextDay} 
                style={styles.dateButton}
                disabled={rightArrowDisabled}
                activeOpacity={rightArrowDisabled ? 1 : 0.7}
              >
                <IconSymbol
                  ios_icon_name="arrow.right"
                  android_material_icon_name="arrow_forward"
                  size={24}
                  color={isDark ? colors.textDark : colors.text}
                  style={{ opacity: rightArrowDisabled ? 0.4 : 1 }}
                />
              </TouchableOpacity>
            </View>

            {!isToday() && (
              <TouchableOpacity 
                style={[styles.todayButton, { backgroundColor: colors.primary }]}
                onPress={goToToday}
              >
                <Text style={styles.todayButtonText}>Go to Today</Text>
              </TouchableOpacity>
            )}

            <View style={[styles.caloriesCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
              <Text style={[styles.cardTitle, { color: isDark ? colors.textDark : colors.text }]}>
                Calories
              </Text>
              
              <View style={styles.caloriesContent}>
                <ProgressCircle
                  current={totalCalories}
                  target={goal?.daily_calories || 2000}
                  size={140}
                  strokeWidth={12}
                  color={colors.calories}
                  label="kcal"
                />
                
                <View style={styles.macroSummaryCompact}>
                  <MacroSummaryRowCompact
                    label="Protein"
                    eaten={Math.round(totalMacros.protein)}
                    goal={goal?.protein_g || 150}
                    color={colors.protein}
                    isDark={isDark}
                  />
                  <MacroSummaryRowCompact
                    label="Carbs"
                    eaten={Math.round(totalMacros.carbs)}
                    goal={goal?.carbs_g || 200}
                    color={colors.carbs}
                    isDark={isDark}
                  />
                  <MacroSummaryRowCompact
                    label="Fats"
                    eaten={Math.round(totalMacros.fats)}
                    goal={goal?.fats_g || 65}
                    color={colors.fats}
                    isDark={isDark}
                  />
                  <MacroSummaryRowCompact
                    label="Fiber"
                    eaten={Math.round(totalMacros.fiber)}
                    goal={goal?.fiber_g || 30}
                    color={colors.fiber}
                    isDark={isDark}
                  />
                </View>
              </View>
            </View>

            {meals.map((meal) => (
              <View 
                key={meal.type}
                style={[styles.mealCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
              >
                <View style={styles.mealHeader}>
                  <View>
                    <Text style={[styles.mealTitle, { color: isDark ? colors.textDark : colors.text }]}>
                      {meal.label}
                    </Text>
                    <Text style={[styles.mealCalories, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      {Math.round(meal.totalCalories)} kcal
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.addMealButton}
                    onPress={() => handleAddFood(meal.type)}
                  >
                    <IconSymbol
                      ios_icon_name="plus.circle.fill"
                      android_material_icon_name="add_circle"
                      size={28}
                      color={colors.info}
                    />
                  </TouchableOpacity>
                </View>

                {meal.items.length === 0 ? (
                  <TouchableOpacity 
                    style={styles.emptyMeal}
                    onPress={() => handleAddFood(meal.type)}
                  >
                    <Text style={[styles.emptyMealText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      Tap to add food
                    </Text>
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

            <View style={styles.bottomSpacer} />
          </View>
        )}
        keyExtractor={(item) => item.key}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.scrollContent}
      />
    </SafeAreaView>
  );
}

function MacroSummaryRowCompact({ label, eaten, goal, color, isDark }: any) {
  const percentage = Math.min((eaten / goal) * 100, 100);
  
  return (
    <View style={styles.macroSummaryRowCompact}>
      <Text style={[styles.macroSummaryLabelCompact, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
        {label}
      </Text>
      <View style={styles.macroSummaryBarContainer}>
        <View style={[styles.macroSummaryBarBackground, { backgroundColor: isDark ? colors.borderDark : colors.border }]}>
          <View
            style={[
              styles.macroSummaryBarFill,
              {
                width: `${percentage}%`,
                backgroundColor: color,
              },
            ]}
          />
        </View>
        <Text style={[styles.macroSummaryProgressCompact, { color: isDark ? colors.textDark : colors.text }]}>
          {eaten} / {goal}g
        </Text>
      </View>
    </View>
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
  },
  loadingText: {
    ...typography.body,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 120,
  },
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
  dateButton: {
    padding: spacing.sm,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCenter: {
    alignItems: 'center',
    flex: 1,
  },
  dateLabel: {
    ...typography.caption,
    marginBottom: 2,
  },
  dateText: {
    ...typography.h3,
  },
  todayButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  todayButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  caloriesCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  cardTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
  },
  caloriesContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  macroSummaryCompact: {
    flex: 1,
    gap: spacing.sm,
  },
  macroSummaryRowCompact: {
    gap: 4,
  },
  macroSummaryLabelCompact: {
    fontSize: 12,
    fontWeight: '500',
  },
  macroSummaryBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  macroSummaryBarBackground: {
    flex: 1,
    height: 6,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  macroSummaryBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  macroSummaryProgressCompact: {
    fontSize: 11,
    fontWeight: '500',
    minWidth: 70,
    textAlign: 'right',
  },
  mealCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  mealTitle: {
    ...typography.h3,
  },
  mealCalories: {
    ...typography.caption,
    marginTop: 2,
  },
  addMealButton: {
    padding: spacing.xs,
  },
  emptyMeal: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    borderStyle: 'dashed',
  },
  emptyMealText: {
    ...typography.body,
  },
  itemSeparator: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    marginVertical: spacing.xs,
  },
  foodItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  foodInfo: {
    flex: 1,
  },
  foodName: {
    ...typography.bodyBold,
    marginBottom: 2,
  },
  foodBrand: {
    ...typography.caption,
    marginBottom: 2,
  },
  foodDetails: {
    ...typography.caption,
  },
  foodCalories: {
    alignItems: 'flex-end',
  },
  foodCaloriesValue: {
    ...typography.bodyBold,
    fontSize: 18,
  },
  foodCaloriesLabel: {
    ...typography.caption,
  },
  bottomSpacer: {
    height: 40,
  },
});
