/**
 * LeagueBadge
 *
 * Compact tappable badge showing the user's current league tier, position,
 * weekly XP progress, and time remaining. Used inside XpHeroCard.
 *
 * State variants:
 * - Promotion zone: green glow + "You're moving up" microcopy
 * - Demotion zone: red glow + "Drop zone" microcopy
 * - Neutral: "Top N promoted" microcopy
 */

import React, { useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { spacing, borderRadius } from '@/styles/commonStyles';
import { TIER_METADATA } from '@/types/leagues';
import type { LeagueStatus } from '@/types/leagues';

interface LeagueBadgeProps {
  status: LeagueStatus | null;
  isDark: boolean;
  onPress: () => void;
  flat?: boolean;
}

/** Format milliseconds remaining as "Xd Yh" */
function formatTimeRemaining(weekEndIso: string): string {
  const now = Date.now();
  const end = new Date(weekEndIso).getTime();
  const diffMs = Math.max(0, end - now);
  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

export default function LeagueBadge({ status, isDark, onPress, flat }: LeagueBadgeProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  if (!status) return null;

  const meta = TIER_METADATA[status.tier];
  const timeRemaining = formatTimeRemaining(status.week_end_iso);

  // Progress bar: user XP vs leader XP (or 1 to avoid division by zero)
  const leaderXp = status.leaderboard.length > 0 ? status.leaderboard[0].xp_this_week : 1;
  const progressRatio = Math.min(1, status.user_xp_this_week / Math.max(leaderXp, 1));
  const progressPercent = Math.round(progressRatio * 100);

  // Zone state
  const isPromotion = status.is_in_promotion_zone;
  const isDemotion = status.is_in_demotion_zone;

  // Microcopy
  let microCopy: string;
  if (isPromotion) {
    microCopy = '↑ You\'re moving up';
  } else if (isDemotion) {
    microCopy = '⚠ Drop zone';
  } else {
    microCopy = `↑ Top ${status.promotion_zone_size} promoted`;
  }

  // Glow color
  let glowColor: string | undefined;
  if (isPromotion) glowColor = 'rgba(80, 200, 120, 0.25)';
  else if (isDemotion) glowColor = 'rgba(239, 68, 68, 0.2)';

  // Microcopy color
  let microColor: string;
  if (isPromotion) microColor = '#50C878';
  else if (isDemotion) microColor = '#EF4444';
  else microColor = isDark ? '#A0A2B8' : '#6B7280';

  // Position text
  const positionText = `#${status.user_position}/${status.member_count}`;

  // XP display
  const xpText = `${status.user_xp_this_week.toLocaleString()} XP this week`;

  const animIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  const animOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 4 }).start();

  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';
  const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  const textPrimary = isDark ? '#F1F5F9' : '#2B2D42';
  const textSecondary = isDark ? '#A0A2B8' : '#6B7280';
  const barBg = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  const containerStyle = flat
    ? [styles.containerFlat]
    : [styles.container, { backgroundColor: glowColor ?? cardBg, borderColor: glowColor ? meta.accent : borderColor }];

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPressIn={() => {
          console.log('[LeagueBadge] press in');
          animIn();
        }}
        onPressOut={() => {
          console.log('[LeagueBadge] press out');
          animOut();
        }}
        onPress={() => {
          console.log('[LeagueBadge] tapped — tier:', status.tier, 'position:', status.user_position);
          onPress();
        }}
        style={containerStyle}
      >
        {/* Left accent bar using tier gradient */}
        <LinearGradient
          colors={meta.gradient}
          style={styles.accentBar}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />

        {/* Content */}
        <View style={styles.content}>
          {/* Top row: emoji + label + position + time */}
          <View style={styles.topRow}>
            <Text style={styles.tierEmoji}>{meta.emoji}</Text>
            <Text style={[styles.tierLabel, { color: textPrimary }]} numberOfLines={1}>
              {meta.label}
            </Text>
            <View style={styles.topRowRight}>
              <Text style={[styles.positionText, { color: meta.accent }]}>
                {positionText}
              </Text>
              <Text style={[styles.separator, { color: textSecondary }]}>
                {'  •  '}
              </Text>
              <Text style={[styles.timeText, { color: textSecondary }]}>
                {timeRemaining}
              </Text>
            </View>
          </View>

          {/* Progress bar row */}
          <View style={styles.barRow}>
            <View style={[styles.barBackground, { backgroundColor: barBg }]}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${progressPercent}%`,
                    backgroundColor: meta.accent,
                  },
                ]}
              />
            </View>
            <Text style={[styles.xpText, { color: textSecondary }]}>
              {xpText}
            </Text>
          </View>

          {/* Microcopy */}
          <Text style={[styles.microCopy, { color: microColor }]}>
            {microCopy}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  containerFlat: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: borderRadius.sm,
  },
  accentBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    gap: 5,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  tierEmoji: {
    fontSize: 14,
  },
  tierLabel: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  topRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  positionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  separator: {
    fontSize: 11,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  barRow: {
    gap: 4,
  },
  barBackground: {
    height: 5,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  xpText: {
    fontSize: 11,
    fontWeight: '500',
  },
  microCopy: {
    fontSize: 11,
    fontWeight: '600',
  },
});
