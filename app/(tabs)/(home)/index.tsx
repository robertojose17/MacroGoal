
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Platform,
  RefreshControl, Alert, ActivityIndicator, Modal, ScrollView,
  TextInput, Animated, Dimensions, KeyboardAvoidingView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyReferralCode } from '@/utils/referralApi';
import { useStreakRescue } from '@/hooks/useStreakRescue';
import StreakRescueModal from '@/components/StreakRescueModal';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import ProgressCircle from '@/components/ProgressCircle';
import { IconSymbol } from '@/components/IconSymbol';
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow';
import { supabase } from '@/lib/supabase/client';
import {
  listMealPlans,
  deleteMealPlan,
  getMealPlan,
  getMonthAssignments,
  getRangeAssignments,
  assignPlanToDay,
  removePlanFromDay,
  type MealPlan as ApiMealPlan,
  type DayAssignment,
} from '@/utils/mealPlansApi';
import { listTemplatePlans, type TemplatePlan } from '@/utils/templatePlansApi';
import { formatServing } from '@/utils/servingFormat';
import { toLocalDateString } from '@/utils/dateUtils';
import { calcMacros } from '@/utils/macros';

// ─── Constants ───────────────────────────────────────────────────────────────

const PLAN_COLORS = ['#14B8A6', '#8B5CF6', '#F59E0B', '#EF4444', '#3B82F6', '#10B981'];
const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── Types ────────────────────────────────────────────────────────────────────

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface FoodItem {
  id: string;
  quantity: number;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  serving_description: string | null;
  grams: number | null;
  food_item_id?: string | null;
  food_name?: string | null;
  food_brand?: string | null;
  name?: string;
  brand?: string;
  food_items?: {
    id: string;
    name: string;
    brand: string | null;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    serving_size: number;
    macros_per: string | null;
  } | null;
}

interface MealData {
  type: MealType;
  label: string;
  items: FoodItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
}

interface AvgMacros {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  assignedDays: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getServingDisplayText = (item: FoodItem): string => {
  // 1. Best: use the saved serving description (e.g. "2 eggs", "1 slice")
  if (item.serving_description) return item.serving_description;
  // 2. Use grams if available (e.g. "63 g")
  if (item.grams && item.grams > 0) return formatServing(item.grams, 'g');
  // 3. Fallback: quantity
  const quantity = item.quantity || 1;
  return formatServing(quantity * 100, 'g');
};

const formatDateRange = (start: string, end: string): string => {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}`;
};

const formatShortDate = (date: Date): string =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const getMonday = (d: Date): Date => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
};

const getSunday = (d: Date): Date => {
  const monday = getMonday(d);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
};

const formatDayHeader = (dateStr: string): string => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
};

// ─── Calendar Component ───────────────────────────────────────────────────────

interface CalendarProps {
  year: number;
  month: number; // 0-indexed
  assignments: DayAssignment[];
  plans: ApiMealPlan[];
  isDark: boolean;
  onDayPress: (dateStr: string) => void;
}

function WeekPlannerCalendar({ year, month, assignments, plans, isDark, onDayPress }: CalendarProps) {
  const [containerWidth, setContainerWidth] = React.useState(0);

  const textColor = isDark ? colors.textDark : colors.text;
  const secondaryColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const cardBg = isDark ? colors.cardDark : colors.card;

  const today = new Date();
  const todayStr = toLocalDateString(today);

  const assignmentMap: Record<string, DayAssignment> = {};
  for (const a of (assignments ?? [])) {
    assignmentMap[a.date] = a;
  }

  const planColorMap: Record<string, string> = {};
  (plans ?? []).forEach((p, i) => {
    planColorMap[p.id] = PLAN_COLORS[i % PLAN_COLORS.length];
  });

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const totalDays = lastDay.getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const cellSize = containerWidth > 0 ? Math.floor(containerWidth / 7) : 0;

  return (
    <View
      style={[calStyles.calendarCard, { backgroundColor: cardBg }]}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {containerWidth === 0 ? (
        <View style={{ height: 200 }} />
      ) : (
        <>
          <View style={calStyles.dowRow}>
            {WEEK_DAYS.map(d => (
              <View key={d} style={[calStyles.dowCell, { width: cellSize }]}>
                <Text style={[calStyles.dowText, { color: secondaryColor }]}>{d}</Text>
              </View>
            ))}
          </View>

          {Array.from({ length: cells.length / 7 }, (_, rowIdx) => (
            <View key={rowIdx} style={calStyles.weekRow}>
              {cells.slice(rowIdx * 7, rowIdx * 7 + 7).map((day, colIdx) => {
                if (day === null) {
                  return <View key={colIdx} style={[calStyles.dayCell, { width: cellSize }]} />;
                }
                const monthStr = String(month + 1).padStart(2, '0');
                const dayStr = String(day).padStart(2, '0');
                const dateStr = `${year}-${monthStr}-${dayStr}`;
                const isToday = dateStr === todayStr;
                const assignment = assignmentMap[dateStr];
                const dotColor = assignment ? (planColorMap[assignment.meal_plan_id] || colors.primary) : null;
                const planLabel = assignment?.plan_name ? assignment.plan_name.slice(0, 8) : null;

                return (
                  <TouchableOpacity
                    key={colIdx}
                    style={[calStyles.dayCell, { width: cellSize }]}
                    onPress={() => {
                      console.log('[Calendar] Day pressed:', dateStr);
                      onDayPress(dateStr);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[
                      calStyles.dayNumber,
                      isToday && { backgroundColor: colors.primary },
                    ]}>
                      <Text style={[calStyles.dayText, { color: isToday ? '#fff' : textColor }]}>
                        {day}
                      </Text>
                    </View>
                    {dotColor && (
                      <View style={[calStyles.planDot, { backgroundColor: dotColor }]} />
                    )}
                    {planLabel && (
                      <Text style={[calStyles.planLabel, { color: dotColor || secondaryColor }]} numberOfLines={1}>
                        {planLabel}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const calStyles = StyleSheet.create({
  calendarCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    marginBottom: spacing.md,
    elevation: 2,
  },
  dowRow: { flexDirection: 'row', marginBottom: 4 },
  dowCell: { alignItems: 'center', paddingVertical: 4 },
  dowText: { fontSize: 11, fontWeight: '600' },
  weekRow: { flexDirection: 'row' },
  dayCell: { alignItems: 'center', paddingVertical: 4, minHeight: 52 },
  dayNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { fontSize: 13, fontWeight: '500' },
  planDot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  planLabel: { fontSize: 9, fontWeight: '600', marginTop: 1, textAlign: 'center' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { tab } = useLocalSearchParams<{ tab?: string }>();

  const [activeTab, setActiveTab] = useState<'tracking' | 'planning'>('tracking');

  // ── Streak Rescue ──
  const {
    canRescue,
    lostStreakValue,
    priceLabel,
    purchasing,
    executePurchase,
    dismissRescue,
    refresh: refreshRescue,
  } = useStreakRescue();

  // ── Tracking state ──
  const [goal, setGoal] = useState<any>(null);
  const [meals, setMeals] = useState<MealData[]>([
    { type: 'breakfast', label: 'Breakfast', items: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0 },
    { type: 'lunch', label: 'Lunch', items: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0 },
    { type: 'dinner', label: 'Dinner', items: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0 },
    { type: 'snack', label: 'Snacks', items: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0 },
  ]);
  const [totalCalories, setTotalCalories] = useState(0);
  const [totalMacros, setTotalMacros] = useState({ protein: 0, carbs: 0, fats: 0, fiber: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [error, setError] = useState<string | null>(null);

  // ── Planning state ──
  const [plans, setPlans] = useState<ApiMealPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [templatePlans, setTemplatePlans] = useState<TemplatePlan[]>([]);

  // Calendar
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [monthAssignments, setMonthAssignments] = useState<DayAssignment[]>([]);
  const [monthLoading, setMonthLoading] = useState(false);

  // Day assignment bottom sheet
  const [daySheetVisible, setDaySheetVisible] = useState(false);
  const [selectedDayStr, setSelectedDayStr] = useState<string>('');
  const [dayAssigning, setDayAssigning] = useState(false);

  // Date range
  const [rangeStart, setRangeStart] = useState<Date>(getMonday(today));
  const [rangeEnd, setRangeEnd] = useState<Date>(getSunday(today));
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [iosStartTemp, setIosStartTemp] = useState<Date>(getMonday(today));
  const [iosEndTemp, setIosEndTemp] = useState<Date>(getSunday(today));

  // Avg macros
  const [avgMacros, setAvgMacros] = useState<AvgMacros | null>(null);
  const [avgLoading, setAvgLoading] = useState(false);
  const [rangeAssignments, setRangeAssignments] = useState<DayAssignment[]>([]);

  // ── Referral code modal ──
  const REFERRAL_PROMPT_KEY = 'referral_prompt_shown_v1';
  const [referralModalVisible, setReferralModalVisible] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [referralApplying, setReferralApplying] = useState(false);
  const referralSlideAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;

  useEffect(() => {
    const checkReferralPrompt = async () => {
      try {
        // Fast local check first — if already shown locally, skip
        const shownLocally = await AsyncStorage.getItem(REFERRAL_PROMPT_KEY);
        if (shownLocally) return;

        // Check Supabase — source of truth (survives sign out/sign in)
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('users')
          .select('referral_prompt_shown')
          .eq('id', user.id)
          .maybeSingle();

        if (profile?.referral_prompt_shown) {
          // Already shown on another device/session — save locally and skip
          await AsyncStorage.setItem(REFERRAL_PROMPT_KEY, 'true');
          return;
        }

        // First time ever — show the modal
        console.log('[Home] First launch — showing referral code prompt');
        setReferralModalVisible(true);
        Animated.spring(referralSlideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }).start();
      } catch (e) {
        console.warn('[Home] Failed to check referral prompt:', e);
      }
    };
    checkReferralPrompt();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissReferralModal = async () => {
    console.log('[Home] Referral modal dismissed');
    Animated.timing(referralSlideAnim, {
      toValue: Dimensions.get('window').height,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setReferralModalVisible(false));
    try {
      // Save locally
      await AsyncStorage.setItem(REFERRAL_PROMPT_KEY, 'true');
      // Save to Supabase — survives sign out/sign in
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('users')
          .update({ referral_prompt_shown: true })
          .eq('id', user.id);
      }
    } catch (e) {
      console.warn('[Home] Failed to save referral prompt flag:', e);
    }
  };

  const handleApplyReferralCode = async () => {
    if (!referralCode.trim()) return;
    console.log('[Home] Apply referral code pressed:', referralCode.trim());
    setReferralApplying(true);
    try {
      const result = await applyReferralCode(referralCode.trim());
      if (result.success) {
        console.log('[Home] Referral code applied successfully');
        Alert.alert('🎉 Code Applied!', 'You and your friend both earned 1,000 XP!');
      } else {
        console.warn('[Home] Referral code failed:', result.error);
        Alert.alert('Invalid Code', result.error || 'Could not apply this code.');
      }
    } catch (e) {
      console.error('[Home] Unexpected error applying referral code:', e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setReferralApplying(false);
      await dismissReferralModal();
    }
  };

  // ── Load tracking data ──
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error('[Home] Error getting user:', userError);
        setError('Failed to authenticate. Please try logging in again.');
        setLoading(false);
        return;
      }
      if (!user) {
        console.log('[Home] No user found');
        setError('No user session found. Please log in.');
        setLoading(false);
        return;
      }

      console.log('[Home] Loading data for user:', user.id);

      const { data: goalData, error: goalError } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (goalError) {
        console.error('[Home] Error loading goal:', goalError);
        setGoal({ daily_calories: 2000, protein_g: 150, carbs_g: 200, fats_g: 65, fiber_g: 30 });
      } else if (goalData) {
        console.log('[Home] Goal loaded:', goalData);
        setGoal(goalData);
      } else {
        console.log('[Home] No active goal found, using defaults');
        setGoal({ daily_calories: 2000, protein_g: 150, carbs_g: 200, fats_g: 65, fiber_g: 30 });
      }

      const dateString = toLocalDateString(selectedDate);
      console.log('[Home] Loading meals for date:', dateString);

      const { data: mealsData, error: mealsError } = await supabase
        .from('meals')
        .select(`
          id,
          meal_type,
          date,
          meal_items (
            id,
            food_id,
            food_item_id,
            quantity,
            calories,
            protein,
            carbs,
            fats,
            fiber,
            serving_description,
            grams,
            food_name,
            food_brand,
            food_items!meal_items_food_item_id_fkey (
              id,
              name,
              brand,
              calories,
              protein,
              carbs,
              fat,
              fiber,
              serving_size,
              macros_per
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('date', dateString);

      if (mealsError) {
        console.error('[Home] Error loading meals:', mealsError);
        setError('Failed to load meals. Please try refreshing.');
      } else {
        console.log('[Home] Meals loaded for', dateString, ':', mealsData?.length || 0, 'meals');

        const mealsByType: Record<MealType, FoodItem[]> = {
          breakfast: [], lunch: [], dinner: [], snack: [],
        };

        let totalCals = 0, totalP = 0, totalC = 0, totalF = 0, totalFib = 0;

        if (mealsData && mealsData.length > 0) {
          mealsData.forEach((meal: any) => {
            if (meal.meal_items) {
              meal.meal_items.forEach((item: any) => {
                const hasStoredMacros = item.calories != null && item.calories > 0;
                const fi = item.food_items;
                const grams = item.grams ?? 0;
                const macros = hasStoredMacros
                  ? { calories: item.calories ?? 0, protein: item.protein ?? 0, carbs: item.carbs ?? 0, fats: item.fats ?? 0, fiber: item.fiber ?? 0 }
                  : fi
                    ? (() => { const r = calcMacros(fi, grams); return { calories: r.calories, protein: r.protein, carbs: r.carbs, fats: r.fat, fiber: r.fiber }; })()
                    : { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 };
                console.log('[Home] macros for item', item.id, '(stored:', hasStoredMacros, '):', macros);
                const enriched = {
                  ...item,
                  ...macros,
                  name: item.food_name ?? item.food_items?.name ?? 'Unknown Food',
                  brand: item.food_brand ?? item.food_items?.brand ?? undefined,
                };
                mealsByType[meal.meal_type as MealType].push(enriched);
                totalCals += macros.calories;
                totalP    += macros.protein;
                totalC    += macros.carbs;
                totalF    += macros.fats;
                totalFib  += macros.fiber;
              });
            }
          });
        }

        const buildMeal = (type: MealType, label: string): MealData => {
          const items = [...mealsByType[type]];
          return {
            type, label, items,
            totalCalories: items.reduce((sum, item) => sum + (item.calories || 0), 0),
            totalProtein: items.reduce((sum, item) => sum + (item.protein || 0), 0),
            totalCarbs: items.reduce((sum, item) => sum + (item.carbs || 0), 0),
            totalFats: items.reduce((sum, item) => sum + (item.fats || 0), 0),
          };
        };

        setMeals([
          buildMeal('breakfast', 'Breakfast'),
          buildMeal('lunch', 'Lunch'),
          buildMeal('dinner', 'Dinner'),
          buildMeal('snack', 'Snacks'),
        ]);
        setTotalCalories(totalCals);
        setTotalMacros({ protein: totalP, carbs: totalC, fats: totalF, fiber: totalFib });
      }
    } catch (err: any) {
      console.error('[Home] Error in loadData:', err);
      setError(err?.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  // ── Load plans ──
  const loadPlans = useCallback(async () => {
    console.log('[Home] Loading meal plans and template plans');
    setPlansLoading(true);
    setPlansError(null);
    try {
      const [plansData, templatesData] = await Promise.all([
        listMealPlans().catch((err: any) => {
          const msg: string = err?.message || '';
          if (msg.includes('does not exist') || msg.includes('relation')) {
            console.log('[Home] meal_plans table not yet created — showing empty state');
            return { plans: [] };
          }
          throw err;
        }),
        listTemplatePlans().catch((err: any) => {
          const msg: string = err?.message || '';
          if (msg.includes('does not exist') || msg.includes('relation')) {
            console.log('[Home] template_meal_plans table not yet created — showing empty state');
            return [];
          }
          console.warn('[Home] Error loading template plans:', err);
          return [];
        }),
      ]);
      console.log('[Home] Meal plans loaded:', plansData.plans?.length || 0);
      console.log('[Home] Template plans loaded:', Array.isArray(templatesData) ? templatesData.length : 0);
      setPlans(plansData.plans || []);
      setTemplatePlans(Array.isArray(templatesData) ? templatesData : []);
    } catch (err: any) {
      console.error('[Home] Error loading meal plans:', err);
      setPlansError('Failed to load meal plans.');
    } finally {
      setPlansLoading(false);
    }
  }, []);

  // ── Load month assignments ──
  const loadMonthAssignments = useCallback(async (year: number, month: number) => {
    const yearMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
    console.log('[Home] Loading month assignments for:', yearMonth);
    setMonthLoading(true);
    try {
      const data = await getMonthAssignments(yearMonth);
      console.log('[Home] Month assignments loaded:', data.length);
      setMonthAssignments(data);
    } catch (err: any) {
      console.error('[Home] Error loading month assignments:', err);
      setMonthAssignments([]);
    } finally {
      setMonthLoading(false);
    }
  }, []);

  // ── Load range avg macros ──
  const loadRangeData = useCallback(async (start: Date, end: Date) => {
    const startStr = toLocalDateString(start);
    const endStr = toLocalDateString(end);
    console.log('[Home] Loading range assignments:', startStr, '->', endStr);
    setAvgLoading(true);
    try {
      const assignments = await getRangeAssignments(startStr, endStr);
      console.log('[Home] Range assignments:', assignments.length);
      setRangeAssignments(assignments);

      if (assignments.length === 0) {
        setAvgMacros({ calories: 0, protein: 0, carbs: 0, fats: 0, assignedDays: 0 });
        setAvgLoading(false);
        return;
      }

      // Unique plan IDs in range
      const uniquePlanIds = [...new Set(assignments.map(a => a.meal_plan_id))];
      console.log('[Home] Fetching details for', uniquePlanIds.length, 'unique plans');

      const planDetails = await Promise.all(uniquePlanIds.map(id => getMealPlan(id).catch(() => null)));
      const planMacroMap: Record<string, { calories: number; protein: number; carbs: number; fats: number }> = {};

      planDetails.forEach(detail => {
        if (!detail) return;
        const totals = detail.items.reduce(
          (acc, item) => ({
            calories: acc.calories + (item.calories || 0),
            protein: acc.protein + (item.protein || 0),
            carbs: acc.carbs + (item.carbs || 0),
            fats: acc.fats + (item.fats || 0),
          }),
          { calories: 0, protein: 0, carbs: 0, fats: 0 }
        );
        planMacroMap[detail.id] = totals;
      });

      // Sum macros across all assigned days
      let sumCal = 0, sumP = 0, sumC = 0, sumF = 0;
      for (const a of assignments) {
        const macros = planMacroMap[a.meal_plan_id];
        if (macros) {
          sumCal += macros.calories;
          sumP += macros.protein;
          sumC += macros.carbs;
          sumF += macros.fats;
        }
      }

      const count = assignments.length;
      setAvgMacros({
        calories: Math.round(sumCal / count),
        protein: Math.round(sumP / count),
        carbs: Math.round(sumC / count),
        fats: Math.round(sumF / count),
        assignedDays: count,
      });
    } catch (err: any) {
      console.error('[Home] Error loading range data:', err);
      setAvgMacros(null);
      setRangeAssignments([]);
    } finally {
      setAvgLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      console.log('[Home] Screen focused, loading data');
      // Auto-advance to today if the date has changed (e.g. app left open overnight)
      setSelectedDate(prev => {
        const today = new Date();
        const prevStr = toLocalDateString(prev);
        const todayStr = toLocalDateString(today);
        return prevStr === todayStr ? prev : today;
      });
      loadData();
      loadPlans();
    }, [loadData, loadPlans])
  );

  // Switch to planning tab when navigated with ?tab=planning
  useEffect(() => {
    if (tab === 'planning') {
      console.log('[Home] tab param detected, switching to planning tab');
      setActiveTab('planning');
    }
  }, [tab]);

  // Load month assignments when calendar month changes
  useEffect(() => {
    if (activeTab !== 'planning') return;
    loadMonthAssignments(calYear, calMonth).catch(() => setMonthAssignments([]));
  }, [calYear, calMonth, activeTab, loadMonthAssignments]);

  // Load range data when range changes
  useEffect(() => {
    if (activeTab !== 'planning') return;
    loadRangeData(rangeStart, rangeEnd).catch(() => { setAvgMacros(null); setRangeAssignments([]); });
  }, [rangeStart, rangeEnd, activeTab, loadRangeData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
    loadPlans();
    if (activeTab === 'planning') {
      loadMonthAssignments(calYear, calMonth);
      loadRangeData(rangeStart, rangeEnd);
    }
  };

  // ── Tracking handlers ──
  const handleAddFood = (mealType: MealType) => {
    console.log('[Home] Opening add food for meal:', mealType);
    const dateString = toLocalDateString(selectedDate);
    console.log('[Home] Passing date to add-food:', dateString);
    router.push(`/add-food?meal=${mealType}&date=${dateString}`);
  };

  const handleEditFood = (item: FoodItem, isSwiping: boolean) => {
    if (isSwiping) {
      console.log('[Home] Blocked edit - swipe gesture is active');
      return;
    }
    console.log('[Home] Opening edit food:', item.id);
    const dateString = toLocalDateString(selectedDate);
    router.push({ pathname: '/edit-food', params: { itemId: item.id, date: dateString } });
  };

  const handleDeleteFood = useCallback(async (itemId: string) => {
    console.log('[Home] Delete requested for item:', itemId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user found');

      let deletedCalories = 0, deletedProtein = 0, deletedCarbs = 0, deletedFats = 0, deletedFiber = 0;

      setMeals(prevMeals => {
        const newMeals = prevMeals.map(meal => {
          const itemToDelete = meal.items.find(i => i.id === itemId);
          if (itemToDelete) {
            deletedCalories = itemToDelete.calories || 0;
            deletedProtein = itemToDelete.protein || 0;
            deletedCarbs = itemToDelete.carbs || 0;
            deletedFats = itemToDelete.fats || 0;
            deletedFiber = itemToDelete.fiber || 0;
          }
          const filteredItems = meal.items.filter(i => i.id !== itemId);
          return {
            ...meal,
            items: filteredItems,
            totalCalories: filteredItems.reduce((sum, i) => sum + (i.calories || 0), 0),
            totalProtein: filteredItems.reduce((sum, i) => sum + (i.protein || 0), 0),
            totalCarbs: filteredItems.reduce((sum, i) => sum + (i.carbs || 0), 0),
            totalFats: filteredItems.reduce((sum, i) => sum + (i.fats || 0), 0),
          };
        });
        console.log('[Home] UI state updated - item removed from list');
        return newMeals;
      });

      setTotalCalories(prev => prev - deletedCalories);
      setTotalMacros(prev => ({
        protein: prev.protein - deletedProtein,
        carbs: prev.carbs - deletedCarbs,
        fats: prev.fats - deletedFats,
        fiber: prev.fiber - deletedFiber,
      }));

      const { error } = await supabase.from('meal_items').delete().eq('id', itemId);
      if (error) {
        console.error('[Home] Database delete error:', error);
        throw error;
      }
      console.log('[Home] Successfully deleted from database');
    } catch (err: any) {
      console.error('[Home] Error in handleDeleteFood:', err);
      Alert.alert('Delete Failed', err?.message || 'Failed to delete food entry. Please try again.', [{ text: 'OK' }]);
      loadData();
    }
  }, [loadData]);

  const goToPreviousDay = () => {
    console.log('[Home] Navigating to previous day');
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const goToNextDay = () => {
    console.log('[Home] Navigating to next day');
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
  };

  const goToToday = () => {
    console.log('[Home] Navigating to today');
    setSelectedDate(new Date());
  };

  const isToday = () => selectedDate.toDateString() === new Date().toDateString();

  const isTodayOrFuture = () => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const s = new Date(selectedDate);
    s.setHours(0, 0, 0, 0);
    return s >= t;
  };

  const handleTabPress = (tab: 'tracking' | 'planning') => {
    console.log('[Home] Segmented control pressed:', tab);
    setActiveTab(tab);
  };

  // ── Planning handlers ──
  const handlePlanPress = (plan: ApiMealPlan) => {
    console.log('[Home] Meal plan pressed:', plan.id, plan.name);
    router.push({ pathname: '/meal-plan-detail', params: { planId: plan.id } });
  };

  const handleCreatePlan = () => {
    console.log('[Home] Create new meal plan pressed');
    router.push('/meal-plan-create');
  };

  const handlePrevMonth = () => {
    console.log('[Home] Calendar: previous month');
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(y => y - 1);
    } else {
      setCalMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    console.log('[Home] Calendar: next month');
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(y => y + 1);
    } else {
      setCalMonth(m => m + 1);
    }
  };

  const handleDayPress = (dateStr: string) => {
    console.log('[Home] Day sheet opening for:', dateStr);
    setSelectedDayStr(dateStr);
    setDaySheetVisible(true);
  };

  const handleAssignPlan = async (planId: string) => {
    console.log('[Home] Assigning plan', planId, 'to day', selectedDayStr);
    setDayAssigning(true);
    try {
      await assignPlanToDay(selectedDayStr, planId);
      console.log('[Home] Plan assigned successfully');
      setDaySheetVisible(false);
      await loadMonthAssignments(calYear, calMonth);
      await loadRangeData(rangeStart, rangeEnd);
    } catch (err: any) {
      console.error('[Home] Error assigning plan:', err);
      Alert.alert('Error', err?.message || 'Failed to assign plan.');
    } finally {
      setDayAssigning(false);
    }
  };

  const handleRemoveAssignment = async () => {
    console.log('[Home] Removing assignment from day:', selectedDayStr);
    setDayAssigning(true);
    try {
      await removePlanFromDay(selectedDayStr);
      console.log('[Home] Assignment removed successfully');
      setDaySheetVisible(false);
      await loadMonthAssignments(calYear, calMonth);
      await loadRangeData(rangeStart, rangeEnd);
    } catch (err: any) {
      console.error('[Home] Error removing assignment:', err);
      Alert.alert('Error', err?.message || 'Failed to remove assignment.');
    } finally {
      setDayAssigning(false);
    }
  };

  const handleViewGroceryList = () => {
    const planIds = rangeAssignments.map(a => a.meal_plan_id).join(',');
    const rangeLabel = `${formatShortDate(rangeStart)} – ${formatShortDate(rangeEnd)}`;
    console.log('[Home] View grocery list pressed, planIds:', planIds, 'rangeLabel:', rangeLabel);
    router.push({ pathname: '/meal-plan-grocery', params: { planIds, rangeLabel } });
  };

  // ── Derived values ──
  const currentDayAssignment = monthAssignments.find(a => a.date === selectedDayStr);
  const planColorMap: Record<string, string> = {};
  plans.forEach((p, i) => { planColorMap[p.id] = PLAN_COLORS[i % PLAN_COLORS.length]; });

  const rangeStartLabel = formatShortDate(rangeStart);
  const rangeEndLabel = formatShortDate(rangeEnd);
  const rangeLabel = `${rangeStartLabel} – ${rangeEndLabel}`;
  const assignedDaysCount = rangeAssignments.length;
  const calMonthLabel = `${MONTH_NAMES[calMonth]} ${calYear}`;
  const daySheetTitle = selectedDayStr ? formatDayHeader(selectedDayStr) : '';
  const leftArrowDisabled = false;
  const rightArrowDisabled = isTodayOrFuture();
  const todayLabel = isToday() ? 'Today' : selectedDate.toLocaleDateString('en-US', { weekday: 'short' });
  const dateDisplay = selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // ── Render helpers ──

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.errorContainer}>
          <IconSymbol ios_icon_name="exclamationmark.triangle" android_material_icon_name="warning" size={48} color={colors.error} />
          <Text style={[styles.errorText, { color: isDark ? colors.textDark : colors.text }]}>{error}</Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={loadData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderFoodItem = ({ item }: { item: FoodItem }) => {
    const foodName = item.name ?? item.food_name ?? item.food_items?.name ?? 'Unknown Food';
    const foodBrand = item.brand ?? item.food_brand ?? item.food_items?.brand ?? undefined;
    return (
      <SwipeToDeleteRow onDelete={() => handleDeleteFood(item.id)}>
        {(isSwiping: boolean) => (
          <TouchableOpacity
            style={styles.foodItem}
            onPress={() => handleEditFood(item, isSwiping)}
            activeOpacity={0.7}
            disabled={isSwiping}
          >
            <View style={styles.foodInfo}>
              <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text }]}>
                {foodName}
              </Text>
              {foodBrand && (
                <Text style={[styles.foodBrand, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  {foodBrand}
                </Text>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 12, color: isDark ? colors.textSecondaryDark : colors.textSecondary }}>
                  per {getServingDisplayText(item)}
                </Text>
                <Text style={{ fontSize: 12, color: isDark ? colors.textSecondaryDark : colors.textSecondary }}>•</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.protein }}>P: {Math.round(item.protein)}g</Text>
                <Text style={{ fontSize: 12, color: isDark ? colors.textSecondaryDark : colors.textSecondary }}>•</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.carbs }}>C: {Math.round(item.carbs)}g</Text>
                <Text style={{ fontSize: 12, color: isDark ? colors.textSecondaryDark : colors.textSecondary }}>•</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.fats }}>F: {Math.round(item.fats)}g</Text>
              </View>
            </View>
            <View style={styles.foodCalories}>
              <Text style={[styles.foodCaloriesValue, { color: isDark ? colors.textDark : colors.text }]}>
                {Math.round(item.calories)}
              </Text>
              <Text style={[styles.foodCaloriesLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                kcal
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </SwipeToDeleteRow>
    );
  };

  const renderTrackingContent = () => (
    <View>
      <View style={[styles.caloriesCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
        <View style={styles.caloriesContent}>
          <ProgressCircle
            current={totalCalories}
            target={goal?.daily_calories || 2000}
            size={140}
            strokeWidth={12}
            color={colors.calories}
            label="kcal"
          />
          <View style={styles.macroSummaryCompact}>
            <MacroSummaryRowCompact label="Protein" eaten={Math.round(totalMacros.protein)} goal={goal?.protein_g || 150} color={colors.protein} isDark={isDark} />
            <MacroSummaryRowCompact label="Carbs" eaten={Math.round(totalMacros.carbs)} goal={goal?.carbs_g || 200} color={colors.carbs} isDark={isDark} />
            <MacroSummaryRowCompact label="Fats" eaten={Math.round(totalMacros.fats)} goal={goal?.fats_g || 65} color={colors.fats} isDark={isDark} />
            <MacroSummaryRowCompact label="Fiber" eaten={Math.round(totalMacros.fiber)} goal={goal?.fiber_g || 30} color={colors.fiber} isDark={isDark} />
          </View>
        </View>
      </View>

      {meals.map((meal) => (
        <View key={meal.type} style={[styles.mealCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <View style={styles.mealHeader}>
            <View style={styles.mealHeaderLeft}>
              <Text style={[styles.mealTitle, { color: isDark ? colors.textDark : colors.text }]}>{meal.label}</Text>
              <View style={styles.mealMacroRow}>
                <Text style={[styles.mealCalories, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  {Math.round(meal.totalCalories)} kcal
                </Text>
                {meal.totalCalories > 0 && (
                  <>
                    <Text style={[styles.mealMacroDot, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>{'  ·  '}</Text>
                    <Text style={[styles.mealMacroValue, { color: colors.protein }]}>{Math.round(meal.totalProtein)}P</Text>
                    <Text style={[styles.mealMacroDot, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>{'  '}</Text>
                    <Text style={[styles.mealMacroValue, { color: colors.carbs }]}>{Math.round(meal.totalCarbs)}C</Text>
                    <Text style={[styles.mealMacroDot, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>{'  '}</Text>
                    <Text style={[styles.mealMacroValue, { color: colors.fats }]}>{Math.round(meal.totalFats)}F</Text>
                  </>
                )}
              </View>
            </View>
            <TouchableOpacity style={styles.addMealButton} onPress={() => handleAddFood(meal.type)}>
              <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add" size={28} color={colors.info} />
            </TouchableOpacity>
          </View>

          {meal.items.length === 0 ? (
            <TouchableOpacity style={styles.emptyMeal} onPress={() => handleAddFood(meal.type)}>
              <Text style={[styles.emptyMealText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>Tap to add food</Text>
            </TouchableOpacity>
          ) : (
            <FlatList
              data={meal.items}
              renderItem={renderFoodItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
            />
          )}
        </View>
      ))}
    </View>
  );

  const renderPlanningContent = () => {
    if (plansLoading) {
      return (
        <View style={styles.plansLoadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (plansError) {
      return (
        <View style={styles.plansEmptyContainer}>
          <Text style={[styles.plansEmptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            {plansError}
          </Text>
          <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary, marginTop: spacing.md }]} onPress={loadPlans}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View>
        {/* ── Calendar header ── */}
        <View style={styles.calendarHeader}>
          <TouchableOpacity onPress={handlePrevMonth} style={styles.calNavBtn} activeOpacity={0.7}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={20} color={isDark ? colors.textDark : colors.text} />
          </TouchableOpacity>
          <Text style={[styles.calMonthLabel, { color: isDark ? colors.textDark : colors.text }]}>
            {calMonthLabel}
          </Text>
          <TouchableOpacity onPress={handleNextMonth} style={styles.calNavBtn} activeOpacity={0.7}>
            <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={20} color={isDark ? colors.textDark : colors.text} />
          </TouchableOpacity>
        </View>

        {/* ── Calendar grid ── */}
        {monthLoading ? (
          <View style={[styles.calLoadingBox, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (
          <WeekPlannerCalendar
            year={calYear}
            month={calMonth}
            assignments={monthAssignments}
            plans={plans}
            isDark={isDark}
            onDayPress={handleDayPress}
          />
        )}

        {/* ── Date range selector ── */}
        <View style={[styles.rangeCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <Text style={[styles.rangeSectionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            Date Range
          </Text>
          <View style={styles.rangeRow}>
            <TouchableOpacity
              style={[styles.rangeBtn, { borderColor: isDark ? colors.borderDark : colors.border }]}
              onPress={() => {
                console.log('[Home] Start date picker opened');
                setIosStartTemp(rangeStart);
                setShowStartPicker(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.rangeBtnLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>Start</Text>
              <Text style={[styles.rangeBtnDate, { color: isDark ? colors.textDark : colors.text }]}>{rangeStartLabel}</Text>
            </TouchableOpacity>

            <View style={[styles.rangeDivider, { backgroundColor: isDark ? colors.borderDark : colors.border }]} />

            <TouchableOpacity
              style={[styles.rangeBtn, { borderColor: isDark ? colors.borderDark : colors.border }]}
              onPress={() => {
                console.log('[Home] End date picker opened');
                setIosEndTemp(rangeEnd);
                setShowEndPicker(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.rangeBtnLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>End</Text>
              <Text style={[styles.rangeBtnDate, { color: isDark ? colors.textDark : colors.text }]}>{rangeEndLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* iOS date pickers in modals */}
        {Platform.OS === 'ios' && showStartPicker && (
          <Modal transparent animationType="slide" visible={showStartPicker}>
            <View style={styles.pickerModalOverlay}>
              <View style={[styles.pickerModalContent, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
                <View style={styles.pickerModalHeader}>
                  <Text style={[styles.pickerModalTitle, { color: isDark ? colors.textDark : colors.text }]}>Start Date</Text>
                  <TouchableOpacity onPress={() => {
                    console.log('[Home] Start date confirmed:', iosStartTemp);
                    setRangeStart(iosStartTemp);
                    setShowStartPicker(false);
                  }}>
                    <Text style={[styles.pickerDoneText, { color: colors.primary }]}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={iosStartTemp}
                  mode="date"
                  display="spinner"
                  onChange={(_e, date) => { if (date) setIosStartTemp(date); }}
                  textColor={isDark ? '#fff' : '#000'}
                />
              </View>
            </View>
          </Modal>
        )}
        {Platform.OS === 'ios' && showEndPicker && (
          <Modal transparent animationType="slide" visible={showEndPicker}>
            <View style={styles.pickerModalOverlay}>
              <View style={[styles.pickerModalContent, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
                <View style={styles.pickerModalHeader}>
                  <Text style={[styles.pickerModalTitle, { color: isDark ? colors.textDark : colors.text }]}>End Date</Text>
                  <TouchableOpacity onPress={() => {
                    console.log('[Home] End date confirmed:', iosEndTemp);
                    setRangeEnd(iosEndTemp);
                    setShowEndPicker(false);
                  }}>
                    <Text style={[styles.pickerDoneText, { color: colors.primary }]}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={iosEndTemp}
                  mode="date"
                  display="spinner"
                  onChange={(_e, date) => { if (date) setIosEndTemp(date); }}
                  textColor={isDark ? '#fff' : '#000'}
                />
              </View>
            </View>
          </Modal>
        )}

        {/* Android inline pickers */}
        {Platform.OS === 'android' && showStartPicker && (
          <DateTimePicker
            value={rangeStart}
            mode="date"
            display="default"
            onChange={(_e, date) => {
              setShowStartPicker(false);
              if (date) {
                console.log('[Home] Android start date selected:', date);
                setRangeStart(date);
              }
            }}
          />
        )}
        {Platform.OS === 'android' && showEndPicker && (
          <DateTimePicker
            value={rangeEnd}
            mode="date"
            display="default"
            onChange={(_e, date) => {
              setShowEndPicker(false);
              if (date) {
                console.log('[Home] Android end date selected:', date);
                setRangeEnd(date);
              }
            }}
          />
        )}

        {/* ── Goals vs Plan comparison ── */}
        <View style={[styles.weekAvgCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          {/* Goal row */}
          <View style={styles.weekAvgRow}>
            <Text numberOfLines={1} style={[styles.weekAvgLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Goal
            </Text>
            <View style={styles.weekAvgPills}>
              <WeekAvgPill value={goal?.daily_calories || 2000} unit="kcal" color={colors.calories} isDark={isDark} />
              <WeekAvgPill value={goal?.protein_g || 150} unit="P" color={colors.protein} isDark={isDark} />
              <WeekAvgPill value={goal?.carbs_g || 200} unit="C" color={colors.carbs} isDark={isDark} />
              <WeekAvgPill value={goal?.fats_g || 65} unit="F" color={colors.fats} isDark={isDark} />
            </View>
          </View>

          {/* Thin divider */}
          <View style={[styles.weekAvgDivider, { backgroundColor: isDark ? colors.borderDark : colors.border }]} />

          {/* Wk Avg row */}
          <View style={styles.weekAvgRow}>
            <Text numberOfLines={1} style={[styles.weekAvgLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Wk Avg
            </Text>
            {avgLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : avgMacros && avgMacros.assignedDays > 0 ? (
              <View style={styles.weekAvgPills}>
                <WeekAvgPill value={avgMacros.calories} unit="kcal" color={colors.calories} isDark={isDark} />
                <WeekAvgPill value={avgMacros.protein} unit="P" color={colors.protein} isDark={isDark} />
                <WeekAvgPill value={avgMacros.carbs} unit="C" color={colors.carbs} isDark={isDark} />
                <WeekAvgPill value={avgMacros.fats} unit="F" color={colors.fats} isDark={isDark} />
              </View>
            ) : (
              <Text style={[styles.weekAvgEmpty, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                No plans assigned
              </Text>
            )}
          </View>
        </View>

        {/* ── View Grocery List button ── */}
        {assignedDaysCount > 0 && (
          <TouchableOpacity
            style={[styles.groceryBtn, { backgroundColor: colors.primary }]}
            onPress={handleViewGroceryList}
            activeOpacity={0.8}
          >
            <IconSymbol ios_icon_name="cart.fill" android_material_icon_name="shopping-cart" size={18} color="#fff" />
            <Text style={styles.groceryBtnText}>
              View Grocery List ({assignedDaysCount} day{assignedDaysCount !== 1 ? 's' : ''})
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Divider ── */}
        <View style={[styles.sectionDivider, { backgroundColor: isDark ? colors.borderDark : colors.border }]} />

        {/* ── AI card ── */}
        <View style={[styles.aiCard, { backgroundColor: isDark ? '#1E1535' : '#F0EEFF' }]}>
          <View style={styles.aiCardHeader}>
            <View style={[styles.aiIconCircle, { backgroundColor: isDark ? '#2D1F5E' : '#DDD6FE' }]}>
              <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto-awesome" size={22} color="#7C3AED" />
            </View>
            <View style={styles.aiCardText}>
              <Text style={[styles.aiCardTitle, { color: isDark ? '#E9D5FF' : '#4C1D95' }]}>
                Generate with AI
              </Text>
              <Text style={[styles.aiCardSubtitle, { color: isDark ? '#A78BFA' : '#7C3AED' }]}>
                Tell us your preferences and we'll build your meal plan automatically
              </Text>
            </View>
          </View>
          <View style={[styles.aiComingSoonBadge, { backgroundColor: isDark ? '#2D1F5E' : '#DDD6FE' }]}>
            <Text style={[styles.aiComingSoonText, { color: isDark ? '#C4B5FD' : '#5B21B6' }]}>
              Coming Soon
            </Text>
          </View>
        </View>

        {/* ── Available Plans (templates) ── */}
        {templatePlans.length > 0 && (
          <View>
            <View style={styles.templateSectionHeader}>
              <Text style={styles.templateSectionTitle}>{'✦ AVAILABLE PLANS'}</Text>
            </View>
            {templatePlans.map((tplan) => {
              return (
                <TouchableOpacity
                  key={tplan.id}
                  style={[styles.templateCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
                  onPress={() => {
                    console.log('[Home] Template plan pressed:', tplan.id, tplan.name);
                    router.push({ pathname: '/template-plan-detail', params: { templateId: tplan.id } });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.templateCardContent}>
                    <View style={styles.templateEmojiCircle}>
                      <Text style={styles.templateEmoji}>{tplan.emoji}</Text>
                    </View>
                    <View style={styles.templateCardLeft}>
                      <Text style={[styles.templateName, { color: isDark ? colors.textDark : colors.text }]}>
                        {tplan.name}
                      </Text>
                    </View>
                    <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={18} color={isDark ? colors.textSecondaryDark : colors.textSecondary} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Plan list ── */}
        {plans.length === 0 ? (
          <View style={[styles.plansEmptyCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <IconSymbol ios_icon_name="calendar" android_material_icon_name="calendar-today" size={40} color={isDark ? colors.textSecondaryDark : colors.textSecondary} />
            <Text style={[styles.plansEmptyTitle, { color: isDark ? colors.textDark : colors.text }]}>
              No meal plans yet
            </Text>
            <Text style={[styles.plansEmptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Create your first plan to get started.
            </Text>
          </View>
        ) : (
          plans.map((plan, idx) => {
            const dateRange = formatDateRange(plan.start_date, plan.end_date);
            const dotColor = PLAN_COLORS[idx % PLAN_COLORS.length];
            return (
              <TouchableOpacity
                key={plan.id}
                style={[styles.planCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
                onPress={() => handlePlanPress(plan)}
                onLongPress={() => {
                  console.log('[Home] Plan long-pressed for delete:', plan.id, plan.name);
                  Alert.alert(
                    'Delete Plan',
                    `Delete "${plan.name}"?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                          console.log('[Home] Confirming delete for plan:', plan.id);
                          try {
                            await deleteMealPlan(plan.id);
                            console.log('[Home] Plan deleted:', plan.id);
                            setPlans(prev => prev.filter(p => p.id !== plan.id));
                          } catch (err: any) {
                            console.error('[Home] Error deleting plan:', err);
                            Alert.alert('Error', 'Failed to delete meal plan. Please try again.');
                          }
                        },
                      },
                    ]
                  );
                }}
                activeOpacity={0.7}
              >
                <View style={styles.planCardContent}>
                  <View style={[styles.planColorDot, { backgroundColor: dotColor }]} />
                  <View style={styles.planCardLeft}>
                    <Text style={[styles.planName, { color: isDark ? colors.textDark : colors.text }]}>
                      {plan.name}
                    </Text>
                    <Text style={[styles.planDateRange, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      {dateRange}
                    </Text>
                  </View>
                  <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={18} color={isDark ? colors.textSecondaryDark : colors.textSecondary} />
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <TouchableOpacity
          style={[styles.createPlanButton, { backgroundColor: colors.primary }]}
          onPress={handleCreatePlan}
          activeOpacity={0.8}
        >
          <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={20} color="#fff" />
          <Text style={styles.createPlanButtonText}>Create New Plan</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
      {/* Top header: pill control in Tracking mode, underline tabs in Planning mode */}
      {activeTab === 'tracking' ? (
        <View style={[styles.segmentedControlWrapper, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
          <View style={[styles.segmentedControl, { backgroundColor: isDark ? colors.cardDark : '#E8EAF0' }]}>
            <TouchableOpacity
              style={[styles.segmentButton, activeTab === 'tracking' && { backgroundColor: colors.primary }]}
              onPress={() => handleTabPress('tracking')}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentButtonText, { color: activeTab === 'tracking' ? '#fff' : (isDark ? colors.textSecondaryDark : colors.textSecondary) }]}>
                Tracking
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentButton, activeTab === 'planning' && { backgroundColor: colors.primary }]}
              onPress={() => handleTabPress('planning')}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentButtonText, { color: activeTab === 'planning' ? '#fff' : (isDark ? colors.textSecondaryDark : colors.textSecondary) }]}>
                Planning
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={[styles.planningHeaderRow, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderBottomColor: isDark ? colors.borderDark : colors.border }]}>
          <TouchableOpacity
            style={styles.planningBackButton}
            onPress={() => {
              console.log('[Home] Planning back button pressed — returning to Tracking');
              handleTabPress('tracking');
            }}
            activeOpacity={0.7}
          >
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={16} color={colors.primary} />
            <Text style={[styles.planningBackText, { color: colors.primary }]}>Tracking</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Date navigation — only visible in Tracking mode */}
      {activeTab === 'tracking' && (
        <View style={[styles.stickyHeader, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderBottomColor: isDark ? colors.borderDark : colors.border }]}>
          <TouchableOpacity
            onPress={goToPreviousDay}
            style={styles.dateButton}
            disabled={leftArrowDisabled}
            activeOpacity={leftArrowDisabled ? 1 : 0.7}
          >
            <IconSymbol
              ios_icon_name="arrow.left"
              android_material_icon_name="arrow-back"
              size={22}
              color={isDark ? colors.textDark : colors.text}
              style={{ opacity: leftArrowDisabled ? 0.4 : 1 }}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.dateCenter} onPress={goToToday} activeOpacity={0.7}>
            <Text style={[styles.dateLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {todayLabel}
            </Text>
            <Text style={[styles.dateText, { color: isDark ? colors.textDark : colors.text }]}>
              {dateDisplay}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={goToNextDay}
            style={styles.dateButton}
            disabled={rightArrowDisabled}
            activeOpacity={rightArrowDisabled ? 1 : 0.7}
          >
            <IconSymbol
              ios_icon_name="arrow.right"
              android_material_icon_name="arrow-forward"
              size={22}
              color={isDark ? colors.textDark : colors.text}
              style={{ opacity: rightArrowDisabled ? 0.4 : 1 }}
            />
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={[{ key: 'content' }]}
        renderItem={() => (
          <View>
            {activeTab === 'tracking' ? renderTrackingContent() : renderPlanningContent()}
            <View style={styles.bottomSpacer} />
          </View>
        )}
        keyExtractor={(item) => item.key}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.scrollContent}
      />

      {/* Streak Rescue Modal */}
      <StreakRescueModal
        visible={canRescue}
        lostStreakValue={lostStreakValue}
        priceLabel={priceLabel}
        purchasing={purchasing}
        onPurchase={async () => {
          console.log('[Home] Streak rescue purchase initiated');
          const result = await executePurchase();
          if (result.success) {
            console.log('[Home] Streak rescue purchase succeeded, streak restored to:', lostStreakValue);
            Alert.alert('¡Racha restaurada!', `¡Tu racha de ${lostStreakValue} días fue restaurada!`);
            await refreshRescue();
          } else if (result.error) {
            console.warn('[Home] Streak rescue purchase failed:', result.error);
            Alert.alert('Error', result.error);
          }
        }}
        onDismiss={() => {
          console.log('[Home] Streak rescue dismissed');
          dismissRescue();
        }}
      />

      {/* ── Day assignment bottom sheet Modal (root level to avoid ScrollView nesting) ── */}
      <Modal
        visible={daySheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDaySheetVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => {
            console.log('[Home] Day sheet dismissed via overlay');
            setDaySheetVisible(false);
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.sheetContent, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
            onPress={() => {}}
          >
            <View style={[styles.sheetHandle, { backgroundColor: isDark ? colors.borderDark : colors.border }]} />
            <Text style={[styles.sheetTitle, { color: isDark ? colors.textDark : colors.text }]}>
              {daySheetTitle}
            </Text>

            {currentDayAssignment && (
              <View style={[styles.sheetCurrentBadge, { backgroundColor: isDark ? '#1A2A2A' : '#E6FAF8' }]}>
                <View style={[styles.sheetCurrentDot, { backgroundColor: planColorMap[currentDayAssignment.meal_plan_id] || colors.primary }]} />
                <Text style={[styles.sheetCurrentText, { color: isDark ? colors.textDark : colors.text }]}>
                  Currently: {currentDayAssignment.plan_name || 'Assigned'}
                </Text>
              </View>
            )}

            <Text style={[styles.sheetSectionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Assign a plan
            </Text>

            <ScrollView style={styles.sheetPlanList} showsVerticalScrollIndicator={false}>
              {plans.length === 0 ? (
                <Text style={[styles.sheetEmptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  No plans available. Create one first.
                </Text>
              ) : (
                plans.map((plan, idx) => {
                  const dotColor = PLAN_COLORS[idx % PLAN_COLORS.length];
                  const isActive = currentDayAssignment?.meal_plan_id === plan.id;
                  return (
                    <TouchableOpacity
                      key={plan.id}
                      style={[
                        styles.sheetPlanRow,
                        { borderBottomColor: isDark ? colors.borderDark : colors.border },
                        isActive && { backgroundColor: isDark ? '#1A2A2A' : '#E6FAF8' },
                      ]}
                      onPress={() => {
                        console.log('[Home] Plan row pressed in sheet:', plan.id, plan.name);
                        handleAssignPlan(plan.id);
                      }}
                      activeOpacity={0.7}
                      disabled={dayAssigning}
                    >
                      <View style={[styles.sheetPlanDot, { backgroundColor: dotColor }]} />
                      <Text style={[styles.sheetPlanName, { color: isDark ? colors.textDark : colors.text }]}>
                        {plan.name}
                      </Text>
                      {isActive && (
                        <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {currentDayAssignment && (
              <TouchableOpacity
                style={[styles.sheetRemoveBtn, { borderColor: colors.error }]}
                onPress={() => {
                  console.log('[Home] Remove assignment pressed for day:', selectedDayStr);
                  handleRemoveAssignment();
                }}
                activeOpacity={0.7}
                disabled={dayAssigning}
              >
                <Text style={[styles.sheetRemoveText, { color: colors.error }]}>Remove assignment</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.sheetCancelBtn, { backgroundColor: isDark ? colors.backgroundDark : '#F3F4F6' }]}
              onPress={() => {
                console.log('[Home] Day sheet cancel pressed');
                setDaySheetVisible(false);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.sheetCancelText, { color: isDark ? colors.textDark : colors.text }]}>Cancel</Text>
            </TouchableOpacity>

            {dayAssigning && (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: spacing.sm }} />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* First-launch referral code modal */}
      {referralModalVisible && (
        <Modal transparent animationType="none" visible={referralModalVisible} onRequestClose={dismissReferralModal}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <TouchableOpacity
              style={referralStyles.overlay}
              activeOpacity={1}
              onPress={dismissReferralModal}
            >
              <Animated.View
                style={[
                  referralStyles.sheet,
                  { backgroundColor: isDark ? colors.cardDark : '#FFFFFF', transform: [{ translateY: referralSlideAnim }] },
                ]}
              >
                <TouchableOpacity activeOpacity={1} onPress={() => {}}>
                  <View style={referralStyles.handle} />
                  <Text style={[referralStyles.title, { color: isDark ? colors.textDark : colors.primaryText }]}>
                    {'🎁 Have a Referral Code?'}
                  </Text>
                  <Text style={[referralStyles.subtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    Were you invited to Macro Goal? Enter their code and you both earn 1,000 XP!
                  </Text>
                  <TextInput
                    style={[
                      referralStyles.input,
                      {
                        backgroundColor: isDark ? '#1A1C2E' : '#F0F2F7',
                        borderColor: isDark ? colors.borderDark : colors.border,
                        color: isDark ? colors.textDark : colors.primaryText,
                      },
                    ]}
                    value={referralCode}
                    onChangeText={setReferralCode}
                    placeholder="Enter code here..."
                    placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                    autoCapitalize="characters"
                    returnKeyType="done"
                    onSubmitEditing={handleApplyReferralCode}
                  />
                  <View style={referralStyles.buttonRow}>
                    <TouchableOpacity
                      style={[referralStyles.applyButton, { backgroundColor: '#14B8A6', opacity: referralApplying ? 0.7 : 1 }]}
                      onPress={handleApplyReferralCode}
                      disabled={referralApplying}
                      activeOpacity={0.85}
                    >
                      {referralApplying ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={referralStyles.applyButtonText}>Apply Code</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[referralStyles.skipButton, { backgroundColor: isDark ? '#2E3050' : '#F0F2F7' }]}
                      onPress={dismissReferralModal}
                      activeOpacity={0.85}
                    >
                      <Text style={[referralStyles.skipButtonText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                        Skip
                      </Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MacroSummaryRowCompact({ label, eaten, goal, color, isDark }: any) {
  const percentage = Math.min((eaten / goal) * 100, 100);
  return (
    <View style={styles.macroSummaryRowCompact}>
      <Text style={[styles.macroSummaryLabelCompact, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
        {label}
      </Text>
      <View style={styles.macroSummaryBarContainer}>
        <View style={[styles.macroSummaryBarBackground, { backgroundColor: isDark ? colors.borderDark : colors.border }]}>
          <View style={[styles.macroSummaryBarFill, { width: `${percentage}%`, backgroundColor: color }]} />
        </View>
        <Text style={[styles.macroSummaryProgressCompact, { color: isDark ? colors.textDark : colors.text }]}>
          {eaten} / {goal}g
        </Text>
      </View>
    </View>
  );
}

function AvgMacroCell({ label, value, unit, color, isDark }: { label: string; value: number; unit: string; color: string; isDark: boolean }) {
  return (
    <View style={styles.avgMacroCell}>
      <Text style={[styles.avgMacroValue, { color }]}>{value}</Text>
      <Text style={[styles.avgMacroUnit, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>{unit}</Text>
      <Text style={[styles.avgMacroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function WeekAvgPill({ value, unit, color, isDark: _isDark }: { value: number; unit: string; color: string; isDark: boolean }) {
  const pillBg = color + '22';
  return (
    <View style={[styles.weekAvgPill, { backgroundColor: pillBg }]}>
      <Text style={[styles.weekAvgPillText, { color }]}>
        {value}
        <Text style={styles.weekAvgPillUnit}> {unit}</Text>
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { ...typography.body },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  errorText: { ...typography.body, textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.lg },
  retryButton: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: borderRadius.md },
  retryButtonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 16 },
  stickyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dateButton: { padding: spacing.sm, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dateCenter: { alignItems: 'center', flex: 1 },
  dateLabel: { ...typography.caption, marginBottom: 2 },
  dateText: { ...typography.h3 },
  segmentedControlWrapper: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: borderRadius.full,
    padding: 3,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonText: { fontSize: 14, fontWeight: '600' },
  planningHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  planningBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingRight: spacing.sm,
    minWidth: 80,
  },
  planningBackText: {
    fontSize: 14,
    fontWeight: '500',
  },
  scrollContent: { paddingHorizontal: spacing.md, paddingBottom: 120 },
  caloriesCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  cardTitle: { ...typography.h3, marginBottom: spacing.md },
  caloriesContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  macroSummaryCompact: { flex: 1, gap: spacing.sm },
  macroSummaryRowCompact: { gap: 4 },
  macroSummaryLabelCompact: { fontSize: 12, fontWeight: '500' },
  macroSummaryBarContainer: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  macroSummaryBarBackground: { flex: 1, height: 6, borderRadius: borderRadius.full, overflow: 'hidden' },
  macroSummaryBarFill: { height: '100%', borderRadius: borderRadius.full },
  macroSummaryProgressCompact: { fontSize: 11, fontWeight: '500', minWidth: 70, textAlign: 'right' },
  mealCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  mealHeaderLeft: { flex: 1, marginRight: 8 },
  mealMacroRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap', marginTop: 2 },
  mealMacroDot: { fontSize: 11, fontWeight: '500' },
  mealMacroValue: { fontSize: 11, fontWeight: '600' },
  mealTitle: { ...typography.h3 },
  mealCalories: { ...typography.caption },
  addMealButton: { padding: spacing.xs },
  emptyMeal: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    borderStyle: 'dashed',
  },
  emptyMealText: { ...typography.body },
  itemSeparator: { height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: spacing.xs },
  foodItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  foodInfo: { flex: 1 },
  foodName: { ...typography.bodyBold, marginBottom: 2 },
  foodBrand: { ...typography.caption, marginBottom: 2 },
  foodDetails: { ...typography.caption },
  foodCalories: { alignItems: 'flex-end' },
  foodCaloriesValue: { ...typography.bodyBold, fontSize: 18 },
  foodCaloriesLabel: { ...typography.caption },
  bottomSpacer: { height: 40 },

  // ── Planning ──
  plansLoadingContainer: { paddingVertical: spacing.xxl, alignItems: 'center' },
  plansEmptyCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginBottom: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  plansEmptyContainer: { paddingVertical: spacing.xl, alignItems: 'center' },
  plansEmptyTitle: { ...typography.h3, marginTop: spacing.sm },
  plansEmptyText: { ...typography.body, textAlign: 'center' },
  planCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  planCardContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planColorDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  planCardLeft: { flex: 1 },
  planName: { ...typography.bodyBold, marginBottom: 2 },
  planDateRange: { ...typography.caption },
  createPlanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  createPlanButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // AI card
  aiCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 12px rgba(124, 58, 237, 0.15)',
    elevation: 3,
  },
  aiCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  aiIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiCardText: { flex: 1 },
  aiCardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  aiCardSubtitle: { fontSize: 13, lineHeight: 18 },
  aiComingSoonBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  aiComingSoonText: { fontSize: 12, fontWeight: '600' },

  // Calendar header
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  calNavBtn: { padding: spacing.sm, minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  calMonthLabel: { fontSize: 17, fontWeight: '700' },
  calLoadingBox: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.md,
  },

  // Date range
  rangeCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    elevation: 2,
  },
  rangeSectionLabel: { fontSize: 12, fontWeight: '600', marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  rangeRow: { flexDirection: 'row', alignItems: 'center' },
  rangeBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm },
  rangeBtnLabel: { fontSize: 11, fontWeight: '500', marginBottom: 2 },
  rangeBtnDate: { fontSize: 15, fontWeight: '700' },
  rangeDivider: { width: 1, height: 32, marginHorizontal: spacing.sm },

  // iOS date picker modal
  pickerModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerModalContent: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: 32,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pickerModalTitle: { fontSize: 16, fontWeight: '600' },
  pickerDoneText: { fontSize: 16, fontWeight: '700' },

  // Avg macros card (kept for reference)
  avgCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    elevation: 2,
  },
  avgCardHeader: { marginBottom: spacing.md },
  avgCardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  avgCardSubtitle: { fontSize: 13 },
  avgMacroRow: { flexDirection: 'row', justifyContent: 'space-around' },
  avgMacroCell: { alignItems: 'center', gap: 2 },
  avgMacroValue: { fontSize: 22, fontWeight: '700' },
  avgMacroUnit: { fontSize: 11, fontWeight: '500' },
  avgMacroLabel: { fontSize: 11, fontWeight: '500' },
  avgEmptyText: { ...typography.caption, textAlign: 'center', paddingVertical: spacing.sm },

  // Week average pill row
  weekAvgCard: {
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
  },
  weekAvgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
    flexWrap: 'nowrap',
  },
  weekAvgDivider: {
    height: 1,
    marginHorizontal: 14,
  },
  weekAvgLabel: {
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 0,
    marginRight: 4,
    width: 56,
  },
  weekAvgPills: {
    flexDirection: 'row',
    gap: 6,
    flexShrink: 1,
  },
  weekAvgPill: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  weekAvgPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  weekAvgPillUnit: {
    fontSize: 11,
    fontWeight: '600',
  },
  weekAvgEmpty: {
    fontSize: 13,
  },

  // Grocery button
  groceryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  groceryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Section divider
  sectionDivider: { height: 1, marginBottom: spacing.md },

  // Template plans
  templateSectionHeader: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  templateSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F59E0B',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  templateCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  templateCardContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  templateEmojiCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  templateEmoji: { fontSize: 20 },
  templateCardLeft: { flex: 1 },
  templateName: { ...typography.bodyBold, marginBottom: 4 },
  templateBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  templateGoalBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  templateGoalBadgeText: { fontSize: 11, fontWeight: '700', color: '#D97706' },
  templateSubtitle: { fontSize: 12 },

  // Day assignment bottom sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: spacing.md },
  sheetCurrentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  sheetCurrentDot: { width: 10, height: 10, borderRadius: 5 },
  sheetCurrentText: { fontSize: 14, fontWeight: '500' },
  sheetSectionLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  sheetPlanList: { maxHeight: 240 },
  sheetEmptyText: { ...typography.caption, textAlign: 'center', paddingVertical: spacing.md },
  sheetPlanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  sheetPlanDot: { width: 12, height: 12, borderRadius: 6 },
  sheetPlanName: { flex: 1, fontSize: 15, fontWeight: '500' },
  sheetRemoveBtn: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  sheetRemoveText: { fontSize: 15, fontWeight: '600' },
  sheetCancelBtn: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  sheetCancelText: { fontSize: 15, fontWeight: '600' },
});

const referralStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
    marginBottom: spacing.md,
    textAlign: 'center',
    letterSpacing: 2,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  applyButton: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  skipButton: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
