
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, Modal } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { MyMeal, MyMealItem, MealType } from '@/types';

export default function MyMealDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<any>() || {};
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const mealId = params.mealId as string;

  const [meal, setMeal] = useState<MyMeal | null>(null);
  const [items, setItems] = useState<MyMealItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMealTypeModal, setShowMealTypeModal] = useState(false);

  // FIXED: Removed loadMyMeal from dependency array to prevent circular dependency
  const loadMyMeal = useCallback(async () => {
    try {
      setLoading(true);
      console.log('[MyMealDetails] Loading My Meal:', mealId);

      // Load meal details
      const { data: mealData, error: mealError } = await supabase
        .from('my_meals')
        .select('*')
        .eq('id', mealId)
        .single();

      if (mealError) {
        console.error('[MyMealDetails] Error loading meal:', mealError);
        Alert.alert('Error', 'Failed to load meal');
        return;
      }

      setMeal(mealData);

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
        console.error('[MyMealDetails] Error loading items:', itemsError);
        Alert.alert('Error', 'Failed to load meal items');
        return;
      }

      console.log('[MyMealDetails] Loaded', itemsData?.length || 0, 'items');
      
      // FIXED: Normalize the data structure - Supabase returns "foods" (plural) from the join,
      // but we need "food" (singular) to match the structure of newly added items
      const normalizedItems = (itemsData || []).map(item => ({
        ...item,
        food: (item as any).foods || item.food, // Use "foods" from DB join, fallback to "food"
      }));
      
      setItems(normalizedItems);
    } catch (error) {
      console.error('[MyMealDetails] Error in loadMyMeal:', error);
    } finally {
      setLoading(false);
    }
  }, [mealId]);

  useFocusEffect(
    useCallback(() => {
      console.log('[MyMealDetails] Screen focused, loading meal');
      loadMyMeal();
    }, [loadMyMeal])
  );

  const handleEdit = () => {
    console.log('[MyMealDetails] Navigating to edit meal');
    router.push({
      pathname: '/my-meal-builder',
      params: {
        mealId: mealId,
      },
    });
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete My Meal',
      `Are you sure you want to delete "${meal?.name}"? This will not affect any past diary entries.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('[MyMealDetails] Deleting meal:', mealId);

              const { error } = await supabase
                .from('my_meals')
                .delete()
                .eq('id', mealId);

              if (error) {
                console.error('[MyMealDetails] Error deleting meal:', error);
                Alert.alert('Error', 'Failed to delete meal');
                return;
              }

              console.log('[MyMealDetails] Meal deleted successfully');
              router.dismissTo('/my-meals-list');
            } catch (error) {
              console.error('[MyMealDetails] Error in handleDelete:', error);
              Alert.alert('Error', 'An unexpected error occurred');
            }
          },
        },
      ]
    );
  };

  const handleAddToDiary = () => {
    console.log('[MyMealDetails] Opening meal type selector');
    setShowMealTypeModal(true);
  };

  const handleLogToMeal = async (mealType: MealType) => {
    console.log('[MyMealDetails] Logging to', mealType);
    setShowMealTypeModal(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in');
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      // Find or create meal for today
      const { data: existingMeal } = await supabase
        .from('meals')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', today)
        .eq('meal_type', mealType)
        .maybeSingle();

      let diaryMealId = existingMeal?.id;

      if (!diaryMealId) {
        console.log('[MyMealDetails] Creating new diary meal for', mealType);
        const { data: newMeal, error: mealError } = await supabase
          .from('meals')
          .insert({
            user_id: user.id,
            date: today,
            meal_type: mealType,
          })
          .select()
          .single();

        if (mealError) {
          console.error('[MyMealDetails] Error creating meal:', mealError);
          Alert.alert('Error', 'Failed to create meal');
          return;
        }

        diaryMealId = newMeal.id;
      }

      // Insert all items into the diary
      const itemsToInsert = items.map(item => ({
        meal_id: diaryMealId,
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
        .from('meal_items')
        .insert(itemsToInsert);

      if (insertError) {
        console.error('[MyMealDetails] Error inserting items:', insertError);
        Alert.alert('Error', 'Failed to add items to diary');
        return;
      }

      console.log('[MyMealDetails] Items added to diary successfully');
      Alert.alert('Success', `Added ${items.length} items to ${mealType}`, [
        {
          text: 'OK',
          onPress: () => router.dismissTo('/(tabs)/(home)/'),
        },
      ]);
    } catch (error) {
      console.error('[MyMealDetails] Error in handleLogToMeal:', error);
      Alert.alert('Error', 'An unexpected error occurred');
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

  if (loading || !meal) {
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
          My Meal
        </Text>
        <TouchableOpacity onPress={handleEdit} style={styles.editButton}>
          <IconSymbol
            ios_icon_name="pencil"
            android_material_icon_name="edit"
            size={20}
            color={colors.primary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.mealCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <Text style={[styles.mealName, { color: isDark ? colors.textDark : colors.text }]}>
            {meal.name}
          </Text>
          {meal.note && (
            <Text style={[styles.mealNote, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {meal.note}
            </Text>
          )}

          <View style={styles.macrosSummary}>
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.calories }]}>
                {Math.round(meal.total_calories)}
              </Text>
              <Text style={[styles.macroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Calories
              </Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.protein }]}>
                {Math.round(meal.total_protein)}g
              </Text>
              <Text style={[styles.macroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Protein
              </Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.carbs }]}>
                {Math.round(meal.total_carbs)}g
              </Text>
              <Text style={[styles.macroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Carbs
              </Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.fats }]}>
                {Math.round(meal.total_fats)}g
              </Text>
              <Text style={[styles.macroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Fats
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.itemsSection}>
          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Foods ({items.length})
          </Text>

          {items.map((item, index) => (
            <View 
              key={item.id || `item-${index}`}
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
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.addToDiaryButton, { backgroundColor: colors.primary }]}
          onPress={handleAddToDiary}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add_circle"
            size={24}
            color="#FFFFFF"
          />
          <Text style={styles.addToDiaryButtonText}>Add to Diary</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.deleteButton, { backgroundColor: 'rgba(255, 59, 48, 0.1)' }]}
          onPress={handleDelete}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="trash"
            android_material_icon_name="delete"
            size={20}
            color={colors.error}
          />
          <Text style={[styles.deleteButtonText, { color: colors.error }]}>Delete My Meal</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Meal Type Selection Modal */}
      <Modal
        visible={showMealTypeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMealTypeModal(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMealTypeModal(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <Text style={[styles.modalTitle, { color: isDark ? colors.textDark : colors.text }]}>
              Add to which meal?
            </Text>

            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => handleLogToMeal('breakfast')}
              activeOpacity={0.7}
            >
              <Text style={[styles.modalOptionText, { color: isDark ? colors.textDark : colors.text }]}>
                Breakfast
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => handleLogToMeal('lunch')}
              activeOpacity={0.7}
            >
              <Text style={[styles.modalOptionText, { color: isDark ? colors.textDark : colors.text }]}>
                Lunch
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => handleLogToMeal('dinner')}
              activeOpacity={0.7}
            >
              <Text style={[styles.modalOptionText, { color: isDark ? colors.textDark : colors.text }]}>
                Dinner
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => handleLogToMeal('snack')}
              activeOpacity={0.7}
            >
              <Text style={[styles.modalOptionText, { color: isDark ? colors.textDark : colors.text }]}>
                Snacks
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalCancelButton, { marginTop: spacing.md }]}
              onPress={() => setShowMealTypeModal(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.modalCancelText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  mealCard: {
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  mealName: {
    ...typography.h2,
    fontSize: 24,
    marginBottom: spacing.xs,
  },
  mealNote: {
    ...typography.body,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  macrosSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border + '30',
  },
  macroItem: {
    alignItems: 'center',
  },
  macroValue: {
    ...typography.bodyBold,
    fontSize: 20,
  },
  macroLabel: {
    ...typography.caption,
    fontSize: 12,
    marginTop: 2,
  },
  itemsSection: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    fontSize: 18,
    marginBottom: spacing.sm,
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
  addToDiaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  addToDiaryButtonText: {
    ...typography.bodyBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  deleteButtonText: {
    ...typography.bodyBold,
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.2)',
    elevation: 5,
  },
  modalTitle: {
    ...typography.h3,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  modalOption: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '30',
  },
  modalOptionText: {
    ...typography.body,
    fontSize: 16,
    textAlign: 'center',
  },
  modalCancelButton: {
    paddingVertical: spacing.sm,
  },
  modalCancelText: {
    ...typography.body,
    fontSize: 16,
    textAlign: 'center',
  },
});
