
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import SwipeableListItem from '@/components/SwipeableListItem';
import { supabase } from '@/app/integrations/supabase/client';
import { MyMealItem } from '@/types';

// Generate a unique session ID for this builder instance
const generateSessionId = () => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export default function MyMealBuilderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<any>() || {};
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const mealId = params.mealId as string | undefined;
  const isEditing = !!mealId;

  // PERSISTENT BUILDER SESSION ID - generated once and never changes
  const builderSessionIdRef = useRef<string>(generateSessionId());
  const hasLoadedRef = useRef(false);

  const [mealName, setMealName] = useState('');
  const [mealNote, setMealNote] = useState('');
  const [items, setItems] = useState<MyMealItem[]>([]);
  const [loading, setLoading] = useState(false);

  // FIXED: Removed loadMyMeal from dependency array to prevent circular dependency
  const loadMyMeal = useCallback(async () => {
    if (!mealId) return;

    try {
      setLoading(true);
      console.log('[MyMealBuilder] Loading My Meal:', mealId);

      // Load meal details
      const { data: mealData, error: mealError } = await supabase
        .from('my_meals')
        .select('*')
        .eq('id', mealId)
        .single();

      if (mealError) {
        console.error('[MyMealBuilder] Error loading meal:', mealError);
        Alert.alert('Error', 'Failed to load meal');
        return;
      }

      setMealName(mealData.name);
      setMealNote(mealData.note || '');

      // Load meal items
      const { data: itemsData, error: itemsError } = await supabase
        .from('my_meal_items')
        .select(`
          *,
          foods (
            id,
            name,
            brand,
            serving_amount,
            serving_unit,
            calories,
            protein,
            carbs,
            fats,
            fiber,
            barcode,
            user_created
          )
        `)
        .eq('my_meal_id', mealId);

      if (itemsError) {
        console.error('[MyMealBuilder] Error loading items:', itemsError);
        Alert.alert('Error', 'Failed to load meal items');
        return;
      }

      console.log('[MyMealBuilder] Loaded', itemsData?.length || 0, 'items');
      
      // FIXED: Normalize the data structure - Supabase returns "foods" (plural) from the join,
      // but we need "food" (singular) to match the structure of newly added items
      const normalizedItems = (itemsData || []).map(item => ({
        ...item,
        food: (item as any).foods || item.food, // Use "foods" from DB join, fallback to "food"
      }));
      
      setItems(normalizedItems);
    } catch (error) {
      console.error('[MyMealBuilder] Error in loadMyMeal:', error);
    } finally {
      setLoading(false);
    }
  }, [mealId]);

  // Load existing meal data on mount (only once)
  useEffect(() => {
    if (isEditing && !hasLoadedRef.current) {
      console.log('[MyMealBuilder] Initial load for editing meal:', mealId);
      hasLoadedRef.current = true;
      loadMyMeal();
    }
  }, [isEditing, mealId, loadMyMeal]);

  useFocusEffect(
    useCallback(() => {
      console.log('[MyMealBuilder] Screen focused');
      console.log('[MyMealBuilder] Builder Session ID:', builderSessionIdRef.current);
      console.log('[MyMealBuilder] Current items count:', items.length);
      
      // If we have a new food item from the Add Food flow, add it
      if (params.newFoodItem) {
        try {
          const newItem = JSON.parse(params.newFoodItem as string);
          console.log('[MyMealBuilder] ========== ADDING NEW FOOD ITEM ==========');
          console.log('[MyMealBuilder] Food:', newItem.food?.name || 'Unknown');
          console.log('[MyMealBuilder] Calories:', newItem.calories);
          
          // Generate a temporary ID for the item
          const itemWithTempId = {
            ...newItem,
            id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          };
          
          // APPEND to existing items (never overwrite)
          setItems(prev => {
            console.log('[MyMealBuilder] Previous items count:', prev.length);
            const updated = [...prev, itemWithTempId];
            console.log('[MyMealBuilder] Updated items count:', updated.length);
            console.log('[MyMealBuilder] ========================================');
            return updated;
          });
          
          // Clear the param IMMEDIATELY to prevent re-adding on next focus
          router.setParams({ newFoodItem: undefined });
        } catch (error) {
          console.error('[MyMealBuilder] Error parsing new food item:', error);
        }
      }
    }, [params.newFoodItem, router, items.length])
  );

  // FIXED: Added items.length to dependency array to satisfy react-hooks/exhaustive-deps
  const handleAddFood = useCallback(() => {
    console.log('[MyMealBuilder] Opening Add Food in mymeal mode');
    console.log('[MyMealBuilder] Passing builder session ID:', builderSessionIdRef.current);
    
    router.push({
      pathname: '/add-food',
      params: {
        mode: 'mymeal',
        context: 'my_meal_builder',
        builderSessionId: builderSessionIdRef.current,
        returnTo: '/my-meal-builder',
        mealId: mealId || '',
      },
    });
  }, [router, mealId, items.length]);

  const handleRemoveItem = useCallback((itemId: string) => {
    console.log('[MyMealBuilder] Removing item:', itemId);
    setItems(prev => prev.filter(item => item.id !== itemId));
  }, []);

  const handleSave = async () => {
    console.log('[MyMealBuilder] Saving My Meal');

    // Validation
    if (!mealName.trim()) {
      Alert.alert('Error', 'Please enter a meal name');
      return;
    }

    if (items.length === 0) {
      Alert.alert('Error', 'Please add at least one food item');
      return;
    }

    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in');
        return;
      }

      // Calculate totals
      const totals = items.reduce(
        (acc, item) => ({
          calories: acc.calories + item.calories,
          protein: acc.protein + item.protein,
          carbs: acc.carbs + item.carbs,
          fats: acc.fats + item.fats,
          fiber: acc.fiber + item.fiber,
        }),
        { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
      );

      if (isEditing) {
        // Update existing meal
        console.log('[MyMealBuilder] Updating existing meal:', mealId);

        const { error: updateError } = await supabase
          .from('my_meals')
          .update({
            name: mealName.trim(),
            note: mealNote.trim() || null,
            total_calories: totals.calories,
            total_protein: totals.protein,
            total_carbs: totals.carbs,
            total_fats: totals.fats,
            total_fiber: totals.fiber,
            updated_at: new Date().toISOString(),
          })
          .eq('id', mealId);

        if (updateError) {
          console.error('[MyMealBuilder] Error updating meal:', updateError);
          Alert.alert('Error', 'Failed to update meal');
          return;
        }

        // Delete old items
        const { error: deleteError } = await supabase
          .from('my_meal_items')
          .delete()
          .eq('my_meal_id', mealId);

        if (deleteError) {
          console.error('[MyMealBuilder] Error deleting old items:', deleteError);
        }

        // Insert new items
        const itemsToInsert = items.map(item => ({
          my_meal_id: mealId,
          food_id: item.food_id,
          quantity: item.quantity,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fats: item.fats,
          fiber: item.fiber,
          serving_description: item.serving_description,
          grams: item.grams,
        }));

        const { error: insertError } = await supabase
          .from('my_meal_items')
          .insert(itemsToInsert);

        if (insertError) {
          console.error('[MyMealBuilder] Error inserting items:', insertError);
          Alert.alert('Error', 'Failed to save meal items');
          return;
        }

        console.log('[MyMealBuilder] Meal updated successfully');
        Alert.alert('Success', 'Meal updated successfully', [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]);
      } else {
        // Create new meal
        console.log('[MyMealBuilder] Creating new meal');

        const { data: newMeal, error: createError } = await supabase
          .from('my_meals')
          .insert({
            user_id: user.id,
            name: mealName.trim(),
            note: mealNote.trim() || null,
            total_calories: totals.calories,
            total_protein: totals.protein,
            total_carbs: totals.carbs,
            total_fats: totals.fats,
            total_fiber: totals.fiber,
          })
          .select()
          .single();

        if (createError) {
          console.error('[MyMealBuilder] Error creating meal:', createError);
          Alert.alert('Error', 'Failed to create meal');
          return;
        }

        console.log('[MyMealBuilder] Meal created:', newMeal.id);

        // Insert items
        const itemsToInsert = items.map(item => ({
          my_meal_id: newMeal.id,
          food_id: item.food_id,
          quantity: item.quantity,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fats: item.fats,
          fiber: item.fiber,
          serving_description: item.serving_description,
          grams: item.grams,
        }));

        const { error: insertError } = await supabase
          .from('my_meal_items')
          .insert(itemsToInsert);

        if (insertError) {
          console.error('[MyMealBuilder] Error inserting items:', insertError);
          Alert.alert('Error', 'Failed to save meal items');
          return;
        }

        console.log('[MyMealBuilder] Meal created successfully');
        
        // Navigate to My Meals list
        router.dismissTo('/my-meals-list');
      }
    } catch (error) {
      console.error('[MyMealBuilder] Error in handleSave:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getServingDisplayText = (item: MyMealItem): string => {
    if (item.serving_description) {
      return item.serving_description;
    }
    if (item.grams) {
      return `${Math.round(item.grams)} g`;
    }
    return `${item.quantity}x serving`;
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
          {isEditing ? 'Edit My Meal' : 'Create My Meal'}
        </Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveButton} disabled={loading}>
          <Text style={[styles.saveButtonText, { color: colors.primary }]}>
            {loading ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.inputCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <Text style={[styles.inputLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Meal Name *
          </Text>
          <TextInput
            style={[
              styles.input,
              { 
                color: isDark ? colors.textDark : colors.text,
                backgroundColor: isDark ? colors.backgroundDark : colors.background,
                borderColor: isDark ? colors.borderDark : colors.border,
              }
            ]}
            placeholder="e.g., Breakfast Bowl, Post-Workout Meal"
            placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
            value={mealName}
            onChangeText={setMealName}
            autoCapitalize="words"
          />

          <Text style={[styles.inputLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.md }]}>
            Note (Optional)
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              { 
                color: isDark ? colors.textDark : colors.text,
                backgroundColor: isDark ? colors.backgroundDark : colors.background,
                borderColor: isDark ? colors.borderDark : colors.border,
              }
            ]}
            placeholder="Add any notes about this meal..."
            placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
            value={mealNote}
            onChangeText={setMealNote}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.foodsSection}>
          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Foods ({items.length})
          </Text>

          {items.length === 0 ? (
            <View style={[styles.emptyFoods, { borderColor: isDark ? colors.borderDark : colors.border }]}>
              <IconSymbol
                ios_icon_name="fork.knife"
                android_material_icon_name="restaurant"
                size={48}
                color={isDark ? colors.textSecondaryDark : colors.textSecondary}
              />
              <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                No foods added yet
              </Text>
            </View>
          ) : (
            items.map((item, index) => (
              <SwipeableListItem
                key={item.id || `item-${index}`}
                onDelete={() => handleRemoveItem(item.id)}
              >
                <View 
                  style={[
                    styles.foodItem,
                    { backgroundColor: isDark ? colors.cardDark : colors.card }
                  ]}
                >
                  <View style={styles.foodInfo}>
                    <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text }]}>
                      {item.food?.name || 'Unknown Food'}
                    </Text>
                    {item.food?.brand && (
                      <Text style={[styles.foodBrand, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                        {item.food.brand}
                      </Text>
                    )}
                    <Text style={[styles.foodServing, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      {getServingDisplayText(item)} • {Math.round(item.calories)} cal
                    </Text>
                  </View>
                </View>
              </SwipeableListItem>
            ))
          )}

          <TouchableOpacity
            style={[styles.addFoodButton, { backgroundColor: colors.primary }]}
            onPress={handleAddFood}
            activeOpacity={0.7}
          >
            <IconSymbol
              ios_icon_name="plus"
              android_material_icon_name="add"
              size={20}
              color="#FFFFFF"
            />
            <Text style={styles.addFoodButtonText}>Add Food</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
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
  saveButton: {
    padding: spacing.xs,
  },
  saveButtonText: {
    ...typography.bodyBold,
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  inputCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
    elevation: 1,
  },
  inputLabel: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  input: {
    ...typography.body,
    fontSize: 16,
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  textArea: {
    minHeight: 80,
    paddingTop: spacing.sm,
  },
  foodsSection: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    fontSize: 18,
    marginBottom: spacing.sm,
  },
  emptyFoods: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    borderStyle: 'dashed',
    marginBottom: spacing.md,
  },
  emptyText: {
    ...typography.body,
    fontSize: 15,
    marginTop: spacing.sm,
  },
  foodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
    elevation: 1,
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
  foodServing: {
    ...typography.caption,
    fontSize: 13,
  },
  addFoodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  addFoodButtonText: {
    ...typography.bodyBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
});
