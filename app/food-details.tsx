
import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';
import FoodDetailsLayout from '@/components/FoodDetailsLayout';
import { toLocalDateString } from '@/utils/dateUtils';
import { addMealPlanItem } from '@/utils/mealPlansApi';
import type { FoodLogSource } from '@/utils/logFoodUsage';
import { supabase, TABLE_SAVED_MEAL_ITEMS } from '@/lib/supabase/client';

export default function FoodDetailsScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();

  const rawMode = params.mode as string;
  const layoutMode = rawMode === 'edit' ? 'edit' : rawMode === 'ingredient' ? 'ingredient' : 'view';
  const isMealPlanMode = rawMode === 'meal-plan';
  const context = (params.context as string) || undefined;
  const mealType = (params.meal as string) || 'breakfast';
  const date = (params.date as string) || toLocalDateString();
  const offDataString = params.offData as string;
  const returnTo = (params.returnTo as string) || undefined;
  const itemId = (params.itemId as string) || undefined;
  const planId = (params.planId as string) || undefined;
  const mealId = (params.mealId as string) || undefined;
  const savedMealEdit = (params.savedMealEdit as string) || undefined;
  const source = (params.source as FoodLogSource) || 'search';

  console.log('[FoodDetails] Screen mounted, layoutMode:', layoutMode, 'isMealPlanMode:', isMealPlanMode, 'mealType:', mealType, 'date:', date, 'context:', context, 'planId:', planId, 'mealId:', mealId, 'savedMealEdit:', savedMealEdit, 'source:', source);

  // savedMealEdit mode: insert directly into saved_meal_items instead of logging to diary
  const isSavedMealEditMode = savedMealEdit === 'true' && returnTo === 'my-meals-details' && !!mealId;

  if (isSavedMealEditMode) {
    const handleSavedMealEditSave = async (foodData: {
      food_name: string;
      brand?: string;
      quantity: number;
      grams?: number;
      serving_description?: string;
      calories: number;
      protein: number;
      carbs: number;
      fats: number;
      fiber?: number;
      food_item_id?: string | null;
      food_id?: string | null;
      serving_amount?: number;
    }) => {
      console.log('[FoodDetails] savedMealEdit mode save, mealId:', mealId, 'food:', foodData.food_name);
      console.log('[FoodDetails] Inserting into saved_meal_items:', JSON.stringify(foodData));

      try {
        const servingsCount = foodData.quantity || 1;
        const totalGrams = foodData.grams ?? 100;
        const servingAmount = servingsCount > 0 ? totalGrams / servingsCount : totalGrams;

        const { error } = await supabase
          .from(TABLE_SAVED_MEAL_ITEMS)
          .insert({
            saved_meal_id: mealId,
            food_item_id: foodData.food_item_id ?? null,
            food_id: foodData.food_id ?? null,
            food_name: foodData.food_name || '',
            food_brand: foodData.brand || '',
            serving_amount: servingAmount,
            serving_unit: 'g',
            servings_count: servingsCount,
            calories: foodData.calories,
            protein: foodData.protein,
            carbs: foodData.carbs,
            fat: foodData.fats,
            fiber: foodData.fiber ?? 0,
          });

        if (error) {
          console.error('[FoodDetails] savedMealEdit insert error:', error);
          Alert.alert('Error', 'Failed to add food to saved meal. Please try again.');
          return;
        }

        console.log('[FoodDetails] savedMealEdit: food inserted successfully into saved_meal_items, navigating back to my-meals-details, mealId:', mealId);
        router.back();
      } catch (err: any) {
        console.error('[FoodDetails] savedMealEdit unexpected error:', err);
        Alert.alert('Error', 'Failed to add food to saved meal. Please try again.');
      }
    };

    return (
      <FoodDetailsLayout
        mode="view"
        offData={offDataString}
        mealType={mealType}
        date={date}
        context={context}
        returnTo={returnTo}
        itemId={itemId}
        source={source}
        onMealPlanSave={handleSavedMealEditSave}
      />
    );
  }

  if (isMealPlanMode && planId) {
    // Meal-plan mode: intercept save to POST to meal plan items API
    const handleMealPlanSave = async (foodData: {
      food_name: string;
      brand?: string;
      quantity: number;
      grams?: number;
      serving_description?: string;
      calories: number;
      protein: number;
      carbs: number;
      fats: number;
      fiber?: number;
    }) => {
      console.log('[FoodDetails] Meal plan mode save, planId:', planId, 'date:', date, 'meal:', mealType);
      console.log('[FoodDetails] POST /api/meal-plans/:id/items body:', JSON.stringify(foodData));

      try {
        const body = {
          date,
          meal_type: mealType,
          ...foodData,
        };

        const newItem = await addMealPlanItem(planId, body);
        console.log('[FoodDetails] Food added to meal plan successfully:', newItem.id);
        Alert.alert('Added to meal plan', '', [
          {
            text: 'OK',
            onPress: () => {
              console.log('[FoodDetails] Navigating back to meal plan detail');
              router.dismiss();
              router.dismiss();
            },
          },
        ]);
      } catch (err: any) {
        console.error('[FoodDetails] Error adding to meal plan:', err);
        Alert.alert('Error', 'Failed to add food to meal plan. Please try again.');
      }
    };

    return (
      <FoodDetailsLayout
        mode="view"
        offData={offDataString}
        mealType={mealType}
        date={date}
        context={context}
        returnTo={returnTo}
        itemId={itemId}
        planId={planId}
        source={source}
        onMealPlanSave={handleMealPlanSave}
      />
    );
  }

  return (
    <FoodDetailsLayout
      mode={layoutMode}
      offData={offDataString}
      mealType={mealType}
      date={date}
      context={context}
      returnTo={returnTo}
      itemId={itemId}
      source={source}
    />
  );
}
