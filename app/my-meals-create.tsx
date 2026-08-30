
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase, TABLE_SAVED_MEALS, TABLE_SAVED_MEAL_ITEMS, initializeDatabase } from '@/lib/supabase/client';
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow';
import { loadDraft, saveDraft, clearDraft, DraftItem } from '@/utils/myMealsDraft';
import { formatFoodRowServing } from '@/utils/servingDisplay';
import { toLocalDateString } from '@/utils/dateUtils';
import FoodItemRow from '@/components/FoodItemRow';

export default function MyMealsCreateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation();

  const mealType = (params.meal as string) || 'breakfast';
  const date = (params.date as string) || toLocalDateString();
  const returnTo = (params.returnTo as string) || undefined;

  const [mealName, setMealName] = useState('');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize: clear draft on first mount and verify database
  React.useEffect(() => {
    const initializeScreen = async () => {
      if (!isInitialized) {
        console.log('[MyMealsCreate] Initializing screen, clearing old draft');
        await clearDraft();
        
        // Verify database tables exist
        console.log('[MyMealsCreate] Verifying database tables...');
        const dbReady = await initializeDatabase();
        if (!dbReady) {
          console.error('[MyMealsCreate] ❌ Database is not ready! Tables are missing.');
          Alert.alert(
            t('myMeals.databaseError'),
            t('myMeals.databaseMissingTables'),
            [{ text: t('common.ok') }]
          );
        } else {
          console.log('[MyMealsCreate] ✅ Database is ready');
        }
        
        setIsInitialized(true);
      }
    };
    initializeScreen();
  }, [isInitialized, t]);

  // Load draft items from AsyncStorage when screen focuses
  useFocusEffect(
    useCallback(() => {
      console.log('[MyMealsCreate] Screen focused');
      if (isInitialized) {
        loadDraftFromStorage();
      }
    }, [isInitialized])
  );

  const loadDraftFromStorage = async () => {
    try {
      const draft = await loadDraft();
      console.log('[MyMealsCreate] Loaded draft:', draft.length, 'items');
      
      // DEBUG: Log each item's food_id
      draft.forEach((item, index) => {
        console.log(`[MyMealsCreate] Draft item ${index + 1}:`, {
          food_id: item.food_id,
          food_name: item.food_name,
          tempId: item.tempId,
        });
      });
      
      setDraftItems(draft);
    } catch (error) {
      console.error('[MyMealsCreate] Error loading draft:', error);
    }
  };

  const handleAddFood = () => {
    console.log('[MyMealsCreate] Add food button pressed');
    
    // CRITICAL: Pass context = "my_meals_builder" to ensure all add-food actions add to draft
    router.push({
      pathname: '/add-food',
      params: {
        context: 'my_meals_builder',
        meal: mealType,
        date: date,
        returnTo: '/my-meals-create',
      },
    });
  };

  const handleRemoveItem = async (tempId: string) => {
    console.log('[MyMealsCreate] Removing item:', tempId);
    const updatedItems = draftItems.filter(item => item.tempId !== tempId);
    setDraftItems(updatedItems);
    await saveDraft(updatedItems);
  };

  const handleEditDraftItem = useCallback((item: DraftItem) => {
    console.log('[MyMealsCreate] Edit draft item tapped:', item.tempId, item.food_name);
    // Build a mock OpenFoodFactsProduct from the draft item data
    // This is the same pattern FoodDetailsLayout uses internally for edit mode
    const mockProduct = {
      product_name: item.food_name,
      brands: item.food_brand || '',
      nutriments: {
        // DraftItem stores per-serving values, but FoodDetailsLayout expects per-100g
        // serving_amount is the grams per serving, so we back-calculate per-100g
        'energy-kcal_100g': item.serving_amount > 0 ? (item.calories / item.serving_amount) * 100 : item.calories,
        'proteins_100g': item.serving_amount > 0 ? (item.protein / item.serving_amount) * 100 : item.protein,
        'carbohydrates_100g': item.serving_amount > 0 ? (item.carbs / item.serving_amount) * 100 : item.carbs,
        'fat_100g': item.serving_amount > 0 ? (item.fats / item.serving_amount) * 100 : item.fats,
        'fiber_100g': item.serving_amount > 0 ? (item.fiber / item.serving_amount) * 100 : item.fiber,
        // Also include per-serving values so FoodDetailsLayout can use them directly
        'energy-kcal_serving': item.calories,
        'proteins_serving': item.protein,
        'carbohydrates_serving': item.carbs,
        'fat_serving': item.fats,
        'fiber_serving': item.fiber,
      },
      serving_size: item.serving_description || `${item.serving_amount} ${item.serving_unit}`,
      serving_quantity: String(item.serving_amount),
    };

    router.push({
      pathname: '/food-details',
      params: {
        offData: JSON.stringify(mockProduct),
        foodId: item.food_id,
        food_item_id: item.food_item_id || '',
        context: 'my_meals_builder',
        meal: mealType,
        date: date,
        editTempId: item.tempId,
        source: 'recent',
      },
    });
  }, [router, mealType, date]);

  const handleSave = async () => {
    console.log('[MyMealsCreate] Save meal button pressed');
    
    // Get user first to log it
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || 'null';
    
    console.log('[MyMealsCreate] SAVE_MY_MEAL pressed userId=' + userId + ' name="' + mealName + '" itemsCount=' + draftItems.length);

    // VALIDATION: Check meal name
    if (!mealName.trim()) {
      console.log('[MyMealsCreate] ❌ VALIDATION FAILED: Meal name is empty');
      Alert.alert(t('common.error'), t('myMeals.enterMealName'));
      return;
    }

    // VALIDATION: Check items
    if (draftItems.length === 0) {
      console.log('[MyMealsCreate] ❌ VALIDATION FAILED: No items in meal');
      Alert.alert(t('common.error'), t('myMeals.addAtLeastOneFood'));
      return;
    }

    console.log('[MyMealsCreate] ✅ Validation passed');
    console.log('[MyMealsCreate] Starting save process...');
    
    // DEBUG: Log all food_ids before save
    console.log('[MyMealsCreate] ========== FOOD IDs IN DRAFT ==========');
    draftItems.forEach((item, index) => {
      console.log(`[MyMealsCreate] Item ${index + 1}:`, {
        food_id: item.food_id,
        food_name: item.food_name,
        food_brand: item.food_brand,
      });
    });
    
    setSaving(true);

    try {
      // STEP 1: Get user (already done above for logging)
      console.log('[MyMealsCreate] STEP 1: Getting user...');
      
      if (!user) {
        console.error('[MyMealsCreate] ❌ No user found');
        Alert.alert(t('common.error'), t('myMealsCreate.mustBeLoggedIn'));
        setSaving(false);
        return;
      }

      console.log('[MyMealsCreate] ✅ User found:', user.id);

      // STEP 3: Create saved meal
      console.log('[MyMealsCreate] STEP 3: Creating saved meal...');

      const { data: savedMeal, error: mealError } = await supabase
        .from(TABLE_SAVED_MEALS)
        .insert({
          user_id: user.id,
          name: mealName.trim(),
        })
        .select()
        .single();

      if (mealError) {
        console.error('[MyMealsCreate] ❌ ERROR CREATING SAVED MEAL:', mealError);
        
        // Check for common errors
        if (mealError.code === '42501') {
          Alert.alert(t('common.error'), t('myMealsCreate.permissionDenied'));
        } else if (mealError.code === '23505') {
          Alert.alert(t('common.error'), t('myMealsCreate.duplicateName'));
        } else {
          Alert.alert(t('common.error'), t('myMeals.failedToSave'));
        }
        
        setSaving(false);
        return;
      }

      if (!savedMeal) {
        console.error('[MyMealsCreate] ❌ No saved meal returned from insert');
        Alert.alert(t('common.error'), t('myMealsCreate.noDataReturned'));
        setSaving(false);
        return;
      }

      console.log('[MyMealsCreate] ✅ Saved meal created successfully!');
      console.log('[MyMealsCreate] Saved meal ID:', savedMeal.id);

      // STEP 4: Create saved meal items
      console.log('[MyMealsCreate] STEP 4: Creating saved meal items...');

      const itemsToInsert = draftItems.map((item, index) => {
        console.log(`[MyMealsCreate] ========== ITEM ${index + 1} ==========`);
        console.log('[MyMealsCreate] food_id:', item.food_id);
        console.log('[MyMealsCreate] food_name:', item.food_name);

        return {
          saved_meal_id: savedMeal.id,
          food_id: item.food_id || null,
          food_item_id: item.food_item_id || null,
          food_name: item.food_name,
          food_brand: item.food_brand || null,
          serving_amount: item.serving_amount,
          serving_unit: item.serving_unit,
          servings_count: item.servings_count,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fats,
          fiber: item.fiber,
        };
      });

      const { data: insertedItems, error: itemsError } = await supabase
        .from(TABLE_SAVED_MEAL_ITEMS)
        .insert(itemsToInsert)
        .select();

      if (itemsError) {
        console.error('[MyMealsCreate] ❌ ERROR CREATING SAVED MEAL ITEMS:', itemsError);
        
        // Rollback: delete the saved meal
        console.log('[MyMealsCreate] Rolling back: deleting saved meal', savedMeal.id);
        await supabase.from(TABLE_SAVED_MEALS).delete().eq('id', savedMeal.id);
        
        Alert.alert(t('common.error'), t('myMealsCreate.failedToSaveItems', { message: itemsError.message }));
        setSaving(false);
        return;
      }

      console.log('[MyMealsCreate] ✅ Saved meal items created successfully!');
      console.log('[MyMealsCreate] Inserted items count:', insertedItems?.length || 0);

      // STEP 5: Clear draft
      console.log('[MyMealsCreate] STEP 5: Clearing draft...');
      await clearDraft();
      console.log('[MyMealsCreate] ✅ Draft cleared');

      // STEP 6: Show success and navigate back
      console.log('[MyMealsCreate] ========== SAVE COMPLETE ==========');
      
      Alert.alert(t('common.success'), t('myMeals.mealSaved'), [
        {
          text: t('common.ok'),
          onPress: () => {
            console.log('[MyMealsCreate] Navigating back to My Meals list...');
            router.back();
          },
        },
      ]);
      setSaving(false);
    } catch (error) {
      console.error('[MyMealsCreate] ❌ UNEXPECTED ERROR in handleSave:', error);
      Alert.alert(t('common.error'), t('common.unexpectedError'));
      setSaving(false);
    }
  };

  const calculateTotals = () => {
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFats = 0;

    draftItems.forEach(item => {
      totalCalories += item.calories;
      totalProtein += item.protein;
      totalCarbs += item.carbs;
      totalFats += item.fats;
    });

    return {
      calories: totalCalories,
      protein: totalProtein,
      carbs: totalCarbs,
      fats: totalFats,
    };
  };

  const totals = calculateTotals();

  const renderDraftItem = (item: DraftItem, index: number) => {
    const servingText = formatFoodRowServing(item.serving_description ?? null, item.servings_count ?? 1, item.serving_amount);

    return (
      <View key={item.tempId} style={[styles.foodItem, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
        <FoodItemRow
          name={item.food_name}
          brand={item.food_brand ?? undefined}
          calories={item.calories}
          protein={item.protein}
          carbs={item.carbs}
          fats={item.fats}
          servingText={servingText}
          onPress={() => {
            console.log('[MyMealsCreate] Draft item tapped for edit:', item.food_name);
            handleEditDraftItem(item);
          }}
          onDelete={() => handleRemoveItem(item.tempId)}
          isDark={isDark}
        />
      </View>
    );
  };

  const foodsCount = draftItems.length;

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
          {t('myMealsCreate.title')}
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
            {t('myMeals.mealName')}
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
            placeholder={t('myMeals.mealNamePlaceholder')}
            placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
            value={mealName}
            onChangeText={setMealName}
            autoCapitalize="words"
          />
        </View>

        <View style={[styles.totalsCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <Text style={[styles.totalsTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('myMeals.totalNutrition')}
          </Text>
          <View style={styles.totalsRow}>
            <View style={styles.totalItem}>
              <Text style={[styles.totalValue, { color: colors.calories }]}>
                {Math.round(totals.calories)}
              </Text>
              <Text style={[styles.totalLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {t('common.calories')}
              </Text>
            </View>
            <View style={styles.totalItem}>
              <Text style={[styles.totalValue, { color: colors.protein }]}>
                {Math.round(totals.protein)}g
              </Text>
              <Text style={[styles.totalLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {t('common.protein')}
              </Text>
            </View>
            <View style={styles.totalItem}>
              <Text style={[styles.totalValue, { color: colors.carbs }]}>
                {Math.round(totals.carbs)}g
              </Text>
              <Text style={[styles.totalLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {t('common.carbs')}
              </Text>
            </View>
            <View style={styles.totalItem}>
              <Text style={[styles.totalValue, { color: colors.fats }]}>
                {Math.round(totals.fats)}g
              </Text>
              <Text style={[styles.totalLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {t('myMealsCreate.fat')}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            {t('myMealsCreate.foodsCount', { count: foodsCount })}
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
            <Text style={styles.addFoodButtonText}>{t('myMealsCreate.addFood')}</Text>
          </TouchableOpacity>
        </View>

        {draftItems.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol
              ios_icon_name="fork.knife"
              android_material_icon_name="restaurant"
              size={48}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
            <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {t('myMealsCreate.noFoodsAdded')}
            </Text>
            <Text style={[styles.emptySubtext, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {t('myMealsCreate.tapAddFood')}
            </Text>
          </View>
        ) : (
          <React.Fragment>
            {draftItems.map((item, index) => renderDraftItem(item, index))}
          </React.Fragment>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {draftItems.length > 0 && (
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
              <Text style={styles.saveButtonText}>{t('myMeals.saveMeal')}</Text>
            )}
          </TouchableOpacity>
        </View>
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
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    ...typography.body,
    fontSize: 15,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  emptySubtext: {
    ...typography.caption,
    fontSize: 13,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  foodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minHeight: 64,
  },
  foodInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  foodName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 1,
  },
  foodBrand: {
    fontSize: 12,
    marginBottom: 1,
  },
  foodDetails: {
    fontSize: 12,
  },
  foodCalories: {
    alignItems: 'flex-end',
    minWidth: 48,
  },
  foodCaloriesValue: {
    fontSize: 17,
    fontWeight: '700',
  },
  foodCaloriesLabel: {
    fontSize: 11,
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
