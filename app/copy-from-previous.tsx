
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface FoodEntry {
  id: string;
  meal_id: string;
  food_id: string;
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
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    fiber: number;
  };
}

interface MealData {
  type: MealType;
  label: string;
  entries: FoodEntry[];
  selected: boolean;
}

interface DateWithData {
  date: string;
  displayDate: string;
  totalCalories: number;
  itemCount: number;
}

export default function CopyFromPreviousScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const targetDate = (params.date as string) || new Date().toISOString().split('T')[0];
  const targetMealType = params.meal as MealType;

  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [datesWithData, setDatesWithData] = useState<DateWithData[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [meals, setMeals] = useState<MealData[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());

  const loadDatesWithData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in');
        router.back();
        return;
      }

      // Get dates with meal data from the last 30 days (excluding target date)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoString = thirtyDaysAgo.toISOString().split('T')[0];

      const { data: mealsData, error } = await supabase
        .from('meals')
        .select(`
          id,
          date,
          meal_items (
            id,
            calories
          )
        `)
        .eq('user_id', user.id)
        .gte('date', thirtyDaysAgoString)
        .lt('date', targetDate)
        .order('date', { ascending: false });

      if (error) {
        console.error('[CopyFromPrevious] Error loading dates:', error);
        Alert.alert('Error', 'Failed to load previous dates');
        return;
      }

      // Group by date and calculate totals
      const dateMap = new Map<string, { totalCalories: number; itemCount: number }>();
      
      if (mealsData) {
        mealsData.forEach((meal: any) => {
          const existing = dateMap.get(meal.date) || { totalCalories: 0, itemCount: 0 };
          const mealCalories = meal.meal_items?.reduce((sum: number, item: any) => sum + (item.calories || 0), 0) || 0;
          const mealItemCount = meal.meal_items?.length || 0;
          
          dateMap.set(meal.date, {
            totalCalories: existing.totalCalories + mealCalories,
            itemCount: existing.itemCount + mealItemCount,
          });
        });
      }

      // Convert to array and format
      const dates: DateWithData[] = Array.from(dateMap.entries())
        .map(([date, data]) => {
          const dateObj = new Date(date + 'T00:00:00');
          const today = new Date();
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);

          let displayDate = '';
          if (date === yesterday.toISOString().split('T')[0]) {
            displayDate = 'Yesterday';
          } else if (dateObj.toDateString() === today.toDateString()) {
            displayDate = 'Today';
          } else {
            displayDate = dateObj.toLocaleDateString('en-US', { 
              weekday: 'short', 
              month: 'short', 
              day: 'numeric' 
            });
          }

          return {
            date,
            displayDate,
            totalCalories: data.totalCalories,
            itemCount: data.itemCount,
          };
        })
        .filter(d => d.itemCount > 0)
        .sort((a, b) => b.date.localeCompare(a.date));

      setDatesWithData(dates);
      console.log('[CopyFromPrevious] Loaded', dates.length, 'dates with data');
    } catch (error) {
      console.error('[CopyFromPrevious] Error in loadDatesWithData:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [router, targetDate]);

  const loadMealsForDate = useCallback(async (date: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log('[CopyFromPrevious] Loading meals for date:', date);

      const { data: mealsData, error } = await supabase
        .from('meals')
        .select(`
          id,
          meal_type,
          meal_items (
            id,
            meal_id,
            food_id,
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
              calories,
              protein,
              carbs,
              fats,
              fiber
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('date', date);

      if (error) {
        console.error('[CopyFromPrevious] Error loading meals:', error);
        Alert.alert('Error', 'Failed to load meals for this date');
        return;
      }

      // Organize meals by type
      const mealsByType: Record<MealType, FoodEntry[]> = {
        breakfast: [],
        lunch: [],
        dinner: [],
        snack: [],
      };

      if (mealsData) {
        mealsData.forEach((meal: any) => {
          if (meal.meal_items) {
            meal.meal_items.forEach((item: any) => {
              mealsByType[meal.meal_type as MealType].push(item);
            });
          }
        });
      }

      const mealsArray: MealData[] = [
        { type: 'breakfast', label: 'Breakfast', entries: mealsByType.breakfast, selected: false },
        { type: 'lunch', label: 'Lunch', entries: mealsByType.lunch, selected: false },
        { type: 'dinner', label: 'Dinner', entries: mealsByType.dinner, selected: false },
        { type: 'snack', label: 'Snacks', entries: mealsByType.snack, selected: false },
      ];

      setMeals(mealsArray);
      setSelectedEntries(new Set());
      console.log('[CopyFromPrevious] Loaded meals:', mealsArray.map(m => `${m.label}: ${m.entries.length}`));
    } catch (error) {
      console.error('[CopyFromPrevious] Error in loadMealsForDate:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  }, []);

  useEffect(() => {
    loadDatesWithData();
  }, [loadDatesWithData]);

  useEffect(() => {
    if (selectedDate) {
      loadMealsForDate(selectedDate);
    }
  }, [selectedDate, loadMealsForDate]);

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
  };

  const handleMealToggle = (mealType: MealType) => {
    const meal = meals.find(m => m.type === mealType);
    if (!meal) return;

    const newSelectedEntries = new Set(selectedEntries);
    const allSelected = meal.entries.every(entry => selectedEntries.has(entry.id));

    if (allSelected) {
      // Deselect all entries in this meal
      meal.entries.forEach(entry => newSelectedEntries.delete(entry.id));
    } else {
      // Select all entries in this meal
      meal.entries.forEach(entry => newSelectedEntries.add(entry.id));
    }

    setSelectedEntries(newSelectedEntries);
  };

  const handleEntryToggle = (entryId: string) => {
    const newSelectedEntries = new Set(selectedEntries);
    if (newSelectedEntries.has(entryId)) {
      newSelectedEntries.delete(entryId);
    } else {
      newSelectedEntries.add(entryId);
    }
    setSelectedEntries(newSelectedEntries);
  };

  const handleCopy = async () => {
    if (selectedEntries.size === 0) {
      Alert.alert('No Selection', 'Please select at least one food item to copy');
      return;
    }

    try {
      setCopying(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in');
        return;
      }

      console.log('[CopyFromPrevious] Copying', selectedEntries.size, 'entries to', targetDate);

      // Get all selected entries
      const entriesToCopy: FoodEntry[] = [];
      meals.forEach(meal => {
        meal.entries.forEach(entry => {
          if (selectedEntries.has(entry.id)) {
            entriesToCopy.push(entry);
          }
        });
      });

      // Group entries by meal type
      const entriesByMealType: Record<MealType, FoodEntry[]> = {
        breakfast: [],
        lunch: [],
        dinner: [],
        snack: [],
      };

      meals.forEach(meal => {
        meal.entries.forEach(entry => {
          if (selectedEntries.has(entry.id)) {
            entriesByMealType[meal.type].push(entry);
          }
        });
      });

      // For each meal type, find or create the meal, then insert items
      for (const mealType of Object.keys(entriesByMealType) as MealType[]) {
        const entries = entriesByMealType[mealType];
        if (entries.length === 0) continue;

        console.log('[CopyFromPrevious] Processing', entries.length, 'entries for', mealType);

        // Find or create meal for target date and meal type
        const { data: existingMeal } = await supabase
          .from('meals')
          .select('id')
          .eq('user_id', user.id)
          .eq('date', targetDate)
          .eq('meal_type', mealType)
          .maybeSingle();

        let mealId = existingMeal?.id;

        if (!mealId) {
          console.log('[CopyFromPrevious] Creating new meal for', mealType, 'on', targetDate);
          const { data: newMeal, error: mealError } = await supabase
            .from('meals')
            .insert({
              user_id: user.id,
              date: targetDate,
              meal_type: mealType,
            })
            .select()
            .single();

          if (mealError) {
            console.error('[CopyFromPrevious] Error creating meal:', mealError);
            throw mealError;
          }

          mealId = newMeal.id;
        }

        // Insert all meal items for this meal type
        const itemsToInsert = entries.map(entry => ({
          meal_id: mealId,
          food_id: entry.food_id,
          quantity: entry.quantity,
          calories: entry.calories,
          protein: entry.protein,
          carbs: entry.carbs,
          fats: entry.fats,
          fiber: entry.fiber,
          serving_description: entry.serving_description,
          grams: entry.grams,
        }));

        const { error: insertError } = await supabase
          .from('meal_items')
          .insert(itemsToInsert);

        if (insertError) {
          console.error('[CopyFromPrevious] Error inserting meal items:', insertError);
          throw insertError;
        }

        console.log('[CopyFromPrevious] Inserted', itemsToInsert.length, 'items for', mealType);
      }

      console.log('[CopyFromPrevious] Copy completed successfully!');
      Alert.alert(
        'Success',
        `Copied ${selectedEntries.size} food ${selectedEntries.size === 1 ? 'item' : 'items'} to ${targetDate === new Date().toISOString().split('T')[0] ? 'today' : targetDate}`,
        [
          {
            text: 'OK',
            onPress: () => {
              // Navigate back to diary
              router.dismissTo('/(tabs)/(home)/');
            },
          },
        ]
      );
    } catch (error) {
      console.error('[CopyFromPrevious] Error copying entries:', error);
      Alert.alert('Error', 'Failed to copy food items. Please try again.');
    } finally {
      setCopying(false);
    }
  };

  const getSelectedCount = () => selectedEntries.size;

  const isMealFullySelected = (mealType: MealType): boolean => {
    const meal = meals.find(m => m.type === mealType);
    if (!meal || meal.entries.length === 0) return false;
    return meal.entries.every(entry => selectedEntries.has(entry.id));
  };

  const isMealPartiallySelected = (mealType: MealType): boolean => {
    const meal = meals.find(m => m.type === mealType);
    if (!meal || meal.entries.length === 0) return false;
    const selectedCount = meal.entries.filter(entry => selectedEntries.has(entry.id)).length;
    return selectedCount > 0 && selectedCount < meal.entries.length;
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            Loading previous dates...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={isDark ? colors.textDark : colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? colors.textDark : colors.text }]}>
          Copy from Previous
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {!selectedDate ? (
        // Date Selection View
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Select a Date
          </Text>
          <Text style={[styles.sectionSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Choose a previous date to copy meals from
          </Text>

          {datesWithData.length === 0 ? (
            <View style={styles.emptyState}>
              <IconSymbol
                ios_icon_name="calendar"
                android_material_icon_name="event"
                size={64}
                color={isDark ? colors.textSecondaryDark : colors.textSecondary}
              />
              <Text style={[styles.emptyText, { color: isDark ? colors.textDark : colors.text }]}>
                No previous dates with food logs
              </Text>
              <Text style={[styles.emptySubtext, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Start logging your meals to use this feature
              </Text>
            </View>
          ) : (
            datesWithData.map((dateData) => (
              <TouchableOpacity
                key={dateData.date}
                style={[
                  styles.dateCard,
                  { backgroundColor: isDark ? colors.cardDark : colors.card }
                ]}
                onPress={() => handleDateSelect(dateData.date)}
                activeOpacity={0.7}
              >
                <View style={styles.dateCardLeft}>
                  <Text style={[styles.dateCardTitle, { color: isDark ? colors.textDark : colors.text }]}>
                    {dateData.displayDate}
                  </Text>
                  <Text style={[styles.dateCardSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    {dateData.itemCount} {dateData.itemCount === 1 ? 'item' : 'items'} • {Math.round(dateData.totalCalories)} kcal
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron_right"
                  size={20}
                  color={isDark ? colors.textSecondaryDark : colors.textSecondary}
                />
              </TouchableOpacity>
            ))
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      ) : (
        // Meal Selection View
        <React.Fragment>
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Selected Date Header */}
            <TouchableOpacity
              style={[
                styles.selectedDateCard,
                { backgroundColor: isDark ? colors.cardDark : colors.card }
              ]}
              onPress={() => setSelectedDate(null)}
              activeOpacity={0.7}
            >
              <View style={styles.selectedDateLeft}>
                <Text style={[styles.selectedDateLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Copying from
                </Text>
                <Text style={[styles.selectedDateTitle, { color: isDark ? colors.textDark : colors.text }]}>
                  {datesWithData.find(d => d.date === selectedDate)?.displayDate}
                </Text>
              </View>
              <View style={styles.selectedDateRight}>
                <Text style={[styles.changeText, { color: colors.primary }]}>
                  Change
                </Text>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron_right"
                  size={16}
                  color={colors.primary}
                />
              </View>
            </TouchableOpacity>

            <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
              Select Foods to Copy
            </Text>
            <Text style={[styles.sectionSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Choose entire meals or individual items
            </Text>

            {meals.every(m => m.entries.length === 0) ? (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: isDark ? colors.textDark : colors.text }]}>
                  No foods logged on this date
                </Text>
              </View>
            ) : (
              meals.map((meal) => {
                if (meal.entries.length === 0) return null;

                const fullySelected = isMealFullySelected(meal.type);
                const partiallySelected = isMealPartiallySelected(meal.type);

                return (
                  <View
                    key={meal.type}
                    style={[
                      styles.mealCard,
                      { backgroundColor: isDark ? colors.cardDark : colors.card }
                    ]}
                  >
                    {/* Meal Header with Checkbox */}
                    <TouchableOpacity
                      style={styles.mealHeader}
                      onPress={() => handleMealToggle(meal.type)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.mealHeaderLeft}>
                        <View style={[
                          styles.checkbox,
                          { borderColor: isDark ? colors.borderDark : colors.border },
                          (fullySelected || partiallySelected) && { backgroundColor: colors.primary, borderColor: colors.primary }
                        ]}>
                          {fullySelected && (
                            <IconSymbol
                              ios_icon_name="checkmark"
                              android_material_icon_name="check"
                              size={16}
                              color="#FFFFFF"
                            />
                          )}
                          {partiallySelected && (
                            <View style={styles.partialCheckbox} />
                          )}
                        </View>
                        <View>
                          <Text style={[styles.mealTitle, { color: isDark ? colors.textDark : colors.text }]}>
                            {meal.label}
                          </Text>
                          <Text style={[styles.mealSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                            {meal.entries.length} {meal.entries.length === 1 ? 'item' : 'items'}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.selectAllText, { color: colors.primary }]}>
                        {fullySelected ? 'Deselect All' : 'Select All'}
                      </Text>
                    </TouchableOpacity>

                    {/* Food Items */}
                    <View style={styles.foodList}>
                      {meal.entries.map((entry, entryIndex) => {
                        const isSelected = selectedEntries.has(entry.id);
                        const servingText = entry.serving_description || `${Math.round(entry.grams || 0)} g`;

                        return (
                          <TouchableOpacity
                            key={entry.id}
                            style={[
                              styles.foodItem,
                              entryIndex < meal.entries.length - 1 && styles.foodItemBorder
                            ]}
                            onPress={() => handleEntryToggle(entry.id)}
                            activeOpacity={0.7}
                          >
                            <View style={[
                              styles.checkbox,
                              styles.checkboxSmall,
                              { borderColor: isDark ? colors.borderDark : colors.border },
                              isSelected && { backgroundColor: colors.primary, borderColor: colors.primary }
                            ]}>
                              {isSelected && (
                                <IconSymbol
                                  ios_icon_name="checkmark"
                                  android_material_icon_name="check"
                                  size={14}
                                  color="#FFFFFF"
                                />
                              )}
                            </View>
                            <View style={styles.foodInfo}>
                              <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text }]}>
                                {entry.foods.name}
                              </Text>
                              {entry.foods.brand && (
                                <Text style={[styles.foodBrand, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                                  {entry.foods.brand}
                                </Text>
                              )}
                              <Text style={[styles.foodDetails, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                                {servingText} • {Math.round(entry.calories)} kcal
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })
            )}

            <View style={styles.bottomSpacer} />
          </ScrollView>

          {/* Copy Button */}
          {getSelectedCount() > 0 && (
            <View style={[styles.copyButtonContainer, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
              <TouchableOpacity
                style={[
                  styles.copyButton,
                  { backgroundColor: colors.primary },
                  copying && { opacity: 0.7 }
                ]}
                onPress={handleCopy}
                disabled={copying}
                activeOpacity={0.7}
              >
                {copying ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <React.Fragment>
                    <Text style={styles.copyButtonText}>
                      Copy {getSelectedCount()} {getSelectedCount() === 1 ? 'Item' : 'Items'}
                    </Text>
                    <Text style={styles.copyButtonSubtext}>
                      to {targetDate === new Date().toISOString().split('T')[0] ? 'Today' : targetDate}
                    </Text>
                  </React.Fragment>
                )}
              </TouchableOpacity>
            </View>
          )}
        </React.Fragment>
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
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.md,
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  sectionTitle: {
    ...typography.h2,
    fontSize: 24,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    ...typography.body,
    fontSize: 15,
    marginBottom: spacing.lg,
  },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  dateCardLeft: {
    flex: 1,
  },
  dateCardTitle: {
    ...typography.bodyBold,
    fontSize: 18,
    marginBottom: 4,
  },
  dateCardSubtitle: {
    ...typography.caption,
    fontSize: 14,
  },
  selectedDateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)',
    elevation: 1,
  },
  selectedDateLeft: {
    flex: 1,
  },
  selectedDateLabel: {
    ...typography.caption,
    fontSize: 12,
    marginBottom: 2,
  },
  selectedDateTitle: {
    ...typography.bodyBold,
    fontSize: 16,
  },
  selectedDateRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  changeText: {
    ...typography.bodyBold,
    fontSize: 14,
  },
  mealCard: {
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.08)',
    elevation: 2,
    overflow: 'hidden',
  },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  mealHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  mealTitle: {
    ...typography.bodyBold,
    fontSize: 17,
    marginBottom: 2,
  },
  mealSubtitle: {
    ...typography.caption,
    fontSize: 13,
  },
  selectAllText: {
    ...typography.bodyBold,
    fontSize: 14,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSmall: {
    width: 20,
    height: 20,
  },
  partialCheckbox: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  foodList: {
    padding: spacing.md,
  },
  foodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  foodItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  foodInfo: {
    flex: 1,
  },
  foodName: {
    ...typography.bodyBold,
    fontSize: 15,
    marginBottom: 2,
  },
  foodBrand: {
    ...typography.caption,
    fontSize: 12,
    marginBottom: 2,
  },
  foodDetails: {
    ...typography.caption,
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.bodyBold,
    fontSize: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    ...typography.body,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  copyButtonContainer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  copyButton: {
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md + spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  copyButtonSubtext: {
    color: '#FFFFFF',
    fontSize: 13,
    opacity: 0.9,
  },
  bottomSpacer: {
    height: 100,
  },
});
