/**
 * XpHeroCard
 *
 * Premium identity card showing:
 * - Dark teal/navy gradient background (always dark)
 * - LEFT: level number, rank name + icon, XP amount, progress bar
 * - RIGHT: 3D avatar (male/female based on user sex from DB)
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
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getXpRank } from '@/utils/xpRanks';
import RankIcon from '@/components/xp/RankIcon';
import XpRanksModal from '@/components/xp/XpRanksModal';
import StreakBenefitsModal from '@/components/xp/StreakBenefitsModal';
import XpLevelsModal from '@/components/xp/XpLevelsModal';
import LeagueLeaderboard from './LeagueLeaderboard';
import LeagueWelcomeModal from './LeagueWelcomeModal';
import { useLeague } from '@/hooks/useLeague';
import { supabase } from '@/lib/supabase/client';
import type { XpStatus } from '@/types/xp';

const AVATAR_MALE = 'https://esgptfiofoaeguslgvcq.supabase.co/storage/v1/object/public/avatars/avatar_male.png';
const AVATAR_FEMALE = 'https://esgptfiofoaeguslgvcq.supabase.co/storage/v1/object/public/avatars/avatar_female.png';

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
  const [userSex, setUserSex] = useState<'male' | 'female'>('male');

  const { status: leagueStatus } = useLeague();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('users').select('sex').eq('id', user.id).single()
        .then(({ data }) => {
          if (data?.sex) {
            console.log('[XpHeroCard] fetched user sex:', data.sex);
            setUserSex(data.sex as 'male' | 'female');
          }
        });
    });
  }, []);

  const avatarUri = userSex === 'female' ? AVATAR_FEMALE : AVATAR_MALE;

  const level = status?.current_level ?? 1;
  const progressPercent = status?.level_progress?.progress_percent ?? 0;
  const xpInLevel = status?.level_progress?.xp_in_current_level ?? 0;
  const xpNeeded = status?.level_progress?.xp_needed_for_next_level ?? 100;
  const streak = status?.current_streak ?? 0;
  const xpToday = status?.xp_today ?? 0;
  const totalXp = status?.total_xp ?? 0;

  const streakAtRisk = streak > 0 && xpToday < 100;
  const xpToNextLevel = Math.max(0, xpNeeded - xpInLevel);
  const nextLevel = level + 1;

  const rank = getXpRank(level);

  // Pre-compute display strings
  const streakDisplay = String(streak);
  const totalXpDisplay = Number(totalXp).toLocaleString();
  const xpToNextDisplay = Number(xpToNextLevel).toLocaleString();

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

  const consistencyValue = status?.ranking?.consistency_percentile != null && status.ranking.consistency_percentile > 0
    ? 'Top ' + Math.round(100 - status.ranking.consistency_percentile) + '%'
    : 'Top 5%';

  const leaguePosition = '#' + String(leagueStatus?.user_position ?? 1);
  const leagueTierLabel = leagueStatus?.tier_label ?? 'Bronze League';

  return (
    <View style={styles.card}>
      {/* Dark gradient background — always dark */}
      <LinearGradient
        colors={['#0D2137', '#0A2A2A', '#0D2B1F']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* TOP SECTION */}
      <View style={styles.topSection}>

        {/* LEFT CONTENT */}
        <View style={styles.leftContent}>
          <Text style={styles.levelLabel}>{'LEVEL'}</Text>

          {/* Level number + rank info row */}
          <View style={styles.levelRow}>
            <Pressable
              onPress={() => {
                console.log('[XpHeroCard] level number tapped → XpLevelsModal');
                setShowLevelsModal(true);
              }}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={styles.levelNumber}>{String(level)}</Text>
            </Pressable>
            <View style={styles.rankInfo}>
              <Pressable
                onPress={() => {
                  console.log('[XpHeroCard] rank name tapped → XpRanksModal');
                  setShowRanksModal(true);
                }}
                style={({ pressed }) => [styles.rankNameRow, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={styles.rankName} numberOfLines={1} adjustsFontSizeToFit>{rank.tierName}</Text>
                <RankIcon tierIndex={rank.tierIndex} size={28} color={rank.primaryColor} gradientColor={rank.gradientColor} />
              </Pressable>
              <Text style={styles.xpAmount}>{totalXpDisplay} XP</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.progressSection}>
            <Text style={styles.xpToNext}>{xpToNextDisplay} XP to Level {String(nextLevel)}</Text>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: Math.min(100, Math.max(0, progressPercent)) + '%' as `${number}%` }]} />
              </View>
              <Text style={styles.progressPercent}>{Math.round(progressPercent)}%</Text>
            </View>
          </View>
        </View>

        {/* RIGHT: Avatar with glow rings */}
        <View style={styles.avatarContainer} pointerEvents="none">
          <View style={styles.glowRing1} />
          <View style={styles.glowRing2} />
          <View style={styles.avatarImageWrapper}>
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} resizeMode="contain" />
            {/* Bottom fade — blends avatar into card background */}
            <LinearGradient
              colors={['transparent', 'transparent', 'rgba(13,43,31,0.6)', 'rgba(13,43,31,0.95)']}
              locations={[0, 0.5, 0.75, 1]}
              style={styles.avatarBottomFade}
              pointerEvents="none"
            />
            {/* Left fade — blends avatar into left content area */}
            <LinearGradient
              colors={['rgba(13,33,55,0.7)', 'transparent']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.avatarLeftFade}
              pointerEvents="none"
            />
          </View>
        </View>

      </View>

      {/* BOTTOM STATS STRIP */}
      <View style={styles.statsStrip}>

        {/* Streak */}
        <Pressable
          onPress={() => {
            console.log('[XpHeroCard] streak stat tapped → StreakBenefitsModal');
            setShowStreakModal(true);
          }}
          style={({ pressed }) => [styles.statItem, { opacity: pressed ? 0.7 : 1 }]}
        >
          <View style={styles.statIconCircle}>
            <Animated.Text style={[styles.statEmoji, { opacity: streakAtRisk ? pulseAnim : 1 }]}>{'🔥'}</Animated.Text>
          </View>
          <View>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{streakDisplay}</Text>
            <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit>{'Day Streak'}</Text>
          </View>
        </Pressable>

        <View style={styles.statDivider} />

        {/* League */}
        <Pressable
          onPress={() => {
            console.log('[XpHeroCard] league stat tapped → LeagueLeaderboard');
            setShowLeagueModal(true);
          }}
          style={({ pressed }) => [styles.statItem, { opacity: pressed ? 0.7 : 1 }]}
        >
          <View style={styles.statIconCircle}>
            <Text style={styles.statEmoji}>{'🛡️'}</Text>
          </View>
          <View>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{leaguePosition}</Text>
            <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit>{leagueTierLabel}</Text>
          </View>
        </Pressable>

        <View style={styles.statDivider} />

        {/* Consistency */}
        <Pressable
          onPress={() => {
            console.log('[XpHeroCard] consistency stat tapped → XpLevelsModal');
            setShowLevelsModal(true);
          }}
          style={({ pressed }) => [styles.statItem, { opacity: pressed ? 0.7 : 1 }]}
        >
          <View style={styles.statIconCircle}>
            <Text style={styles.statEmoji}>{'📈'}</Text>
          </View>
          <View>
            <Text style={[styles.statValue, { color: '#2DD4BF' }]} numberOfLines={1} adjustsFontSizeToFit>{consistencyValue}</Text>
            <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit>{'Consistency'}</Text>
          </View>
        </Pressable>

      </View>

      {/* MODALS — keep all existing */}
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
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 16 },
      android: { elevation: 8 },
    }),
  },
  topSection: {
    flexDirection: 'row',
    paddingTop: 20,
    paddingLeft: 20,
    paddingBottom: 16,
    paddingRight: 0,
    minHeight: 180,
    overflow: 'hidden',
  },
  leftContent: {
    flex: 1,
    zIndex: 2,
    paddingRight: 8,
  },
  levelLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 2,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  levelNumber: {
    fontSize: 64,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -3,
    lineHeight: 68,
  },
  rankInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  rankNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rankName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  xpAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2DD4BF',
    letterSpacing: 0.2,
  },
  progressSection: {
    marginTop: 14,
  },
  xpToNext: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 6,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 7,
    borderRadius: 4,
    backgroundColor: '#2DD4BF',
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    minWidth: 32,
    textAlign: 'right',
  },
  avatarContainer: {
    width: 150,
    alignSelf: 'stretch',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  glowRing1: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 1,
    borderColor: 'rgba(45,212,191,0.12)',
    alignSelf: 'center',
    bottom: 10,
  },
  glowRing2: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(45,212,191,0.08)',
    alignSelf: 'center',
    bottom: 20,
  },
  avatarImageWrapper: {
    width: 150,
    height: 190,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 150,
    height: 190,
    backgroundColor: 'transparent',
  },
  avatarBottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
  },
  avatarLeftFade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '40%',
  },
  statsStrip: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  statIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statEmoji: {
    fontSize: 14,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 4,
  },
});
