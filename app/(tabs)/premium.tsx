import React from 'react';
import { View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

export default function PremiumTab() {
  const router = useRouter();

  useFocusEffect(
    React.useCallback(() => {
      console.log('[Premium Tab] Focused — navigating to /subscription');
      router.push('/subscription');
    }, [router])
  );

  return <View />;
}
