
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import ShareableProgressCard, { ShareableProgressCardHandle } from '@/components/ShareableProgressCard';
import XpShareCard, { XpShareCardHandle } from '@/components/xp/XpShareCard';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';
import { TouchableOpacity } from 'react-native';
import * as Sharing from 'expo-sharing';
import { toLocalDateString } from '@/utils/dateUtils';
import { useXpStatus } from '@/hooks/useXpStatus';

// react-native-view-shot requires a native build — lazy import so Expo Go doesn't hang
let ViewShot: any = null;
if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  try { ViewShot = require('react-native-view-shot').default; } catch {}
}

// ─── Card dimensions ──────────────────────────────────────────────────────────
// ShareableProgressCard renders at a fixed width; we use 390 as the canonical
// full-res width for the off-screen capture target.
const PROGRESS_CARD_WIDTH = 390;
const PROGRESS_CARD_HEIGHT = 400; // photoRow height (320) + badge area (~80)

// XpShareCard renders at screen width with 9:16 aspect ratio.
// We use 390 as the canonical full-res width for the off-screen capture target.
const XP_CARD_WIDTH = 390;
const XP_CARD_HEIGHT = Math.round((XP_CARD_WIDTH * 16) / 9); // 693

interface CardData {
  consistencyScore: number;
  weightGoalProgress: number;
  weightLost: number;
  dayStreak: number;
  motivationalLine: string;
  leaderboardPhrase: string;
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
  beforeDateLabel?: string;
  afterDateLabel?: string;
  calorieDeficit?: number;
}

type CardVariant = 'progress' | 'level';

export default function ShareProgressScreen() {
  const router = useRouter();
  const { variant } = useLocalSearchParams<{ variant?: CardVariant }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { width: screenWidth } = useWindowDimensions();

  const [selected, setSelected] = useState<CardVariant>(variant === 'level' ? 'level' : 'progress');
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [cardData, setCardData] = useState<CardData | null>(null);
  const viewShotRef = useRef<ShareableProgressCardHandle>(null);
  const xpShotRef = useRef<XpShareCardHandle>(null);

  // XP data for the Level variant
  const { status: xpStatus, loading: xpLoading } = useXpStatus();

  // ─── Preview scale computation ────────────────────────────────────────────
  // Available width = screenWidth - horizontal padding (spacing.md * 2 = 32)
  const availableWidth = screenWidth - spacing.md * 2;

  const progressScale = availableWidth / PROGRESS_CARD_WIDTH;
  const progressPreviewWidth = availableWidth;
  const progressPreviewHeight = PROGRESS_CARD_HEIGHT * progressScale;

  const xpScale = availableWidth / XP_CARD_WIDTH;
  const xpPreviewWidth = availableWidth;
  const xpPreviewHeight = XP_CARD_HEIGHT * xpScale;

  const calculateProteinAccuracyScore = useCallback((proteinLogged: number, proteinTarget: number): number => {
    if (proteinTarget === 0) {
      return 0;
    }

    const percentage = (proteinLogged / proteinTarget) * 100;

    if (percentage >= 95 && percentage <= 105) {
      return 25;
    } else if (percentage >= 80 && percentage < 95) {
      return 20;
    } else if (percentage >= 60 && percentage < 80) {
      return 15;
    } else if (percentage >= 40 && percentage < 60) {
      return 10;
    } else if (percentage < 40) {
      return Math.round((percentage / 40) * 5);
    } else {
      const excess = percentage - 105;
      const penalty = Math.min(10, excess / 5);
      return Math.max(15, Math.round(25 - penalty));
    }
  }, []);

  const calculateConsistencyScore = useCallback(async (userId: string, startDate: string, proteinTarget: number): Promise<number> => {
    try {
      const today = toLocalDateString();

      const { data: allMeals } = await supabase
        .from('meals')
        .select(`
          id,
          date,
          meal_items (
            id,
            calories,
            protein
          )
        `)
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', today)
        .order('date', { ascending: true });

      const dailyData: { [date: string]: { calories: number; protein: number; hasMeals: boolean } } = {};

      if (allMeals && allMeals.length > 0) {
        for (const meal of allMeals) {
          if (!dailyData[meal.date]) {
            dailyData[meal.date] = { calories: 0, protein: 0, hasMeals: false };
          }

          if (meal.meal_items && meal.meal_items.length > 0) {
            dailyData[meal.date].hasMeals = true;

            for (const item of meal.meal_items) {
              const itemCalories = parseFloat(String(item.calories || '0'));
              const itemProtein = parseFloat(String(item.protein || '0'));

              dailyData[meal.date].calories += itemCalories;
              dailyData[meal.date].protein += itemProtein;
            }
          }
        }
      }

      const allDatesInRange: string[] = [];
      const start = new Date(startDate + 'T00:00:00');
      const end = new Date(today + 'T00:00:00');
      const currentDate = new Date(start);

      while (currentDate <= end) {
        const dateStr = toLocalDateString(currentDate);
        allDatesInRange.push(dateStr);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const hasNoData = Object.keys(dailyData).length === 0;
      if (allDatesInRange.length > 2 && hasNoData) {
        return 0;
      }

      const dailyScores: { trackingScore: number; streakScore: number; proteinScore: number }[] = [];
      let currentStreakDays = 0;

      for (let i = 0; i < allDatesInRange.length; i++) {
        const date = allDatesInRange[i];
        const dayData = dailyData[date];

        const hasTracking = dayData?.hasMeals || false;
        const trackingScore = hasTracking ? 40 : 0;

        if (hasTracking) {
          currentStreakDays++;
        } else {
          currentStreakDays = Math.floor(currentStreakDays * 0.3);
        }

        const streakScore = currentStreakDays > 0
          ? Math.round(35 * (1 - Math.exp(-0.1 * currentStreakDays)))
          : 0;

        const proteinLogged = dayData?.protein || 0;
        const proteinScore = calculateProteinAccuracyScore(proteinLogged, proteinTarget);

        dailyScores.push({ trackingScore, streakScore, proteinScore });
      }

      const avgTracking = dailyScores.reduce((sum, day) => sum + day.trackingScore, 0) / dailyScores.length;
      const avgStreak = dailyScores.reduce((sum, day) => sum + day.streakScore, 0) / dailyScores.length;
      const avgProtein = dailyScores.reduce((sum, day) => sum + day.proteinScore, 0) / dailyScores.length;

      const totalScore = Math.round(avgTracking + avgStreak + avgProtein);
      return Math.max(0, Math.min(100, totalScore));
    } catch (error) {
      console.error('[ShareProgress] Error calculating consistency score:', error);
      return 0;
    }
  }, [calculateProteinAccuracyScore]);

  const calculateWeightGoalProgress = async (
    userId: string,
    userData: any
  ): Promise<{ weightGoalProgress: number; weightLost: number }> => {
    try {
      console.log('[ShareProgress] === WEIGHT GOAL PROGRESS CALCULATION ===');

      const { data: checkIns } = await supabase
        .from('check_ins')
        .select('weight, date')
        .eq('user_id', userId)
        .not('weight', 'is', null)
        .order('date', { ascending: true });

      console.log('[ShareProgress] Check-ins found:', checkIns?.length || 0);

      if (!checkIns || checkIns.length === 0) {
        return { weightGoalProgress: 0, weightLost: 0 };
      }

      const firstWeightKg = checkIns[0].weight;
      const lastWeightKg = checkIns[checkIns.length - 1].weight;

      const weightLostKg = firstWeightKg - lastWeightKg;
      const weightLostLbs = weightLostKg * 2.20462;

      let weightGoalProgress = 0;
      const goalWeightRaw = userData?.goal_weight;

      if (goalWeightRaw) {
        const goalWeightKg = parseFloat(goalWeightRaw);
        if (!isNaN(goalWeightKg) && goalWeightKg > 0) {
          const totalWeightGoalKg = firstWeightKg - goalWeightKg;
          const totalWeightGoalLbs = totalWeightGoalKg * 2.20462;
          if (totalWeightGoalLbs > 0) {
            weightGoalProgress = (weightLostLbs / totalWeightGoalLbs) * 100;
          }
        }
      } else {
        const assumedGoalLbs = (firstWeightKg * 2.20462) * 0.1;
        if (assumedGoalLbs > 0) {
          weightGoalProgress = (weightLostLbs / assumedGoalLbs) * 100;
        }
      }

      if (isNaN(weightGoalProgress) || !isFinite(weightGoalProgress)) {
        weightGoalProgress = 0;
      } else {
        weightGoalProgress = Math.max(0, Math.min(100, Math.round(weightGoalProgress)));
      }

      const finalWeightLost = Math.max(0, Math.round(weightLostLbs * 10) / 10);

      return { weightGoalProgress, weightLost: finalWeightLost };
    } catch (error) {
      console.error('[ShareProgress] Error calculating weight goal progress:', error);
      return { weightGoalProgress: 0, weightLost: 0 };
    }
  };

  const calculateRecentDeficit = async (userId: string): Promise<number> => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      const startDate = toLocalDateString(sevenDaysAgo);

      const [{ data: goal }, { data: meals }] = await Promise.all([
        supabase
          .from('goals')
          .select('daily_calories')
          .eq('user_id', userId)
          .eq('is_active', true)
          .maybeSingle(),
        supabase
          .from('meals')
          .select('date, meal_items(calories)')
          .eq('user_id', userId)
          .gte('date', startDate),
      ]);

      if (!goal?.daily_calories) return 0;
      if (!meals) return 0;

      const dailyTotals: Record<string, number> = {};
      for (const m of meals) {
        const items = (m as any).meal_items ?? [];
        const dayCals = items.reduce((s: number, i: any) => s + (Number(i.calories) || 0), 0);
        dailyTotals[m.date] = (dailyTotals[m.date] ?? 0) + dayCals;
      }

      let totalDeficit = 0;
      for (const cals of Object.values(dailyTotals)) {
        const diff = goal.daily_calories - cals;
        if (diff > 0) totalDeficit += diff;
      }
      console.log('[ShareProgress] 7-day calorie deficit:', Math.round(totalDeficit));
      return Math.round(totalDeficit);
    } catch (error) {
      console.error('[ShareProgress] Error calculating calorie deficit:', error);
      return 0;
    }
  };

  const calculateDayStreak = async (userId: string, startDate: string): Promise<number> => {
    try {
      const today = toLocalDateString();

      const { data: allMeals } = await supabase
        .from('meals')
        .select('date, meal_items(calories)')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', today)
        .order('date', { ascending: false });

      if (!allMeals || allMeals.length === 0) {
        return 0;
      }

      const daysWithData = new Set<string>();
      allMeals.forEach((meal: any) => {
        if (meal.meal_items && meal.meal_items.length > 0) {
          if (meal.meal_items.some((item: any) => item.calories > 0)) {
            daysWithData.add(meal.date);
          }
        }
      });

      let streak = 0;
      const currentDate = new Date(today + 'T00:00:00');
      const maxIterations = 1000;

      while (streak < maxIterations) {
        const dateStr = toLocalDateString(currentDate);
        if (dateStr < startDate) break;
        if (daysWithData.has(dateStr)) {
          streak++;
          currentDate.setDate(currentDate.getDate() - 1);
        } else {
          break;
        }
      }

      return streak;
    } catch (error) {
      console.error('[ShareProgress] Error calculating day streak:', error);
      return 0;
    }
  };

  const getMotivationalLine = (
    consistencyScore: number,
    weightLost: number,
    dayStreak: number
  ): string => {
    if (dayStreak >= 14) return 'Still showing up 💪';
    if (consistencyScore >= 90) return 'One step closer 🔥';
    if (weightLost >= 5) return 'Progress over perfection';
    return 'Small wins add up';
  };

  const loadCardData = useCallback(async () => {
    try {
      setLoading(true);
      console.log('[ShareProgress] Loading card data...');

      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        console.log('[ShareProgress] No user found');
        setLoading(false);
        return;
      }

      const [{ data: userData }, { data: goalData }] = await Promise.all([
        supabase.from('users').select('*').eq('id', authUser.id).maybeSingle(),
        supabase.from('goals').select('*').eq('user_id', authUser.id).eq('is_active', true).maybeSingle(),
      ]);

      const goal = goalData || {
        daily_calories: 2000,
        protein_g: 150,
        carbs_g: 200,
        fats_g: 65,
        fiber_g: 30,
        start_date: toLocalDateString(),
      };

      let startDate: string;
      if (goalData?.start_date) {
        startDate = goalData.start_date;
      } else if (userData?.created_at) {
        startDate = userData.created_at.split('T')[0];
      } else {
        startDate = toLocalDateString();
      }

      console.log('[ShareProgress] Journey start date:', startDate);

      // Run independent calculations in parallel
      const [consistencyScore, weightResult, dayStreak, checkInsWithPhotos, calorieDeficit] = await Promise.all([
        calculateConsistencyScore(authUser.id, startDate, goal.protein_g || 150),
        calculateWeightGoalProgress(authUser.id, userData),
        calculateDayStreak(authUser.id, startDate),
        supabase
          .from('check_ins')
          .select('id, date, photo_url')
          .eq('user_id', authUser.id)
          .not('photo_url', 'is', null)
          .order('date', { ascending: true }),
        calculateRecentDeficit(authUser.id),
      ]);

      const { weightGoalProgress, weightLost } = weightResult;

      console.log('[ShareProgress] Consistency Score:', consistencyScore);
      console.log('[ShareProgress] Weight Goal Progress:', weightGoalProgress, '%');
      console.log('[ShareProgress] Weight Lost:', weightLost, 'lb');
      console.log('[ShareProgress] Day Streak:', dayStreak);

      // Extract before/after photos
      const photosData = checkInsWithPhotos.data ?? [];
      const beforeCheckIn = photosData.length > 0 ? photosData[0] : null;
      const afterCheckIn = photosData.length > 1 ? photosData[photosData.length - 1] : null;

      const beforePhotoUrl: string | null = beforeCheckIn?.photo_url ?? null;
      const afterPhotoUrl: string | null = afterCheckIn?.photo_url ?? null;

      const formatDateLabel = (dateStr: string | null | undefined): string => {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      };

      const beforeDateLabel = formatDateLabel(beforeCheckIn?.date);
      const afterDateLabel = photosData.length > 1 ? formatDateLabel(afterCheckIn?.date) : 'Today';

      console.log('[ShareProgress] Before photo:', beforePhotoUrl ? 'found' : 'none');
      console.log('[ShareProgress] After photo:', afterPhotoUrl ? 'found' : 'none');

      // Fetch leaderboard phrase
      const fallbackPhrase = "Keep going — you're building momentum 📈";
      let leaderboardPhrase = fallbackPhrase;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        console.log('[ShareProgress] Fetching leaderboard rank for score:', consistencyScore);
        const leaderboardResponse = await fetch(
          `${SUPABASE_PROJECT_URL}/functions/v1/get-leaderboard-rank`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({ score: consistencyScore }),
          }
        );
        if (leaderboardResponse.ok) {
          const leaderboardData = await leaderboardResponse.json();
          leaderboardPhrase = leaderboardData.phrase ?? fallbackPhrase;
          console.log('[ShareProgress] Leaderboard phrase:', leaderboardPhrase);
        } else {
          console.warn('[ShareProgress] Leaderboard rank fetch returned', leaderboardResponse.status);
        }
      } catch (e) {
        console.warn('[ShareProgress] Leaderboard rank fetch failed, using fallback');
      }

      const motivationalLine = getMotivationalLine(consistencyScore, weightLost, dayStreak);

      setCardData({
        consistencyScore,
        weightGoalProgress,
        weightLost,
        dayStreak,
        motivationalLine,
        leaderboardPhrase,
        beforePhotoUrl,
        afterPhotoUrl,
        beforeDateLabel,
        afterDateLabel,
        calorieDeficit,
      });

      setLoading(false);
    } catch (error) {
      console.error('[ShareProgress] Error loading card data:', error);
      setLoading(false);
    }
  }, [calculateConsistencyScore]);

  useEffect(() => {
    loadCardData();
  }, [loadCardData]);

  const handleShare = async () => {
    console.log('[ShareProgress] Share button pressed — variant:', selected);

    const activeRef = selected === 'level' ? xpShotRef.current : viewShotRef.current;
    if (!activeRef) {
      console.log('[ShareProgress] ViewShot ref not available for variant:', selected);
      return;
    }

    try {
      setSharing(true);
      console.log('[ShareProgress] Capturing card for variant:', selected);

      const uri = await activeRef.captureWhenReady();
      console.log('[ShareProgress] Card captured:', uri);

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing not available', 'Sharing is not available on this device');
        setSharing(false);
        return;
      }

      console.log('[ShareProgress] Sharing is available, proceeding...');

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share your progress',
      });

      console.log('[ShareProgress] Card shared successfully');
      setSharing(false);
    } catch (error) {
      console.error('[ShareProgress] Error sharing card:', error);
      Alert.alert('Error', 'Failed to share progress card');
      setSharing(false);
    }
  };

  const bgColor = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const textSecColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const segBgColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const activeSegBg = isDark ? colors.cardDark : '#FFFFFF';

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => { console.log('[ShareProgress] Back pressed'); router.back(); }}
            style={styles.backButton}
          >
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow_back"
              size={24}
              color={textColor}
            />
          </TouchableOpacity>
          <Text style={[styles.title, { color: textColor }]}>Share Progress</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: textColor }]}>
            Preparing your progress card...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!cardData) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => { console.log('[ShareProgress] Back pressed'); router.back(); }}
            style={styles.backButton}
          >
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow_back"
              size={24}
              color={textColor}
            />
          </TouchableOpacity>
          <Text style={[styles.title, { color: textColor }]}>Share Progress</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: textColor }]}>
            Unable to load progress data
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => { console.log('[ShareProgress] Back pressed'); router.back(); }}
          style={styles.backButton}
        >
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={textColor}
          />
        </TouchableOpacity>
        <Text style={[styles.title, { color: textColor }]}>Share Progress</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Segmented control ── */}
        <View style={[styles.segmentedControl, { backgroundColor: segBgColor }]}>
          <TouchableOpacity
            style={[
              styles.segmentButton,
              selected === 'progress' && [
                styles.segmentButtonActive,
                { backgroundColor: activeSegBg },
              ],
            ]}
            onPress={() => {
              console.log('[ShareProgress] Switched to Progress variant');
              setSelected('progress');
            }}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.segmentText,
              { color: selected === 'progress' ? textColor : textSecColor },
              selected === 'progress' && styles.segmentTextActive,
            ]}>
              Progress
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.segmentButton,
              selected === 'level' && [
                styles.segmentButtonActive,
                { backgroundColor: activeSegBg },
              ],
            ]}
            onPress={() => {
              console.log('[ShareProgress] Switched to Level variant');
              setSelected('level');
            }}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.segmentText,
              { color: selected === 'level' ? textColor : textSecColor },
              selected === 'level' && styles.segmentTextActive,
            ]}>
              Level
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Progress card ── */}
        {selected === 'progress' && (
          <>
            {/* Off-screen full-res capture target */}
            <View
              style={styles.offScreenCapture}
              pointerEvents="none"
            >
              <ShareableProgressCard
                ref={viewShotRef}
                beforePhoto={cardData.beforePhotoUrl}
                afterPhoto={cardData.afterPhotoUrl}
                beforeDate={cardData.beforeDateLabel}
                afterDate={cardData.afterDateLabel}
                leaderboardPhrase={cardData.leaderboardPhrase}
              />
            </View>

            {/* On-screen scaled preview */}
            <View
              style={[
                styles.previewWrapper,
                {
                  width: progressPreviewWidth,
                  height: progressPreviewHeight,
                },
              ]}
            >
              <View
                style={{
                  width: PROGRESS_CARD_WIDTH,
                  transform: [{ scale: progressScale }],
                  transformOrigin: 'top left',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                }}
              >
                <ShareableProgressCard
                  beforePhoto={cardData.beforePhotoUrl}
                  afterPhoto={cardData.afterPhotoUrl}
                  beforeDate={cardData.beforeDateLabel}
                  afterDate={cardData.afterDateLabel}
                  leaderboardPhrase={cardData.leaderboardPhrase}
                />
              </View>
            </View>
          </>
        )}

        {/* ── Level / XP card ── */}
        {selected === 'level' && (
          <>
            {xpLoading || !xpStatus ? (
              <View style={styles.xpLoadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: textColor }]}>
                  Loading XP data...
                </Text>
              </View>
            ) : (
              <>
                {/* Off-screen full-res capture target */}
                <View
                  style={[styles.offScreenCapture, { width: XP_CARD_WIDTH, height: XP_CARD_HEIGHT }]}
                  pointerEvents="none"
                >
                  <XpShareCard
                    ref={xpShotRef}
                    level={xpStatus.current_level}
                    rank={xpStatus.current_rank}
                    totalXp={xpStatus.total_xp}
                    currentStreak={xpStatus.current_streak}
                    consistencyScore={cardData.consistencyScore}
                    percentile={xpStatus.ranking?.percentile ?? 50}
                    calorieDeficit={cardData.calorieDeficit}
                  />
                </View>

                {/* On-screen scaled preview */}
                <View
                  style={[
                    styles.previewWrapper,
                    {
                      width: xpPreviewWidth,
                      height: xpPreviewHeight,
                    },
                  ]}
                >
                  <View
                    style={{
                      width: XP_CARD_WIDTH,
                      height: XP_CARD_HEIGHT,
                      transform: [{ scale: xpScale }],
                      transformOrigin: 'top left',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                    }}
                  >
                    <XpShareCard
                      level={xpStatus.current_level}
                      rank={xpStatus.current_rank}
                      totalXp={xpStatus.total_xp}
                      currentStreak={xpStatus.current_streak}
                      consistencyScore={cardData.consistencyScore}
                      percentile={xpStatus.ranking?.percentile ?? 50}
                      calorieDeficit={cardData.calorieDeficit}
                    />
                  </View>
                </View>
              </>
            )}
          </>
        )}

        {/* ── Share CTA ── */}
        <TouchableOpacity
          style={[styles.shareButton, sharing && styles.shareButtonDisabled]}
          onPress={handleShare}
          disabled={sharing}
          activeOpacity={0.85}
        >
          {sharing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <React.Fragment>
              <IconSymbol
                ios_icon_name="square.and.arrow.up"
                android_material_icon_name="share"
                size={22}
                color="#FFFFFF"
              />
              <Text style={styles.shareButtonText}>Share Your Progress</Text>
            </React.Fragment>
          )}
        </TouchableOpacity>

        {/* ── Helper text ── */}
        <Text style={[styles.helperText, { color: textSecColor }]}>
          Share to Instagram, WhatsApp, Messages, and more
        </Text>

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
  backButton: {
    padding: spacing.xs,
  },
  title: {
    ...typography.h2,
    fontSize: 20,
  },
  placeholder: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 40,
  },
  // ── Segmented control ──────────────────────────────────────────────────────
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: borderRadius.full,
    padding: 4,
    marginBottom: spacing.lg,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: borderRadius.full,
  },
  segmentButtonActive: {
    boxShadow: '0px 1px 3px rgba(0,0,0,0.12)',
    elevation: 2,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
  segmentTextActive: {
    fontWeight: '700',
  },
  // ── Off-screen capture target ──────────────────────────────────────────────
  offScreenCapture: {
    position: 'absolute',
    left: -10000,
    top: 0,
  },
  // ── On-screen preview ─────────────────────────────────────────────────────
  previewWrapper: {
    overflow: 'hidden',
    borderRadius: borderRadius.xl,
    marginBottom: spacing.xl,
    alignSelf: 'center',
    boxShadow: '0px 8px 24px rgba(0,0,0,0.12)',
    elevation: 8,
  },
  // ── XP loading ────────────────────────────────────────────────────────────
  xpLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
    gap: spacing.md,
  },
  // ── Share button ──────────────────────────────────────────────────────────
  shareButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md + 4,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    boxShadow: '0px 6px 20px rgba(91, 154, 168, 0.35)',
    elevation: 6,
  },
  shareButtonDisabled: {
    opacity: 0.6,
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  // ── Helper text ───────────────────────────────────────────────────────────
  helperText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  bottomSpacer: {
    height: 40,
  },
});
