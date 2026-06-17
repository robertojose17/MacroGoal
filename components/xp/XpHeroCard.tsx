/**
 * XpHeroCard
 *
 * Premium identity card showing:
 * - Semi-arc progress (left) with rank name + streak inside
 * - Level + XP stats column (right, tappable → XpLevelsModal)
 * - Outlined boost badges row (premium + streak multipliers)
 * - Flat league badge at bottom
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
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius } from '@/styles/commonStyles';
import { getXpRank, formatRankFullLabel } from '@/utils/xpRanks';
import SemiArcProgress from './SemiArcProgress';
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
  const rankLabel = formatRankFullLabel(rank);
  const streakDisplay = String(streak);
  const totalXpDisplay = Number(totalXp).toLocaleString();
  const xpToNextDisplay = Number(xpToNextLevel).toLocaleString();
  const premiumBadgeText = '\u26A1 ' + Number(premiumMultiplier).toFixed(1) + 'x Premium';
  const streakBadgeText = '\uD83D\uDD25 ' + Number(streakMultiplier).toFixed(2).replace(/\.?0+$/, '') + 'x Streak';

  const showPremiumBadge = premiumMultiplier > 1;
  const showStreakBadge = streakMultiplier > 1;
  const showBoostRow = showPremiumBadge || showStreakBadge;

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

  const cardBg = isDark ? colors.cardDark : colors.card;
  const cardBorder = isDark ? '#3A3C52' : '#D4D6DA';
  const primaryTextColor = isDark ? '#F1F5F9' : '#2B2D42';
  const secondaryTextColor = isDark ? '#A0A2B8' : '#6B7280';
  const trackColor = isDark ? '#3A3C52' : '#E5E7EB';

  // Gradient overlay: rank color at 8% opacity fading to transparent
  const gradientStart = rank.primaryColor + '14';

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
      {/* 1. Subtle gradient overlay using rank color */}
      <LinearGradient
        colors={[gradientStart, 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* 2. Hero row: arc on left, stats on right */}
      <View style={styles.heroRow}>
        {/* LEFT: Semi-arc with rank name + streak inside */}
        <View style={styles.arcContainer}>
          <SemiArcProgress
            progress={progressPercent / 100}
            size={180}
            strokeWidth={14}
            color={rank.primaryColor}
            trackColor={trackColor}
          >
            {/* Rank name — tappable → XpRanksModal */}
            <Pressable
              onPress={() => {
                console.log('[XpHeroCard] rank tapped');
                setShowRanksModal(true);
              }}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <Text
                style={[styles.rankNameInArc, { color: rank.primaryColor }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {rankLabel}
              </Text>
            </Pressable>

            {/* Streak — tappable → StreakBenefitsModal */}
            <Pressable
              onPress={() => {
                console.log('[XpHeroCard] streak tapped');
                setShowStreakModal(true);
              }}
              style={({ pressed }) => [styles.streakInArc, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Animated.Text style={[styles.streakFlame, { opacity: streakAtRisk ? pulseAnim : 1 }]}>
                {'🔥'}
              </Animated.Text>
              <Text style={[styles.streakNumberInArc, { color: primaryTextColor }]}>
                {streakDisplay}
              </Text>
            </Pressable>
          </SemiArcProgress>
        </View>

        {/* RIGHT: Level + XP stats — right-aligned, tappable → XpLevelsModal */}
        <Pressable
          onPress={() => {
            console.log('[XpHeroCard] level tapped');
            setShowLevelsModal(true);
          }}
          style={({ pressed }) => [styles.statsColumn, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={[styles.levelLabel, { color: secondaryTextColor }]}>
            {'LEVEL'}
          </Text>
          <Text style={[styles.levelNumber, { color: rank.primaryColor }]}>
            {String(level)}
          </Text>
          <Text style={[styles.totalXpText, { color: secondaryTextColor }]}>
            {totalXpDisplay}
            {' XP'}
          </Text>
          <Text style={[styles.xpToNextText, { color: secondaryTextColor }]}>
            {xpToNextDisplay}
            {' to next'}
          </Text>
        </Pressable>
      </View>

      {/* 3. Boost badges row (conditional) */}
      {showBoostRow && (
        <View style={styles.boostRow}>
          {showPremiumBadge && (
            <View style={[styles.boostBadge, { borderColor: '#F59E0B', backgroundColor: '#F59E0B18' }]}>
              <Text style={[styles.boostBadgeText, { color: '#F59E0B' }]}>
                {premiumBadgeText}
              </Text>
            </View>
          )}
          {showStreakBadge && (
            <View style={[styles.boostBadge, { borderColor: '#3B82F6', backgroundColor: '#3B82F618' }]}>
              <Text style={[styles.boostBadgeText, { color: '#3B82F6' }]}>
                {streakBadgeText}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* 4. League badge (flat) */}
      <LeagueBadge
        status={leagueStatus}
        isDark={isDark}
        flat
        onPress={() => {
          console.log('[XpHeroCard] league tapped');
          setShowLeagueModal(true);
        }}
      />

      {/* 6. Modals */}
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
    gap: spacing.sm,
    overflow: 'hidden',
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

  // ── Hero row ──
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  arcContainer: {
    // arc sizes itself (180px wide, ~104px tall)
  },

  // ── Inside arc ──
  rankNameInArc: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  streakInArc: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
  },
  streakFlame: {
    fontSize: 20,
  },
  streakNumberInArc: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },

  // ── Stats column ──
  statsColumn: {
    flex: 1,
    alignItems: 'flex-end',
  },
  levelLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textAlign: 'right',
    marginBottom: 0,
  },
  levelNumber: {
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -2,
    textAlign: 'right',
    lineHeight: 52,
    marginBottom: 2,
  },
  totalXpText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
    marginBottom: 2,
  },
  xpToNextText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'right',
    opacity: 0.7,
  },

  // ── Boost badges ──
  boostRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  boostBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  boostBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
