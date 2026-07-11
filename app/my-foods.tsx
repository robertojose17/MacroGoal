
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow';
import { toLocalDateString } from '@/utils/dateUtils';

interface MyFood {
  id: string;
  name: string;
  brand?: string;
  serving_amount: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  created_at: string;
}

export default function MyFoodsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const mealType = (params.meal as string) || 'breakfast';
  const date = (params.date as string) || toLocalDateString();
  const context = params.context as string | undefined;
  const returnTo = params.returnTo as string | undefined;
  const mode = (params.mode as string) || '';
  const planId = (params.planId as string) || '';

  const [myFoods, setMyFoods] = useState<MyFood[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMyFoods = useCallback(async () => {
    console.log('[MyFoods] ========== LOADING MY FOODS ==========');
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[MyFoods] No user found');
        setLoading(false);
        return;
      }

      console.log('[MyFoods] Fetching user-created foods for user:', user.id);

      const { data: foods, error } = await supabase
        .from('foods')
        .select('*')
        .eq('user_created', true)
        .or(`created_by.eq.${user.id},created_by.is.null`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[MyFoods] Error loading foods:', error);
        Alert.alert('Error', 'Failed to load your foods');
        setLoading(false);
        return;
      }

      console.log('[MyFoods] ✅ Loaded', foods?.length || 0, 'custom foods');
      setMyFoods(foods || []);
      setLoading(false);
    } catch (error) {
      console.error('[MyFoods] Error in loadMyFoods:', error);
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      console.log('[MyFoods] Screen focused, loading foods');
      loadMyFoods();
    }, [loadMyFoods])
  );

  const handleCreateFood = useCallback(() => {
    console.log('[MyFoods] Navigating to create food');
    console.log('[MyFoods] mode:', mode, 'planId:', planId);
    router.push({
      pathname: '/my-foods-create',
      params: {
        meal: mealType,
        date: date,
        context: context || '',
        returnTo: returnTo,
        mode: mode || '',
        planId: planId || '',
      },
    });
  }, [router, mealType, date, context, returnTo, mode, planId]);

  const handleSelectFood = useCallback((food: MyFood) => {
    console.log('[MyFoods] Selected food:', food.name, 'id:', food.id);
    console.log('[MyFoods] mode:', mode, 'planId:', planId);

    // Foods DB stores macros per-serving. Scale to per-100g so FoodDetailsLayout
    // (which reads nutriments['energy-kcal_100g'] and divides by 100) calculates correctly.
    const servingAmount = food.serving_amount > 0 ? food.serving_amount : 100;
    const scale = 100 / servingAmount;

    const offProduct = {
      code: '',
      product_name: food.name,
      brands: food.brand || '',
      serving_size: `${servingAmount} ${food.serving_unit || 'g'}`,
      serving_quantity: servingAmount,
      nutriments: {
        'energy-kcal_100g': (food.calories || 0) * scale,
        'proteins_100g': (food.protein || 0) * scale,
        'carbohydrates_100g': (food.carbs || 0) * scale,
        'fat_100g': (food.fats || 0) * scale,
        'fiber_100g': (food.fiber || 0) * scale,
        'sugars_100g': 0,
      },
    };

    router.push({
      pathname: '/food-details',
      params: {
        offData: JSON.stringify(offProduct),
        meal: mealType,
        date: date,
        context: context || '',
        returnTo: returnTo || '/(tabs)/(home)/',
        mode: mode || '',
        planId: planId || '',
      },
    });
  }, [router, mealType, date, context, returnTo, mode, planId]);

  const handleEditFood = useCallback((food: MyFood) => {
    console.log('[MyFoods] Editing food:', food.name);
    router.push({
      pathname: '/my-foods-edit',
      params: {
        foodId: food.id,
        meal: mealType,
        date: date,
        context: context || '',
        returnTo: returnTo,
        mode: mode || '',
        planId: planId || '',
      },
    });
  }, [router, mealType, date, context, returnTo, mode, planId]);

  const handleDeleteFood = useCallback(async (foodId: string) => {
    console.log('[MyFoods] Deleting food:', foodId);

    // Optimistic update
    const previousFoods = [...myFoods];
    setMyFoods(myFoods.filter(f => f.id !== foodId));

    try {
      const { error } = await supabase
        .from('foods')
        .delete()
        .eq('id', foodId);

      if (error) {
        console.error('[MyFoods] Error deleting food:', error);
        setMyFoods(previousFoods);
        Alert.alert('Error', 'Failed to delete food');
      } else {
        console.log('[MyFoods] ✅ Food deleted successfully');
      }
    } catch (error) {
      console.error('[MyFoods] Error in handleDeleteFood:', error);
      setMyFoods(previousFoods);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  }, [myFoods]);

  const renderFoodItem = useCallback((food: MyFood, index: number) => {
    const servingText = `${Math.round(food.serving_amount)} ${food.serving_unit}`;
    const macrosText = `P: ${Math.round(food.protein)}g • C: ${Math.round(food.carbs)}g • F: ${Math.round(food.fats)}g`;

    return (
      <React.Fragment key={food.id}>
        <SwipeToDeleteRow onDelete={() => handleDeleteFood(food.id)}>
          <TouchableOpacity
            style={[styles.foodCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
            onPress={() => handleSelectFood(food)}
            onLongPress={() => handleEditFood(food)}
            activeOpacity={0.7}
          >
            <View style={styles.foodInfo}>
              <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text }]}>
                {food.name}
              </Text>
              <Text style={[styles.foodServing, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {food.brand ? `${food.brand} • ` : ''}{servingText} • {Math.round(food.calories)} cal
              </Text>
              <Text style={[styles.foodMacros, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {macrosText}
              </Text>
            </View>
            <View style={styles.actionsContainer}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={(e) => {
                  e.stopPropagation();
                  handleEditFood(food);
                }}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name="pencil"
                  android_material_icon_name="edit"
                  size={20}
                  color={isDark ? colors.textDark : colors.text}
                />
              </TouchableOpacity>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron_right"
                size={20}
                color={isDark ? colors.textSecondaryDark : colors.textSecondary}
              />
            </View>
          </TouchableOpacity>
        </SwipeToDeleteRow>
      </React.Fragment>
    );
  }, [isDark, handleSelectFood, handleEditFood, handleDeleteFood]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
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
          My Foods
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <TouchableOpacity
        style={[styles.createButton, { backgroundColor: colors.primary }]}
        onPress={handleCreateFood}
        activeOpacity={0.7}
      >
        <IconSymbol
          ios_icon_name="plus"
          android_material_icon_name="add"
          size={20}
          color="#FFFFFF"
        />
        <Text style={styles.createButtonText}>Create New Food</Text>
      </TouchableOpacity>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
          Your Custom Foods
        </Text>

        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.md }]}>
              Loading your foods...
            </Text>
          </View>
        ) : myFoods.length > 0 ? (
          myFoods.map((food, index) => renderFoodItem(food, index))
        ) : (
          <View style={styles.emptyState}>
            <IconSymbol
              ios_icon_name="fork.knife"
              android_material_icon_name="restaurant"
              size={48}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
            <Text style={[styles.emptyText, { color: isDark ? colors.textDark : colors.text, marginTop: spacing.md }]}>
              No custom foods yet
            </Text>
            <Text style={[styles.emptySubtext, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.xs }]}>
              Create your first custom food to reuse it anytime
            </Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
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
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  createButtonText: {
    ...typography.bodyBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
  },
  sectionLabel: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  foodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
    elevation: 1,
    overflow: 'hidden',
    padding: spacing.md,
  },
  foodInfo: {
    flex: 1,
  },
  foodName: {
    ...typography.bodyBold,
    fontSize: 16,
    marginBottom: 2,
  },
  foodServing: {
    ...typography.caption,
    fontSize: 13,
    marginBottom: 2,
  },
  foodMacros: {
    ...typography.caption,
    fontSize: 12,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editButton: {
    padding: spacing.xs,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    ...typography.body,
    fontSize: 15,
    textAlign: 'center',
  },
  emptySubtext: {
    ...typography.caption,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
