
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator, ScrollView, ActionSheetIOS,
  Modal, TextInput, KeyboardAvoidingView, Animated, Dimensions, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyReferralCode } from '@/utils/referralApi';
import { useStreakRescue } from '@/hooks/useStreakRescue';
import StreakRescueModal from '@/components/StreakRescueModal';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import ProgressCircle from '@/components/ProgressCircle';
import { IconSymbol } from '@/components/IconSymbol';
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow';
import { supabase } from '@/lib/supabase/client';
import {
  listMealPlans,
  deleteMealPlan,
  createMealPlan,
  type MealPlan,
} from '@/utils/mealPlansApi';
import { listTemplatePlans, type TemplatePlan } from '@/utils/templatePlansApi';
import { formatServing } from '@/utils/servingFormat';
import { toLocalDateString } from '@/utils/dateUtils';
import { usePremium } from '@/hooks/usePremium';
import { useWidget } from '@/contexts/WidgetContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAN_COLORS = ['#14B8A6', '#8B5CF6', '#F59E0B', '#EF4444', '#3B82F6', '#10B981'];

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
  logged_at?: string | null;
  meal_type?: string;
  foods: {
    id: string;
    name: string;
    brand: string | null;
    serving_amount: number;
    serving_unit: string;
    user_created: boolean;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getServingDisplayText = (item: FoodItem): string => {
  // 1. Best: use the saved serving description (e.g. "2 eggs", "1 slice")
  if (item.serving_description) return item.serving_description;
  // 2. Use grams if available (e.g. "63 g")
  if (item.grams && item.grams > 0) return formatServing(item.grams, 'g');
  // 3. Fallback: quantity × serving_amount, but only if serving_unit is meaningful (not 'serving')
  const quantity = item.quantity || 1;
  const servingAmount = item.foods?.serving_amount || 100;
  const servingUnit = item.foods?.serving_unit || 'g';
  if (servingUnit === 'serving' || servingUnit === 'servings') {
    // serving_unit is generic — just show grams
    return formatServing(quantity * servingAmount, 'g');
  }
  return formatServing(quantity * servingAmount, servingUnit);
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { isPremium } = usePremium();
  const { syncWidget } = useWidget();

  // Navigation readiness guard — prevents 'Cannot read property route of null'
  // on the first render cycle before the navigation context is initialized.
  const [navReady, setNavReady] = useState(false);
  useEffect(() => {
    console.log('[HomeScreen] Navigation context ready');
    setNavReady(true);
  }, []);

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

  // Segmented control
  const [activeTab, setActiveTab] = useState<'tracking' | 'planning'>('tracking');
  const slideAnim = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;

  // ── Tracking state ──
  const [goal, setGoal] = useState<any>(null);
  const [meals, setMeals] = useState<MealData[]>([
    { type: 'breakfast', label: 'Breakfast', items: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0 },
    { type: 'lunch', label: 'Lunch', items: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0 },
    { type: 'dinner', label: 'Dinner', items: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0 },
    { type: 'snack', label: 'Snacks', items: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0 },
  ]);
  const [allFoodItems, setAllFoodItems] = useState<(FoodItem & { meal_type: string })[]>([]);
  const [totalCalories, setTotalCalories] = useState(0);
  const [totalMacros, setTotalMacros] = useState({ protein: 0, carbs: 0, fats: 0, fiber: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [error, setError] = useState<string | null>(null);

  // ── Planning state ──
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
  type DayKey = typeof DAYS[number];

  const [plans, setPlans] = useState<MealPlan[]>([]);
  const [templatePlans, setTemplatePlans] = useState<TemplatePlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekPlans, setWeekPlans] = useState<Record<number, Record<DayKey, string | null>>>({
    0: { Mon: null, Tue: null, Wed: null, Thu: null, Fri: null, Sat: null, Sun: null },
  });
  const [planMacros, setPlanMacros] = useState<Record<string, { calories: number; protein: number; carbs: number; fats: number }>>({});
  const [newPlanModalVisible, setNewPlanModalVisible] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanSaving, setNewPlanSaving] = useState(false);

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
        console.log('[Home iOS] First launch — showing referral code prompt');
        setReferralModalVisible(true);
        Animated.spring(referralSlideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }).start();
      } catch (e) {
        console.warn('[Home iOS] Failed to check referral prompt:', e);
      }
    };
    checkReferralPrompt();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissReferralModal = async () => {
    console.log('[Home iOS] Referral modal dismissed');
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
      console.warn('[Home iOS] Failed to save referral prompt flag:', e);
    }
  };

  const handleApplyReferralCode = async () => {
    if (!referralCode.trim()) return;
    console.log('[Home iOS] Apply referral code pressed:', referralCode.trim());
    setReferralApplying(true);
    try {
      const result = await applyReferralCode(referralCode.trim());
      if (result.success) {
        console.log('[Home iOS] Referral code applied successfully');
        Alert.alert('🎉 Code Applied!', 'You and your friend both earned 1,000 XP!');
      } else {
        console.warn('[Home iOS] Referral code failed:', result.error);
        Alert.alert('Invalid Code', result.error || 'Could not apply this code.');
      }
    } catch (e) {
      console.error('[Home iOS] Unexpected error applying referral code:', e);
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
        console.error('[Home iOS] Error getting user:', userError);
        setError('Failed to authenticate. Please try logging in again.');
        setLoading(false);
        return;
      }
      if (!user) {
        console.log('[Home iOS] No user found');
        setError('No user session found. Please log in.');
        setLoading(false);
        return;
      }

      console.log('[Home iOS] Loading data for user:', user.id);

      const { data: goalData, error: goalError } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (goalError) {
        console.error('[Home iOS] Error loading goal:', goalError);
        setGoal({ daily_calories: 2000, protein_g: 150, carbs_g: 200, fats_g: 65, fiber_g: 30 });
      } else if (goalData) {
        console.log('[Home iOS] Goal loaded:', goalData);
        setGoal(goalData);
      } else {
        console.log('[Home iOS] No active goal found, using defaults');
        setGoal({ daily_calories: 2000, protein_g: 150, carbs_g: 200, fats_g: 65, fiber_g: 30 });
      }

      const dateString = toLocalDateString(selectedDate);
      console.log('[Home iOS] Loading meals for date:', dateString);

      const { data: mealsData, error: mealsError } = await supabase
        .from('meals')
        .select(`
          id,
          meal_type,
          date,
          meal_items (
            id,
            quantity,
            calories,
            protein,
            carbs,
            fats,
            fiber,
            serving_description,
            grams,
            logged_at,
            foods (
              id,
              name,
              brand,
              serving_amount,
              serving_unit,
              user_created
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('date', dateString);

      if (mealsError) {
        console.error('[Home iOS] Error loading meals:', mealsError);
        setError('Failed to load meals. Please try refreshing.');
        setAllFoodItems([]);
      } else {
        console.log('[Home iOS] Meals loaded for', dateString, ':', mealsData?.length || 0, 'meals');

        const mealsByType: Record<MealType, FoodItem[]> = {
          breakfast: [], lunch: [], dinner: [], snack: [],
        };

        let totalCals = 0, totalP = 0, totalC = 0, totalF = 0, totalFib = 0;

        if (mealsData && mealsData.length > 0) {
          mealsData.forEach((meal: any) => {
            if (meal.meal_items) {
              meal.meal_items.forEach((item: any) => {
                mealsByType[meal.meal_type as MealType].push({ ...item, meal_type: meal.meal_type, logged_at: item.logged_at ?? null });
                totalCals += item.calories || 0;
                totalP += item.protein || 0;
                totalC += item.carbs || 0;
                totalF += item.fats || 0;
                totalFib += item.fiber || 0;
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

        // Sync to iOS widget after meals are loaded
        console.log('[Home iOS] Triggering widget sync after meal load');
        syncWidget();

        // Flatten all items into a single chronological list
        const flat: (FoodItem & { meal_type: string })[] = [];
        (['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).forEach(type => {
          mealsByType[type].forEach(item => flat.push({ ...item, meal_type: type }));
        });
        setAllFoodItems(flat);
      }
    } catch (err: any) {
      console.error('[Home iOS] Error in loadData:', err);
      setError(err?.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // ── Load plans ──
  const loadPlans = useCallback(async () => {
    console.log('[Home iOS] Loading meal plans and template plans');
    setPlansLoading(true);
    setPlansError(null);
    try {
      const [plansData, templatesData] = await Promise.all([
        listMealPlans().catch((err: any) => {
          const msg: string = err?.message || '';
          if (msg.includes('does not exist') || msg.includes('relation')) {
            console.log('[Home iOS] meal_plans table not yet created — showing empty state');
            return { plans: [] };
          }
          throw err;
        }),
        listTemplatePlans().catch((err: any) => {
          const msg: string = err?.message || '';
          if (msg.includes('does not exist') || msg.includes('relation')) {
            console.log('[Home iOS] template_meal_plans table not yet created — showing empty state');
            return [];
          }
          console.warn('[Home iOS] Error loading template plans:', err);
          return [];
        }),
      ]);
      console.log('[Home iOS] Meal plans loaded:', plansData.plans?.length || 0);
      console.log('[Home iOS] Template plans loaded:', Array.isArray(templatesData) ? templatesData.length : 0);
      setPlans(plansData.plans || []);
      setTemplatePlans(Array.isArray(templatesData) ? templatesData : []);
    } catch (err: any) {
      console.error('[Home iOS] Error loading meal plans:', err);
      setPlansError('Failed to load meal plans.');
    } finally {
      setPlansLoading(false);
    }
  }, []);

  const fetchPlanMacros = async (planId: string) => {
    if (planMacros[planId]) return;
    try {
      const { data, error } = await supabase
        .from('meal_plan_items')
        .select('calories, protein, carbs, fats')
        .eq('plan_id', planId);
      if (error || !data) return;
      const totals = data.reduce(
        (acc, item) => ({
          calories: acc.calories + (item.calories || 0),
          protein: acc.protein + (item.protein || 0),
          carbs: acc.carbs + (item.carbs || 0),
          fats: acc.fats + (item.fats || 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fats: 0 }
      );
      setPlanMacros(prev => ({ ...prev, [planId]: totals }));
    } catch (e) {
      console.error('[Home iOS] fetchPlanMacros error:', e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      console.log('[Home iOS] Screen focused, loading data');
      // Auto-advance to today only if the stored date is in the future
      setSelectedDate(prev => {
        const today = new Date();
        const prevDate = new Date(prev);
        prevDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        // Solo avanza a hoy si la fecha es futura (no resetea fechas pasadas)
        return prevDate > today ? new Date() : prev;
      });
      loadData();
      loadPlans();
    }, [loadData, loadPlans])
  );

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    console.log('[Home iOS] selectedDate changed — reloading data for:', toLocalDateString(selectedDate));
    loadData();
  }, [selectedDate, loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
    loadPlans();
  };

  // ── Tracking handlers ──
  const handleAddFood = (mealType: MealType) => {
    console.log('[Home iOS] Opening add food for meal:', mealType);
    const dateString = toLocalDateString(selectedDate);
    console.log('[Home iOS] Passing date to add-food:', dateString);
    router.push(`/add-food?meal=${mealType}&date=${dateString}`);
  };

  const handleEditFood = (item: FoodItem, isSwiping: boolean) => {
    if (isSwiping) {
      console.log('[Home iOS] Blocked edit - swipe gesture is active');
      return;
    }
    console.log('[Home iOS] Opening edit food:', item.id);
    const dateString = toLocalDateString(selectedDate);
    router.push({ pathname: '/edit-food', params: { itemId: item.id, date: dateString } });
  };

  const handleDeleteFood = useCallback(async (itemId: string) => {
    console.log('[Home iOS] Delete requested for item:', itemId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No authenticated user found');

      let deletedItem: FoodItem | null = null;

      setMeals(prevMeals => {
        const newMeals = prevMeals.map(meal => {
          const itemToDelete = meal.items.find(i => i.id === itemId);
          if (itemToDelete) deletedItem = itemToDelete;
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
        console.log('[Home iOS] UI state updated - item removed from list');
        return newMeals;
      });

      setAllFoodItems(prev => prev.filter(i => i.id !== itemId));

      if (deletedItem) {
        setTotalCalories(prev => prev - ((deletedItem as FoodItem).calories || 0));
        setTotalMacros(prev => ({
          protein: prev.protein - ((deletedItem as FoodItem).protein || 0),
          carbs: prev.carbs - ((deletedItem as FoodItem).carbs || 0),
          fats: prev.fats - ((deletedItem as FoodItem).fats || 0),
          fiber: prev.fiber - ((deletedItem as FoodItem).fiber || 0),
        }));
      }

      const { error } = await supabase.from('meal_items').delete().eq('id', itemId);
      if (error) {
        console.error('[Home iOS] Database delete error:', error);
        throw error;
      }
      console.log('[Home iOS] Successfully deleted from database');
    } catch (err: any) {
      console.error('[Home iOS] Error in handleDeleteFood:', err);
      Alert.alert('Delete Failed', err?.message || 'Failed to delete food entry. Please try again.', [{ text: 'OK' }]);
      loadData();
    }
  }, [loadData]);

  const goToPreviousDay = () => {
    console.log('[Home iOS] Navigating to previous day');
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const goToNextDay = () => {
    console.log('[Home iOS] Navigating to next day');
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    setSelectedDate(newDate);
  };

  const goToToday = () => {
    console.log('[Home iOS] Navigating to today');
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
    console.log('[Home iOS] Segmented control pressed:', tab);
    setActiveTab(tab);
    Animated.spring(slideAnim, {
      toValue: tab === 'tracking' ? 0 : -screenWidth,
      damping: 20,
      stiffness: 120,
      mass: 1,
      useNativeDriver: true,
    }).start();
  };

  // ── Planning helpers ──
  const currentWeekPlan = weekPlans[weekOffset] ?? { Mon: null, Tue: null, Wed: null, Thu: null, Fri: null, Sat: null, Sun: null };

  const setCurrentDayPlan = (day: DayKey, planId: string | null) => {
    setWeekPlans(prev => ({
      ...prev,
      [weekOffset]: {
        ...(prev[weekOffset] ?? { Mon: null, Tue: null, Wed: null, Thu: null, Fri: null, Sat: null, Sun: null }),
        [day]: planId,
      },
    }));
  };

  const handleCreateNewPlan = async () => {
    if (!newPlanName.trim()) return;
    console.log('[Home iOS] Creating new meal plan:', newPlanName.trim());
    setNewPlanSaving(true);
    try {
      const newPlan = await createMealPlan({ name: newPlanName.trim() });
      setPlans(prev => [...prev, newPlan]);
      setNewPlanModalVisible(false);
      setNewPlanName('');
      router.push({ pathname: '/meal-plan-detail', params: { planId: newPlan.id } });
    } catch {
      Alert.alert('Error', 'Failed to create plan. Please try again.');
    } finally {
      setNewPlanSaving(false);
    }
  };

  const handleDayPlanPress = (day: DayKey) => {
    console.log('[Home iOS] Day plan pressed:', day);
    const currentPlanId = currentWeekPlan[day];
    const planOptions = plans.map(p => p.name);
    const hasAssigned = currentPlanId != null;
    const options = [...planOptions, hasAssigned ? 'Remove plan' : null, 'Cancel'].filter(Boolean) as string[];
    const cancelIndex = options.length - 1;
    const destructiveIndex = hasAssigned ? options.length - 2 : undefined;

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex: cancelIndex,
        destructiveButtonIndex: destructiveIndex,
        title: day,
        message: hasAssigned
          ? `Current: ${plans.find(p => p.id === currentPlanId)?.name || ''}`
          : 'Assign a plan to this day',
      },
      (buttonIndex) => {
        if (buttonIndex === cancelIndex) return;
        if (destructiveIndex !== undefined && buttonIndex === destructiveIndex) {
          console.log('[Home iOS] Removing plan from day:', day);
          setCurrentDayPlan(day, null);
          return;
        }
        const selected = plans[buttonIndex];
        if (!selected) return;
        console.log('[Home iOS] Assigning plan', selected.id, 'to day:', day);
        setCurrentDayPlan(day, selected.id);
        fetchPlanMacros(selected.id);
      }
    );
  };

  // ── Planning derived values ──
  const assignedDays = DAYS.filter(d => currentWeekPlan[d] != null);
  const avgMacros = assignedDays.length === 0 ? null : (() => {
    const totals = assignedDays.reduce(
      (acc, day) => {
        const m = planMacros[currentWeekPlan[day]!];
        if (!m) return acc;
        return {
          calories: acc.calories + m.calories,
          protein: acc.protein + m.protein,
          carbs: acc.carbs + m.carbs,
          fats: acc.fats + m.fats,
          count: acc.count + 1,
        };
      },
      { calories: 0, protein: 0, carbs: 0, fats: 0, count: 0 }
    );
    if (totals.count === 0) return null;
    return {
      calories: Math.round(totals.calories / totals.count),
      protein: Math.round(totals.protein / totals.count),
      carbs: Math.round(totals.carbs / totals.count),
      fats: Math.round(totals.fats / totals.count),
    };
  })();

  // ── Derived values ──
  const leftArrowDisabled = false;
  const rightArrowDisabled = isTodayOrFuture();
  const todayLabel = isToday() ? 'Today' : selectedDate.toLocaleDateString('en-US', { weekday: 'short' });
  const dateDisplay = selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // ── Render helpers ──

  if (!navReady) return null;

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

  const renderFoodItem = ({ item }: { item: FoodItem }) => (
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
              {item.foods?.name || 'Unknown Food'}
            </Text>
            {item.foods?.brand && (
              <Text style={[styles.foodBrand, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {item.foods.brand}
              </Text>
            )}
            <Text style={[styles.foodDetails, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {getServingDisplayText(item)}
            </Text>
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

  // ── Session grouping ──
  const SESSION_GAP_MS = 20 * 60 * 1000; // 20 minutes

  interface FoodSession {
    sessionTime: Date;
    items: (FoodItem & { meal_type: string; logged_at?: string | null })[];
  }

  const groupIntoSessions = (items: (FoodItem & { meal_type: string; logged_at?: string | null })[]): FoodSession[] => {
    if (items.length === 0) return [];

    const sorted = [...items].sort((a, b) => {
      if (!a.logged_at && !b.logged_at) return 0;
      if (!a.logged_at) return 1;
      if (!b.logged_at) return -1;
      return new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime();
    });

    const sessions: FoodSession[] = [];
    let currentSession: FoodSession | null = null;

    sorted.forEach(item => {
      const itemTime = item.logged_at ? new Date(item.logged_at) : new Date();

      if (!currentSession) {
        currentSession = { sessionTime: itemTime, items: [item] };
      } else {
        const lastItem = currentSession.items[currentSession.items.length - 1];
        const lastTime = lastItem.logged_at ? new Date(lastItem.logged_at) : new Date();
        const gap = itemTime.getTime() - lastTime.getTime();

        if (gap <= SESSION_GAP_MS) {
          currentSession.items.push(item);
        } else {
          sessions.push(currentSession);
          currentSession = { sessionTime: itemTime, items: [item] };
        }
      }
    });

    if (currentSession) sessions.push(currentSession);
    return sessions;
  };

  const formatSessionTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const renderTrackingContent = () => {
    const cardBg = isDark ? colors.cardDark : colors.card;
    const textPrimary = isDark ? colors.textDark : colors.text;
    const textSec = isDark ? colors.textSecondaryDark : colors.textSecondary;
    const dividerColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
    const itemCount = allFoodItems.length;
    const itemCountLabel = itemCount === 1 ? 'item' : 'items';
    const sessions = groupIntoSessions(allFoodItems);

    return (
      <View>
        {/* Calories + macros summary card */}
        <View style={[styles.caloriesCard, { backgroundColor: cardBg }]}>
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

        {/* Today's Food — session-grouped list */}
        <View style={[styles.mealCard, { backgroundColor: cardBg }]}>
          {/* Header */}
          <View style={styles.mealHeader}>
            <View style={styles.mealHeaderLeft}>
              <Text style={[styles.mealTitle, { color: textPrimary }]}>Today's Food</Text>
              {itemCount > 0 && (
                <Text style={[styles.mealCalories, { color: textSec }]}>
                  {itemCount}
                  {' '}
                  {itemCountLabel}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.addMealButton}
              onPress={() => {
                const hour = new Date().getHours();
                let mealType: MealType = 'snack';
                if (hour >= 6 && hour < 10) mealType = 'breakfast';
                else if (hour >= 10 && hour < 15) mealType = 'lunch';
                else if (hour >= 15 && hour < 18) mealType = 'snack';
                else if (hour >= 18 && hour < 22) mealType = 'dinner';
                console.log('[Home iOS] Add food pressed, smart meal type:', mealType);
                handleAddFood(mealType);
              }}
            >
              <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add" size={28} color={colors.info} />
            </TouchableOpacity>
          </View>

          {itemCount === 0 ? (
            <TouchableOpacity
              style={styles.emptyMeal}
              onPress={() => {
                console.log('[Home iOS] Empty state tapped, adding breakfast');
                handleAddFood('breakfast');
              }}
            >
              <Text style={[styles.emptyMealText, { color: textSec }]}>Tap to add food</Text>
            </TouchableOpacity>
          ) : (
            <View>
              {sessions.map((session, sessionIndex) => {
                const sessionTimeLabel = formatSessionTime(session.sessionTime);
                const isLastSession = sessionIndex === sessions.length - 1;
                return (
                  <View key={sessionIndex}>
                    {/* Session time header */}
                    <View style={styles.sessionHeader}>
                      <Text style={[styles.sessionTime, { color: colors.primary }]}>
                        {sessionTimeLabel}
                      </Text>
                      <View style={[styles.sessionLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }]} />
                    </View>
                    {/* Items in this session */}
                    {session.items.map((item, itemIndex) => {
                      const isLastInSession = itemIndex === session.items.length - 1;
                      const servingText = getServingDisplayText(item);
                      const proteinRounded = Math.round(item.protein);
                      const carbsRounded = Math.round(item.carbs);
                      const fatsRounded = Math.round(item.fats);
                      const calsRounded = Math.round(item.calories);
                      const foodName = item.foods?.name || 'Unknown Food';
                      const foodBrand = item.foods?.brand;
                      return (
                        <View key={item.id}>
                          <SwipeToDeleteRow onDelete={() => handleDeleteFood(item.id)}>
                            {(isSwiping: boolean) => (
                              <TouchableOpacity
                                style={styles.foodItem}
                                onPress={() => handleEditFood(item, isSwiping)}
                                activeOpacity={0.7}
                                disabled={isSwiping}
                              >
                                <View style={styles.foodInfo}>
                                  <Text style={[styles.foodName, { color: textPrimary }]}>
                                    {foodName}
                                  </Text>
                                  {foodBrand && (
                                    <Text style={[styles.foodBrand, { color: textSec }]}>
                                      {foodBrand}
                                    </Text>
                                  )}
                                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <Text style={[styles.foodDetails, { color: textSec }]}>
                                      {servingText}
                                    </Text>
                                    <Text style={[styles.foodDetails, { color: textSec }]}>
                                      {'  ·  '}
                                    </Text>
                                    <Text style={[styles.foodDetails, { color: colors.protein }]}>
                                      {proteinRounded}
                                      {'P'}
                                    </Text>
                                    <Text style={[styles.foodDetails, { color: textSec }]}>
                                      {'  '}
                                    </Text>
                                    <Text style={[styles.foodDetails, { color: colors.carbs }]}>
                                      {carbsRounded}
                                      {'C'}
                                    </Text>
                                    <Text style={[styles.foodDetails, { color: textSec }]}>
                                      {'  '}
                                    </Text>
                                    <Text style={[styles.foodDetails, { color: colors.fats }]}>
                                      {fatsRounded}
                                      {'F'}
                                    </Text>
                                  </View>
                                </View>
                                <View style={styles.foodCalories}>
                                  <Text style={[styles.foodCaloriesValue, { color: textPrimary }]}>
                                    {calsRounded}
                                  </Text>
                                  <Text style={[styles.foodCaloriesLabel, { color: textSec }]}>
                                    kcal
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            )}
                          </SwipeToDeleteRow>
                          {!isLastInSession && <View style={[styles.itemSeparator, { backgroundColor: dividerColor }]} />}
                        </View>
                      );
                    })}
                    {/* Gap between sessions */}
                    {!isLastSession && <View style={{ height: 8 }} />}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderPlanningContent = () => {
    if (plansLoading) {
      return (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#14B8A6" />
        </View>
      );
    }
    if (plansError) {
      return (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <Text style={{ color: isDark ? '#fff' : '#000', marginBottom: 12 }}>{plansError}</Text>
          <TouchableOpacity onPress={loadPlans} style={{ backgroundColor: '#14B8A6', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const cardBg = isDark ? '#1C1C1E' : '#FFFFFF';
    const textPrimary = isDark ? '#FFFFFF' : '#000000';
    const textSecondary = isDark ? '#8E8E93' : '#6B7280';
    const surfaceBg = isDark ? '#2C2C2E' : '#F5F5F5';

    // Compute week start/end for selected weekOffset
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7) + weekOffset * 7);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    const weekLabel = weekOffset === 0
      ? 'This Week'
      : weekOffset === 1
      ? 'Next Week'
      : weekOffset === -1
      ? 'Last Week'
      : `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    const weekDateRange = `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    // Grocery list for this week
    const assignedPlanIds = [...new Set(DAYS.map(d => currentWeekPlan[d]).filter(Boolean))] as string[];
    const allAssignedPlanIds = DAYS.map(d => currentWeekPlan[d]).filter(Boolean) as string[]; // with duplicates for counting

    return (
      <View>
        {/* Week selector + macro card */}
        <View style={{ backgroundColor: cardBg, borderRadius: 16, padding: 16, marginBottom: 12 }}>
          {/* Week navigation */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <TouchableOpacity
              onPress={() => {
                console.log('[Home iOS] Week selector: previous week');
                setWeekOffset(w => w - 1);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ padding: 4 }}
            >
              <Text style={{ fontSize: 22, color: '#14B8A6', fontWeight: '300' }}>‹</Text>
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: textPrimary }}>{weekLabel}</Text>
              <Text style={{ fontSize: 12, color: textSecondary, marginTop: 1 }}>{weekDateRange}</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                console.log('[Home iOS] Week selector: next week');
                setWeekOffset(w => w + 1);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ padding: 4 }}
            >
              <Text style={{ fontSize: 22, color: '#14B8A6', fontWeight: '300' }}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Horizontal day grid */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
            {DAYS.map(day => {
              const assignedId = currentWeekPlan[day];
              const assignedPlan = plans.find(p => p.id === assignedId);
              const planColor = assignedPlan ? PLAN_COLORS[plans.indexOf(assignedPlan) % PLAN_COLORS.length] : null;
              return (
                <TouchableOpacity
                  key={day}
                  onPress={() => {
                    console.log('[Home iOS] Day cell pressed:', day);
                    if (plans.length > 0) { handleDayPlanPress(day); } else { setNewPlanName(''); setNewPlanModalVisible(true); }
                  }}
                  activeOpacity={0.7}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    backgroundColor: planColor ? planColor + '22' : surfaceBg,
                    borderRadius: 10,
                    paddingVertical: 10,
                    borderWidth: planColor ? 1.5 : 0,
                    borderColor: planColor ?? 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: textSecondary, marginBottom: 6 }}>{day}</Text>
                  {planColor
                    ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: planColor }} />
                    : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isDark ? '#3C3C3E' : '#D1D5DB' }} />
                  }
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Week Average */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', paddingVertical: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: textSecondary, marginRight: 2 }}>Per day</Text>
            {avgMacros == null ? (
              <Text style={{ fontSize: 13, color: textSecondary }}>No plans assigned</Text>
            ) : (
              <>
                <View style={{ backgroundColor: '#14B8A622', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#14B8A6' }}>
                    {avgMacros.calories}
                    <Text style={{ fontSize: 12, fontWeight: '600' }}> kcal</Text>
                  </Text>
                </View>
                <View style={{ backgroundColor: '#3B82F622', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#3B82F6' }}>
                    {avgMacros.protein}
                    <Text style={{ fontSize: 12, fontWeight: '600' }}> P</Text>
                  </Text>
                </View>
                <View style={{ backgroundColor: '#F59E0B22', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#F59E0B' }}>
                    {avgMacros.carbs}
                    <Text style={{ fontSize: 12, fontWeight: '600' }}> C</Text>
                  </Text>
                </View>
                <View style={{ backgroundColor: '#EF444422', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>
                    {avgMacros.fats}
                    <Text style={{ fontSize: 12, fontWeight: '600' }}> F</Text>
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* Grocery list button */}
          {assignedPlanIds.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                const planIdsStr = allAssignedPlanIds.join(',');
                console.log('[Home iOS] Grocery list button pressed, planIds:', planIdsStr);
                router.push({ pathname: '/meal-plan-grocery', params: { planIds: planIdsStr, rangeLabel: weekLabel } });
              }}
              activeOpacity={0.8}
              style={{
                marginTop: 14,
                backgroundColor: '#14B8A6',
                borderRadius: 10,
                paddingVertical: 11,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 16 }}>🛒</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Grocery List</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* My Plans section */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 }}>My Plans</Text>
        {plans.length === 0 ? (
          <View style={{ backgroundColor: cardBg, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: textPrimary, marginBottom: 8 }}>No meal plans yet</Text>
            <Text style={{ fontSize: 14, color: textSecondary, textAlign: 'center' }}>Create your first plan to start planning your week.</Text>
          </View>
        ) : (
          plans.map((plan, idx) => {
            const dotColor = PLAN_COLORS[idx % PLAN_COLORS.length];
            return (
              <SwipeToDeleteRow
                key={plan.id}
                onDelete={() => {
                  console.log('[Home iOS] Delete plan swiped, plan:', plan.id);
                  Alert.alert('Delete Plan', 'Are you sure?', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete', style: 'destructive', onPress: async () => {
                        console.log('[Home iOS] Confirming delete for plan:', plan.id);
                        try {
                          await deleteMealPlan(plan.id);
                          console.log('[Home iOS] Plan deleted:', plan.id);
                          setPlans(prev => prev.filter(p => p.id !== plan.id));
                          setWeekPlans(prev => {
                            const next = { ...prev };
                            Object.keys(next).forEach(wk => {
                              DAYS.forEach(d => { if (next[Number(wk)][d] === plan.id) next[Number(wk)][d] = null; });
                            });
                            return next;
                          });
                        } catch {
                          Alert.alert('Error', 'Failed to delete plan.');
                        }
                      },
                    },
                  ]);
                }}
              >
                <TouchableOpacity
                  style={{ backgroundColor: cardBg, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}
                  onPress={() => {
                    console.log('[Home iOS] Meal plan pressed:', plan.id, plan.name);
                    router.push({ pathname: '/meal-plan-detail', params: { planId: plan.id } });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor, marginRight: 12 }} />
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: textPrimary }}>{plan.name}</Text>
                  <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={textSecondary} />
                </TouchableOpacity>
              </SwipeToDeleteRow>
            );
          })
        )}

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
                    console.log('[Home iOS] Template plan pressed:', tplan.id, tplan.name);
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

        {/* Generate with AI button */}
        <TouchableOpacity
          style={{ backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8, marginBottom: 8, borderWidth: 1.5, borderColor: '#14B8A6' }}
          onPress={() => {
            console.log('[Home iOS] Generate plan with AI pressed, isPremium:', isPremium);
            if (!isPremium) {
              router.push('/subscription');
            } else {
              router.push('/ai-meal-planner');
            }
          }}
          activeOpacity={0.8}
        >
          <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto_awesome" size={20} color="#14B8A6" />
          <Text style={{ color: '#14B8A6', fontSize: 16, fontWeight: '600' }}>Generate Plan with AI</Text>
        </TouchableOpacity>

        {/* Create plan button */}
        <TouchableOpacity
          style={{ backgroundColor: '#14B8A6', borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 0, marginBottom: 16 }}
          onPress={() => {
            console.log('[Home iOS] Create new meal plan pressed');
            setNewPlanName('');
            setNewPlanModalVisible(true);
          }}
          activeOpacity={0.8}
        >
          <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={20} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Create New Plan</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
      {/* Top header: always-visible segmented control */}
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

      <View style={{ flex: 1, overflow: 'hidden' }}>
        <Animated.View
          style={{
            flex: 1,
            flexDirection: 'row',
            width: screenWidth * 2,
            transform: [{ translateX: slideAnim }],
          }}
        >
          {/* Tracking panel */}
          <ScrollView
            style={{ width: screenWidth }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.scrollContent}
          >
            {renderTrackingContent()}
            <View style={styles.bottomSpacer} />
          </ScrollView>
          {/* Planning panel */}
          <ScrollView
            style={{ width: screenWidth }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {renderPlanningContent()}
            <View style={styles.bottomSpacer} />
          </ScrollView>
        </Animated.View>
      </View>

      {/* Streak Rescue Modal */}
      <StreakRescueModal
        visible={canRescue}
        lostStreakValue={lostStreakValue}
        priceLabel={priceLabel}
        purchasing={purchasing}
        onPurchase={async () => {
          console.log('[Home iOS] Streak rescue purchase initiated');
          const result = await executePurchase();
          if (result.success) {
            console.log('[Home iOS] Streak rescue purchase succeeded, streak restored to:', lostStreakValue);
            Alert.alert('¡Racha restaurada!', `¡Tu racha de ${lostStreakValue} días fue restaurada!`);
            await refreshRescue();
          } else if (result.error) {
            console.warn('[Home iOS] Streak rescue purchase failed:', result.error);
            Alert.alert('Error', result.error);
          }
        }}
        onDismiss={() => {
          console.log('[Home iOS] Streak rescue dismissed');
          dismissRescue();
        }}
      />

      {/* New Plan Modal */}
      <Modal
        visible={newPlanModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setNewPlanModalVisible(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          activeOpacity={1}
          onPress={() => setNewPlanModalVisible(false)}
        />
        <KeyboardAvoidingView
          behavior="position"
          keyboardVerticalOffset={0}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
        >
          <View style={{
            backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingHorizontal: 24,
            paddingTop: 20,
            paddingBottom: 40,
          }}>
            {/* Handle bar */}
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: isDark ? '#3C3C3E' : '#D1D5DB', alignSelf: 'center', marginBottom: 20 }} />

            <Text style={{ fontSize: 20, fontWeight: '700', color: isDark ? '#FFFFFF' : '#000000', marginBottom: 20 }}>
              New Plan
            </Text>

            <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#8E8E93' : '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              PLAN NAME
            </Text>
            <TextInput
              style={{
                backgroundColor: isDark ? '#2C2C2E' : '#F5F5F5',
                borderRadius: 12,
                paddingVertical: 14,
                paddingHorizontal: 16,
                fontSize: 16,
                color: isDark ? '#FFFFFF' : '#000000',
                marginBottom: 24,
              }}
              value={newPlanName}
              onChangeText={setNewPlanName}
              placeholder="e.g. Week 1 Bulk"
              placeholderTextColor={isDark ? '#8E8E93' : '#9CA3AF'}
              returnKeyType="done"
              onSubmitEditing={handleCreateNewPlan}
              autoFocus
            />

            <TouchableOpacity
              onPress={handleCreateNewPlan}
              disabled={newPlanSaving || !newPlanName.trim()}
              activeOpacity={0.8}
              style={{
                backgroundColor: '#14B8A6',
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: 'center',
                opacity: (newPlanSaving || !newPlanName.trim()) ? 0.5 : 1,
              }}
            >
              {newPlanSaving
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ fontSize: 17, fontWeight: '600', color: '#fff' }}>Save</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
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
                  { backgroundColor: isDark ? '#252740' : '#FFFFFF', transform: [{ translateY: referralSlideAnim }] },
                ]}
              >
                <TouchableOpacity activeOpacity={1} onPress={() => {}}>
                  <View style={referralStyles.handle} />
                  <Text style={[referralStyles.title, { color: isDark ? '#F1F5F9' : '#2B2D42' }]}>
                    {'🎁 Have a Referral Code?'}
                  </Text>
                  <Text style={[referralStyles.subtitle, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
                    Were you invited to Macro Goal? Enter their code and you both earn 1,000 XP!
                  </Text>
                  <TextInput
                    style={[
                      referralStyles.input,
                      {
                        backgroundColor: isDark ? '#1A1C2E' : '#F0F2F7',
                        borderColor: isDark ? '#3A3C52' : '#E5E7EB',
                        color: isDark ? '#F1F5F9' : '#2B2D42',
                      },
                    ]}
                    value={referralCode}
                    onChangeText={setReferralCode}
                    placeholder="Enter code here..."
                    placeholderTextColor={isDark ? '#A0A2B8' : '#6B7280'}
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
                      <Text style={[referralStyles.skipButtonText, { color: isDark ? '#A0A2B8' : '#6B7280' }]}>
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
  foodItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: 4,
    gap: 8,
  },
  sessionTime: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sessionLine: {
    flex: 1,
    height: 1,
  },
  foodInfo: { flex: 1 },
  foodName: { ...typography.bodyBold, marginBottom: 2 },
  foodBrand: { ...typography.caption, marginBottom: 2 },
  foodDetails: { ...typography.caption },
  foodCalories: { alignItems: 'flex-end' },
  foodCaloriesValue: { ...typography.bodyBold, fontSize: 18 },
  foodCaloriesLabel: { ...typography.caption },
  bottomSpacer: { height: 40 },
  templateSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  templateSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#D4AF37',
    textTransform: 'uppercase',
  },
  templateCard: {
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  templateCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  templateEmojiCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(212,175,55,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateEmoji: {
    fontSize: 20,
  },
  templateCardLeft: {
    flex: 1,
  },
  templateName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  templateBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  templateGoalBadge: {
    backgroundColor: 'rgba(212,175,55,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  templateGoalBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D4AF37',
  },
  templateSubtitle: {
    fontSize: 12,
  },
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
