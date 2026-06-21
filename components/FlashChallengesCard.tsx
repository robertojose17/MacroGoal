import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ActivityIndicator,
  TouchableOpacity,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useFlashChallenges } from '@/hooks/useFlashChallenges';
import { tryAwardFlashChallenge } from '@/utils/xpAwarder';
import type { FlashChallengeWithProgress } from '@/hooks/useFlashChallenges';
import type { MetricType } from '@/utils/flashChallengesApi';
import { supabase } from '@/lib/supabase/client';

const GOLD = '#FFB547';
const MEDIUM_COLOR = '#3B82F6';
const HARD_COLOR = '#F97316';
const COMPLETE_GREEN = '#22C55E';

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
  awardedRef: React.MutableRefObject<Set<string>>;
}

function ChallengeRow({ challenge, isDark, onXpAwarded, awardedRef }: ChallengeRowProps) {
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const difficultyColor = challenge.difficulty === 'medium' ? MEDIUM_COLOR : HARD_COLOR;
  const difficultyLabel = challenge.difficulty === 'medium' ? 'MEDIUM' : 'HARD';
  const isComplete = challenge.completed || challenge.progressPct >= 100;
  const isReferral = challenge.metric_type === 'referral';

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

  // Award XP once when progress hits 100%
  useEffect(() => {
    if (challenge.progressPct >= 100 && !challenge.completed && !awardedRef.current.has(challenge.id)) {
      awardedRef.current.add(challenge.id);
      console.log('[FlashChallengesCard] challenge complete, awarding XP for', challenge.id);
      tryAwardFlashChallenge(challenge.id, challenge.xp_reward);
      onXpAwarded();
    }
  }, [challenge.progressPct, challenge.completed, challenge.id, challenge.xp_reward, onXpAwarded, awardedRef]);

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

  const referralProgressPct = isReferral ? Math.min((weekReferrals / 3) * 100, 100) : challenge.progressPct;
  const referralComplete = isReferral ? weekReferrals >= 3 : isComplete;
  const progressText = referralComplete ? 'Completed!' : isReferral ? `${weekReferrals} / 3` : `${challenge.progressPct}%`;
  const xpLabel = `${challenge.xp_reward} XP`;

  return (
    <View style={[styles.challengeRow, { borderTopColor: isDark ? colors.borderDark : colors.border }]}>
      {/* Icon */}
      <View style={[styles.iconCircle, { backgroundColor: isDark ? '#2E3050' : '#F0F2F7' }]}>
        <Ionicons
          name={metricIcon(challenge.metric_type)}
          size={20}
          color={referralComplete ? COMPLETE_GREEN : GOLD}
        />
      </View>

      {/* Center: title + description + progress */}
      <View style={styles.challengeCenter}>
        <View style={styles.challengeTitleRow}>
          <Text style={[styles.challengeTitle, { color: textColor }]} numberOfLines={1}>
            {challenge.title}
          </Text>
          {referralComplete && (
            <Ionicons name="checkmark-circle" size={16} color={COMPLETE_GREEN} style={{ marginLeft: 4 }} />
          )}
        </View>
        <Text style={[styles.challengeDesc, { color: mutedColor }]} numberOfLines={1}>
          {isReferral ? `${weekReferrals} / 3 friends referred today` : challenge.description}
        </Text>
        <View style={styles.progressRow}>
          <ProgressBar pct={isReferral ? referralProgressPct : challenge.progressPct} completed={referralComplete} isDark={isDark} />
          <Text style={[styles.progressLabel, { color: referralComplete ? COMPLETE_GREEN : mutedColor }]}>
            {progressText}
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

      {/* Right: XP badge + difficulty pill */}
      <View style={styles.badgeColumn}>
        <View style={styles.xpBadge}>
          <Text style={styles.xpBadgeText}>{xpLabel}</Text>
        </View>
        <View style={[styles.difficultyPill, { backgroundColor: difficultyColor + '22' }]}>
          <Text style={[styles.difficultyText, { color: difficultyColor }]}>{difficultyLabel}</Text>
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
  const { challenges, loading, timeRemaining } = useFlashChallenges();
  // Track which challenge IDs have already had XP awarded this session
  const awardedRef = useRef<Set<string>>(new Set());

  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? colors.cardBorderDark : colors.cardBorder;
  const textColor = isDark ? colors.textDark : colors.primaryText;
  const mutedColor = isDark ? colors.textSecondaryDark : colors.textSecondary;

  const isExpired = timeRemaining === 'Expired';

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
      {/* Gold left accent border */}
      <View style={styles.goldAccent} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="flash" size={18} color={GOLD} />
          <Text style={[styles.headerTitle, { color: textColor }]}>
            Flash Challenges
          </Text>
        </View>
        {!loading && !isExpired && timeRemaining.length > 0 && (
          <View style={[styles.timerPill, { backgroundColor: isDark ? '#2E3050' : '#F0F2F7' }]}>
            <Ionicons name="time-outline" size={12} color={mutedColor} />
            <Text style={[styles.timerText, { color: mutedColor }]}>
              {timeRemaining}
            </Text>
          </View>
        )}
      </View>

      {/* Subtitle */}
      <Text style={[styles.subtitle, { color: mutedColor }]}>
        Complete both for up to 1,250 bonus XP
      </Text>

      {/* Content */}
      {loading ? (
        <View>
          <SkeletonRow isDark={isDark} />
          <SkeletonRow isDark={isDark} />
        </View>
      ) : isExpired ? (
        <View style={styles.expiredContainer}>
          <Ionicons name="moon-outline" size={24} color={mutedColor} />
          <Text style={[styles.expiredText, { color: mutedColor }]}>
            Come back tomorrow for new challenges
          </Text>
        </View>
      ) : challenges.length === 0 ? (
        <View style={styles.expiredContainer}>
          <ActivityIndicator size="small" color={GOLD} />
          <Text style={[styles.expiredText, { color: mutedColor }]}>
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
            awardedRef={awardedRef}
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
    marginBottom: spacing.md,
    overflow: 'hidden',
    // shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  goldAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: GOLD,
    borderTopLeftRadius: borderRadius.lg,
    borderBottomLeftRadius: borderRadius.lg,
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
    marginLeft: spacing.xs,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  timerText: {
    fontSize: 11,
    fontWeight: '500',
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
  badgeColumn: {
    alignItems: 'flex-end',
    gap: spacing.xs,
    flexShrink: 0,
  },
  xpBadge: {
    backgroundColor: GOLD + '22',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  xpBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: GOLD,
  },
  difficultyPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  difficultyText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
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
  // Expired / empty
  expiredContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  expiredText: {
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
