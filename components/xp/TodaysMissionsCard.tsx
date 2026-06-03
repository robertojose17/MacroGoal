/**
 * TodaysMissionsCard
 *
 * Unified card that combines nutrition mission rows and the daily missions
 * list into a single bordered card.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import {
  getMacroTier,
  totalLiveXp,
  MACRO_KEYS,
  type MacroKey,
} from '@/utils/macroTier';
import { setMacroTier } from '@/utils/macroXpApi';
import { emitXpRefresh } from '@/utils/xpEvents';
import { toLocalDateString } from '@/utils/dateUtils';
import type { DailyMission } from '@/types/xp';
import ShareProgressBonus from './ShareProgressBonus';

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── NutritionMissionRow ──────────────────────────────────────────────────────

interface NutritionMissionRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  current: number;
  goal: number;
  unit: string;
  isDark: boolean;
  isLast: boolean;
}

function NutritionMissionRow({ icon, title, current, goal, unit, isDark, isLast }: NutritionMissionRowProps) {
  const done = goal > 0 && current >= goal;

  const iconColor = done ? CHECK_GREEN : (isDark ? '#A0A2B8' : '#6B7280');
  const titleColor = done
    ? (isDark ? '#6B7280' : '#9CA3AF')
    : (isDark ? '#F1F5F9' : '#2B2D42');
  const borderColor = isDark ? '#3A3C52' : '#E5E7EB';

  const currentRounded = Math.round(current);
  const goalRounded = Math.round(goal);
  const valueText = currentRounded + ' / ' + goalRounded + ' ' + unit;

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
        {valueText}
      </Text>
      <View style={[styles.checkbox, done && styles.checkboxDone]}>
        {done ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
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
  const caloriesDone = goalCalories > 0 && totalCalories >= goalCalories;
  const proteinDone = goalProtein > 0 && totalProtein >= goalProtein;
  const totalDone = missionsDoneCount + (caloriesDone ? 1 : 0) + (proteinDone ? 1 : 0);
  const totalCount = safeMissions.length + 2; // +2 for calories + protein
  const allDone = totalDone === totalCount && totalCount > 2;

  const headerCountText = totalDone + ' of ' + totalCount + ' done';

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

  // Keep liveXp and nutritionComplete in scope (used by backend sync logic above)
  void liveXp;
  void nutritionComplete;

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

      {/* ── Mission rows (nutrition + daily) ── */}
      <View style={styles.missionsSection}>
        <NutritionMissionRow
          icon="pie-chart"
          title="Hit Calories"
          current={totalCalories}
          goal={goalCalories}
          unit="kcal"
          isDark={isDark}
          isLast={false}
        />
        <NutritionMissionRow
          icon="fitness"
          title="Hit Protein Goal"
          current={totalProtein}
          goal={goalProtein}
          unit="g"
          isDark={isDark}
          isLast={safeMissions.length === 0}
        />
        {safeMissions.map((mission, index) => (
          <MissionRow
            key={mission.id}
            mission={mission}
            isDark={isDark}
            isLast={index === safeMissions.length - 1}
          />
        ))}
        {safeMissions.length === 0 && (
          <Text style={[styles.emptyMissionsText, { color: subtitleColor }]}>
            No missions today. Check back soon!
          </Text>
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
