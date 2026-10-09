
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator, ScrollView, ActionSheetIOS,
  Modal, TextInput, KeyboardAvoidingView, Animated, Dimensions,
  Pressable, Image, Platform,
} from 'react-native';
import { useRecipeFinder, RecipeResult } from '@/hooks/useRecipeFinder';
import { useRecipeLimit } from '@/hooks/useRecipeLimit';
import { ChefHat, Clock, Bookmark, BookmarkCheck, Search } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
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
import { formatFoodRowServing } from '@/utils/servingDisplay';
import { toLocalDateString } from '@/utils/dateUtils';
import { usePremium } from '@/hooks/usePremium';
import { useWidget } from '@/contexts/WidgetContext';
import { calcMacros } from '@/utils/macros';

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
  food_item_id?: string | null;
  food_name?: string | null;
  food_brand?: string | null;
  name?: string;
  brand?: string;
  is_scheduled?: boolean;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getServingDisplayText = (item: FoodItem): string => {
  return formatFoodRowServing(item.serving_description, item.quantity ?? 1, item.grams ?? undefined);
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { isPremium } = usePremium();
  const { syncWidget } = useWidget();
  const { t } = useTranslation();

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

  // ── Adaptive TDEE banner state ──
  const [adaptiveBannerDismissed, setAdaptiveBannerDismissed] = useState(false);
  const [latestTdeeEstimate, setLatestTdeeEstimate] = useState<any>(null);

  // ── Contextual insight dismiss state ──
  const [contextualInsightDismissed, setContextualInsightDismissed] = useState(false);

  // ── ¿Qué como? modal state ──
  const [queComoVisible, setQueComoVisible] = useState(false);
  const [queComoStep, setQueComoStep] = useState<1 | 2>(1);
  const [queComoType, setQueComoType] = useState<'cook' | 'store' | 'fastfood' | 'restaurant' | null>(null);

  // Segmented control
  const [activeTab, setActiveTab] = useState<'tracking' | 'planning' | 'recipes'>('tracking');
  const slideAnim = useRef(new Animated.Value(0)).current;
  const screenWidth = Dimensions.get('window').width;

  // ── Tracking state ──
  const [goal, setGoal] = useState<any>(null);
  const [meals, setMeals] = useState<MealData[]>([
    { type: 'breakfast', label: 'Breakfast', items: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0 },
    { type: 'lunch', label: 'Lunch', items: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0 },
    { type: 'dinner', label: 'Dinner', items: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0 },
    { type: 'snack', label: 'Snack', items: [], totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFats: 0 },
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
  const [isScheduling, setIsScheduling] = useState(false);

  // ── Recipes state ──
  const {
    loadDailySuggestions,
    savedRecipes,
    saveRecipe,
    unsaveRecipe,
    loadSavedRecipes,
    searchRecipes,
    searchResults: recipeFinderResults,
    searchLoading: recipeFinderLoading,
    searchError: recipeFinderError,
    hasMore: recipeFinderHasMore,
    isLoadingMore: recipeFinderLoadingMore,
    loadMore: recipeFinderLoadMore,
    browseResults,
    browseLoading,
    browseLoadingMore,
    browseHasMore,
    initBrowse,
    loadMoreBrowse,
  } = useRecipeFinder();
  const { canOpen, recordOpen } = useRecipeLimit();
  const [recipeQuery, setRecipeQuery] = useState('');
  const recipesInitialized = useRef(false);
  const [trendingRecipes, setTrendingRecipes] = useState<RecipeResult[]>([]);
  const [popularLoading, setPopularLoading] = useState(false);
  const [popularError, setPopularError] = useState<string | null>(null);
  const recipeDebounceRef2 = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      const { data: tdeeData } = await supabase
        .from('tdee_estimates')
        .select('week_start, estimated_tdee, prescribed_calories, adjustment_amount, avg_calories_eaten, avg_weight_lbs, prev_avg_weight_lbs, data_days_count, adjustment_applied')
        .eq('user_id', user.id)
        .eq('adjustment_applied', true)
        .order('week_start', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tdeeData) {
        console.log('[Home iOS] Latest TDEE estimate loaded:', tdeeData);
        setLatestTdeeEstimate(tdeeData);
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
            logged_at,
            food_name,
            food_brand,
            is_scheduled,
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
                const hasStoredMacros = item.calories != null && item.calories > 0;
                const fi = item.food_items;
                const grams = item.grams ?? 0;
                const macros = hasStoredMacros
                  ? { calories: item.calories ?? 0, protein: item.protein ?? 0, carbs: item.carbs ?? 0, fats: item.fats ?? 0, fiber: item.fiber ?? 0 }
                  : fi
                    ? (() => { const r = calcMacros(fi, grams); return { calories: r.calories, protein: r.protein, carbs: r.carbs, fats: r.fat, fiber: r.fiber }; })()
                    : { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 };
                console.log('[Home iOS] macros for item', item.id, '(stored:', hasStoredMacros, '):', macros);
                const enriched = {
                  ...item,
                  ...macros,
                  name: item.food_name ?? item.food_items?.name ?? 'Unknown Food',
                  brand: item.food_brand ?? item.food_items?.brand ?? undefined,
                  meal_type: meal.meal_type,
                  logged_at: item.logged_at ?? null,
                  is_scheduled: item.is_scheduled ?? false,
                };
                mealsByType[meal.meal_type as MealType].push(enriched);
                // Exclude scheduled (not-yet-eaten) items from daily totals
                if (!enriched.is_scheduled) {
                  totalCals += macros.calories;
                  totalP    += macros.protein;
                  totalC    += macros.carbs;
                  totalF    += macros.fats;
                  totalFib  += macros.fiber;
                }
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
          buildMeal('snack', 'Snack'),
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

  const handleTabPress = (tab: 'tracking' | 'planning' | 'recipes') => {
    console.log('[Home iOS] Segmented control pressed:', tab);
    setActiveTab(tab);
    if (tab === 'recipes') {
      initRecipesFood();
      return;
    }
    Animated.spring(slideAnim, {
      toValue: tab === 'tracking' ? 0 : -screenWidth,
      damping: 20,
      stiffness: 120,
      mass: 1,
      useNativeDriver: true,
    }).start();
  };

  // ── Recipe handlers ──
  const normalizeRecipe = useCallback((r: any): RecipeResult => ({
    id: r.id,
    name: r.name ?? r.title ?? 'Recipe',
    description: r.description ?? null,
    image_url: r.image_url ?? null,
    source_name: r.source_name ?? null,
    source_url: r.source_url ?? null,
    prep_time_minutes: r.prep_time_minutes ?? null,
    servings: r.servings ?? null,
    calories_per_serving: Number(r.calories_per_serving) || 0,
    protein_per_serving: Number(r.protein_per_serving) || 0,
    carbs_per_serving: Number(r.carbs_per_serving) || 0,
    fat_per_serving: Number(r.fat_per_serving) || 0,
    fiber_per_serving: Number(r.fiber_per_serving) || 0,
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    instructions: Array.isArray(r.instructions) ? r.instructions : [],
    reviews: Array.isArray(r.reviews) ? r.reviews : [],
    tags: Array.isArray(r.tags) ? r.tags : [],
    click_count: r.click_count ?? 0,
    is_saved: false,
  }), []);

  const loadPopularRecipesFood = useCallback(async () => {
    setPopularLoading(true);
    setPopularError(null);
    try {
      const { data, error } = await supabase.functions.invoke('popular-recipes', {
        method: 'POST',
        body: { action: 'get_popular' },
      });
      if (error) throw new Error(error.message);
      setTrendingRecipes((data?.trending ?? []).map(normalizeRecipe));
    } catch (e: unknown) {
      setPopularError(e instanceof Error ? e.message : 'Failed to load trending recipes');
    } finally {
      setPopularLoading(false);
    }
  }, [normalizeRecipe]);

  const initRecipesFood = useCallback(async () => {
    if (recipesInitialized.current) return;
    recipesInitialized.current = true;
    console.log('[Home iOS] initRecipesFood — loading saved recipes, trending, and browse feed');
    await Promise.all([loadSavedRecipes(), loadPopularRecipesFood(), initBrowse()]);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let goals = { calories: 2000, protein: 150, carbs: 200, fat: 65, remainingCalories: 2000 };
      if (user) {
        const [goalRes, mealsRes] = await Promise.all([
          supabase.from('goals').select('daily_calories, protein_g, carbs_g, fat_g').eq('user_id', user.id).eq('is_active', true).maybeSingle(),
          supabase.from('meals').select('meal_items(calories)').eq('user_id', user.id).eq('date', new Date().toISOString().split('T')[0]),
        ]);
        const g = goalRes.data;
        if (g) {
          let consumed = 0;
          (mealsRes.data || []).forEach((m: any) => {
            (m.meal_items || []).forEach((item: any) => { consumed += Number(item.calories) || 0; });
          });
          goals = {
            calories: Number(g.daily_calories) || 2000,
            protein: Number(g.protein_g) || 150,
            carbs: Number(g.carbs_g) || 200,
            fat: Number(g.fat_g) || 65,
            remainingCalories: Math.max(0, (Number(g.daily_calories) || 2000) - consumed),
          };
        }
      }
      await loadDailySuggestions(goals);
    } catch (e) {
      console.warn('[Home iOS] initRecipesFood error:', e);
    }
  }, [loadSavedRecipes, loadPopularRecipesFood, initBrowse, loadDailySuggestions]);

  const handleRecipeSearchChange = useCallback((text: string) => {
    setRecipeQuery(text);
    if (recipeDebounceRef2.current) clearTimeout(recipeDebounceRef2.current);
    if (!text.trim()) return;
    recipeDebounceRef2.current = setTimeout(() => {
      console.log('[Home iOS] Recipe search — query:', text.trim());
      searchRecipes(text.trim());
    }, 500);
  }, [searchRecipes]);

  const handleRecipeSaveFood = useCallback(async (recipe: RecipeResult) => {
    console.log('[Home iOS] Recipe save toggled — id:', recipe.id, 'saved:', recipe.is_saved);
    if (recipe.is_saved) {
      await unsaveRecipe(recipe.id);
    } else {
      await saveRecipe(recipe);
    }
  }, [saveRecipe, unsaveRecipe]);

  const handleRecipePressFood = useCallback(async (recipe: RecipeResult) => {
    console.log('[Home iOS] Recipe card pressed — id:', recipe.id, 'name:', recipe.name);
    const allowed = await canOpen();
    if (!allowed) {
      console.log('[Home iOS] Recipe daily limit reached — redirecting to subscription');
      router.push('/subscription');
      return;
    }
    await recordOpen();
    supabase.functions.invoke('popular-recipes', {
      body: { action: 'click', recipe_id: recipe.id, recipe_name: recipe.name },
    }).catch(() => {});
    const normalizeInstruction = (s: any): string => {
      if (typeof s === 'string') return s;
      if (s && typeof s === 'object') return String(s.text ?? s.description ?? s.instruction ?? s.step_text ?? JSON.stringify(s));
      return String(s ?? '');
    };
    const normalized = {
      ...recipe,
      name: recipe.name || (recipe as any).title || 'Recipe',
      image_url: recipe.image_url || null,
      tags: Array.isArray(recipe.tags) ? recipe.tags : [],
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
      instructions: Array.isArray(recipe.instructions) ? recipe.instructions.map(normalizeInstruction) : [],
      reviews: Array.isArray(recipe.reviews) ? recipe.reviews : [],
    };
    console.log('[Home iOS] Navigating to recipe detail — name:', normalized.name);
    router.push({ pathname: '/recipe-finder-detail', params: { recipe: JSON.stringify(normalized) } });
  }, [router, canOpen, recordOpen]);

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
      Alert.alert(t('common.error'), t('errors.failedToSave'));
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

  // ── Mark scheduled item as eaten ──
  const handleMarkEaten = async (itemId: string) => {
    console.log('[Home iOS] Mark as eaten pressed for item:', itemId);
    try {
      const { error } = await supabase
        .from('meal_items')
        .update({ is_scheduled: false })
        .eq('id', itemId);
      if (error) {
        console.error('[Home iOS] Error marking item as eaten:', error);
        throw error;
      }
      console.log('[Home iOS] Item marked as eaten:', itemId);
      await loadData();
    } catch (err: any) {
      console.error('[Home iOS] handleMarkEaten error:', err);
      Alert.alert('Error', 'Failed to mark item as eaten. Please try again.');
    }
  };

  // ── Schedule this week's plan into Today's Food ──
  const handleSchedulePlan = async () => {
    console.log('[Home iOS] handleSchedulePlan started');
    setIsScheduling(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error('[Home iOS] handleSchedulePlan: no user', userError);
        throw new Error('No authenticated user');
      }

      // Compute startOfWeek (same logic as renderPlanningContent)
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7) + weekOffset * 7);
      weekStart.setHours(0, 0, 0, 0);

      for (let i = 0; i < DAYS.length; i++) {
        const day = DAYS[i];
        const planId = currentWeekPlan[day];
        if (!planId) continue;

        // Compute the calendar date for this day (Mon=0 offset)
        const dayDate = new Date(weekStart);
        dayDate.setDate(weekStart.getDate() + i);
        const yyyy = dayDate.getFullYear();
        const mm = String(dayDate.getMonth() + 1).padStart(2, '0');
        const dd = String(dayDate.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        console.log('[Home iOS] Scheduling day:', day, 'date:', dateStr, 'planId:', planId);

        // Fetch meal plan items for this plan
        const { data: planItems, error: planItemsError } = await supabase
          .from('meal_plan_items')
          .select('*')
          .eq('plan_id', planId);

        if (planItemsError) {
          console.error('[Home iOS] Error fetching meal_plan_items for plan:', planId, planItemsError);
          continue;
        }
        if (!planItems || planItems.length === 0) {
          console.log('[Home iOS] No items in plan:', planId, 'for day:', day);
          continue;
        }

        // Group by meal_type
        const byMealType: Record<string, typeof planItems> = {};
        planItems.forEach((pi: any) => {
          const mt = pi.meal_type || 'snack';
          if (!byMealType[mt]) byMealType[mt] = [];
          byMealType[mt].push(pi);
        });

        for (const mealType of Object.keys(byMealType)) {
          // Upsert meal row
          let mealId: string | null = null;
          const { data: upsertData, error: upsertError } = await supabase
            .from('meals')
            .upsert(
              { user_id: user.id, date: dateStr, meal_type: mealType },
              { onConflict: 'user_id,date,meal_type' }
            )
            .select('id')
            .maybeSingle();

          if (upsertError || !upsertData) {
            console.warn('[Home iOS] Upsert meals failed, falling back to select:', upsertError);
            // Fallback: select existing
            const { data: existingMeal } = await supabase
              .from('meals')
              .select('id')
              .eq('user_id', user.id)
              .eq('date', dateStr)
              .eq('meal_type', mealType)
              .maybeSingle();
            mealId = existingMeal?.id ?? null;
          } else {
            mealId = upsertData.id;
          }

          if (!mealId) {
            console.error('[Home iOS] Could not get meal_id for', dateStr, mealType);
            continue;
          }

          // Insert items, skipping duplicates by food_name
          const { data: existingItems } = await supabase
            .from('meal_items')
            .select('food_name')
            .eq('meal_id', mealId)
            .eq('is_scheduled', true);

          const existingNames = new Set((existingItems || []).map((e: any) => e.food_name?.toLowerCase()));

          const itemsToInsert = byMealType[mealType]
            .filter((pi: any) => !existingNames.has(pi.food_name?.toLowerCase()))
            .map((pi: any) => ({
              meal_id: mealId,
              food_name: pi.food_name,
              quantity: pi.quantity ?? 1,
              grams: pi.grams ?? null,
              serving_unit: pi.serving_unit ?? null,
              serving_description: pi.serving_description ?? null,
              calories: pi.calories ?? 0,
              protein: pi.protein ?? 0,
              carbs: pi.carbs ?? 0,
              fats: pi.fats ?? 0,
              fiber: pi.fiber ?? 0,
              food_item_id: pi.food_item_id ?? null,
              food_id: pi.food_id ?? null,
              is_scheduled: true,
            }));

          if (itemsToInsert.length > 0) {
            console.log('[Home iOS] Inserting', itemsToInsert.length, 'scheduled items for', dateStr, mealType);
            const { error: insertError } = await supabase
              .from('meal_items')
              .insert(itemsToInsert);
            if (insertError) {
              console.error('[Home iOS] Error inserting scheduled meal_items:', insertError);
              throw new Error(`Failed to insert meal items for ${dateStr} ${mealType}: ${insertError.message}`);
            }
          } else {
            console.log('[Home iOS] All items already scheduled for', dateStr, mealType);
          }
        }
      }

      console.log('[Home iOS] handleSchedulePlan complete, refreshing data');
      await loadData();
      Alert.alert(t('home.scheduleDoneTitle'), t('home.scheduleDoneMessage'));
    } catch (err: any) {
      console.error('[Home iOS] handleSchedulePlan error:', err);
      Alert.alert('Error', 'Failed to schedule plan. Please try again.');
    } finally {
      setIsScheduling(false);
    }
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
  const todayLabel = isToday() ? t('common.today') : selectedDate.toLocaleDateString('en-US', { weekday: 'short' });
  const dateDisplay = selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // ── Render helpers ──

  if (!navReady) return null;

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>{t('common.loading')}</Text>
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
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
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
            <View style={[styles.foodInfo, { flex: 1 }]}>
              {/* Row 1: name (+ calories if NO brand) */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text, flex: 1 }]} numberOfLines={2}>
                  {foodName}
                </Text>
                {!foodBrand && (
                  <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                    <Text style={[styles.foodCaloriesValue, { color: isDark ? colors.textDark : colors.text }]}>{Math.round(item.calories)}</Text>
                    <Text style={[styles.foodCaloriesLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>kcal</Text>
                  </View>
                )}
              </View>
              {/* Row 2: brand (+ calories if HAS brand) */}
              {foodBrand && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[styles.foodBrand, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                    {foodBrand}
                  </Text>
                  <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                    <Text style={[styles.foodCaloriesValue, { color: isDark ? colors.textDark : colors.text }]}>{Math.round(item.calories)}</Text>
                    <Text style={[styles.foodCaloriesLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>kcal</Text>
                  </View>
                </View>
              )}
              {/* Row 3: per serving + macros */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 12, color: isDark ? colors.textSecondaryDark : colors.textSecondary }}>
                  {getServingDisplayText(item)}
                </Text>
                <Text style={{ fontSize: 12, color: isDark ? colors.textSecondaryDark : colors.textSecondary }}>•</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.protein }}>P: {Math.round(item.protein)}g</Text>
                <Text style={{ fontSize: 12, color: isDark ? colors.textSecondaryDark : colors.textSecondary }}>•</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.carbs }}>C: {Math.round(item.carbs)}g</Text>
                <Text style={{ fontSize: 12, color: isDark ? colors.textSecondaryDark : colors.textSecondary }}>•</Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.fats }}>F: {Math.round(item.fats)}g</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      </SwipeToDeleteRow>
    );
  };

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
    const itemCountLabel = itemCount === 1 ? t('home.item') : t('home.items');
    const sessions = groupIntoSessions(allFoodItems);

    const lastUpdate = goal?.last_adaptive_update;
    const showAdaptiveBanner = (() => {
      if (adaptiveBannerDismissed || !lastUpdate) return false;
      try {
        const updateDate = new Date(lastUpdate + 'T00:00:00');
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const diffMs = now.getTime() - updateDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        return diffDays >= 0 && diffDays <= 2;
      } catch {
        return false;
      }
    })();
    const adaptiveCalories = goal?.daily_calories ? Math.round(Number(goal.daily_calories)) : null;

    const adjustmentAmount = latestTdeeEstimate?.adjustment_amount ? Math.round(Number(latestTdeeEstimate.adjustment_amount)) : null;
    const adjustmentSign = adjustmentAmount && adjustmentAmount > 0 ? '+' : '';
    const avgCalsEaten = latestTdeeEstimate?.avg_calories_eaten ? Math.round(Number(latestTdeeEstimate.avg_calories_eaten)) : null;
    const prevWeightLbs = latestTdeeEstimate?.prev_avg_weight_lbs ? Number(latestTdeeEstimate.prev_avg_weight_lbs) : null;
    const currWeightLbs = latestTdeeEstimate?.avg_weight_lbs ? Number(latestTdeeEstimate.avg_weight_lbs) : null;
    const weightLost = (prevWeightLbs && currWeightLbs) ? Math.round((prevWeightLbs - currWeightLbs) * 10) / 10 : null;

    const bannerSubtitle = adaptiveCalories !== null
      ? (adjustmentAmount ? `${adaptiveCalories} kcal/day  •  ${adjustmentSign}${adjustmentAmount} kcal` : `${adaptiveCalories} kcal/day`)
      : null;

    const bannerWhyLine = avgCalsEaten !== null
      ? (weightLost !== null && weightLost > 0
        ? `You ate ~${avgCalsEaten} kcal/day and lost ${weightLost} lbs this week`
        : weightLost !== null && weightLost < 0
          ? `You ate ~${avgCalsEaten} kcal/day and gained ${Math.abs(weightLost)} lbs this week`
          : `You ate ~${avgCalsEaten} kcal/day this week`)
      : null;

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
              <MacroSummaryRowCompact label={t('common.protein')} eaten={Math.round(totalMacros.protein)} goal={goal?.protein_g || 150} color={colors.protein} isDark={isDark} />
              <MacroSummaryRowCompact label={t('common.carbs')} eaten={Math.round(totalMacros.carbs)} goal={goal?.carbs_g || 200} color={colors.carbs} isDark={isDark} />
              <MacroSummaryRowCompact label={t('common.fats')} eaten={Math.round(totalMacros.fats)} goal={goal?.fats_g || 65} color={colors.fats} isDark={isDark} />
              <MacroSummaryRowCompact label={t('common.fiber')} eaten={Math.round(totalMacros.fiber)} goal={goal?.fiber_g || 30} color={colors.fiber} isDark={isDark} />
            </View>
          </View>
        </View>

        {/* ── Contextual Coach Insight ── */}
        {(() => {
          if (contextualInsightDismissed) return null;
          const hour = new Date().getHours();
          const calGoal = goal?.daily_calories || 2000;
          const proteinGoal = goal?.protein_g || 150;
          const calRemaining = calGoal - totalCalories;
          const proteinRemaining = proteinGoal - totalMacros.protein;

          let insight: { text: string; type: 'warning' | 'success' | 'tip' | 'motivation' } | null = null;

          if (hour >= 19 && totalCalories < calGoal * 0.4) {
            insight = { text: `It's evening and you've only logged ${totalCalories} kcal. You need ${Math.round(calRemaining)} more — don't skip dinner.`, type: 'warning' };
          } else if (totalMacros.protein >= proteinGoal * 0.95 && calRemaining > 200) {
            insight = { text: `Protein goal hit ✓ You have ${Math.round(calRemaining)} kcal left — use them freely.`, type: 'success' };
          } else if (totalCalories > calGoal * 1.05) {
            insight = { text: `You're ${Math.round(totalCalories - calGoal)} kcal over your goal today. Keep protein high for the rest of the day.`, type: 'warning' };
          } else if (hour >= 12 && hour <= 14 && totalCalories < calGoal * 0.2) {
            insight = { text: `It's lunchtime and you haven't logged much yet. Don't forget to eat — skipping meals makes cravings worse later.`, type: 'tip' };
          } else if (hour >= 14 && totalMacros.protein < proteinGoal * 0.3) {
            insight = { text: `Your protein is low for this time of day (${Math.round(totalMacros.protein)}g of ${proteinGoal}g). Prioritize protein in your next meal.`, type: 'tip' };
          }

          if (!insight) return null;

          const insightBg = insight.type === 'warning'
            ? (isDark ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.08)')
            : insight.type === 'success'
              ? (isDark ? colors.primary + '18' : colors.primary + '12')
              : (isDark ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.08)');
          const insightBorder = insight.type === 'warning'
            ? '#F59E0B'
            : insight.type === 'success'
              ? colors.primary
              : '#3B82F6';
          const insightIcon = insight.type === 'warning' ? '⚡' : insight.type === 'success' ? '✅' : '💡';

          return (
            <View style={[styles.contextualInsightCard, { backgroundColor: insightBg, borderLeftColor: insightBorder }]}>
              <Text style={styles.contextualInsightIcon}>{insightIcon}</Text>
              <Text style={[styles.contextualInsightText, { color: isDark ? colors.textDark : colors.text }]}>{insight.text}</Text>
              <TouchableOpacity
                onPress={() => {
                  console.log('[Home iOS] Contextual insight dismissed, type:', insight!.type);
                  setContextualInsightDismissed(true);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.contextualInsightClose}
              >
                <Text style={{ color: isDark ? colors.textSecondaryDark : colors.textSecondary, fontSize: 16 }}>×</Text>
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* ── ¿Qué como? Button ── */}
        <TouchableOpacity
          style={[styles.queComoButton, { backgroundColor: cardBg }]}
          activeOpacity={0.75}
          onPress={() => {
            console.log('[Home iOS] ¿Qué como? button pressed');
            setQueComoStep(1);
            setQueComoType(null);
            setQueComoVisible(true);
          }}
        >
          <View style={styles.queComoButtonLeft}>
            <View style={[styles.queComoIconCircle, { backgroundColor: colors.primary + '18' }]}>
              <Text style={{ fontSize: 16 }}>🤖</Text>
            </View>
            <Text style={[styles.queComoButtonText, { color: isDark ? colors.textDark : colors.text }]}>¿Qué como?</Text>
          </View>
          <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.primary} />
        </TouchableOpacity>

        {/* ── ¿Qué como? Modal ── */}
        <Modal
          visible={queComoVisible}
          transparent
          animationType="slide"
          onRequestClose={() => {
            console.log('[Home iOS] ¿Qué como? modal closed via back button');
            setQueComoVisible(false);
          }}
        >
          <Pressable style={styles.queComoOverlay} onPress={() => {
            console.log('[Home iOS] ¿Qué como? modal dismissed by overlay tap');
            setQueComoVisible(false);
          }}>
            <Pressable style={[styles.queComoSheet, { backgroundColor: isDark ? colors.cardDark : '#FFFFFF' }]} onPress={() => {}}>
              {/* Handle */}
              <View style={[styles.queComoHandle, { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }]} />

              {queComoStep === 1 ? (
                <>
                  <Text style={[styles.queComoSheetTitle, { color: isDark ? colors.textDark : colors.text }]}>
                    ¿Cómo quieres conseguir tu comida?
                  </Text>
                  <View style={styles.queComoGrid}>
                    {([
                      { key: 'cook', emoji: '🍳', label: 'Cocinar' },
                      { key: 'store', emoji: '🏪', label: 'Tienda' },
                      { key: 'fastfood', emoji: '🍔', label: 'Fast Food' },
                      { key: 'restaurant', emoji: '🍽️', label: 'Restaurante' },
                    ] as const).map((opt) => (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.queComoOption, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: colors.primary + '30' }]}
                        activeOpacity={0.7}
                        onPress={() => {
                          console.log('[Home iOS] ¿Qué como? type selected:', opt.key);
                          setQueComoType(opt.key);
                          setQueComoStep(2);
                        }}
                      >
                        <Text style={styles.queComoOptionEmoji}>{opt.emoji}</Text>
                        <Text style={[styles.queComoOptionLabel, { color: isDark ? colors.textDark : colors.text }]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.queComoBackRow}>
                    <TouchableOpacity
                      onPress={() => {
                        console.log('[Home iOS] ¿Qué como? back to step 1');
                        setQueComoStep(1);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.queComoBackBtn}
                    >
                      <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron-left" size={16} color={colors.primary} />
                      <Text style={[styles.queComoBackLabel, { color: colors.primary }]}>
                        {queComoType === 'cook' ? 'Cocinar' : queComoType === 'store' ? 'Tienda' : queComoType === 'fastfood' ? 'Fast Food' : 'Restaurante'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.queComoSheetTitle, { color: isDark ? colors.textDark : colors.text }]}>
                    ¿Qué se te antoja?
                  </Text>
                  <View style={styles.queComoGrid}>
                    {([
                      { key: 'sweet', emoji: '🍫', label: 'Dulce' },
                      { key: 'savory', emoji: '🧂', label: 'Salado' },
                      { key: 'protein', emoji: '💪', label: 'Proteína' },
                      { key: 'quick', emoji: '⚡', label: 'Rápido' },
                    ] as const).map((opt) => (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.queComoOption, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: colors.primary + '30' }]}
                        activeOpacity={0.7}
                        onPress={() => {
                          const typeLabels: Record<string, string> = {
                            cook: 'cooking at home',
                            store: 'buying from a store or supermarket',
                            fastfood: 'getting fast food',
                            restaurant: 'going to a restaurant',
                          };
                          const cravingLabels: Record<string, string> = {
                            sweet: 'something sweet',
                            savory: 'something savory',
                            protein: 'something high in protein',
                            quick: 'something quick and easy',
                            surprise: 'whatever fits best',
                          };
                          const calRemaining = (goal?.daily_calories || 2000) - totalCalories;
                          const proteinRemaining = (goal?.protein_g || 150) - totalMacros.protein;
                          const message = `I want ${cravingLabels[opt.key]} and I'm planning on ${typeLabels[queComoType!]}. I have ${Math.round(calRemaining)} calories and ${Math.round(proteinRemaining)}g of protein left for today. Give me 3 specific options that fit.`;
                          console.log('[Home iOS] ¿Qué como? craving selected:', opt.key, '| type:', queComoType, '| message:', message);
                          setQueComoVisible(false);
                          router.push({ pathname: '/(tabs)/coach', params: { prefill_message: message } });
                        }}
                      >
                        <Text style={styles.queComoOptionEmoji}>{opt.emoji}</Text>
                        <Text style={[styles.queComoOptionLabel, { color: isDark ? colors.textDark : colors.text }]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                    {/* Surprise option — full width */}
                    <TouchableOpacity
                      style={[styles.queComoOptionWide, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderColor: colors.primary + '30' }]}
                      activeOpacity={0.7}
                      onPress={() => {
                        const typeLabels: Record<string, string> = {
                          cook: 'cooking at home',
                          store: 'buying from a store or supermarket',
                          fastfood: 'getting fast food',
                          restaurant: 'going to a restaurant',
                        };
                        const calRemaining = (goal?.daily_calories || 2000) - totalCalories;
                        const proteinRemaining = (goal?.protein_g || 150) - totalMacros.protein;
                        const message = `I want whatever fits best and I'm planning on ${typeLabels[queComoType!]}. I have ${Math.round(calRemaining)} calories and ${Math.round(proteinRemaining)}g of protein left for today. Give me 3 specific options that fit.`;
                        console.log('[Home iOS] ¿Qué como? surprise selected | type:', queComoType, '| message:', message);
                        setQueComoVisible(false);
                        router.push({ pathname: '/(tabs)/coach', params: { prefill_message: message } });
                      }}
                    >
                      <Text style={styles.queComoOptionEmoji}>🎲</Text>
                      <Text style={[styles.queComoOptionLabel, { color: isDark ? colors.textDark : colors.text }]}>Sorpréndeme</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </Pressable>
          </Pressable>
        </Modal>

        {/* ── Adaptive TDEE Banner ── */}
        {showAdaptiveBanner && adaptiveCalories !== null && (
          <View style={[styles.adaptiveBanner, { backgroundColor: isDark ? '#0D2420' : '#F0FAF5', borderColor: colors.primary + '30' }]}>
            {/* Top row: icon + title + dismiss */}
            <View style={styles.adaptiveBannerTopRow}>
              <View style={styles.adaptiveBannerTitleRow}>
                <View style={[styles.adaptiveBannerIconCircle, { backgroundColor: colors.primary + '20' }]}>
                  <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto-awesome" size={16} color={colors.primary} />
                </View>
                <Text style={[styles.adaptiveBannerTitle, { color: isDark ? colors.textDark : colors.text }]}>
                  {t('adaptiveTdee.bannerTitle')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  console.log('[Home iOS] Adaptive TDEE banner dismissed');
                  setAdaptiveBannerDismissed(true);
                }}
                activeOpacity={0.7}
                style={styles.adaptiveBannerClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={14} color={isDark ? colors.textSecondaryDark : colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Subtitle: new calories + adjustment */}
            {bannerSubtitle !== null && (
              <Text style={[styles.adaptiveBannerSubtitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {bannerSubtitle}
              </Text>
            )}

            {/* Why line */}
            {bannerWhyLine !== null && (
              <Text style={[styles.adaptiveBannerWhyLine, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {bannerWhyLine}
              </Text>
            )}

            {/* See details link */}
            <View style={styles.adaptiveBannerFooter}>
              <TouchableOpacity
                onPress={() => {
                  console.log('[Home iOS] Adaptive TDEE banner "See details" pressed');
                  router.push('/adaptive-tdee-history');
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.adaptiveBannerSeeWhyText, { color: colors.primary }]}>
                  {'See details →'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Today's Food — session-grouped list */}
        <View style={[styles.mealCard, { backgroundColor: cardBg }]}>
          {/* Header */}
          <View style={styles.mealHeader}>
            <View style={styles.mealHeaderLeft}>
              <Text style={[styles.mealTitle, { color: textPrimary }]}>{t('home.todaysFood')}</Text>
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
              <Text style={[styles.emptyMealText, { color: textSec }]}>{t('home.tapToAddFood')}</Text>
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
                      const foodName = item.name ?? item.food_name ?? item.food_items?.name ?? (item as any).foods?.name ?? 'Unknown Food';
                      const foodBrand = item.brand ?? item.food_brand ?? item.food_items?.brand ?? undefined;
                      const isScheduledItem = item.is_scheduled === true;
                      const contentOpacity = isScheduledItem ? 0.5 : 1;

                      if (isScheduledItem) {
                        // Scheduled (not-yet-eaten) item — checkmark on left, muted/italic style
                        return (
                          <View key={item.id}>
                            <View style={[styles.foodItem, { flexDirection: 'row', alignItems: 'center' }]}>
                              <TouchableOpacity
                                onPress={() => {
                                  console.log('[Home iOS] Mark as eaten tapped for item:', item.id, foodName);
                                  handleMarkEaten(item.id);
                                }}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={{ marginRight: 10 }}
                              >
                                <Text style={{ fontSize: 22, color: '#14B8A6', lineHeight: 26 }}>{'○'}</Text>
                              </TouchableOpacity>
                              <View style={[styles.foodInfo, { opacity: contentOpacity, flex: 1 }]}>
                                <Text style={[styles.foodName, { color: textPrimary, fontStyle: 'italic' }]}>
                                  {foodName}
                                </Text>
                                {foodBrand && (
                                  <Text style={[styles.foodBrand, { color: textSec, fontStyle: 'italic' }]}>
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
                              <View style={[styles.foodCalories, { opacity: contentOpacity }]}>
                                <Text style={[styles.foodCaloriesValue, { color: textSec }]}>
                                  {calsRounded}
                                </Text>
                                <Text style={[styles.foodCaloriesLabel, { color: textSec }]}>
                                  kcal
                                </Text>
                              </View>
                            </View>
                            {!isLastInSession && <View style={[styles.itemSeparator, { backgroundColor: dividerColor }]} />}
                          </View>
                        );
                      }

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
      ? t('home.thisWeek')
      : weekOffset === 1
      ? t('home.nextWeek')
      : weekOffset === -1
      ? t('home.lastWeek')
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

          {/* Goals vs Plan comparison */}
          <View style={{ borderRadius: 12, overflow: 'hidden', marginTop: 4 }}>
            {/* Goal row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, flexWrap: 'nowrap' }}>
              <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '500', color: textSecondary, width: 56, flexShrink: 0 }}>{t('home.goal')}</Text>
              <View style={{ backgroundColor: '#14B8A622', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#14B8A6' }}>{goal?.daily_calories || 2000}<Text style={{ fontSize: 11, fontWeight: '600' }}> kcal</Text></Text>
              </View>
              <View style={{ backgroundColor: '#3B82F622', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#3B82F6' }}>{goal?.protein_g || 150}<Text style={{ fontSize: 11, fontWeight: '600' }}> P</Text></Text>
              </View>
              <View style={{ backgroundColor: '#F59E0B22', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#F59E0B' }}>{goal?.carbs_g || 200}<Text style={{ fontSize: 11, fontWeight: '600' }}> C</Text></Text>
              </View>
              <View style={{ backgroundColor: '#EF444422', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>{goal?.fats_g || 65}<Text style={{ fontSize: 11, fontWeight: '600' }}> F</Text></Text>
              </View>
            </View>

            {/* Thin divider */}
            <View style={{ height: 1, backgroundColor: isDark ? '#2C2C2E' : '#E5E7EB' }} />

            {/* Wk Avg row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, flexWrap: 'nowrap' }}>
              <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '500', color: textSecondary, width: 56, flexShrink: 0 }}>{t('home.wkAvg')}</Text>
              {avgMacros == null ? (
                <Text style={{ fontSize: 13, color: textSecondary }}>{t('home.noPlansAssigned')}</Text>
              ) : (
                <>
                  <View style={{ backgroundColor: '#14B8A622', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#14B8A6' }}>{avgMacros.calories}<Text style={{ fontSize: 11, fontWeight: '600' }}> kcal</Text></Text>
                  </View>
                  <View style={{ backgroundColor: '#3B82F622', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#3B82F6' }}>{avgMacros.protein}<Text style={{ fontSize: 11, fontWeight: '600' }}> P</Text></Text>
                  </View>
                  <View style={{ backgroundColor: '#F59E0B22', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#F59E0B' }}>{avgMacros.carbs}<Text style={{ fontSize: 11, fontWeight: '600' }}> C</Text></Text>
                  </View>
                  <View style={{ backgroundColor: '#EF444422', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>{avgMacros.fats}<Text style={{ fontSize: 11, fontWeight: '600' }}> F</Text></Text>
                  </View>
                </>
              )}
            </View>
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
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>{t('home.groceryList')}</Text>
            </TouchableOpacity>
          )}

          {/* Schedule This Plan button */}
          {assignedPlanIds.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                console.log('[Home iOS] Schedule This Plan button pressed');
                Alert.alert(
                  t('home.schedulePlanTitle'),
                  t('home.schedulePlanMessage'),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('home.schedule'), onPress: handleSchedulePlan },
                  ]
                );
              }}
              activeOpacity={0.8}
              disabled={isScheduling}
              style={{
                marginTop: 8,
                backgroundColor: 'transparent',
                borderRadius: 10,
                paddingVertical: 11,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                borderWidth: 1.5,
                borderColor: '#14B8A6',
                opacity: isScheduling ? 0.6 : 1,
              }}
            >
              {isScheduling ? (
                <ActivityIndicator size="small" color="#14B8A6" />
              ) : (
                <IconSymbol ios_icon_name="calendar" android_material_icon_name="calendar_today" size={16} color={colors.primary} />
              )}
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#14B8A6' }}>{t('home.scheduleThisPlan')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Available Plans (templates) ── */}
        {templatePlans.length > 0 && (
          <View>
            <View style={styles.templateSectionHeader}>
              <Text style={styles.templateSectionTitle}>{t('home.availablePlans')}</Text>
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

        {/* My Plans section */}
        <Text style={{ fontSize: 13, fontWeight: '700', color: textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 }}>{t('home.myPlans')}</Text>
        {plans.length === 0 ? (
          <View style={{ backgroundColor: cardBg, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: textPrimary, marginBottom: 8 }}>{t('home.noMealPlansYet')}</Text>
            <Text style={{ fontSize: 14, color: textSecondary, textAlign: 'center' }}>{t('home.createFirstPlan')}</Text>
          </View>
        ) : (
          plans.map((plan, idx) => {
            const dotColor = PLAN_COLORS[idx % PLAN_COLORS.length];
            return (
              <SwipeToDeleteRow
                key={plan.id}
                onDelete={() => {
                  console.log('[Home iOS] Delete plan swiped, plan:', plan.id);
                  Alert.alert(t('home.deletePlan'), t('home.deletePlanConfirm'), [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('common.delete'), style: 'destructive', onPress: async () => {
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
                          Alert.alert(t('common.error'), t('errors.failedToDelete'));
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
          <IconSymbol ios_icon_name="sparkles" android_material_icon_name="auto-awesome" size={20} color="#14B8A6" />
          <Text style={{ color: '#14B8A6', fontSize: 16, fontWeight: '600' }}>{t('home.generateWithAI')}</Text>
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
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{t('home.createNewPlan')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderRecipesContent = () => {
    const isSearchActive = recipeQuery.trim().length > 0;
    const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
    const cardBg = isDark ? colors.cardDark : '#FFFFFF';
    const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;

    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[recipeTabStyles.searchBar, { backgroundColor: cardBg, borderColor }]}>
          <Search size={18} color={subColor} />
          <TextInput
            style={[recipeTabStyles.searchInput, { color: isDark ? colors.textDark : colors.text }]}
            placeholder="Search recipes..."
            placeholderTextColor={subColor}
            value={recipeQuery}
            onChangeText={handleRecipeSearchChange}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {recipeFinderLoading && <ActivityIndicator size="small" color={colors.primary} />}
          {recipeQuery.length > 0 && !recipeFinderLoading && (
            <Pressable onPress={() => { setRecipeQuery(''); if (recipeDebounceRef2.current) clearTimeout(recipeDebounceRef2.current); }}>
              <Text style={{ color: subColor, fontSize: 18, lineHeight: 20 }}>×</Text>
            </Pressable>
          )}
        </View>

        {isSearchActive ? (
          recipeFinderLoading ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 120 }}>
              {[0, 1, 2].map((i) => <RecipeCardSkeleton key={i} isDark={isDark} />)}
            </ScrollView>
          ) : recipeFinderError ? (
            <View style={recipeTabStyles.emptyState}>
              <Text style={[recipeTabStyles.emptyTitle, { color: isDark ? colors.textDark : colors.text }]}>Search failed</Text>
              <Text style={[recipeTabStyles.emptySubtitle, { color: subColor }]}>{recipeFinderError}</Text>
            </View>
          ) : (
            <FlatList
              data={recipeFinderResults}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={{ marginBottom: spacing.sm }}>
                  <RecipeCardItem recipe={item} isDark={isDark} onPress={() => handleRecipePressFood(item)} onSave={() => handleRecipeSaveFood(item)} />
                </View>
              )}
              contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 120 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onEndReached={() => { if (recipeFinderHasMore && !recipeFinderLoadingMore) recipeFinderLoadMore(); }}
              onEndReachedThreshold={0.3}
              ListEmptyComponent={
                <View style={recipeTabStyles.emptyState}>
                  <Text style={[recipeTabStyles.emptyTitle, { color: isDark ? colors.textDark : colors.text }]}>No recipes found</Text>
                  <Text style={[recipeTabStyles.emptySubtitle, { color: subColor }]}>Try a different search term</Text>
                </View>
              }
              ListFooterComponent={
                recipeFinderLoadingMore ? (
                  <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
                ) : !recipeFinderHasMore && recipeFinderResults.length > 0 ? (
                  <Text style={{ textAlign: 'center', color: subColor, fontSize: 13, marginVertical: spacing.md }}>No more recipes</Text>
                ) : null
              }
            />
          )
        ) : (
          <FlatList
            data={browseResults}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 120 }}
            onEndReached={() => { if (browseHasMore && !browseLoadingMore) loadMoreBrowse(); }}
            onEndReachedThreshold={0.5}
            ListHeaderComponent={
              <>
                <View style={[recipeTabStyles.sectionHeader, { marginTop: spacing.sm }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <IconSymbol ios_icon_name="heart.fill" android_material_icon_name="favorite" size={18} color="#EF4444" />
                    <Text style={[recipeTabStyles.sectionTitle, { color: isDark ? colors.textDark : colors.text, fontSize: 18 }]}>Saved Recipes</Text>
                  </View>
                </View>
                {savedRecipes.length === 0 ? (
                  <View style={[recipeTabStyles.emptyHorizontal, { backgroundColor: cardBg, borderColor, marginHorizontal: spacing.md }]}>
                    <Bookmark size={24} color={subColor} />
                    <Text style={[recipeTabStyles.emptyHorizontalText, { color: subColor }]}>Save recipes you love to find them here</Text>
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={recipeTabStyles.horizontalList}>
                    {savedRecipes.map((recipe) => (
                      <RecipeCardItem key={recipe.id} recipe={recipe} isDark={isDark} horizontal onPress={() => handleRecipePressFood(recipe)} onSave={() => handleRecipeSaveFood(recipe)} />
                    ))}
                  </ScrollView>
                )}
                <View style={[recipeTabStyles.sectionHeader, { marginTop: spacing.lg }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <IconSymbol ios_icon_name="flame.fill" android_material_icon_name="local_fire_department" size={18} color={colors.primary} />
                    <Text style={[recipeTabStyles.sectionTitle, { color: isDark ? colors.textDark : colors.text, fontSize: 18 }]}>Trending Now</Text>
                  </View>
                  <Text style={[recipeTabStyles.sectionSubtitle, { color: subColor }]}>Most clicked in the last 48h</Text>
                </View>
                {popularLoading ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={recipeTabStyles.horizontalList}>
                    {[0, 1, 2, 3].map((i) => <RecipeCardSkeleton key={i} isDark={isDark} horizontal />)}
                  </ScrollView>
                ) : trendingRecipes.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={recipeTabStyles.horizontalList}>
                    {trendingRecipes.map((recipe) => (
                      <RecipeCardItem key={recipe.id} recipe={recipe} isDark={isDark} horizontal onPress={() => handleRecipePressFood(recipe)} onSave={() => handleRecipeSaveFood(recipe)} />
                    ))}
                  </ScrollView>
                ) : null}
                <View style={[recipeTabStyles.sectionHeader, { marginTop: spacing.md }]}>
                  <Text style={[recipeTabStyles.sectionTitle, { color: isDark ? colors.textDark : colors.text, fontSize: 18 }]}>✨ Discover</Text>
                  <Text style={[recipeTabStyles.sectionSubtitle, { color: subColor }]}>Endless fitness recipes, just for you</Text>
                </View>
                {browseLoading && (
                  <View style={{ paddingHorizontal: spacing.md }}>
                    {[0, 1, 2].map((i) => <RecipeCardSkeleton key={i} isDark={isDark} />)}
                  </View>
                )}
              </>
            }
            renderItem={({ item }) => (
              <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
                <RecipeCardItem recipe={item} isDark={isDark} onPress={() => handleRecipePressFood(item)} onSave={() => handleRecipeSaveFood(item)} />
              </View>
            )}
            ListFooterComponent={
              browseLoadingMore ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
              ) : !browseHasMore && browseResults.length > 0 ? (
                <Text style={{ textAlign: 'center', color: subColor, fontSize: 13, marginVertical: spacing.md }}>No more recipes</Text>
              ) : null
            }
          />
        )}
      </KeyboardAvoidingView>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
      {/* ── Fixed Food Header ── */}
      <View style={[styles.foodHeader, { borderBottomColor: isDark ? colors.borderDark : colors.border, backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
        <Text style={[styles.foodHeaderTitle, { color: isDark ? colors.textDark : colors.text }]}>Food</Text>
        <TouchableOpacity
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => {
            console.log('[Home iOS] Bug report icon pressed');
            router.push('/bug-report?tab_source=food');
          }}
        >
          <IconSymbol
            ios_icon_name="ladybug"
            android_material_icon_name="bug_report"
            size={22}
            color={isDark ? colors.textSecondaryDark : colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      {/* Top header: always-visible segmented control */}
      <View style={[styles.segmentedControlWrapper, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
        <View style={[styles.segmentedControl, { backgroundColor: isDark ? colors.cardDark : '#E8EAF0' }]}>
          <TouchableOpacity
            style={[styles.segmentButton, activeTab === 'tracking' && { backgroundColor: colors.primary }]}
            onPress={() => handleTabPress('tracking')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentButtonText, { color: activeTab === 'tracking' ? '#fff' : (isDark ? colors.textSecondaryDark : colors.textSecondary) }]}>
              {t('home.tracking')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentButton, activeTab === 'planning' && { backgroundColor: colors.primary }]}
            onPress={() => handleTabPress('planning')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentButtonText, { color: activeTab === 'planning' ? '#fff' : (isDark ? colors.textSecondaryDark : colors.textSecondary) }]}>
              {t('home.planning')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentButton, activeTab === 'recipes' && { backgroundColor: colors.primary }]}
            onPress={() => handleTabPress('recipes')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentButtonText, { color: activeTab === 'recipes' ? '#fff' : (isDark ? colors.textSecondaryDark : colors.textSecondary) }]}>
              Recipes
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
        {activeTab === 'recipes' ? (
          renderRecipesContent()
        ) : (
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
        )}
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
              {t('home.newPlan')}
            </Text>

            <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? '#8E8E93' : '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              {t('home.planName')}
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
              placeholder={t('home.planNamePlaceholder')}
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
                : <Text style={{ fontSize: 17, fontWeight: '600', color: '#fff' }}>{t('common.save')}</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>


    </SafeAreaView>
  );
}

// ─── Recipe helper components ─────────────────────────────────────────────────

const RECIPE_TAG_COLORS: Record<string, string> = {
  'high-protein': '#10B981',
  'low-carb': '#14B8A6',
  'low-calorie': '#8B5CF6',
  'quick': '#F59E0B',
  'vegetarian': '#10B981',
  'vegan': '#059669',
  'keto': '#F59E0B',
  'high-fiber': '#6366F1',
  'meal-prep': '#EC4899',
};

function RecipeCardSkeleton({ isDark, horizontal }: { isDark: boolean; horizontal?: boolean }) {
  const opacity = React.useRef(new Animated.Value(0.3)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const shimmer = isDark ? '#3A3C52' : '#E5E7EB';
  const bg = isDark ? colors.cardDark : '#FFFFFF';
  return (
    <Animated.View style={[recipeTabStyles.recipeCard, { backgroundColor: bg, opacity, width: horizontal ? 220 : undefined }]}>
      <View style={[recipeTabStyles.recipeCardImage, { backgroundColor: shimmer }]} />
      <View style={{ padding: 10, gap: 6 }}>
        <View style={{ height: 14, borderRadius: 4, backgroundColor: shimmer }} />
        <View style={{ height: 10, borderRadius: 4, backgroundColor: shimmer, width: '70%' }} />
      </View>
    </Animated.View>
  );
}

function RecipeCardItem({
  recipe,
  isDark,
  horizontal,
  onPress,
  onSave,
}: {
  recipe: RecipeResult;
  isDark: boolean;
  horizontal?: boolean;
  onPress: () => void;
  onSave: () => void;
}) {
  const subColor = isDark ? colors.textSecondaryDark : colors.textSecondary;
  const textColor = isDark ? colors.textDark : colors.text;
  const cardBg = isDark ? colors.cardDark : '#FFFFFF';
  const borderColor = isDark ? colors.cardBorderDark : colors.cardBorder;
  const firstTag = recipe.tags[0] || null;
  const tagColor = firstTag ? (RECIPE_TAG_COLORS[firstTag] || colors.primary) : null;
  const prepText = recipe.prep_time_minutes != null ? `${recipe.prep_time_minutes} min` : null;
  const calText = `${Math.round(recipe.calories_per_serving)} cal`;
  const imageSource = recipe.image_url ? { uri: recipe.image_url } : null;
  return (
    <Pressable
      onPress={onPress}
      style={[recipeTabStyles.recipeCard, { backgroundColor: cardBg, borderColor, width: horizontal ? 220 : undefined }]}
      accessibilityRole="button"
    >
      {imageSource ? (
        <Image source={imageSource} style={recipeTabStyles.recipeCardImage} resizeMode="cover" />
      ) : (
        <View style={[recipeTabStyles.recipeCardImage, recipeTabStyles.recipeCardImagePlaceholder]}>
          <ChefHat size={28} color="#666" />
        </View>
      )}
      {firstTag && tagColor && (
        <View style={[recipeTabStyles.tagBadge, { backgroundColor: tagColor }]}>
          <Text style={recipeTabStyles.tagBadgeText}>{firstTag.replace('-', ' ')}</Text>
        </View>
      )}
      <Pressable
        onPress={(e) => { e.stopPropagation(); onSave(); }}
        style={recipeTabStyles.saveBtn}
        accessibilityRole="button"
      >
        {recipe.is_saved
          ? <BookmarkCheck size={16} color={colors.primary} fill={colors.primary} />
          : <Bookmark size={16} color="#fff" />}
      </Pressable>
      <View style={recipeTabStyles.recipeCardInfo}>
        <Text style={[recipeTabStyles.recipeCardName, { color: textColor }]} numberOfLines={2}>{recipe.name}</Text>
        <View style={recipeTabStyles.recipeCardMeta}>
          <Text style={[recipeTabStyles.recipeCardCal, { color: colors.calories }]}>{calText}</Text>
          {prepText && (
            <>
              <Text style={[recipeTabStyles.recipeCardDot, { color: subColor }]}>·</Text>
              <Clock size={11} color={subColor} />
              <Text style={[recipeTabStyles.recipeCardSource, { color: subColor }]}>{prepText}</Text>
            </>
          )}
        </View>
        <View style={recipeTabStyles.recipeCardMacros}>
          <Text style={[recipeTabStyles.recipeCardMacroVal, { color: colors.protein }]}>{Math.round(recipe.protein_per_serving)}g P</Text>
          <Text style={[recipeTabStyles.recipeCardMacroSep, { color: subColor }]}>·</Text>
          <Text style={[recipeTabStyles.recipeCardMacroVal, { color: colors.carbs }]}>{Math.round(recipe.carbs_per_serving)}g C</Text>
          <Text style={[recipeTabStyles.recipeCardMacroSep, { color: subColor }]}>·</Text>
          <Text style={[recipeTabStyles.recipeCardMacroVal, { color: colors.fats }]}>{Math.round(recipe.fat_per_serving)}g F</Text>
        </View>
      </View>
    </Pressable>
  );
}

const recipeTabStyles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 280 },
  sectionHeader: { paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  sectionTitle: { fontWeight: '700' },
  sectionSubtitle: { fontSize: 13, marginTop: 2 },
  horizontalList: { paddingHorizontal: spacing.md, gap: spacing.sm, paddingBottom: spacing.sm },
  emptyHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  emptyHorizontalText: { fontSize: 13, flex: 1 },
  recipeCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 2,
    marginBottom: spacing.sm,
  },
  recipeCardImage: { width: '100%', height: 140 },
  recipeCardImagePlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  tagBadge: {
    position: 'absolute', top: 8, left: 8,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
  },
  tagBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  saveBtn: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  recipeCardInfo: { padding: 10, gap: 4 },
  recipeCardName: { fontSize: 14, fontWeight: '600', lineHeight: 18 },
  recipeCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  recipeCardCal: { fontSize: 12, fontWeight: '600' },
  recipeCardDot: { fontSize: 12 },
  recipeCardSource: { fontSize: 11 },
  recipeCardMacros: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  recipeCardMacroVal: { fontSize: 11, fontWeight: '600' },
  recipeCardMacroSep: { fontSize: 11 },

  // ── Contextual Insight Card ──
  contextualInsightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 3,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.sm,
    gap: 8,
  },
  contextualInsightIcon: { fontSize: 16 },
  contextualInsightText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '400' },
  contextualInsightClose: { padding: 4 },

  // ── ¿Qué como? Button ──
  queComoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: spacing.sm,
  },
  queComoButtonLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  queComoIconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  queComoButtonText: { fontSize: 15, fontWeight: '600' },

  // ── ¿Qué como? Modal ──
  queComoOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  queComoSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
    paddingTop: 12,
  },
  queComoHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  queComoSheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  queComoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  queComoOption: {
    width: '47%',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 6,
  },
  queComoOptionWide: {
    width: '100%',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  queComoOptionEmoji: { fontSize: 26 },
  queComoOptionLabel: { fontSize: 14, fontWeight: '600' },
  queComoBackRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  queComoBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  queComoBackLabel: { fontSize: 14, fontWeight: '600' },
});

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
  foodHeader: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  foodHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
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

  // ── Adaptive TDEE Banner ──────────────────────────────────────────────────
  adaptiveBanner: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  adaptiveBannerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  adaptiveBannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  adaptiveBannerIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adaptiveBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  adaptiveBannerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: spacing.xs,
    marginLeft: 40,
  },
  adaptiveBannerWhyLine: {
    fontSize: 12,
    marginBottom: spacing.sm,
    marginLeft: 40,
    lineHeight: 17,
  },
  adaptiveBannerFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 2,
  },
  adaptiveBannerSeeWhyText: {
    fontSize: 13,
    fontWeight: '600',
  },
  adaptiveBannerClose: {
    padding: 2,
  },
});


