
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, TextInput, ActivityIndicator, Animated } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow';
import { getRecentFoods } from '@/utils/foodDatabase';
import { getFavorites, removeFavoriteById, Favorite } from '@/utils/favoritesDatabase';
import { OpenFoodFactsProduct, extractServingSize, extractNutrition } from '@/utils/openFoodFacts';
import { supabase } from '@/lib/supabase/client';
import { Food } from '@/types';
import { addToDraft } from '@/utils/myMealsDraft';
import { addMealPlanItem } from '@/utils/mealPlansApi';
import { toLocalDateString } from '@/utils/dateUtils';
import QuickAddHome from '@/components/QuickAddHome';
import { usePremium } from '@/hooks/usePremium';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tryAwardMealLogged, evaluateDailyGoals } from '@/utils/xpAwarder';
import { emitMealLogged } from '@/utils/xpEvents';
import { trackFirstMealIfNeeded } from '@/utils/onboardingAnalytics';
import { formatServing } from '@/utils/servingFormat';
import { hybridSearch } from '@/utils/foodSearchHybrid';
import { logFoodUsage } from '@/utils/logFoodUsage';

// Source tag for progressive UI
type ResultSource = 'local' | 'supabase' | 'off';

interface SearchResultItem {
  product: OpenFoodFactsProduct;
  displayCalories: number;
  displayProtein: number;
  displayCarbs: number;
  displayFats: number;
  displayFiber: number;
  servingText: string;
  hasNutrition: boolean;
  source: ResultSource;
}

function buildResultItem(product: OpenFoodFactsProduct, source: ResultSource): SearchResultItem {
  const servingInfo = extractServingSize(product);
  const nutrition = extractNutrition(product);
  const multiplier = servingInfo.grams / 100;
  return {
    product,
    displayCalories: nutrition.calories * multiplier,
    displayProtein: nutrition.protein * multiplier,
    displayCarbs: nutrition.carbs * multiplier,
    displayFats: nutrition.fat * multiplier,
    displayFiber: nutrition.fiber * multiplier,
    servingText: servingInfo.displayText,
    hasNutrition: nutrition.calories > 0 || nutrition.protein > 0 || nutrition.carbs > 0 || nutrition.fat > 0,
    source,
  };
}

function mergeProducts(
  existing: Map<string, SearchResultItem>,
  incoming: OpenFoodFactsProduct[],
  source: ResultSource,
  query: string,
): SearchResultItem[] {
  const sourcePriority: Record<ResultSource, number> = { supabase: 3, off: 2, local: 1 };
  const incomingPriority = sourcePriority[source];
  for (const product of incoming) {
    const key = product.code || `${product.product_name || ''}-${product.brands || ''}`;
    if (!key) continue;
    const existing_ = existing.get(key);
    if (!existing_ || sourcePriority[existing_.source] < incomingPriority) {
      existing.set(key, buildResultItem(product, source));
    }
  }
  const q = query.toLowerCase().trim();
  const items = Array.from(existing.values());
  items.sort((a, b) => {
    const score = (item: SearchResultItem) => {
      const name = (item.product.product_name || item.product.generic_name || '').toLowerCase().trim();
      const words = name.split(/\s+/);
      if (name === q) return 1000;
      if (words[0] === q && words.length === 1) return 900;
      if (words[0] === q && words.length === 2) return 800;
      if (words[0] === q) return 700;
      if (name.startsWith(q)) return 600;
      if (name.includes(q)) return 400;
      return 0;
    };
    return score(b) - score(a);
  });
  return items.filter(item => item.hasNutrition).slice(0, 80);
}

/** Safely coerce any value to a finite number, defaulting to 0 on NaN/null/undefined */
function safeNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return isFinite(n) ? n : fallback;
}

type TabType = 'all' | 'favorites' | 'quick-add' | 'my-meals';

interface BannerEvent {
  id: number;
  message: string;
  timestamp: number;
}

interface SavedMeal {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  item_count?: number;
  total_calories?: number;
  total_protein?: number;
  total_carbs?: number;
  total_fats?: number;
}

export default function AddFoodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<any>() || {};

  // CRITICAL: Extract context from params
  const context = params.context as string | undefined;
  const mealType = params.mealType ?? params.meal ?? "breakfast";
  const returnTo = params.returnTo as string | undefined;
  const mode = (params.mode as string) || '';
  const planId = (params.planId as string) || '';
  
  console.log('[AddFood] ========== SCREEN LOADED ==========');
  console.log('[AddFood] Context:', context);
  console.log('[AddFood] Meal Type:', mealType);
  console.log('[AddFood] Return To:', returnTo);
  console.log('[AddFood] Mode:', mode);
  console.log('[AddFood] Plan ID:', planId);
  
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { isPremium } = usePremium();

  const date = (params.date as string) || toLocalDateString();
  
  const [activeTab, setActiveTab] = useState<TabType>('all');
  
  const HIDDEN_RECENT_FOODS_KEY = 'hidden_recent_food_ids';
  const [recentFoods, setRecentFoods] = useState<Food[]>([]);
  const [hiddenRecentIds, setHiddenRecentIds] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSavedMeals, setLoadingSavedMeals] = useState(false);

  // INLINE SEARCH STATE — hybrid engine
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchResultsMapRef = useRef<Map<string, SearchResultItem>>(new Map());
  const currentSearchQueryRef = useRef<string>('');

  // BANNER QUEUE SYSTEM - INTERRUPT + STACK CONFIRMATIONS
  const [bannerQueue, setBannerQueue] = useState<BannerEvent[]>([]);
  const [currentBanner, setCurrentBanner] = useState<BannerEvent | null>(null);
  const [bannerEventId, setBannerEventId] = useState(0);
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const bannerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const eventIdCounterRef = useRef(0);
  const isProcessingRef = useRef(false);

  const mealLabels: Record<string, string> = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snacks',
  };

  const loadFavorites = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const favs = await getFavorites(user.id);
        setFavorites(favs);
        console.log('[AddFood] Loaded', favs.length, 'favorites');
      }
    } catch (error) {
      console.error('[AddFood] Error loading favorites:', error);
    }
  }, []);

  const loadSavedMeals = useCallback(async () => {
    try {
      setLoadingSavedMeals(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[AddFood] No user found');
        setLoadingSavedMeals(false);
        return;
      }

      console.log('[AddFood] Loading saved meals for user:', user.id);

      // Fetch saved meals with aggregated data
      const { data: meals, error } = await supabase
        .from('saved_meals')
        .select(`
          id,
          name,
          created_at,
          updated_at,
          saved_meal_items (
            id,
            serving_amount,
            serving_unit,
            servings_count,
            foods (
              calories,
              protein,
              carbs,
              fats
            )
          )
        `)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('[AddFood] Error loading saved meals:', error);
        setLoadingSavedMeals(false);
        return;
      }

      console.log('[AddFood] Loaded', meals?.length || 0, 'saved meals');

      // Calculate totals for each meal
      const mealsWithTotals: SavedMeal[] = (meals || []).map((meal: any) => {
        const items = meal.saved_meal_items || [];
        let totalCalories = 0;
        let totalProtein = 0;
        let totalCarbs = 0;
        let totalFats = 0;

        items.forEach((item: any) => {
          if (item.foods) {
            const multiplier = (item.serving_amount / 100) * item.servings_count;
            totalCalories += item.foods.calories * multiplier;
            totalProtein += item.foods.protein * multiplier;
            totalCarbs += item.foods.carbs * multiplier;
            totalFats += item.foods.fats * multiplier;
          }
        });

        return {
          id: meal.id,
          name: meal.name,
          created_at: meal.created_at,
          updated_at: meal.updated_at,
          item_count: items.length,
          total_calories: totalCalories,
          total_protein: totalProtein,
          total_carbs: totalCarbs,
          total_fats: totalFats,
        };
      });

      setSavedMeals(mealsWithTotals);
      setLoadingSavedMeals(false);
    } catch (error) {
      console.error('[AddFood] Error in loadSavedMeals:', error);
      setLoadingSavedMeals(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const recent = await getRecentFoods();
      setRecentFoods(recent);

      const stored = await AsyncStorage.getItem(HIDDEN_RECENT_FOODS_KEY);
      if (stored) setHiddenRecentIds(new Set(JSON.parse(stored)));

      // Load favorites
      await loadFavorites();

      console.log('[AddFood] Loaded data:', { recent: recent.length });
    } catch (error) {
      console.error('[AddFood] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [loadFavorites]);

  // Load data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('[AddFood] Screen focused, loading data');
      loadData();
      
      // Load saved meals if My Meals tab is active
      if (activeTab === 'my-meals') {
        loadSavedMeals();
      }
    }, [loadData, loadSavedMeals, activeTab])
  );

  // Load saved meals when My Meals tab is selected
  useEffect(() => {
    if (activeTab === 'my-meals') {
      loadSavedMeals();
    }
  }, [activeTab, loadSavedMeals]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
      }
    };
  }, []);

  /**
   * Process the next banner in the queue
   * This function displays one banner at a time, sequentially
   */
  const processNextBanner = useCallback(() => {
    console.log('[AddFood] ========== PROCESS NEXT BANNER ==========');
    
    setBannerQueue(prevQueue => {
      console.log('[AddFood] Current queue length:', prevQueue.length);
      
      if (prevQueue.length === 0) {
        console.log('[AddFood] Queue is empty, nothing to process');
        isProcessingRef.current = false;
        return prevQueue;
      }

      // Get the next event from the queue
      const [nextEvent, ...remainingQueue] = prevQueue;
      console.log('[AddFood] Processing event:', nextEvent.id, 'Remaining:', remainingQueue.length);

      // STEP 1: Clear any existing timer
      if (bannerTimerRef.current) {
        console.log('[AddFood] Clearing existing timer');
        clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = null;
      }

      // STEP 2: Increment banner event ID to force remount (restart animation)
      setBannerEventId(prev => {
        const newId = prev + 1;
        console.log('[AddFood] Banner event ID:', prev, '->', newId);
        return newId;
      });

      // STEP 3: Set current banner
      setCurrentBanner(nextEvent);

      // STEP 4: Show banner immediately (no fade in)
      bannerOpacity.setValue(1);

      // STEP 5: Set timer to hide after 500ms and process next
      console.log('[AddFood] Setting timer to hide banner after 500ms');
      bannerTimerRef.current = setTimeout(() => {
        console.log('[AddFood] Timer fired, hiding banner');
        bannerOpacity.setValue(0);
        setCurrentBanner(null);
        
        // Process next banner in queue after a brief moment
        setTimeout(() => {
          processNextBanner();
        }, 50); // Small delay between banners for visual clarity
      }, 500);

      return remainingQueue;
    });
  }, [bannerOpacity]);

  /**
   * Add a new banner event to the queue
   * If a banner is currently showing, it will be INTERRUPTED and the new one shown immediately
   */
  const showSuccessBanner = useCallback((message: string = 'Food Added') => {
    console.log('[AddFood] ========== BANNER TRIGGERED ==========');
    
    // Create new event
    const newEvent: BannerEvent = {
      id: ++eventIdCounterRef.current,
      message: message,
      timestamp: Date.now(),
    };
    
    console.log('[AddFood] New banner event:', newEvent.id);

    // Add to queue
    setBannerQueue(prevQueue => {
      const newQueue = [...prevQueue, newEvent];
      console.log('[AddFood] Queue updated. Length:', newQueue.length);
      return newQueue;
    });

    // If a banner is currently showing, INTERRUPT it immediately
    if (currentBanner !== null) {
      console.log('[AddFood] ⚠️ INTERRUPTING current banner:', currentBanner.id);
      
      // Clear the current timer
      if (bannerTimerRef.current) {
        console.log('[AddFood] Clearing current timer');
        clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = null;
      }

      // Hide current banner immediately
      bannerOpacity.setValue(0);
      setCurrentBanner(null);

      // Process the queue immediately (which includes the new event)
      setTimeout(() => {
        processNextBanner();
      }, 50);
    } else if (!isProcessingRef.current) {
      // No banner showing, start processing
      console.log('[AddFood] No banner showing, starting queue processing');
      isProcessingRef.current = true;
      processNextBanner();
    }
  }, [currentBanner, bannerOpacity, processNextBanner]);

  /**
   * INLINE SEARCH LOGIC — hybrid engine (local cache → Supabase → OpenFoodFacts)
   */
  const performSearch = useCallback((query: string) => {
    console.log('[AddFood] ========== PERFORM HYBRID SEARCH ==========');
    console.log('[AddFood] Query:', query);

    if (searchAbortRef.current) {
      console.log('[AddFood] Aborting previous search');
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    currentSearchQueryRef.current = query;
    searchResultsMapRef.current = new Map();
    setSearchResults([]);
    setSearchError(null);
    setHasSearched(true);
    setIsSearching(true);

    hybridSearch(
      query,
      {
        onLocalCacheHit: (products) => {
          if (controller.signal.aborted) return;
          console.log('[AddFood] onLocalCacheHit —', products.length, 'products');
          const merged = mergeProducts(searchResultsMapRef.current, products, 'local', query);
          setSearchResults(merged);
        },
        onSupabaseHit: (products) => {
          if (controller.signal.aborted) return;
          console.log('[AddFood] onSupabaseHit —', products.length, 'products');
          const merged = mergeProducts(searchResultsMapRef.current, products, 'supabase', query);
          setSearchResults(merged);
        },
        onOpenFoodFactsHit: (products) => {
          if (controller.signal.aborted) return;
          console.log('[AddFood] onOpenFoodFactsHit —', products.length, 'products');
          const merged = mergeProducts(searchResultsMapRef.current, products, 'off', query);
          setSearchResults(merged);
        },
        onError: (_stage, _error) => {
          if (controller.signal.aborted) return;
          console.warn('[AddFood] Search error at stage:', _stage, _error.message);
          setSearchResults(prev => {
            if (prev.length === 0) setSearchError('Connection issue. Please check your internet and try again.');
            return prev;
          });
        },
        onComplete: () => {
          if (controller.signal.aborted) return;
          console.log('[AddFood] Hybrid search complete for query:', query);
          setIsSearching(false);
        },
      },
      controller.signal,
    );
  }, []);

  /**
   * Handle search input change with debouncing
   */
  const handleSearchChange = useCallback((text: string) => {
    console.log('[AddFood] Search input changed:', text);
    setSearchQuery(text);

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (text.trim().length === 0) {
      searchAbortRef.current?.abort();
      searchResultsMapRef.current = new Map();
      setSearchResults([]);
      setSearchError(null);
      setHasSearched(false);
      setIsSearching(false);
      return;
    }

    if (text.trim().length < 2) {
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(() => {
      performSearch(text.trim());
    }, 350);
  }, [performSearch]);

  /**
   * Retry search after error
   */
  const handleRetrySearch = useCallback(() => {
    console.log('[AddFood] Retrying search');
    const trimmed = searchQuery.trim();
    if (trimmed.length >= 2) performSearch(trimmed);
  }, [searchQuery, performSearch]);

  /**
   * Open food details for a search result
   * CRITICAL: Pass context through to Food Details
   */
  const handleOpenSearchResultDetails = useCallback((item: SearchResultItem) => {
    console.log('[AddFood] ========== OPENING SEARCH RESULT DETAILS ==========');
    console.log('[AddFood] Product:', item.product.product_name, '| source:', item.source);
    console.log('[AddFood] Context:', context);
    console.log('[AddFood] Mode:', mode);
    console.log('[AddFood] Plan ID:', planId);
    console.log('[AddFood] CRITICAL: Passing context to Food Details');

    router.push({
      pathname: '/food-details',
      params: {
        offData: JSON.stringify(item.product),
        meal: mealType,
        date: date,
        context: context || '',
        returnTo: returnTo || '',
        mode: mode || '',
        planId: planId || '',
      },
    });
  }, [router, mealType, date, context, returnTo, mode, planId]);

  /**
   * FAST ADD: Add search result directly to meal plan
   * Only available in meal-plan mode
   */
  const handleQuickAddSearchResultToMealPlan = useCallback(async (item: SearchResultItem) => {
    if (mode !== 'meal-plan' || !planId) return;
    const product = item.product;
    try {
      const nutrition = extractNutrition(product);
      const serving = extractServingSize(product);
      const multiplier = serving.grams / 100;
      console.log('[AddFood] Adding search result to meal plan:', planId, product.product_name);
      await addMealPlanItem(planId, {
        date,
        meal_type: mealType,
        food_name: product.product_name || product.generic_name || 'Unknown',
        brand: product.brands || undefined,
        quantity: multiplier,
        grams: serving.grams,
        serving_description: serving.displayText,
        calories: safeNum(nutrition.calories * multiplier),
        protein: safeNum(nutrition.protein * multiplier),
        carbs: safeNum(nutrition.carbs * multiplier),
        fats: safeNum(nutrition.fat * multiplier),
        fiber: safeNum(nutrition.fiber * multiplier),
      });
      showSuccessBanner('Added to plan');
    } catch (err) {
      console.error('[AddFood] Error adding search result to plan:', err);
      Alert.alert('Error', 'Failed to add food to plan');
    }
  }, [mode, planId, date, mealType, showSuccessBanner]);

  /**
   * FAST ADD: Add search result directly to My Meal draft
   * Only available in my_meals_builder context
   */
  const handleQuickAddSearchResult = useCallback(async (item: SearchResultItem) => {
    const product = item.product;
    console.log('[AddFood] ========== QUICK ADD SEARCH RESULT ==========');
    console.log('[AddFood] Product:', product.product_name, '| source:', item.source);
    console.log('[AddFood] Context:', context);

    if (context !== 'my_meals_builder') {
      console.log('[AddFood] ❌ Quick add only available in my_meals_builder context');
      return;
    }

    try {
      const servingInfo = extractServingSize(product);
      const nutrition = extractNutrition(product);

      // Calculate nutrition for default serving
      const multiplier = servingInfo.grams / 100;
      const calories = nutrition.calories * multiplier;
      const protein = nutrition.protein * multiplier;
      const carbs = nutrition.carbs * multiplier;
      const fat = nutrition.fat * multiplier;
      const fiber = nutrition.fiber * multiplier;

      // Ensure food exists in database
      let foodId: string | null = null;

      if (product.code) {
        const { data: existingFood } = await supabase
          .from('foods')
          .select('id')
          .eq('barcode', product.code)
          .maybeSingle();

        if (existingFood) {
          foodId = existingFood.id;
        }
      }

      if (!foodId) {
        const { data: newFood, error: foodError } = await supabase
          .from('foods')
          .insert({
            name: product.product_name || 'Unknown Product',
            brand: product.brands || null,
            serving_amount: 100,
            serving_unit: 'g',
            calories: safeNum(nutrition.calories),
            protein: safeNum(nutrition.protein),
            carbs: safeNum(nutrition.carbs),
            fats: safeNum(nutrition.fat),
            fiber: safeNum(nutrition.fiber),
            barcode: product.code || null,
            user_created: false,
          })
          .select()
          .single();

        if (foodError) {
          console.error('[AddFood] Error creating food:', foodError);
          Alert.alert('Error', 'Failed to add food');
          return;
        }

        foodId = newFood.id;
      }

      // Add to draft
      await addToDraft({
        food_id: foodId,
        food_name: product.product_name || 'Unknown Product',
        food_brand: product.brands || undefined,
        serving_amount: servingInfo.grams,
        serving_unit: 'g',
        servings_count: 1,
        calories: safeNum(calories),
        protein: safeNum(protein),
        carbs: safeNum(carbs),
        fats: safeNum(fat),
        fiber: safeNum(fiber),
      });

      console.log('[AddFood] ✅ Quick added to My Meal draft!');
      showSuccessBanner('Added');
    } catch (error) {
      console.error('[AddFood] Error quick adding search result:', error);
      Alert.alert('Error', 'Failed to add food');
    }
  }, [context, showSuccessBanner]);

  const handleCopyFromPrevious = useCallback(() => {
    console.log('[AddFood] Navigating to copy-from-previous');
    console.log('[AddFood] Context:', context);
    console.log('[AddFood] Mode:', mode);
    console.log('[AddFood] Plan ID:', planId);
    
    router.push({
      pathname: '/copy-from-previous',
      params: {
        meal: mealType,
        date: date,
        context: context || '',
        returnTo: returnTo,
        mode: mode || '',
        planId: planId || '',
      },
    });
  }, [router, mealType, date, context, returnTo, mode, planId]);

  const handleAIMealEstimator = useCallback(() => {
    console.log('[AddFood] AI Meal Estimator button pressed');
    if (!isPremium) {
      console.log('[AddFood] User is not premium, redirecting to subscription');
      router.push('/subscription');
      return;
    }
    console.log('[AddFood] Navigating to chatbot for AI Meal Estimator');
    router.push({
      pathname: '/chatbot',
      params: {
        meal: mealType,
        date: date,
        context: context || '',
        returnTo: returnTo,
        mode: mode || '',
        planId: planId || '',
      },
    });
  }, [router, mealType, date, context, returnTo, isPremium, mode, planId]);

  const handleCreateMeal = useCallback(() => {
    console.log('[AddFood] Navigating to create meal');
    router.push({
      pathname: '/my-meals-create',
      params: {
        meal: mealType,
        date: date,
        returnTo: returnTo,
      },
    });
  }, [router, mealType, date, returnTo]);

  const handleSelectMeal = useCallback((meal: SavedMeal) => {
    console.log('[AddFood] Selected meal:', meal.name);
    router.push({
      pathname: '/my-meals-details',
      params: {
        mealId: meal.id,
        meal: mealType,
        date: date,
        returnTo: returnTo,
      },
    });
  }, [router, mealType, date, returnTo]);

  const handleDeleteMeal = useCallback(async (mealId: string) => {
    console.log('[AddFood] Deleting meal:', mealId);

    // Optimistic update
    const previousMeals = [...savedMeals];
    setSavedMeals(savedMeals.filter(m => m.id !== mealId));

    try {
      const { error } = await supabase
        .from('saved_meals')
        .delete()
        .eq('id', mealId);

      if (error) {
        console.error('[AddFood] Error deleting meal:', error);
        setSavedMeals(previousMeals);
        Alert.alert('Error', 'Failed to delete meal');
      } else {
        console.log('[AddFood] Meal deleted successfully');
      }
    } catch (error) {
      console.error('[AddFood] Error in handleDeleteMeal:', error);
      setSavedMeals(previousMeals);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  }, [savedMeals]);

  const handleBarcodeScanner = useCallback(() => {
    console.log('[AddFood] ========== NAVIGATING TO BARCODE SCANNER ==========');
    console.log('[AddFood] Context:', context);
    console.log('[AddFood] Mode:', mode);
    console.log('[AddFood] Plan ID:', planId);
    console.log('[AddFood] CRITICAL: Passing context to Barcode Scanner');
    
    router.push({
      pathname: '/barcode-scanner',
      params: {
        meal: mealType,
        date: date,
        context: context || '',
        returnTo: returnTo,
        mode: mode || '',
        planId: planId || '',
      },
    });
  }, [router, mealType, date, context, returnTo, mode, planId]);

  /**
   * Open food details for a recent food.
   * Mirrors the barcode scanner data flow: navigate to /food-details with offData
   * as a JSON-stringified OpenFoodFactsProduct.
   */
  const handleOpenRecentFoodDetails = useCallback(async (food: Food) => {
    console.log('[AddFood] ========== OPENING RECENT FOOD DETAILS ==========');
    console.log('[AddFood] Food:', food.name, '| food_item_id:', food.food_item_id, '| food.id:', food.id);
    console.log('[AddFood] Context:', context, '| Mode:', mode, '| Plan ID:', planId);

    try {
      let offProduct: OpenFoodFactsProduct;

      if (food.food_item_id) {
        // ── Catalog / barcode food: query food_items table ──
        console.log('[AddFood] food_item_id detected, querying food_items:', food.food_item_id);
        const { data: fiData, error: fiError } = await supabase
          .from('food_items')
          .select('off_data, name, brand, serving_size, serving_unit, serving_quantity, nutriments, calories, protein, carbs, fat, fiber, barcode')
          .eq('id', food.food_item_id)
          .maybeSingle();

        if (fiError || !fiData) {
          console.warn('[AddFood] food_items lookup failed:', fiError);
          Alert.alert('Error', 'Failed to load food details');
          return;
        }

        console.log('[AddFood] ✅ food_items data fetched | off_data present:', !!fiData.off_data);

        if (fiData.off_data && typeof fiData.off_data === 'object') {
          // Use the original OFF product JSON directly — same as barcode scanner
          offProduct = fiData.off_data as OpenFoodFactsProduct;
          console.log('[AddFood] Using off_data directly from food_items');
        } else {
          // Build from flat columns
          console.log('[AddFood] Building offProduct from flat food_items columns');
          offProduct = {
            code: fiData.barcode || '',
            product_name: fiData.name,
            brands: fiData.brand || '',
            serving_size: fiData.serving_quantity
              ? String(fiData.serving_quantity)
              : String(fiData.serving_size || 100),
            nutriments: fiData.nutriments || {
              'energy-kcal_100g': fiData.calories,
              'proteins_100g': fiData.protein,
              'carbohydrates_100g': fiData.carbs,
              'fat_100g': fiData.fat,
              'fiber_100g': fiData.fiber,
            },
          } as OpenFoodFactsProduct;
        }
      } else {
        // ── User-created food: query foods table ──
        console.log('[AddFood] No food_item_id, querying foods table:', food.id);
        const { data: foodData, error: foodError } = await supabase
          .from('foods')
          .select('id, name, brand, barcode, calories, protein, carbs, fats, fiber')
          .eq('id', food.id)
          .maybeSingle();

        if (foodError || !foodData) {
          console.error('[AddFood] Error fetching food data:', foodError);
          Alert.alert('Error', 'Failed to load food details');
          return;
        }

        console.log('[AddFood] ✅ foods table data fetched');

        offProduct = {
          code: foodData.barcode || '',
          product_name: foodData.name,
          brands: foodData.brand || '',
          serving_size: String(100),
          nutriments: {
            'energy-kcal_100g': foodData.calories,
            'proteins_100g': foodData.protein,
            'carbohydrates_100g': foodData.carbs,
            'fat_100g': foodData.fats,
            'fiber_100g': foodData.fiber,
          },
        } as OpenFoodFactsProduct;
      }

      console.log('[AddFood] Navigating to /food-details with offData, food_item_id:', food.food_item_id || '');
      router.push({
        pathname: '/food-details',
        params: {
          offData: JSON.stringify(offProduct),
          meal: mealType,
          date: date,
          context: context || '',
          returnTo: returnTo || '',
          mode: mode || '',
          planId: planId || '',
          food_item_id: food.food_item_id || '',
          source: 'recent',
        },
      });

      console.log('[AddFood] ✅ Navigation triggered successfully');
    } catch (error) {
      console.error('[AddFood] Error opening recent food details:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  }, [router, mealType, date, context, returnTo, mode, planId]);

  /**
   * FAST ADD: Add recent food directly to My Meal draft
   * Only available in my_meals_builder context
   */
  const handleQuickAddRecentFood = useCallback(async (food: Food) => {
    console.log('[AddFood] ========== QUICK ADD RECENT FOOD ==========');
    console.log('[AddFood] Food:', food.name);
    console.log('[AddFood] Context:', context);

    if (context !== 'my_meals_builder') {
      console.log('[AddFood] ❌ Quick add only available in my_meals_builder context');
      return;
    }

    try {
      // Fetch the full food data — prefer food_items for barcode foods
      let calories100g = 0, protein100g = 0, carbs100g = 0, fats100g = 0, fiber100g = 0;

      if (food.food_item_id) {
        console.log('[AddFood] Quick add: querying food_items:', food.food_item_id);
        const { data: fiData, error: fiError } = await supabase
          .from('food_items')
          .select('*')
          .eq('id', food.food_item_id)
          .maybeSingle();

        if (fiError || !fiData) {
          console.warn('[AddFood] Quick add: food_items lookup failed, falling back to foods:', fiError);
          // fall through to foods lookup below
          const { data: fbData, error: fbError } = await supabase
            .from('foods')
            .select('*')
            .eq('id', food.id)
            .maybeSingle();
          if (fbError || !fbData) {
            console.error('[AddFood] Quick add: fallback foods lookup failed:', fbError);
            Alert.alert('Error', 'Failed to load food details');
            return;
          }
          calories100g = fbData.calories ?? 0;
          protein100g = fbData.protein ?? 0;
          carbs100g = fbData.carbs ?? 0;
          fats100g = fbData.fats ?? 0;
          fiber100g = fbData.fiber ?? 0;
        } else {
          const n = fiData.nutriments && typeof fiData.nutriments === 'object' ? fiData.nutriments as Record<string, number> : null;
          calories100g = n ? (n['energy-kcal_100g'] ?? 0) : (fiData.calories ?? fiData.energy_kcal ?? 0);
          protein100g  = n ? (n['proteins_100g'] ?? 0)    : (fiData.protein ?? fiData.proteins ?? 0);
          carbs100g    = n ? (n['carbohydrates_100g'] ?? 0): (fiData.carbs ?? fiData.carbohydrates ?? 0);
          fats100g     = n ? (n['fat_100g'] ?? 0)         : (fiData.fats ?? fiData.fat ?? 0);
          fiber100g    = n ? (n['fiber_100g'] ?? 0)       : (fiData.fiber ?? 0);
        }
      } else {
        console.log('[AddFood] Quick add: querying foods table:', food.id);
        const { data: foodData, error: foodError } = await supabase
          .from('foods')
          .select('*')
          .eq('id', food.id)
          .maybeSingle();

        if (foodError || !foodData) {
          console.error('[AddFood] Error fetching food data:', foodError);
          Alert.alert('Error', 'Failed to load food details');
          return;
        }
        calories100g = foodData.calories ?? 0;
        protein100g  = foodData.protein ?? 0;
        carbs100g    = foodData.carbs ?? 0;
        fats100g     = foodData.fats ?? 0;
        fiber100g    = foodData.fiber ?? 0;
      }

      // Use the food's serving_amount as the default (this is the grams from last time)
      const gramsToAdd = food.serving_amount;
      const multiplier = gramsToAdd / 100;

      // Calculate nutrition for the default serving
      const calories = calories100g * multiplier;
      const protein = protein100g * multiplier;
      const carbs = carbs100g * multiplier;
      const fats = fats100g * multiplier;
      const fiber = fiber100g * multiplier;

      // Add to draft
      await addToDraft({
        food_id: food.id,
        food_name: food.name,
        food_brand: food.brand || undefined,
        serving_amount: gramsToAdd,
        serving_unit: 'g',
        servings_count: 1,
        calories: safeNum(calories),
        protein: safeNum(protein),
        carbs: safeNum(carbs),
        fats: safeNum(fats),
        fiber: safeNum(fiber),
      });

      console.log('[AddFood] ✅ Quick added recent food to My Meal draft!');
      showSuccessBanner('Added');
    } catch (error) {
      console.error('[AddFood] Error quick adding recent food:', error);
      Alert.alert('Error', 'Failed to add food');
    }
  }, [context, showSuccessBanner]);

  /**
   * Add a recent food directly (for meal log context)
   * Shows success banner immediately after add
   * CRITICAL: Only works in meal_log context, not in my_meals_builder
   */
  const handleHideRecentFood = useCallback(async (food: Food) => {
    const key = food.food_item_id || food.id;
    console.log('[AddFood] Hiding recent food:', food.name, 'key:', key);
    setHiddenRecentIds(prev => {
      const next = new Set(prev);
      next.add(key);
      AsyncStorage.setItem(HIDDEN_RECENT_FOODS_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const handleAddRecentFood = useCallback(async (food: Food) => {
    console.log('[AddFood] ========== ADD RECENT FOOD ==========');
    console.log('[AddFood] Food:', food.name);
    console.log('[AddFood] Context:', context);
    console.log('[AddFood] Mode:', mode);
    console.log('[AddFood] Plan ID:', planId);

    // MEAL PLAN MODE: add directly to plan
    if (mode === 'meal-plan' && planId) {
      try {
        const { data: foodData, error: foodError } = await supabase
          .from('foods').select('*').eq('id', food.id).single();
        if (foodError || !foodData) { Alert.alert('Error', 'Failed to load food details'); return; }
        const gramsToAdd = food.serving_amount;
        const multiplier = gramsToAdd / 100;
        console.log('[AddFood] Adding recent food to meal plan:', planId, food.name);
        await addMealPlanItem(planId, {
          date,
          meal_type: mealType,
          food_name: food.name,
          brand: food.brand || undefined,
          quantity: multiplier,
          grams: gramsToAdd,
          serving_description: food.last_serving_description || formatServing(food.serving_amount, food.serving_unit),
          calories: safeNum(foodData.calories * multiplier),
          protein: safeNum(foodData.protein * multiplier),
          carbs: safeNum(foodData.carbs * multiplier),
          fats: safeNum(foodData.fats * multiplier),
          fiber: safeNum(foodData.fiber * multiplier),
        });
        showSuccessBanner('Added to plan');
      } catch (err) {
        console.error('[AddFood] Error adding recent food to plan:', err);
        Alert.alert('Error', 'Failed to add food to plan');
      }
      return;
    }

    // CRITICAL: If in my_meals_builder context, don't allow quick add
    if (context === 'my_meals_builder') {
      console.log('[AddFood] ❌ Cannot quick-add in my_meals_builder context');
      Alert.alert('Not Available', 'Please tap the food to view details and add it to your meal.');
      return;
    }

    try {
      // food.food_item_id is set when this food came from a barcode scan (food_items table)
      // food.id may be a food_items id in that case, not a foods id
      let foodId: string | null = null;
      let per100Calories: number;
      let per100Protein: number;
      let per100Carbs: number;
      let per100Fats: number;
      let per100Fiber: number;

      if (food.food_item_id) {
        console.log('[AddFood] Recent food is barcode food, fetching from food_items:', food.food_item_id);
        // Barcode food — get per-100g values directly from food_items.nutriments
        const { data: fiData, error: fiError } = await supabase
          .from('food_items')
          .select('nutriments, name, brand')
          .eq('id', food.food_item_id)
          .maybeSingle();

        if (fiError || !fiData) {
          console.error('[AddFood] Error fetching food_items data:', fiError);
          Alert.alert('Error', 'Failed to load food details');
          return;
        }

        const nutriments = fiData.nutriments || {};
        per100Calories = nutriments['energy-kcal_100g'] ?? 0;
        per100Protein  = nutriments['proteins_100g'] ?? 0;
        per100Carbs    = nutriments['carbohydrates_100g'] ?? 0;
        per100Fats     = nutriments['fat_100g'] ?? 0;
        per100Fiber    = nutriments['fiber_100g'] ?? 0;
        foodId = null; // food_id is now nullable — barcode foods don't need a foods row
      } else {
        // Regular food from foods table
        console.log('[AddFood] Recent food is regular food, fetching from foods:', food.id);
        const { data: foodData, error: foodError } = await supabase
          .from('foods')
          .select('*')
          .eq('id', food.id)
          .maybeSingle();

        if (foodError || !foodData) {
          console.error('[AddFood] Error fetching food data:', foodError);
          Alert.alert('Error', 'Failed to load food details');
          return;
        }

        foodId = foodData.id;
        per100Calories = foodData.calories;
        per100Protein  = foodData.protein;
        per100Carbs    = foodData.carbs;
        per100Fats     = foodData.fats;
        per100Fiber    = foodData.fiber ?? 0;
      }

      // Use the food's serving_amount as the default grams
      const gramsToAdd = food.serving_amount;
      // serving_unit for barcode foods is already the display text (e.g. "2 pieces (28 g)")
      // so use it directly rather than passing through formatServing which would double-format it
      const servingDescription = food.last_serving_description
        || (food.serving_unit && food.serving_unit !== 'g' && food.serving_unit !== 'ml'
            ? food.serving_unit
            : formatServing(food.serving_amount, food.serving_unit));

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to add food');
        return;
      }

      const multiplier = gramsToAdd / 100;
      const calories = per100Calories * multiplier;
      const protein  = per100Protein  * multiplier;
      const carbs    = per100Carbs    * multiplier;
      const fats     = per100Fats     * multiplier;
      const fiber    = per100Fiber    * multiplier;

      // NORMAL DIARY MODE: Log to diary
      // Find or create meal for the date and meal type
      const { data: existingMeal } = await supabase
        .from('meals')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', date)
        .eq('meal_type', mealType)
        .maybeSingle();

      let mealId = existingMeal?.id;

      if (!mealId) {
        console.log('[AddFood] Creating new meal for', mealType, 'on', date);
        const { data: newMeal, error: mealError } = await supabase
          .from('meals')
          .insert({
            user_id: user.id,
            date: date,
            meal_type: mealType,
          })
          .select()
          .single();

        if (mealError) {
          console.error('[AddFood] Error creating meal:', mealError);
          Alert.alert('Error', 'Failed to create meal');
          return;
        }

        mealId = newMeal.id;
        console.log('[AddFood] Created new meal:', mealId);
      } else {
        console.log('[AddFood] Using existing meal:', mealId);
      }

      console.log('[AddFood] Inserting NEW meal item with serving:', servingDescription);

      // ALWAYS INSERT a new meal item (never update existing ones)
      const { error: mealItemError } = await supabase
        .from('meal_items')
        .insert({
          meal_id: mealId,
          ...(foodId ? { food_id: foodId } : {}),
          ...(food.food_item_id ? { food_item_id: food.food_item_id } : {}),
          quantity: multiplier,
          calories: safeNum(calories),
          protein: safeNum(protein),
          carbs: safeNum(carbs),
          fats: safeNum(fats),
          fiber: safeNum(fiber),
          serving_description: servingDescription,
          grams: gramsToAdd,
          logged_at: new Date().toISOString(),
        });

      if (mealItemError) {
        console.error('[AddFood] Error creating meal item:', mealItemError);
        Alert.alert('Error', 'Failed to add food to meal');
        return;
      }

      console.log('[AddFood] ✅ Recent food added successfully!');
      console.log('[AddFood] Triggering success banner');

      // ── Log food usage (fire-and-forget) — use catalog food_item_id, not foods.id ──
      if (food.food_item_id) {
        console.log('[AddFood] Logging food usage for recent food, food_item_id:', food.food_item_id);
        logFoodUsage(food.food_item_id, 'search');
      } else {
        console.log('[AddFood] Skipping logFoodUsage for recent food — no catalog food_item_id');
      }

      // ── XP: award meal_logged (fire-and-forget) ──────────────────────────
      const xpSourceId = `${mealId}_${food.id}_${date}`;
      console.log('[AddFood] awarding meal XP for recent food, source_id:', xpSourceId);
      tryAwardMealLogged(xpSourceId, mealType, date);
      evaluateDailyGoals(date);

      // Notify challenge hook that a meal was logged
      emitMealLogged();
      trackFirstMealIfNeeded();
      
      // Show success banner (will interrupt if one is already showing)
      showSuccessBanner();
      
      console.log('[AddFood] Keeping modal open for multiple adds');
    } catch (error) {
      console.error('[AddFood] Error adding recent food:', error);
      Alert.alert('Error', 'An unexpected error occurred while adding food');
    }
  }, [context, mode, planId, date, mealType, showSuccessBanner]);

  /**
   * Open food details for a favorite
   * CRITICAL: Pass context through to Food Details
   */
  const handleOpenFavoriteDetails = useCallback(async (favorite: Favorite) => {
    console.log('[AddFood] ========== OPENING FAVORITE DETAILS ==========');
    console.log('[AddFood] Favorite:', favorite.food_name);
    console.log('[AddFood] Context:', context);
    console.log('[AddFood] CRITICAL: Passing context to Food Details');

    try {
      // Convert favorite to OpenFoodFacts format for the food-details screen
      const offProduct = {
        code: favorite.food_code || '',
        product_name: favorite.food_name,
        brands: favorite.brand || '',
        serving_size: favorite.serving_size || `${Math.round(favorite.default_grams)}g`,
        nutriments: {
          'energy-kcal_100g': favorite.per100_calories,
          'proteins_100g': favorite.per100_protein,
          'carbohydrates_100g': favorite.per100_carbs,
          'fat_100g': favorite.per100_fat,
          'fiber_100g': favorite.per100_fiber,
          'sugars_100g': 0,
        },
      };

      console.log('[AddFood] Navigating to food-details with favorite data');

      router.push({
        pathname: '/food-details',
        params: {
          offData: JSON.stringify(offProduct),
          meal: mealType,
          date: date,
          context: context || '',
          returnTo: returnTo || '',
        },
      });
    } catch (error) {
      console.error('[AddFood] Error opening favorite details:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  }, [router, mealType, date, context, returnTo]);

  /**
   * FAST ADD: Add favorite directly to My Meal draft
   * Only available in my_meals_builder context
   */
  const handleQuickAddFavorite = useCallback(async (favorite: Favorite) => {
    console.log('[AddFood] ========== QUICK ADD FAVORITE ==========');
    console.log('[AddFood] Favorite:', favorite.food_name);
    console.log('[AddFood] Context:', context);

    if (context !== 'my_meals_builder') {
      console.log('[AddFood] ❌ Quick add only available in my_meals_builder context');
      return;
    }

    try {
      // Calculate nutrition for default serving
      const multiplier = favorite.default_grams / 100;
      const calories = favorite.per100_calories * multiplier;
      const protein = favorite.per100_protein * multiplier;
      const carbs = favorite.per100_carbs * multiplier;
      const fat = favorite.per100_fat * multiplier;
      const fiber = favorite.per100_fiber * multiplier;

      // Check if food exists in database
      let foodId: string | null = null;

      if (favorite.food_code && favorite.food_source === 'barcode') {
        const { data: existingFood } = await supabase
          .from('foods')
          .select('id')
          .eq('barcode', favorite.food_code)
          .maybeSingle();

        if (existingFood) {
          foodId = existingFood.id;
        }
      }

      // Create food if it doesn't exist
      if (!foodId) {
        const { data: newFood, error: foodError } = await supabase
          .from('foods')
          .insert({
            name: favorite.food_name,
            brand: favorite.brand || null,
            serving_amount: 100,
            serving_unit: 'g',
            calories: safeNum(favorite.per100_calories),
            protein: safeNum(favorite.per100_protein),
            carbs: safeNum(favorite.per100_carbs),
            fats: safeNum(favorite.per100_fat),
            fiber: safeNum(favorite.per100_fiber),
            barcode: favorite.food_source === 'barcode' ? favorite.food_code : null,
            user_created: false,
          })
          .select()
          .single();

        if (foodError) {
          console.error('[AddFood] Error creating food:', foodError);
          Alert.alert('Error', 'Failed to add food');
          return;
        }

        foodId = newFood.id;
      }

      // Add to draft
      await addToDraft({
        food_id: foodId,
        food_name: favorite.food_name,
        food_brand: favorite.brand || undefined,
        serving_amount: favorite.default_grams,
        serving_unit: 'g',
        servings_count: 1,
        calories: safeNum(calories),
        protein: safeNum(protein),
        carbs: safeNum(carbs),
        fats: safeNum(fat),
        fiber: safeNum(fiber),
      });

      console.log('[AddFood] ✅ Quick added favorite to My Meal draft!');
      showSuccessBanner('Added');
    } catch (error) {
      console.error('[AddFood] Error quick adding favorite:', error);
      Alert.alert('Error', 'Failed to add food');
    }
  }, [context, showSuccessBanner]);

  /**
   * Handle adding favorite (for meal log context)
   * Shows success banner immediately after add
   * CRITICAL: Only works in meal_log context, not in my_meals_builder
   */
  const handleAddFavorite = useCallback(async (favorite: Favorite) => {
    console.log('[AddFood] ========== ADD FAVORITE ==========');
    console.log('[AddFood] Favorite:', favorite.food_name);
    console.log('[AddFood] Context:', context);
    console.log('[AddFood] Mode:', mode);
    console.log('[AddFood] Plan ID:', planId);

    // MEAL PLAN MODE: add directly to plan
    if (mode === 'meal-plan' && planId) {
      try {
        const multiplier = favorite.default_grams / 100;
        console.log('[AddFood] Adding favorite to meal plan:', planId, favorite.food_name);
        await addMealPlanItem(planId, {
          date,
          meal_type: mealType,
          food_name: favorite.food_name,
          brand: favorite.brand || undefined,
          quantity: multiplier,
          grams: favorite.default_grams,
          serving_description: favorite.serving_size || formatServing(favorite.default_grams, 'g'),
          calories: safeNum(favorite.per100_calories * multiplier),
          protein: safeNum(favorite.per100_protein * multiplier),
          carbs: safeNum(favorite.per100_carbs * multiplier),
          fats: safeNum(favorite.per100_fat * multiplier),
          fiber: safeNum(favorite.per100_fiber * multiplier),
        });
        showSuccessBanner('Added to plan');
      } catch (err) {
        console.error('[AddFood] Error adding favorite to plan:', err);
        Alert.alert('Error', 'Failed to add food to plan');
      }
      return;
    }

    // CRITICAL: If in my_meals_builder context, don't allow quick add
    if (context === 'my_meals_builder') {
      console.log('[AddFood] ❌ Cannot quick-add in my_meals_builder context');
      Alert.alert('Not Available', 'Please tap the food to view details and add it to your meal.');
      return;
    }
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to add food');
        return;
      }

      // Calculate nutrition for default serving
      const multiplier = favorite.default_grams / 100;
      const calories = favorite.per100_calories * multiplier;
      const protein = favorite.per100_protein * multiplier;
      const carbs = favorite.per100_carbs * multiplier;
      const fat = favorite.per100_fat * multiplier;
      const fiber = favorite.per100_fiber * multiplier;

      // Check if food exists in database
      let foodId: string | null = null;

      if (favorite.food_code && favorite.food_source === 'barcode') {
        const { data: existingFood } = await supabase
          .from('foods')
          .select('id')
          .eq('barcode', favorite.food_code)
          .maybeSingle();

        if (existingFood) {
          foodId = existingFood.id;
        }
      }

      // Create food if it doesn't exist
      if (!foodId) {
        const { data: newFood, error: foodError } = await supabase
          .from('foods')
          .insert({
            name: favorite.food_name,
            brand: favorite.brand || null,
            serving_amount: 100,
            serving_unit: 'g',
            calories: safeNum(favorite.per100_calories),
            protein: safeNum(favorite.per100_protein),
            carbs: safeNum(favorite.per100_carbs),
            fats: safeNum(favorite.per100_fat),
            fiber: safeNum(favorite.per100_fiber),
            barcode: favorite.food_source === 'barcode' ? favorite.food_code : null,
            user_created: false,
          })
          .select()
          .single();

        if (foodError) {
          console.error('[AddFood] Error creating food:', foodError);
          Alert.alert('Error', 'Failed to add food');
          return;
        }

        foodId = newFood.id;
      }

      // NORMAL DIARY MODE: Log to diary
      // Find or create meal
      const { data: existingMeal } = await supabase
        .from('meals')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', date)
        .eq('meal_type', mealType)
        .maybeSingle();

      let mealId = existingMeal?.id;

      if (!mealId) {
        const { data: newMeal, error: mealError } = await supabase
          .from('meals')
          .insert({
            user_id: user.id,
            date: date,
            meal_type: mealType,
          })
          .select()
          .single();

        if (mealError) {
          console.error('[AddFood] Error creating meal:', mealError);
          Alert.alert('Error', 'Failed to create meal');
          return;
        }

        mealId = newMeal.id;
      }

      // Add meal item
      const { error: mealItemError } = await supabase
        .from('meal_items')
        .insert({
          meal_id: mealId,
          food_id: foodId,
          quantity: multiplier,
          calories: safeNum(calories),
          protein: safeNum(protein),
          carbs: safeNum(carbs),
          fats: safeNum(fat),
          fiber: safeNum(fiber),
          serving_description: favorite.serving_size || formatServing(favorite.default_grams, 'g'),
          grams: favorite.default_grams,
          logged_at: new Date().toISOString(),
        });

      if (mealItemError) {
        console.error('[AddFood] Error adding meal item:', mealItemError);
        Alert.alert('Error', 'Failed to add food to meal');
        return;
      }

      console.log('[AddFood] ✅ Favorite added to meal successfully');
      console.log('[AddFood] Triggering success banner');

      // ── Log food usage (fire-and-forget) — resolve catalog food_item_id first ──
      {
        const { data: miRow } = await supabase
          .from('meal_items')
          .select('food_item_id')
          .eq('food_id', foodId)
          .not('food_item_id', 'is', null)
          .limit(1)
          .maybeSingle();
        const catalogId: string | null = miRow?.food_item_id ?? null;
        if (catalogId) {
          console.log('[AddFood] Logging food usage for favorite, food_item_id:', catalogId);
          logFoodUsage(catalogId, 'search');
        } else {
          console.log('[AddFood] Skipping logFoodUsage for favorite — no catalog food_item_id found for food_id:', foodId);
        }
      }

      // ── XP: award meal_logged (fire-and-forget) ──────────────────────────
      const xpSourceId = `${mealId}_${foodId}_${date}`;
      console.log('[AddFood] awarding meal XP for favorite, source_id:', xpSourceId);
      tryAwardMealLogged(xpSourceId, mealType, date);
      evaluateDailyGoals(date);

      // Notify challenge hook that a meal was logged
      emitMealLogged();
      trackFirstMealIfNeeded();
      
      // Show success banner (will interrupt if one is already showing)
      showSuccessBanner();
      
      console.log('[AddFood] Keeping modal open for multiple adds');
    } catch (error) {
      console.error('[AddFood] Error adding favorite:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  }, [context, mode, planId, date, mealType, showSuccessBanner]);

  /**
   * Remove a favorite from the list
   */
  const handleRemoveFavorite = useCallback(async (favoriteId: string) => {
    console.log('[AddFood] ========== REMOVE FAVORITE ==========');
    console.log('[AddFood] Favorite ID to remove:', favoriteId);
    
    // Store previous state for rollback
    const previousFavorites = [...favorites];
    
    // Optimistically update UI
    console.log('[AddFood] Optimistically removing from UI');
    setFavorites(favorites.filter(f => f.id !== favoriteId));
    
    try {
      console.log('[AddFood] Calling removeFavoriteById...');
      const success = await removeFavoriteById(favoriteId);
      
      if (success) {
        console.log('[AddFood] ✓ Favorite removed successfully from database');
      } else {
        console.error('[AddFood] ✗ removeFavoriteById returned false');
        setFavorites(previousFavorites);
        Alert.alert('Error', 'Failed to remove favorite. Please try again.');
      }
    } catch (error: any) {
      console.error('[AddFood] ✗ Error removing favorite:', error);
      setFavorites(previousFavorites);
      Alert.alert('Error', error.message || 'Failed to remove favorite. Please try again.');
    }
  }, [favorites]);

  const renderFoodItem = useCallback((food: Food, index: number) => {
    const calories = Math.round(food.calories);
    const protein = Math.round(food.protein);
    const carbs = Math.round(food.carbs);
    const fat = Math.round(food.fats);

    // serving_unit now contains the full display text from extractServingSize e.g. "1 piece (28 g)"
    const servingText = food.serving_unit || `${food.serving_amount}g`;

    return (
      <SwipeToDeleteRow
        key={food.id ?? `recent-food-${index}`}
        onDelete={() => handleHideRecentFood(food)}
      >
        <TouchableOpacity
          style={[
            styles.foodCard,
            { backgroundColor: isDark ? colors.cardDark : colors.card }
          ]}
          onPress={() => handleOpenRecentFoodDetails(food)}
          activeOpacity={0.7}
        >
          <View style={styles.foodInfo}>
            <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text }]} numberOfLines={1}>
              {food.name}
            </Text>
            {food.brand ? (
              <Text style={[styles.foodServing, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]} numberOfLines={1}>
                {food.brand}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 12, color: isDark ? colors.textSecondaryDark : colors.textSecondary }}>
                {servingText}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#E74C3C' }}>P {protein}g</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#3498DB' }}>C {carbs}g</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#F39C12' }}>F {fat}g</Text>
            </View>
          </View>

          <View style={{ alignItems: 'flex-end', justifyContent: 'center', marginRight: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: isDark ? colors.textDark : colors.text }}>
              {calories}
            </Text>
            <Text style={{ fontSize: 11, color: isDark ? colors.textSecondaryDark : colors.textSecondary }}>
              kcal
            </Text>
          </View>

          <TouchableOpacity
            style={styles.addButton}
            onPress={(e) => {
              e.stopPropagation();
              console.log('[AddFood] Recent food + button pressed:', food.name, 'context:', context);
              if (context === 'my_meals_builder') {
                handleQuickAddRecentFood(food);
              } else {
                handleAddRecentFood(food);
              }
            }}
            activeOpacity={0.7}
          >
            <IconSymbol
              ios_icon_name="plus"
              android_material_icon_name="add"
              size={20}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </SwipeToDeleteRow>
    );
  }, [isDark, context, handleOpenRecentFoodDetails, handleQuickAddRecentFood, handleAddRecentFood, handleHideRecentFood]);

  const renderSearchResultItem = useCallback((item: SearchResultItem, index: number) => {
    const displayName = item.product.product_name || 'Unknown Product';
    const displayBrand = item.product.brands || '';
    const calories = Math.round(item.displayCalories);
    const protein = Math.round(isFinite(item.displayProtein) ? item.displayProtein : 0);
    const carbs = Math.round(isFinite(item.displayCarbs) ? item.displayCarbs : 0);
    const fat = Math.round(isFinite(item.displayFats) ? item.displayFats : 0);
    const macrosText = `P: ${protein}g • C: ${carbs}g • F: ${fat}g`;
    
    return (
      <React.Fragment key={item.product.code ?? `search-result-${index}`}>
        <TouchableOpacity 
          style={[
            styles.foodCard,
            { backgroundColor: isDark ? colors.cardDark : colors.card }
          ]}
          onPress={() => handleOpenSearchResultDetails(item)}
          activeOpacity={0.7}
        >
          <View style={styles.foodInfo}>
            <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text }]}>
              {displayName}
            </Text>
            <Text style={[styles.foodServing, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {displayBrand ? `${displayBrand} • ` : ''}{item.servingText} • {calories} cal
            </Text>
            <Text style={[styles.foodMacros, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {macrosText}
            </Text>
          </View>
          
          {/* Show quick-add button in my_meals_builder or meal-plan mode */}
          {context === 'my_meals_builder' ? (
            <TouchableOpacity
              style={styles.addButton}
              onPress={(e) => {
                e.stopPropagation();
                handleQuickAddSearchResult(item);
              }}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="plus"
                android_material_icon_name="add"
                size={20}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          ) : mode === 'meal-plan' ? (
            <TouchableOpacity
              style={styles.addButton}
              onPress={(e) => {
                e.stopPropagation();
                handleQuickAddSearchResultToMealPlan(item);
              }}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="plus"
                android_material_icon_name="add"
                size={20}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.chevronContainer}>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="chevron_right"
                size={20}
                color={isDark ? colors.textSecondaryDark : colors.textSecondary}
              />
            </View>
          )}
        </TouchableOpacity>
      </React.Fragment>
    );
  }, [isDark, context, mode, handleOpenSearchResultDetails, handleQuickAddSearchResult, handleQuickAddSearchResultToMealPlan]);

  const renderFavoriteItem = useCallback((favorite: Favorite, index: number) => {
    const multiplier = favorite.default_grams / 100;
    const calories = Math.round(favorite.per100_calories * multiplier);
    const protein = Math.round(favorite.per100_protein * multiplier);
    const carbs = Math.round(favorite.per100_carbs * multiplier);
    const fat = Math.round(favorite.per100_fat * multiplier);

    const servingText = favorite.serving_size || `${Math.round(favorite.default_grams)}g`;
    const macrosText = `P: ${protein}g • C: ${carbs}g • F: ${fat}g`;

    return (
      <React.Fragment key={favorite.id ?? `favorite-${index}`}>
        <SwipeToDeleteRow
          onDelete={() => handleRemoveFavorite(favorite.id)}
        >
          <TouchableOpacity 
            style={[
              styles.foodCard,
              { backgroundColor: isDark ? colors.cardDark : colors.card }
            ]}
            onPress={() => handleOpenFavoriteDetails(favorite)}
            activeOpacity={0.7}
          >
            <View style={styles.foodInfo}>
              <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text }]}>
                {favorite.food_name}
              </Text>
              <Text style={[styles.foodServing, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {favorite.brand ? `${favorite.brand} • ` : ''}{servingText} • {calories} cal
              </Text>
              <Text style={[styles.foodMacros, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {macrosText}
              </Text>
            </View>
            
            {/* Show quick-add button based on context */}
            {context === 'my_meals_builder' ? (
              <TouchableOpacity
                style={styles.addButton}
                onPress={(e) => {
                  e.stopPropagation();
                  handleQuickAddFavorite(favorite);
                }}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name="plus"
                  android_material_icon_name="add"
                  size={20}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.addButton}
                onPress={(e) => {
                  e.stopPropagation();
                  handleAddFavorite(favorite);
                }}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name="plus"
                  android_material_icon_name="add"
                  size={20}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </SwipeToDeleteRow>
      </React.Fragment>
    );
  }, [isDark, context, handleRemoveFavorite, handleOpenFavoriteDetails, handleQuickAddFavorite, handleAddFavorite]);

  /**
   * QUICK ADD: Add entire saved meal to meal log
   * Adds all foods from the saved meal with 1 serving each
   */
  const handleQuickAddSavedMeal = useCallback(async (meal: SavedMeal) => {
    console.log('[AddFood] ========== QUICK ADD SAVED MEAL ==========');
    console.log('[AddFood] Meal:', meal.name);
    console.log('[AddFood] Context:', context);

    // CRITICAL: Only allow quick add in meal_log context
    if (context === 'my_meals_builder') {
      console.log('[AddFood] ❌ Cannot quick-add in my_meals_builder context');
      Alert.alert('Not Available', 'Please tap the meal to view details and add it to your meal.');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to add meal');
        return;
      }

      // Fetch the saved meal items
      const { data: mealItems, error: itemsError } = await supabase
        .from('saved_meal_items')
        .select(`
          id,
          serving_amount,
          serving_unit,
          servings_count,
          food_id,
          foods (
            id,
            name,
            brand,
            calories,
            protein,
            carbs,
            fats,
            fiber
          )
        `)
        .eq('saved_meal_id', meal.id);

      if (itemsError || !mealItems || mealItems.length === 0) {
        console.error('[AddFood] Error loading meal items:', itemsError);
        Alert.alert('Error', 'Failed to load meal items');
        return;
      }

      console.log('[AddFood] Loaded', mealItems.length, 'items from saved meal');

      // Find or create meal for the date and meal type
      const { data: existingMeal } = await supabase
        .from('meals')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', date)
        .eq('meal_type', mealType)
        .maybeSingle();

      let targetMealId = existingMeal?.id;

      if (!targetMealId) {
        console.log('[AddFood] Creating new meal for', mealType, 'on', date);
        const { data: newMeal, error: mealError } = await supabase
          .from('meals')
          .insert({
            user_id: user.id,
            date: date,
            meal_type: mealType,
          })
          .select()
          .single();

        if (mealError) {
          console.error('[AddFood] Error creating meal:', mealError);
          Alert.alert('Error', 'Failed to create meal');
          return;
        }

        targetMealId = newMeal.id;
        console.log('[AddFood] Created new meal:', targetMealId);
      } else {
        console.log('[AddFood] Using existing meal:', targetMealId);
      }

      // Add each food item from the saved meal
      const itemsToInsert = mealItems.map((item: any) => {
        const food = item.foods;
        const multiplier = (item.serving_amount / 100) * item.servings_count;
        
        return {
          meal_id: targetMealId,
          food_id: item.food_id,
          quantity: multiplier,
          calories: food.calories * multiplier,
          protein: food.protein * multiplier,
          carbs: food.carbs * multiplier,
          fats: food.fats * multiplier,
          fiber: food.fiber * multiplier,
          serving_description: `${item.serving_amount} ${item.serving_unit}`,
          grams: item.serving_amount,
          logged_at: new Date().toISOString(),
        };
      });

      console.log('[AddFood] Inserting', itemsToInsert.length, 'meal items');

      const { error: insertError } = await supabase
        .from('meal_items')
        .insert(itemsToInsert);

      if (insertError) {
        console.error('[AddFood] Error inserting meal items:', insertError);
        Alert.alert('Error', 'Failed to add meal items');
        return;
      }

      console.log('[AddFood] ✅ Saved meal added successfully!');

      // ── Log food usage for each item (fire-and-forget) — resolve catalog IDs ──
      for (const item of itemsToInsert as any[]) {
        const { data: miRow } = await supabase
          .from('meal_items')
          .select('food_item_id')
          .eq('food_id', item.food_id)
          .not('food_item_id', 'is', null)
          .limit(1)
          .maybeSingle();
        const catalogId: string | null = miRow?.food_item_id ?? null;
        if (catalogId) {
          console.log('[AddFood] Logging food usage for saved meal item, food_item_id:', catalogId);
          logFoodUsage(catalogId, 'search');
        } else {
          console.log('[AddFood] Skipping logFoodUsage for saved meal item — no catalog food_item_id for food_id:', item.food_id);
        }
      }

      // Notify challenge hook that a meal was logged
      emitMealLogged();
      trackFirstMealIfNeeded();
      
      // Show success banner
      showSuccessBanner('Meal Added');
      
      console.log('[AddFood] Keeping modal open for multiple adds');
    } catch (error) {
      console.error('[AddFood] Error quick adding saved meal:', error);
      Alert.alert('Error', 'An unexpected error occurred while adding meal');
    }
  }, [context, date, mealType, showSuccessBanner]);

  const renderSavedMealItem = useCallback((meal: SavedMeal, index: number) => {
    return (
      <React.Fragment key={meal.id}>
        <SwipeToDeleteRow onDelete={() => handleDeleteMeal(meal.id)}>
          {(isSwiping: boolean) => (
            <TouchableOpacity
              style={[styles.foodCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
              onPress={() => {
                if (!isSwiping) {
                  handleSelectMeal(meal);
                }
              }}
              activeOpacity={0.7}
              disabled={isSwiping}
            >
              <View style={styles.foodInfo}>
                <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text }]}>
                  {meal.name}
                </Text>
                <Text style={[styles.foodServing, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  {meal.item_count || 0} {meal.item_count === 1 ? 'item' : 'items'} • {Math.round(meal.total_calories || 0)} cal
                </Text>
                <Text style={[styles.foodMacros, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  P: {Math.round(meal.total_protein || 0)}g • C: {Math.round(meal.total_carbs || 0)}g • F: {Math.round(meal.total_fats || 0)}g
                </Text>
              </View>
              
              {/* Show quick-add button only in meal_log context */}
              {context !== 'my_meals_builder' && (
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    if (!isSwiping) {
                      handleQuickAddSavedMeal(meal);
                    }
                  }}
                  activeOpacity={0.7}
                  disabled={isSwiping}
                >
                  <IconSymbol
                    ios_icon_name="plus"
                    android_material_icon_name="add"
                    size={20}
                    color="#FFFFFF"
                  />
                </TouchableOpacity>
              )}
              
              {/* Show chevron in my_meals_builder context */}
              {context === 'my_meals_builder' && (
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron_right"
                  size={20}
                  color={isDark ? colors.textSecondaryDark : colors.textSecondary}
                />
              )}
            </TouchableOpacity>
          )}
        </SwipeToDeleteRow>
      </React.Fragment>
    );
  }, [isDark, context, handleSelectMeal, handleDeleteMeal, handleQuickAddSavedMeal]);

  const renderListContent = useCallback(() => {
    if (searchQuery.trim().length > 0) {
      if (searchQuery.trim().length < 2) {
        return (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Type at least 2 characters to search
            </Text>
          </View>
        );
      }
      
      if (isSearching && searchResults.length === 0) {
        return (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.md }]}>
              Searching...
            </Text>
          </View>
        );
      }
      
      if (searchError) {
        return (
          <View style={styles.emptyState}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle"
              android_material_icon_name="error_outline"
              size={48}
              color="#FF3B30"
            />
            <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.md }]}>
              {searchError}
            </Text>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: colors.primary, marginTop: spacing.md }]}
              onPress={handleRetrySearch}
              activeOpacity={0.7}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        );
      }
      
      if (searchResults.length > 0) {
        return (
          <React.Fragment>
            <Text style={[styles.sectionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Search Results ({searchResults.length})
            </Text>
            {searchResults.map((item, index) => renderSearchResultItem(item, index))}
            {isSearching && (
              <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            )}
          </React.Fragment>
        );
      }
      
      return (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
            No foods found
          </Text>
        </View>
      );
    }
    
    return (
      <React.Fragment>
        <Text style={[styles.sectionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
          Recent Foods
        </Text>
        {recentFoods.filter(food => !hiddenRecentIds.has(food.food_item_id || food.id)).length > 0 ? (
          recentFoods
            .filter(food => !hiddenRecentIds.has(food.food_item_id || food.id))
            .map((food, index) => renderFoodItem(food, index))
        ) : (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              No recent foods yet
            </Text>
          </View>
        )}
      </React.Fragment>
    );
  }, [searchQuery, isSearching, searchError, searchResults, recentFoods, hiddenRecentIds, isDark, handleRetrySearch, renderSearchResultItem, renderFoodItem]);

  return (
    <SafeAreaView 
      style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} 
      edges={['top']}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={isDark ? colors.textDark : colors.text}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: isDark ? colors.textDark : colors.text }]}>
          {context === 'my_meals_builder' ? 'Add to My Meal' : `Add to ${mealLabels[mealType]}`}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.searchContainer, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
        <View 
          style={[
            styles.searchBar,
            { 
              backgroundColor: isDark ? colors.cardDark : colors.card,
              borderColor: isDark ? colors.borderDark : colors.border,
            }
          ]}
        >
          <IconSymbol
            ios_icon_name="magnifyingglass"
            android_material_icon_name="search"
            size={20}
            color={isDark ? colors.textSecondaryDark : colors.textSecondary}
          />
          <TextInput
            style={[
              styles.searchInput,
              { color: isDark ? colors.textDark : colors.text }
            ]}
            placeholder="Search food..."
            placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => handleSearchChange('')}
              style={styles.clearButton}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="cancel"
                size={20}
                color={isDark ? colors.textSecondaryDark : colors.textSecondary}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {searchQuery.trim().length === 0 && (
        <View style={[styles.tabContainer, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}>
          <TouchableOpacity
            style={styles.tab}
            onPress={() => setActiveTab('all')}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.tabText,
              activeTab === 'all' && styles.tabTextActive,
              { color: activeTab === 'all' ? (isDark ? colors.textDark : colors.text) : (isDark ? colors.textSecondaryDark : colors.textSecondary) }
            ]}>
              All
            </Text>
            {activeTab === 'all' && <View style={styles.tabIndicator} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tab}
            onPress={() => setActiveTab('favorites')}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.tabText,
              activeTab === 'favorites' && styles.tabTextActive,
              { color: activeTab === 'favorites' ? (isDark ? colors.textDark : colors.text) : (isDark ? colors.textSecondaryDark : colors.textSecondary) }
            ]}>
              Favorites
            </Text>
            {activeTab === 'favorites' && <View style={styles.tabIndicator} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tab}
            onPress={() => setActiveTab('quick-add')}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.tabText,
              activeTab === 'quick-add' && styles.tabTextActive,
              { color: activeTab === 'quick-add' ? (isDark ? colors.textDark : colors.text) : (isDark ? colors.textSecondaryDark : colors.textSecondary) }
            ]}>
              Quick Add
            </Text>
            {activeTab === 'quick-add' && <View style={styles.tabIndicator} />}
          </TouchableOpacity>

          {/* MY MEALS TAB - Only show if NOT in my_meals_builder context */}
          {context !== 'my_meals_builder' && (
            <TouchableOpacity
              style={styles.tab}
              onPress={() => setActiveTab('my-meals')}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.tabText,
                activeTab === 'my-meals' && styles.tabTextActive,
                { color: activeTab === 'my-meals' ? (isDark ? colors.textDark : colors.text) : (isDark ? colors.textSecondaryDark : colors.textSecondary) }
              ]}>
                My Meals
              </Text>
              {activeTab === 'my-meals' && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          )}
        </View>
      )}

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {searchQuery.trim().length > 0 ? (
          renderListContent()
        ) : (
          <React.Fragment>
            {activeTab === 'all' && (
              <React.Fragment>
                <Text style={[styles.sectionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Quick Actions
                </Text>
                <View style={styles.quickActionsRowCompact}>
                  <TouchableOpacity
                    style={[styles.quickActionButtonCompact, styles.quickActionButtonYellow]}
                    onPress={handleAIMealEstimator}
                    activeOpacity={0.7}
                  >
                    <IconSymbol
                      ios_icon_name="sparkles"
                      android_material_icon_name="auto_awesome"
                      size={20}
                      color="#F59E0B"
                    />
                    <Text style={styles.quickActionButtonTextCompact}>
                      AI Meal{'\n'}Estimator
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.quickActionButtonCompact, styles.quickActionButtonPurple]}
                    onPress={handleBarcodeScanner}
                    activeOpacity={0.7}
                  >
                    <IconSymbol
                      ios_icon_name="barcode.viewfinder"
                      android_material_icon_name="qr_code_scanner"
                      size={20}
                      color="#8B5CF6"
                    />
                    <Text style={styles.quickActionButtonTextCompact}>
                      Barcode{'\n'}Scan
                    </Text>
                  </TouchableOpacity>

                  {/* Only show Copy from Previous if NOT in my_meals_builder context */}
                  {context !== 'my_meals_builder' && (
                    <TouchableOpacity
                      style={[styles.quickActionButtonCompact, styles.quickActionButtonGreen]}
                      onPress={handleCopyFromPrevious}
                      activeOpacity={0.7}
                    >
                      <IconSymbol
                        ios_icon_name="calendar"
                        android_material_icon_name="event"
                        size={20}
                        color="#10B981"
                      />
                      <Text style={styles.quickActionButtonTextCompact}>
                        Copy from{'\n'}Previous
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </React.Fragment>
            )}

            {activeTab === 'all' && renderListContent()}

            {activeTab === 'favorites' && (
              <React.Fragment>
                <Text style={[styles.sectionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Favorite Foods
                </Text>
                {favorites.length > 0 ? (
                  favorites.map((favorite, index) => renderFavoriteItem(favorite, index))
                ) : (
                  <View style={styles.emptyState}>
                    <IconSymbol
                      ios_icon_name="star"
                      android_material_icon_name="star_border"
                      size={48}
                      color={isDark ? colors.textSecondaryDark : colors.textSecondary}
                    />
                    <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.md }]}>
                      No favorite foods yet
                    </Text>
                    <Text style={[styles.emptySubtext, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.xs }]}>
                      Tap the star icon on any food to add it to your favorites
                    </Text>
                  </View>
                )}
              </React.Fragment>
            )}

            {activeTab === 'quick-add' && (
              <QuickAddHome
                mealType={mealType}
                date={date}
                returnTo={returnTo}
                mode={context === 'my_meals_builder' ? 'mymeal' : 'diary'}
                myMealId={params.myMealId as string | undefined}
                context={context}
                onQuickAdd={showSuccessBanner}
              />
            )}

            {activeTab === 'my-meals' && (
              <React.Fragment>
                {/* CREATE A NEW MEAL BUTTON */}
                <TouchableOpacity
                  style={[styles.createMealButton, { backgroundColor: colors.primary }]}
                  onPress={handleCreateMeal}
                  activeOpacity={0.7}
                >
                  <IconSymbol
                    ios_icon_name="plus"
                    android_material_icon_name="add"
                    size={20}
                    color="#FFFFFF"
                  />
                  <Text style={styles.createMealButtonText}>Create a New Meal</Text>
                </TouchableOpacity>

                {/* SAVED MEALS LIST */}
                <Text style={[styles.sectionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Saved Meals
                </Text>

                {loadingSavedMeals ? (
                  <View style={styles.emptyState}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.md }]}>
                      Loading saved meals...
                    </Text>
                  </View>
                ) : savedMeals.length > 0 ? (
                  savedMeals.map((meal, index) => renderSavedMealItem(meal, index))
                ) : (
                  <View style={styles.emptyState}>
                    <IconSymbol
                      ios_icon_name="fork.knife"
                      android_material_icon_name="restaurant"
                      size={48}
                      color={isDark ? colors.textSecondaryDark : colors.textSecondary}
                    />
                    <Text style={[styles.emptyText, { color: isDark ? colors.textDark : colors.text, marginTop: spacing.md }]}>
                      No saved meals yet
                    </Text>
                    <Text style={[styles.emptySubtext, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.xs }]}>
                      Create your first saved meal to reuse it anytime
                    </Text>
                  </View>
                )}
              </React.Fragment>
            )}
          </React.Fragment>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* BANNER QUEUE SYSTEM - Each event gets unique key to force remount */}
      {/* Only show banner if in my_meals_builder context */}
      {currentBanner && context === 'my_meals_builder' && (
        <Animated.View 
          key={bannerEventId}
          style={[
            styles.bannerContainer,
            { 
              opacity: bannerOpacity,
            }
          ]}
        >
          <View style={styles.banner}>
            <IconSymbol
              ios_icon_name="checkmark.circle.fill"
              android_material_icon_name="check_circle"
              size={20}
              color="#FFFFFF"
            />
            <Text style={styles.bannerText}>{currentBanner.message}</Text>
          </View>
        </Animated.View>
      )}

      {/* BANNER FOR MEAL LOG CONTEXT */}
      {currentBanner && context !== 'my_meals_builder' && (
        <Animated.View 
          key={bannerEventId}
          style={[
            styles.bannerContainer,
            { 
              opacity: bannerOpacity,
            }
          ]}
        >
          <View style={styles.banner}>
            <IconSymbol
              ios_icon_name="checkmark.circle.fill"
              android_material_icon_name="check_circle"
              size={20}
              color="#FFFFFF"
            />
            <Text style={styles.bannerText}>{currentBanner.message}</Text>
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.sm,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    ...typography.h3,
    fontSize: 18,
    flex: 1,
    textAlign: 'center',
  },
  searchContainer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    fontSize: 16,
    paddingVertical: 0,
  },
  clearButton: {
    padding: spacing.xs,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '30',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    position: 'relative',
  },
  tabText: {
    ...typography.body,
    fontSize: 14,
  },
  tabTextActive: {
    fontWeight: '600',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    right: '25%',
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  sectionLabel: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  quickActionsRowCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  quickActionButtonCompact: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.06)',
    elevation: 1,
    minHeight: 70,
  },
  quickActionButtonYellow: {
    backgroundColor: '#FEF3C7',
  },
  quickActionButtonPurple: {
    backgroundColor: '#EDE9FE',
  },
  quickActionButtonGreen: {
    backgroundColor: '#D1FAE5',
  },
  quickActionButtonTextCompact: {
    ...typography.bodyBold,
    fontSize: 11,
    color: '#1F2937',
    textAlign: 'center',
    lineHeight: 14,
  },
  foodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
    elevation: 1,
    overflow: 'hidden',
    padding: spacing.md,
  },
  foodInfo: {
    flex: 1,
  },
  foodName: {
    ...typography.bodyBold,
    fontSize: 16,
    marginBottom: 2,
  },
  foodServing: {
    ...typography.caption,
    fontSize: 13,
    marginBottom: 2,
  },
  foodMacros: {
    ...typography.caption,
    fontSize: 12,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
  },
  chevronContainer: {
    paddingLeft: spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    ...typography.body,
    fontSize: 15,
    textAlign: 'center',
  },
  emptySubtext: {
    ...typography.caption,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  retryButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  bannerContainer: {
    position: 'absolute',
    bottom: 100,
    left: spacing.md,
    right: spacing.md,
    alignItems: 'center',
    zIndex: 1000,
    pointerEvents: 'none',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.3)',
    elevation: 8,
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  createMealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  createMealButtonText: {
    ...typography.bodyBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
});
