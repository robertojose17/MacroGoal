
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow';

interface MyFood {
  id: string;
  name: string;
  brand?: string;
  serving_amount: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  created_at: string;
}

interface QuickAddHomeProps {
  mealType: string;
  date: string;
  returnTo?: string;
  mode?: string;
  myMealId?: string;
  context?: string;
  onQuickAdd?: (message?: string) => void;
}

export default function QuickAddHome({ mealType, date, returnTo, mode, myMealId, context, onQuickAdd }: QuickAddHomeProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [myFoods, setMyFoods] = useState<MyFood[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadMyFoods = useCallback(async () => {
    console.log('[QuickAddHome] ========== LOADING SAVED FOODS ==========');
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[QuickAddHome] No user found');
        setLoading(false);
        return;
      }

      console.log('[QuickAddHome] Fetching user-created foods for user:', user.id);

      const { data: foods, error } = await supabase
        .from('foods')
        .select('*')
        .eq('user_created', true)
        .or(`created_by.eq.${user.id},created_by.is.null`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[QuickAddHome] Error loading foods:', error);
        Alert.alert('Error', 'Failed to load your foods');
        setLoading(false);
        return;
      }

      console.log('[QuickAddHome] ✅ Loaded', foods?.length || 0, 'custom foods');
      setMyFoods(foods || []);
      setLoading(false);
    } catch (error) {
      console.error('[QuickAddHome] Error in loadMyFoods:', error);
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      console.log('[QuickAddHome] Component focused, loading saved foods');
      loadMyFoods();
    }, [loadMyFoods])
  );

  const handleQuickAddManual = () => {
    console.log('[QuickAddHome] ========== OPENING MANUAL ENTRY FORM ==========');
    console.log('[QuickAddHome] Mode:', mode);
    console.log('[QuickAddHome] Context:', context);
    console.log('[QuickAddHome] Meal Type:', mealType);
    console.log('[QuickAddHome] Date:', date);
    console.log('[QuickAddHome] My Meal ID:', myMealId);
    console.log('[QuickAddHome] Return To:', returnTo);

    // Determine the correct mode based on context
    const navigationMode = context === 'my_meals_builder' ? 'mymeal' : 'diary';
    
    console.log('[QuickAddHome] Navigation mode:', navigationMode);

    router.push({
      pathname: '/add-food-simple',
      params: {
        mode: navigationMode,
        meal: mealType,
        date: date,
        returnTo: returnTo || '/(tabs)/(home)/',
        mealId: myMealId || '',
      },
    });
  };

  const handleCreateNewFood = () => {
    console.log('[QuickAddHome] Navigating to create new food');
    router.push({
      pathname: '/my-foods-create',
      params: {
        meal: mealType,
        date: date,
        context: context || 'quickadd',
        returnTo: returnTo,
      },
    });
  };

  const handleSelectFood = useCallback((food: MyFood) => {
    console.log('[QuickAddHome] Selected food:', food.name);
    
    // Convert to OpenFoodFacts format for food-details screen
    const offProduct = {
      code: '',
      product_name: food.name,
      brands: food.brand || '',
      serving_size: `${food.serving_amount} ${food.serving_unit}`,
      nutriments: {
        'energy-kcal_100g': food.calories,
        'proteins_100g': food.protein,
        'carbohydrates_100g': food.carbs,
        'fat_100g': food.fats,
        'fiber_100g': food.fiber,
        'sugars_100g': 0,
      },
    };

    router.push({
      pathname: '/food-details',
      params: {
        offData: JSON.stringify(offProduct),
        meal: mealType,
        date: date,
        context: context || 'quickadd',
        returnTo: returnTo || '/(tabs)/(home)/',
        mode: mode || 'diary',
        mealId: myMealId,
      },
    });
  }, [router, mealType, date, returnTo, mode, myMealId, context]);

  /**
   * QUICK ADD: Add saved food directly to meal log
   * Only available in meal_log context (NOT my_meals_builder)
   */
  const handleQuickAddFood = useCallback(async (food: MyFood) => {
    console.log('[QuickAddHome] ========== QUICK ADD SAVED FOOD ==========');
    console.log('[QuickAddHome] Food:', food.name);
    console.log('[QuickAddHome] Context:', context);

    // CRITICAL: Only allow quick add in meal_log context
    if (context === 'my_meals_builder') {
      console.log('[QuickAddHome] ❌ Cannot quick-add in my_meals_builder context');
      Alert.alert('Not Available', 'Please tap the food to view details and add it to your meal.');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to add food');
        return;
      }

      // Use the food's serving_amount as the default
      const gramsToAdd = food.serving_amount;
      const servingDescription = `${food.serving_amount} ${food.serving_unit}`;

      const multiplier = gramsToAdd / 100;

      // Calculate nutrition for the default serving
      const calories = food.calories * multiplier;
      const protein = food.protein * multiplier;
      const carbs = food.carbs * multiplier;
      const fats = food.fats * multiplier;
      const fiber = food.fiber * multiplier;

      // Find or create meal for the date and meal type
      const { data: existingMeal } = await supabase
        .from('meals')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', date)
        .eq('meal_type', mealType)
        .maybeSingle();

      let mealId = existingMeal?.id;

      if (!mealId) {
        console.log('[QuickAddHome] Creating new meal for', mealType, 'on', date);
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
          console.error('[QuickAddHome] Error creating meal:', mealError);
          Alert.alert('Error', 'Failed to create meal');
          return;
        }

        mealId = newMeal.id;
        console.log('[QuickAddHome] Created new meal:', mealId);
      } else {
        console.log('[QuickAddHome] Using existing meal:', mealId);
      }

      console.log('[QuickAddHome] Inserting NEW meal item with serving:', servingDescription);

      // ALWAYS INSERT a new meal item
      const { error: mealItemError } = await supabase
        .from('meal_items')
        .insert({
          meal_id: mealId,
          food_id: food.id,
          quantity: multiplier,
          calories: calories,
          protein: protein,
          carbs: carbs,
          fats: fats,
          fiber: fiber,
          serving_description: servingDescription,
          grams: gramsToAdd,
        });

      if (mealItemError) {
        console.error('[QuickAddHome] Error creating meal item:', mealItemError);
        Alert.alert('Error', 'Failed to add food to meal');
        return;
      }

      console.log('[QuickAddHome] ✅ Saved food added successfully!');
      
      // Show success banner via callback
      if (onQuickAdd) {
        onQuickAdd('Food Added');
      }
      
      console.log('[QuickAddHome] Keeping modal open for multiple adds');
    } catch (error) {
      console.error('[QuickAddHome] Error quick adding saved food:', error);
      Alert.alert('Error', 'An unexpected error occurred while adding food');
    }
  }, [context, date, mealType, onQuickAdd]);

  const handleDeleteFood = useCallback(async (foodId: string) => {
    console.log('[QuickAddHome] Deleting food:', foodId);

    // Optimistic update
    const previousFoods = [...myFoods];
    setMyFoods(myFoods.filter(f => f.id !== foodId));

    try {
      const { error } = await supabase
        .from('foods')
        .delete()
        .eq('id', foodId);

      if (error) {
        console.error('[QuickAddHome] Error deleting food:', error);
        setMyFoods(previousFoods);
        Alert.alert('Error', 'Failed to delete food');
      } else {
        console.log('[QuickAddHome] ✅ Food deleted successfully');
      }
    } catch (error) {
      console.error('[QuickAddHome] Error in handleDeleteFood:', error);
      setMyFoods(previousFoods);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  }, [myFoods]);

  const filteredFoods = myFoods.filter(food =>
    food.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderFoodItem = useCallback((food: MyFood, index: number) => {
    const servingText = `${food.serving_amount} ${food.serving_unit}`;
    const macrosText = `P: ${Math.round(food.protein)}g • C: ${Math.round(food.carbs)}g • F: ${Math.round(food.fats)}g`;

    return (
      <React.Fragment key={food.id}>
        <SwipeToDeleteRow onDelete={() => handleDeleteFood(food.id)}>
          {(isSwiping: boolean) => (
            <TouchableOpacity
              style={[styles.foodCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
              onPress={() => {
                if (!isSwiping) {
                  handleSelectFood(food);
                }
              }}
              activeOpacity={0.7}
              disabled={isSwiping}
            >
              <View style={styles.foodInfo}>
                <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text }]}>
                  {food.name}
                </Text>
                <Text style={[styles.foodServing, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  {food.brand ? `${food.brand} • ` : ''}{servingText} • {Math.round(food.calories)} cal
                </Text>
                <Text style={[styles.foodMacros, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  {macrosText}
                </Text>
              </View>
              
              {/* Show quick-add button only in meal_log context */}
              {context !== 'my_meals_builder' && (
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    if (!isSwiping) {
                      handleQuickAddFood(food);
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
              )}
              
              {/* Show chevron in my_meals_builder context */}
              {context === 'my_meals_builder' && (
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron_right"
                  size={20}
                  color={isDark ? colors.textSecondaryDark : colors.textSecondary}
                />
              )}
            </TouchableOpacity>
          )}
        </SwipeToDeleteRow>
      </React.Fragment>
    );
  }, [isDark, context, handleSelectFood, handleDeleteFood, handleQuickAddFood]);

  return (
    <View style={styles.container}>
      {/* Top Action Row - 2 Buttons Side-by-Side */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
          onPress={handleQuickAddManual}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add_circle"
            size={24}
            color={colors.primary}
          />
          <Text style={[styles.actionButtonText, { color: isDark ? colors.textDark : colors.text }]}>
            Quick Add{'\n'}(Calories & Macros)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
          onPress={handleCreateNewFood}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="fork.knife"
            android_material_icon_name="restaurant"
            size={24}
            color={colors.primary}
          />
          <Text style={[styles.actionButtonText, { color: isDark ? colors.textDark : colors.text }]}>
            Create New Food
          </Text>
        </TouchableOpacity>
      </View>

      {/* Saved Foods Section */}
      <View style={styles.savedFoodsSection}>
        <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
          Saved Foods
        </Text>

        {/* Search Bar */}
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
            placeholder="Search saved foods..."
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

        {/* Foods List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Loading saved foods...
            </Text>
          </View>
        ) : filteredFoods.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol
              ios_icon_name="fork.knife"
              android_material_icon_name="restaurant"
              size={48}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
            <Text style={[styles.emptyTitle, { color: isDark ? colors.textDark : colors.text }]}>
              {searchQuery ? 'No foods found' : 'No saved foods yet'}
            </Text>
            <Text style={[styles.emptyMessage, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {searchQuery ? 'Try a different search term' : 'Create your first food to reuse it anytime'}
            </Text>
          </View>
        ) : (
          <View style={styles.foodsList}>
            {filteredFoods.map((food, index) => renderFoodItem(food, index))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
    minHeight: 100,
  },
  actionButtonText: {
    ...typography.bodyBold,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  savedFoodsSection: {
    marginTop: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
    fontSize: 20,
    marginBottom: spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.sm,
    marginBottom: spacing.md,
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  loadingText: {
    ...typography.body,
    fontSize: 15,
    marginTop: spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyTitle: {
    ...typography.h3,
    fontSize: 18,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  emptyMessage: {
    ...typography.body,
    fontSize: 15,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xl,
  },
  foodsList: {
    marginTop: spacing.xs,
  },
  foodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
    elevation: 1,
    overflow: 'hidden',
    padding: spacing.md,
  },
  foodInfo: {
    flex: 1,
  },
  foodName: {
    ...typography.bodyBold,
    fontSize: 16,
    marginBottom: 2,
  },
  foodServing: {
    ...typography.caption,
    fontSize: 13,
    marginBottom: 2,
  },
  foodMacros: {
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
