/**
 * DailyMissionsCard
 *
 * Shows today's 3 daily missions with completion state.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import type { DailyMission } from '@/types/xp';

interface DailyMissionsCardProps {
  missions: DailyMission[] | undefined;
  isDark: boolean;
}

// Map mission_type → Ionicons icon name
function getMissionIcon(missionType: string): keyof typeof Ionicons.glyphMap {
  const map: Record<string, keyof typeof Ionicons.glyphMap> = {
    log_three_meals: 'restaurant',
    hit_protein_goal: 'fitness',
    stay_within_calories: 'pie-chart',
    complete_workout: 'barbell',
    walk_5000_steps: 'walk',
    walk_8000_steps: 'walk',
    walk_10000_steps: 'walk',
    keep_streak_alive: 'flame',
    log_weight: 'scale',
  };
  return map[missionType] ?? 'star';
}

// Human-readable mission title
function getMissionTitle(mission: DailyMission): string {
  const titleMap: Record<string, string> = {
    log_three_meals: 'Log All 3 Meals',
    hit_protein_goal: 'Hit Protein Goal',
    stay_within_calories: 'Stay Within Calories',
    complete_workout: 'Complete Workout',
    walk_5000_steps: 'Walk 5,000 Steps',
    walk_8000_steps: 'Walk 8,000 Steps',
    walk_10000_steps: 'Walk 10,000 Steps',
    keep_streak_alive: 'Keep Streak Alive',
    log_weight: 'Log Your Weight',
  };
  return titleMap[mission.mission_type] ?? mission.title ?? mission.mission_type;
}

interface MissionRowProps {
  mission: DailyMission;
  isDark: boolean;
}

function MissionRow({ mission, isDark }: MissionRowProps) {
  const icon = getMissionIcon(mission.mission_type);
  const title = getMissionTitle(mission);
  const xpReward = mission.xp_reward;
  const done = mission.completed;

  const iconColor = done ? '#34D399' : (isDark ? '#A0A2B8' : '#6B7280');
  const titleColor = done
    ? (isDark ? '#6B7280' : '#9CA3AF')
    : (isDark ? '#F1F5F9' : '#2B2D42');

  return (
    <View style={[styles.missionRow, { borderBottomColor: isDark ? '#3A3C52' : '#E5E7EB' }]}>
      {/* Icon */}
      <View style={[styles.iconCircle, { backgroundColor: done ? 'rgba(52,211,153,0.15)' : (isDark ? '#2A2C42' : '#F0F2F7') }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>

      {/* Title */}
      <Text
        style={[
          styles.missionTitle,
          { color: titleColor },
          done && styles.strikethrough,
        ]}
        numberOfLines={1}
      >
        {title}
      </Text>

      {/* XP reward */}
      <Text style={[styles.xpReward, { color: done ? '#34D399' : colors.primary }]}>
        {'+'}
        {xpReward}
        {' XP'}
      </Text>

      {/* Checkbox */}
      <View style={[styles.checkbox, done && styles.checkboxDone]}>
        {done && <Ionicons name="checkmark" size={14} color="#fff" />}
      </View>
    </View>
  );
}

export default function DailyMissionsCard({ missions, isDark }: DailyMissionsCardProps) {
  const safeMissions = missions ?? [];
  const completedCount = safeMissions.filter((m) => m.completed).length;
  const totalCount = safeMissions.length;
  const allDone = totalCount > 0 && completedCount === totalCount;
  const progressFraction = totalCount > 0 ? completedCount / totalCount : 0;

  const completedText = completedCount + ' / ' + totalCount + ' Completed';

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
          Today's Missions
        </Text>
        <Text style={[styles.completedText, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
          {completedText}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={[styles.progressBarBg, { backgroundColor: isDark ? '#3A3C52' : '#E5E7EB' }]}>
        <View
          style={[
            styles.progressBarFill,
            {
              width: `${progressFraction * 100}%`,
              backgroundColor: allDone ? '#34D399' : colors.primary,
            },
          ]}
        />
      </View>

      {/* Mission rows */}
      <View style={styles.missionsContainer}>
        {safeMissions.length === 0 ? (
          <Text style={[styles.emptyText, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
            No missions today. Check back soon!
          </Text>
        ) : (
          safeMissions.map((mission) => (
            <MissionRow key={mission.id} mission={mission} isDark={isDark} />
          ))
        )}
      </View>

      {/* Bonus badge */}
      {allDone && (
        <View style={styles.bonusBadge}>
          <Text style={styles.bonusText}>
            BONUS +100 XP CLAIMED
          </Text>
        </View>
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
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  completedText: {
    fontSize: 13,
    fontWeight: '500',
  },
  progressBarBg: {
    height: 4,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  missionsContainer: {
    gap: 0,
  },
  missionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
    backgroundColor: '#34D399',
    borderColor: '#34D399',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  bonusBadge: {
    marginTop: spacing.md,
    backgroundColor: 'rgba(52,211,153,0.15)',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.4)',
  },
  bonusText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: 0.8,
  },
});
