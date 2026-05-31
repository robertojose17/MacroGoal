
import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing } from '@/styles/commonStyles';
import { supabase } from '@/lib/supabase/client';
import ProgressCard from '@/components/ProgressCard';

export default function ProgressDetailScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    console.log('[ProgressDetailScreen] Mounted — fetching user');
    supabase.auth.getUser().then(({ data: { user } }) => {
      console.log('[ProgressDetailScreen] User loaded:', user?.id ?? 'none');
      setUserId(user?.id ?? null);
    });
  }, []);

  const bg = isDark ? colors.backgroundDark : colors.background;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Weight Progress',
          headerShown: true,
          headerBackButtonDisplayMode: 'minimal',
          headerStyle: { backgroundColor: bg },
          headerTitleStyle: { color: isDark ? colors.textDark : colors.text, fontWeight: '700' },
          headerTintColor: isDark ? colors.textDark : colors.text,
        }}
      />
      <SafeAreaView edges={['bottom']} style={[styles.safe, { backgroundColor: bg }]}>
        {userId ? (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <ProgressCard userId={userId} isDark={isDark} />
          </ScrollView>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
