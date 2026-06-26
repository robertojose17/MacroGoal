import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ActivityIndicator,
  TouchableOpacity,
  Share,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useFlashChallenges } from '@/hooks/useFlashChallenges';
import type { FlashChallengeWithProgress } from '@/hooks/useFlashChallenges';
import type { MetricType } from '@/utils/flashChallengesApi';
import { supabase } from '@/lib/supabase/client';
import {
  getStepsForDate,
  getActiveCaloriesForDate,
  getExerciseMinutesForDate,
  getDistanceMilesForDate,
  getFlightsClimbedForDate,
} from '@/utils/healthKit';

const GOLD = '#FFB547';
const COMPLETE_GREEN = '#22C55E';
const ACCEPT_BLUE = '#3B82F6';
const EXPIRED_GRAY = '#9CA3AF';

interface Props {
  isDark: boolean;
  onXpAwarded: () => void;
}

// Map metric type to Ionicons name
function metricIcon(metric: MetricType): keyof typeof Ionicons.glyphMap {
  switch (metric) {
    case 'steps': return 'footsteps-outline';
    case 'active_calories': return 'flame-outline';
    case 'exercise_minutes': return 'timer-outline';
    case 'distance': return 'map-outline';
    case 'floors': return 'trending-up-outline';
    case 'running_pace': return 'speedometer-outline';
    case 'referral': return 'people-outline';
    default: return 'flash-outline';
  }
}

// Duration label from duration_hours
function durationLabel(hours: number): string {
  if (hours <= 2) return '2h sprint';
  if (hours <= 4) return '4h challenge';
  return 'All day';
}

// Format a progress value nicely
function formatValue(value: number, unit: string): string {
  if (unit === 'steps' || unit === 'floors') return Math.round(value).toLocaleString();
  if (unit === 'cal') return Math.round(value).toLocaleString();
  if (unit === 'min') return Math.round(value).toString();
  if (unit === 'mi') return value.toFixed(1);
  return String(Math.round(value * 10) / 10);
}

// Read current HealthKit value for a metric (returns 0 on Android or error)
async function readCurrentMetric(metric: MetricType): Promise<number> {
  if (Platform.OS === 'android') return 0;
  const date = new Date();
  try {
    switch (metric) {
      case 'steps': {
        const r = await getStepsForDate(date);
        return r.steps ?? 0;
      }
      case 'active_calories': {
        const r = await getActiveCaloriesForDate(date);
        return r.value ?? 0;
      }
      case 'exercise_minutes': {
        const r = await getExerciseMinutesForDate(date);
        return r.value ?? 0;
      }
      case 'distance': {
        const r = await getDistanceMilesForDate(date);
        return r.value ?? 0;
      }
      case 'floors': {
        const r = await getFlightsClimbedForDate(date);
        return r.value ?? 0;
      }
      default:
        return 0;
    }
  } catch {
    return 0;
  }
}

// ─── Animated progress bar ────────────────────────────────────────────────────

interface ProgressBarProps {
  pct: number;
  completed: boolean;
  isDark: boolean;
}

function ProgressBar({ pct, completed, isDark }: ProgressBarProps) {
  const animWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: pct,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [pct, animWidth]);

  const barBg = isDark ? '#2E3050' : '#E5E7EB';
  const fillColor = completed ? COMPLETE_GREEN : colors.success;

  const widthInterpolated = animWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.progressTrack, { backgroundColor: barBg }]}>
      <Animated.View
        style={[
          styles.progressFill,
          { width: widthInterpolated, backgroundColor: fillColor },
        ]}
      />
    </View>
  );
}

// ─── Single challenge row ─────────────────────────────────────────────────────

interface ChallengeRowProps {
  challenge: FlashChallengeWithProgress;
  isDark: boolean;
  onXpAwarded: () => void;
  onAccept: (id: string, baseline: number) => Promise<void>;
}

function ChallengeRow({ challenge, isDark, onXpAwarded, onAccept }: ChallengeRowProps) {
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const isReferral = challenge.metric_type === 'referral';
  const [accepting, setAccepting] = useState(false);

  // Referral-specific: count referrals this week
  const [weekReferrals, setWeekReferrals] = useState(0);
  useEffect(() => {
    if (!isReferral) return;
    const fetchWeekReferrals = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const now = new Date();
      const daysSinceMonday = (now.getDay() + 6) % 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - daysSinceMonday);
      const weekStart = monday.toISOString().split('T')[0];
      const { count } = await supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('referrer_id', user.id)
        .gte('created_at', weekStart);
      setWeekReferrals(count ?? 0);
    };
    fetchWeekReferrals();
  }, [isReferral]);

  const handleShareCode = async () => {
    console.log('[FlashChallengesCard] Share Code pressed for referral challenge');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: rc } = await supabase
        .from('referral_codes')
        .select('code, custom_code')
        .eq('user_id', user.id)
        .maybeSingle();
      const code = rc?.custom_code || rc?.code || '';
      await Share.share({
        message: `I've been tracking my macros with Macro Goal. Join with my code ${code} and we both earn 1,000 XP 💪`,
      });
    } catch (e) {
      console.warn('[FlashChallengesCard] share failed:', e);
    }
  };

  const handleAccept = async () => {
    console.log('[FlashChallengesCard] Accept Challenge pressed for', challenge.id, 'metric:', challenge.metric_type);
    setAccepting(true);
    try {
      const baseline = await readCurrentMetric(challenge.metric_type);
      console.log('[FlashChallengesCard] baseline value read:', baseline, 'for metric:', challenge.metric_type);
      await onAccept(challenge.id, baseline);
      onXpAwarded(); // trigger parent refresh
    } catch (e) {
      console.warn('[FlashChallengesCard] accept failed:', e);
    } finally {
      setAccepting(false);
    }
  };

  const status = challenge.challenge_status;
  const xpLabel = `${challenge.xp_reward} XP`;
  const durationPill = durationLabel(challenge.duration_hours ?? 24);

  // ── COMPLETED ──────────────────────────────────────────────────────────────
  if (status === 'completed' || challenge.completed) {
    return (
      <View style={[styles.challengeRow, { borderTopColor: isDark ? colors.borderDark : colors.border }]}>
        <View style={[styles.iconCircle, { backgroundColor: COMPLETE_GREEN + '22' }]}>
          <Ionicons name="checkmark-circle" size={22} color={COMPLETE_GREEN} />
        </View>
        <View style={styles.challengeCenter}>
          <Text style={[styles.challengeTitle, { color: textColor }]} numberOfLines={1}>
            {challenge.title}
          </Text>
          <Text style={[styles.completedText, { color: COMPLETE_GREEN }]}>
            Completed!
          </Text>
          <ProgressBar pct={100} completed isDark={isDark} />
        </View>
        <View style={styles.badgeColumn}>
          <View style={[styles.xpBadge, { backgroundColor: COMPLETE_GREEN + '22' }]}>
            <Text style={[styles.xpBadgeText, { color: COMPLETE_GREEN }]}>{xpLabel}</Text>
          </View>
        </View>
      </View>
    );
  }

  // ── EXPIRED ────────────────────────────────────────────────────────────────
  if (status === 'expired' || challenge.timeRemaining === 'Expired') {
    return (
      <View style={[styles.challengeRow, { borderTopColor: isDark ? colors.borderDark : colors.border, opacity: 0.5 }]}>
        <View style={[styles.iconCircle, { backgroundColor: isDark ? '#2E3050' : '#F0F2F7' }]}>
          <Ionicons name={metricIcon(challenge.metric_type)} size={20} color={EXPIRED_GRAY} />
        </View>
        <View style={styles.challengeCenter}>
          <Text style={[styles.challengeTitle, { color: mutedColor }]} numberOfLines={1}>
            {challenge.title}
          </Text>
          <Text style={[styles.expiredLabel, { color: mutedColor }]}>
            Time's up
          </Text>
        </View>
        <View style={styles.badgeColumn}>
          <View style={[styles.xpBadge, { backgroundColor: isDark ? '#2E3050' : '#F0F2F7' }]}>
            <Text style={[styles.xpBadgeText, { color: mutedColor }]}>{xpLabel}</Text>
          </View>
        </View>
      </View>
    );
  }

  // ── ACCEPTED ───────────────────────────────────────────────────────────────
  if (status === 'accepted') {
    const progressDisplay = formatValue(challenge.progress, challenge.target_unit);
    const targetDisplay = formatValue(challenge.target_value, challenge.target_unit);
    const unitLabel = challenge.target_unit;

    // Referral override
    const referralComplete = isReferral && weekReferrals >= 3;
    const displayPct = isReferral ? Math.min((weekReferrals / 3) * 100, 100) : challenge.progressPct;
    const progressText = isReferral
      ? `${weekReferrals} / 3 friends`
      : `${progressDisplay} / ${targetDisplay} ${unitLabel}`;

    return (
      <View style={[styles.challengeRow, { borderTopColor: isDark ? colors.borderDark : colors.border }]}>
        <View style={[styles.iconCircle, { backgroundColor: isDark ? '#2E3050' : '#F0F2F7' }]}>
          <Ionicons
            name={metricIcon(challenge.metric_type)}
            size={20}
            color={referralComplete ? COMPLETE_GREEN : GOLD}
          />
        </View>
        <View style={styles.challengeCenter}>
          <View style={styles.challengeTitleRow}>
            <Text style={[styles.challengeTitle, { color: textColor }]} numberOfLines={1}>
              {challenge.title}
            </Text>
          </View>
          <View style={styles.timerProgressRow}>
            <Text style={[styles.progressValueText, { color: mutedColor }]}>
              {progressText}
            </Text>
            <View style={[styles.timerPill, { backgroundColor: isDark ? '#2E3050' : '#F0F2F7' }]}>
              <Ionicons name="time-outline" size={10} color={mutedColor} />
              <Text style={[styles.timerText, { color: mutedColor }]}>
                {challenge.timeRemaining}
              </Text>
            </View>
          </View>
          <View style={styles.progressRow}>
            <ProgressBar pct={displayPct} completed={referralComplete} isDark={isDark} />
            <Text style={[styles.progressLabel, { color: referralComplete ? COMPLETE_GREEN : mutedColor }]}>
              {Math.round(displayPct)}%
            </Text>
          </View>
          {isReferral && !referralComplete && (
            <TouchableOpacity
              style={[styles.shareCodeButton, { backgroundColor: '#14B8A6' + '22' }]}
              onPress={handleShareCode}
              activeOpacity={0.8}
            >
              <Ionicons name="share-outline" size={13} color="#14B8A6" />
              <Text style={[styles.shareCodeText, { color: '#14B8A6' }]}>Share Code</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.badgeColumn}>
          <View style={styles.xpBadge}>
            <Text style={styles.xpBadgeText}>{xpLabel}</Text>
          </View>
        </View>
      </View>
    );
  }

  // ── AVAILABLE (default) ────────────────────────────────────────────────────
  return (
    <View style={[styles.challengeRow, { borderTopColor: isDark ? colors.borderDark : colors.border }]}>
      <View style={[styles.iconCircle, { backgroundColor: isDark ? '#2E3050' : '#F0F2F7' }]}>
        <Ionicons name={metricIcon(challenge.metric_type)} size={20} color={GOLD} />
      </View>
      <View style={styles.challengeCenter}>
        <View style={styles.challengeTitleRow}>
          <Text style={[styles.challengeTitle, { color: textColor }]} numberOfLines={1}>
            {challenge.title}
          </Text>
          <View style={[styles.durationPill, { backgroundColor: isDark ? '#2E3050' : '#F0F2F7' }]}>
            <Text style={[styles.durationText, { color: mutedColor }]}>{durationPill}</Text>
          </View>
        </View>
        <Text style={[styles.challengeDesc, { color: mutedColor }]} numberOfLines={2}>
          {challenge.description}
        </Text>
        <TouchableOpacity
          style={[styles.acceptButton, accepting && styles.acceptButtonDisabled]}
          onPress={handleAccept}
          activeOpacity={0.8}
          disabled={accepting}
        >
          {accepting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="flash" size={13} color="#FFFFFF" />
              <Text style={styles.acceptButtonText}>Accept Challenge</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      <View style={styles.badgeColumn}>
        <View style={styles.xpBadge}>
          <Text style={styles.xpBadgeText}>{xpLabel}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Skeleton placeholder ─────────────────────────────────────────────────────

function SkeletonRow({ isDark }: { isDark: boolean }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [shimmer]);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.8] });
  const bg = isDark ? '#2E3050' : '#E5E7EB';

  return (
    <Animated.View style={[styles.skeletonRow, { opacity }]}>
      <View style={[styles.skeletonCircle, { backgroundColor: bg }]} />
      <View style={styles.skeletonLines}>
        <View style={[styles.skeletonLine, { width: '60%', backgroundColor: bg }]} />
        <View style={[styles.skeletonLine, { width: '40%', backgroundColor: bg, marginTop: 6 }]} />
        <View style={[styles.skeletonLine, { width: '100%', backgroundColor: bg, marginTop: 8, height: 6, borderRadius: 3 }]} />
      </View>
    </Animated.View>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────

export default function FlashChallengesCard({ isDark, onXpAwarded }: Props) {
  const { challenges, loading, reload, acceptChallenge } = useFlashChallenges();

  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  // Dynamic subtitle
  const allCompleted = challenges.length > 0 && challenges.every(c => c.challenge_status === 'completed' || c.completed);
  const anyAccepted = challenges.some(c => c.challenge_status === 'accepted');
  const subtitleText = allCompleted
    ? 'All done for today! 🎉'
    : anyAccepted
      ? 'Keep going! Complete before time runs out'
      : 'Accept a challenge to start the clock';

  const handleAccept = async (id: string, baseline: number) => {
    console.log('[FlashChallengesCard] handleAccept called', { id, baseline });
    await acceptChallenge(id, baseline);
    onXpAwarded();
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: cardBg,
          borderColor: cardBorder,
        },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="flash" size={18} color={GOLD} />
          <Text style={[styles.headerTitle, { color: textColor }]}>
            Flash Challenges
          </Text>
        </View>
      </View>

      {/* Subtitle */}
      <Text style={[styles.subtitle, { color: mutedColor }]}>
        {loading ? 'Complete both for up to 1,250 bonus XP' : subtitleText}
      </Text>

      {/* Content */}
      {loading ? (
        <View>
          <SkeletonRow isDark={isDark} />
          <SkeletonRow isDark={isDark} />
        </View>
      ) : challenges.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="small" color={GOLD} />
          <Text style={[styles.emptyText, { color: mutedColor }]}>
            Syncing your activity data...
          </Text>
        </View>
      ) : (
        challenges.map((c) => (
          <ChallengeRow
            key={c.id}
            challenge={c}
            isDark={isDark}
            onXpAwarded={onXpAwarded}
            onAccept={handleAccept}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerTitle: {
    ...typography.bodyBold,
    fontWeight: '700',
    marginLeft: spacing.xs,
  },
  subtitle: {
    ...typography.small,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  // Challenge row
  challengeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  challengeCenter: {
    flex: 1,
    minWidth: 0,
  },
  challengeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  challengeTitle: {
    ...typography.caption,
    fontWeight: '600',
    flex: 1,
  },
  challengeDesc: {
    ...typography.small,
    marginTop: 2,
  },
  // Duration pill (available state)
  durationPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    flexShrink: 0,
  },
  durationText: {
    fontSize: 10,
    fontWeight: '500',
  },
  // Accept button
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: spacing.sm,
    paddingVertical: 7,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: ACCEPT_BLUE,
  },
  acceptButtonDisabled: {
    opacity: 0.6,
  },
  acceptButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Accepted state: timer + progress row
  timerProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  progressValueText: {
    fontSize: 11,
    fontWeight: '500',
    flex: 1,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    flexShrink: 0,
  },
  timerText: {
    fontSize: 10,
    fontWeight: '500',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: '600',
    minWidth: 36,
    textAlign: 'right',
  },
  // Completed state
  completedText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 4,
  },
  // Expired state
  expiredLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  // Badge column
  badgeColumn: {
    alignItems: 'flex-end',
    gap: spacing.xs,
    flexShrink: 0,
  },
  xpBadge: {
    backgroundColor: '#3B82F6' + '22',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  xpBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
  },
  // Share code button (referral)
  shareCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  shareCodeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  // Empty / loading
  emptyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  emptyText: {
    ...typography.caption,
    textAlign: 'center',
    flex: 1,
  },
  // Skeleton
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  skeletonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  skeletonLines: {
    flex: 1,
  },
  skeletonLine: {
    height: 10,
    borderRadius: 5,
  },
});
