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
import RankIcon from '@/components/xp/RankIcon';
import { supabase } from '@/lib/supabase/client';

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

  // Fetch lbs lost from check_ins
  useEffect(() => {
    async function fetchLbsLost() {
      console.log('[XpHeroCard] fetching lbs lost from check_ins');
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('check_ins')
          .select('weight, date')
          .eq('user_id', user.id)
          .not('weight', 'is', null)
          .order('date', { ascending: true });
        if (data && data.length >= 2) {
          const earliest = Number(data[0].weight);
          const latest = Number(data[data.length - 1].weight);
          const lost = Math.max(0, Math.round((earliest - latest) * 10) / 10);
          console.log('[XpHeroCard] lbs lost computed:', lost);
          setLbsLost(lost);
        }
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

  return (
    <View style={[styles.card, { backgroundColor: cardBg }]}>

      {/* TOP SECTION */}
      <View style={styles.topSection}>

        {/* LEFT COLUMN */}
        <View style={styles.leftContent}>

          {/* Row 1: Level label + streak pill */}
          <View style={styles.levelStreakRow}>
            <Pressable
              onPress={() => {
                console.log('[XpHeroCard] level label tapped → XpLevelsModal');
                setShowLevelsModal(true);
              }}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={styles.levelChip}>
                <Text style={[styles.levelLabel, { color: '#FFFFFF' }]}>{'Level ' + String(level)}</Text>
              </View>
            </Pressable>

          </View>

          {/* Row 2+3: Rank text + Total XP (left) with RankIcon badge (right) */}
          <View style={styles.rankRow}>
            <View>
              {/* Row 2: Rank plain text */}
              <Pressable
                onPress={() => {
                  console.log('[XpHeroCard] rank text tapped → XpRanksModal');
                  setShowRanksModal(true);
                }}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={styles.rankPlainText}>{rank.tierName.toUpperCase()}</Text>
              </Pressable>

              {/* Row 3: Total XP */}
              <Text style={[styles.totalXp, { color: textSecondary }]}>{totalXpDisplay}</Text>
            </View>

            <RankIcon
              tierIndex={rank.tierIndex}
              color={rank.primaryColor}
              gradientColor={rank.gradientColor}
              size={52}
            />
          </View>

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
          {/* Medal + League name + position on same row */}
          <View style={styles.leagueTopRow}>
            <Text style={styles.leagueMedal}>{leagueTierEmoji}</Text>
            <View style={styles.leagueTextStack}>
              <Text style={[styles.leagueName, { color: textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                {leagueTierLabel}
              </Text>
              <Text style={[styles.leaguePositionTime, { color: textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>
                {positionTimeText}
              </Text>
            </View>
          </View>
          <Text style={styles.leagueXp}>
  {leagueXpThisWeek}{' '}
  <Text style={{ fontSize: 11, fontWeight: '400', color: '#9CA3AF' }}>this week</Text>
</Text>
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

        {/* Lbs Lost */}
        <View style={styles.statItem}>
          <Text style={styles.statEmoji}>{'⚖️'}</Text>
          <View>
            <Text style={[styles.statValue, { color: textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>{lbsLost.toFixed(1) + ' lbs'}</Text>
            <Text style={[styles.statLabel, { color: textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>{'Lbs Lost'}</Text>
          </View>
        </View>

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
  streakPill: {
    backgroundColor: '#FF8A5B',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  streakPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  levelLabel: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  rankPlainText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#5CB97B',
    letterSpacing: 0.5,
    marginTop: 6,
  },
  levelChip: {
    backgroundColor: '#5B9AA8',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  levelStreakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 0,
    marginBottom: 2,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    backgroundColor: '#5CB97B',
  },
  progressThumb: {
    position: 'absolute',
    top: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#5CB97B',
    marginLeft: -7,
    ...Platform.select({
      ios: { shadowColor: '#5CB97B', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.4, shadowRadius: 3 },
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
    fontSize: 22,
    lineHeight: 26,
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
    color: '#5CB97B',
    marginTop: 4,
  },
  leagueXpLabel: {
    fontSize: 11,
    fontWeight: '400',
  },
  promotionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5CB97B',
    marginTop: 3,
  },
  demotionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#EF4444',
    marginTop: 3,
  },
  leagueTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  leagueTextStack: {
    flex: 1,
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
    color: '#5CB97B',
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
