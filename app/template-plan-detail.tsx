
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { getTemplatePlanDetail, type TemplatePlanDetail, type TemplateItem, type TemplateDay } from '@/utils/templatePlansApi';

const GOLD = '#F59E0B';

type MealKey = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MEAL_DEFS: { key: MealKey; label: string; emoji: string }[] = [
  { key: 'breakfast', label: 'Breakfast', emoji: '🌅' },
  { key: 'lunch', label: 'Lunch', emoji: '☀️' },
  { key: 'dinner', label: 'Dinner', emoji: '🌙' },
  { key: 'snack', label: 'Snack', emoji: '🍎' },
];

export default function TemplatePlanDetailScreen() {
  const router = useRouter();
  const { templateId } = useLocalSearchParams<{ templateId: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [plan, setPlan] = useState<TemplatePlanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(1);

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const borderColor = isDark ? colors.borderDark : colors.border;
  const cardBorderColor = isDark ? colors.cardBorderDark : colors.cardBorder;

  const loadPlan = useCallback(async () => {
    if (!templateId) return;
    console.log('[TemplatePlanDetail] Loading template plan:', templateId);
    try {
      const data = await getTemplatePlanDetail(templateId);
      console.log('[TemplatePlanDetail] Plan loaded:', data.name, 'days:', data.days?.length ?? 0);
      setPlan(data);
      setSelectedDay(1);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[TemplatePlanDetail] Error loading plan:', msg);
      setError('Failed to load plan. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [templateId]);

  useFocusEffect(
    useCallback(() => {
      console.log('[TemplatePlanDetail] Screen focused');
      setLoading(true);
      loadPlan();
    }, [loadPlan])
  );

  const onRefresh = () => {
    console.log('[TemplatePlanDetail] Pull-to-refresh triggered');
    setRefreshing(true);
    loadPlan();
  };

  const handleBack = () => {
    console.log('[TemplatePlanDetail] Back button pressed');
    router.back();
  };

  const handleDayPress = (dayNum: number) => {
    console.log('[TemplatePlanDetail] Day pill pressed:', dayNum);
    setSelectedDay(dayNum);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: textColor }]}>Plan Details</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !plan) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: textColor }]}>Plan Details</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: textColor }]}>{error ?? 'Plan not found.'}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              console.log('[TemplatePlanDetail] Retry button pressed');
              setLoading(true);
              loadPlan();
            }}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const currentDayData: TemplateDay | undefined = plan.days.find(d => d.day_number === selectedDay);
  const totalDays = plan.days.length || 7;

  const goalLabel = plan.goal_type === 'cut' ? 'Cut' : plan.goal_type === 'bulk' ? 'Bulk' : 'Maintain';
  const caloriesGoal = plan.user_calories_goal;
  const proteinGoal = plan.user_protein_goal;
  const carbsGoal = plan.user_carbs_goal;
  const fatsGoal = plan.user_fats_goal;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEmoji}>{plan.emoji}</Text>
          <Text style={[styles.headerTitle, { color: textColor }]} numberOfLines={1}>
            {plan.name}
          </Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Goal badge */}
        <View style={styles.goalBadgeRow}>
          <View style={styles.goalBadge}>
            <Text style={styles.goalBadgeText}>{goalLabel}</Text>
          </View>
          <Text style={[styles.templateLabel, { color: GOLD }]}>{'✦ Template Plan'}</Text>
        </View>

        {/* Summary card */}
        <View style={[styles.summaryCard, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>
          <View style={styles.summaryCardHeader}>
            <Text style={[styles.summaryCardTitle, { color: textColor }]}>Adjusted to your goals</Text>
            <Text style={[styles.summaryCardSubtitle, { color: secondaryColor }]}>
              {'Scaled to your '}
              <Text style={{ fontWeight: '700', color: colors.calories }}>{caloriesGoal}</Text>
              {' kcal goal'}
            </Text>
          </View>
          <View style={styles.macroPills}>
            <View style={[styles.macroPill, { backgroundColor: colors.calories + '22' }]}>
              <Text style={[styles.macroPillValue, { color: colors.calories }]}>{caloriesGoal}</Text>
              <Text style={[styles.macroPillUnit, { color: colors.calories }]}>kcal</Text>
            </View>
            <View style={[styles.macroPill, { backgroundColor: colors.protein + '22' }]}>
              <Text style={[styles.macroPillValue, { color: colors.protein }]}>{proteinGoal}</Text>
              <Text style={[styles.macroPillUnit, { color: colors.protein }]}>P</Text>
            </View>
            <View style={[styles.macroPill, { backgroundColor: colors.carbs + '22' }]}>
              <Text style={[styles.macroPillValue, { color: colors.carbs }]}>{carbsGoal}</Text>
              <Text style={[styles.macroPillUnit, { color: colors.carbs }]}>C</Text>
            </View>
            <View style={[styles.macroPill, { backgroundColor: colors.fats + '22' }]}>
              <Text style={[styles.macroPillValue, { color: colors.fats }]}>{fatsGoal}</Text>
              <Text style={[styles.macroPillUnit, { color: colors.fats }]}>F</Text>
            </View>
          </View>
        </View>

        {/* Day selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.daySelectorContent}
          style={styles.daySelectorScroll}
        >
          {Array.from({ length: totalDays }, (_, i) => i + 1).map((dayNum) => {
            const isSelected = dayNum === selectedDay;
            return (
              <TouchableOpacity
                key={dayNum}
                style={[
                  styles.dayPill,
                  isSelected
                    ? { backgroundColor: colors.primary, borderColor: colors.primary }
                    : { backgroundColor: cardBg, borderColor: isDark ? colors.borderDark : colors.border },
                ]}
                onPress={() => handleDayPress(dayNum)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.dayPillText,
                  { color: isSelected ? '#fff' : textColor },
                ]}>
                  {'Day '}
                  {dayNum}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Meal sections */}
        {MEAL_DEFS.map((mealDef, mealIdx) => {
          const items: TemplateItem[] = currentDayData?.meals?.[mealDef.key] ?? [];
          const isLast = mealIdx === MEAL_DEFS.length - 1;

          const mealCalories = Math.round(items.reduce((s, i) => s + (Number(i.scaled_calories) || 0), 0));
          const mealProtein = Math.round(items.reduce((s, i) => s + (Number(i.scaled_protein) || 0), 0));
          const mealCarbs = Math.round(items.reduce((s, i) => s + (Number(i.scaled_carbs) || 0), 0));
          const mealFats = Math.round(items.reduce((s, i) => s + (Number(i.scaled_fats) || 0), 0));

          return (
            <View
              key={mealDef.key}
              style={[
                styles.mealCard,
                { backgroundColor: cardBg, borderColor: cardBorderColor },
                !isLast && styles.mealCardSpacing,
              ]}
            >
              {/* Meal header */}
              <View style={styles.mealHeader}>
                <View style={styles.mealHeaderLeft}>
                  <Text style={styles.mealEmoji}>{mealDef.emoji}</Text>
                  <Text style={[styles.mealTitle, { color: textColor }]}>{mealDef.label}</Text>
                </View>
              </View>

              {/* Meal macro summary */}
              {items.length > 0 && (
                <View style={styles.mealMacroRow}>
                  <View style={[styles.macroPill, { backgroundColor: colors.calories + '22' }]}>
                    <Text style={[styles.macroPillValue, { color: colors.calories }]}>{mealCalories}</Text>
                    <Text style={[styles.macroPillUnit, { color: colors.calories }]}>kcal</Text>
                  </View>
                  <View style={[styles.macroPill, { backgroundColor: colors.protein + '22' }]}>
                    <Text style={[styles.macroPillValue, { color: colors.protein }]}>{mealProtein}</Text>
                    <Text style={[styles.macroPillUnit, { color: colors.protein }]}>P</Text>
                  </View>
                  <View style={[styles.macroPill, { backgroundColor: colors.carbs + '22' }]}>
                    <Text style={[styles.macroPillValue, { color: colors.carbs }]}>{mealCarbs}</Text>
                    <Text style={[styles.macroPillUnit, { color: colors.carbs }]}>C</Text>
                  </View>
                  <View style={[styles.macroPill, { backgroundColor: colors.fats + '22' }]}>
                    <Text style={[styles.macroPillValue, { color: colors.fats }]}>{mealFats}</Text>
                    <Text style={[styles.macroPillUnit, { color: colors.fats }]}>F</Text>
                  </View>
                </View>
              )}

              {/* Items */}
              {items.length === 0 ? (
                <Text style={[styles.emptyMealText, { color: secondaryColor }]}>No foods for this meal</Text>
              ) : (
                items.map((item, idx) => {
                  const isLastItem = idx === items.length - 1;
                  const itemCalories = Math.round(Number(item.scaled_calories) || 0);
                  const itemProtein = Math.round(Number(item.scaled_protein) || 0);
                  const itemCarbs = Math.round(Number(item.scaled_carbs) || 0);
                  const itemFats = Math.round(Number(item.scaled_fats) || 0);
                  const itemGrams = Math.round(Number(item.scaled_grams) || 0);
                  const gramsText = itemGrams > 0 ? itemGrams + 'g' : '';
                  const proteinText = itemProtein + 'g';
                  const carbsText = itemCarbs + 'g';
                  const fatsText = itemFats + 'g';

                  return (
                    <View
                      key={idx}
                      style={[
                        styles.foodItem,
                        idx === 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: borderColor },
                        !isLastItem && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: borderColor },
                      ]}
                    >
                      <View style={styles.foodItemInfo}>
                        <Text style={[styles.foodItemName, { color: textColor }]} numberOfLines={2}>
                          {item.food_name}
                        </Text>
                        <View style={styles.foodItemMetaRow}>
                          {gramsText !== '' && (
                            <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                              {gramsText}
                            </Text>
                          )}
                          {gramsText !== '' && (
                            <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                              {'  ·  '}
                            </Text>
                          )}
                          <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                            {'P: '}
                          </Text>
                          <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                            {proteinText}
                          </Text>
                          <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                            {'  ·  C: '}
                          </Text>
                          <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                            {carbsText}
                          </Text>
                          <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                            {'  ·  F: '}
                          </Text>
                          <Text style={[styles.foodItemMeta, { color: secondaryColor }]}>
                            {fatsText}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.foodItemRight}>
                        <Text style={[styles.foodItemCalories, { color: textColor }]}>{itemCalories}</Text>
                        <Text style={[styles.foodItemKcal, { color: secondaryColor }]}>kcal</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          );
        })}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorText: { ...typography.body, textAlign: 'center', marginBottom: spacing.lg },
  retryButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
  },
  retryButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { padding: spacing.xs, marginRight: spacing.sm },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerEmoji: { fontSize: 22 },
  headerTitle: { ...typography.h3, flex: 1 },
  headerRight: { width: 40 },

  // Scroll
  scrollContent: { padding: spacing.md, paddingBottom: 60 },

  // Goal badge row
  goalBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  goalBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  goalBadgeText: { fontSize: 12, fontWeight: '700', color: '#D97706' },
  templateLabel: { fontSize: 12, fontWeight: '600' },

  // Summary card
  summaryCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.06)',
    elevation: 2,
  },
  summaryCardHeader: { marginBottom: spacing.md },
  summaryCardTitle: { ...typography.bodyBold, marginBottom: 4 },
  summaryCardSubtitle: { ...typography.caption },

  // Macro pills
  macroPills: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  macroPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  macroPillValue: { fontSize: 13, fontWeight: '700' },
  macroPillUnit: { fontSize: 10, fontWeight: '600' },

  // Day selector
  daySelectorScroll: { marginBottom: spacing.lg },
  daySelectorContent: { paddingHorizontal: 0, gap: spacing.sm },
  dayPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  dayPillText: { fontSize: 13, fontWeight: '600' },

  // Meal card
  mealCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.06)',
    elevation: 2,
  },
  mealCardSpacing: { marginBottom: spacing.md },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  mealHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mealEmoji: { fontSize: 18 },
  mealTitle: { ...typography.bodyBold },
  mealMacroRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  emptyMealText: {
    ...typography.caption,
    fontStyle: 'italic',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },

  // Food item
  foodItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  foodItemInfo: { flex: 1 },
  foodItemName: { fontSize: 14, fontWeight: '600', lineHeight: 20, marginBottom: 2 },
  foodItemMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  foodItemMeta: { fontSize: 12, lineHeight: 16 },
  foodItemRight: { alignItems: 'flex-end', paddingTop: 2 },
  foodItemCalories: { fontSize: 15, fontWeight: '700' },
  foodItemKcal: { fontSize: 11 },

  bottomSpacer: { height: 40 },
});
