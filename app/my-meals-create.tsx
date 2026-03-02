
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase, TABLE_SAVED_MEALS, TABLE_SAVED_MEAL_ITEMS, initializeDatabase } from '@/app/integrations/supabase/client';
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow';
import { loadDraft, saveDraft, clearDraft, DraftItem } from '@/utils/myMealsDraft';

export default function MyMealsCreateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const mealType = (params.meal as string) || 'breakfast';
  const date = (params.date as string) || new Date().toISOString().split('T')[0];
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
            'Database Error',
            'The required database tables are missing. Please contact support or check the console logs for migration instructions.',
            [{ text: 'OK' }]
          );
        } else {
          console.log('[MyMealsCreate] ✅ Database is ready');
        }
        
        setIsInitialized(true);
      }
    };
    initializeScreen();
  }, [isInitialized]);

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
    console.log('[MyMealsCreate] ========== NAVIGATING TO ADD FOOD ==========');
    console.log('[MyMealsCreate] Context: my_meals_builder');
    console.log('[MyMealsCreate] This is CRITICAL - all add-food actions must respect this context');
    
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

  const handleSave = async () => {
    console.log('[MyMealsCreate] ========== SAVE_MY_MEAL PRESSED ==========');
    
    // Get user first to log it
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id || 'null';
    
    console.log('[MyMealsCreate] SAVE_MY_MEAL pressed userId=' + userId + ' name="' + mealName + '" itemsCount=' + draftItems.length);

    // VALIDATION: Check meal name
    if (!mealName.trim()) {
      console.log('[MyMealsCreate] ❌ VALIDATION FAILED: Meal name is empty');
      Alert.alert('Error', 'Please enter a meal name');
      return;
    }

    // VALIDATION: Check items
    if (draftItems.length === 0) {
      console.log('[MyMealsCreate] ❌ VALIDATION FAILED: No items in meal');
      Alert.alert('Error', 'Please add at least one food item');
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
        Alert.alert('Error', 'You must be logged in to save meals');
        setSaving(false);
        return;
      }

      console.log('[MyMealsCreate] ✅ User found:', user.id);

      // STEP 2: Verify all foods exist in database
      console.log('[MyMealsCreate] STEP 2: Verifying all foods exist in database...');
      const foodIds = draftItems.map(item => item.food_id);
      console.log('[MyMealsCreate] Food IDs to verify:', foodIds);
      
      const { data: existingFoods, error: foodsError } = await supabase
        .from('foods')
        .select('id, name, user_created, created_by')
        .in('id', foodIds);
      
      if (foodsError) {
        console.error('[MyMealsCreate] ❌ Error verifying foods:', foodsError);
        Alert.alert('Error', 'Failed to verify foods in database');
        setSaving(false);
        return;
      }
      
      console.log('[MyMealsCreate] ✅ Found', existingFoods?.length || 0, 'foods in database');
      existingFoods?.forEach((food: any) => {
        console.log('[MyMealsCreate] Food:', {
          id: food.id,
          name: food.name,
          user_created: food.user_created,
          created_by: food.created_by,
        });
      });
      
      // Check if any foods are missing
      const existingFoodIds = new Set(existingFoods?.map((f: any) => f.id) || []);
      const missingFoodIds = foodIds.filter(id => !existingFoodIds.has(id));
      
      if (missingFoodIds.length > 0) {
        console.error('[MyMealsCreate] ❌ Missing foods:', missingFoodIds);
        Alert.alert('Error', `Some foods are missing from the database. Please try adding them again.`);
        setSaving(false);
        return;
      }
      
      console.log('[MyMealsCreate] ✅ All foods verified');

      // STEP 3: Create saved meal
      console.log('[MyMealsCreate] STEP 3: Creating saved meal...');
      console.log('[MyMealsCreate] Inserting into saved_meals table:');
      console.log('[MyMealsCreate]   - user_id:', user.id);
      console.log('[MyMealsCreate]   - name:', mealName.trim());

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
        console.error('[MyMealsCreate] Error code:', mealError.code);
        console.error('[MyMealsCreate] Error message:', mealError.message);
        console.error('[MyMealsCreate] Error details:', mealError.details);
        console.error('[MyMealsCreate] Error hint:', mealError.hint);
        
        // Check for common errors
        if (mealError.code === '42501') {
          Alert.alert('Error', 'Permission denied. RLS policy may be blocking the insert. Please check your database policies.');
        } else if (mealError.code === '23505') {
          Alert.alert('Error', 'A meal with this name already exists.');
        } else {
          Alert.alert('Error', `Failed to save meal: ${mealError.message}`);
        }
        
        setSaving(false);
        return;
      }

      if (!savedMeal) {
        console.error('[MyMealsCreate] ❌ No saved meal returned from insert');
        Alert.alert('Error', 'Failed to save meal (no data returned)');
        setSaving(false);
        return;
      }

      console.log('[MyMealsCreate] ✅ Saved meal created successfully!');
      console.log('[MyMealsCreate] Saved meal ID:', savedMeal.id);
      console.log('[MyMealsCreate] Saved meal name:', savedMeal.name);

      // STEP 4: Create saved meal items
      console.log('[MyMealsCreate] STEP 4: Creating saved meal items...');
      console.log('[MyMealsCreate] Number of items to insert:', draftItems.length);

      const itemsToInsert = draftItems.map((item, index) => {
        console.log(`[MyMealsCreate] ========== ITEM ${index + 1} ==========`);
        console.log('[MyMealsCreate] food_id:', item.food_id);
        console.log('[MyMealsCreate] food_name:', item.food_name);
        console.log('[MyMealsCreate] food_brand:', item.food_brand);
        console.log('[MyMealsCreate] serving_amount:', item.serving_amount);
        console.log('[MyMealsCreate] serving_unit:', item.serving_unit);
        console.log('[MyMealsCreate] servings_count:', item.servings_count);

        return {
          saved_meal_id: savedMeal.id,
          food_id: item.food_id,
          serving_amount: item.serving_amount,
          serving_unit: item.serving_unit,
          servings_count: item.servings_count,
        };
      });

      console.log('[MyMealsCreate] ========== INSERTING ITEMS ==========');
      console.log('[MyMealsCreate] Items to insert:', JSON.stringify(itemsToInsert, null, 2));

      const { data: insertedItems, error: itemsError } = await supabase
        .from(TABLE_SAVED_MEAL_ITEMS)
        .insert(itemsToInsert)
        .select();

      if (itemsError) {
        console.error('[MyMealsCreate] ❌ ERROR CREATING SAVED MEAL ITEMS:', itemsError);
        console.error('[MyMealsCreate] Error code:', itemsError.code);
        console.error('[MyMealsCreate] Error message:', itemsError.message);
        console.error('[MyMealsCreate] Error details:', itemsError.details);
        console.error('[MyMealsCreate] Error hint:', itemsError.hint);
        
        // Rollback: delete the saved meal
        console.log('[MyMealsCreate] Rolling back: deleting saved meal', savedMeal.id);
        await supabase.from(TABLE_SAVED_MEALS).delete().eq('id', savedMeal.id);
        
        Alert.alert('Error', `Failed to save meal items: ${itemsError.message}`);
        setSaving(false);
        return;
      }

      console.log('[MyMealsCreate] ✅ Saved meal items created successfully!');
      console.log('[MyMealsCreate] Inserted items count:', insertedItems?.length || 0);
      
      // DEBUG: Log inserted items
      insertedItems?.forEach((item: any, index: number) => {
        console.log(`[MyMealsCreate] Inserted item ${index + 1}:`, {
          id: item.id,
          saved_meal_id: item.saved_meal_id,
          food_id: item.food_id,
          serving_amount: item.serving_amount,
          serving_unit: item.serving_unit,
          servings_count: item.servings_count,
        });
      });

      // STEP 5: Clear draft
      console.log('[MyMealsCreate] STEP 5: Clearing draft...');
      await clearDraft();
      console.log('[MyMealsCreate] ✅ Draft cleared');

      // STEP 6: Show success and navigate back
      console.log('[MyMealsCreate] ========== SAVE COMPLETE ==========');
      console.log('[MyMealsCreate] Meal saved successfully!');
      console.log('[MyMealsCreate] Meal ID:', savedMeal.id);
      console.log('[MyMealsCreate] Meal name:', savedMeal.name);
      console.log('[MyMealsCreate] Items count:', insertedItems?.length || 0);
      
      Alert.alert('Success', 'Meal saved successfully!', [
        {
          text: 'OK',
          onPress: () => {
            console.log('[MyMealsCreate] Navigating back to My Meals list...');
            router.back();
          },
        },
      ]);
      setSaving(false);
    } catch (error) {
      console.error('[MyMealsCreate] ❌ UNEXPECTED ERROR in handleSave:', error);
      if (error instanceof Error) {
        console.error('[MyMealsCreate] Error name:', error.name);
        console.error('[MyMealsCreate] Error message:', error.message);
        console.error('[MyMealsCreate] Error stack:', error.stack);
      }
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
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
    return (
      <React.Fragment key={item.tempId}>
        <SwipeToDeleteRow onDelete={() => handleRemoveItem(item.tempId)}>
          <View style={[styles.itemCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemName, { color: isDark ? colors.textDark : colors.text }]}>
                {item.food_name}
              </Text>
              {item.food_brand && (
                <Text style={[styles.itemBrand, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  {item.food_brand}
                </Text>
              )}
              <Text style={[styles.itemServing, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {item.servings_count} × {item.serving_amount} {item.serving_unit} • {Math.round(item.calories)} cal
              </Text>
              <Text style={[styles.itemMacros, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                P: {Math.round(item.protein)}g • C: {Math.round(item.carbs)}g • F: {Math.round(item.fats)}g
              </Text>
            </View>
          </View>
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
          Create Meal
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
            Foods ({draftItems.length})
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

        {draftItems.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol
              ios_icon_name="fork.knife"
              android_material_icon_name="restaurant"
              size={48}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
            <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              No foods added yet
            </Text>
            <Text style={[styles.emptySubtext, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Tap "Add Food" to start building your meal
            </Text>
          </View>
        ) : (
          <React.Fragment>
            {draftItems.map((item, index) => renderDraftItem(item, index))}

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
              <Text style={styles.saveButtonText}>Save Meal</Text>
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
