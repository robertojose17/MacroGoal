
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';
import { toLocalDateString } from '@/utils/dateUtils';
import { formatFoodRowServing } from '@/utils/servingDisplay';

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface FoodEntry {
  id: string;
  meal_id: string;
  meal_type: MealType;
  food_id: string;
  food_item_id: string | null;
  food_name: string | null;
  food_brand: string | null;
  quantity: number;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  serving_description: string | null;
  grams: number | null;
  logged_at: string | null;
  created_at: string | null;
  foods: {
    id: string;
    name: string;
    brand: string | null;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    fiber: number;
  } | null;
  food_items: {
    name: string;
    brand: string | null;
  } | null;
}

interface HourGroup {
  hour: number;
  label: string;
  entries: FoodEntry[];
}

interface DateWithData {
  date: string;
  displayDate: string;
  totalCalories: number;
  itemCount: number;
}

function getEntryTimestamp(entry: FoodEntry): string | null {
  return entry.logged_at ?? entry.created_at ?? null;
}

function formatHourLabel(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${period}`;
}

function groupEntriesByHour(entries: FoodEntry[]): HourGroup[] {
  const hourMap = new Map<number, FoodEntry[]>();

  entries.forEach(entry => {
    const ts = getEntryTimestamp(entry);
    let hour = 0;
    if (ts) {
      const d = new Date(ts);
      hour = d.getHours();
    }
    const existing = hourMap.get(hour) ?? [];
    existing.push(entry);
    hourMap.set(hour, existing);
  });

  return Array.from(hourMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([hour, groupEntries]) => ({
      hour,
      label: formatHourLabel(hour),
      entries: groupEntries.slice().sort((a, b) => {
        const ta = getEntryTimestamp(a);
        const tb = getEntryTimestamp(b);
        if (!ta && !tb) return 0;
        if (!ta) return 1;
        if (!tb) return -1;
        return ta.localeCompare(tb);
      }),
    }));
}

export default function CopyFromPreviousScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const targetDate = (params.date as string) || toLocalDateString();
  const targetMealType = params.meal as MealType;

  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [datesWithData, setDatesWithData] = useState<DateWithData[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hourGroups, setHourGroups] = useState<HourGroup[]>([]);
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
      const thirtyDaysAgoString = toLocalDateString(thirtyDaysAgo);

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
          if (date === toLocalDateString(yesterday)) {
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
            food_item_id,
            food_name,
            food_brand,
            quantity,
            calories,
            protein,
            carbs,
            fats,
            fiber,
            serving_description,
            grams,
            logged_at,
            created_at,
            foods (
              id,
              name,
              brand,
              calories,
              protein,
              carbs,
              fats,
              fiber
            ),
            food_items!meal_items_food_item_id_fkey (
              name,
              brand
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

      // Collect all entries across all meals, preserving meal_type on each entry
      const allEntries: FoodEntry[] = [];

      if (mealsData) {
        mealsData.forEach((meal: any) => {
          if (meal.meal_items) {
            meal.meal_items.forEach((item: any) => {
              allEntries.push({ ...item, meal_type: meal.meal_type as MealType });
            });
          }
        });
      }

      const groups = groupEntriesByHour(allEntries);
      setHourGroups(groups);
      setSelectedEntries(new Set());
      console.log('[CopyFromPrevious] Loaded hour groups:', groups.map(g => `${g.label}: ${g.entries.length}`));
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

  const handleHourGroupToggle = (hour: number) => {
    const group = hourGroups.find(g => g.hour === hour);
    if (!group) return;

    console.log('[CopyFromPrevious] Hour group toggled:', group.label);
    const newSelectedEntries = new Set(selectedEntries);
    const allSelected = group.entries.every(entry => selectedEntries.has(entry.id));

    if (allSelected) {
      group.entries.forEach(entry => newSelectedEntries.delete(entry.id));
    } else {
      group.entries.forEach(entry => newSelectedEntries.add(entry.id));
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

      // Collect all selected entries from hour groups (each entry carries its meal_type)
      const entriesByMealType: Record<MealType, FoodEntry[]> = {
        breakfast: [],
        lunch: [],
        dinner: [],
        snack: [],
      };

      hourGroups.forEach(group => {
        group.entries.forEach(entry => {
          if (selectedEntries.has(entry.id)) {
            entriesByMealType[entry.meal_type].push(entry);
          }
        });
      });

      // For each meal type, log each entry via RPC
      for (const mealType of Object.keys(entriesByMealType) as MealType[]) {
        const entries = entriesByMealType[mealType];
        if (entries.length === 0) continue;

        console.log('[CopyFromPrevious] Processing', entries.length, 'entries for', mealType);

        for (const entry of entries) {
          console.log('[CopyFromPrevious] Calling log_food RPC for entry:', entry.foods?.name, 'mealType:', mealType);
          const { data: rpcData, error: rpcError } = await supabase.rpc('log_food', {
            p_user_id: user.id,
            p_date: targetDate,
            p_meal_type: mealType,
            p_food_id: entry.food_id || null,
            p_food_item_id: entry.food_item_id ?? null,
            p_quantity: Number(entry.quantity) || 1,
            p_calories: Number(entry.calories) || 0,
            p_protein: Number(entry.protein) || 0,
            p_carbs: Number(entry.carbs) || 0,
            p_fats: Number(entry.fats) || 0,
            p_fiber: Number(entry.fiber) || 0,
            p_serving_description: entry.serving_description ?? null,
            p_grams: entry.grams ?? null,
            p_logged_at: new Date().toISOString(),
          });

          if (rpcError) {
            console.error('[CopyFromPrevious] log_food RPC error for entry:', entry.foods?.name, rpcError);
            throw rpcError;
          }

          console.log('[CopyFromPrevious] log_food RPC success for', entry.foods?.name, 'meal_id:', rpcData?.meal_id, 'meal_item_id:', rpcData?.meal_item_id);
        }

        console.log('[CopyFromPrevious] Logged', entries.length, 'items for', mealType);
      }

      console.log('[CopyFromPrevious] Copy completed successfully!');
      Alert.alert(
        'Success',
        `Copied ${selectedEntries.size} food ${selectedEntries.size === 1 ? 'item' : 'items'} to ${targetDate === toLocalDateString() ? 'today' : targetDate}`,
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

  const isHourGroupFullySelected = (hour: number): boolean => {
    const group = hourGroups.find(g => g.hour === hour);
    if (!group || group.entries.length === 0) return false;
    return group.entries.every(entry => selectedEntries.has(entry.id));
  };

  const isHourGroupPartiallySelected = (hour: number): boolean => {
    const group = hourGroups.find(g => g.hour === hour);
    if (!group || group.entries.length === 0) return false;
    const selectedCount = group.entries.filter(entry => selectedEntries.has(entry.id)).length;
    return selectedCount > 0 && selectedCount < group.entries.length;
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

            {hourGroups.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, { color: isDark ? colors.textDark : colors.text }]}>
                  No foods logged on this date
                </Text>
              </View>
            ) : (
              hourGroups.map((group) => {
                const fullySelected = isHourGroupFullySelected(group.hour);
                const partiallySelected = isHourGroupPartiallySelected(group.hour);

                return (
                  <View
                    key={group.hour}
                    style={[
                      styles.mealCard,
                      { backgroundColor: isDark ? colors.cardDark : colors.card }
                    ]}
                  >
                    {/* Hour Header with Checkbox */}
                    <TouchableOpacity
                      style={styles.mealHeader}
                      onPress={() => handleHourGroupToggle(group.hour)}
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
                            {group.label}
                          </Text>
                          <Text style={[styles.mealSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                            {group.entries.length}
                            <Text>
                              {group.entries.length === 1 ? ' item' : ' items'}
                            </Text>
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.selectAllText, { color: colors.primary }]}>
                        {fullySelected ? 'Deselect All' : 'Select All'}
                      </Text>
                    </TouchableOpacity>

                    {/* Food Items */}
                    <View style={styles.foodList}>
                      {group.entries.map((entry, entryIndex) => {
                        const isSelected = selectedEntries.has(entry.id);
                        const servingText = formatFoodRowServing(entry.serving_description, entry.quantity ?? 1, entry.grams ?? undefined);
                        const entryName = entry.food_items?.name ?? entry.foods?.name ?? entry.food_name ?? 'Unknown';
                        const entryBrand = entry.food_items?.brand ?? entry.foods?.brand ?? entry.food_brand ?? null;
                        const entryCalories = Math.round(entry.calories);
                        const entryProtein = Math.round(entry.protein || 0);
                        const entryCarbs = Math.round(entry.carbs || 0);
                        const entryFats = Math.round(entry.fats || 0);

                        return (
                          <TouchableOpacity
                            key={entry.id}
                            style={[
                              styles.foodItem,
                              entryIndex < group.entries.length - 1 && styles.foodItemBorder
                            ]}
                            onPress={() => {
                              console.log('[CopyFromPrevious] Entry toggled:', entryName, 'selected:', !isSelected);
                              handleEntryToggle(entry.id);
                            }}
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
                              <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text }]} numberOfLines={1}>
                                {entryName}
                              </Text>
                              {entryBrand ? (
                                <Text style={[styles.foodBrand, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]} numberOfLines={1}>
                                  {entryBrand}
                                </Text>
                              ) : null}
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                                <Text style={{ fontSize: 12, color: isDark ? colors.textSecondaryDark : colors.textSecondary }}>
                                  {servingText}
                                </Text>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#E74C3C' }}>
                                  P
                                </Text>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#E74C3C' }}>
                                  {entryProtein}g
                                </Text>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#3498DB' }}>
                                  C
                                </Text>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#3498DB' }}>
                                  {entryCarbs}g
                                </Text>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#F39C12' }}>
                                  F
                                </Text>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#F39C12' }}>
                                  {entryFats}g
                                </Text>
                              </View>
                              <Text style={{ fontSize: 12, color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: 1 }}>
                                {entryCalories}
                                <Text>
                                  {' kcal'}
                                </Text>
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
                      to {targetDate === toLocalDateString() ? 'Today' : targetDate}
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
