/**
 * ChallengeDashboardCard
 *
 * Compact card shown in the dashboard during an active 7-Day Challenge.
 * Displays progress, today's mission, and auto-completes when the mission
 * target is reached.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import type { SevenDayChallenge } from '@/types/challenge';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChallengeDashboardCardProps {
  challenge: SevenDayChallenge;
  isDark?: boolean;
  onMissionCompleted?: (result: {
    badgeEarned: boolean;
    xpAwarded: number;
  }) => void;
  onCompleteTodaysMission: () => Promise<{
    completed: boolean;
    badgeEarned: boolean;
    xpAwarded: number;
  }>;
}

// ─── Animated Progress Bar ────────────────────────────────────────────────────

function ProgressBar({
  progress,
  color,
  height,
  trackColor,
}: {
  progress: number;
  color: string;
  height: number;
  trackColor: string;
}) {
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: Math.min(Math.max(progress, 0), 1),
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [progress, widthAnim]);

  const widthPercent = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.progressTrack, { height, backgroundColor: trackColor }]}>
      <Animated.View
        style={[
          styles.progressFill,
          { width: widthPercent, height, backgroundColor: color },
        ]}
      />
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChallengeDashboardCard({
  challenge,
  isDark = false,
  onMissionCompleted,
  onCompleteTodaysMission,
}: ChallengeDashboardCardProps) {
  const [autoCompleting, setAutoCompleting] = useState(false);
  const hasAutoCompletedRef = useRef(false);

  // Theme tokens
  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const titleColor = isDark ? colors.textDark : colors.text;
  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const trackColor = isDark ? colors.borderDark : colors.border;
  const shadowStyle = isDark
    ? {}
    : { boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)', elevation: 4 };

  const completedCount = challenge.completed_days.length;
  const totalDays = 7;
  const overallProgress = completedCount / totalDays;
  const mission = challenge.todays_mission;
  const isTodayDone = challenge.is_today_completed === true;

  // Auto-complete when mission target is reached
  useEffect(() => {
    if (!mission) return;
    if (isTodayDone) return;
    if (autoCompleting) return;
    if (hasAutoCompletedRef.current) return;
    if (mission.current < mission.target) return;

    hasAutoCompletedRef.current = true;
    setAutoCompleting(true);

    console.log('[ChallengeDashboardCard] Mission target reached — auto-completing day', challenge.current_day);

    onCompleteTodaysMission()
      .then((result) => {
        console.log('[ChallengeDashboardCard] Day completed — badge:', result.badgeEarned, 'xp:', result.xpAwarded);
        onMissionCompleted?.(result);
      })
      .catch((err) => {
        console.error('[ChallengeDashboardCard] auto-complete failed:', err);
        hasAutoCompletedRef.current = false;
      })
      .finally(() => {
        setAutoCompleting(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission?.current, mission?.target, isTodayDone]);

  // Derived display values
  const dayText = 'Day ' + challenge.current_day + ' of ' + totalDays;
  const missionTitle = mission?.title_en ?? 'Complete today\'s mission';
  const missionCurrent = mission?.current ?? 0;
  const missionTarget = mission?.target ?? 1;
  const missionUnit = mission?.unit ?? '';
  const missionProgress = missionTarget > 0 ? missionCurrent / missionTarget : 0;
  const missionProgressText = missionCurrent + ' / ' + missionTarget + (missionUnit ? ' ' + missionUnit : '');

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }, shadowStyle as any]}>
      {/* Left accent border */}
      <View style={styles.leftAccent} />

      <View style={styles.inner}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: titleColor }]}>
            {'🔥 7-Day Challenge'}
          </Text>
          <Text style={[styles.dayCounter, { color: mutedColor }]}>
            {dayText}
          </Text>
        </View>

        {/* Overall progress bar */}
        <View style={styles.progressSection}>
          <ProgressBar progress={overallProgress} color={colors.success} height={4} trackColor={trackColor} />
          <Text style={[styles.progressLabel, { color: mutedColor }]}>
            {completedCount + ' / ' + totalDays + ' days complete'}
          </Text>
        </View>

        {/* Today's mission */}
        <View style={styles.missionSection}>
          <Text style={[styles.missionLabel, { color: mutedColor }]}>
            {'Today:'}
          </Text>
          <Text style={[styles.missionTitle, { color: titleColor }]}>
            {missionTitle}
          </Text>

          {isTodayDone ? (
            <View style={styles.completedRow}>
              <Text style={styles.completedText}>
                {'✅ Day complete! Come back tomorrow.'}
              </Text>
            </View>
          ) : (
            <View style={styles.missionProgressSection}>
              <ProgressBar
                progress={missionProgress}
                color={colors.success}
                height={6}
                trackColor={trackColor}
              />
              <Text style={[styles.missionProgressText, { color: mutedColor }]}>
                {missionProgressText}
              </Text>
            </View>
          )}
        </View>

        {/* Reward hint */}
        {!isTodayDone && (
          <Text style={[styles.rewardHint, { color: mutedColor }]}>
            {'🏅 +500 XP · Challenger Badge on Day 7'}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
  },
  leftAccent: {
    width: 4,
    backgroundColor: colors.success,
  },
  inner: {
    flex: 1,
    padding: 14,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  dayCounter: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressSection: {
    gap: 4,
  },
  progressTrack: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: 999,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  missionSection: {
    gap: 4,
  },
  missionLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  missionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  missionProgressSection: {
    gap: 4,
  },
  missionProgressText: {
    fontSize: 11,
    fontWeight: '500',
  },
  completedRow: {
    marginTop: 2,
  },
  completedText: {
    fontSize: 13,
    color: colors.success,
    fontWeight: '600',
  },
  rewardHint: {
    fontSize: 11,
    fontWeight: '500',
  },
});
