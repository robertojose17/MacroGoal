
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import FoodDetailsLayout from '@/components/FoodDetailsLayout';

export default function FoodDetailsScreen() {
  const params = useLocalSearchParams();

  const mode = (params.mode as string) || 'diary';
  const context = (params.context as string) || undefined;
  const mealType = (params.meal as string) || 'breakfast';
  const date = (params.date as string) || new Date().toISOString().split('T')[0];
  const offDataString = params.offData as string;
  const returnTo = (params.returnTo as string) || undefined;

  return (
    <FoodDetailsLayout
      mode="view"
      offData={offDataString}
      mealType={mealType}
      date={date}
      context={context}
      returnTo={returnTo}
    />
  );
}
