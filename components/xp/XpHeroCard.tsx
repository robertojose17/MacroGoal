/**
 * XpHeroCard
 *
 * Hero card at the top of the dashboard showing:
 * - Section 1: Streak identity (streak rank emoji + name + day count)
 * - Section 2: XP progress (level, bar, XP to next level)
 * - Section 3: League badge
 * - Optional streak-at-risk warning (full-width bottom)
 */

import React, { useEffect, useRef, useState } from 'react';
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
import { Zap, Snowflake } from 'lucide-react-native';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { getStreakRank } from '@/utils/streakRanks';
import LeagueBadge from './LeagueBadge';
import LeagueLeaderboard from './LeagueLeaderboard';
import LeagueWelcomeModal from './LeagueWelcomeModal';
import { useLeague } from '@/hooks/useLeague';
import type { XpStatus } from '@/types/xp';

interface XpHeroCardProps {
  status: XpStatus | null;
  isDark: boolean;
  onUpgradePress?: () => void;
}

const XP_BAR_FILL_COLOR = '#5B9AA8';

export default function XpHeroCard({ status, isDark, onUpgradePress }: XpHeroCardProps) {
  const barAnim = useRef(new Animated.Value(0)).current;
  const freezeScale = useRef(new Animated.Value(1)).current;
  const [showLeagueModal, setShowLeagueModal] = useState(false);
  const { status: leagueStatus } = useLeague();

  const level = status?.current_level ?? 1;
  const progressPercent = status?.level_progress?.progress_percent ?? 0;
  const xpInLevel = status?.level_progress?.xp_in_current_level ?? 0;
  const xpNeeded = status?.level_progress?.xp_needed_for_next_level ?? 100;
  const streak = status?.current_streak ?? 0;
  const xpToday = status?.xp_today ?? 0;
  const totalXp = status?.total_xp ?? 0;

  // Streak rank identity
  const streakRank = getStreakRank(streak);
  const streakEmoji = streakRank.emoji;
  const streakRankName = streakRank.fullLabel;

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

  const xpToNextLevel = Math.max(0, xpNeeded - xpInLevel);
  const nextLevel = level + 1;

  // Pre-compute display strings
  const streakDaysText = String(streak);
  const levelText = 'Level ' + String(level);
  const totalXpText = Number(totalXp).toLocaleString() + ' XP';
  const xpToNextText = Number(xpToNextLevel).toLocaleString() + ' XP to Level ' + String(nextLevel);
  const freezeLabel = freezeCount === 1 ? '1 freeze' : String(freezeCount) + ' freezes';

  // Animate bar on mount / status change
  useEffect(() => {
    Animated.timing(barAnim, {
      toValue: progressPercent / 100,
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [progressPercent, barAnim]);

  const barWidth = barAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const handleFreezePress = () => {
    console.log('[XpHeroCard] Freeze badge tapped — freeze count:', freezeCount);
    const maxText = weeklyFreezeMax === 1 ? '1 freeze' : String(weeklyFreezeMax) + ' freezes';
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

  const dividerColor = isDark ? '#3A3C52' : '#E5E7EB';
  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? '#3A3C52' : '#D4D6DA';
  const primaryTextColor = isDark ? '#F1F5F9' : '#2B2D42';
  const secondaryTextColor = isDark ? '#A0A2B8' : '#6B7280';

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
      {/* ── Section 1: Streak Identity ── */}
      <View style={styles.identitySection}>
        {/* Emoji + rank name row */}
        <View style={styles.rankRow}>
          <Text style={styles.rankEmoji}>
            {streakEmoji}
          </Text>
          <Text style={[styles.rankName, { color: primaryTextColor }]}>
            {streakRankName.toUpperCase()}
          </Text>
        </View>

        {/* Streak count + freeze badge */}
        <View style={styles.streakSubRow}>
          <Text style={[styles.streakDays, { color: secondaryTextColor }]}>
            {streakDaysText}
          </Text>
          <Text style={[styles.streakDaysLabel, { color: secondaryTextColor }]}>
            {' Day Streak'}
          </Text>

          {/* Freeze badge inline */}
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

      {/* ── Divider 1 ── */}
      <View style={[styles.divider, { backgroundColor: dividerColor }]} />

      {/* ── Section 2: XP Progress ── */}
      <View style={styles.xpSection}>
        {/* Level + total XP row */}
        <View style={styles.xpHeaderRow}>
          <Text style={[styles.levelText, { color: primaryTextColor }]}>
            {levelText}
          </Text>
          <Text style={[styles.totalXpText, { color: primaryTextColor }]}>
            {totalXpText}
          </Text>
        </View>

        {/* Horizontal progress bar */}
        <View style={[styles.barBackground, { backgroundColor: isDark ? '#3A3C52' : '#E5E7EB' }]}>
          <Animated.View
            style={[
              styles.barFill,
              {
                width: barWidth,
                backgroundColor: XP_BAR_FILL_COLOR,
              },
            ]}
          />
        </View>

        {/* XP to next level */}
        <Text style={[styles.xpToNext, { color: secondaryTextColor }]}>
          {xpToNextText}
        </Text>

        {/* Premium boost badge */}
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

      {/* ── Divider 2 ── */}
      <View style={[styles.divider, { backgroundColor: dividerColor }]} />

      {/* ── Section 3: League badge ── */}
      <LeagueBadge
        status={leagueStatus}
        isDark={isDark}
        onPress={() => {
          console.log('[XpHeroCard] LeagueBadge pressed — opening leaderboard');
          setShowLeagueModal(true);
        }}
      />

      {/* ── Streak at risk warning ── */}
      {streakAtRisk && (
        <View style={[styles.warningRow, { backgroundColor: isDark ? 'rgba(251,146,60,0.15)' : 'rgba(251,146,60,0.1)' }]}>
          <Text style={styles.warningText}>
            {'⚠️ Earn '}
            {xpNeededForStreak}
            {' more XP to protect your streak'}
          </Text>
        </View>
      )}

      {/* ── League leaderboard modal ── */}
      <LeagueLeaderboard
        visible={showLeagueModal}
        onClose={() => {
          console.log('[XpHeroCard] LeagueLeaderboard closed');
          setShowLeagueModal(false);
        }}
      />

      {/* ── League welcome modal ── */}
      <LeagueWelcomeModal />
    </View>
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

  // ── Section 1: Identity ──
  identitySection: {
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rankEmoji: {
    fontSize: 36,
    lineHeight: 42,
  },
  rankName: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  streakSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
    marginTop: 2,
  },
  streakDays: {
    fontSize: 14,
    fontWeight: '700',
  },
  streakDaysLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  freezeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
    marginLeft: 2,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.3)',
  },
  freezeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#60A5FA',
    letterSpacing: 0.2,
  },

  // ── Divider ──
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.md,
  },

  // ── Section 2: XP Progress ──
  xpSection: {
    gap: spacing.sm,
  },
  xpHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  levelText: {
    fontSize: 17,
    fontWeight: '700',
  },
  totalXpText: {
    fontSize: 17,
    fontWeight: '700',
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
  xpToNext: {
    fontSize: 12,
    fontWeight: '500',
  },

  // ── Premium badge ──
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

  // ── Warning row ──
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
