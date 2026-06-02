/**
 * NutritionMissionCard
 *
 * Shows 4 macro progress columns (Calories, Protein, Carbs, Fats) with a live
 * XP badge that reflects the current tier for each macro.
 *
 * Tier logic mirrors the backend `set-macro-tier` function exactly (see
 * utils/macroTier.ts). Values are synced to the backend debounced 1500 ms
 * after the last change so we don't spam on every keystroke.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import {
  getMacroTier,
  totalLiveXp,
  MACRO_KEYS,
  MAX_MACRO_XP,
  type MacroKey,
} from '@/utils/macroTier';
import { setMacroTier } from '@/utils/macroXpApi';
import { emitXpRefresh } from '@/utils/xpEvents';
import { toLocalDateString } from '@/utils/dateUtils';

// ─── Props ────────────────────────────────────────────────────────────────────

interface NutritionMissionCardProps {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
  goalCalories: number;
  goalProtein: number;
  goalCarbs: number;
  goalFats: number;
  isDark: boolean;
}

// ─── Tier dot colors ──────────────────────────────────────────────────────────

const TIER_1_COLOR = '#22C55E'; // green  — MAX +XP
const TIER_2_COLOR = '#F59E0B'; // amber  — +XP

// ─── MacroColumn ─────────────────────────────────────────────────────────────

interface MacroColumnProps {
  label: string;
  current: number;
  goal: number;
  unit: string;
  color: string;
  isDark: boolean;
  tier: 0 | 1 | 2;
}

function MacroColumn({ label, current, goal, unit, color, isDark, tier }: MacroColumnProps) {
  const animVal = useRef(new Animated.Value(0)).current;
  const progress = goal > 0 ? Math.min(current / goal, 1) : 0;

  useEffect(() => {
    Animated.timing(animVal, {
      toValue: progress,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [progress, animVal]);

  const widthPct = animVal.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const currentDisplay = Math.round(current).toLocaleString();
  const goalDisplay = Math.round(goal).toLocaleString();
  const valueText = currentDisplay + '/' + goalDisplay + unit;

  const dotColor = tier === 1 ? TIER_1_COLOR : tier === 2 ? TIER_2_COLOR : null;

  const labelColor = isDark ? '#A0A2B8' : '#6B7280';
  const valueColor = isDark ? '#F1F5F9' : '#2B2D42';
  const trackColor = isDark ? '#3A3C52' : '#E5E7EB';

  return (
    <View style={styles.circleCell}>
      {/* Label row with optional tier dot */}
      <View style={styles.columnLabelRow}>
        {dotColor !== null ? (
          <View style={[styles.tierDot, { backgroundColor: dotColor }]} />
        ) : null}
        <Text style={[styles.columnLabel, { color: labelColor }]}>
          {label}
        </Text>
      </View>

      {/* current/goal value */}
      <Text style={[styles.columnValue, { color: valueColor }]} numberOfLines={1}>
        {valueText}
      </Text>

      {/* Animated progress bar */}
      <View style={[styles.columnBarBg, { backgroundColor: trackColor }]}>
        <Animated.View
          style={[styles.columnBarFill, { width: widthPct, backgroundColor: color }]}
        />
      </View>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NutritionMissionCard({
  totalCalories,
  totalProtein,
  totalCarbs,
  totalFats,
  goalCalories,
  goalProtein,
  goalCarbs,
  goalFats,
  isDark,
}: NutritionMissionCardProps) {
  const router = useRouter();

  const isEmpty =
    totalCalories === 0 && totalProtein === 0 && totalCarbs === 0 && totalFats === 0;

  // ─── Tier computation ──────────────────────────────────────────────────────
  const macroInputs: { macro: MacroKey; current: number; goal: number }[] = [
    { macro: 'calories', current: totalCalories, goal: goalCalories },
    { macro: 'protein',  current: totalProtein,  goal: goalProtein },
    { macro: 'carbs',    current: totalCarbs,    goal: goalCarbs },
    { macro: 'fats',     current: totalFats,     goal: goalFats },
  ];

  const tiers = MACRO_KEYS.map((m, i) =>
    getMacroTier(m, macroInputs[i].current, macroInputs[i].goal)
  );

  const onTrackCount = tiers.filter((t) => t.tier > 0).length;
  const liveXp = totalLiveXp(macroInputs);
  const remaining = MAX_MACRO_XP - liveXp;
  const isMaxXp = liveXp === MAX_MACRO_XP;

  const onTrackText = onTrackCount + ' of 4 macros earning XP';
  const xpBadgeText = '+' + liveXp + ' XP';
  const xpSubtitleText = isMaxXp ? 'Max XP earned!' : '+' + remaining + ' XP available today';

  const avgProgress =
    goalCalories > 0
      ? Math.min(
          ((totalCalories / goalCalories) +
            (goalProtein > 0 ? totalProtein / goalProtein : 0) +
            (goalCarbs > 0 ? totalCarbs / goalCarbs : 0) +
            (goalFats > 0 ? totalFats / goalFats : 0)) /
            4,
          1
        )
      : 0;

  const avgProgressPct = Math.round(avgProgress * 100);

  // ─── Debounced backend sync ────────────────────────────────────────────────
  const lastSentRef = useRef<
    Record<MacroKey, { current: number; goal: number; sent: number }>
  >({
    calories: { current: -1, goal: -1, sent: 0 },
    protein:  { current: -1, goal: -1, sent: 0 },
    carbs:    { current: -1, goal: -1, sent: 0 },
    fats:     { current: -1, goal: -1, sent: 0 },
  });

  useEffect(() => {
    if (isEmpty) return;

    const date = toLocalDateString();

    const timer = setTimeout(() => {
      macroInputs.forEach(({ macro, current, goal }) => {
        if (goal <= 0) return;
        const prev = lastSentRef.current[macro];
        if (prev.current === current && prev.goal === goal) return;

        lastSentRef.current[macro] = { current, goal, sent: Date.now() };

        console.log('[NutritionMissionCard] syncing tier to backend', { macro, current, goal, date });

        setMacroTier({ date, macro, current, goal })
          .then((res) => {
            console.log('[NutritionMissionCard] tier sync ok', macro, res);
            emitXpRefresh();
          })
          .catch((e) =>
            console.warn(
              '[NutritionMissionCard] tier sync failed (non-fatal)',
              macro,
              e?.message ?? e
            )
          );
      });
    }, 1500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    totalCalories,
    totalProtein,
    totalCarbs,
    totalFats,
    goalCalories,
    goalProtein,
    goalCarbs,
    goalFats,
    isEmpty,
  ]);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? colors.cardDark : colors.card,
          borderColor: isDark ? '#3A3C52' : '#D4D6DA',
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.cardTitle, { color: isDark ? '#F1F5F9' : '#2B2D42' }]}>
          Nutrition Mission
        </Text>
        <View style={styles.badgeColumn}>
          <LinearGradient
            colors={[colors.primary, '#FF8E3C']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.xpBadge}
          >
            <Ionicons name="trophy" size={12} color="#fff" />
            <Text style={styles.xpBadgeText}>
              {xpBadgeText}
            </Text>
          </LinearGradient>
          <View style={styles.xpSubtitleRow}>
            {isMaxXp ? (
              <Ionicons name="checkmark-circle" size={11} color={TIER_1_COLOR} />
            ) : null}
            <Text
              style={[
                styles.xpSubtitle,
                { color: isMaxXp ? TIER_1_COLOR : isDark ? '#6B7280' : '#9CA3AF' },
              ]}
            >
              {xpSubtitleText}
            </Text>
          </View>
        </View>
      </View>

      {isEmpty ? (
        /* Empty state */
        <View style={styles.emptyState}>
          <Ionicons name="nutrition-outline" size={36} color={isDark ? '#3A3C52' : '#D4D6DA'} />
          <Text style={[styles.emptyTitle, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
            Log your meals to start earning XP
          </Text>
          <TouchableOpacity
            style={[styles.ctaButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              console.log('[NutritionMissionCard] Add Food pressed');
              router.push('/add-food');
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.ctaText}>
              Add Food
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Horizontal 4-column macro row */}
          <View style={styles.grid}>
            <MacroColumn
              label="Calories"
              current={totalCalories}
              goal={goalCalories}
              unit=" kcal"
              color={colors.calories}
              isDark={isDark}
              tier={tiers[0].tier}
            />
            <MacroColumn
              label="Protein"
              current={totalProtein}
              goal={goalProtein}
              unit="g"
              color={colors.protein}
              isDark={isDark}
              tier={tiers[1].tier}
            />
            <MacroColumn
              label="Carbs"
              current={totalCarbs}
              goal={goalCarbs}
              unit="g"
              color={colors.carbs}
              isDark={isDark}
              tier={tiers[2].tier}
            />
            <MacroColumn
              label="Fats"
              current={totalFats}
              goal={goalFats}
              unit="g"
              color={colors.fats}
              isDark={isDark}
              tier={tiers[3].tier}
            />
          </View>

          {/* Mission progress bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={[styles.progressLabel, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
                Mission progress
              </Text>
              <Text style={[styles.onTrackText, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
                {onTrackText}
              </Text>
            </View>
            <View
              style={[
                styles.progressBarBg,
                { backgroundColor: isDark ? '#3A3C52' : '#E5E7EB' },
              ]}
            >
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: avgProgressPct + '%',
                    backgroundColor: avgProgress >= 0.9 ? colors.success : colors.primary,
                  },
                ]}
              />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  badgeColumn: {
    alignItems: 'flex-end',
    gap: 3,
  },
  xpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: borderRadius.full,
  },
  xpBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  xpSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  xpSubtitle: {
    fontSize: 10,
    fontWeight: '500',
  },
  // ─── Grid: single horizontal row ─────────────────────────────────────────
  grid: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  circleCell: {
    width: '25%',
    paddingHorizontal: 4,
    alignItems: 'flex-start',
  },
  // ─── Column sub-components ────────────────────────────────────────────────
  columnLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  tierDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginRight: 4,
  },
  columnLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  columnValue: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 0,
  },
  columnBarBg: {
    height: 4,
    borderRadius: borderRadius.full,
    marginTop: 6,
    overflow: 'hidden',
    width: '100%',
  },
  columnBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  // ─── Progress section ─────────────────────────────────────────────────────
  progressSection: {
    marginTop: spacing.xs,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  onTrackText: {
    fontSize: 12,
    fontWeight: '500',
  },
  progressBarBg: {
    height: 5,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  // ─── Empty state ──────────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  ctaButton: {
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  ctaText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
