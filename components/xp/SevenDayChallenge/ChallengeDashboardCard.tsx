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

// ─── Constants ────────────────────────────────────────────────────────────────

const GREEN = '#4CAF50';
const GOLD = '#FFB547';
const CARD_BG = '#111111';
const TRACK_BG = 'rgba(255,255,255,0.1)';
const MUTED = 'rgba(255,255,255,0.5)';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChallengeDashboardCardProps {
  challenge: SevenDayChallenge;
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
}: {
  progress: number;
  color: string;
  height: number;
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
    <View style={[styles.progressTrack, { height, backgroundColor: TRACK_BG }]}>
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
  onMissionCompleted,
  onCompleteTodaysMission,
}: ChallengeDashboardCardProps) {
  const [autoCompleting, setAutoCompleting] = useState(false);
  const hasAutoCompletedRef = useRef(false);

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
    <View style={styles.card}>
      {/* Left accent border */}
      <View style={styles.leftAccent} />

      <View style={styles.inner}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>
            {'🔥 7-Day Challenge'}
          </Text>
          <Text style={styles.dayCounter}>
            {dayText}
          </Text>
        </View>

        {/* Overall progress bar */}
        <View style={styles.progressSection}>
          <ProgressBar progress={overallProgress} color={GREEN} height={4} />
          <Text style={styles.progressLabel}>
            {completedCount + ' / ' + totalDays + ' days complete'}
          </Text>
        </View>

        {/* Today's mission */}
        <View style={styles.missionSection}>
          <Text style={styles.missionLabel}>
            {'Today:'}
          </Text>
          <Text style={styles.missionTitle}>
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
                color={GREEN}
                height={6}
              />
              <Text style={styles.missionProgressText}>
                {missionProgressText}
              </Text>
            </View>
          )}
        </View>

        {/* Reward hint */}
        {!isTodayDone && (
          <Text style={styles.rewardHint}>
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
    backgroundColor: CARD_BG,
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.25)',
  },
  leftAccent: {
    width: 4,
    backgroundColor: GREEN,
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
    color: '#FFFFFF',
  },
  dayCounter: {
    fontSize: 12,
    fontWeight: '600',
    color: GOLD,
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
    color: MUTED,
    fontWeight: '500',
  },
  missionSection: {
    gap: 4,
  },
  missionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  missionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 4,
  },
  missionProgressSection: {
    gap: 4,
  },
  missionProgressText: {
    fontSize: 11,
    color: MUTED,
    fontWeight: '500',
  },
  completedRow: {
    marginTop: 2,
  },
  completedText: {
    fontSize: 13,
    color: '#34D399',
    fontWeight: '600',
  },
  rewardHint: {
    fontSize: 11,
    color: 'rgba(255,181,71,0.7)',
    fontWeight: '500',
  },
});
