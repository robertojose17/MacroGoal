
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase, TABLE_SAVED_MEALS, TABLE_SAVED_MEAL_ITEMS } from '@/app/integrations/supabase/client';
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
  };
}

interface SavedMeal {
  id: string;
  name: string;
  saved_meal_items: SavedMealItem[];
}

export default function MyMealsEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const mealId = params.mealId as string;

  const [savedMeal, setSavedMeal] = useState<SavedMeal | null>(null);
  const [mealName, setMealName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSavedMeal = useCallback(async () => {
    if (!mealId) return;

    try {
      setLoading(true);
      console.log('[MyMealsEdit] Loading saved meal:', mealId);

      const { data, error } = await supabase
        .from(TABLE_SAVED_MEALS)
        .select(`
          id,
          name,
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
              fiber
            )
          )
        `)
        .eq('id', mealId)
        .single();

      if (error) {
        console.error('[MyMealsEdit] Error loading saved meal:', error);
        Alert.alert('Error', 'Failed to load meal');
        router.back();
        return;
      }

      console.log('[MyMealsEdit] Loaded meal:', data.name);
      setSavedMeal(data as SavedMeal);
      setMealName(data.name);
      setLoading(false);
    } catch (error) {
      console.error('[MyMealsEdit] Error in loadSavedMeal:', error);
      Alert.alert('Error', 'An unexpected error occurred');
      router.back();
    }
  }, [mealId, router]);

  useFocusEffect(
    useCallback(() => {
      console.log('[MyMealsEdit] Screen focused');
      loadSavedMeal();
    }, [loadSavedMeal])
  );

  const handleSave = async () => {
    console.log('[MyMealsEdit] Saving meal name');

    if (!mealName.trim()) {
      Alert.alert('Error', 'Please enter a meal name');
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from(TABLE_SAVED_MEALS)
        .update({ name: mealName.trim() })
        .eq('id', mealId);

      if (error) {
        console.error('[MyMealsEdit] Error updating meal name:', error);
        Alert.alert('Error', 'Failed to update meal name');
        setSaving(false);
        return;
      }

      console.log('[MyMealsEdit] Meal name updated successfully');
      Alert.alert('Success', 'Meal updated!', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.error('[MyMealsEdit] Error in handleSave:', error);
      Alert.alert('Error', 'An unexpected error occurred');
      setSaving(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    console.log('[MyMealsEdit] Removing item:', itemId);

    if (!savedMeal) return;

    // Check if this is the last item
    if (savedMeal.saved_meal_items.length === 1) {
      Alert.alert(
        'Cannot Remove',
        'A meal must have at least one food item. Delete the entire meal instead.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Optimistic update
    const previousMeal = { ...savedMeal };
    setSavedMeal({
      ...savedMeal,
      saved_meal_items: savedMeal.saved_meal_items.filter(item => item.id !== itemId),
    });

    try {
      const { error } = await supabase
        .from(TABLE_SAVED_MEAL_ITEMS)
        .delete()
        .eq('id', itemId);

      if (error) {
        console.error('[MyMealsEdit] Error deleting item:', error);
        setSavedMeal(previousMeal);
        Alert.alert('Error', 'Failed to remove item');
      } else {
        console.log('[MyMealsEdit] Item removed successfully');
      }
    } catch (error) {
      console.error('[MyMealsEdit] Error in handleRemoveItem:', error);
      setSavedMeal(previousMeal);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  const handleAddFood = () => {
    console.log('[MyMealsEdit] Adding food to meal');
    router.push({
      pathname: '/add-food',
      params: {
        context: 'edit_saved_meal',
        savedMealId: mealId,
        returnTo: `/my-meals-edit?mealId=${mealId}`,
      },
    });
  };

  const calculateTotals = () => {
    if (!savedMeal) return { calories: 0, protein: 0, carbs: 0, fats: 0 };

    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFats = 0;

    savedMeal.saved_meal_items.forEach(item => {
      if (!item.foods) return;
      const multiplier = (item.serving_amount / 100) * item.servings_count;
      totalCalories += item.foods.calories * multiplier;
      totalProtein += item.foods.protein * multiplier;
      totalCarbs += item.foods.carbs * multiplier;
      totalFats += item.foods.fats * multiplier;
    });

    return {
      calories: totalCalories,
      protein: totalProtein,
      carbs: totalCarbs,
      fats: totalFats,
    };
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
            Loading meal...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const totals = calculateTotals();
  const validItems = savedMeal.saved_meal_items.filter(item => item.foods);

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
          Edit Meal
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.nameCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <Text style={[styles.nameLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Meal Name
          </Text>
          <TextInput
            style={[
              styles.nameInput,
              {
                backgroundColor: isDark ? colors.backgroundDark : colors.background,
                borderColor: isDark ? colors.borderDark : colors.border,
                color: isDark ? colors.textDark : colors.text,
              }
            ]}
            placeholder="e.g., Breakfast Bowl, Post-Workout Meal"
            placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
            value={mealName}
            onChangeText={setMealName}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Foods ({validItems.length})
          </Text>
          <TouchableOpacity
            style={[styles.addFoodButton, { backgroundColor: colors.primary }]}
            onPress={handleAddFood}
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
        </View>

        {validItems.map((item, index) => {
          const multiplier = (item.serving_amount / 100) * item.servings_count;
          const itemCalories = item.foods.calories * multiplier;
          const itemProtein = item.foods.protein * multiplier;
          const itemCarbs = item.foods.carbs * multiplier;
          const itemFats = item.foods.fats * multiplier;

          return (
            <React.Fragment key={item.id}>
              <SwipeToDeleteRow onDelete={() => handleRemoveItem(item.id)}>
                <View style={[styles.itemCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemName, { color: isDark ? colors.textDark : colors.text }]}>
                      {item.foods.name}
                    </Text>
                    {item.foods.brand && (
                      <Text style={[styles.itemBrand, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                        {item.foods.brand}
                      </Text>
                    )}
                    <Text style={[styles.itemServing, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      {item.servings_count} × {item.serving_amount} {item.serving_unit} • {Math.round(itemCalories)} cal
                    </Text>
                    <Text style={[styles.itemMacros, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      P: {Math.round(itemProtein)}g • C: {Math.round(itemCarbs)}g • F: {Math.round(itemFats)}g
                    </Text>
                  </View>
                </View>
              </SwipeToDeleteRow>
            </React.Fragment>
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
          style={[styles.saveButton, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.7}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  nameCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
    elevation: 1,
  },
  nameLabel: {
    ...typography.caption,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  nameInput: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 16,
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
    overflow: 'hidden',
    padding: spacing.md,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    ...typography.bodyBold,
    fontSize: 16,
    marginBottom: 2,
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
  saveButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
