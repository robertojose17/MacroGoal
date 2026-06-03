/**
 * XpHeroCard
 *
 * Hero card at the top of the dashboard showing:
 * - Level number with circular progress ring
 * - Rank badge
 * - XP progress bar with label
 * - Streak indicator with optional freeze badge
 * - Premium boost badge
 * - Optional streak-at-risk warning
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  Pressable,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { Zap, Snowflake } from 'lucide-react-native';
import { rankColors } from '@/constants/Colors';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import RankBadge from './RankBadge';
import type { XpStatus } from '@/types/xp';

interface XpHeroCardProps {
  status: XpStatus | null;
  isDark: boolean;
  onUpgradePress?: () => void;
}

const RING_SIZE = 130;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export default function XpHeroCard({ status, isDark, onUpgradePress }: XpHeroCardProps) {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const barAnim = useRef(new Animated.Value(0)).current;
  const freezeScale = useRef(new Animated.Value(1)).current;

  const rank = status?.current_rank ?? 'Rookie';
  const rankColor = rankColors[rank] ?? rankColors['Rookie'];

  const level = status?.current_level ?? 1;
  const progressPercent = status?.level_progress?.progress_percent ?? 0;
  const xpInLevel = status?.level_progress?.xp_in_current_level ?? 0;
  const xpNeeded = status?.level_progress?.xp_needed_for_next_level ?? 100;
  const streak = status?.current_streak ?? 0;
  const xpToday = status?.xp_today ?? 0;

  // Premium / freeze fields
  const premiumMultiplier = status?.premium_multiplier;
  const showPremiumBadge = premiumMultiplier !== undefined && premiumMultiplier > 1;
  const freezeCount = status?.streak_freeze_count;
  const showFreezeBadge = freezeCount !== undefined && freezeCount > 0;
  const weeklyFreezeMax = status?.weekly_freeze_max ?? 1;
  const isPremium = status?.is_premium === true;

  // Streak at risk: earned < 100 XP today
  const streakAtRisk = streak > 0 && xpToday < 100;
  const xpNeededForStreak = Math.max(0, 100 - xpToday);

  const xpInLevelDisplay = xpInLevel.toLocaleString();
  const xpNeededDisplay = xpNeeded.toLocaleString();
  const xpToNextLevel = Math.max(0, xpNeeded - xpInLevel);
  const xpToNextLevelDisplay = xpToNextLevel.toLocaleString();
  const nextLevel = level + 1;

  // Freeze badge label
  const freezeLabel = freezeCount === 1 ? '1 freeze' : `${freezeCount} freezes`;

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

  const handleFreezePress = () => {
    console.log('[XpHeroCard] Freeze badge tapped — freeze count:', freezeCount);
    const maxText = weeklyFreezeMax === 1 ? '1 freeze' : `${weeklyFreezeMax} freezes`;
    const message = `Streak Freezes protect your streak when you miss a day. You get ${maxText} every Monday. Premium members get 3 instead of 1.`;

    if (isPremium) {
      Alert.alert('Streak Freezes', message, [{ text: 'Got it' }]);
    } else {
      Alert.alert('Streak Freezes', message, [
        { text: 'Got it', style: 'cancel' },
        {
          text: 'Upgrade to Premium',
          onPress: () => {
            console.log('[XpHeroCard] Upgrade to Premium pressed from freeze badge');
            onUpgradePress?.();
          },
        },
      ]);
    }
  };

  const freezeAnimIn = () =>
    Animated.spring(freezeScale, { toValue: 0.92, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  const freezeAnimOut = () =>
    Animated.spring(freezeScale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();

  return (
    <LinearGradient
      colors={[isDark ? '#1E2035' : '#F0F2F7', isDark ? '#252740' : '#FFFFFF']}
      style={[styles.card, { borderColor: isDark ? '#3A3C52' : '#D4D6DA' }]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {/* Top row: streak + freeze badge on right */}
      <View style={styles.topRow}>
        <View style={styles.streakContainer}>
          <Text style={styles.streakEmoji}>🔥</Text>
          <Text style={[styles.streakNumber, { color: isDark ? '#F1F5F9' : '#2B2D42' }]}>
            {streak}
          </Text>
          <Text style={[styles.streakLabel, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
            {streak === 1 ? 'Day Streak' : 'Day Streak'}
          </Text>

          {/* Freeze badge — only when freezes available */}
          {showFreezeBadge && (
            <Animated.View style={{ transform: [{ scale: freezeScale }] }}>
              <Pressable
                onPressIn={freezeAnimIn}
                onPressOut={freezeAnimOut}
                onPress={handleFreezePress}
                style={[
                  styles.freezeBadge,
                  { backgroundColor: isDark ? 'rgba(96,165,250,0.15)' : 'rgba(96,165,250,0.12)' },
                ]}
              >
                <Snowflake size={12} color="#60A5FA" strokeWidth={2.5} />
                <Text style={styles.freezeText}>
                  {freezeLabel}
                </Text>
              </Pressable>
            </Animated.View>
          )}
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

        {/* Right side: rank + XP info + premium badge */}
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

          {/* Premium boost badge — only when multiplier > 1 */}
          {showPremiumBadge && (
            <LinearGradient
              colors={['#FFB547', '#FF8A5B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.premiumBadge}
            >
              <Zap size={11} color="#FFFFFF" strokeWidth={2.5} fill="#FFFFFF" />
              <Text style={styles.premiumBadgeText}>
                1.5x Premium Boost
              </Text>
            </LinearGradient>
          )}
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
  freezeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
    marginLeft: 6,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.3)',
  },
  freezeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#60A5FA',
    letterSpacing: 0.2,
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
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: 2,
  },
  premiumBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
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
