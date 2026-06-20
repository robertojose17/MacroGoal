/**
 * XpHeroCard
 *
 * Single horizontal card with:
 * - LEFT: RankIcon + rank/level text + progress bar
 * - DIVIDER
 * - RIGHT: Streak stat + Total XP stat
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getXpRank } from '@/utils/xpRanks';
import XpRanksModal from '@/components/xp/XpRanksModal';
import StreakBenefitsModal from '@/components/xp/StreakBenefitsModal';
import XpLevelsModal from '@/components/xp/XpLevelsModal';
import LeagueLeaderboard from './LeagueLeaderboard';
import LeagueWelcomeModal from './LeagueWelcomeModal';
import { useLeague } from '@/hooks/useLeague';
import type { XpStatus } from '@/types/xp';
import RankIcon from '@/components/xp/RankIcon';
import { supabase } from '@/lib/supabase/client';

interface XpHeroCardProps {
  status: XpStatus | null;
  isDark: boolean;
}

export default function XpHeroCard({ status, isDark }: XpHeroCardProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const xpTooltipAnim = useRef(new Animated.Value(0)).current;
  const xpTooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showRanksModal, setShowRanksModal] = useState(false);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [showLevelsModal, setShowLevelsModal] = useState(false);
  const [showLeagueModal, setShowLeagueModal] = useState(false);
  const [lbsLost, setLbsLost] = useState(0);

  const { status: leagueStatus } = useLeague();

  const level = status?.current_level ?? 1;
  const progressPercent = status?.level_progress?.progress_percent ?? 0;
  const xpInLevel = status?.level_progress?.xp_in_current_level ?? 0;
  const xpNeeded = status?.level_progress?.xp_needed_for_next_level ?? 100;
  const streak = status?.current_streak ?? 0;
  const xpToday = status?.xp_today ?? 0;
  const totalXp = status?.total_xp ?? 0;

  const streakAtRisk = streak > 0 && xpToday < 100;
  const nextLevel = level + 1;
  const rank = getXpRank(level);

  // Pre-compute display strings
  const streakDisplay = String(streak);
  const xpInLevelDisplay = Number(xpInLevel).toLocaleString();
  const xpNeededDisplay = Number(xpNeeded).toLocaleString();
  const xpToNextDisplay = Number(Math.max(0, xpNeeded - xpInLevel)).toLocaleString();
  const xpTooltipText = xpInLevelDisplay + ' XP / to Level ' + String(nextLevel);
  const totalXpLocalized = Number(totalXp).toLocaleString();
  const levelText = 'Level ' + String(level);
  const xpToNextText = xpToNextDisplay + ' XP to next rank';

  const progressWidth = Math.min(100, Math.max(0, progressPercent));

  // Colors
  const cardBg = isDark ? '#1C1C1E' : '#F5F3EE';
  const textPrimary = isDark ? '#FFFFFF' : '#111827';
  const textSecondary = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const progressTrackColor = isDark ? 'rgba(255,255,255,0.12)' : '#E5E7EB';
  const separatorColor = isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB';
  const statChipBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(92,185,123,0.07)';

  // Fetch lbs lost from check_ins
  useEffect(() => {
    async function fetchLbsLost() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get starting weight from user profile (set during onboarding)
        const { data: userData } = await supabase
          .from('users')
          .select('current_weight')
          .eq('id', user.id)
          .maybeSingle();

        const startWeightKg = parseFloat(String(userData?.current_weight || '0'));
        if (!startWeightKg || isNaN(startWeightKg) || startWeightKg <= 0) return;

        // Get latest check-in weight
        const { data: checkIns } = await supabase
          .from('check_ins')
          .select('weight')
          .eq('user_id', user.id)
          .not('weight', 'is', null)
          .order('date', { ascending: false })
          .limit(1);

        if (!checkIns || checkIns.length === 0) return;

        const latestWeightKg = Number(checkIns[0].weight);
        const lostKg = startWeightKg - latestWeightKg;
        const lostLbs = lostKg * 2.20462;
        const lost = Math.max(0, Math.round(lostLbs * 10) / 10);
        console.log('[XpHeroCard] lbs lost computed:', lost);
        setLbsLost(lost);
      } catch (err) {
        console.log('[XpHeroCard] error fetching lbs lost:', err);
      }
    }
    fetchLbsLost();
  }, [status]);

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

  function handleProgressBarTap() {
    console.log('[XpHeroCard] progress bar tapped → showing XP tooltip');
    if (xpTooltipTimer.current) clearTimeout(xpTooltipTimer.current);
    Animated.timing(xpTooltipAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    xpTooltipTimer.current = setTimeout(() => {
      Animated.timing(xpTooltipAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }, 2000);
  }

  const cardContent = (
    <>
      {/* MAIN ROW */}
      <View style={styles.mainRow}>

        {/* LEFT SECTION */}
        <View style={styles.leftSection}>

          {/* Icon + text row */}
          <View style={styles.iconTextRow}>
            <RankIcon
              tierIndex={rank.tierIndex}
              color={rank.primaryColor}
              gradientColor={rank.gradientColor}
              size={56}
            />

            <View style={styles.rankTextStack}>
              <Text style={styles.rankLabel}>{'RANK'}</Text>

              <Pressable
                onPress={() => {
                  console.log('[XpHeroCard] rank text tapped → XpRanksModal');
                  setShowRanksModal(true);
                }}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.rankTierName, { color: rank.primaryColor }]}>{rank.tierName}</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  console.log('[XpHeroCard] level label tapped → XpLevelsModal');
                  setShowLevelsModal(true);
                }}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.levelText, { color: textSecondary }]}>{levelText}</Text>
              </Pressable>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.progressBarWrapper}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleProgressBarTap}
              style={[styles.progressTrack, { backgroundColor: progressTrackColor }]}
            >
              <View style={styles.progressClip}>
                <LinearGradient
                  colors={[rank.primaryColor, rank.gradientColor]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.progressFill, { width: progressWidth + '%' as `${number}%` }]}
                />
              </View>
              <View style={[styles.progressDot, { left: progressWidth + '%' as `${number}%`, backgroundColor: rank.primaryColor, borderColor: cardBg }]} />
            </TouchableOpacity>
            <Animated.View
              style={[
                styles.xpTooltip,
                { opacity: xpTooltipAnim },
              ]}
              pointerEvents="none"
            >
              <View style={styles.xpTooltipBubble}>
                <Text style={styles.xpTooltipText}>{xpTooltipText}</Text>
              </View>
            </Animated.View>
          </View>

        </View>

        {/* VERTICAL DIVIDER */}
        <View style={[styles.verticalDivider, { backgroundColor: separatorColor }]} />

        {/* RIGHT SECTION */}
        <View style={styles.rightSection}>

          {/* Streak stat */}
          <Pressable
            onPress={() => {
              console.log('[XpHeroCard] streak stat tapped → StreakBenefitsModal');
              setShowStreakModal(true);
            }}
            style={({ pressed }) => [styles.statBlock, { backgroundColor: statChipBg, opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={styles.statValueRow}>
              <Animated.Text style={[styles.statEmoji, { opacity: streakAtRisk ? pulseAnim : 1 }]}>{'🔥'}</Animated.Text>
              <Text style={[styles.statValue, { color: textPrimary }]}>{streakDisplay}</Text>
            </View>
          </Pressable>

          {/* Total XP stat */}
          <View style={[styles.statBlock, { backgroundColor: statChipBg }]}>
            <View style={styles.statValueRow}>
              <Text style={[styles.statValue, styles.xpGreen]}>
                {totalXpLocalized}<Text style={styles.xpSuffix}>{' XP'}</Text>
              </Text>
            </View>
          </View>

        </View>

      </View>
    </>
  );

  return isDark ? (
    <View style={[styles.card, { backgroundColor: cardBg }]}>
      {cardContent}

      {/* MODALS */}
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
  ) : (
    <LinearGradient
      colors={['#FFFFFF', '#F0F7F4']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[styles.card, styles.cardLight]}
    >
      {cardContent}

      {/* MODALS */}
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    marginBottom: 12,
    padding: 12,
    overflow: 'visible',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16 },
      android: { elevation: 3 },
    }),
  },
  cardLight: {
    borderWidth: 1,
    borderColor: 'rgba(92,185,123,0.12)',
  },

  // MAIN ROW
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // LEFT SECTION
  leftSection: {
    flex: 1.6,
    gap: 6,
    overflow: 'visible',
  },
  iconTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rankTextStack: {
    flex: 1,
    gap: 1,
  },
  rankLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#5CB97B',
  },
  rankTierName: {
    fontSize: 18,
    fontWeight: '800',
  },
  levelText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Progress bar
  progressBarWrapper: {
    position: 'relative',
    height: 18,
    justifyContent: 'center',
    overflow: 'visible',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'visible',
    position: 'relative',
  },
  progressClip: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  progressDot: {
    position: 'absolute',
    top: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    marginLeft: -7,
  },
  xpTooltip: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  xpTooltipBubble: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  xpTooltipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // VERTICAL DIVIDER
  verticalDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: 14,
    opacity: 0.6,
  },

  // RIGHT SECTION
  rightSection: {
    width: 100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  statBlock: {
    alignItems: 'center',
    gap: 1,
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 10,
    minWidth: 80,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statEmoji: {
    fontSize: 13,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  xpGreen: {
    color: '#5CB97B',
  },
  xpSuffix: {
    fontSize: 11,
    fontWeight: '500',
    color: '#5CB97B',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
});
