
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase, TABLE_SAVED_MEALS, TABLE_SAVED_MEAL_ITEMS } from '@/app/integrations/supabase/client';
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow';

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
  const date = (params.date as string) || new Date().toISOString().split('T')[0];
  const returnTo = (params.returnTo as string) || undefined;

  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadSavedMeals = useCallback(async () => {
    try {
      setLoading(true);
      console.log('[MyMeals] ========== FETCH_SAVED_MEALS START ==========');
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        console.error('[MyMeals] ❌ Error getting user:', userError);
        setLoading(false);
        return;
      }
      
      if (!user) {
        console.log('[MyMeals] ❌ No user found - userId is null/undefined');
        console.log('[MyMeals] FETCH_SAVED_MEALS userId=null returnedCount=0');
        setLoading(false);
        return;
      }

      console.log('[MyMeals] ✅ User found:', user.id);
      console.log('[MyMeals] Fetching saved meals for user:', user.id);

      // Fetch saved meals with aggregated data
      const { data: meals, error } = await supabase
        .from(TABLE_SAVED_MEALS)
        .select(`
          id,
          name,
          created_at,
          updated_at,
          saved_meal_items (
            id,
            serving_amount,
            serving_unit,
            servings_count,
            foods (
              calories,
              protein,
              carbs,
              fats
            )
          )
        `)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('[MyMeals] ❌ ERROR FETCHING SAVED MEALS:', error);
        console.error('[MyMeals] Error code:', error.code);
        console.error('[MyMeals] Error message:', error.message);
        console.error('[MyMeals] Error details:', error.details);
        console.error('[MyMeals] Error hint:', error.hint);
        
        // Log the final result
        console.log('[MyMeals] FETCH_SAVED_MEALS userId=' + user.id + ' returnedCount=0 (ERROR)');
        
        Alert.alert('Error', 'Failed to load saved meals: ' + error.message);
        setLoading(false);
        return;
      }

      const mealsCount = meals?.length || 0;
      console.log('[MyMeals] ✅ Query successful');
      console.log('[MyMeals] FETCH_SAVED_MEALS userId=' + user.id + ' returnedCount=' + mealsCount);
      
      if (mealsCount === 0) {
        console.log('[MyMeals] ⚠️ No saved meals found for this user');
        console.log('[MyMeals] This could mean:');
        console.log('[MyMeals]   1. User has not created any meals yet');
        console.log('[MyMeals]   2. Meals were created but not saved properly');
        console.log('[MyMeals]   3. RLS policies are filtering out the meals');
      } else {
        console.log('[MyMeals] ✅ Found', mealsCount, 'saved meals');
        meals?.forEach((meal: any, index: number) => {
          console.log(`[MyMeals] Meal ${index + 1}:`, {
            id: meal.id,
            name: meal.name,
            items_count: meal.saved_meal_items?.length || 0,
          });
        });
      }

      // Calculate totals for each meal
      const mealsWithTotals: SavedMeal[] = (meals || []).map((meal: any) => {
        const items = meal.saved_meal_items || [];
        let totalCalories = 0;
        let totalProtein = 0;
        let totalCarbs = 0;
        let totalFats = 0;

        items.forEach((item: any) => {
          if (item.foods) {
            const multiplier = (item.serving_amount / 100) * item.servings_count;
            totalCalories += item.foods.calories * multiplier;
            totalProtein += item.foods.protein * multiplier;
            totalCarbs += item.foods.carbs * multiplier;
            totalFats += item.foods.fats * multiplier;
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
      console.log('[MyMeals] ========== FETCH_SAVED_MEALS COMPLETE ==========');
      setLoading(false);
    } catch (error) {
      console.error('[MyMeals] ❌ UNEXPECTED ERROR in loadSavedMeals:', error);
      if (error instanceof Error) {
        console.error('[MyMeals] Error name:', error.name);
        console.error('[MyMeals] Error message:', error.message);
        console.error('[MyMeals] Error stack:', error.stack);
      }
      Alert.alert('Error', 'An unexpected error occurred');
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      console.log('[MyMeals] ========== SCREEN FOCUSED ==========');
      console.log('[MyMeals] Triggering loadSavedMeals...');
      loadSavedMeals();
    }, [loadSavedMeals])
  );

  const handleCreateMeal = () => {
    console.log('[MyMeals] Navigating to create meal');
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
    console.log('[MyMeals] Selected meal:', meal.name);
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
    console.log('[MyMeals] ========== QUICK ADD SAVED MEAL ==========');
    console.log('[MyMeals] Meal:', meal.name);

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
          serving_amount,
          serving_unit,
          servings_count,
          food_id,
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
        `)
        .eq('saved_meal_id', meal.id);

      if (itemsError || !mealItems || mealItems.length === 0) {
        console.error('[MyMeals] Error loading meal items:', itemsError);
        Alert.alert('Error', 'Failed to load meal items');
        return;
      }

      console.log('[MyMeals] Loaded', mealItems.length, 'items from saved meal');

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
        console.log('[MyMeals] Creating new meal for', mealType, 'on', date);
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
          console.error('[MyMeals] Error creating meal:', mealError);
          Alert.alert('Error', 'Failed to create meal');
          return;
        }

        targetMealId = newMeal.id;
        console.log('[MyMeals] Created new meal:', targetMealId);
      } else {
        console.log('[MyMeals] Using existing meal:', targetMealId);
      }

      // Add each food item from the saved meal
      const itemsToInsert = mealItems.map((item: any) => {
        const food = item.foods;
        const multiplier = (item.serving_amount / 100) * item.servings_count;
        
        return {
          meal_id: targetMealId,
          food_id: item.food_id,
          quantity: multiplier,
          calories: food.calories * multiplier,
          protein: food.protein * multiplier,
          carbs: food.carbs * multiplier,
          fats: food.fats * multiplier,
          fiber: food.fiber * multiplier,
          serving_description: `${item.serving_amount} ${item.serving_unit}`,
          grams: item.serving_amount,
        };
      });

      console.log('[MyMeals] Inserting', itemsToInsert.length, 'meal items');

      const { error: insertError } = await supabase
        .from('meal_items')
        .insert(itemsToInsert);

      if (insertError) {
        console.error('[MyMeals] Error inserting meal items:', insertError);
        Alert.alert('Error', 'Failed to add meal items');
        return;
      }

      console.log('[MyMeals] ✅ Saved meal added successfully!');
      Alert.alert('Success', `Added "${meal.name}" to ${mealType}`);
      
      // Navigate back to home
      if (returnTo) {
        router.push(returnTo as any);
      } else {
        router.back();
      }
    } catch (error) {
      console.error('[MyMeals] Error quick adding saved meal:', error);
      Alert.alert('Error', 'An unexpected error occurred while adding meal');
    }
  }, [date, mealType, returnTo, router]);

  const handleDeleteMeal = async (mealId: string) => {
    console.log('[MyMeals] Deleting meal:', mealId);

    // Optimistic update
    const previousMeals = [...savedMeals];
    setSavedMeals(savedMeals.filter(m => m.id !== mealId));

    try {
      const { error } = await supabase
        .from(TABLE_SAVED_MEALS)
        .delete()
        .eq('id', mealId);

      if (error) {
        console.error('[MyMeals] Error deleting meal:', error);
        setSavedMeals(previousMeals);
        Alert.alert('Error', 'Failed to delete meal');
      } else {
        console.log('[MyMeals] Meal deleted successfully');
      }
    } catch (error) {
      console.error('[MyMeals] Error in handleDeleteMeal:', error);
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
