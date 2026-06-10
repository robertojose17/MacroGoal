/**
 * LeagueLeaderboard
 *
 * Full-screen page-sheet modal showing the weekly league leaderboard.
 * Displays promotion zone, neutral zone, and demotion zone with visual
 * separators and a status banner explaining the user's current standing.
 *
 * Uses useLeague() internally so it always shows fresh data.
 * Supports pull-to-refresh.
 */

import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useLeague } from '@/hooks/useLeague';
import { TIER_METADATA, getNextTier, getPrevTier } from '@/types/leagues';
import type { LeagueLeaderboardEntry, LeagueStatus } from '@/types/leagues';

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
      title: 'You\'re at the top — defend your spot',
      subtitle: 'Diamond is the highest league. Stay in the top 5 to remain here.',
      color: TIER_METADATA.diamond.accent,
    };
  }

  if (status.is_in_promotion_zone) {
    const nextLabel = nextMeta ? nextMeta.label : 'the next league';
    const cushionText = status.xp_to_safety > 0
      ? `${status.xp_to_safety.toLocaleString()} XP cushion above the cutoff.`
      : 'You\'re right at the promotion cutoff — keep going!';
    return {
      title: `Top ${status.promotion_zone_size} advance to ${nextLabel}`,
      subtitle: cushionText,
      color: '#50C878',
    };
  }

  if (status.is_in_demotion_zone) {
    if (status.tier === 'bronze') {
      return {
        title: 'Bronze is the floor — you can\'t fall below',
        subtitle: 'Keep earning XP to climb the leaderboard.',
        color: TIER_METADATA.bronze.accent,
      };
    }
    return {
      title: `Earn ${status.xp_to_safety.toLocaleString()} XP to escape the drop zone`,
      subtitle: `Bottom ${status.demotion_zone_size} players drop to the league below.`,
      color: '#EF4444',
    };
  }

  // Neutral zone
  return {
    title: `Earn ${status.xp_to_promotion.toLocaleString()} XP to enter the top ${status.promotion_zone_size}`,
    subtitle: `Top ${status.promotion_zone_size} advance to ${nextMeta ? nextMeta.label : 'the next league'}.`,
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

export default function LeagueLeaderboard({ visible, onClose }: LeagueLeaderboardProps) {
  const isDark = useColorScheme() === 'dark';
  const { status, loading, refresh } = useLeague();
  const [refreshing, setRefreshing] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState('');

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

  // Partition leaderboard using full leaderboard length (includes bots)
  // Promotion: top N by promotion_zone_size
  const promotionEntries = status
    ? status.leaderboard.filter((e) => e.rank <= status.promotion_zone_size)
    : [];

  // Demotion: bottom N by total leaderboard size, excluding anyone already in promotion
  const totalEntries = status ? status.leaderboard.length : 0;
  const demotionThreshold = totalEntries - (status?.demotion_zone_size ?? 0);
  const demotionEntries = status
    ? status.leaderboard.filter(
        (e) => e.rank > demotionThreshold && e.rank > status.promotion_zone_size
      )
    : [];

  // Middle: everything else (mutually exclusive with both zones)
  const middleEntries = status
    ? status.leaderboard.filter(
        (e) => e.rank > status.promotion_zone_size && e.rank <= demotionThreshold
      )
    : [];

  const weekEndsText = timeRemaining ? `Week ends in ${timeRemaining}` : '';

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
              {/* ── Status Banner ── */}
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

              {/* ── Promotion Zone ── */}
              {promotionEntries.length > 0 && (
                <>
                  <View style={styles.zoneHeader}>
                    <Text style={[styles.zoneLabel, { color: '#50C878' }]}>
                      {'▼ PROMOTION ZONE'}
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

              {/* ── Middle Zone ── */}
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

              {/* ── Demotion Zone ── */}
              {demotionEntries.length > 0 && (
                <>
                  <View style={[styles.divider, { backgroundColor: dividerColor }]} />
                  <View style={styles.zoneHeader}>
                    <Text style={[styles.zoneLabel, { color: '#EF4444' }]}>
                      {'▲ DROP ZONE'}
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
  // Status banner
  bannerCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderLeftWidth: 4,
    marginBottom: spacing.xs,
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
  // Zone headers
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
  // Leaderboard row
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
});
