/**
 * LeagueLeaderboard
 *
 * Full-screen page-sheet modal showing the weekly league leaderboard.
 * Displays XP progress, status banner, zone pills, leaderboard, flash challenges,
 * and an "How to Earn XP" reference section.
 *
 * Uses useLeague() internally so it always shows fresh data.
 * Supports pull-to-refresh.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useLeague } from '@/hooks/useLeague';
import { TIER_METADATA, getNextTier, getPrevTier } from '@/types/leagues';
import type { LeagueLeaderboardEntry, LeagueStatus } from '@/types/leagues';
import i18n from '@/lib/i18n';
import { useFlashChallenges } from '@/hooks/useFlashChallenges';
import { acceptChallenge } from '@/utils/flashChallengesApi';
import type { FlashChallenge } from '@/utils/flashChallengesApi';

interface LeagueLeaderboardProps {
  visible: boolean;
  onClose: () => void;
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

/** Build the status banner copy based on league state */
function buildBannerCopy(status: LeagueStatus): { title: string; subtitle: string; color: string } {
  const nextTier = getNextTier(status.tier);
  const nextMeta = nextTier ? TIER_METADATA[nextTier] : null;

  if (status.tier === 'diamond') {
    return {
      title: i18n.t('league.bannerAtTop'),
      subtitle: i18n.t('league.bannerDiamondSub'),
      color: TIER_METADATA.diamond.accent,
    };
  }

  if (status.is_in_promotion_zone) {
    const nextLabel = nextMeta ? nextMeta.label : i18n.t('league.nextLeague');
    const cushionText = status.xp_to_safety > 0
      ? i18n.t('league.bannerPromoCushion', { xp: status.xp_to_safety.toLocaleString() })
      : i18n.t('league.bannerPromoCutoff');
    return {
      title: i18n.t('league.bannerPromoTitle', { count: status.promotion_zone_size, nextLabel }),
      subtitle: cushionText,
      color: '#50C878',
    };
  }

  if (status.is_in_demotion_zone) {
    if (status.tier === 'bronze') {
      return {
        title: i18n.t('league.bannerBronzeFloor'),
        subtitle: i18n.t('league.bannerBronzeSub'),
        color: TIER_METADATA.bronze.accent,
      };
    }
    return {
      title: i18n.t('league.bannerDropTitle', { xp: status.xp_to_safety.toLocaleString() }),
      subtitle: i18n.t('league.bannerDropSub', { count: status.demotion_zone_size }),
      color: '#EF4444',
    };
  }

  // Neutral zone
  return {
    title: i18n.t('league.bannerNeutralTitle', { xp: status.xp_to_promotion.toLocaleString(), count: status.promotion_zone_size }),
    subtitle: i18n.t('league.bannerNeutralSub', { count: status.promotion_zone_size, nextLabel: nextMeta ? nextMeta.label : i18n.t('league.nextLeague') }),
    color: colors.accent,
  };
}

interface LeaderboardRowProps {
  entry: LeagueLeaderboardEntry;
  isPromotion: boolean;
  isDemotion: boolean;
  accentColor: string;
  isDark: boolean;
}

function LeaderboardRow({ entry, isPromotion, isDemotion, accentColor, isDark }: LeaderboardRowProps) {
  const textPrimary = isDark ? colors.textDark : colors.text;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const rowBg = entry.is_you
    ? isDark ? `${accentColor}22` : `${accentColor}18`
    : 'transparent';
  const borderLeft = entry.is_you ? accentColor : 'transparent';

  const displayName = entry.username || `User ${entry.user_id.slice(0, 4).toUpperCase()}`;
  const xpDisplay = entry.xp_this_week.toLocaleString();

  let zoneDot: string | null = null;
  if (isPromotion) zoneDot = '🟢';
  else if (isDemotion) zoneDot = '🔴';

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: rowBg,
          borderLeftColor: borderLeft,
          borderLeftWidth: entry.is_you ? 3 : 0,
        },
      ]}
    >
      {/* Rank */}
      <Text style={[styles.rowRank, { color: entry.is_you ? accentColor : textSecondary }]}>
        {entry.rank}
      </Text>

      {/* Name + YOU pill */}
      <View style={styles.rowNameContainer}>
        <Text style={[styles.rowName, { color: textPrimary }]} numberOfLines={1}>
          {displayName}
        </Text>
        {entry.is_you && (
          <View style={[styles.youPill, { backgroundColor: accentColor }]}>
            <Text style={styles.youPillText}>
              {'★ YOU'}
            </Text>
          </View>
        )}
      </View>

      {/* XP */}
      <Text style={[styles.rowXp, { color: entry.is_you ? accentColor : textPrimary }]}>
        {xpDisplay}
        {' XP'}
      </Text>

      {/* Zone dot */}
      {zoneDot !== null && (
        <Text style={styles.zoneDot}>
          {zoneDot}
        </Text>
      )}
    </View>
  );
}

// ─── Flash Challenges Section ─────────────────────────────────────────────────

function getMetricEmoji(metricType: FlashChallenge['metric_type']): string {
  switch (metricType) {
    case 'steps': return '🏃';
    case 'active_calories': return '🔥';
    case 'exercise_minutes': return '⏱️';
    case 'distance': return '📍';
    case 'floors': return '🏢';
    case 'running_pace': return '⚡';
    case 'referral': return '🤝';
    default: return '⚡';
  }
}

interface FlashChallengesSectionProps {
  isDark: boolean;
}

function FlashChallengesSection({ isDark }: FlashChallengesSectionProps) {
  const { challenges: rawChallenges, loading } = useFlashChallenges();
  const [challenges, setChallenges] = useState<FlashChallenge[]>([]);
  const [accepting, setAccepting] = useState<Set<string>>(new Set());

  useEffect(() => {
    setChallenges(rawChallenges);
  }, [rawChallenges]);

  const textPrimary = isDark ? colors.textDark : colors.text;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const borderColor = isDark ? colors.borderDark : colors.border;
  const dividerColor = isDark ? colors.borderDark : colors.border;

  const activeChallenges = challenges.filter(
    (c) => c.challenge_status === 'available' || c.challenge_status === 'accepted'
  );

  const handleAccept = async (challengeId: string) => {
    console.log('[FlashChallenges] accept pressed', { challengeId });
    setAccepting((prev) => new Set(prev).add(challengeId));
    try {
      await acceptChallenge(challengeId, 0);
      console.log('[FlashChallenges] accept success', { challengeId });
      setChallenges((prev) =>
        prev.map((c) =>
          c.id === challengeId ? { ...c, challenge_status: 'accepted' as const } : c
        )
      );
    } catch (err) {
      console.log('[FlashChallenges] accept error', { challengeId, err });
      Alert.alert('Failed to accept challenge');
    } finally {
      setAccepting((prev) => {
        const next = new Set(prev);
        next.delete(challengeId);
        return next;
      });
    }
  };

  return (
    <View style={[styles.flashSection, { borderTopColor: dividerColor }]}>
      {/* Section header */}
      <View style={styles.earnHeader}>
        <Text style={styles.earnHeaderIcon}>{'⚡'}</Text>
        <Text style={[styles.earnHeaderTitle, { color: textPrimary }]}>
          {'Flash Challenges'}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: spacing.sm }} />
      ) : activeChallenges.length === 0 ? (
        <Text style={[styles.flashEmptyText, { color: textSecondary }]}>
          {'No active challenges right now — check back tomorrow'}
        </Text>
      ) : (
        activeChallenges.map((challenge) => {
          const emoji = getMetricEmoji(challenge.metric_type);
          const xpText = `+${challenge.xp_reward} XP`;
          const isAccepted = challenge.challenge_status === 'accepted';
          const isAvailable = challenge.challenge_status === 'available';
          const statusLabel = isAccepted ? 'Accepted' : 'Available';
          const statusBg = isAccepted ? '#F97316' : '#3B82F6';
          const isAccepting = accepting.has(challenge.id);

          return (
            <View
              key={challenge.id}
              style={[
                styles.flashCard,
                { backgroundColor: cardBg, borderColor },
              ]}
            >
              {/* Left: emoji */}
              <Text style={styles.flashEmoji}>{emoji}</Text>

              {/* Middle: title + description */}
              <View style={styles.flashMiddle}>
                <Text style={[styles.flashTitle, { color: textPrimary }]} numberOfLines={1}>
                  {challenge.title}
                </Text>
                <Text style={[styles.flashDescription, { color: textSecondary }]} numberOfLines={1}>
                  {challenge.description}
                </Text>
              </View>

              {/* Right: XP + status pill + accept button */}
              <View style={styles.flashRight}>
                <Text style={styles.flashXp}>{xpText}</Text>
                <View style={styles.flashStatusRow}>
                  <View style={[styles.flashStatusPill, { backgroundColor: statusBg }]}>
                    <Text style={styles.flashStatusText}>{statusLabel}</Text>
                  </View>
                  {isAvailable && (
                    isAccepting ? (
                      <ActivityIndicator size="small" color={colors.accent} style={styles.flashAcceptSpinner} />
                    ) : (
                      <TouchableOpacity
                        style={styles.flashAcceptButton}
                        onPress={() => handleAccept(challenge.id)}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.flashAcceptText}>{'Accept'}</Text>
                      </TouchableOpacity>
                    )
                  )}
                </View>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

// ─── XP Earn Section ──────────────────────────────────────────────────────────

interface EarnRow {
  emoji: string;
  label: string;
  xp: string;
}

interface EarnCategory {
  title: string;
  rows: EarnRow[];
}

const EARN_CATEGORIES: EarnCategory[] = [
  {
    title: '🍽️ Nutrition',
    rows: [
      { emoji: '🍽️', label: 'Log a meal', xp: '+10 XP' },
      { emoji: '🎯', label: 'Hit calorie goal', xp: '+15 XP' },
      { emoji: '💪', label: 'Hit protein goal (≥80%)', xp: '+20 XP' },
      { emoji: '🥑', label: 'Hit carbs goal', xp: '+20 XP' },
      { emoji: '🧈', label: 'Hit fats goal', xp: '+20 XP' },
    ],
  },
  {
    title: '📸 Check-ins & Progress',
    rows: [
      { emoji: '⚖️', label: 'Log your weight', xp: '+50 XP' },
      { emoji: '📸', label: 'Weight check-in with photo', xp: '+100 XP' },
      { emoji: '🖼️', label: 'Add progress photo', xp: '+50 XP' },
      { emoji: '📣', label: 'Share progress', xp: '+100 XP' },
    ],
  },
  {
    title: '🏃 Activity',
    rows: [
      { emoji: '🏋️', label: 'Workout', xp: '+75 XP' },
      { emoji: '👟', label: 'Steps 5,000+', xp: '+100 XP' },
      { emoji: '👟', label: 'Steps 10,000+', xp: '+125 XP' },
      { emoji: '👟', label: 'Steps 15,000+', xp: '+175 XP' },
      { emoji: '👟', label: 'Steps 20,000+', xp: '+200 XP' },
    ],
  },
  {
    title: '⚡ Flash Challenges',
    rows: [
      { emoji: '⚡', label: 'Complete a Flash Challenge', xp: '+500 XP' },
    ],
  },
  {
    title: '🤝 Community & Referrals',
    rows: [
      { emoji: '🤝', label: 'Refer a friend', xp: '+1,000 XP' },
    ],
  },
];

interface EarnSectionProps {
  isDark: boolean;
}

function EarnXpSection({ isDark }: EarnSectionProps) {
  const textPrimary = isDark ? colors.textDark : colors.text;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const dividerColor = isDark ? colors.borderDark : colors.border;
  const cardBg = isDark ? colors.cardDark : colors.card;
  const multiplierBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)';
  const multiplierBorder = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';

  return (
    <View style={[styles.earnSection, { borderTopColor: dividerColor }]}>
      {/* Section header */}
      <View style={styles.earnHeader}>
        <Text style={styles.earnHeaderIcon}>{'⚡'}</Text>
        <Text style={[styles.earnHeaderTitle, { color: textPrimary }]}>
          {'How to Earn XP'}
        </Text>
      </View>

      {EARN_CATEGORIES.map((cat, catIdx) => (
        <View key={catIdx} style={[styles.earnCategoryBlock, { backgroundColor: cardBg }]}>
          <Text style={[styles.earnCategoryTitle, { color: textSecondary }]}>
            {cat.title}
          </Text>
          {cat.rows.map((row, rowIdx) => {
            const isLast = rowIdx === cat.rows.length - 1;
            return (
              <View key={rowIdx}>
                <View style={styles.earnRow}>
                  <Text style={styles.earnRowEmoji}>{row.emoji}</Text>
                  <Text style={[styles.earnRowLabel, { color: textPrimary }]}>
                    {row.label}
                  </Text>
                  <Text style={styles.earnRowXp}>{row.xp}</Text>
                </View>
                {!isLast && (
                  <View style={[styles.earnRowDivider, { backgroundColor: dividerColor }]} />
                )}
              </View>
            );
          })}
        </View>
      ))}

      {/* Streak Multipliers card */}
      <View style={[styles.multiplierCard, { backgroundColor: multiplierBg, borderColor: multiplierBorder }]}>
        <Text style={[styles.multiplierTitle, { color: textPrimary }]}>
          {'🔥 Streak Multipliers'}
        </Text>
        {[
          { label: '7+ day streak', value: '1.1×' },
          { label: '30+ day streak', value: '1.25×' },
          { label: '90+ day streak', value: '1.5×' },
          { label: '365+ day streak', value: '2.0×' },
          { label: '⭐ Premium', value: '1.5× bonus' },
        ].map((item, idx) => (
          <View key={idx} style={styles.multiplierRow}>
            <Text style={[styles.multiplierLabel, { color: textSecondary }]}>
              {item.label}
            </Text>
            <Text style={[styles.multiplierValue, { color: textPrimary }]}>
              {item.value}
            </Text>
          </View>
        ))}
        <Text style={[styles.multiplierNote, { color: textSecondary }]}>
          {'Multipliers stack — a 30-day streak + Premium = 1.875×'}
        </Text>
      </View>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LeagueLeaderboard({ visible, onClose }: LeagueLeaderboardProps) {
  const isDark = useColorScheme() === 'dark';
  const { status, loading, refresh } = useLeague();
  const [refreshing, setRefreshing] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [leaderboardExpanded, setLeaderboardExpanded] = useState(false);

  // Update countdown every minute
  useEffect(() => {
    if (!status) return;
    const update = () => setTimeRemaining(formatTimeRemaining(status.week_end_iso));
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [status]);

  const handleRefresh = async () => {
    console.log('[LeagueLeaderboard] pull-to-refresh triggered');
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleClose = () => {
    console.log('[LeagueLeaderboard] close pressed');
    onClose();
  };

  const cardBg = isDark ? colors.cardDark : colors.card;
  const textPrimary = isDark ? colors.textDark : colors.text;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const modalBg = isDark ? colors.backgroundDark : colors.background;
  const dividerColor = isDark ? colors.borderDark : colors.border;

  const meta = status ? TIER_METADATA[status.tier] : null;
  const nextTier = status ? getNextTier(status.tier) : null;
  const prevTier = status ? getPrevTier(status.tier) : null;
  const nextMeta = nextTier ? TIER_METADATA[nextTier] : null;
  const prevMeta = prevTier ? TIER_METADATA[prevTier] : null;

  const banner = status ? buildBannerCopy(status) : null;

  // Partition leaderboard
  const promotionEntries = status
    ? status.leaderboard.filter((e) => e.rank <= status.promotion_zone_size)
    : [];

  const totalEntries = status ? status.leaderboard.length : 0;
  const demotionThreshold = totalEntries - (status?.demotion_zone_size ?? 0);
  const demotionEntries = status
    ? status.leaderboard.filter(
        (e) => e.rank > demotionThreshold && e.rank > status.promotion_zone_size
      )
    : [];

  const middleEntries = status
    ? status.leaderboard.filter(
        (e) => e.rank > status.promotion_zone_size && e.rank <= demotionThreshold
      )
    : [];

  const weekEndsText = timeRemaining ? `Week ends in ${timeRemaining}` : '';

  // Zone pill state
  const userZone = status?.is_in_promotion_zone
    ? 'promotion'
    : status?.is_in_demotion_zone
    ? 'demotion'
    : 'neutral';

  const promoCount = status?.promotion_zone_size ?? 0;
  const dropCount = status?.demotion_zone_size ?? 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      transparent={false}
      onRequestClose={handleClose}
    >
      <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: cardBg }]}>
        {/* ── Header ── */}
        <View style={[styles.header, { backgroundColor: cardBg, borderBottomColor: dividerColor }]}>
          <View style={styles.headerLeft}>
            {meta && (
              <Text style={styles.headerEmoji}>{meta.emoji}</Text>
            )}
            <View>
              <Text style={[styles.headerTitle, { color: textPrimary }]}>
                {meta ? meta.label : 'League'}
              </Text>
              {weekEndsText !== '' && (
                <Text style={[styles.headerSubtitle, { color: textSecondary }]}>
                  {weekEndsText}
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.closeButtonText, { color: textPrimary }]}>
              {'✕'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ backgroundColor: modalBg }}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing.xxl }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
            />
          }
        >
          {loading && !status ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={[styles.loadingText, { color: textSecondary }]}>
                Loading league...
              </Text>
            </View>
          ) : status === null ? (
            <View style={styles.loadingContainer}>
              <Text style={[styles.loadingText, { color: textSecondary }]}>
                No league data available.
              </Text>
            </View>
          ) : (
            <>
              {/* ── Leaderboard Accordion ── */}
              <TouchableOpacity
                style={[styles.accordionHeader, { backgroundColor: cardBg }]}
                onPress={() => {
                  const next = !leaderboardExpanded;
                  console.log('[LeagueLeaderboard] leaderboard accordion toggled', { expanded: next });
                  setLeaderboardExpanded(next);
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.accordionTitle, { color: textPrimary }]}>
                  {'🏆 Leaderboard'}
                </Text>
                <Text style={[styles.accordionChevron, { color: textSecondary }]}>
                  {leaderboardExpanded ? '▲' : '▼'}
                </Text>
              </TouchableOpacity>

              {leaderboardExpanded && (
                <>
                  {/* ── B) Status Banner ── */}
                  {banner && (
                    <View
                      style={[
                        styles.bannerCard,
                        {
                          backgroundColor: cardBg,
                          borderLeftColor: banner.color,
                        },
                      ]}
                    >
                      <Text style={[styles.bannerTitle, { color: banner.color }]}>
                        {banner.title}
                      </Text>
                      <Text style={[styles.bannerSubtitle, { color: textSecondary }]}>
                        {banner.subtitle}
                      </Text>
                    </View>
                  )}

                  {/* ── C) Zone Pills ── */}
                  <View style={styles.zonePillsRow}>
                    {/* Promotion pill */}
                    <View
                      style={[
                        styles.zonePill,
                        userZone === 'promotion'
                          ? styles.zonePillActivePromo
                          : { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
                      ]}
                    >
                      <Text style={styles.zonePillDot}>{'🟢'}</Text>
                      <Text
                        style={[
                          styles.zonePillLabel,
                          { color: userZone === 'promotion' ? '#FFFFFF' : textSecondary },
                        ]}
                      >
                        {'Promotion'}
                      </Text>
                      <Text
                        style={[
                          styles.zonePillCount,
                          { color: userZone === 'promotion' ? 'rgba(255,255,255,0.8)' : textSecondary },
                        ]}
                      >
                        {'Top '}
                        {promoCount}
                      </Text>
                    </View>

                    {/* Neutral pill */}
                    <View
                      style={[
                        styles.zonePill,
                        userZone === 'neutral'
                          ? styles.zonePillActiveNeutral
                          : { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
                      ]}
                    >
                      <Text style={styles.zonePillDot}>{'⚪'}</Text>
                      <Text
                        style={[
                          styles.zonePillLabel,
                          { color: userZone === 'neutral' ? '#FFFFFF' : textSecondary },
                        ]}
                      >
                        {'Neutral'}
                      </Text>
                      <Text
                        style={[
                          styles.zonePillCount,
                          { color: userZone === 'neutral' ? 'rgba(255,255,255,0.8)' : textSecondary },
                        ]}
                      >
                        {'Middle'}
                      </Text>
                    </View>

                    {/* Drop Zone pill */}
                    <View
                      style={[
                        styles.zonePill,
                        userZone === 'demotion'
                          ? styles.zonePillActiveDrop
                          : { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
                      ]}
                    >
                      <Text style={styles.zonePillDot}>{'🔴'}</Text>
                      <Text
                        style={[
                          styles.zonePillLabel,
                          { color: userZone === 'demotion' ? '#FFFFFF' : textSecondary },
                        ]}
                      >
                        {'Drop Zone'}
                      </Text>
                      <Text
                        style={[
                          styles.zonePillCount,
                          { color: userZone === 'demotion' ? 'rgba(255,255,255,0.8)' : textSecondary },
                        ]}
                      >
                        {'Bottom '}
                        {dropCount}
                      </Text>
                    </View>
                  </View>

                  {/* ── D) Leaderboard ── */}

                  {/* Promotion Zone */}
                  {promotionEntries.length > 0 && (
                    <>
                      <View style={styles.zoneHeader}>
                        <Text style={[styles.zoneLabel, { color: '#50C878' }]}>
                          {i18n.t('league.promotionZone')}
                        </Text>
                        {nextMeta && (
                          <Text style={styles.zoneTierBadge}>
                            {nextMeta.emoji}
                            {' '}
                            {nextMeta.label}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.zoneCard, { backgroundColor: cardBg }]}>
                        {promotionEntries.map((entry) => (
                          <LeaderboardRow
                            key={entry.user_id}
                            entry={entry}
                            isPromotion
                            isDemotion={false}
                            accentColor={meta?.accent ?? colors.accent}
                            isDark={isDark}
                          />
                        ))}
                      </View>
                    </>
                  )}

                  {/* Middle Zone */}
                  {middleEntries.length > 0 && (
                    <>
                      <View style={[styles.divider, { backgroundColor: dividerColor }]} />
                      <View style={[styles.zoneCard, { backgroundColor: cardBg }]}>
                        {middleEntries.map((entry) => (
                          <LeaderboardRow
                            key={entry.user_id}
                            entry={entry}
                            isPromotion={false}
                            isDemotion={false}
                            accentColor={meta?.accent ?? colors.accent}
                            isDark={isDark}
                          />
                        ))}
                      </View>
                    </>
                  )}

                  {/* Demotion Zone */}
                  {demotionEntries.length > 0 && (
                    <>
                      <View style={[styles.divider, { backgroundColor: dividerColor }]} />
                      <View style={styles.zoneHeader}>
                        <Text style={[styles.zoneLabel, { color: '#EF4444' }]}>
                          {i18n.t('league.dropZone')}
                        </Text>
                        {prevMeta && (
                          <Text style={styles.zoneTierBadge}>
                            {prevMeta.emoji}
                            {' '}
                            {prevMeta.label}
                          </Text>
                        )}
                      </View>
                      <View style={[styles.zoneCard, { backgroundColor: cardBg }]}>
                        {demotionEntries.map((entry) => (
                          <LeaderboardRow
                            key={entry.user_id}
                            entry={entry}
                            isPromotion={false}
                            isDemotion
                            accentColor={meta?.accent ?? colors.accent}
                            isDark={isDark}
                          />
                        ))}
                      </View>
                    </>
                  )}
                </>
              )}

              {/* ── E) Flash Challenges ── */}
              <FlashChallengesSection isDark={isDark} />

              {/* ── F) How to Earn XP ── */}
              <EarnXpSection isDark={isDark} />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  headerEmoji: {
    fontSize: 28,
  },
  headerTitle: {
    ...typography.h3,
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 1,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '500',
  },

  // ── Accordion ─────────────────────────────────────────────────────────────
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  accordionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  accordionChevron: {
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Status banner ─────────────────────────────────────────────────────────
  bannerCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
    borderLeftWidth: 4,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },

  // ── Zone pills ────────────────────────────────────────────────────────────
  zonePillsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.xs,
  },
  zonePill: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 2,
  },
  zonePillActivePromo: {
    backgroundColor: '#50C878',
  },
  zonePillActiveNeutral: {
    backgroundColor: colors.accent,
  },
  zonePillActiveDrop: {
    backgroundColor: '#EF4444',
  },
  zonePillDot: {
    fontSize: 14,
  },
  zonePillLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  zonePillCount: {
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },

  // ── Zone headers ──────────────────────────────────────────────────────────
  zoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  zoneLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  zoneTierBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  zoneCard: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.sm,
  },

  // ── Leaderboard row ───────────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  rowRank: {
    fontSize: 13,
    fontWeight: '700',
    width: 28,
    textAlign: 'center',
  },
  rowNameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  youPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  youPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  rowXp: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  zoneDot: {
    fontSize: 12,
    marginLeft: 2,
  },

  // ── Flash Challenges section ───────────────────────────────────────────────
  flashSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  flashEmptyText: {
    fontSize: 13,
    fontWeight: '400',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  flashCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  flashEmoji: {
    fontSize: 22,
    width: 32,
    textAlign: 'center',
  },
  flashMiddle: {
    flex: 1,
    gap: 2,
  },
  flashTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  flashDescription: {
    fontSize: 12,
    fontWeight: '400',
  },
  flashRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  flashStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  flashAcceptButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  flashAcceptText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  flashAcceptSpinner: {
    width: 28,
    height: 18,
  },
  flashXp: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5CB97B',
  },
  flashStatusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  flashStatusText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // ── Earn XP section ───────────────────────────────────────────────────────
  earnSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  earnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  earnHeaderIcon: {
    fontSize: 18,
  },
  earnHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  earnCategoryBlock: {
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  earnCategoryTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  earnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 4,
    gap: 8,
  },
  earnRowEmoji: {
    fontSize: 16,
    width: 24,
    textAlign: 'center',
  },
  earnRowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  earnRowXp: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5CB97B',
  },
  earnRowDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 36,
  },

  // ── Streak Multipliers card ───────────────────────────────────────────────
  multiplierCard: {
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    gap: 2,
  },
  multiplierTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  multiplierRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  multiplierLabel: {
    fontSize: 13,
    fontWeight: '400',
  },
  multiplierValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  multiplierNote: {
    fontSize: 11,
    fontWeight: '400',
    fontStyle: 'italic',
    marginTop: 6,
    lineHeight: 15,
  },
});
