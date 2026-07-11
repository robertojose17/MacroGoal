
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import FoodDetailsLayout from '@/components/FoodDetailsLayout';

export default function EditSavedMealItemScreen() {
  const params = useLocalSearchParams();
  const itemId = params.itemId as string;

  console.log('[EditSavedMealItem] Opened with itemId:', itemId);

  return (
    <FoodDetailsLayout
      mode="edit"
      itemId={itemId}
      itemTable="saved_meal_items"
    />
  );
}
