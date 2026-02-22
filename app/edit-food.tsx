
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import FoodDetailsLayout from '@/components/FoodDetailsLayout';

export default function EditFoodScreen() {
  const params = useLocalSearchParams();
  const itemId = params.itemId as string;

  return (
    <FoodDetailsLayout
      mode="edit"
      itemId={itemId}
    />
  );
}
