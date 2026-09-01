
/**
 * Social Tab (check-ins.tsx)
 *
 * Renamed from Check-Ins to Social. Contains XP, league, social comparison,
 * flash challenges, 7-day challenge, today's missions, and community leaderboard.
 */

import React, { useState, useCallback, useEffect, useRef, Component } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from '@/hooks/useColorScheme';
import { colors, spacing } from '@/styles/commonStyles';

// ─── XP System ────────────────────────────────────────────────────────────────
import { useXpStatus } from '@/hooks/useXpStatus';
import XpHeroCard from '@/components/xp/XpHeroCard';
import LevelUpModal from '@/components/xp/LevelUpModal';
import SocialComparisonCard from '@/components/xp/SocialComparisonCard';
import StreakBadgeModal from '@/components/xp/StreakBadgeModal';
import TodaysChallengesCard from '@/components/xp/TodaysChallengesCard';
import UnlockMissionModal from '@/components/xp/UnlockMissionModal';
import LeagueCard from '@/components/xp/LeagueCard';
import FlashChallengesCard from '@/components/FlashChallengesCard';
import { CommunityLeaderboard } from '@/components/CommunityLeaderboard';

// ─── 7-Day Challenge ──────────────────────────────────────────────────────────
import { useSevenDayChallenge } from '@/hooks/useSevenDayChallenge';
import ChallengePopup from '@/components/xp/SevenDayChallenge/ChallengePopup';
import ChallengeDashboardCard from '@/components/xp/SevenDayChallenge/ChallengeDashboardCard';
import ChallengeCompleteModal from '@/components/xp/SevenDayChallenge/ChallengeCompleteModal';
import { getChallenge } from '@/utils/sevenDayChallengeApi';

import { reportTodaySteps } from '@/utils/stepsReporter';
import { emitXpRefresh } from '@/utils/xpEvents';
import { reportDailyHealthMetrics } from '@/utils/healthMetricsReporter';
import { getPendingMilestone, markMilestoneCelebrated, resetMilestones } from '@/utils/streakMilestones';
import { useSteps } from '@/hooks/useSteps';
import { useOneSignalTags } from '@/hooks/useOneSignalTags';
import { supabase } from '@/lib/supabase/client';

const CHALLENGE_SHOWN_KEY = 'seven_day_challenge_shown';
const STREAK_MILESTONES = [7, 30, 90, 365];

// ─── Local error boundary ─────────────────────────────────────────────────────
interface CardErrorBoundaryState { hasError: boolean; }
class CardErrorBoundary extends Component<{ children: React.ReactNode; label?: string }, CardErrorBoundaryState> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any) {
    console.error('[Social] CardErrorBoundary caught error in', this.props.label, ':', error);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export default function SocialScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);

  // ─── XP System ──────────────────────────────────────────────────────────────
  const xp = useXpStatus();
  const { steps: localSteps } = useSteps();
  const [unlockModalVisible, setUnlockModalVisible] = useState(false);

  // ─── LevelUp guard ──────────────────────────────────────────────────────────
  const [shownLevelUp, setShownLevelUp] = useState(false);

  // ─── Streak milestone ────────────────────────────────────────────────────────
  const [pendingMilestone, setPendingMilestone] = useState<number | null>(null);
  const celebratingMilestoneRef = useRef<number | null>(null);

  // ─── 7-Day Challenge ────────────────────────────────────────────────────────
  const [showChallengePopup, setShowChallengePopup] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const challenge = useSevenDayChallenge();

  // Sync XP tags to OneSignal
  useOneSignalTags({ status: xp.status });

  // ─── On mount: report steps + health metrics ─────────────────────────────────
  useEffect(() => {
    console.log('[Social] mount — reporting steps, health metrics, and refreshing XP');
    Promise.all([
      reportTodaySteps(),
      reportDailyHealthMetrics(),
    ])
      .then(([stepsResult, metricsResult]) => {
        console.log('[Social] steps report:', stepsResult.reported, '| metrics events:', metricsResult.eventsPosted);
        if (stepsResult.reported) {
          emitXpRefresh();
        }
        xp.refresh();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── LevelUp AsyncStorage guard ─────────────────────────────────────────────
  useEffect(() => {
    const pendingLevel = xp.status?.pending_level_up_to;
    if (!xp.status?.pending_level_up || !pendingLevel) return;
    const key = `@macro_goal/level_up_seen_${pendingLevel}`;
    AsyncStorage.getItem(key).then((seen) => {
      if (!seen) {
        console.log('[Social] LevelUpModal — new level not yet seen:', pendingLevel);
        setShownLevelUp(true);
      }
    });
  }, [xp.status?.pending_level_up, xp.status?.pending_level_up_to]);

  // ─── Streak milestone watcher ────────────────────────────────────────────────
  useEffect(() => {
    const streak = xp.status?.current_streak;
    if (streak == null) return;
    if (streak === 0) {
      resetMilestones();
      return;
    }
    if (!STREAK_MILESTONES.includes(streak)) return;
    getPendingMilestone(streak).then((m) => {
      if (m && pendingMilestone !== m && celebratingMilestoneRef.current !== m) {
        console.log('[Social] streak milestone reached:', m);
        celebratingMilestoneRef.current = m;
        setPendingMilestone(m);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xp.status?.current_streak]);

  // ─── Focus effect: health metrics + challenge popup ──────────────────────────
  useFocusEffect(
    useCallback(() => {
      console.log('[Social] Screen focused — reporting health metrics');
      reportDailyHealthMetrics().then((result) => {
        console.log('[Social] focus health metrics report:', result.eventsPosted);
      }).catch(() => {});

      const checkChallengePopup = async () => {
        try {
          const shown = await AsyncStorage.getItem(CHALLENGE_SHOWN_KEY);
          if (shown) return;

          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (!authUser) return;

          const { data: userData } = await supabase
            .from('users')
            .select('onboarding_completed')
            .eq('id', authUser.id)
            .single();

          if (!userData?.onboarding_completed) return;

          const { challenge: existingChallenge } = await getChallenge();
          if (existingChallenge) {
            await AsyncStorage.setItem(CHALLENGE_SHOWN_KEY, 'true');
            return;
          }

          setTimeout(() => {
            console.log('[Social] Showing 7-Day Challenge popup');
            setShowChallengePopup(true);
          }, 1000);
        } catch (err) {
          console.warn('[Social] checkChallengePopup error:', err);
        }
      };

      checkChallengePopup();
    }, [])
  );

  const onRefresh = useCallback(async () => {
    console.log('[Social] Pull-to-refresh triggered');
    setRefreshing(true);
    await xp.refresh();
    setRefreshing(false);
  }, [xp]);

  const bg = isDark ? colors.backgroundDark : colors.background;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Social',
          headerLargeTitle: true,
          headerTransparent: true,
          headerShadowVisible: false,
          headerLargeTitleShadowVisible: false,
          headerLargeStyle: { backgroundColor: 'transparent' },
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* ── XP Hero Card ── */}
        <CardErrorBoundary label="XpHeroCard">
          <XpHeroCard status={xp.status} isDark={isDark} />
        </CardErrorBoundary>

        {/* ── League Card ── */}
        <CardErrorBoundary label="LeagueCard">
          <LeagueCard isDark={isDark} />
        </CardErrorBoundary>

        {/* ── Social Comparison ── */}
        {xp.status && (
          <CardErrorBoundary label="SocialComparisonCard">
            <SocialComparisonCard
              ranking={xp.status.ranking}
              isDark={isDark}
            />
          </CardErrorBoundary>
        )}

        {/* ── Flash Challenges ── */}
        <CardErrorBoundary label="FlashChallengesCard">
          <FlashChallengesCard
            isDark={isDark}
            onXpAwarded={() => {
              console.log('[Social] Flash challenge XP awarded, refreshing');
              xp.refresh();
            }}
          />
        </CardErrorBoundary>

        {/* ── 7-Day Challenge Card ── */}
        {challenge.isActive && challenge.challenge && (
          <CardErrorBoundary label="ChallengeDashboardCard">
            <ChallengeDashboardCard
              challenge={challenge.challenge}
              isDark={isDark}
              xpConfig={xp.status?.xp_config}
              onCompleteTodaysMission={challenge.completeTodaysMission}
              onMissionCompleted={(result) => {
                console.log('[Social] Challenge mission completed — badge:', result.badgeEarned, 'xp:', result.xpAwarded);
                if (result.badgeEarned) {
                  setShowCompleteModal(true);
                } else {
                  const dayNum = challenge.challenge?.current_day ?? 0;
                  Alert.alert(
                    t('dashboard.dayComplete', { day: dayNum }),
                    t('dashboard.xpEarned', { xp: result.xpAwarded }),
                    [{ text: t('dashboard.letsGo') }]
                  );
                }
              }}
            />
          </CardErrorBoundary>
        )}

        {/* ── Today's Challenges (XP missions) ── */}
        <CardErrorBoundary label="TodaysChallengesCard">
          <TodaysChallengesCard
            status={xp.status}
            isDark={isDark}
            localSteps={localSteps}
            onRefresh={() => {
              console.log('[Social] TodaysChallengesCard requested XP refresh');
              xp.refresh();
            }}
          />
        </CardErrorBoundary>

        {/* ── Community Leaderboard ── */}
        <View style={styles.leaderboardSection}>
          <CommunityLeaderboard isDark={isDark} refreshKey={0} />
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* ── Level Up Modal ── */}
      <LevelUpModal
        visible={shownLevelUp}
        level={xp.status?.pending_level_up_to ?? 0}
        onDismiss={() => {
          const pendingLevel = xp.status?.pending_level_up_to;
          console.log('[Social] LevelUpModal dismissed — marking level seen:', pendingLevel);
          if (pendingLevel) {
            AsyncStorage.setItem(`@macro_goal/level_up_seen_${pendingLevel}`, 'true');
          }
          setShownLevelUp(false);
          xp.refresh();
        }}
      />

      {/* ── Unlock Mission Modal ── */}
      <UnlockMissionModal
        visible={unlockModalVisible}
        onClose={() => {
          console.log('[Social] UnlockMissionModal closed');
          setUnlockModalVisible(false);
        }}
        onUnlocked={() => {
          console.log('[Social] Mission unlocked — refreshing XP status');
          xp.refresh();
        }}
        xpConfig={xp.status?.xp_config}
      />

      {/* ── Streak Badge Modal ── */}
      <StreakBadgeModal
        visible={pendingMilestone !== null}
        streakDays={pendingMilestone ?? 0}
        onDismiss={() => {
          console.log('[Social] StreakBadgeModal dismissed — milestone:', pendingMilestone);
          if (pendingMilestone) {
            markMilestoneCelebrated(pendingMilestone);
            celebratingMilestoneRef.current = null;
          }
          setPendingMilestone(null);
        }}
      />

      {/* ── 7-Day Challenge Popup ── */}
      <ChallengePopup
        visible={showChallengePopup}
        onClose={() => {
          console.log('[Social] ChallengePopup closed');
          setShowChallengePopup(false);
        }}
        onAccepted={() => {
          console.log('[Social] Challenge accepted — refreshing challenge state');
          challenge.refresh();
        }}
        onAcceptChallenge={challenge.acceptChallenge}
        xpConfig={xp.status?.xp_config}
      />

      {/* ── 7-Day Challenge Complete Modal ── */}
      <ChallengeCompleteModal
        visible={showCompleteModal}
        onClose={() => {
          console.log('[Social] ChallengeCompleteModal closed');
          setShowCompleteModal(false);
        }}
        xpConfig={xp.status?.xp_config}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 120,
  },
  leaderboardSection: {
    marginTop: spacing.sm,
  },
  bottomSpacer: {
    height: 48,
  },
});
