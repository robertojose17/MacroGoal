
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Animated,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import Svg, { Line, Path, Circle, Text as SvgText, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/lib/supabase/client';
import { toLocalDateString } from '@/utils/dateUtils';

interface ProgressCardProps {
  userId: string;
  isDark: boolean;
}

interface ProfileData {
  startDate: Date;
  startWeightLbs: number;
  goalWeightLbs: number;
  weeklyLossLbs: number;
  maintenanceCalories: number;
  dailyCalories: number;
}

interface CalorieLog {
  date: Date;
  calories: number;
}

interface WeightCheckIn {
  date: Date;
  weightLbs: number;
}

// ─── Stat tooltip modal ───────────────────────────────────────────────────────
interface StatTooltipModalProps {
  visible: boolean;
  title: string;
  explanation: string;
  isDark: boolean;
  onClose: () => void;
}

function StatTooltipModal({ visible, title, explanation, isDark, onClose }: StatTooltipModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 32,
        }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
            borderRadius: 20,
            padding: 24,
            width: '100%',
            maxWidth: 340,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.25,
            shadowRadius: 20,
            elevation: 10,
          }}
          onPress={() => {}}
        >
          {/* Header row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: isDark ? '#888' : '#999',
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              {title}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 14, color: isDark ? '#AAA' : '#666', lineHeight: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text
            style={{
              fontSize: 15,
              color: isDark ? '#E5E5EA' : '#1C1C1E',
              lineHeight: 22,
              fontWeight: '400',
            }}
          >
            {explanation}
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Premium stat card for Stats view ────────────────────────────────────────
interface PremiumStatCardProps {
  title: string;
  value: string;
  subtitle: string;
  explanation: string;
  accent?: string;
  isDark: boolean;
}

function PremiumStatCard({ title, value, subtitle, explanation, accent, isDark }: PremiumStatCardProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const valueColor = accent || (isDark ? '#FFFFFF' : '#111111');

  const handlePress = () => {
    console.log('[ProgressCard] Stat card tapped:', title);
    setTooltipVisible(true);
  };

  const handleClose = () => {
    console.log('[ProgressCard] Stat tooltip dismissed:', title);
    setTooltipVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={handlePress}
        style={{
          flex: 1,
          backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
          borderRadius: 16,
          padding: 16,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0.4 : 0.08,
          shadowRadius: 8,
          elevation: 3,
          borderWidth: isDark ? 0 : 1,
          borderColor: '#F0F0F0',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text
            style={{
              fontSize: 10,
              fontWeight: '600',
              color: isDark ? '#666' : '#999',
              letterSpacing: 0.8,
              textTransform: 'uppercase',
            }}
          >
            {title}
          </Text>
          <Text style={{ fontSize: 12, color: isDark ? '#555' : '#C0C0C0' }}>ⓘ</Text>
        </View>
        <Text
          style={{
            fontSize: 14,
            fontWeight: '600',
            color: valueColor,
            lineHeight: 20,
          }}
        >
          {value}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: isDark ? '#888' : '#999',
            marginTop: 4,
            lineHeight: 16,
          }}
        >
          {subtitle}
        </Text>
      </TouchableOpacity>

      <StatTooltipModal
        visible={tooltipVisible}
        title={title}
        explanation={explanation}
        isDark={isDark}
        onClose={handleClose}
      />
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ProgressCard({ userId, isDark }: ProgressCardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [calorieLogs, setCalorieLogs] = useState<CalorieLog[]>([]);
  const [actualWeightPoints, setActualWeightPoints] = useState<WeightCheckIn[]>([]);

  // ── Carousel state ───────────────────────────────────────────────────────
  const [activePage, setActivePage] = useState(0);
  const [cardWidth, setCardWidth] = useState(0);
  const dot0Anim = useRef(new Animated.Value(20)).current;
  const dot1Anim = useRef(new Animated.Value(6)).current;

  const animateDots = useCallback((page: number) => {
    Animated.spring(dot0Anim, {
      toValue: page === 0 ? 20 : 6,
      useNativeDriver: false,
    }).start();
    Animated.spring(dot1Anim, {
      toValue: page === 1 ? 20 : 6,
      useNativeDriver: false,
    }).start();
  }, [dot0Anim, dot1Anim]);

  const handleScroll = useCallback((event: any) => {
    if (cardWidth <= 0) return;
    const offsetX = event.nativeEvent.contentOffset.x;
    const page = Math.round(offsetX / cardWidth);
    if (page !== activePage) {
      console.log('[ProgressCard] Carousel swiped to page:', page === 0 ? 'Graph' : 'Stats');
      setActivePage(page);
      animateDots(page);
    }
  }, [cardWidth, activePage, animateDots]);

  // ── Data loading ─────────────────────────────────────────────────────────
  const loadProfileData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('[ProgressCard] Loading profile data for user:', userId);

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('current_weight, goal_weight, preferred_units, maintenance_calories, created_at')
        .eq('id', userId)
        .maybeSingle();

      if (userError) {
        console.error('[ProgressCard] Error loading user data:', userError);
        throw userError;
      }

      let goalData = null;

      const { data: activeGoalData, error: activeGoalError } = await supabase
        .from('goals')
        .select('start_date, loss_rate_lbs_per_week, daily_calories, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('start_date', { ascending: false })
        .limit(1);

      if (activeGoalError) {
        console.error('[ProgressCard] Error loading active goal data:', activeGoalError);
      } else {
        console.log('[ProgressCard] Active goal query returned:', activeGoalData?.length || 0, 'rows');
      }

      if (activeGoalData && activeGoalData.length > 0) {
        goalData = activeGoalData[0];
        console.log('[ProgressCard] Found active goal:', goalData);
      } else {
        console.log('[ProgressCard] No active goal found, falling back to most recent goal');
        const { data: recentGoalData, error: recentGoalError } = await supabase
          .from('goals')
          .select('start_date, loss_rate_lbs_per_week, daily_calories, is_active')
          .eq('user_id', userId)
          .order('start_date', { ascending: false })
          .limit(1);

        if (recentGoalError) {
          console.error('[ProgressCard] Error loading recent goal data:', recentGoalError);
        } else {
          console.log('[ProgressCard] Recent goal query returned:', recentGoalData?.length || 0, 'rows');
        }

        if (recentGoalData && recentGoalData.length > 0) {
          goalData = recentGoalData[0];
          console.log('[ProgressCard] Found most recent goal:', goalData);
        }
      }

      console.log('[ProgressCard] === RAW SUPABASE DATA ===');
      console.log('[ProgressCard] userData:', JSON.stringify(userData, null, 2));
      console.log('[ProgressCard] goalData:', JSON.stringify(goalData, null, 2));

      if (!userData) {
        console.log('[ProgressCard] No user data found');
        setError('Set your weight goal in Profile to see progress.');
        setLoading(false);
        return;
      }

      // Field names: users table stores current_weight (kg) and preferred_units ('metric'/'imperial')
      const rawStartingWeight = userData.current_weight;
      const rawGoalWeight = userData.goal_weight;
      const parsedStartingWeight = parseFloat(rawStartingWeight);
      const parsedGoalWeight = parseFloat(rawGoalWeight);

      console.log('[ProgressCard] parsedStartingWeight (current_weight kg):', parsedStartingWeight);
      console.log('[ProgressCard] parsedGoalWeight (goal_weight kg):', parsedGoalWeight);

      if (!rawGoalWeight || isNaN(parsedGoalWeight) || parsedGoalWeight <= 0) {
        console.log('[ProgressCard] Goal weight is missing or invalid:', rawGoalWeight);
        setError('Set your weight goal in Profile to see progress.');
        setLoading(false);
        return;
      }

      if (!rawStartingWeight || isNaN(parsedStartingWeight) || parsedStartingWeight <= 0) {
        console.log('[ProgressCard] Starting weight is missing or invalid:', rawStartingWeight);
        setError('Set your starting weight in Profile to see progress.');
        setLoading(false);
        return;
      }

      // preferred_units is 'metric' or 'imperial' — weights in DB are always stored in kg
      console.log('[ProgressCard] preferred_units:', userData.preferred_units, '— DB weights are always kg, converting to lbs for chart');

      // Always convert from kg (DB storage) to lbs (chart display)
      const startWeightLbs = parsedStartingWeight * 2.20462;
      const goalWeightLbs = parsedGoalWeight * 2.20462;

      let startDate: Date;

      if (goalData && goalData.start_date) {
        startDate = new Date(goalData.start_date + 'T00:00:00');
        console.log('[ProgressCard] Using goal start_date:', goalData.start_date);
      } else if (userData.created_at) {
        startDate = new Date(userData.created_at);
        startDate.setHours(0, 0, 0, 0);
        console.log('[ProgressCard] No start_date on goal, falling back to user created_at:', startDate.toISOString());
      } else {
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        console.log('[ProgressCard] No start_date or created_at, using today');
      }

      const rawLossRate = goalData?.loss_rate_lbs_per_week;
      // For maintain/gain goals loss_rate is null — use a default so the planned line spans 90 days
      const weeklyLossLbs = parseFloat(rawLossRate) > 0 ? parseFloat(rawLossRate) : 1.0;
      const maintenanceCalories = userData.maintenance_calories || 2000;
      const dailyCalories = goalData?.daily_calories || maintenanceCalories || 2000;

      const hasValidData =
        !isNaN(startWeightLbs) && startWeightLbs > 0 &&
        !isNaN(goalWeightLbs) && goalWeightLbs > 0;

      if (!hasValidData) {
        console.log('[ProgressCard] Invalid weight data after kg→lbs conversion');
        setError('Set your weight goal in Profile to see progress.');
        setLoading(false);
        return;
      }

      console.log('[ProgressCard] startWeightLbs:', startWeightLbs.toFixed(1), 'goalWeightLbs:', goalWeightLbs.toFixed(1), 'weeklyLossLbs:', weeklyLossLbs);

      setProfileData({
        startDate,
        startWeightLbs,
        goalWeightLbs,
        weeklyLossLbs,
        maintenanceCalories,
        dailyCalories,
      });

      console.log('[ProgressCard] Profile data loaded successfully');

      await loadCalorieLogs(userId, startDate);
      // check_ins.weight is always stored in kg — loadWeightCheckIns always converts kg→lbs
      await loadWeightCheckIns(userId, startDate);

      setLoading(false);
    } catch (err: any) {
      console.error('[ProgressCard] Error loading profile data:', err);
      setError('Failed to load progress data');
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadProfileData();
  }, [userId, loadProfileData]);

  const loadCalorieLogs = async (uid: string, startDate: Date) => {
    try {
      const today = new Date();
      const startDateStr = toLocalDateString(startDate);
      const todayStr = toLocalDateString(today);

      console.log('[ProgressCard] Loading calorie logs from', startDateStr, 'to', todayStr);

      const { data: mealsData, error: mealsError } = await supabase
        .from('meals')
        .select(`date, meal_items ( calories )`)
        .eq('user_id', uid)
        .gte('date', startDateStr)
        .lte('date', todayStr);

      if (mealsError) {
        console.error('[ProgressCard] Error loading calorie logs:', mealsError);
        return;
      }

      console.log('[ProgressCard] Meals data returned:', mealsData?.length || 0, 'meals');

      const caloriesByDate: { [key: string]: number } = {};

      if (mealsData && mealsData.length > 0) {
        mealsData.forEach((meal: any) => {
          if (meal.meal_items) {
            meal.meal_items.forEach((item: any) => {
              if (!caloriesByDate[meal.date]) caloriesByDate[meal.date] = 0;
              caloriesByDate[meal.date] += item.calories || 0;
            });
          }
        });
      }

      const logs: CalorieLog[] = Object.entries(caloriesByDate).map(([dateStr, cals]) => ({
        date: new Date(dateStr + 'T00:00:00'),
        calories: cals,
      }));

      console.log('[ProgressCard] Calorie logs loaded:', logs.length, 'days with data');
      setCalorieLogs(logs);
    } catch (err: any) {
      console.error('[ProgressCard] Error loading calorie logs:', err);
    }
  };

  const loadWeightCheckIns = async (uid: string, startDate: Date) => {
    try {
      const today = new Date();
      const startDateStr = toLocalDateString(startDate);
      const todayStr = toLocalDateString(today);

      console.log('[ProgressCard] Loading weight check-ins from', startDateStr, 'to', todayStr);

      const { data: checkInsData, error: checkInsError } = await supabase
        .from('check_ins')
        .select('date, weight')
        .eq('user_id', uid)
        .gte('date', startDateStr)
        .lte('date', todayStr)
        .not('weight', 'is', null)
        .order('date', { ascending: true });

      if (checkInsError) {
        console.error('[ProgressCard] Error loading weight check-ins:', checkInsError);
        return;
      }

      console.log('[ProgressCard] Weight check-ins returned:', checkInsData?.length || 0, 'entries');

      if (!checkInsData || checkInsData.length === 0) {
        setActualWeightPoints([]);
        return;
      }

      const weightPoints: WeightCheckIn[] = checkInsData.map((checkIn: any) => ({
        date: new Date(checkIn.date + 'T00:00:00'),
        weightLbs: checkIn.weight * 2.20462,
      }));

      console.log('[ProgressCard] Weight check-ins loaded:', weightPoints.length, 'points');
      setActualWeightPoints(weightPoints);
    } catch (err: any) {
      console.error('[ProgressCard] Error loading weight check-ins:', err);
    }
  };

  // ── Planned line data ────────────────────────────────────────────────────
  const plannedData = useMemo(() => {
    if (!profileData) return null;

    const { startDate, startWeightLbs, goalWeightLbs, weeklyLossLbs } = profileData;
    const totalWeightChange = Math.abs(goalWeightLbs - startWeightLbs);

    // For maintain goals (or equal weights) use a 90-day window so the chart still renders
    let totalDays: number;
    if (totalWeightChange < 0.1) {
      totalDays = 90;
    } else {
      const totalWeeks = totalWeightChange / Math.max(weeklyLossLbs, 0.1);
      totalDays = Math.max(Math.ceil(totalWeeks * 7), 2); // at least 2 points to avoid division by zero
    }

    const dataPoints: { date: Date; weightLbs: number }[] = [];
    for (let i = 0; i <= totalDays; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      const weight = totalDays > 0
        ? startWeightLbs + (goalWeightLbs - startWeightLbs) * (i / totalDays)
        : startWeightLbs;
      dataPoints.push({ date: currentDate, weightLbs: weight });
    }

    console.log('[ProgressCard] Generated', dataPoints.length, 'planned data points, totalDays:', totalDays);
    return dataPoints;
  }, [profileData]);

  // ── Calorie projection data ──────────────────────────────────────────────
  const calorieProjectionData = useMemo(() => {
    if (!profileData || !plannedData || plannedData.length === 0) return null;

    const { weeklyLossLbs, dailyCalories } = profileData;
    const logsByDate: { [key: string]: number } = {};
    calorieLogs.forEach((log) => {
      logsByDate[toLocalDateString(log.date)] = log.calories;
    });

    const plannedDailyCalories = dailyCalories;
    let cumulativeDeviation = 0;
    const projectionPoints: { date: Date; weightLbs: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < plannedData.length; i++) {
      const plannedPoint = plannedData[i];
      const currentDate = new Date(plannedPoint.date);
      currentDate.setHours(0, 0, 0, 0);
      const dateStr = toLocalDateString(currentDate);

      if (currentDate <= today) {
        const actualCalories = logsByDate[dateStr];
        if (actualCalories !== undefined && actualCalories !== null) {
          const delta = actualCalories - plannedDailyCalories;
          cumulativeDeviation += delta / 3500;
        }
      }

      projectionPoints.push({
        date: currentDate,
        weightLbs: plannedPoint.weightLbs + cumulativeDeviation,
      });
    }

    console.log('[ProgressCard] Generated', projectionPoints.length, 'projection points, final deviation:', cumulativeDeviation.toFixed(4));
    return projectionPoints;
  }, [profileData, plannedData, calorieLogs]);

  // ── Chart config ─────────────────────────────────────────────────────────
  const chartConfig = useMemo(() => {
    if (!profileData || !plannedData || plannedData.length === 0) return null;

    const { startWeightLbs, goalWeightLbs } = profileData;
    const screenWidth = Dimensions.get('window').width;
    const cardPadding = spacing.lg * 2;
    const yAxisWidth = 55;
    const xAxisHeight = 30;
    const topPadding = 16;
    const chartAreaWidth = screenWidth - cardPadding - yAxisWidth - 20;
    const chartAreaHeight = 220;
    const totalWidth = screenWidth - cardPadding;
    const totalHeight = chartAreaHeight + xAxisHeight + topPadding;

    let minWeight = Math.min(startWeightLbs, goalWeightLbs);
    let maxWeight = Math.max(startWeightLbs, goalWeightLbs);

    if (calorieProjectionData && calorieProjectionData.length > 0) {
      const ws = calorieProjectionData.map(p => p.weightLbs);
      minWeight = Math.min(minWeight, ...ws);
      maxWeight = Math.max(maxWeight, ...ws);
    }

    if (actualWeightPoints && actualWeightPoints.length > 0) {
      const ws = actualWeightPoints.map(p => p.weightLbs);
      minWeight = Math.min(minWeight, ...ws);
      maxWeight = Math.max(maxWeight, ...ws);
    }

    const weightPadding = 3;
    const yMin = Math.max(0, minWeight - weightPadding);
    const yMax = maxWeight + weightPadding;
    const yRange = yMax - yMin;

    const numYTicks = 6;
    const yTicks: { value: number; label: string; y: number }[] = [];
    for (let i = 0; i < numYTicks; i++) {
      const value = yMax - (yRange * i / (numYTicks - 1));
      const y = topPadding + (chartAreaHeight * i / (numYTicks - 1));
      yTicks.push({ value, label: `${Math.round(value)} lb`, y });
    }

    const totalPoints = plannedData.length;
    const numXTicks = 6;
    const xTickIndices: number[] = [];
    if (totalPoints <= numXTicks) {
      for (let i = 0; i < totalPoints; i++) xTickIndices.push(i);
    } else {
      for (let i = 0; i < numXTicks; i++) {
        xTickIndices.push(Math.round((totalPoints - 1) * i / (numXTicks - 1)));
      }
    }

    const xTicks = xTickIndices.map((index) => {
      const point = plannedData[index];
      const month = (point.date.getMonth() + 1).toString().padStart(2, '0');
      const day = point.date.getDate().toString().padStart(2, '0');
      return { index, label: `${month}/${day}`, x: yAxisWidth + (chartAreaWidth * index / (totalPoints - 1)) };
    });

    const plannedPathPoints = plannedData.map((point, index) => ({
      x: yAxisWidth + (chartAreaWidth * index / (totalPoints - 1)),
      y: topPadding + (chartAreaHeight * (1 - (point.weightLbs - yMin) / yRange)),
    }));

    let plannedPathData = `M ${plannedPathPoints[0].x} ${plannedPathPoints[0].y}`;
    for (let i = 1; i < plannedPathPoints.length; i++) {
      plannedPathData += ` L ${plannedPathPoints[i].x} ${plannedPathPoints[i].y}`;
    }

    const chartBottom = topPadding + chartAreaHeight;
    let fillPathData = `M ${plannedPathPoints[0].x} ${chartBottom}`;
    fillPathData += ` L ${plannedPathPoints[0].x} ${plannedPathPoints[0].y}`;
    for (let i = 1; i < plannedPathPoints.length; i++) {
      fillPathData += ` L ${plannedPathPoints[i].x} ${plannedPathPoints[i].y}`;
    }
    fillPathData += ` L ${plannedPathPoints[plannedPathPoints.length - 1].x} ${chartBottom} Z`;

    let projectionPathData: string | null = null;
    if (calorieProjectionData && calorieProjectionData.length > 0) {
      const pts = calorieProjectionData.map((point, index) => ({
        x: yAxisWidth + (chartAreaWidth * index / (totalPoints - 1)),
        y: topPadding + (chartAreaHeight * (1 - (point.weightLbs - yMin) / yRange)),
      }));
      projectionPathData = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 1; i < pts.length; i++) projectionPathData += ` L ${pts[i].x} ${pts[i].y}`;
    }

    const actualWeightCircles: { x: number; y: number; weightLbs: number }[] = [];
    if (actualWeightPoints && actualWeightPoints.length > 0) {
      actualWeightPoints.forEach((point) => {
        let closestIndex = 0;
        let minDiff = Math.abs(point.date.getTime() - plannedData[0].date.getTime());
        for (let i = 1; i < plannedData.length; i++) {
          const diff = Math.abs(point.date.getTime() - plannedData[i].date.getTime());
          if (diff < minDiff) { minDiff = diff; closestIndex = i; }
        }
        actualWeightCircles.push({
          x: yAxisWidth + (chartAreaWidth * closestIndex / (totalPoints - 1)),
          y: topPadding + (chartAreaHeight * (1 - (point.weightLbs - yMin) / yRange)),
          weightLbs: point.weightLbs,
        });
      });
    }

    // ── Smoothed trend line (moving average window=3) ──────────────────────
    let trendPathData: string | null = null;
    if (actualWeightPoints && actualWeightPoints.length >= 3) {
      const window = 3;
      const smoothed: { x: number; y: number }[] = [];
      for (let i = 0; i < actualWeightCircles.length; i++) {
        const start = Math.max(0, i - Math.floor(window / 2));
        const end = Math.min(actualWeightCircles.length - 1, i + Math.floor(window / 2));
        let sum = 0;
        for (let j = start; j <= end; j++) sum += actualWeightCircles[j].y;
        smoothed.push({ x: actualWeightCircles[i].x, y: sum / (end - start + 1) });
      }
      if (smoothed.length >= 2) {
        trendPathData = `M ${smoothed[0].x} ${smoothed[0].y}`;
        for (let i = 1; i < smoothed.length; i++) {
          trendPathData += ` L ${smoothed[i].x} ${smoothed[i].y}`;
        }
      }
    }

    return {
      totalWidth, totalHeight, chartAreaWidth, chartAreaHeight,
      yAxisWidth, xAxisHeight, topPadding,
      yTicks, xTicks,
      pathData: plannedPathData, fillPathData, projectionPathData,
      actualWeightCircles, yMin, yMax,
      trendPathData,
    };
  }, [profileData, plannedData, calorieProjectionData, actualWeightPoints]);

  // ── Derived stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!profileData || !plannedData || plannedData.length === 0) return null;

    const { startWeightLbs, goalWeightLbs, startDate, dailyCalories } = profileData;
    const totalDays = plannedData.length - 1;

    // Weight lost
    const latestWeight = actualWeightPoints.length > 0
      ? actualWeightPoints[actualWeightPoints.length - 1].weightLbs
      : null;
    const weightLost = latestWeight !== null ? startWeightLbs - latestWeight : null;

    // Current pace (last 14 days of check-ins)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fourteenDaysAgo = new Date(today);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const recentPoints = actualWeightPoints.filter(p => p.date >= fourteenDaysAgo);
    let currentPaceLbsPerWeek: number | null = null;
    if (recentPoints.length >= 2) {
      const first = recentPoints[0];
      const last = recentPoints[recentPoints.length - 1];
      const daysDiff = (last.date.getTime() - first.date.getTime()) / (1000 * 60 * 60 * 24);
      const weeksDiff = daysDiff / 7;
      currentPaceLbsPerWeek = weeksDiff > 0 ? (first.weightLbs - last.weightLbs) / weeksDiff : null;
    }

    // Adherence
    const logsByDate: { [key: string]: number } = {};
    calorieLogs.forEach(log => {
      logsByDate[toLocalDateString(log.date)] = log.calories;
    });
    const trackedDays = calorieLogs.length;
    const adherentDays = calorieLogs.filter(log => {
      const lower = dailyCalories * 0.85;
      const upper = dailyCalories * 1.15;
      return log.calories >= lower && log.calories <= upper;
    }).length;
    const adherencePct = trackedDays > 0 ? Math.round((adherentDays / trackedDays) * 100) : null;

    // Cumulative calorie deviation → days ahead/behind
    let cumulativeCalDev = 0;
    calorieLogs.forEach(log => {
      cumulativeCalDev += log.calories - dailyCalories;
    });
    const daysDeviation = dailyCalories > 0 ? cumulativeCalDev / dailyCalories : 0;
    // positive = surplus = behind plan; negative = deficit = ahead of plan
    const daysAhead = -daysDeviation; // positive means ahead

    // Planned goal date
    const plannedGoalDate = new Date(startDate);
    plannedGoalDate.setDate(plannedGoalDate.getDate() + totalDays);

    // Projected goal date
    const projectedGoalDate = new Date(plannedGoalDate);
    projectedGoalDate.setDate(projectedGoalDate.getDate() - Math.round(daysAhead));

    // Status vs plan
    let vsStatus: 'ahead' | 'behind' | 'on-track';
    if (daysAhead > 1) vsStatus = 'ahead';
    else if (daysAhead < -1) vsStatus = 'behind';
    else vsStatus = 'on-track';

    // Graph status label (from calorie projection vs planned last point)
    let graphStatus: 'on_track' | 'ahead' | 'behind' = 'on_track';
    if (calorieProjectionData && calorieProjectionData.length > 0 && plannedData.length > 0) {
      const lastProjected = calorieProjectionData[calorieProjectionData.length - 1].weightLbs;
      const lastPlanned = plannedData[plannedData.length - 1].weightLbs;
      const diff = lastProjected - lastPlanned;
      if (diff > 0.5) graphStatus = 'behind';
      else if (diff < -0.5) graphStatus = 'ahead';
      else graphStatus = 'on_track';
    }

    // Days since start
    const daysSinceStart = Math.round((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    return {
      latestWeight,
      weightLost,
      startWeightLbs,
      goalWeightLbs,
      currentPaceLbsPerWeek,
      adherencePct,
      adherentDays,
      trackedDays,
      daysAhead,
      vsStatus,
      plannedGoalDate,
      projectedGoalDate,
      graphStatus,
      daysSinceStart,
      daysDeviation: Math.abs(Math.round(daysAhead)),
    };
  }, [profileData, plannedData, actualWeightPoints, calorieLogs, calorieProjectionData]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const formatDate = (d: Date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}`;
  };

  // ── Loading / error states ───────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.cardBorderDark : colors.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: isDark ? colors.textDark : colors.text }]}>Progress</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.cardBorderDark : colors.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: isDark ? colors.textDark : colors.text }]}>Progress</Text>
        <View style={styles.errorContainer}>
          <IconSymbol ios_icon_name="exclamationmark.triangle" android_material_icon_name="warning" size={48} color={isDark ? colors.textSecondaryDark : colors.textSecondary} />
          <Text style={[styles.errorText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!chartConfig) {
    return (
      <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card, borderColor: isDark ? colors.cardBorderDark : colors.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: isDark ? colors.textDark : colors.text }]}>Progress</Text>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>Set your weight goal in Profile to see progress.</Text>
        </View>
      </View>
    );
  }

  const labelColor = isDark ? colors.textDark : colors.text;
  const gridColor = isDark ? colors.borderDark : colors.border;
  const lineColor = colors.success;
  const projectionColor = colors.primary;
  const actualWeightColor = colors.warning;

  // ── Graph status pill config ─────────────────────────────────────────────
  const graphStatusConfig = stats ? {
    'on_track': { label: '● On track', pillFill: '#3B82F6', textFill: '#FFFFFF' },
    'ahead': { label: '↑ Ahead of plan', pillFill: '#22C55E', textFill: '#FFFFFF' },
    'behind': { label: '↓ Behind plan', pillFill: '#F97316', textFill: '#FFFFFF' },
  }[stats.graphStatus] : null;

  // ── Stats view computed values ───────────────────────────────────────────
  const currentWeightLbs = actualWeightPoints.length > 0
    ? actualWeightPoints[actualWeightPoints.length - 1].weightLbs
    : (profileData ? profileData.startWeightLbs : 0);

  const card1Value = stats && stats.weightLost !== null
    ? (stats.weightLost >= 0
        ? `↓ ${stats.weightLost.toFixed(1)} lb`
        : `↑ ${Math.abs(stats.weightLost).toFixed(1)} lb`)
    : '--';
  const card1Subtitle = stats ? `since start · ${stats.daysSinceStart} days` : '--';
  const card1Accent = stats && stats.weightLost !== null
    ? (stats.weightLost >= 0 ? '#22C55E' : '#EF4444')
    : undefined;

  const card2Value = stats && stats.currentPaceLbsPerWeek !== null
    ? `${stats.currentPaceLbsPerWeek >= 0 ? '-' : '+'}${Math.abs(stats.currentPaceLbsPerWeek).toFixed(1)} lb/wk`
    : 'No data';
  const card2Subtitle = stats && stats.adherencePct !== null ? `${stats.adherencePct}% on plan` : '--';

  const card3RawDaysAhead = stats ? stats.daysAhead : 0;
  const card3Value = stats
    ? (card3RawDaysAhead > 0
        ? `↑ ${Math.round(card3RawDaysAhead)}d ahead`
        : card3RawDaysAhead < 0
          ? `↓ ${Math.abs(Math.round(card3RawDaysAhead))}d behind`
          : 'On track')
    : '--';
  const card3Subtitle = stats && stats.adherencePct !== null
    ? (stats.adherencePct >= 90
        ? 'from calorie deficit'
        : stats.adherencePct >= 70
          ? 'mostly on plan'
          : 'recent surplus slowed progress')
    : '--';
  const card3Accent = stats
    ? (card3RawDaysAhead > 0 ? '#22C55E' : card3RawDaysAhead < 0 ? '#EF4444' : '#3B82F6')
    : undefined;

  const card4StartStr = profileData ? profileData.startWeightLbs.toFixed(1) : '--';
  const card4CurrentStr = currentWeightLbs.toFixed(1);
  const card4Value = `${card4StartStr} → ${card4CurrentStr} lb`;
  const card4GoalDateStr = stats
    ? (stats.projectedGoalDate
        ? formatDate(stats.projectedGoalDate)
        : stats.plannedGoalDate
          ? formatDate(stats.plannedGoalDate)
          : 'TBD')
    : 'TBD';
  const card4Subtitle = `Goal: ${card4GoalDateStr}`;

  // ── Legend items ─────────────────────────────────────────────────────────
  const legendItems = [
    { color: lineColor, label: 'Planned' },
    { color: projectionColor, label: 'Calories' },
    ...(chartConfig.actualWeightCircles.length > 0 ? [{ color: actualWeightColor, label: 'Actual' }] : []),
    ...(chartConfig.trendPathData ? [{ color: '#8B5CF6', label: 'Trend' }] : []),
  ];

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? colors.cardDark : colors.card,
          borderColor: isDark ? colors.cardBorderDark : colors.cardBorder,
        },
      ]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width - spacing.lg * 2;
        if (w > 0 && w !== cardWidth) setCardWidth(w);
      }}
    >
      {/* ── Header ── */}
      <View style={styles.cardHeader}>
        <View>
          <Text style={[styles.cardTitle, { color: isDark ? colors.textDark : colors.text }]}>
            Weight Progress
          </Text>
          <Text style={[styles.cardSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Swipe to see stats
          </Text>
        </View>
      </View>

      {/* ── Carousel ── */}
      {cardWidth > 0 && (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={handleScroll}
          style={{ width: cardWidth }}
          contentContainerStyle={{ width: cardWidth * 2 }}
          decelerationRate="fast"
          snapToInterval={cardWidth}
          snapToAlignment="start"
        >
          {/* ── Page 0: Graph ── */}
          <View style={{ width: cardWidth }}>
            {/* Legend */}
            <View style={styles.legendRow}>
              {legendItems.map((item, idx) => (
                <View key={idx} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={[styles.legendLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>

            {/* SVG Chart */}
            <View style={styles.chartContainer}>
              <Svg width={chartConfig.totalWidth} height={chartConfig.totalHeight}>
                <Defs>
                  <LinearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={lineColor} stopOpacity="0.3" />
                    <Stop offset="1" stopColor={lineColor} stopOpacity="0.05" />
                  </LinearGradient>
                </Defs>

                {/* Grid lines */}
                {chartConfig.yTicks.map((tick, index) => (
                  <Line key={`grid-h-${index}`} x1={chartConfig.yAxisWidth} y1={tick.y} x2={chartConfig.yAxisWidth + chartConfig.chartAreaWidth} y2={tick.y} stroke={gridColor} strokeWidth="1" strokeDasharray="4 4" />
                ))}

                {/* Planned fill + line */}
                <Path d={chartConfig.fillPathData} fill="url(#lineGradient)" />
                <Path d={chartConfig.pathData} stroke={lineColor} strokeWidth="2.5" fill="none" />

                {/* Calorie projection */}
                {chartConfig.projectionPathData && (
                  <Path d={chartConfig.projectionPathData} stroke={projectionColor} strokeWidth="2" fill="none" />
                )}

                {/* Trend line (moving average) */}
                {chartConfig.trendPathData && (
                  <Path
                    d={chartConfig.trendPathData}
                    stroke="#8B5CF6"
                    strokeWidth="2"
                    strokeOpacity="0.7"
                    strokeDasharray="6 3"
                    fill="none"
                  />
                )}

                {/* Actual weight dots */}
                {chartConfig.actualWeightCircles.map((circle, index) => (
                  <Circle key={`actual-weight-${index}`} cx={circle.x} cy={circle.y} r="5" fill={actualWeightColor} stroke={isDark ? colors.cardDark : colors.card} strokeWidth="2" />
                ))}

                {/* Y-axis labels */}
                {chartConfig.yTicks.map((tick, index) => (
                  <SvgText key={`y-label-${index}`} x={chartConfig.yAxisWidth - 8} y={tick.y + 4} fontSize="11" fill={labelColor} textAnchor="end">{tick.label}</SvgText>
                ))}

                {/* X-axis labels */}
                {chartConfig.xTicks.map((tick, index) => (
                  <SvgText key={`x-label-${index}`} x={tick.x} y={chartConfig.topPadding + chartConfig.chartAreaHeight + 20} fontSize="10" fill={labelColor} textAnchor="middle">{tick.label}</SvgText>
                ))}

                {/* Status pill in top-right of chart area */}
                {graphStatusConfig && (
                  <>
                    <Rect
                      x={chartConfig.yAxisWidth + chartConfig.chartAreaWidth - 110}
                      y={chartConfig.topPadding + 4}
                      width={108}
                      height={22}
                      rx={11}
                      ry={11}
                      fill={graphStatusConfig.pillFill}
                      opacity={0.9}
                    />
                    <SvgText
                      x={chartConfig.yAxisWidth + chartConfig.chartAreaWidth - 56}
                      y={chartConfig.topPadding + 19}
                      fontSize="11"
                      fontWeight="600"
                      fill={graphStatusConfig.textFill}
                      textAnchor="middle"
                    >
                      {graphStatusConfig.label}
                    </SvgText>
                  </>
                )}
              </Svg>
            </View>

            {/* Y-axis label */}
            <Text style={[styles.yAxisLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Weight (lbs)
            </Text>
          </View>

          {/* ── Page 1: Stats ── */}
          <View style={{ width: cardWidth, paddingTop: 4 }}>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <PremiumStatCard
                title="PROGRESS"
                value={card1Value}
                subtitle={card1Subtitle}
                accent={card1Accent}
                isDark={isDark}
                explanation="The total weight you have lost (or gained) since your starting weight. A downward arrow means you are losing weight; an upward arrow means you have gained since the start."
              />
              <PremiumStatCard
                title="MOMENTUM"
                value={card2Value}
                subtitle={card2Subtitle}
                accent={isDark ? '#FFFFFF' : '#111111'}
                isDark={isDark}
                explanation="Your current rate of weight change based on the last 14 days of logged check-ins, expressed in pounds per week. The subtitle shows how closely your calorie intake has matched your daily goal."
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <PremiumStatCard
                title="TIMELINE"
                value={card3Value}
                subtitle={card3Subtitle}
                accent={card3Accent}
                isDark={isDark}
                explanation="How many days ahead of or behind your original plan you are, calculated from your cumulative calorie surplus or deficit. Being ahead means your eating habits are putting you on track to reach your goal sooner."
              />
              <PremiumStatCard
                title="TARGET"
                value={card4Value}
                subtitle={card4Subtitle}
                accent={isDark ? '#FFFFFF' : '#111111'}
                isDark={isDark}
                explanation="Your starting weight versus your current weight, and the projected date you will reach your goal weight based on your recent calorie tracking and pace."
              />
            </View>
          </View>
        </ScrollView>
      )}

      {/* ── Dot indicators ── */}
      <View style={styles.dotsRow}>
        <Animated.View
          style={[
            styles.dot,
            {
              width: dot0Anim,
              backgroundColor: activePage === 0 ? colors.primary : (isDark ? '#444' : '#ddd'),
            },
          ]}
        />
        <Animated.View
          style={[
            styles.dot,
            {
              width: dot1Anim,
              backgroundColor: activePage === 1 ? colors.primary : (isDark ? '#444' : '#ddd'),
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  cardTitle: {
    ...typography.h3,
  },
  cardSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  // ── Legend ──
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  // ── Chart ──
  chartContainer: {
    marginBottom: spacing.sm,
    overflow: 'visible',
    alignItems: 'center',
  },
  yAxisLabel: {
    ...typography.caption,
    textAlign: 'center',
    fontSize: 11,
    marginTop: spacing.xs,
  },
  // ── Dots ──
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.md,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  // ── Loading / error ──
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
  },
});
