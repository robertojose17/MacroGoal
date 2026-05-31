
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
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import PhotoProgressCard from '@/components/PhotoProgressCard';
import ConsistencyScore from '@/components/ConsistencyScore';
import ProgressCard from '@/components/ProgressCard';
import { supabase } from '@/lib/supabase/client';
import { toLocalDateString } from '@/utils/dateUtils';
// ─── XP System ────────────────────────────────────────────────────────────────
import { useXpStatus } from '@/hooks/useXpStatus';
import XpHeroCard from '@/components/xp/XpHeroCard';
import DailyMissionsCard from '@/components/xp/DailyMissionsCard';
import TodaysXpBreakdown from '@/components/xp/TodaysXpBreakdown';
import LevelUpModal from '@/components/xp/LevelUpModal';
import SocialComparisonCard from '@/components/xp/SocialComparisonCard';
import StreakBadgeModal from '@/components/xp/StreakBadgeModal';
import NutritionMissionCard from '@/components/xp/NutritionMissionCard';
import { reportTodaySteps } from '@/utils/stepsReporter';
import { getPendingMilestone, markMilestoneCelebrated, resetMilestones } from '@/utils/streakMilestones';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

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

  // ─── XP System ──────────────────────────────────────────────────────────────
  const xp = useXpStatus();
  const missionsScrollRef = useRef<ScrollView>(null);
  const [pendingMilestone, setPendingMilestone] = useState<number | null>(null);

  // On mount: report steps and refresh XP
  useEffect(() => {
    console.log('[Dashboard] mount — reporting steps and refreshing XP');
    reportTodaySteps().then(() => xp.refresh()).catch(() => {});
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
      console.log('[Dashboard] Screen focused, loading data');
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleQuickCheckIn = useCallback((type: 'weight' | 'steps' | 'gym') => {
    setShowCheckInModal(false);
    router.push({
      pathname: '/check-in-form',
      params: { type },
    });
  }, [router]);



  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
        edges={['top']}
      >
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            Loading dashboard...
          </Text>
        </View>
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
        <View style={styles.header}>
          <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
            Dashboard
          </Text>
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

        {/* ── Daily Missions ── */}
        <CardErrorBoundary label="DailyMissionsCard">
          <DailyMissionsCard missions={xp.status?.missions} isDark={isDark} />
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

        {/* ── Nutrition Mission Card ── */}
        <CardErrorBoundary label="NutritionMissionCard">
          <NutritionMissionCard
            totalCalories={todaySummary?.total_calories ?? 0}
            totalProtein={todaySummary?.total_protein ?? 0}
            totalCarbs={todaySummary?.total_carbs ?? 0}
            totalFats={todaySummary?.total_fats ?? 0}
            goalCalories={goal?.daily_calories ?? 2000}
            goalProtein={goal?.protein_g ?? 150}
            goalCarbs={goal?.carbs_g ?? 200}
            goalFats={goal?.fats_g ?? 65}
            isDark={isDark}
          />
        </CardErrorBoundary>

        {/* ── Consistency Score + Weight Progress (compact, full-width) ── */}
        {user && (
          <>
            <CardErrorBoundary label="ConsistencyScore">
              <ConsistencyScore userId={user.id} isDark={isDark} />
            </CardErrorBoundary>
            <CardErrorBoundary label="ProgressCard">
              <ProgressCard userId={user.id} isDark={isDark} />
            </CardErrorBoundary>
          </>
        )}

        {/* ── Photo Progress Card ── */}
        {user && (
          <CardErrorBoundary label="PhotoProgressCard">
            <PhotoProgressCard userId={user.id} isDark={isDark} />
          </CardErrorBoundary>
        )}

        {/* ── Share My Progress button ── */}
        <View style={styles.shareProgressButtonContainer}>
          <TouchableOpacity
            style={styles.shareProgressButton}
            onPress={() => {
              console.log('[Dashboard] Share My Progress pressed');
              router.push('/share-progress?variant=level');
            }}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[colors.primary, '#FF8E3C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.shareProgressGradient}
            >
              <Ionicons name="share-social" size={20} color="#fff" />
              <Text style={styles.shareProgressButtonText}>Share My Progress</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

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
              onPress={() => setShowCheckInModal(false)}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.body,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.h2,
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
  shareProgressButtonContainer: {
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  shareProgressButton: {
    borderRadius: 28,
    overflow: 'hidden',
    height: 56,
  },
  shareProgressGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: 28,
  },
  shareProgressButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
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
