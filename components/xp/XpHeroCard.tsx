/**
 * XpHeroCard
 *
 * Single cohesive identity card showing:
 * - XP rank badge (top-left, tappable → XpRanksModal)
 * - Streak count (top-right, tappable → StreakBenefitsModal)
 * - Level + total XP (tappable → XpLevelsModal)
 * - Animated XP progress bar with glow
 * - Boost badges (premium + streak multipliers)
 * - League badge (flat, no nested card)
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  Pressable,
} from 'react-native';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { getXpRank } from '@/utils/xpRanks';
import XpRankBadge from '@/components/xp/XpRankBadge';
import XpRanksModal from '@/components/xp/XpRanksModal';
import StreakBenefitsModal from '@/components/xp/StreakBenefitsModal';
import XpLevelsModal from '@/components/xp/XpLevelsModal';
import LeagueBadge from './LeagueBadge';
import LeagueLeaderboard from './LeagueLeaderboard';
import LeagueWelcomeModal from './LeagueWelcomeModal';
import { useLeague } from '@/hooks/useLeague';
import type { XpStatus } from '@/types/xp';

interface XpHeroCardProps {
  status: XpStatus | null;
  isDark: boolean;
}

export default function XpHeroCard({ status, isDark }: XpHeroCardProps) {
  const barAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [showRanksModal, setShowRanksModal] = useState(false);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [showLevelsModal, setShowLevelsModal] = useState(false);
  const [showLeagueModal, setShowLeagueModal] = useState(false);

  const { status: leagueStatus } = useLeague();

  const level = status?.current_level ?? 1;
  const progressPercent = status?.level_progress?.progress_percent ?? 0;
  const xpInLevel = status?.level_progress?.xp_in_current_level ?? 0;
  const xpNeeded = status?.level_progress?.xp_needed_for_next_level ?? 100;
  const streak = status?.current_streak ?? 0;
  const xpToday = status?.xp_today ?? 0;
  const totalXp = status?.total_xp ?? 0;
  const premiumMultiplier = status?.premium_multiplier ?? 1;
  const streakMultiplier = status?.streak_multiplier ?? 1;

  const streakAtRisk = streak > 0 && xpToday < 100;
  const xpToNextLevel = Math.max(0, xpNeeded - xpInLevel);
  const nextLevel = level + 1;

  const rank = getXpRank(level);

  // Pre-compute display strings
  const levelText = 'Level ' + String(level);
  const totalXpText = Number(totalXp).toLocaleString() + ' XP';
  const xpToNextText = Number(xpToNextLevel).toLocaleString() + ' XP to Level ' + String(nextLevel);
  const streakDisplay = String(streak);
  const premiumBadgeText = '\u26A1 ' + Number(premiumMultiplier).toFixed(1) + 'x Premium';
  const streakBadgeText = '\uD83D\uDD25 ' + Number(streakMultiplier).toFixed(2).replace(/\.?0+$/, '') + 'x Streak';

  const showPremiumBadge = premiumMultiplier > 1;
  const showStreakBadge = streakMultiplier > 1;
  const showBoostRow = showPremiumBadge || showStreakBadge;

  // Animate XP bar on mount / level change
  useEffect(() => {
    Animated.timing(barAnim, {
      toValue: progressPercent / 100,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [progressPercent, barAnim]);

  // Pulse animation for streak-at-risk
  useEffect(() => {
    if (streakAtRisk) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.5, duration: 750, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 750, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
      return undefined;
    }
  }, [streakAtRisk, pulseAnim]);

  const barWidth = barAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? '#3A3C52' : '#D4D6DA';
  const primaryTextColor = isDark ? '#F1F5F9' : '#2B2D42';
  const secondaryTextColor = isDark ? '#A0A2B8' : '#6B7280';
  const trackColor = isDark ? '#3A3C52' : '#E5E7EB';

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
      {/* ── Top row: rank badge + streak ── */}
      <View style={styles.topRow}>
        {/* Rank badge — tappable → XpRanksModal */}
        <Pressable
          onPress={() => {
            console.log('[XpHeroCard] Rank badge pressed — opening XpRanksModal');
            setShowRanksModal(true);
          }}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <XpRankBadge rank={rank} size="large" />
        </Pressable>

        {/* Streak — tappable → StreakBenefitsModal */}
        <Pressable
          onPress={() => {
            console.log('[XpHeroCard] Streak pressed — opening StreakBenefitsModal');
            setShowStreakModal(true);
          }}
          style={({ pressed }) => [styles.streakPressable, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Animated.Text style={[styles.streakFlame, { opacity: streakAtRisk ? pulseAnim : 1 }]}>
            {'🔥'}
          </Animated.Text>
          <Text style={[styles.streakNumber, { color: primaryTextColor }]}>
            {streakDisplay}
          </Text>
        </Pressable>
      </View>

      {/* ── Level + XP progress — tappable → XpLevelsModal ── */}
      <Pressable
        onPress={() => {
          console.log('[XpHeroCard] Level row pressed — opening XpLevelsModal');
          setShowLevelsModal(true);
        }}
        style={({ pressed }) => [styles.xpSection, { opacity: pressed ? 0.85 : 1 }]}
      >
        {/* Level + total XP row */}
        <View style={styles.levelRow}>
          <Text style={[styles.levelText, { color: primaryTextColor }]}>
            {levelText}
          </Text>
          <Text style={[styles.totalXpText, { color: secondaryTextColor }]}>
            {totalXpText}
          </Text>
        </View>

        {/* XP bar */}
        <View style={[styles.barBackground, { backgroundColor: trackColor }]}>
          <Animated.View
            style={[
              styles.barFill,
              {
                width: barWidth,
                backgroundColor: rank.primaryColor,
                shadowColor: rank.primaryColor,
                shadowOpacity: 0.5,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 0 },
              },
            ]}
          />
        </View>

        {/* XP to next level */}
        <Text style={[styles.xpToNext, { color: secondaryTextColor }]}>
          {xpToNextText}
        </Text>
      </Pressable>

      {/* ── Boost badges row ── */}
      {showBoostRow && (
        <View style={styles.boostRow}>
          {showPremiumBadge && (
            <View style={[styles.boostBadge, { backgroundColor: '#F59E0B' }]}>
              <Text style={styles.boostBadgeText}>
                {premiumBadgeText}
              </Text>
            </View>
          )}
          {showStreakBadge && (
            <View style={[styles.boostBadge, { backgroundColor: '#3B82F6' }]}>
              <Text style={styles.boostBadgeText}>
                {streakBadgeText}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── League badge (flat, no nested card) ── */}
      <View style={styles.leagueSeparator} />
      <LeagueBadge
        status={leagueStatus}
        isDark={isDark}
        flat
        onPress={() => {
          console.log('[XpHeroCard] LeagueBadge pressed — opening leaderboard');
          setShowLeagueModal(true);
        }}
      />

      {/* ── Modals ── */}
      <XpRanksModal
        visible={showRanksModal}
        currentLevel={level}
        onClose={() => {
          console.log('[XpHeroCard] XpRanksModal closed');
          setShowRanksModal(false);
        }}
        isDark={isDark}
      />

      <StreakBenefitsModal
        visible={showStreakModal}
        currentStreak={streak}
        onClose={() => {
          console.log('[XpHeroCard] StreakBenefitsModal closed');
          setShowStreakModal(false);
        }}
        isDark={isDark}
      />

      <XpLevelsModal
        visible={showLevelsModal}
        onClose={() => {
          console.log('[XpHeroCard] XpLevelsModal closed');
          setShowLevelsModal(false);
        }}
        currentLevel={level}
        xpInCurrentLevel={xpInLevel}
        xpNeededForNextLevel={xpNeeded}
        totalXp={totalXp}
      />

      <LeagueLeaderboard
        visible={showLeagueModal}
        onClose={() => {
          console.log('[XpHeroCard] LeagueLeaderboard closed');
          setShowLeagueModal(false);
        }}
      />

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
    gap: spacing.md,
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

  // ── Top row ──
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  streakPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakFlame: {
    fontSize: 22,
  },
  streakNumber: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },

  // ── XP section ──
  xpSection: {
    gap: spacing.sm,
  },
  levelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  levelText: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 44,
  },
  totalXpText: {
    fontSize: 14,
    fontWeight: '500',
  },
  barBackground: {
    height: 10,
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

  // ── Boost badges ──
  boostRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  boostBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  boostBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── League separator ──
  leagueSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginHorizontal: -spacing.lg,
  },
});
