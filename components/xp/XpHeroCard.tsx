/**
 * XpHeroCard
 *
 * Light/white background card showing:
 * - LEFT: rank pill + streak pill, level number (big), total XP, progress bar
 * - RIGHT: league info column
 * - BOTTOM STRIP: Streak | League position | Consistency
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
import { getXpRank } from '@/utils/xpRanks';
import XpRanksModal from '@/components/xp/XpRanksModal';
import StreakBenefitsModal from '@/components/xp/StreakBenefitsModal';
import XpLevelsModal from '@/components/xp/XpLevelsModal';
import LeagueLeaderboard from './LeagueLeaderboard';
import LeagueWelcomeModal from './LeagueWelcomeModal';
import { useLeague } from '@/hooks/useLeague';
import type { XpStatus } from '@/types/xp';

interface XpHeroCardProps {
  status: XpStatus | null;
  isDark: boolean;
}

function computeTimeLeft(weekEndIso: string | undefined): string {
  if (!weekEndIso) return '';
  const diff = new Date(weekEndIso).getTime() - Date.now();
  if (diff <= 0) return '0h left';
  const totalHours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days >= 1) return String(days) + 'd ' + String(hours) + 'h left';
  return String(totalHours) + 'h left';
}

export default function XpHeroCard({ status, isDark }: XpHeroCardProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const xpTooltipAnim = useRef(new Animated.Value(0)).current;
  const xpTooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const streakAtRisk = streak > 0 && xpToday < 100;
  const nextLevel = level + 1;
  const rank = getXpRank(level);

  // Pre-compute display strings
  const streakDisplay = String(streak);
  const totalXpDisplay = Number(totalXp).toLocaleString() + ' XP';
  const xpInLevelDisplay = Number(xpInLevel).toLocaleString() + ' XP';
  const xpNeededDisplay = Number(xpNeeded).toLocaleString() + ' XP';
  const xpToNextDisplay = Number(Math.max(0, xpNeeded - xpInLevel)).toLocaleString();
  const xpTooltipText = xpInLevelDisplay + ' / to Level ' + String(nextLevel);

  const consistencyValue =
    status?.ranking?.consistency_percentile != null && status.ranking.consistency_percentile > 0
      ? 'Top ' + String(Math.round(100 - status.ranking.consistency_percentile)) + '%'
      : 'Top 5%';

  const leaguePosition = '#' + String(leagueStatus?.user_position ?? 1);
  const leagueMemberCount = String(leagueStatus?.member_count ?? 10);
  const leagueTierLabel = leagueStatus?.tier_label ?? 'Bronze League';
  const leagueTierEmoji = leagueStatus?.tier_emoji ?? '🥉';
  const leagueXpThisWeek = String(leagueStatus?.user_xp_this_week ?? 0) + ' XP';
  const timeLeft = computeTimeLeft(leagueStatus?.week_end_iso);
  const positionTimeText = leaguePosition + '/' + leagueMemberCount + ' · ' + timeLeft;

  const progressWidth = Math.min(100, Math.max(0, progressPercent));

  // Colors
  const cardBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const textPrimary = isDark ? '#FFFFFF' : '#111827';
  const textSecondary = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const stripBg = isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6';
  const dividerColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  const progressTrackColor = isDark ? 'rgba(255,255,255,0.12)' : '#E5E7EB';
  const separatorColor = isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB';

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

  return (
    <View style={[styles.card, { backgroundColor: cardBg }]}>

      {/* TOP SECTION */}
      <View style={styles.topSection}>

        {/* LEFT COLUMN */}
        <View style={styles.leftContent}>

          {/* Row 1: Rank pill + Streak pill */}
          <View style={styles.pillRow}>
            <Pressable
              onPress={() => {
                console.log('[XpHeroCard] rank pill tapped → XpRanksModal');
                setShowRanksModal(true);
              }}
              style={({ pressed }) => [styles.rankPill, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={styles.rankPillText} numberOfLines={1} adjustsFontSizeToFit>
                {rank.tierName.toUpperCase()}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                console.log('[XpHeroCard] streak pill tapped → StreakBenefitsModal');
                setShowStreakModal(true);
              }}
              style={({ pressed }) => [styles.streakPill, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Animated.Text style={[styles.streakPillText, { opacity: streakAtRisk ? pulseAnim : 1 }]} numberOfLines={1}>
                {'🔥 ' + streakDisplay + ' day streak'}
              </Animated.Text>
            </Pressable>
          </View>

          {/* Row 2: Level number (big) */}
          <Pressable
            onPress={() => {
              console.log('[XpHeroCard] level number tapped → XpLevelsModal');
              setShowLevelsModal(true);
            }}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.levelNumber, { color: textPrimary }]}>{String(level)}</Text>
          </Pressable>

          {/* Row 3: Total XP */}
          <Text style={[styles.totalXp, { color: textSecondary }]}>{totalXpDisplay}</Text>

          {/* Row 4: Progress bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressLabels}>
              <Text style={[styles.progressLabel, { color: textSecondary }]}>{xpInLevelDisplay}</Text>
              <Text style={[styles.progressLabel, { color: textSecondary }]}>{xpNeededDisplay}</Text>
            </View>
            <View style={styles.progressBarWrapper}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleProgressBarTap}
                style={[styles.progressTrack, { backgroundColor: progressTrackColor }]}
              >
                <View style={[styles.progressFill, { width: progressWidth + '%' as `${number}%` }]} />
                {/* Thumb dot */}
                <View style={[styles.progressThumb, { left: progressWidth + '%' as `${number}%` }]} />
              </TouchableOpacity>
              {/* Tooltip above thumb */}
              <Animated.View
                style={[
                  styles.xpTooltip,
                  { left: progressWidth + '%' as `${number}%`, opacity: xpTooltipAnim },
                ]}
                pointerEvents="none"
              >
                <View style={styles.xpTooltipBubble}>
                  <Text style={styles.xpTooltipText}>{xpTooltipText}</Text>
                </View>
              </Animated.View>
            </View>
          </View>

        </View>

        {/* SEPARATOR */}
        <View style={[styles.columnSeparator, { backgroundColor: separatorColor }]} />

        {/* RIGHT COLUMN — League info */}
        <Pressable
          onPress={() => {
            console.log('[XpHeroCard] league column tapped → LeagueLeaderboard');
            setShowLeagueModal(true);
          }}
          style={({ pressed }) => [styles.rightContent, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={styles.leagueMedal}>{leagueTierEmoji}</Text>
          <Text style={[styles.leagueName, { color: textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
            {leagueTierLabel}
          </Text>
          <Text style={[styles.leaguePositionTime, { color: textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>
            {positionTimeText}
          </Text>
          <Text style={styles.leagueXp}>{leagueXpThisWeek}</Text>
          <Text style={[styles.leagueXpLabel, { color: textSecondary }]}>{'this week'}</Text>
          {leagueStatus?.is_in_promotion_zone && (
            <Text style={styles.promotionText}>{'↑ You\'re moving up'}</Text>
          )}
          {leagueStatus?.is_in_demotion_zone && (
            <Text style={styles.demotionText}>{'↓ At risk'}</Text>
          )}
        </Pressable>

      </View>

      {/* BOTTOM STATS STRIP */}
      <View style={[styles.statsStrip, { backgroundColor: stripBg }]}>

        {/* Streak */}
        <Pressable
          onPress={() => {
            console.log('[XpHeroCard] streak stat tapped → StreakBenefitsModal');
            setShowStreakModal(true);
          }}
          style={({ pressed }) => [styles.statItem, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Animated.Text style={[styles.statEmoji, { opacity: streakAtRisk ? pulseAnim : 1 }]}>{'🔥'}</Animated.Text>
          <View>
            <Text style={[styles.statValue, { color: textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>{streakDisplay}</Text>
            <Text style={[styles.statLabel, { color: textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>{'Day Streak'}</Text>
          </View>
        </Pressable>

        <View style={[styles.statDivider, { backgroundColor: dividerColor }]} />

        {/* League */}
        <Pressable
          onPress={() => {
            console.log('[XpHeroCard] league stat tapped → LeagueLeaderboard');
            setShowLeagueModal(true);
          }}
          style={({ pressed }) => [styles.statItem, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={styles.statEmoji}>{leagueTierEmoji}</Text>
          <View>
            <Text style={[styles.statValue, { color: textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>{leaguePosition}</Text>
            <Text style={[styles.statLabel, { color: textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>{leagueTierLabel}</Text>
          </View>
        </Pressable>

        <View style={[styles.statDivider, { backgroundColor: dividerColor }]} />

        {/* Consistency */}
        <Pressable
          onPress={() => {
            console.log('[XpHeroCard] consistency stat tapped → XpLevelsModal');
            setShowLevelsModal(true);
          }}
          style={({ pressed }) => [styles.statItem, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={styles.statEmoji}>{'📈'}</Text>
          <View>
            <Text style={[styles.statValue, styles.consistencyValue]} numberOfLines={1} adjustsFontSizeToFit>{consistencyValue}</Text>
            <Text style={[styles.statLabel, { color: textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>{'Consistency'}</Text>
          </View>
        </Pressable>

      </View>

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
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: 'visible',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  topSection: {
    flexDirection: 'row',
    paddingTop: 18,
    paddingBottom: 16,
    paddingHorizontal: 16,
    overflow: 'hidden',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },

  // LEFT COLUMN
  leftContent: {
    flex: 1,
    paddingRight: 12,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  rankPill: {
    borderWidth: 1.5,
    borderColor: '#22C55E',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rankPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#22C55E',
    letterSpacing: 0.5,
  },
  streakPill: {
    borderWidth: 1.5,
    borderColor: '#F97316',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  streakPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F97316',
  },
  levelNumber: {
    fontSize: 72,
    fontWeight: '900',
    letterSpacing: -4,
    lineHeight: 76,
    marginBottom: 0,
  },
  totalXp: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 10,
  },

  // Progress bar
  progressSection: {
    marginTop: 2,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  progressBarWrapper: {
    position: 'relative',
    height: 20,
    justifyContent: 'center',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'visible',
    position: 'relative',
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  progressThumb: {
    position: 'absolute',
    top: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#22C55E',
    marginLeft: -7,
    ...Platform.select({
      ios: { shadowColor: '#22C55E', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.4, shadowRadius: 3 },
      android: { elevation: 2 },
    }),
  },
  xpTooltip: {
    position: 'absolute',
    bottom: 22,
    alignItems: 'center',
    marginLeft: -60,
    width: 120,
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

  // SEPARATOR
  columnSeparator: {
    width: 1,
    marginVertical: 4,
    marginHorizontal: 4,
  },

  // RIGHT COLUMN
  rightContent: {
    width: 130,
    paddingLeft: 12,
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 2,
  },
  leagueMedal: {
    fontSize: 32,
    lineHeight: 38,
  },
  leagueName: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  leaguePositionTime: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 1,
  },
  leagueXp: {
    fontSize: 16,
    fontWeight: '800',
    color: '#22C55E',
    marginTop: 4,
  },
  leagueXpLabel: {
    fontSize: 11,
    fontWeight: '400',
  },
  promotionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#22C55E',
    marginTop: 3,
  },
  demotionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#EF4444',
    marginTop: 3,
  },

  // BOTTOM STATS STRIP
  statsStrip: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  statEmoji: {
    fontSize: 22,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  consistencyValue: {
    color: '#22C55E',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    marginVertical: 4,
  },
});
