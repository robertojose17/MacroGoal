
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
import CompactConsistencyCard from '@/components/CompactConsistencyCard';
import CompactProgressCard from '@/components/CompactProgressCard';
import { supabase } from '@/lib/supabase/client';
import { toLocalDateString } from '@/utils/dateUtils';
// ─── XP System ────────────────────────────────────────────────────────────────
import { useXpStatus } from '@/hooks/useXpStatus';
import XpHeroCard from '@/components/xp/XpHeroCard';
import TodaysXpBreakdown from '@/components/xp/TodaysXpBreakdown';
import LevelUpModal from '@/components/xp/LevelUpModal';
import SocialComparisonCard from '@/components/xp/SocialComparisonCard';
import StreakBadgeModal from '@/components/xp/StreakBadgeModal';
import TodaysMissionsCard from '@/components/xp/TodaysMissionsCard';
import UnlockMissionModal from '@/components/xp/UnlockMissionModal';
import { reportTodaySteps } from '@/utils/stepsReporter';
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

const ONESIGNAL_PROMPT_KEY = 'onesignal_prompt_shown_v1';
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
  return 'Hi';
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
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);

  // ─── 7-Day Challenge ────────────────────────────────────────────────────────
  const [showChallengePopup, setShowChallengePopup] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const challenge = useSevenDayChallenge();

  // ─── Notifications ──────────────────────────────────────────────────────────
  const { hasPermission, requestPermission } = useNotifications();

  // ─── XP System ──────────────────────────────────────────────────────────────
  const xp = useXpStatus();
  const missionsScrollRef = useRef<ScrollView>(null);
  const [pendingMilestone, setPendingMilestone] = useState<number | null>(null);

  // Track previous freeze count to detect when a freeze is consumed
  const prevFreezeCountRef = useRef<number | undefined>(undefined);
  const isFirstXpLoadRef = useRef(true);

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
        xp.refresh();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One-time notification permission prompt for existing users (post-update)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (hasPermission) return; // already granted — no need to prompt

    const checkAndShowPrompt = async () => {
      try {
        const shown = await AsyncStorage.getItem(ONESIGNAL_PROMPT_KEY);
        if (shown) return; // already shown once
        // Delay slightly so the dashboard finishes loading first
        setTimeout(() => {
          setShowNotifPrompt(true);
        }, 2000);
      } catch (e) {
        console.warn('[Dashboard] notification prompt check failed:', e);
      }
    };

    checkAndShowPrompt();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Streak-saved toast: fires when freeze count decreases but streak is intact
  useEffect(() => {
    const freezeCount = xp.status?.streak_freeze_count;
    const currentStreak = xp.status?.current_streak;

    if (freezeCount === undefined || currentStreak === undefined) return;

    if (isFirstXpLoadRef.current) {
      // Initialize ref on first load — don't show toast yet
      prevFreezeCountRef.current = freezeCount;
      isFirstXpLoadRef.current = false;
      return;
    }

    const prev = prevFreezeCountRef.current;
    if (prev !== undefined && freezeCount < prev && currentStreak > 0) {
      console.log('[Dashboard] Streak freeze consumed — prev:', prev, 'now:', freezeCount, 'streak:', currentStreak);
      Alert.alert(
        'Streak Saved! 🛡️',
        `A freeze was used to protect your ${currentStreak}-day streak.`,
        [{ text: 'Nice!' }]
      );
    }

    prevFreezeCountRef.current = freezeCount;
  }, [xp.status?.streak_freeze_count, xp.status?.current_streak]);

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

  const handleUpgradePress = useCallback(() => {
    console.log('[Dashboard] Navigating to subscription screen from freeze badge');
    router.push('/subscription');
  }, [router]);

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

  const calculateStreak = useCallback((sortedDates: string[]): number => {
    if (sortedDates.length === 0) return 0;

    let currentStreak = 1;
    const today = toLocalDateString();

    const lastDate = sortedDates[sortedDates.length - 1];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toLocalDateString(yesterday);

    if (lastDate !== today && lastDate !== yesterdayStr) {
      return 0;
    }

    for (let i = sortedDates.length - 2; i >= 0; i--) {
      const currentDate = new Date(sortedDates[i + 1]);
      const prevDate = new Date(sortedDates[i]);
      const diffDays = Math.floor((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        currentStreak++;
      } else {
        break;
      }
    }

    return currentStreak;
  }, []); // No dependencies needed - pure function



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
      } else {
        setGoal({
          daily_calories: 2000,
          protein_g: 150,
          carbs_g: 200,
          fats_g: 65,
          fiber_g: 30,
        });
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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
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
  const firstName = user?.display_name?.split(' ')[0] || 'there';

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
        {/* ── Header with personalized greeting ── */}
        <View style={styles.header}>
          <View style={styles.greetingColumn}>
            <Text
              style={[styles.greetingText, { color: isDark ? colors.textDark : colors.text }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {greeting + ', ' + firstName}
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
          <XpHeroCard status={xp.status} isDark={isDark} onUpgradePress={handleUpgradePress} />
        </CardErrorBoundary>

        {/* ── Social Comparison — compact sub-hero pill ── */}
        {xp.status && (
          <CardErrorBoundary label="SocialComparisonCard">
            <SocialComparisonCard
              ranking={xp.status.ranking}
              currentRank={xp.status.current_rank}
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

        {/* ── Unified Today's Missions (nutrition + daily missions) ── */}
        <CardErrorBoundary label="TodaysMissionsCard">
          <TodaysMissionsCard
            missions={xp.status?.missions}
            totalCalories={todaySummary?.total_calories ?? 0}
            totalProtein={todaySummary?.total_protein ?? 0}
            totalCarbs={todaySummary?.total_carbs ?? 0}
            totalFats={todaySummary?.total_fats ?? 0}
            goalCalories={goal?.daily_calories ?? 2000}
            goalProtein={goal?.protein_g ?? 150}
            goalCarbs={goal?.carbs_g ?? 200}
            goalFats={goal?.fats_g ?? 65}
            isDark={isDark}
            missionTier={xp.status?.mission_tier}
            tierProgress={xp.status?.tier_progress}
            unlockSlotStatus={xp.status?.unlock_slot_status}
            onUnlockPress={() => {
              console.log('[Dashboard] Unlock a Mission button pressed — opening modal');
              setUnlockModalVisible(true);
            }}
          />
        </CardErrorBoundary>

        {/* ── Today's XP Breakdown — horizontal grid ── */}
        <CardErrorBoundary label="TodaysXpBreakdown">
          <TodaysXpBreakdown
            status={xp.status}
            isDark={isDark}
            onScrollToMissions={() => {
              console.log('[Dashboard] scrolling to missions');
              missionsScrollRef.current?.scrollTo({ y: 0, animated: true });
            }}
          />
        </CardErrorBoundary>

        {/* ── Consistency Score + Weight Progress — side by side ── */}
        {user && (
          <View style={styles.sideBySideRow}>
            <View style={styles.sideBySideItem}>
              <CardErrorBoundary label="CompactConsistencyCard">
                <CompactConsistencyCard userId={user.id} isDark={isDark} />
              </CardErrorBoundary>
            </View>
            <View style={styles.sideBySideItem}>
              <CardErrorBoundary label="CompactProgressCard">
                <CompactProgressCard userId={user.id} isDark={isDark} />
              </CardErrorBoundary>
            </View>
          </View>
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
        rank={xp.status?.pending_rank_change ?? xp.status?.current_rank ?? 'Rookie'}
        pendingRankChange={xp.status?.pending_rank_change ?? null}
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
      />

      {/* ── 7-Day Challenge Complete Modal ── */}
      <ChallengeCompleteModal
        visible={showCompleteModal}
        onClose={() => {
          console.log('[Dashboard] ChallengeCompleteModal closed');
          setShowCompleteModal(false);
        }}
      />

      {/* ── One-time notification permission prompt ── */}
      <Modal
        visible={showNotifPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotifPrompt(false)}
      >
        <View style={styles.notifPromptOverlay}>
          <View style={[styles.notifPromptCard, { backgroundColor: isDark ? colors.cardDark : '#fff' }]}>
            <Text style={styles.notifPromptEmoji}>{'🔔'}</Text>
            <Text style={[styles.notifPromptTitle, { color: isDark ? colors.textDark : colors.text }]}>
              {'Stay on track with reminders'}
            </Text>
            <Text style={[styles.notifPromptBody, { color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)' }]}>
              {"We'll notify you about your streak, daily missions, and level-ups."}
            </Text>
            <TouchableOpacity
              style={styles.notifEnableBtn}
              onPress={async () => {
                console.log('[Dashboard] Notification prompt: Enable notifications pressed');
                setShowNotifPrompt(false);
                await AsyncStorage.setItem(ONESIGNAL_PROMPT_KEY, 'true');
                await requestPermission();
              }}
            >
              <Text style={styles.notifEnableBtnText}>{'Enable notifications'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.notifLaterBtn}
              onPress={async () => {
                console.log('[Dashboard] Notification prompt: Maybe later pressed');
                setShowNotifPrompt(false);
                await AsyncStorage.setItem(ONESIGNAL_PROMPT_KEY, 'true');
              }}
            >
              <Text style={[styles.notifLaterBtnText, { color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)' }]}>
                {'Maybe later'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  greetingText: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
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
  // ── Notification permission prompt ────────────────────────────────────────
  notifPromptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  notifPromptCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: borderRadius.xl,
    padding: 28,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
      },
      android: { elevation: 10 },
    }),
  },
  notifPromptEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  notifPromptTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 26,
  },
  notifPromptBody: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  notifEnableBtn: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 12,
  },
  notifEnableBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  notifLaterBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  notifLaterBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
