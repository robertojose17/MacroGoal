
import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, Modal, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow';
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
  
  // Edit mode state - always in edit mode now
  const [mealName, setMealName] = useState('');
  const [mealNote, setMealNote] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);

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
        console.error('[MyMealDetails] Error loading items:', itemsError);
        Alert.alert('Error', 'Failed to load meal items');
        return;
      }

      console.log('[MyMealDetails] Loaded', itemsData?.length || 0, 'items');
      
      const normalizedItems = (itemsData || []).map(item => ({
        ...item,
        food: (item as any).foods || item.food,
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
      console.log('[MyMealDetails] ========== SCREEN FOCUSED ==========');
      console.log('[MyMealDetails] Params:', JSON.stringify(params, null, 2));
      
      // PRIORITY 1: Check if we have a new food item from the Add Food flow
      if (params.newFoodItem) {
        try {
          const newItem = JSON.parse(params.newFoodItem as string);
          console.log('[MyMealDetails] ========== ADDING NEW FOOD ITEM ==========');
          console.log('[MyMealDetails] Food:', newItem.food?.name || 'Unknown');
          console.log('[MyMealDetails] Calories:', newItem.calories);
          console.log('[MyMealDetails] Protein:', newItem.protein);
          console.log('[MyMealDetails] Carbs:', newItem.carbs);
          console.log('[MyMealDetails] Fats:', newItem.fats);
          
          // Generate a temporary ID for the item
          const itemWithTempId = {
            ...newItem,
            id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          };
          
          // APPEND to existing items (never overwrite)
          setItems(prev => {
            console.log('[MyMealDetails] Previous items count:', prev.length);
            const updated = [...prev, itemWithTempId];
            console.log('[MyMealDetails] Updated items count:', updated.length);
            console.log('[MyMealDetails] All items:', updated.map(i => ({ name: i.food?.name, calories: i.calories })));
            console.log('[MyMealDetails] ========================================');
            return updated;
          });
          
          // Mark as having unsaved changes
          setHasUnsavedChanges(true);
          
          // Clear the param IMMEDIATELY to prevent re-adding on next focus
          router.setParams({ newFoodItem: undefined });
        } catch (error) {
          console.error('[MyMealDetails] Error parsing new food item:', error);
        }
      } else {
        // PRIORITY 2: Normal load when no new item
        console.log('[MyMealDetails] No new food item, loading meal normally');
        loadMyMeal();
      }
    }, [loadMyMeal, params.newFoodItem, router])
  );

  // AUTO-SAVE when items change (after a new food is added)
  useEffect(() => {
    if (hasUnsavedChanges && !autoSaving && items.length > 0) {
      console.log('[MyMealDetails] ========== AUTO-SAVING CHANGES ==========');
      const autoSave = async () => {
        setAutoSaving(true);
        await handleSaveChanges();
        setAutoSaving(false);
      };
      autoSave();
    }
  }, [items, hasUnsavedChanges, autoSaving]);

  const handleSaveChanges = async () => {
    if (!mealName.trim()) {
      Alert.alert('Error', 'Please enter a meal name');
      return;
    }

    if (items.length === 0) {
      Alert.alert('Error', 'Please add at least one food item');
      return;
    }

    try {
      console.log('[MyMealDetails] ========== SAVING CHANGES ==========');
      console.log('[MyMealDetails] Items to save:', items.length);
      console.log('[MyMealDetails] Items:', items.map(i => ({ name: i.food?.name, calories: i.calories })));

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

      console.log('[MyMealDetails] Calculated totals:', totals);

      // Update meal
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
        console.error('[MyMealDetails] Error updating meal:', updateError);
        Alert.alert('Error', 'Failed to update meal');
        return;
      }

      console.log('[MyMealDetails] ✅ Meal metadata updated');

      // Delete old items
      const { error: deleteError } = await supabase
        .from('my_meal_items')
        .delete()
        .eq('my_meal_id', mealId);

      if (deleteError) {
        console.error('[MyMealDetails] Error deleting old items:', deleteError);
      } else {
        console.log('[MyMealDetails] ✅ Old items deleted');
      }

      // Insert new items (filter out temp IDs)
      const itemsToInsert = items
        .filter(item => item.food_id) // Only insert items with valid food_id
        .map(item => ({
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

      console.log('[MyMealDetails] Items to insert:', itemsToInsert.length);

      if (itemsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('my_meal_items')
          .insert(itemsToInsert);

        if (insertError) {
          console.error('[MyMealDetails] Error inserting items:', insertError);
          Alert.alert('Error', 'Failed to save meal items');
          return;
        }

        console.log('[MyMealDetails] ✅ New items inserted');
      }

      console.log('[MyMealDetails] ✅✅✅ Meal saved successfully ✅✅✅');
      setHasUnsavedChanges(false);
      
      // Update local meal state with new totals
      if (meal) {
        setMeal({
          ...meal,
          name: mealName.trim(),
          note: mealNote.trim() || null,
          total_calories: totals.calories,
          total_protein: totals.protein,
          total_carbs: totals.carbs,
          total_fats: totals.fats,
          total_fiber: totals.fiber,
        });
      }
      
      // Reload to get fresh data with proper IDs
      await loadMyMeal();
    } catch (error) {
      console.error('[MyMealDetails] Error in handleSaveChanges:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      console.log('[MyMealDetails] Deleting item:', itemId);

      // IMMEDIATELY remove from UI for instant feedback
      const itemToDelete = items.find(item => item.id === itemId);
      setItems(prevItems => prevItems.filter(item => item.id !== itemId));
      setHasUnsavedChanges(true);

      // If it's a temp item (not yet saved to DB), just remove from UI
      if (itemId.startsWith('temp-')) {
        console.log('[MyMealDetails] Removed temp item from UI only');
        return;
      }

      const { error } = await supabase
        .from('my_meal_items')
        .delete()
        .eq('id', itemId);

      if (error) {
        console.error('[MyMealDetails] Error deleting item:', error);
        // Restore the item if deletion failed
        if (itemToDelete) {
          setItems(prevItems => [...prevItems, itemToDelete]);
        }
        Alert.alert('Error', 'Failed to delete item');
        return;
      }

      console.log('[MyMealDetails] ✅ Item deleted successfully');
      
      // Recalculate and update meal totals
      const newTotals = items
        .filter(item => item.id !== itemId)
        .reduce(
          (acc, item) => ({
            calories: acc.calories + item.calories,
            protein: acc.protein + item.protein,
            carbs: acc.carbs + item.carbs,
            fats: acc.fats + item.fats,
            fiber: acc.fiber + item.fiber,
          }),
          { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
        );

      // Update meal totals in database
      await supabase
        .from('my_meals')
        .update({
          total_calories: newTotals.calories,
          total_protein: newTotals.protein,
          total_carbs: newTotals.carbs,
          total_fats: newTotals.fats,
          total_fiber: newTotals.fiber,
          updated_at: new Date().toISOString(),
        })
        .eq('id', mealId);

      // Update local meal state
      if (meal) {
        setMeal({
          ...meal,
          total_calories: newTotals.calories,
          total_protein: newTotals.protein,
          total_carbs: newTotals.carbs,
          total_fats: newTotals.fats,
          total_fiber: newTotals.fiber,
        });
      }
    } catch (error) {
      console.error('[MyMealDetails] Error in handleDeleteItem:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  const handleAddFood = () => {
    console.log('[MyMealDetails] ========== OPENING ADD FOOD ==========');
    console.log('[MyMealDetails] Current items count:', items.length);
    console.log('[MyMealDetails] Passing params:');
    console.log('[MyMealDetails]   - mode: mymeal');
    console.log('[MyMealDetails]   - context: my_meal_details');
    console.log('[MyMealDetails]   - mealId:', mealId);
    console.log('[MyMealDetails]   - returnTo: /my-meal-details');
    
    router.push({
      pathname: '/add-food',
      params: {
        mode: 'mymeal',
        context: 'my_meal_details',
        mealId: mealId,
        returnTo: '/my-meal-details',
      },
    });
  };

  const handleAddToDiary = () => {
    // Save changes first if there are any
    if (hasUnsavedChanges) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Save them before adding to diary?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Save & Continue',
            onPress: async () => {
              await handleSaveChanges();
              setShowMealTypeModal(true);
            },
          },
        ]
      );
    } else {
      console.log('[MyMealDetails] Opening meal type selector');
      setShowMealTypeModal(true);
    }
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
      const itemsToInsert = items
        .filter(item => item.food_id) // Only insert items with valid food_id
        .map(item => ({
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

      if (itemsToInsert.length === 0) {
        Alert.alert('Error', 'No valid items to add to diary');
        return;
      }

      const { error: insertError } = await supabase
        .from('meal_items')
        .insert(itemsToInsert);

      if (insertError) {
        console.error('[MyMealDetails] Error inserting items:', insertError);
        Alert.alert('Error', 'Failed to add items to diary');
        return;
      }

      console.log('[MyMealDetails] ✅ Items added to diary successfully');
      Alert.alert('Success', `Added ${itemsToInsert.length} items to ${mealType}`, [
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

  // Calculate current totals from items (for real-time display)
  const currentTotals = items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fats: acc.fats + item.fats,
      fiber: acc.fiber + item.fiber,
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
  );

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
        {hasUnsavedChanges && (
          <TouchableOpacity onPress={handleSaveChanges} style={styles.saveButton}>
            <Text style={[styles.saveButtonText, { color: colors.primary }]}>
              Save
            </Text>
          </TouchableOpacity>
        )}
        {!hasUnsavedChanges && <View style={{ width: 50 }} />}
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Editable Meal Name and Note */}
        <View style={[styles.editCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <Text style={[styles.inputLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Meal Name
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
            placeholder="Enter meal name"
            placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
            value={mealName}
            onChangeText={(text) => {
              setMealName(text);
              setHasUnsavedChanges(true);
            }}
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
            placeholder="Add any notes..."
            placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
            value={mealNote}
            onChangeText={(text) => {
              setMealNote(text);
              setHasUnsavedChanges(true);
            }}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Macros Summary */}
        <View style={[styles.macrosCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <View style={styles.macrosSummary}>
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.calories }]}>
                {Math.round(currentTotals.calories)}
              </Text>
              <Text style={[styles.macroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Calories
              </Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.protein }]}>
                {Math.round(currentTotals.protein)}g
              </Text>
              <Text style={[styles.macroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Protein
              </Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.carbs }]}>
                {Math.round(currentTotals.carbs)}g
              </Text>
              <Text style={[styles.macroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Carbs
              </Text>
            </View>
            <View style={styles.macroItem}>
              <Text style={[styles.macroValue, { color: colors.fats }]}>
                {Math.round(currentTotals.fats)}g
              </Text>
              <Text style={[styles.macroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Fats
              </Text>
            </View>
          </View>
        </View>

        {/* Add to Diary Button - MOVED HERE: Below macros, above Foods */}
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

        {/* Foods Section */}
        <View style={styles.itemsSection}>
          <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Foods ({items.length})
          </Text>

          {items.map((item, index) => (
            <SwipeToDeleteRow
              key={item.id || `item-${index}`}
              onDelete={() => handleDeleteItem(item.id)}
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
            </SwipeToDeleteRow>
          ))}

          {/* Add Food Button */}
          <TouchableOpacity
            style={[styles.addFoodButton, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: colors.primary }]}
            onPress={handleAddFood}
            activeOpacity={0.7}
          >
            <IconSymbol
              ios_icon_name="plus.circle"
              android_material_icon_name="add_circle_outline"
              size={24}
              color={colors.primary}
            />
            <Text style={[styles.addFoodButtonText, { color: colors.primary }]}>
              Add Food
            </Text>
          </TouchableOpacity>
        </View>

        {/* Info message about deleting */}
        <View style={[styles.infoCard, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: colors.info }]}>
          <IconSymbol
            ios_icon_name="info.circle"
            android_material_icon_name="info"
            size={20}
            color={colors.info}
          />
          <Text style={[styles.infoText, { color: isDark ? colors.textDark : colors.text }]}>
            Swipe left on any food item to remove it from this meal
          </Text>
        </View>

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
  editCard: {
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
  macrosCard: {
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  macrosSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
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
  addToDiaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.12)',
    elevation: 3,
  },
  addToDiaryButtonText: {
    ...typography.bodyBold,
    fontSize: 16,
    color: '#FFFFFF',
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
    marginBottom: spacing.xs,
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
  addFoodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 2,
  },
  addFoodButtonText: {
    ...typography.bodyBold,
    fontSize: 16,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  infoText: {
    ...typography.caption,
    flex: 1,
    fontSize: 13,
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
