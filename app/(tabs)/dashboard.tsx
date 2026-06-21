
import React, { useState, useCallback, useEffect, useRef, Component } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  RefreshControl,
  Modal,
  Animated,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { NotificationBell } from "@/components/NotificationBell";
import PhotoProgressCard from '@/components/PhotoProgressCard';
import ConsistencyScore from '@/components/ConsistencyScore';

import { supabase } from '@/lib/supabase/client';
import { toLocalDateString } from '@/utils/dateUtils';
// ─── XP System ────────────────────────────────────────────────────────────────
import { useXpStatus } from '@/hooks/useXpStatus';
import XpHeroCard from '@/components/xp/XpHeroCard';
import LevelUpModal from '@/components/xp/LevelUpModal';
import SocialComparisonCard from '@/components/xp/SocialComparisonCard';
import StreakBadgeModal from '@/components/xp/StreakBadgeModal';
import TodaysChallengesCard from '@/components/xp/TodaysChallengesCard';
import UnlockMissionModal from '@/components/xp/UnlockMissionModal';
import GoalWeightCard from '@/components/GoalWeightCard';
import LeagueCard from '@/components/xp/LeagueCard';
import { reportTodaySteps } from '@/utils/stepsReporter';
import { emitXpRefresh } from '@/utils/xpEvents';
import { useSteps } from '@/hooks/useSteps';
import { reportDailyHealthMetrics } from '@/utils/healthMetricsReporter';
import { getPendingMilestone, markMilestoneCelebrated, resetMilestones } from '@/utils/streakMilestones';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNotifications } from '@/contexts/NotificationContext';
import { useOneSignalTags } from '@/hooks/useOneSignalTags';
// ─── 7-Day Challenge ──────────────────────────────────────────────────────────
import { useSevenDayChallenge } from '@/hooks/useSevenDayChallenge';
import ChallengePopup from '@/components/xp/SevenDayChallenge/ChallengePopup';
import ChallengeDashboardCard from '@/components/xp/SevenDayChallenge/ChallengeDashboardCard';
import ChallengeCompleteModal from '@/components/xp/SevenDayChallenge/ChallengeCompleteModal';
import { getChallenge } from '@/utils/sevenDayChallengeApi';
import FlashChallengesCard from '@/components/FlashChallengesCard';

const CHALLENGE_SHOWN_KEY = 'seven_day_challenge_shown';

// ─── Local error boundary so a crashing card doesn't blank the whole screen ───
interface CardErrorBoundaryState { hasError: boolean; }
class CardErrorBoundary extends Component<{ children: React.ReactNode; label?: string }, CardErrorBoundaryState> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any) {
    console.error('[Dashboard] CardErrorBoundary caught error in', this.props.label, ':', error);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

interface CheckIn {
  id: string;
  date: string;
  weight: number | null;
  steps: number | null;
  steps_goal: number | null;
  went_to_gym: boolean;
}

interface DailySummary {
  date: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fats: number;
  total_fiber: number;
}

// ─── Greeting helpers ─────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning,';
  if (hour < 18) return 'Good afternoon,';
  return 'Good evening,';
}


// ─── Skeleton block ───────────────────────────────────────────────────────────

function SkeletonBlock({ height, isDark }: { height: number; isDark: boolean }) {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.skeletonBlock,
        {
          height,
          backgroundColor: isDark ? colors.cardDark : colors.card,
          opacity,
        },
      ]}
    />
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [goal, setGoal] = useState<any>(null);
  const [todayCheckIn, setTodayCheckIn] = useState<CheckIn | null>(null);
  const [todaySummary, setTodaySummary] = useState<DailySummary | null>(null);

  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [unlockModalVisible, setUnlockModalVisible] = useState(false);

  // ─── 7-Day Challenge ────────────────────────────────────────────────────────
  const [showChallengePopup, setShowChallengePopup] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const challenge = useSevenDayChallenge();

  // ─── Notifications ──────────────────────────────────────────────────────────
  useNotifications();

  // ─── XP System ──────────────────────────────────────────────────────────────
  const xp = useXpStatus();
  const missionsScrollRef = useRef<ScrollView>(null);

  // ─── Steps (for TodaysChallengesCard optimistic display) ────────────────────
  const { steps: localSteps } = useSteps();
  const [pendingMilestone, setPendingMilestone] = useState<number | null>(null);

  // Sync XP tags to OneSignal for segmentation
  useOneSignalTags({ status: xp.status });

  // On mount: report steps + all health metrics, then refresh XP
  useEffect(() => {
    console.log('[Dashboard] mount — reporting steps, health metrics, and refreshing XP');
    Promise.all([
      reportTodaySteps(),
      reportDailyHealthMetrics(),
    ])
      .then(([stepsResult, metricsResult]) => {
        console.log('[Dashboard] steps report:', stepsResult.reported, '| metrics events:', metricsResult.eventsPosted);
        if (stepsResult.reported) {
          emitXpRefresh();
        }
        xp.refresh();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  // Streak milestone watcher
  useEffect(() => {
    const streak = xp.status?.current_streak;
    if (streak == null) return;
    if (streak === 0) {
      resetMilestones();
      return;
    }
    getPendingMilestone(streak).then((m) => {
      if (m && pendingMilestone !== m) {
        console.log('[Dashboard] streak milestone reached:', m);
        setPendingMilestone(m);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xp.status?.current_streak]);

  const loadTodaySummary = useCallback(async (userId: string, date: string) => {
    try {
      const { data: mealsData } = await supabase
        .from('meals')
        .select(`
          meal_items (
            calories,
            protein,
            carbs,
            fats,
            fiber
          )
        `)
        .eq('user_id', userId)
        .eq('date', date);

      let totalCals = 0;
      let totalP = 0;
      let totalC = 0;
      let totalF = 0;
      let totalFib = 0;

      if (mealsData && mealsData.length > 0) {
        mealsData.forEach((meal: any) => {
          if (meal.meal_items) {
            meal.meal_items.forEach((item: any) => {
              totalCals += item.calories || 0;
              totalP += item.protein || 0;
              totalC += item.carbs || 0;
              totalF += item.fats || 0;
              totalFib += item.fiber || 0;
            });
          }
        });
      }

      setTodaySummary({
        date,
        total_calories: totalCals,
        total_protein: totalP,
        total_carbs: totalC,
        total_fats: totalF,
        total_fiber: totalFib,
      });
    } catch (error) {
      console.error('[Dashboard] Error loading today summary:', error);
    }
  }, []);





  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        console.log('[Dashboard] No user found');
        setLoading(false);
        return;
      }

      setUser(authUser);

      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      if (userData) {
        setUser({ ...authUser, ...userData });
      }

      const { data: goalData } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', authUser.id)
        .eq('is_active', true)
        .maybeSingle();

      if (goalData) {
        setGoal(goalData);
      }

      const today = toLocalDateString();
      const { data: checkInsData } = await supabase
        .from('check_ins')
        .select('*')
        .eq('user_id', authUser.id)
        .eq('date', today)
        .order('created_at', { ascending: false });

      if (checkInsData && checkInsData.length > 0) {
        setTodayCheckIn(checkInsData[0]);
      } else {
        setTodayCheckIn(null);
      }

      await loadTodaySummary(authUser.id, today);

    } catch (error) {
      console.error('[Dashboard] Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadTodaySummary]);

  useFocusEffect(
    useCallback(() => {
      console.log('[Dashboard] Screen focused, loading data and reporting health metrics');
      loadData();
      reportDailyHealthMetrics().then((result) => {
        console.log('[Dashboard] focus health metrics report:', result.eventsPosted);
      }).catch(() => {});

      // ── 7-Day Challenge popup logic ──────────────────────────────────────
      const checkChallengePopup = async () => {
        try {
          const shown = await AsyncStorage.getItem(CHALLENGE_SHOWN_KEY);
          if (shown) return;

          // Verify onboarding is complete
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (!authUser) return;

          const { data: userData } = await supabase
            .from('users')
            .select('onboarding_completed')
            .eq('id', authUser.id)
            .single();

          if (!userData?.onboarding_completed) return;

          // Don't show if user already has a challenge (active or completed)
          const { challenge: existingChallenge } = await getChallenge();
          if (existingChallenge) {
            await AsyncStorage.setItem(CHALLENGE_SHOWN_KEY, 'true');
            return;
          }

          // 1-second delay to let navigation settle
          setTimeout(() => {
            console.log('[Dashboard] Showing 7-Day Challenge popup');
            setShowChallengePopup(true);
          }, 1000);
        } catch (err) {
          console.warn('[Dashboard] checkChallengePopup error:', err);
        }
      };

      checkChallengePopup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadData])
  );

  const onRefresh = useCallback(async () => {
    console.log('[Dashboard] Pull-to-refresh triggered');
    setRefreshing(true);
    // Force steps sync on manual refresh (bypass throttle by clearing the key)
    try {
      await AsyncStorage.removeItem('steps_reporter_last_report_ts');
      console.log('[Dashboard] Cleared steps throttle key for forced sync');
    } catch {}
    const stepsResult = await reportTodaySteps();
    console.log('[Dashboard] Steps sync result:', stepsResult);
    if (stepsResult.reported) {
      emitXpRefresh();
    }
    loadData();
  }, [loadData]);

  const handleQuickCheckIn = useCallback((type: 'weight' | 'steps' | 'gym') => {
    console.log('[Dashboard] Quick check-in pressed, type:', type);
    setShowCheckInModal(false);
    router.push({
      pathname: '/check-in-form',
      params: { type },
    });
  }, [router]);

  // ─── Derived greeting values ─────────────────────────────────────────────
  const greeting = getGreeting();
  const firstName = user?.name?.split(' ')[0] || 'there';

  // ─── Smart insight text ───────────────────────────────────────────────────
  const KG_TO_LBS = 2.20462;
  let insightText = "Let's make today count 💪";
  if (goal?.goal_weight && todayCheckIn?.weight) {
    const diffLbs = Math.abs(
      Math.round((Number(todayCheckIn.weight) - Number(goal.goal_weight)) * KG_TO_LBS * 10) / 10
    );
    insightText = `You're ${diffLbs} lbs from your goal 💙`;
  } else if ((xp.status?.current_streak ?? 0) > 0) {
    const streak = xp.status!.current_streak;
    insightText = `🔥 ${streak}-day streak — keep it going!`;
  }

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
        edges={['top']}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Skeleton header */}
          <View style={styles.header}>
            <View>
              <View style={[styles.skeletonText, { width: 180, height: 22, backgroundColor: isDark ? colors.cardDark : colors.card }]} />
              <View style={[styles.skeletonText, { width: 140, height: 14, marginTop: 6, backgroundColor: isDark ? colors.cardDark : colors.card }]} />
            </View>
          </View>
          <SkeletonBlock height={80} isDark={isDark} />
          <SkeletonBlock height={50} isDark={isDark} />
          <SkeletonBlock height={280} isDark={isDark} />
          <SkeletonBlock height={120} isDark={isDark} />
          <View style={styles.sideBySideRow}>
            <View style={styles.sideBySideItem}>
              <SkeletonBlock height={100} isDark={isDark} />
            </View>
            <View style={styles.sideBySideItem}>
              <SkeletonBlock height={100} isDark={isDark} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }



  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
      edges={['top']}
    >
      <ScrollView
        ref={missionsScrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        scrollEventThrottle={16}
      >
        {/* ── Header inteligente ── */}
        <View style={styles.header}>
          <View style={styles.greetingColumn}>
            <Text style={[styles.greetingSmall, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {greeting}
            </Text>
            <Text style={[styles.greetingName, { color: isDark ? colors.textDark : colors.text }]}>
              {firstName}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.shareButton}
            onPress={() => {
              console.log('[Dashboard] Top share icon pressed — navigating to share-progress');
              router.push('/share-progress?variant=level');
            }}
          >
            <IconSymbol
              ios_icon_name="square.and.arrow.up"
              android_material_icon_name="share"
              size={24}
              color={colors.primary}
            />
          </TouchableOpacity>
        </View>

        {/* ── XP Hero Card ── */}
        <CardErrorBoundary label="XpHeroCard">
          <XpHeroCard status={xp.status} isDark={isDark} />
        </CardErrorBoundary>

        {/* ── League Card ── */}
        <LeagueCard isDark={isDark} />

        {/* ── Goal Weight Card ── */}
        {user && (
          <CardErrorBoundary label="GoalWeightCard">
            <GoalWeightCard
              userId={user.id}
              isDark={isDark}
              currentWeightKg={user.current_weight ?? null}
              goalWeightKg={user.goal_weight ?? null}
              startWeightKg={user.journey_start_weight ?? null}
            />
          </CardErrorBoundary>
        )}

        {/* ── Social Comparison — compact sub-hero pill ── */}
        {xp.status && (
          <CardErrorBoundary label="SocialComparisonCard">
            <SocialComparisonCard
              ranking={xp.status.ranking}
              isDark={isDark}
            />
          </CardErrorBoundary>
        )}

        {/* ── 7-Day Challenge Card ── */}
        {challenge.isActive && challenge.challenge && (
          <CardErrorBoundary label="ChallengeDashboardCard">
            <ChallengeDashboardCard
              challenge={challenge.challenge}
              isDark={isDark}
              xpConfig={xp.status?.xp_config}
              onCompleteTodaysMission={challenge.completeTodaysMission}
              onMissionCompleted={(result) => {
                console.log('[Dashboard] Challenge mission completed — badge:', result.badgeEarned, 'xp:', result.xpAwarded);
                if (result.badgeEarned) {
                  setShowCompleteModal(true);
                } else {
                  const dayNum = challenge.challenge?.current_day ?? 0;
                  Alert.alert(
                    '🔥 Day ' + dayNum + ' Complete!',
                    '+' + result.xpAwarded + ' XP earned. Keep it up!',
                    [{ text: 'Let\'s go!' }]
                  );
                }
              }}
            />
          </CardErrorBoundary>
        )}

        {/* ── Flash Challenges ── */}
        <CardErrorBoundary label="FlashChallengesCard">
          <FlashChallengesCard
            isDark={isDark}
            onXpAwarded={() => {
              console.log('[Dashboard] Flash challenge XP awarded, refreshing');
              xp.refresh();
            }}
          />
        </CardErrorBoundary>

        {/* ── Today's Challenges — unified card (replaces TodaysMissionsCard + TodaysXpBreakdown) ── */}
        <CardErrorBoundary label="TodaysChallengesCard">
          <TodaysChallengesCard
            status={xp.status}
            isDark={isDark}
            localSteps={localSteps}
            onRefresh={() => {
              console.log('[Dashboard] TodaysChallengesCard requested XP refresh');
              xp.refresh();
            }}
          />
        </CardErrorBoundary>

        {/* ── Consistency Score ── */}
        {user && (
          <CardErrorBoundary label="ConsistencyScore">
            <ConsistencyScore userId={user.id} isDark={isDark} />
          </CardErrorBoundary>
        )}

        {/* ── Photo Progress Card ── */}
        {user && (
          <CardErrorBoundary label="PhotoProgressCard">
            <PhotoProgressCard userId={user.id} isDark={isDark} />
          </CardErrorBoundary>
        )}

        {/* ── Share My Progress button ── */}
        <TouchableOpacity
          style={[
            styles.shareProgressButton,
            {
              backgroundColor: isDark ? colors.cardDark : colors.card,
              borderColor: isDark ? colors.cardBorderDark : colors.cardBorder,
            },
          ]}
          onPress={() => {
            console.log('[Dashboard] Share My Progress pressed');
            router.push('/share-progress?variant=level');
          }}
          activeOpacity={0.75}
        >
          <Text
            style={[
              styles.shareProgressTitle,
              { color: isDark ? '#F1F5F9' : '#2B2D42' },
            ]}
          >
            Share My Progress
          </Text>
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <Modal
        visible={showCheckInModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCheckInModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCheckInModal(false)}
        >
          <View style={[
            styles.modalContent,
            {
              backgroundColor: isDark ? colors.cardDark : colors.card,
              borderColor: isDark ? colors.cardBorderDark : colors.cardBorder,
            }
          ]}>
            <Text style={[styles.modalTitle, { color: isDark ? colors.textDark : colors.text }]}>
              Quick Check-In
            </Text>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => handleQuickCheckIn('weight')}
            >
              <IconSymbol
                ios_icon_name="scalemass"
                android_material_icon_name="monitor_weight"
                size={24}
                color={colors.primary}
              />
              <Text style={[styles.modalOptionText, { color: isDark ? colors.textDark : colors.text }]}>
                Log Weight
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => handleQuickCheckIn('steps')}
            >
              <IconSymbol
                ios_icon_name="figure.walk"
                android_material_icon_name="directions_walk"
                size={24}
                color={colors.primary}
              />
              <Text style={[styles.modalOptionText, { color: isDark ? colors.textDark : colors.text }]}>
                Log Steps
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => handleQuickCheckIn('gym')}
            >
              <IconSymbol
                ios_icon_name="dumbbell.fill"
                android_material_icon_name="fitness_center"
                size={24}
                color={colors.primary}
              />
              <Text style={[styles.modalOptionText, { color: isDark ? colors.textDark : colors.text }]}>
                Log Gym Session
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalCancelButton, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
              onPress={() => {
                console.log('[Dashboard] Quick check-in modal cancelled');
                setShowCheckInModal(false);
              }}
            >
              <Text style={[styles.modalCancelText, { color: isDark ? colors.textDark : colors.text }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Level Up Modal ── */}
      <LevelUpModal
        visible={xp.status?.pending_level_up ?? false}
        level={xp.status?.pending_level_up_to ?? 0}
        onDismiss={() => {
          console.log('[Dashboard] LevelUpModal dismissed — refreshing XP');
          xp.refresh();
        }}
      />

      {/* ── Unlock Mission Modal ── */}
      <UnlockMissionModal
        visible={unlockModalVisible}
        onClose={() => {
          console.log('[Dashboard] UnlockMissionModal closed');
          setUnlockModalVisible(false);
        }}
        onUnlocked={() => {
          console.log('[Dashboard] Mission unlocked — refreshing XP status');
          xp.refresh();
        }}
        xpConfig={xp.status?.xp_config}
      />

      {/* ── Streak Badge Modal ── */}
      <StreakBadgeModal
        visible={pendingMilestone !== null}
        streakDays={pendingMilestone ?? 0}
        onDismiss={() => {
          console.log('[Dashboard] StreakBadgeModal dismissed — milestone:', pendingMilestone);
          if (pendingMilestone) markMilestoneCelebrated(pendingMilestone);
          setPendingMilestone(null);
        }}
      />

      {/* ── 7-Day Challenge Popup ── */}
      <ChallengePopup
        visible={showChallengePopup}
        onClose={() => {
          console.log('[Dashboard] ChallengePopup closed');
          setShowChallengePopup(false);
        }}
        onAccepted={() => {
          console.log('[Dashboard] Challenge accepted — refreshing challenge state');
          challenge.refresh();
        }}
        onAcceptChallenge={challenge.acceptChallenge}
        xpConfig={xp.status?.xp_config}
      />

      {/* ── 7-Day Challenge Complete Modal ── */}
      <ChallengeCompleteModal
        visible={showCompleteModal}
        onClose={() => {
          console.log('[Dashboard] ChallengeCompleteModal closed');
          setShowCompleteModal(false);
        }}
        xpConfig={xp.status?.xp_config}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.md,
  },
  greetingColumn: {
    flex: 1,
  },
  greetingSmall: {
    fontSize: 14,
    fontWeight: '400',
    marginBottom: 2,
  },
  greetingName: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  shareButton: {
    padding: spacing.xs,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 32,
  },
  bottomSpacer: {
    height: 48,
  },
  // ── Side-by-side row ──────────────────────────────────────────────────────
  sideBySideRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: 0,
  },
  sideBySideItem: {
    flex: 1,
  },
  // ── Skeleton ─────────────────────────────────────────────────────────────
  skeletonBlock: {
    borderRadius: borderRadius.xl,
    marginBottom: spacing.md,
  },
  skeletonText: {
    borderRadius: borderRadius.sm,
  },
  // ── Share progress button ─────────────────────────────────────────────────
  shareProgressButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  shareProgressTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  // ── Modal ─────────────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.2)',
    elevation: 5,
  },
  modalTitle: {
    ...typography.h3,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  modalOptionText: {
    ...typography.bodyBold,
  },
  modalCancelButton: {
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  modalCancelText: {
    ...typography.bodyBold,
  },
});
