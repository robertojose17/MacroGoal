/**
 * TodaysMissionsCard
 *
 * Unified card that combines nutrition mission rows and the daily missions
 * list into a single bordered card.
 *
 * Row order:
 *   1. Hit Calories (fixed nutrition)
 *   2. Hit Protein Goal (fixed nutrition)
 *   3. Step mission (walk_* from missions array)
 *   4. Unlocked slots (from unlock_slot_status.slots)
 *   5. Unlock button / locked hint / all-used label
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Lock, Sparkles } from 'lucide-react-native';
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
import type { DailyMission, TierProgress, UnlockSlotStatus, UnlockedSlot } from '@/types/xp';
import ShareProgressBonus from './ShareProgressBonus';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHECK_GREEN = '#34D399';
const GOLD = '#FFB547';

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
  /** XP config from backend xp_event_config — event_type → xp_amount */
  xpConfig?: Record<string, number>;
  /** @deprecated — replaced by unlockSlotStatus */
  missionTier?: number;
  /** @deprecated — replaced by unlockSlotStatus */
  tierProgress?: TierProgress | null;
  unlockSlotStatus?: UnlockSlotStatus;
  onUnlockPress?: () => void;
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

function getSlotMissionTitle(missionType: string): string {
  const titleMap: Record<string, string> = {
    log_three_meals:          'Log All 3 Meals',
    complete_workout:         'Complete a Workout',
    keep_streak_alive:        'Keep Streak Alive',
    log_weight_with_photo:    'Log Weight + Photo',
    burn_active_calories:     'Burn 300 Active Calories',
    burn_active_calories_hard:'Burn 500 Active Calories',
    exercise_minutes:         '30 Min of Exercise',
    exercise_minutes_hard:    '60 Min of Exercise',
    walk_distance_mile:       'Walk or Run 1 Mile',
    walk_distance_3mile:      'Walk or Run 3 Miles',
    flights_climbed:          'Climb 10 Flights of Stairs',
  };
  return titleMap[missionType] ?? missionType;
}

function getSlotMissionIcon(missionType: string): keyof typeof Ionicons.glyphMap {
  const map: Record<string, keyof typeof Ionicons.glyphMap> = {
    log_three_meals:          'restaurant',
    complete_workout:         'barbell',
    keep_streak_alive:        'flame',
    log_weight_with_photo:    'camera',
    burn_active_calories:     'flash',
    burn_active_calories_hard:'flash',
    exercise_minutes:         'timer',
    exercise_minutes_hard:    'timer',
    walk_distance_mile:       'location',
    walk_distance_3mile:      'location',
    flights_climbed:          'trending-up',
  };
  return map[missionType] ?? 'star';
}

// ─── NutritionMissionRow ──────────────────────────────────────────────────────

interface NutritionMissionRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  current: number;
  goal: number;
  unit: string;
  xpReward: number;
  isDark: boolean;
  isLast: boolean;
}

function NutritionMissionRow({ icon, title, current, goal, unit, xpReward, isDark, isLast }: NutritionMissionRowProps) {
  const done = goal > 0 && current >= goal;

  const iconColor = done ? CHECK_GREEN : (isDark ? '#A0A2B8' : '#6B7280');
  const titleColor = done
    ? (isDark ? '#6B7280' : '#9CA3AF')
    : (isDark ? '#F1F5F9' : '#2B2D42');
  const borderColor = isDark ? '#3A3C52' : '#E5E7EB';

  const currentRounded = Math.round(current);
  const goalRounded = Math.round(goal);
  const fullTitle = title + ' ' + currentRounded + '/' + goalRounded + unit;

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
        {fullTitle}
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

// ─── UnlockedSlotRow ──────────────────────────────────────────────────────────

interface UnlockedSlotRowProps {
  slot: UnlockedSlot;
  isDark: boolean;
  isLast: boolean;
}

function UnlockedSlotRow({ slot, isDark, isLast }: UnlockedSlotRowProps) {
  const icon = getSlotMissionIcon(slot.mission_type);
  const title = getSlotMissionTitle(slot.mission_type);
  const done = slot.completed;

  const iconColor = done ? CHECK_GREEN : GOLD;
  const titleColor = done
    ? (isDark ? '#6B7280' : '#9CA3AF')
    : (isDark ? '#F1F5F9' : '#2B2D42');
  const borderColor = isDark ? '#3A3C52' : '#E5E7EB';
  const iconBg = done
    ? 'rgba(52,211,153,0.15)'
    : (isDark ? 'rgba(255,181,71,0.15)' : 'rgba(255,181,71,0.1)');

  return (
    <View
      style={[
        styles.missionRow,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: borderColor },
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text
        style={[styles.missionTitle, { color: titleColor }, done && styles.strikethrough]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <Text style={[styles.xpReward, { color: done ? CHECK_GREEN : GOLD }]}>
        {'+'}
        {slot.xp_reward}
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

// ─── UnlockButton (State A) ───────────────────────────────────────────────────

interface UnlockButtonProps {
  remainingSlots: number;
  bonusXp: number;
  onPress: () => void;
}

function UnlockButton({ remainingSlots, bonusXp, onPress }: UnlockButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  function handlePressIn() {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 30 }).start();
  }

  function handlePressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  }

  const bonusText = '+' + bonusXp + ' XP bonus · ' + remainingSlots + ' left';

  return (
    <Pressable
      onPress={() => {
        console.log('[TodaysMissionsCard] Unlock a Mission button pressed');
        onPress();
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[styles.unlockButton, { transform: [{ scale }] }]}>
        <Sparkles size={18} color="#fff" />
        <View style={styles.unlockButtonTextBlock}>
          <Text style={styles.unlockButtonPrimary}>
            Unlock a Mission
          </Text>
          <Text style={styles.unlockButtonSecondary}>
            {bonusText}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

// ─── LockedHint (State C) ─────────────────────────────────────────────────────

interface LockedHintProps {
  message: string;
  current: number;
  target: number;
  isDark: boolean;
}

function LockedHint({ message, current, target, isDark }: LockedHintProps) {
  const progressPercent = target > 0 ? Math.min(current / target, 1) : 0;
  const progressWidth = Math.round(progressPercent * 100);

  const benefitMessage = target > 0
    ? `Reach Level ${target} to unlock a bonus mission slot — extra missions, more XP, faster level-ups.`
    : message;

  return (
    <View
      style={[
        styles.lockedHint,
        {
          backgroundColor: isDark
            ? 'rgba(255, 184, 71, 0.12)'
            : 'rgba(255, 184, 71, 0.08)',
          borderColor: 'rgba(255, 184, 71, 0.25)',
        },
      ]}
    >
      <View style={styles.lockedHintHeader}>
        <Lock size={16} color={GOLD} />
        <Text style={[styles.lockedHintTitle, { color: isDark ? '#F1F5F9' : '#2B2D42' }]}>
          Earn more XP every day
        </Text>
      </View>
      <Text style={[styles.lockedHintSubtitle, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
        {benefitMessage}
      </Text>
      <View style={styles.lockedProgressTrack}>
        <View style={[styles.lockedProgressFill, { width: progressWidth + '%' }]} />
      </View>
    </View>
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
  xpConfig,
  unlockSlotStatus,
  onUnlockPress,
}: TodaysMissionsCardProps) {
  const safeMissions = missions ?? [];

  // Filter out nutrition duplicates from the missions array
  const nonNutritionMissions = safeMissions.filter(
    (m) => m.mission_type !== 'hit_protein_goal' && m.mission_type !== 'stay_within_calories'
  );

  // Separate step mission (walk_*) from the rest
  const stepMission = nonNutritionMissions.find((m) => m.mission_type.startsWith('walk_'));
  // Other non-step missions (kept for potential future use but not rendered as rotating slots)
  // since unlocked slots come from unlock_slot_status.slots now

  // Unlocked slots sorted by slot_index
  const unlockedSlots: UnlockedSlot[] = unlockSlotStatus
    ? [...unlockSlotStatus.slots].sort((a, b) => a.slot_index - b.slot_index)
    : [];

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
  const caloriesDone = goalCalories > 0 && totalCalories >= goalCalories;
  const proteinDone  = goalProtein > 0 && totalProtein >= goalProtein;
  const stepDone     = stepMission?.completed ?? false;
  const slotsDone    = unlockedSlots.filter((s) => s.completed).length;

  const totalDone =
    (caloriesDone ? 1 : 0) +
    (proteinDone ? 1 : 0) +
    (stepMission ? (stepDone ? 1 : 0) : 0) +
    slotsDone;

  const totalCount =
    2 + // calories + protein always shown
    (stepMission ? 1 : 0) +
    unlockedSlots.length;

  const allDone = totalCount > 2 && totalDone === totalCount;

  const headerCountText = totalDone + ' of ' + totalCount + ' done';

  // ─── isLast helpers ──────────────────────────────────────────────────────
  // The last "row" before the footer section
  const hasSlots = unlockedSlots.length > 0;
  const hasStep  = stepMission != null;

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

  // Keep liveXp and nutritionComplete in scope
  void liveXp;
  void nutritionComplete;

  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? '#3A3C52' : '#D4D6DA';
  const titleColor = isDark ? '#F1F5F9' : '#2B2D42';
  const subtitleColor = isDark ? '#A0A2B8' : '#6B7280';

  // ─── Determine unlock footer state ──────────────────────────────────────
  const showUnlockButton =
    unlockSlotStatus != null && unlockSlotStatus.remaining_slots > 0;

  const showAllUsedLabel =
    unlockSlotStatus != null &&
    unlockSlotStatus.max_slots > 0 &&
    unlockSlotStatus.remaining_slots === 0;

  const showLockedHint =
    unlockSlotStatus != null &&
    unlockSlotStatus.max_slots === 0 &&
    unlockSlotStatus.next_unlock_at != null;

  const maxSlotsText =
    unlockSlotStatus != null
      ? 'All ' +
        unlockSlotStatus.max_slots +
        ' mission slot' +
        (unlockSlotStatus.max_slots === 1 ? '' : 's') +
        ' unlocked for today'
      : '';

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

      {/* ── Mission rows ── */}
      <View style={styles.missionsSection}>
        {/* 1. Hit Calories */}
        <NutritionMissionRow
          icon="pie-chart"
          title="Hit Calories"
          current={totalCalories}
          goal={goalCalories}
          unit="kcal"
          xpReward={xpConfig?.['calorie_goal'] ?? 15}
          isDark={isDark}
          isLast={false}
        />

        {/* 2. Hit Protein Goal */}
        <NutritionMissionRow
          icon="fitness"
          title="Hit Protein Goal"
          current={totalProtein}
          goal={goalProtein}
          unit="g"
          xpReward={xpConfig?.['protein_goal'] ?? 20}
          isDark={isDark}
          isLast={!hasStep && !hasSlots}
        />

        {/* 3. Step mission */}
        {stepMission && (
          <MissionRow
            key={stepMission.id}
            mission={stepMission}
            isDark={isDark}
            isLast={!hasSlots}
          />
        )}

        {/* 4. Unlocked slots */}
        {unlockedSlots.map((slot, index) => (
          <UnlockedSlotRow
            key={slot.slot_index}
            slot={slot}
            isDark={isDark}
            isLast={index === unlockedSlots.length - 1}
          />
        ))}

        {/* Empty state */}
        {totalCount === 0 && (
          <Text style={[styles.emptyMissionsText, { color: subtitleColor }]}>
            No missions today. Check back soon!
          </Text>
        )}
      </View>

      {/* ── Unlock footer ── */}
      {showUnlockButton && onUnlockPress && (
        <View style={styles.unlockFooter}>
          <UnlockButton
            remainingSlots={unlockSlotStatus!.remaining_slots}
            bonusXp={unlockSlotStatus!.unlock_bonus_xp}
            onPress={onUnlockPress}
          />
        </View>
      )}

      {showAllUsedLabel && (
        <View style={styles.allUsedContainer}>
          <Text style={[styles.allUsedText, { color: subtitleColor }]}>
            {maxSlotsText}
          </Text>
        </View>
      )}

      {showLockedHint && unlockSlotStatus?.next_unlock_at && (
        <View style={styles.unlockFooter}>
          <LockedHint
            message={unlockSlotStatus.next_unlock_at.message}
            current={unlockSlotStatus.next_unlock_at.current}
            target={unlockSlotStatus.next_unlock_at.target}
            isDark={isDark}
          />
        </View>
      )}

      {/* ── Share Progress Bonus (always visible) ── */}
      <ShareProgressBonus allDone={allDone} isDark={isDark} xpConfig={xpConfig} />
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
  // ── Unlock footer ─────────────────────────────────────────────────────────
  unlockFooter: {
    marginTop: spacing.md,
  },
  // ── Unlock button (State A) ───────────────────────────────────────────────
  unlockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    backgroundColor: '#FFB547',
    ...Platform.select({
      ios: {
        shadowColor: '#FFB547',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  unlockButtonTextBlock: {
    alignItems: 'center',
  },
  unlockButtonPrimary: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  unlockButtonSecondary: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  // ── All-used label (State B) ──────────────────────────────────────────────
  allUsedContainer: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  allUsedText: {
    fontSize: 12,
    fontWeight: '400',
    textAlign: 'center',
  },
  // ── Locked hint (State C) ─────────────────────────────────────────────────
  lockedHint: {
    borderRadius: borderRadius.md,
    padding: 12,
    borderWidth: 1,
  },
  lockedHintHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  lockedHintTitle: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  lockedHintSubtitle: {
    fontSize: 12,
    fontWeight: '400',
    marginBottom: 8,
    marginLeft: 22,
  },
  lockedProgressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 184, 71, 0.2)',
    overflow: 'hidden',
  },
  lockedProgressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: GOLD,
  },
});
