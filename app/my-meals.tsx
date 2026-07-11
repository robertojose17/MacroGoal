
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase, TABLE_SAVED_MEALS, TABLE_SAVED_MEAL_ITEMS } from '@/lib/supabase/client';
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow';
import { toLocalDateString } from '@/utils/dateUtils';
import { calcMacros } from '@/utils/macros';

interface SavedMeal {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  item_count?: number;
  total_calories?: number;
  total_protein?: number;
  total_carbs?: number;
  total_fats?: number;
}

export default function MyMealsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const mealType = (params.meal as string) || 'breakfast';
  const date = (params.date as string) || toLocalDateString();
  const returnTo = (params.returnTo as string) || undefined;

  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadSavedMeals = useCallback(async () => {
    try {
      setLoading(true);

      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        setLoading(false);
        return;
      }

      const { data: meals, error } = await supabase
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
            calories,
            protein,
            carbs,
            fat,
            fiber,
            foods (
              calories,
              protein,
              carbs,
              fats,
              fiber,
              serving_amount
            )
          )
        `)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        Alert.alert('Error', 'Failed to load saved meals: ' + error.message);
        setLoading(false);
        return;
      }

      // Calculate totals for each meal, using stored macros when available
      // and falling back to a calculation from the foods join when they are NULL.
      const mealsWithTotals: SavedMeal[] = (meals || []).map((meal: any) => {
        const items = meal.saved_meal_items || [];
        let totalCalories = 0;
        let totalProtein = 0;
        let totalCarbs = 0;
        let totalFats = 0;

        items.forEach((item: any) => {
          if (item.calories != null) {
            totalCalories += item.calories;
            totalProtein += item.protein ?? 0;
            totalCarbs += item.carbs ?? 0;
            totalFats += item.fat ?? 0;
          } else if (item.foods) {
            const fd = item.foods;
            const divisor = fd.serving_amount > 0 ? fd.serving_amount : 100;
            const grams = item.servings_count ?? 0;
            const ratio = grams / divisor;
            totalCalories += (fd.calories ?? 0) * ratio;
            totalProtein += (fd.protein ?? 0) * ratio;
            totalCarbs += (fd.carbs ?? 0) * ratio;
            totalFats += (fd.fats ?? 0) * ratio;
          }
        });

        return {
          id: meal.id,
          name: meal.name,
          created_at: meal.created_at,
          updated_at: meal.updated_at,
          item_count: items.length,
          total_calories: totalCalories,
          total_protein: totalProtein,
          total_carbs: totalCarbs,
          total_fats: totalFats,
        };
      });

      setSavedMeals(mealsWithTotals);
      setLoading(false);
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred');
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSavedMeals();
    }, [loadSavedMeals])
  );

  const handleCreateMeal = () => {
    console.log('[MyMeals] Create meal pressed');
    router.push({
      pathname: '/my-meals-create',
      params: {
        meal: mealType,
        date: date,
        returnTo: returnTo,
      },
    });
  };

  const handleSelectMeal = (meal: SavedMeal) => {
    console.log('[MyMeals] Meal selected:', meal.name);
    router.push({
      pathname: '/my-meals-details',
      params: {
        mealId: meal.id,
        meal: mealType,
        date: date,
        returnTo: returnTo,
      },
    });
  };

  /**
   * QUICK ADD: Add entire saved meal to meal log
   * Adds all foods from the saved meal with 1 serving each
   */
  const handleQuickAddMeal = useCallback(async (meal: SavedMeal) => {
    console.log('[MyMeals] Quick add meal pressed:', meal.name);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to add meal');
        return;
      }

      // Fetch the saved meal items
      const { data: mealItems, error: itemsError } = await supabase
        .from('saved_meal_items')
        .select(`
          id,
          food_item_id,
          food_id,
          food_name,
          food_brand,
          serving_amount,
          serving_unit,
          servings_count,
          food_items!saved_meal_items_food_item_id_fkey (
            id, name, brand, calories, protein, carbs, fat, fiber, serving_size, macros_per
          )
        `)
        .eq('saved_meal_id', meal.id);

      if (itemsError || !mealItems || mealItems.length === 0) {
        Alert.alert('Error', 'Failed to load meal items');
        return;
      }

      // Find or create meal for the date and meal type
      const { data: existingMeal } = await supabase
        .from('meals')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', date)
        .eq('meal_type', mealType)
        .maybeSingle();

      let targetMealId = existingMeal?.id;

      if (!targetMealId) {
        const { data: newMeal, error: mealError } = await supabase
          .from('meals')
          .insert({
            user_id: user.id,
            date: date,
            meal_type: mealType,
          })
          .select()
          .single();

        if (mealError) {
          Alert.alert('Error', 'Failed to create meal');
          return;
        }

        targetMealId = newMeal.id;
      }

      // Add each food item from the saved meal
      const itemsToInsert = mealItems.map((item: any) => {
        const fi = item.food_items;
        const foodName = fi?.name ?? item.food_name ?? 'Unknown Food';
        const foodBrand = fi?.brand ?? item.food_brand ?? null;
        const grams = item.serving_amount * item.servings_count;
        const macros = fi ? calcMacros(fi, grams) : { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

        return {
          meal_id: targetMealId,
          food_id: item.food_id ?? null,
          food_item_id: item.food_item_id ?? null,
          food_name: foodName,
          food_brand: foodBrand,
          quantity: 1,
          calories: macros.calories,
          protein: macros.protein,
          carbs: macros.carbs,
          fats: macros.fat,
          fiber: macros.fiber,
          serving_description: `${Math.round(item.serving_amount)} ${item.serving_unit}`,
          grams: Math.round(grams),
        };
      });

      console.log('[MyMeals] Inserting meal items count:', itemsToInsert.length);

      const { error: insertError } = await supabase
        .from('meal_items')
        .insert(itemsToInsert);

      if (insertError) {
        Alert.alert('Error', 'Failed to add meal items');
        return;
      }

      Alert.alert('Success', `Added "${meal.name}" to ${mealType}`);

      if (returnTo) {
        router.push(returnTo as any);
      } else {
        router.back();
      }
    } catch (error) {
      Alert.alert('Error', 'An unexpected error occurred while adding meal');
    }
  }, [date, mealType, returnTo, router]);

  const handleDeleteMeal = async (mealId: string) => {
    console.log('[MyMeals] Delete meal pressed:', mealId);

    const previousMeals = [...savedMeals];
    setSavedMeals(savedMeals.filter(m => m.id !== mealId));

    try {
      const { error } = await supabase
        .from(TABLE_SAVED_MEALS)
        .delete()
        .eq('id', mealId);

      if (error) {
        setSavedMeals(previousMeals);
        Alert.alert('Error', 'Failed to delete meal');
      }
    } catch (error) {
      setSavedMeals(previousMeals);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  const filteredMeals = savedMeals.filter(meal =>
    meal.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderMealItem = (meal: SavedMeal, index: number) => {
    return (
      <React.Fragment key={meal.id}>
        <SwipeToDeleteRow onDelete={() => handleDeleteMeal(meal.id)}>
          {(isSwiping: boolean) => (
            <TouchableOpacity
              style={[styles.mealCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
              onPress={() => {
                if (!isSwiping) {
                  handleSelectMeal(meal);
                }
              }}
              activeOpacity={0.7}
              disabled={isSwiping}
            >
              <View style={styles.mealInfo}>
                <Text style={[styles.mealName, { color: isDark ? colors.textDark : colors.text }]}>
                  {meal.name}
                </Text>
                <Text style={[styles.mealMeta, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  {meal.item_count || 0} {meal.item_count === 1 ? 'item' : 'items'} • {Math.round(meal.total_calories || 0)} cal
                </Text>
                <Text style={[styles.mealMacros, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  P: {Math.round(meal.total_protein || 0)}g • C: {Math.round(meal.total_carbs || 0)}g • F: {Math.round(meal.total_fats || 0)}g
                </Text>
              </View>
              
              {/* Quick-add button */}
              <TouchableOpacity
                style={styles.addButton}
                onPress={(e) => {
                  e.stopPropagation();
                  if (!isSwiping) {
                    handleQuickAddMeal(meal);
                  }
                }}
                activeOpacity={0.7}
                disabled={isSwiping}
              >
                <IconSymbol
                  ios_icon_name="plus"
                  android_material_icon_name="add"
                  size={20}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        </SwipeToDeleteRow>
      </React.Fragment>
    );
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={isDark ? colors.textDark : colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? colors.textDark : colors.text }]}>
          My Meals
        </Text>
        <TouchableOpacity onPress={handleCreateMeal} style={styles.addButton}>
          <IconSymbol
            ios_icon_name="plus"
            android_material_icon_name="add"
            size={24}
            color={isDark ? colors.textDark : colors.text}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: isDark ? colors.cardDark : colors.card,
              borderColor: isDark ? colors.borderDark : colors.border,
            }
          ]}
        >
          <IconSymbol
            ios_icon_name="magnifyingglass"
            android_material_icon_name="search"
            size={20}
            color={isDark ? colors.textSecondaryDark : colors.textSecondary}
          />
          <TextInput
            style={[
              styles.searchInput,
              { color: isDark ? colors.textDark : colors.text }
            ]}
            placeholder="Search saved meals..."
            placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              style={styles.clearButton}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="cancel"
                size={20}
                color={isDark ? colors.textSecondaryDark : colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Loading saved meals...
          </Text>
        </View>
      ) : filteredMeals.length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol
            ios_icon_name="fork.knife"
            android_material_icon_name="restaurant"
            size={64}
            color={isDark ? colors.textSecondaryDark : colors.textSecondary}
          />
          <Text style={[styles.emptyTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {searchQuery ? 'No meals found' : 'No saved meals yet'}
          </Text>
          <Text style={[styles.emptyMessage, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {searchQuery ? 'Try a different search term' : 'Create a meal to save your favorite food combinations'}
          </Text>
          {!searchQuery && (
            <TouchableOpacity
              style={[styles.createButton, { backgroundColor: colors.primary }]}
              onPress={handleCreateMeal}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="plus"
                android_material_icon_name="add"
                size={20}
                color="#FFFFFF"
              />
              <Text style={styles.createButtonText}>Create Meal</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredMeals.map((meal, index) => renderMealItem(meal, index))}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  addButton: {
    padding: spacing.xs,
  },
  searchContainer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    fontSize: 16,
    paddingVertical: 0,
  },
  clearButton: {
    padding: spacing.xs,
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
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    ...typography.h2,
    fontSize: 20,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyMessage: {
    ...typography.body,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  mealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
    elevation: 1,
    overflow: 'hidden',
    padding: spacing.md,
  },
  mealInfo: {
    flex: 1,
  },
  mealName: {
    ...typography.bodyBold,
    fontSize: 16,
    marginBottom: 2,
  },
  mealMeta: {
    ...typography.caption,
    fontSize: 13,
    marginBottom: 2,
  },
  mealMacros: {
    ...typography.caption,
    fontSize: 12,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
  },
});
