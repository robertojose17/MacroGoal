/**
 * XpHeroCard
 *
 * Hero card at the top of the dashboard showing:
 * - Level number with circular progress ring
 * - Rank badge
 * - XP progress bar with label
 * - Streak indicator
 * - Optional streak-at-risk warning
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { rankColors } from '@/constants/Colors';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import RankBadge from './RankBadge';
import type { XpStatus } from '@/types/xp';

interface XpHeroCardProps {
  status: XpStatus | null;
  isDark: boolean;
}

const RING_SIZE = 130;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export default function XpHeroCard({ status, isDark }: XpHeroCardProps) {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const barAnim = useRef(new Animated.Value(0)).current;

  const rank = status?.current_rank ?? 'Rookie';
  const rankColor = rankColors[rank] ?? rankColors['Rookie'];

  const level = status?.current_level ?? 1;
  const progressPercent = status?.level_progress?.progress_percent ?? 0;
  const xpInLevel = status?.level_progress?.xp_in_current_level ?? 0;
  const xpNeeded = status?.level_progress?.xp_needed_for_next_level ?? 100;
  const streak = status?.current_streak ?? 0;
  const xpToday = status?.xp_today ?? 0;

  // Streak at risk: earned < 100 XP today
  const streakAtRisk = streak > 0 && xpToday < 100;
  const xpNeededForStreak = Math.max(0, 100 - xpToday);

  const xpInLevelDisplay = xpInLevel.toLocaleString();
  const xpNeededDisplay = xpNeeded.toLocaleString();
  const xpToNextLevel = Math.max(0, xpNeeded - xpInLevel);
  const xpToNextLevelDisplay = xpToNextLevel.toLocaleString();
  const nextLevel = level + 1;

  // Animate ring and bar on mount / status change
  useEffect(() => {
    Animated.parallel([
      Animated.timing(progressAnim, {
        toValue: progressPercent / 100,
        duration: 900,
        useNativeDriver: false,
      }),
      Animated.timing(barAnim, {
        toValue: progressPercent / 100,
        duration: 900,
        useNativeDriver: false,
      }),
    ]).start();
  }, [progressPercent, progressAnim, barAnim]);

  // SVG ring stroke-dashoffset driven by Animated.Value
  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_CIRCUMFERENCE, 0],
  });

  const barWidth = barAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  // Gradient colors based on rank
  const gradStart = rankColor.gradient[0];
  const gradEnd = rankColor.gradient[1];

  return (
    <LinearGradient
      colors={[isDark ? '#1E2035' : '#F0F2F7', isDark ? '#252740' : '#FFFFFF']}
      style={[styles.card, { borderColor: isDark ? '#3A3C52' : '#D4D6DA' }]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {/* Top row: streak on right */}
      <View style={styles.topRow}>
        <View style={styles.streakContainer}>
          <Text style={styles.streakEmoji}>🔥</Text>
          <Text style={[styles.streakNumber, { color: isDark ? '#F1F5F9' : '#2B2D42' }]}>
            {streak}
          </Text>
          <Text style={[styles.streakLabel, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
            {streak === 1 ? 'Day Streak' : 'Day Streak'}
          </Text>
        </View>
      </View>

      {/* Center: ring + level */}
      <View style={styles.centerRow}>
        <View style={styles.ringWrapper}>
          {/* Background ring */}
          <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={isDark ? '#3A3C52' : '#E5E7EB'}
              strokeWidth={RING_STROKE}
              fill="none"
            />
          </Svg>

          {/* Animated progress ring — use a static approach since AnimatedCircle needs special handling */}
          <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={gradStart}
              strokeWidth={RING_STROKE}
              fill="none"
              strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - progressPercent / 100)}
              strokeLinecap="round"
              rotation="-90"
              origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
            />
          </Svg>

          {/* Level number inside ring */}
          <View style={styles.ringInner}>
            <Text style={[styles.levelNumber, { color: isDark ? '#F1F5F9' : '#2B2D42' }]}>
              {level}
            </Text>
            <Text style={[styles.levelLabel, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
              LEVEL
            </Text>
          </View>
        </View>

        {/* Right side: rank + XP info */}
        <View style={styles.infoColumn}>
          <RankBadge rank={rank} size="md" />

          <View style={styles.xpTextRow}>
            <Text style={[styles.xpCurrent, { color: isDark ? '#F1F5F9' : '#2B2D42' }]}>
              {xpInLevelDisplay}
            </Text>
            <Text style={[styles.xpSeparator, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
              {' / '}
            </Text>
            <Text style={[styles.xpTotal, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
              {xpNeededDisplay}
            </Text>
            <Text style={[styles.xpUnit, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
              {' XP'}
            </Text>
          </View>

          <Text style={[styles.xpToNext, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
            {xpToNextLevelDisplay}
            {' XP to Level '}
            {nextLevel}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.barSection}>
        <View style={[styles.barBackground, { backgroundColor: isDark ? '#3A3C52' : '#E5E7EB' }]}>
          <Animated.View
            style={[
              styles.barFill,
              {
                width: barWidth,
                backgroundColor: gradStart,
              },
            ]}
          />
        </View>
      </View>

      {/* Streak at risk warning */}
      {streakAtRisk && (
        <View style={[styles.warningRow, { backgroundColor: isDark ? 'rgba(251,146,60,0.15)' : 'rgba(251,146,60,0.1)' }]}>
          <Text style={styles.warningText}>
            {'⚠️ Earn '}
            {xpNeededForStreak}
            {' more XP to protect your streak'}
          </Text>
        </View>
      )}
    </LinearGradient>
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
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: spacing.sm,
  },
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakEmoji: {
    fontSize: 18,
  },
  streakNumber: {
    fontSize: 18,
    fontWeight: '700',
  },
  streakLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  centerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  ringWrapper: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelNumber: {
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 46,
  },
  levelLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
  },
  infoColumn: {
    flex: 1,
    gap: spacing.sm,
  },
  xpTextRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginTop: spacing.xs,
  },
  xpCurrent: {
    fontSize: 20,
    fontWeight: '700',
  },
  xpSeparator: {
    fontSize: 16,
    fontWeight: '400',
  },
  xpTotal: {
    fontSize: 16,
    fontWeight: '500',
  },
  xpUnit: {
    fontSize: 13,
    fontWeight: '400',
  },
  xpToNext: {
    fontSize: 12,
    fontWeight: '500',
  },
  barSection: {
    marginTop: spacing.xs,
  },
  barBackground: {
    height: 6,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  warningRow: {
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  warningText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FB923C',
    textAlign: 'center',
  },
});
