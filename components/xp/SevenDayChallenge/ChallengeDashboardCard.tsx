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
  Platform,
} from 'react-native';
import type { SevenDayChallenge } from '@/types/challenge';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChallengeDashboardCardProps {
  challenge: SevenDayChallenge;
  isDark?: boolean;
  xpConfig?: Record<string, number>;
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
  isDark,
}: {
  dayNum: number;
  isCompleted: boolean;
  isCurrent: boolean;
  isDay7: boolean;
  isDark: boolean;
}) {
  const dayLabel = String(dayNum);
  const futureTextColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)';
  const futureBorderColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)';

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
    <View style={[styles.stepCircle, styles.stepFuture, { borderColor: futureBorderColor }]}>
      <Text style={[styles.stepTextFuture, { color: futureTextColor }]}>{dayLabel}</Text>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChallengeDashboardCard({
  challenge,
  isDark = false,
  xpConfig,
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

  // Theme-derived values
  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const titleColor = isDark ? colors.textDark : colors.text;
  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const dayPillBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const innerCardBg = isDark ? '#1F2937' : '#F8FAFC';
  const innerCardBorder = isDark ? colors.borderDark : colors.border;
  const footerBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
  const connectorInactiveBg = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)';
  const progressTrackColor = isDark ? colors.borderDark : '#E8EEF0';

  // Derived display values
  const totalDays = 7;
  const dayText = 'Day ' + challenge.current_day + ' of ' + totalDays;

  // Days-remaining badge
  const daysRemaining = challenge.days_remaining;
  const isExpired = challenge.status === 'expired';
  const isCompleted = challenge.status === 'completed';

  let daysLeftText: string | null = null;
  let daysLeftColor: string = mutedColor;
  let daysLeftWeight: '500' | '600' = '500';

  if (isCompleted) {
    daysLeftText = null;
  } else if (isExpired) {
    daysLeftText = 'Expired';
    daysLeftColor = mutedColor;
    daysLeftWeight = '500';
  } else if (daysRemaining !== undefined) {
    if (daysRemaining === 0) {
      daysLeftText = 'Expires today';
      daysLeftColor = colors.protein;
      daysLeftWeight = '600';
    } else if (daysRemaining === 1) {
      daysLeftText = 'Last day!';
      daysLeftColor = colors.protein;
      daysLeftWeight = '600';
    } else if (daysRemaining <= 3) {
      daysLeftText = daysRemaining + ' days left';
      daysLeftColor = colors.fats;
      daysLeftWeight = '600';
    } else {
      daysLeftText = daysRemaining + ' days left';
      daysLeftColor = mutedColor;
      daysLeftWeight = '500';
    }
  }
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
        isDark={isDark}
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
            { backgroundColor: bothCompleted ? colors.primary : connectorInactiveBg },
          ]}
        />
      );
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: titleColor }]}>{'🔥 7-Day Challenge'}</Text>
        <View style={styles.dayPillColumn}>
          <View style={[styles.dayPill, { backgroundColor: dayPillBg }]}>
            <Text style={[styles.dayPillText, { color: mutedColor }]}>{dayText}</Text>
          </View>
          {daysLeftText !== null && (
            <Text style={[styles.daysLeftText, { color: daysLeftColor, fontWeight: daysLeftWeight }]}>
              {daysLeftText}
            </Text>
          )}
        </View>
      </View>

      {/* Tagline */}
      <Text style={[styles.tagline, { color: mutedColor }]}>{'BUILD THE HABIT. EARN THE BADGE.'}</Text>

      {/* Step indicator */}
      <View style={styles.stepsRow}>
        {stepItems}
      </View>

      {/* Inner card — today's goal */}
      <View style={[styles.innerCard, { backgroundColor: innerCardBg, borderColor: innerCardBorder }]}>
        <Text style={styles.eyebrow}>{"TODAY'S GOAL"}</Text>
        <Text style={[styles.missionTitle, { color: titleColor }]}>{missionTitle}</Text>

        {isTodayDone ? (
          <Text style={styles.completedText}>{'✅ Day complete! Come back tomorrow.'}</Text>
        ) : (
          <>
            <Text style={[styles.missionProgressText, { color: mutedColor }]}>{missionProgressText}</Text>
            <ProgressBar
              progress={missionProgress}
              color={colors.primary}
              height={6}
              trackColor={progressTrackColor}
            />
          </>
        )}
      </View>

      {/* Footer reward hint */}
      {!isTodayDone && (
        <View style={[styles.footer, { backgroundColor: footerBg }]}>
          <Text style={styles.footerMedal}>{'🏅'}</Text>
          <Text style={[styles.footerLine, { color: titleColor }]}>
            <Text style={{ fontWeight: '800' }}>{'+' + (xpConfig?.['seven_day_challenge'] ?? 500) + ' XP'}</Text>
            <Text style={[styles.footerLineMuted, { color: mutedColor }]}>{'  ·  Challenger Badge on Day 7'}</Text>
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: 12,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  dayPillColumn: {
    alignItems: 'flex-end',
    gap: 3,
  },
  dayPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dayPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  daysLeftText: {
    fontSize: 11,
    textAlign: 'right',
  },

  // Tagline
  tagline: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
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
  },
  connector: {
    flex: 1,
    height: 2,
  },

  // Inner card
  innerCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
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
    lineHeight: 28,
    marginBottom: 8,
  },
  missionProgressText: {
    fontSize: 13,
    fontWeight: '500',
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
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  footerMedal: {
    fontSize: 24,
  },
  footerLine: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  footerLineMuted: {
    fontSize: 13,
    fontWeight: '500',
  },
});
