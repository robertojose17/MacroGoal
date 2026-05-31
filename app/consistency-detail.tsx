
import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { supabase } from '@/lib/supabase/client';
import ConsistencyScore from '@/components/ConsistencyScore';

export default function ConsistencyDetailScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    console.log('[ConsistencyDetailScreen] Mounted — fetching user');
    supabase.auth.getUser().then(({ data: { user } }) => {
      console.log('[ConsistencyDetailScreen] User loaded:', user?.id ?? 'none');
      setUserId(user?.id ?? null);
    });
  }, []);

  const bg = isDark ? colors.backgroundDark : colors.background;
  const cardBg = isDark ? colors.cardDark : colors.card;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Consistency Score',
          headerShown: true,
          headerBackButtonDisplayMode: 'minimal',
          headerStyle: { backgroundColor: bg },
          headerTitleStyle: { color: isDark ? colors.textDark : colors.text, fontWeight: '700' },
          headerTintColor: isDark ? colors.textDark : colors.text,
        }}
      />
      <SafeAreaView edges={['bottom']} style={[styles.safe, { backgroundColor: bg }]}>
        {userId ? (
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Hero card wrapper */}
            <View
              style={[
                styles.heroCard,
                {
                  backgroundColor: cardBg,
                  borderColor: isDark ? colors.cardBorderDark : colors.cardBorder,
                  ...Platform.select({
                    ios: {
                      shadowColor: '#000',
                      shadowOpacity: 0.06,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 4 },
                    },
                    android: { elevation: 2 },
                  }),
                },
              ]}
            >
              <ConsistencyScore userId={userId} isDark={isDark} initialExpanded={true} />
            </View>
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
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xxl,
  },
  heroCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    overflow: 'hidden',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
