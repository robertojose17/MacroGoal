
import React, { useState, useCallback, useMemo, useEffect, useRef, Component } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  RefreshControl,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import ProgressCircle from '@/components/ProgressCircle';
import CalendarDateRangePicker from '@/components/CalendarDateRangePicker';
import ProgressCard from '@/components/ProgressCard';
import PhotoProgressCard from '@/components/PhotoProgressCard';
import ConsistencyScore from '@/components/ConsistencyScore';
import ShareableProgressCard from '@/components/ShareableProgressCard';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';
import * as Sharing from 'expo-sharing';
import { toLocalDateString } from '@/utils/dateUtils';
// ─── XP System ────────────────────────────────────────────────────────────────
import { useXpStatus } from '@/hooks/useXpStatus';
import XpHeroCard from '@/components/xp/XpHeroCard';
import DailyMissionsCard from '@/components/xp/DailyMissionsCard';
import TodaysXpBreakdown from '@/components/xp/TodaysXpBreakdown';
import LevelUpModal from '@/components/xp/LevelUpModal';
import NextUnlockCard from '@/components/xp/NextUnlockCard';
import SocialComparisonCard from '@/components/xp/SocialComparisonCard';
import StreakBadgeModal from '@/components/xp/StreakBadgeModal';
import { reportTodaySteps } from '@/utils/stepsReporter';
import { getPendingMilestone, markMilestoneCelebrated, resetMilestones } from '@/utils/streakMilestones';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

// react-native-view-shot requires a native build — lazy require so Expo Go doesn't hang
let ViewShot: any = null;
if (Platform.OS !== 'web') {
  try { ViewShot = require('react-native-view-shot').default; } catch {} // eslint-disable-line @typescript-eslint/no-require-imports
}

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

type TimeRange = 'today' | '7days' | '30days' | 'custom';

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

interface CustomDateRange {
  startDate: Date;
  endDate: Date;
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
  
  const [nutritionRange, setNutritionRange] = useState<TimeRange>('today');
  
  const [nutritionCustomRange, setNutritionCustomRange] = useState<CustomDateRange | null>(null);
  
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  
  const [nutritionStats, setNutritionStats] = useState<any>(null);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showTimeRangeDropdown, setShowTimeRangeDropdown] = useState(false);

  // Share-related state
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [shareCardData, setShareCardData] = useState<any>(null);
  const shareCardRef = useRef<any>(null);

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

  const loadNutritionTrends = useCallback(async (userId: string) => {
    try {
      let startDate: Date;
      let endDate: Date;
      
      if (nutritionRange === 'today') {
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
      } else if (nutritionRange === '7days') {
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
      } else if (nutritionRange === '30days') {
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 29);
        startDate.setHours(0, 0, 0, 0);
      } else if (nutritionRange === 'custom' && nutritionCustomRange) {
        startDate = new Date(nutritionCustomRange.startDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(nutritionCustomRange.endDate);
        endDate.setHours(23, 59, 59, 999);
      } else {
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
      }

      const startDateStr = toLocalDateString(startDate);
      const endDateStr = toLocalDateString(endDate);

      console.log('[Dashboard] Loading nutrition trends from', startDateStr, 'to', endDateStr);
      console.log('[Dashboard] Start date object:', startDate.toISOString());
      console.log('[Dashboard] End date object:', endDate.toISOString());

      const { data: mealsData } = await supabase
        .from('meals')
        .select(`
          date,
          meal_items (
            calories,
            protein,
            carbs,
            fats,
            fiber
          )
        `)
        .eq('user_id', userId)
        .gte('date', startDateStr)
        .lte('date', endDateStr);

      console.log('[Dashboard] Meals data returned:', mealsData?.length || 0, 'meals');

      const daysWithData = new Set<string>();
      let totalCals = 0;
      let totalP = 0;
      let totalC = 0;
      let totalF = 0;
      let totalFib = 0;

      if (mealsData && mealsData.length > 0) {
        mealsData.forEach((meal: any) => {
          daysWithData.add(meal.date);
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

      const daysCount = daysWithData.size;
      const avgCals = daysCount > 0 ? totalCals / daysCount : 0;
      const avgP = daysCount > 0 ? totalP / daysCount : 0;
      const avgC = daysCount > 0 ? totalC / daysCount : 0;
      const avgF = daysCount > 0 ? totalF / daysCount : 0;
      const avgFib = daysCount > 0 ? totalFib / daysCount : 0;

      const streak = calculateStreak(Array.from(daysWithData).sort());

      console.log('[Dashboard] Nutrition stats:', { daysCount, avgCals, streak, uniqueDays: Array.from(daysWithData) });

      setNutritionStats({
        streak,
        avgCalories: avgCals,
        avgProtein: avgP,
        avgCarbs: avgC,
        avgFats: avgF,
        avgFiber: avgFib,
      });
    } catch (error) {
      console.error('[Dashboard] Error loading nutrition trends:', error);
    }
  }, [nutritionRange, nutritionCustomRange, calculateStreak]);

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
      await loadNutritionTrends(authUser.id);

    } catch (error) {
      console.error('[Dashboard] Error loading data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadTodaySummary, loadNutritionTrends]);

  useEffect(() => {
    if (user) {
      console.log('[Dashboard] Nutrition range changed, reloading trends');
      loadNutritionTrends(user.id);
    }
  }, [nutritionRange, nutritionCustomRange, user, loadNutritionTrends]);

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

  const handleCustomRangeSelect = useCallback(() => {
    console.log('[Dashboard] Opening calendar date range picker for nutrition');
    setShowTimeRangeDropdown(false);
    setShowCalendarPicker(true);
  }, []);

  const handleDateRangeSelect = useCallback((startDate: Date, endDate: Date) => {
    console.log('[Dashboard] Date range selected:', startDate.toISOString(), 'to', endDate.toISOString());
    
    const customRange: CustomDateRange = { 
      startDate, 
      endDate 
    };
    
    setNutritionCustomRange(customRange);
    setNutritionRange('custom');
  }, []);

  const handleCalendarClose = useCallback(() => {
    console.log('[Dashboard] Calendar picker closed');
    setShowCalendarPicker(false);
    
    if (nutritionRange === 'custom' && !nutritionCustomRange) {
      setNutritionRange('today');
    }
  }, [nutritionRange, nutritionCustomRange]);

  const getCustomRangeLabel = useCallback((range: CustomDateRange | null) => {
    if (!range) return 'Custom';
    const start = range.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const end = range.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${start} - ${end}`;
  }, []);

  const getTimeRangeLabel = useCallback(() => {
    if (nutritionRange === 'today') return 'Today';
    if (nutritionRange === '7days') return 'Last 7 days';
    if (nutritionRange === '30days') return 'Last 30 days';
    if (nutritionRange === 'custom') return getCustomRangeLabel(nutritionCustomRange);
    return 'Today';
  }, [nutritionRange, nutritionCustomRange, getCustomRangeLabel]);

  const handleTimeRangeSelect = useCallback((range: TimeRange) => {
    if (range === 'custom') {
      handleCustomRangeSelect();
    } else {
      setNutritionRange(range);
      setShowTimeRangeDropdown(false);
    }
  }, [handleCustomRangeSelect]);

  // Helper function to get the average text based on selected range
  const getAverageText = useCallback(() => {
    if (nutritionRange === 'today') {
      return null; // No text for Today
    } else if (nutritionRange === '7days') {
      return 'Average for last 7 days';
    } else if (nutritionRange === '30days') {
      return 'Average for last 30 days';
    } else if (nutritionRange === 'custom' && nutritionCustomRange) {
      // Calculate number of days in custom range
      const start = new Date(nutritionCustomRange.startDate);
      const end = new Date(nutritionCustomRange.endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates
      return `Average for last ${diffDays} days`;
    }
    return null;
  }, [nutritionRange, nutritionCustomRange]);

  // ONE-TAP SHARE HANDLER
  const handleShareProgress = useCallback(async () => {
    try {
      setIsGeneratingShare(true);
      console.log('[Dashboard] Starting one-tap share...');

      if (!user) {
        Alert.alert('Error', 'User data not loaded');
        setIsGeneratingShare(false);
        return;
      }

      const authUser = user;

      // Fetch user profile, active goal, and check-in photos in parallel
      const { data: { session } } = await supabase.auth.getSession();

      const [userResult, goalResult, photosResult] = await Promise.all([
        supabase.from('users').select('*').eq('id', authUser.id).maybeSingle(),
        supabase.from('goals').select('*').eq('user_id', authUser.id).eq('is_active', true).maybeSingle(),
        fetch(`${SUPABASE_PROJECT_URL}/functions/v1/check-in-photos`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        }),
      ]);

      console.log('[Dashboard] Fetched user, goal, and photos in parallel');

      const userData = userResult.data;
      const goalData = goalResult.data;

      const goalForShare = goalData || {
        daily_calories: 2000,
        protein_g: 150,
        carbs_g: 200,
        fats_g: 65,
        fiber_g: 30,
        start_date: toLocalDateString(),
      };

      // Parse photos
      let beforePhotoUrl: string | null = null;
      let afterPhotoUrl: string | null = null;
      let beforeDateLabel = '';
      let afterDateLabel = 'Today';

      try {
        if (photosResult.ok) {
          const photosData = await photosResult.json();
          const allPhotos: any[] = photosData.photos ?? [];
          const sortedPhotos = [...allPhotos].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const formatDateShort = (iso: string) => {
            const d = new Date(iso);
            return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
          };
          const beforePhoto = sortedPhotos.length >= 2 ? sortedPhotos[0] : null;
          const afterPhoto = sortedPhotos.length >= 1 ? sortedPhotos[sortedPhotos.length - 1] : null;
          beforePhotoUrl = beforePhoto?.photo_url ?? null;
          afterPhotoUrl = afterPhoto?.photo_url ?? null;
          beforeDateLabel = beforePhoto ? formatDateShort(beforePhoto.created_at) : '';
          afterDateLabel = afterPhoto ? 'Today' : '';
          console.log('[Dashboard] Photos loaded — before:', !!beforePhotoUrl, 'after:', !!afterPhotoUrl);
        } else {
          const errText = await photosResult.text();
          console.warn('[Dashboard] check-in-photos fetch failed:', photosResult.status, errText);
        }
      } catch (photoErr) {
        console.warn('[Dashboard] Error parsing photos response:', photoErr);
      }

      // Get today's nutrition data
      const today = toLocalDateString();
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
        .eq('user_id', authUser.id)
        .eq('date', today);

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

      // Calculate streak (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      const startDateStr = toLocalDateString(sevenDaysAgo);

      const { data: allMeals } = await supabase
        .from('meals')
        .select('date, meal_items(calories)')
        .eq('user_id', authUser.id)
        .gte('date', startDateStr)
        .lte('date', today);

      const daysWithData = new Set<string>();
      if (allMeals && allMeals.length > 0) {
        allMeals.forEach((meal: any) => {
          if (meal.meal_items && meal.meal_items.length > 0) {
            if (meal.meal_items.some((item: any) => item.calories > 0)) {
              daysWithData.add(meal.date);
            }
          }
        });
      }

      const streakDays = daysWithData.size;

      // Calculate protein accuracy (today)
      const proteinAccuracy = goalForShare.protein_g > 0
        ? Math.round((totalP / goalForShare.protein_g) * 100)
        : 0;

      // Get weight data
      const { data: checkIns } = await supabase
        .from('check_ins')
        .select('weight, date')
        .eq('user_id', authUser.id)
        .not('weight', 'is', null)
        .order('date', { ascending: true });

      let weightLost = 0;
      let weightGoalProgress = 0;

      if (checkIns && checkIns.length > 0) {
        const firstWeightKg = checkIns[0].weight;
        const lastWeightKg = checkIns[checkIns.length - 1].weight;
        const weightLostKg = firstWeightKg - lastWeightKg;
        const weightLostLbs = weightLostKg * 2.20462;
        weightLost = Math.max(0, weightLostLbs);

        const goalWeightRaw = userData?.goal_weight;
        if (goalWeightRaw) {
          const goalWeightKg = parseFloat(goalWeightRaw);
          if (!isNaN(goalWeightKg) && goalWeightKg > 0) {
            const totalWeightGoalKg = firstWeightKg - goalWeightKg;
            const totalWeightGoalLbs = totalWeightGoalKg * 2.20462;
            if (totalWeightGoalLbs > 0) {
              weightGoalProgress = (weightLostLbs / totalWeightGoalLbs) * 100;
              weightGoalProgress = Math.max(0, Math.min(100, weightGoalProgress));
            }
          }
        } else {
          const assumedGoalLbs = (firstWeightKg * 2.20462) * 0.1;
          if (assumedGoalLbs > 0) {
            weightGoalProgress = (weightLostLbs / assumedGoalLbs) * 100;
            weightGoalProgress = Math.max(0, Math.min(100, weightGoalProgress));
          }
        }
      }

      if (isNaN(weightLost) || !isFinite(weightLost)) weightLost = 0;
      if (isNaN(weightGoalProgress) || !isFinite(weightGoalProgress)) weightGoalProgress = 0;

      console.log('[Dashboard] Weight Lost:', weightLost, 'lb');
      console.log('[Dashboard] Weight Goal Progress:', weightGoalProgress, '%');

      // Calculate discipline score
      const dailyTrackingScore = daysWithData.size >= 5 ? 40 : (daysWithData.size / 7) * 40;
      const streakScore = Math.min(35, streakDays * 5);
      const proteinScore = proteinAccuracy >= 95 && proteinAccuracy <= 105 ? 25 :
                          proteinAccuracy >= 80 ? 20 :
                          proteinAccuracy >= 60 ? 15 : 10;
      const disciplineScore = Math.round(dailyTrackingScore + streakScore + proteinScore);

      console.log('[Dashboard] Discipline score:', disciplineScore);

      // totalDays = days since goal start date
      const goalStartDate = new Date(goalForShare.start_date + 'T00:00:00');
      const todayDate = new Date();
      const totalDays = Math.max(1, Math.ceil((todayDate.getTime() - goalStartDate.getTime()) / (1000 * 60 * 60 * 24)));

      // avgProteinAccuracy across tracked days
      const avgProteinAccuracy = streakDays > 0 && goalForShare.protein_g > 0
        ? Math.min(100, Math.round((totalP / goalForShare.protein_g) * 100))
        : 0;

      // Call leaderboard Edge Function
      let leaderboardPhrase = "Keep going — you're building momentum 📈";
      try {
        console.log('[Dashboard] Fetching leaderboard rank for score:', disciplineScore);
        const leaderboardResponse = await fetch(`${SUPABASE_PROJECT_URL}/functions/v1/get-leaderboard-rank`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ score: disciplineScore }),
        });
        if (leaderboardResponse.ok) {
          const leaderboardData = await leaderboardResponse.json();
          leaderboardPhrase = leaderboardData.phrase ?? leaderboardPhrase;
          console.log('[Dashboard] Leaderboard phrase:', leaderboardPhrase);
        } else {
          const errText = await leaderboardResponse.text();
          console.warn('[Dashboard] Leaderboard rank fetch returned', leaderboardResponse.status, errText);
        }
      } catch (e) {
        console.warn('[Dashboard] Leaderboard rank fetch failed, using fallback phrase');
      }

      const cardData = {
        consistencyScore: disciplineScore,
        weightGoalProgress,
        weightLost,
        dayStreak: streakDays,
        trackedDays: daysWithData.size,
        totalDays,
        avgProteinAccuracy,
        leaderboardPhrase,
        beforePhotoUrl,
        afterPhotoUrl,
        beforeDateLabel,
        afterDateLabel,
      };

      console.log('[Dashboard] Share card data ready:', cardData);
      setShareCardData(cardData);

      // Wait for the card to render
      setTimeout(async () => {
        try {
          if (!shareCardRef.current) {
            Alert.alert('Error', 'Unable to generate share image');
            setIsGeneratingShare(false);
            return;
          }

          console.log('[Dashboard] Capturing share image...');
          const uri = await shareCardRef.current.capture();
          console.log('[Dashboard] Share image captured:', uri);

          // Share immediately
          if (Platform.OS === 'web') {
            // For web, download the image
            const link = document.createElement('a');
            link.href = uri;
            link.download = `fitness-progress-${Date.now()}.png`;
            link.click();
            Alert.alert('Success', 'Image downloaded!');
          } else {
            // For native, use expo-sharing
            const isAvailable = await Sharing.isAvailableAsync();
            if (isAvailable) {
              await Sharing.shareAsync(uri, {
                mimeType: 'image/png',
                dialogTitle: `Check out my fitness progress! 💪 ${disciplineScore}/100 Consistency Score`,
              });
            } else {
              Alert.alert('Error', 'Sharing is not available on this device');
            }
          }

          setIsGeneratingShare(false);
          setShareCardData(null);
        } catch (error) {
          console.error('[Dashboard] Error capturing/sharing:', error);
          Alert.alert('Error', 'Failed to share progress card');
          setIsGeneratingShare(false);
          setShareCardData(null);
        }
      }, 500);

    } catch (error) {
      console.error('[Dashboard] Error in share handler:', error);
      Alert.alert('Error', 'Failed to generate share card');
      setIsGeneratingShare(false);
      setShareCardData(null);
    }
  }, [user]);

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

  const caloriesGoal = goal?.daily_calories || 2000;
  const proteinGoal = goal?.protein_g || 150;
  const carbsGoal = goal?.carbs_g || 200;
  const fatsGoal = goal?.fats_g || 65;
  const fiberGoal = goal?.fiber_g || 30;

  // Calculate nutrition trend values for display (matching Foods tab style)
  const nutritionCaloriesEaten = nutritionStats?.avgCalories || 0;
  const nutritionCaloriesRemaining = caloriesGoal - nutritionCaloriesEaten;

  // Pre-compute average text to avoid calling the function twice in JSX
  const averageText = getAverageText();

  // Pre-compute CalendarDateRangePicker props to avoid IIFE in JSX
  const calendarDefaultStart = new Date();
  calendarDefaultStart.setDate(calendarDefaultStart.getDate() - 7);
  const calendarInitialStart = nutritionCustomRange?.startDate ?? calendarDefaultStart;
  const calendarInitialEnd = nutritionCustomRange?.endDate ?? new Date();
  const calendarMaxDate = new Date();

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
            onPress={handleShareProgress}
            disabled={isGeneratingShare}
          >
            {isGeneratingShare ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <IconSymbol
                ios_icon_name="square.and.arrow.up"
                android_material_icon_name="share"
                size={24}
                color={colors.primary}
              />
            )}
          </TouchableOpacity>
        </View>

        {/* ── XP Hero Card ── */}
        <CardErrorBoundary label="XpHeroCard">
          <XpHeroCard status={xp.status} isDark={isDark} />
        </CardErrorBoundary>

        {/* ── Daily Missions ── */}
        <CardErrorBoundary label="DailyMissionsCard">
          <DailyMissionsCard missions={xp.status?.missions} isDark={isDark} />
        </CardErrorBoundary>

        {/* ── Today's XP Breakdown ── */}
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

        {/* ── Next Unlock Card ── */}
        {xp.status && (
          <CardErrorBoundary label="NextUnlockCard">
            <NextUnlockCard
              currentLevel={xp.status.current_level}
              currentRank={xp.status.current_rank}
              isDark={isDark}
            />
          </CardErrorBoundary>
        )}

        {/* ── Social Comparison Card ── */}
        {xp.status && (
          <CardErrorBoundary label="SocialComparisonCard">
            <SocialComparisonCard
              ranking={xp.status.ranking}
              currentRank={xp.status.current_rank}
              isDark={isDark}
            />
          </CardErrorBoundary>
        )}

        {/* Consistency Score - EXISTING — kept below XP sections */}
        {user && (
          <CardErrorBoundary label="ConsistencyScore">
            <ConsistencyScore userId={user.id} isDark={isDark} />
          </CardErrorBoundary>
        )}

        {/* Nutrition Trends Card - WITH DROPDOWN IN HEADER */}
        <View style={[
          styles.card, 
          { 
            backgroundColor: isDark ? colors.cardDark : colors.card,
            borderColor: isDark ? colors.cardBorderDark : colors.cardBorder,
          }
        ]}>
          {/* Card Header with Title and Dropdown */}
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: isDark ? colors.textDark : colors.text }]}>
              Nutrition Trends
            </Text>
            
            {/* Time Range Dropdown */}
            <TouchableOpacity
              style={[
                styles.dropdownButton,
                { 
                  backgroundColor: isDark ? colors.backgroundDark : colors.background,
                  borderColor: isDark ? colors.borderDark : colors.border,
                }
              ]}
              onPress={() => setShowTimeRangeDropdown(!showTimeRangeDropdown)}
            >
              <Text style={[styles.dropdownButtonText, { color: isDark ? colors.textDark : colors.text }]}>
                {getTimeRangeLabel()}
              </Text>
              <IconSymbol
                ios_icon_name="chevron.down"
                android_material_icon_name="arrow_drop_down"
                size={16}
                color={isDark ? colors.textDark : colors.text}
              />
            </TouchableOpacity>
          </View>

          {nutritionStats ? (
            <React.Fragment>
              {/* Streak Display */}
              {nutritionStats.streak > 0 && (
                <View style={styles.streakBadge}>
                  <Text style={[styles.streakText, { color: isDark ? colors.textDark : colors.text }]}>
                    🔥 {nutritionStats.streak}-day streak
                  </Text>
                </View>
              )}

              {/* Main Content: Circular Ring + Macro Bars (Food Tab Style) */}
              <View style={styles.nutritionContent}>
                {/* Left: Circular Calories Ring */}
                <View style={styles.caloriesRingContainer}>
                  <ProgressCircle
                    current={nutritionCaloriesEaten}
                    target={caloriesGoal}
                    size={140}
                    strokeWidth={12}
                    color={nutritionCaloriesRemaining >= 0 ? colors.success : colors.error}
                    label="kcal"
                  />
                </View>

                {/* Right: Macro Bars */}
                <View style={styles.macrosContainer}>
                  {/* Protein Bar */}
                  <View style={styles.macroBarWrapper}>
                    <View style={styles.macroBarHeader}>
                      <Text style={[styles.macroBarLabel, { color: isDark ? colors.textDark : colors.text }]}>
                        Protein
                      </Text>
                      <Text style={[styles.macroBarValues, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                        {Math.round(nutritionStats.avgProtein)} / {proteinGoal}g
                      </Text>
                    </View>
                    <View style={[styles.macroBarBackground, { backgroundColor: isDark ? colors.borderDark : colors.border }]}>
                      <View
                        style={[
                          styles.macroBarFill,
                          {
                            width: `${Math.min((nutritionStats.avgProtein / proteinGoal) * 100, 100)}%`,
                            backgroundColor: colors.protein,
                          },
                        ]}
                      />
                    </View>
                  </View>

                  {/* Carbs Bar */}
                  <View style={styles.macroBarWrapper}>
                    <View style={styles.macroBarHeader}>
                      <Text style={[styles.macroBarLabel, { color: isDark ? colors.textDark : colors.text }]}>
                        Carbs
                      </Text>
                      <Text style={[styles.macroBarValues, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                        {Math.round(nutritionStats.avgCarbs)} / {carbsGoal}g
                      </Text>
                    </View>
                    <View style={[styles.macroBarBackground, { backgroundColor: isDark ? colors.borderDark : colors.border }]}>
                      <View
                        style={[
                          styles.macroBarFill,
                          {
                            width: `${Math.min((nutritionStats.avgCarbs / carbsGoal) * 100, 100)}%`,
                            backgroundColor: colors.carbs,
                          },
                        ]}
                      />
                    </View>
                  </View>

                  {/* Fats Bar */}
                  <View style={styles.macroBarWrapper}>
                    <View style={styles.macroBarHeader}>
                      <Text style={[styles.macroBarLabel, { color: isDark ? colors.textDark : colors.text }]}>
                        Fats
                      </Text>
                      <Text style={[styles.macroBarValues, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                        {Math.round(nutritionStats.avgFats)} / {fatsGoal}g
                      </Text>
                    </View>
                    <View style={[styles.macroBarBackground, { backgroundColor: isDark ? colors.borderDark : colors.border }]}>
                      <View
                        style={[
                          styles.macroBarFill,
                          {
                            width: `${Math.min((nutritionStats.avgFats / fatsGoal) * 100, 100)}%`,
                            backgroundColor: colors.fats,
                          },
                        ]}
                      />
                    </View>
                  </View>

                  {/* Fiber Bar */}
                  <View style={styles.macroBarWrapper}>
                    <View style={styles.macroBarHeader}>
                      <Text style={[styles.macroBarLabel, { color: isDark ? colors.textDark : colors.text }]}>
                        Fiber
                      </Text>
                      <Text style={[styles.macroBarValues, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                        {Math.round(nutritionStats.avgFiber)} / {fiberGoal}g
                      </Text>
                    </View>
                    <View style={[styles.macroBarBackground, { backgroundColor: isDark ? colors.borderDark : colors.border }]}>
                      <View
                        style={[
                          styles.macroBarFill,
                          {
                            width: `${Math.min((nutritionStats.avgFiber / fiberGoal) * 100, 100)}%`,
                            backgroundColor: colors.fiber,
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              </View>

              {/* Average Text - Replaces "kcal remaining" */}
              {averageText ? (
                <View style={styles.averageTextContainer}>
                  <Text style={[styles.averageText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    {averageText}
                  </Text>
                </View>
              ) : null}
            </React.Fragment>
          ) : (
            <Text style={[styles.noDataText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              No nutrition data available for this period.
            </Text>
          )}
        </View>

        {/* Progress Card */}
        {user && (
          <CardErrorBoundary label="ProgressCard">
            <ProgressCard userId={user.id} isDark={isDark} />
          </CardErrorBoundary>
        )}

        {/* Photo Progress Card */}
        {user && (
          <CardErrorBoundary label="PhotoProgressCard">
            <PhotoProgressCard userId={user.id} isDark={isDark} />
          </CardErrorBoundary>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* ── Sticky Share My Progress button ── */}
      <View style={styles.stickyButtonContainer} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.shareProgressButton}
          onPress={() => {
            console.log('[Dashboard] Sticky Share My Progress pressed');
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

      {/* Hidden ShareableProgressCard for capture */}
      {shareCardData && (
        <View style={styles.hiddenCardContainer}>
          <ShareableProgressCard
            {...shareCardData}
            onCapture={(ref) => {
              shareCardRef.current = ref.current;
            }}
          />
        </View>
      )}

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

      {/* Time Range Dropdown Modal */}
      <Modal
        visible={showTimeRangeDropdown}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTimeRangeDropdown(false)}
      >
        <TouchableOpacity
          style={styles.dropdownOverlay}
          activeOpacity={1}
          onPress={() => setShowTimeRangeDropdown(false)}
        >
          <View style={[
            styles.dropdownMenu,
            { 
              backgroundColor: isDark ? colors.cardDark : colors.card,
              borderColor: isDark ? colors.cardBorderDark : colors.cardBorder,
            }
          ]}>
            <TouchableOpacity
              style={[
                styles.dropdownMenuItem,
                nutritionRange === 'today' && { backgroundColor: isDark ? colors.backgroundDark : colors.background }
              ]}
              onPress={() => handleTimeRangeSelect('today')}
            >
              <Text style={[
                styles.dropdownMenuItemText,
                { color: isDark ? colors.textDark : colors.text },
                nutritionRange === 'today' && { fontWeight: '600' }
              ]}>
                Today
              </Text>
              {nutritionRange === 'today' && (
                <IconSymbol
                  ios_icon_name="checkmark"
                  android_material_icon_name="check"
                  size={18}
                  color={colors.primary}
                />
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.dropdownMenuItem,
                nutritionRange === '7days' && { backgroundColor: isDark ? colors.backgroundDark : colors.background }
              ]}
              onPress={() => handleTimeRangeSelect('7days')}
            >
              <Text style={[
                styles.dropdownMenuItemText,
                { color: isDark ? colors.textDark : colors.text },
                nutritionRange === '7days' && { fontWeight: '600' }
              ]}>
                Last 7 days
              </Text>
              {nutritionRange === '7days' && (
                <IconSymbol
                  ios_icon_name="checkmark"
                  android_material_icon_name="check"
                  size={18}
                  color={colors.primary}
                />
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.dropdownMenuItem,
                nutritionRange === '30days' && { backgroundColor: isDark ? colors.backgroundDark : colors.background }
              ]}
              onPress={() => handleTimeRangeSelect('30days')}
            >
              <Text style={[
                styles.dropdownMenuItemText,
                { color: isDark ? colors.textDark : colors.text },
                nutritionRange === '30days' && { fontWeight: '600' }
              ]}>
                Last 30 days
              </Text>
              {nutritionRange === '30days' && (
                <IconSymbol
                  ios_icon_name="checkmark"
                  android_material_icon_name="check"
                  size={18}
                  color={colors.primary}
                />
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.dropdownMenuItem,
                nutritionRange === 'custom' && { backgroundColor: isDark ? colors.backgroundDark : colors.background }
              ]}
              onPress={() => handleTimeRangeSelect('custom')}
            >
              <Text style={[
                styles.dropdownMenuItemText,
                { color: isDark ? colors.textDark : colors.text },
                nutritionRange === 'custom' && { fontWeight: '600' }
              ]}>
                {nutritionRange === 'custom' ? getCustomRangeLabel(nutritionCustomRange) : 'Custom'}
              </Text>
              {nutritionRange === 'custom' && (
                <IconSymbol
                  ios_icon_name="checkmark"
                  android_material_icon_name="check"
                  size={18}
                  color={colors.primary}
                />
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <CalendarDateRangePicker
        visible={showCalendarPicker}
        onClose={handleCalendarClose}
        onSelectRange={handleDateRangeSelect}
        initialStartDate={calendarInitialStart}
        initialEndDate={calendarInitialEnd}
        maxDate={calendarMaxDate}
        title="Select Date Range"
      />

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
    paddingBottom: 160,
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardTitle: {
    ...typography.h3,
    flex: 1,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
  dropdownButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  streakBadge: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  streakText: {
    ...typography.bodyBold,
    fontSize: 16,
  },
  nutritionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  caloriesRingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  macrosContainer: {
    flex: 1,
    gap: spacing.md,
  },
  macroBarWrapper: {
    marginBottom: spacing.xs,
  },
  macroBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  macroBarLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  macroBarValues: {
    fontSize: 12,
    fontWeight: '500',
  },
  macroBarBackground: {
    height: 6,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  macroBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  averageTextContainer: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  averageText: {
    fontSize: 13,
    fontWeight: '500',
  },
  noDataText: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  bottomSpacer: {
    height: 40,
  },
  stickyButtonContainer: {
    position: 'absolute',
    bottom: 90,
    left: spacing.md,
    right: spacing.md,
    zIndex: 10,
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
  hiddenCardContainer: {
    position: 'absolute',
    left: -10000,
    top: -10000,
    opacity: 0,
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
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: Platform.OS === 'android' ? 180 : 160,
    paddingRight: spacing.md,
  },
  dropdownMenu: {
    minWidth: 180,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
    elevation: 5,
    overflow: 'hidden',
  },
  dropdownMenuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  dropdownMenuItemText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
