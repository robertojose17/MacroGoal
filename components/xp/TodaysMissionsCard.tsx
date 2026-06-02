/**
 * TodaysMissionsCard
 *
 * Unified card that combines the Nutrition macro section and the daily missions
 * list into a single bordered card. Replaces DailyMissionsCard + NutritionMissionCard
 * in the dashboard layout.
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
import type { DailyMission } from '@/types/xp';
import ShareProgressBonus from './ShareProgressBonus';

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_1_COLOR = '#22C55E';
const TIER_2_COLOR = '#F59E0B';
const CHECK_GREEN = '#34D399';

// ─── Props ────────────────────────────────────────────────────────────────────

interface TodaysMissionsCardProps {
  missions: DailyMission[] | undefined;
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

// ─── Mission icon / title maps ────────────────────────────────────────────────

function getMissionIcon(missionType: string): keyof typeof Ionicons.glyphMap {
  const map: Record<string, keyof typeof Ionicons.glyphMap> = {
    log_three_meals: 'restaurant',
    hit_protein_goal: 'fitness',
    stay_within_calories: 'pie-chart',
    complete_workout: 'barbell',
    walk_5000_steps: 'walk',
    walk_8000_steps: 'walk',
    walk_10000_steps: 'walk',
    walk_12000_steps: 'walk',
    walk_15000_steps: 'walk',
    walk_17000_steps: 'walk',
    walk_20000_steps: 'walk',
    keep_streak_alive: 'flame',
    log_weight: 'scale',
    log_progress_photo: 'camera',
  };
  return map[missionType] ?? 'star';
}

function getMissionTitle(mission: DailyMission): string {
  const titleMap: Record<string, string> = {
    log_three_meals: 'Log All 3 Meals',
    hit_protein_goal: 'Hit Protein Goal',
    stay_within_calories: 'Stay Within Calories',
    complete_workout: 'Complete Workout',
    walk_5000_steps: 'Walk 5,000 Steps',
    walk_8000_steps: 'Walk 8,000 Steps',
    walk_10000_steps: 'Walk 10,000 Steps',
    walk_12000_steps: 'Walk 12,000 Steps',
    walk_15000_steps: 'Walk 15,000 Steps',
    walk_17000_steps: 'Walk 17,000 Steps',
    walk_20000_steps: 'Walk 20,000 Steps',
    keep_streak_alive: 'Keep Streak Alive',
    log_weight: 'Log Your Weight',
    log_progress_photo: 'Log Your Way with a Photo',
  };
  return titleMap[mission.mission_type] ?? mission.title ?? mission.mission_type;
}

// ─── MacroColumn ──────────────────────────────────────────────────────────────

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
    <View style={styles.macroCell}>
      <View style={styles.columnLabelRow}>
        {dotColor !== null ? (
          <View style={[styles.tierDot, { backgroundColor: dotColor }]} />
        ) : null}
        <Text style={[styles.columnLabel, { color: labelColor }]}>
          {label}
        </Text>
      </View>
      <Text style={[styles.columnValue, { color: valueColor }]} numberOfLines={1}>
        {valueText}
      </Text>
      <View style={[styles.columnBarBg, { backgroundColor: trackColor }]}>
        <Animated.View
          style={[styles.columnBarFill, { width: widthPct, backgroundColor: color }]}
        />
      </View>
    </View>
  );
}

// ─── MissionRow ───────────────────────────────────────────────────────────────

interface MissionRowProps {
  mission: DailyMission;
  isDark: boolean;
  isLast: boolean;
}

function MissionRow({ mission, isDark, isLast }: MissionRowProps) {
  const icon = getMissionIcon(mission.mission_type);
  const title = getMissionTitle(mission);
  const xpReward = mission.xp_reward;
  const done = mission.completed;

  const iconColor = done ? CHECK_GREEN : (isDark ? '#A0A2B8' : '#6B7280');
  const titleColor = done
    ? (isDark ? '#6B7280' : '#9CA3AF')
    : (isDark ? '#F1F5F9' : '#2B2D42');

  const borderColor = isDark ? '#3A3C52' : '#E5E7EB';

  return (
    <View
      style={[
        styles.missionRow,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: borderColor },
      ]}
    >
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: done ? 'rgba(52,211,153,0.15)' : (isDark ? '#2A2C42' : '#F0F2F7') },
        ]}
      >
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text
        style={[styles.missionTitle, { color: titleColor }, done && styles.strikethrough]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <Text style={[styles.xpReward, { color: done ? CHECK_GREEN : colors.primary }]}>
        {'+'}
        {xpReward}
        {' XP'}
      </Text>
      <View style={[styles.checkbox, done && styles.checkboxDone]}>
        {done ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
      </View>
    </View>
  );
}

// ─── Divider ──────────────────────────────────────────────────────────────────

function Divider({ isDark }: { isDark: boolean }) {
  return (
    <View
      style={[
        styles.divider,
        { borderBottomColor: isDark ? '#3A3C52' : '#E5E7EB' },
      ]}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TodaysMissionsCard({
  missions,
  totalCalories,
  totalProtein,
  totalCarbs,
  totalFats,
  goalCalories,
  goalProtein,
  goalCarbs,
  goalFats,
  isDark,
}: TodaysMissionsCardProps) {
  const router = useRouter();

  const safeMissions = missions ?? [];

  // ─── Nutrition tier computation ──────────────────────────────────────────
  const macroInputs: { macro: MacroKey; current: number; goal: number }[] = [
    { macro: 'calories', current: totalCalories, goal: goalCalories },
    { macro: 'protein',  current: totalProtein,  goal: goalProtein },
    { macro: 'carbs',    current: totalCarbs,    goal: goalCarbs },
    { macro: 'fats',     current: totalFats,     goal: goalFats },
  ];

  const tiers = MACRO_KEYS.map((m, i) =>
    getMacroTier(m, macroInputs[i].current, macroInputs[i].goal)
  );

  const liveXp = totalLiveXp(macroInputs);
  const nutritionComplete = tiers.every((t) => t.tier > 0);
  const isEmpty =
    totalCalories === 0 && totalProtein === 0 && totalCarbs === 0 && totalFats === 0;

  // ─── Header counts ───────────────────────────────────────────────────────
  const missionsDoneCount = safeMissions.filter((m) => m.completed).length;
  const nutritionDoneCount = nutritionComplete ? 1 : 0;
  const totalDone = missionsDoneCount + nutritionDoneCount;
  const totalCount = safeMissions.length + 1; // +1 for nutrition
  const allDone = totalDone === totalCount && totalCount > 1;

  const headerCountText = totalDone + ' of ' + totalCount + ' done';
  const xpBadgeText = '+' + liveXp + ' XP';

  // ─── Debounced backend sync ──────────────────────────────────────────────
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

        console.log('[TodaysMissionsCard] syncing macro tier to backend', { macro, current, goal, date });

        setMacroTier({ date, macro, current, goal })
          .then((res) => {
            console.log('[TodaysMissionsCard] tier sync ok', macro, res);
            emitXpRefresh();
          })
          .catch((e) =>
            console.warn(
              '[TodaysMissionsCard] tier sync failed (non-fatal)',
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

  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? '#3A3C52' : '#D4D6DA';
  const titleColor = isDark ? '#F1F5F9' : '#2B2D42';
  const subtitleColor = isDark ? '#A0A2B8' : '#6B7280';

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: cardBg, borderColor: cardBorder },
      ]}
    >
      {/* ── Card header ── */}
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: titleColor }]}>
          Today's Missions
        </Text>
        <Text style={[styles.headerCount, { color: subtitleColor }]}>
          {headerCountText}
        </Text>
      </View>

      <Divider isDark={isDark} />

      {/* ── Nutrition section ── */}
      <View style={styles.nutritionSection}>
        {/* Nutrition row header */}
        <View style={styles.nutritionHeader}>
          <Text style={[styles.sectionLabel, { color: titleColor }]}>
            Nutrition
          </Text>
          <View style={styles.nutritionHeaderRight}>
            <LinearGradient
              colors={[colors.primary, '#FF8E3C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.xpPill}
            >
              <Text style={styles.xpPillText}>
                {xpBadgeText}
              </Text>
            </LinearGradient>
            <View style={[styles.nutritionCheck, nutritionComplete && styles.nutritionCheckDone]}>
              {nutritionComplete ? (
                <Ionicons name="checkmark" size={12} color="#fff" />
              ) : null}
            </View>
          </View>
        </View>

        {/* Macro columns or empty state */}
        {isEmpty ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="nutrition-outline"
              size={28}
              color={isDark ? '#3A3C52' : '#D4D6DA'}
            />
            <Text style={[styles.emptyText, { color: subtitleColor }]}>
              Log your meals to start earning XP
            </Text>
            <TouchableOpacity
              style={[styles.ctaButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                console.log('[TodaysMissionsCard] Add Food pressed');
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
          <View style={styles.macroGrid}>
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
        )}
      </View>

      <Divider isDark={isDark} />

      {/* ── Mission rows ── */}
      <View style={styles.missionsSection}>
        {safeMissions.length === 0 ? (
          <Text style={[styles.emptyMissionsText, { color: subtitleColor }]}>
            No missions today. Check back soon!
          </Text>
        ) : (
          safeMissions.map((mission, index) => (
            <MissionRow
              key={mission.id}
              mission={mission}
              isDark={isDark}
              isLast={index === safeMissions.length - 1}
            />
          ))
        )}
      </View>

      {/* ── Share Progress Bonus (always visible) ── */}
      <ShareProgressBonus allDone={allDone} isDark={isDark} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  // ── Card header ──────────────────────────────────────────────────────────
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerCount: {
    fontSize: 13,
    fontWeight: '500',
  },
  // ── Divider ──────────────────────────────────────────────────────────────
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginVertical: spacing.md,
  },
  // ── Nutrition section ─────────────────────────────────────────────────────
  nutritionSection: {
    // no extra padding — card padding handles it
  },
  nutritionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  nutritionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  xpPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: borderRadius.full,
  },
  xpPillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  nutritionCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nutritionCheckDone: {
    backgroundColor: CHECK_GREEN,
    borderColor: CHECK_GREEN,
  },
  // ── Macro grid ────────────────────────────────────────────────────────────
  macroGrid: {
    flexDirection: 'row',
  },
  macroCell: {
    width: '25%',
    paddingHorizontal: 4,
    alignItems: 'flex-start',
  },
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
    fontSize: 12,
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
  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: 13,
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
  // ── Missions section ──────────────────────────────────────────────────────
  missionsSection: {
    // no extra padding
  },
  missionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  xpReward: {
    fontSize: 13,
    fontWeight: '700',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: {
    backgroundColor: CHECK_GREEN,
    borderColor: CHECK_GREEN,
  },
  emptyMissionsText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
