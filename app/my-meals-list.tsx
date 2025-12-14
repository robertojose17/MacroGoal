
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow';
import { supabase } from '@/app/integrations/supabase/client';
import { MyMeal } from '@/types';

export default function MyMealsListScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [myMeals, setMyMeals] = useState<MyMeal[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      console.log('[MyMealsList] Screen focused, loading meals');
      loadMyMeals();
    }, [])
  );

  const loadMyMeals = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[MyMealsList] No user found');
        setLoading(false);
        return;
      }

      console.log('[MyMealsList] Loading My Meals for user:', user.id);

      const { data: mealsData, error } = await supabase
        .from('my_meals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[MyMealsList] Error loading My Meals:', error);
        Alert.alert('Error', 'Failed to load My Meals');
      } else {
        console.log('[MyMealsList] Loaded', mealsData?.length || 0, 'My Meals');
        setMyMeals(mealsData || []);
      }
    } catch (error) {
      console.error('[MyMealsList] Error in loadMyMeals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMyMeal = () => {
    console.log('[MyMealsList] Navigating to create My Meal');
    router.push('/my-meal-builder');
  };

  const handleOpenMyMeal = (meal: MyMeal) => {
    console.log('[MyMealsList] Opening My Meal details:', meal.id);
    router.push({
      pathname: '/my-meal-details',
      params: {
        mealId: meal.id,
      },
    });
  };

  const handleDeleteMyMeal = async (meal: MyMeal) => {
    try {
      console.log('[MyMealsList] Deleting My Meal:', meal.id);

      // IMMEDIATELY remove from UI for instant feedback
      setMyMeals(prevMeals => prevMeals.filter(m => m.id !== meal.id));

      // Delete meal items first (foreign key constraint)
      const { error: itemsError } = await supabase
        .from('my_meal_items')
        .delete()
        .eq('my_meal_id', meal.id);

      if (itemsError) {
        console.error('[MyMealsList] Error deleting meal items:', itemsError);
        // Restore the meal if deletion failed
        setMyMeals(prevMeals => [...prevMeals, meal].sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ));
        Alert.alert('Error', 'Failed to delete meal items');
        return;
      }

      // Delete the meal
      const { error: mealError } = await supabase
        .from('my_meals')
        .delete()
        .eq('id', meal.id);

      if (mealError) {
        console.error('[MyMealsList] Error deleting meal:', mealError);
        // Restore the meal if deletion failed
        setMyMeals(prevMeals => [...prevMeals, meal].sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ));
        Alert.alert('Error', 'Failed to delete meal');
        return;
      }

      console.log('[MyMealsList] ✅ My Meal deleted successfully');
    } catch (error) {
      console.error('[MyMealsList] Error in handleDeleteMyMeal:', error);
      // Restore the meal if an unexpected error occurred
      setMyMeals(prevMeals => [...prevMeals, meal].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
      Alert.alert('Error', 'An error occurred while deleting');
    }
  };

  const renderMyMealCard = (meal: MyMeal, index: number) => {
    return (
      <SwipeToDeleteRow
        key={meal.id || `meal-${index}`}
        onDelete={() => handleDeleteMyMeal(meal)}
      >
        <TouchableOpacity
          style={[
            styles.mealCard,
            { backgroundColor: isDark ? colors.cardDark : colors.card }
          ]}
          onPress={() => handleOpenMyMeal(meal)}
          activeOpacity={0.7}
        >
          <View style={styles.mealInfo}>
            <Text style={[styles.mealName, { color: isDark ? colors.textDark : colors.text }]}>
              {meal.name}
            </Text>
            {meal.note && (
              <Text style={[styles.mealNote, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {meal.note}
              </Text>
            )}
            <View style={styles.mealStats}>
              <Text style={[styles.mealCalories, { color: colors.calories }]}>
                {Math.round(meal.total_calories)} cal
              </Text>
              <Text style={[styles.mealMacros, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                P: {Math.round(meal.total_protein)}g • C: {Math.round(meal.total_carbs)}g • F: {Math.round(meal.total_fats)}g
              </Text>
            </View>
          </View>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron_right"
            size={20}
            color={isDark ? colors.textSecondaryDark : colors.textSecondary}
          />
        </TouchableOpacity>
      </SwipeToDeleteRow>
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
          My Meals
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: colors.primary }]}
          onPress={handleCreateMyMeal}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add_circle"
            size={24}
            color="#FFFFFF"
          />
          <Text style={styles.createButtonText}>Create My Meal</Text>
        </TouchableOpacity>

        {loading ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Loading...
            </Text>
          </View>
        ) : myMeals.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol
              ios_icon_name="fork.knife"
              android_material_icon_name="restaurant"
              size={64}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
            <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.md }]}>
              No saved meals yet
            </Text>
            <Text style={[styles.emptySubtext, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.xs }]}>
              Create a meal template to quickly log your favorite meals
            </Text>
          </View>
        ) : (
          myMeals.map((meal, index) => renderMyMealCard(meal, index))
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  createButtonText: {
    ...typography.bodyBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  mealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  mealInfo: {
    flex: 1,
  },
  mealName: {
    ...typography.bodyBold,
    fontSize: 16,
    marginBottom: 4,
  },
  mealNote: {
    ...typography.caption,
    fontSize: 13,
    marginBottom: 6,
  },
  mealStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mealCalories: {
    ...typography.bodyBold,
    fontSize: 14,
  },
  mealMacros: {
    ...typography.caption,
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyText: {
    ...typography.body,
    fontSize: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    ...typography.caption,
    fontSize: 14,
    textAlign: 'center',
  },
});
