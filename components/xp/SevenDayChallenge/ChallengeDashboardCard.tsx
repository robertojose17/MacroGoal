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
import { LinearGradient } from 'expo-linear-gradient';
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

// ─── Step Node ────────────────────────────────────────────────────────────────

function StepNode({
  dayNum,
  isCompleted,
  isCurrent,
  isDay7,
}: {
  dayNum: number;
  isCompleted: boolean;
  isCurrent: boolean;
  isDay7: boolean;
}) {
  const dayLabel = String(dayNum);

  if (isCompleted) {
    return (
      <View style={[styles.stepCircle, styles.stepCompleted]}>
        <Text style={styles.stepTextCompleted}>{dayLabel}</Text>
      </View>
    );
  }

  if (isCurrent) {
    return (
      <View style={[styles.stepCircle, styles.stepCurrent]}>
        <Text style={styles.stepTextCurrent}>{dayLabel}</Text>
      </View>
    );
  }

  if (isDay7) {
    return (
      <View style={[styles.stepCircle, styles.stepDay7]}>
        <Text style={styles.stepTextDay7}>{dayLabel}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.stepCircle, styles.stepFuture]}>
      <Text style={styles.stepTextFuture}>{dayLabel}</Text>
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
  const totalDays = 7;
  const dayText = 'Day ' + challenge.current_day + ' of ' + totalDays;
  const missionTitle = mission?.title_en ?? "Complete today's mission";
  const missionCurrent = mission?.current ?? 0;
  const missionTarget = mission?.target ?? 1;
  const missionUnit = mission?.unit ?? '';
  const missionProgress = missionTarget > 0 ? missionCurrent / missionTarget : 0;
  const missionProgressText = missionCurrent + ' / ' + missionTarget + (missionUnit ? ' ' + missionUnit + ' logged' : ' logged');

  // Build step nodes array: [node, connector, node, connector, ..., node]
  const stepItems: React.ReactNode[] = [];
  for (let d = 1; d <= totalDays; d++) {
    const isCompleted = challenge.completed_days.includes(d);
    const isCurrent = d === challenge.current_day && !isCompleted;
    const isDay7 = d === 7 && !isCompleted && !isCurrent;
    stepItems.push(
      <StepNode
        key={'node-' + d}
        dayNum={d}
        isCompleted={isCompleted}
        isCurrent={isCurrent}
        isDay7={isDay7}
      />
    );
    if (d < totalDays) {
      const bothCompleted =
        challenge.completed_days.includes(d) && challenge.completed_days.includes(d + 1);
      stepItems.push(
        <View
          key={'connector-' + d}
          style={[
            styles.connector,
            { backgroundColor: bothCompleted ? colors.primary : 'rgba(255,255,255,0.15)' },
          ]}
        />
      );
    }
  }

  return (
    <LinearGradient
      colors={['#0F2D31', '#0A1719']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>{'🔥 7-Day Challenge'}</Text>
        <View style={styles.dayPill}>
          <Text style={styles.dayPillText}>{'📅 ' + dayText}</Text>
        </View>
      </View>

      {/* Tagline */}
      <Text style={styles.tagline}>{'BUILD THE HABIT. EARN THE BADGE.'}</Text>

      {/* Step indicator */}
      <View style={styles.stepsRow}>
        {stepItems}
      </View>

      {/* Inner white card — today's goal */}
      <View style={styles.innerCard}>
        <Text style={styles.eyebrow}>{"TODAY'S GOAL"}</Text>
        <Text style={styles.missionTitle}>{missionTitle}</Text>

        {isTodayDone ? (
          <Text style={styles.completedText}>{'✅ Day complete! Come back tomorrow.'}</Text>
        ) : (
          <>
            <Text style={styles.missionProgressText}>{missionProgressText}</Text>
            <ProgressBar
              progress={missionProgress}
              color={colors.primary}
              height={6}
              trackColor="#E8EEF0"
            />
          </>
        )}
      </View>

      {/* Footer reward hint */}
      {!isTodayDone && (
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <Text style={styles.footerMedal}>{'🏅'}</Text>
            <View style={styles.footerTextBlock}>
              <Text style={styles.footerXp}>{'+500 XP'}</Text>
              <Text style={styles.footerBadge}>{'Challenger Badge on Day 7'}</Text>
            </View>
          </View>
          <View>
            <Text style={styles.viewRewards}>{'View Rewards ›'}</Text>
          </View>
        </View>
      )}
    </LinearGradient>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 18,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  dayPill: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dayPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Tagline
  tagline: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    marginTop: 4,
    marginBottom: 16,
  },

  // Step indicator
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCompleted: {
    backgroundColor: colors.primary,
  },
  stepCurrent: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  },
  stepDay7: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.warning,
  },
  stepFuture: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  stepTextCompleted: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepTextCurrent: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  stepTextDay7: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.warning,
  },
  stepTextFuture: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
  },
  connector: {
    flex: 1,
    height: 2,
  },

  // Inner white card
  innerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.primary,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  missionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0A1719',
    lineHeight: 28,
    marginBottom: 8,
  },
  missionProgressText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 10,
  },
  completedText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.success,
  },

  // Progress bar internals
  progressTrack: {
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: 999,
  },

  // Footer
  footer: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  footerMedal: {
    fontSize: 24,
  },
  footerTextBlock: {
    gap: 2,
  },
  footerXp: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  footerBadge: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
  },
  viewRewards: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
});
