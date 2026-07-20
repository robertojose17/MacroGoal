
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, TextInput, ActivityIndicator, Animated } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import SwipeToDeleteRow from '@/components/SwipeToDeleteRow';
import { getFavorites, removeFavoriteById, Favorite } from '@/utils/favoritesDatabase';
import { OpenFoodFactsProduct } from '@/utils/openFoodFacts';
import { ResultSource, SearchResultItem, buildResultItem, mergeProducts, buildOffProductFromFoodItemId } from '@/utils/foodSearchUtils';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';
import { buildSyntheticOffData } from '@/utils/servingParser';
import { Food } from '@/types';
import { addToDraft } from '@/utils/myMealsDraft';
import { addMealPlanItem } from '@/utils/mealPlansApi';
import { toLocalDateString } from '@/utils/dateUtils';
import QuickAddHome from '@/components/QuickAddHome';
import { usePremium } from '@/hooks/usePremium';
import { tryAwardMealLogged, evaluateDailyGoals } from '@/utils/xpAwarder';
import { emitMealLogged } from '@/utils/xpEvents';
import { trackFirstMealIfNeeded } from '@/utils/onboardingAnalytics';
import { formatServing } from '@/utils/servingFormat';
import { hybridSearch } from '@/utils/foodSearchHybrid';
import { logFoodUsage } from '@/utils/logFoodUsage';
import { calcMacros } from '@/utils/macros';



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
            calories,
            protein,
            carbs,
            fat,
            fiber
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
          totalCalories += item.calories ?? 0;
          totalProtein += item.protein ?? 0;
          totalCarbs += item.carbs ?? 0;
          totalFats += item.fat ?? 0;
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

      // Load favorites
      await loadFavorites();

      console.log('[AddFood] Loaded data');
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
      const serving = extractServingSize(product);
      const nutrition = extractNutritionPerServing(product, serving.grams);
      console.log('[AddFood] Adding search result to meal plan:', planId, product.product_name);
      await addMealPlanItem(planId, {
        date,
        meal_type: mealType,
        food_name: product.product_name || product.generic_name || 'Unknown',
        brand: product.brands || undefined,
        quantity: serving.grams / 100,
        grams: serving.grams,
        serving_description: serving.displayText,
        calories: safeNum(nutrition.calories),
        protein: safeNum(nutrition.protein),
        carbs: safeNum(nutrition.carbs),
        fats: safeNum(nutrition.fat),
        fiber: safeNum(nutrition.fiber),
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
      const nutrition = extractNutritionPerServing(product, servingInfo.grams);

      // Nutrition already calculated for the default serving
      const calories = nutrition.calories;
      const protein = nutrition.protein;
      const carbs = nutrition.carbs;
      const fat = nutrition.fat;
      const fiber = nutrition.fiber;

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
    console.log('[AddFood] Selected meal:', meal.name, '| mode:', mode, '| planId:', planId);
    router.push({
      pathname: '/my-meals-details',
      params: {
        mealId: meal.id,
        meal: mealType,
        date: date,
        returnTo: returnTo,
        mode: mode || '',
        planId: planId || '',
      },
    });
  }, [router, mealType, date, returnTo, mode, planId]);

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
   * Open food details for a favorite
   * CRITICAL: Pass context through to Food Details
   */
  const handleOpenFavoriteDetails = useCallback(async (favorite: Favorite) => {
    console.log('[AddFood] ========== OPENING FAVORITE DETAILS ==========');
    console.log('[AddFood] Favorite:', favorite.food_name);
    console.log('[AddFood] Context:', context);
    console.log('[AddFood] CRITICAL: Passing context to Food Details');

    try {
      const favFoodItemId = (favorite as any).food_item_id as string | undefined;
      let offProduct: OpenFoodFactsProduct | null = null;

      if (favFoodItemId) {
        // Use shared helper for full micronutrient shape
        console.log('[AddFood] handleOpenFavoriteDetails: using buildOffProductFromFoodItemId for food_item_id=', favFoodItemId);
        offProduct = await buildOffProductFromFoodItemId(favFoodItemId);
        if (offProduct) {
          console.log('[AddFood] ✅ offProduct built via helper | serving_size=', offProduct.serving_size);
        } else {
          console.warn('[AddFood] buildOffProductFromFoodItemId returned null, falling back to minimal build');
        }
      }

      if (!offProduct) {
        // Fallback: build minimal product from favorite columns
        const favFoodItem = (favorite as any).food_items;
        const grams = favorite.default_grams;
        let cal100: number, prot100: number, carb100: number, fat100: number, fib100: number;
        if (favFoodItem && favFoodItem.serving_size > 0) {
          const m = calcMacros(favFoodItem, 100);
          cal100 = m.calories; prot100 = m.protein; carb100 = m.carbs; fat100 = m.fat; fib100 = m.fiber;
        } else {
          cal100 = favorite.per100_calories;
          prot100 = favorite.per100_protein;
          carb100 = favorite.per100_carbs;
          fat100 = favorite.per100_fat;
          fib100 = favorite.per100_fiber;
        }
        console.log('[AddFood] handleOpenFavoriteDetails: fallback build, grams=', grams, 'cal100=', cal100);
        offProduct = {
          code: favorite.food_code || '',
          product_name: favorite.food_name,
          brands: favorite.brand || '',
          serving_size: favorite.serving_size || `${Math.round(grams)}g`,
          nutriments: {
            'energy-kcal_100g': cal100,
            'proteins_100g': prot100,
            'carbohydrates_100g': carb100,
            'fat_100g': fat100,
            'fiber_100g': fib100,
            'sugars_100g': 0,
          },
        };
      }

      console.log('[AddFood] Navigating to food-details with favorite data');

      router.push({
        pathname: '/food-details',
        params: {
          offData: JSON.stringify(offProduct),
          meal: mealType,
          date: date,
          context: context || '',
          returnTo: returnTo || '',
          food_item_id: (favorite as any).food_item_id || '',
          mode: mode || '',
          planId: planId || '',
        },
      });
    } catch (error) {
      console.error('[AddFood] Error opening favorite details:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  }, [router, mealType, date, context, returnTo, mode, planId]);

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
      // Calculate nutrition for default serving using calcMacros when food_items JOIN is available
      const favFoodItem = (favorite as any).food_items;
      const grams = favorite.default_grams;
      let calories: number, protein: number, carbs: number, fat: number, fiber: number;
      if (favFoodItem && favFoodItem.serving_size > 0) {
        const m = calcMacros(favFoodItem, grams);
        calories = m.calories; protein = m.protein; carbs = m.carbs; fat = m.fat; fiber = m.fiber;
      } else {
        const multiplier = grams / 100;
        calories = favorite.per100_calories * multiplier;
        protein = favorite.per100_protein * multiplier;
        carbs = favorite.per100_carbs * multiplier;
        fat = favorite.per100_fat * multiplier;
        fiber = favorite.per100_fiber * multiplier;
      }
      console.log('[AddFood] handleQuickAddFavorite: grams=', grams, 'calories=', calories);

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
        food_item_id: (favorite as any).food_item_id || undefined,
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
        const favFoodItemPlan = (favorite as any).food_items;
        const gramsPlan = favorite.default_grams;
        let calPlan: number, protPlan: number, carbPlan: number, fatPlan: number, fibPlan: number;
        if (favFoodItemPlan && favFoodItemPlan.serving_size > 0) {
          const m = calcMacros(favFoodItemPlan, gramsPlan);
          calPlan = m.calories; protPlan = m.protein; carbPlan = m.carbs; fatPlan = m.fat; fibPlan = m.fiber;
        } else {
          const multiplier = gramsPlan / 100;
          calPlan = favorite.per100_calories * multiplier;
          protPlan = favorite.per100_protein * multiplier;
          carbPlan = favorite.per100_carbs * multiplier;
          fatPlan = favorite.per100_fat * multiplier;
          fibPlan = favorite.per100_fiber * multiplier;
        }
        console.log('[AddFood] Adding favorite to meal plan:', planId, favorite.food_name, 'grams=', gramsPlan);
        await addMealPlanItem(planId, {
          date,
          meal_type: mealType,
          food_name: favorite.food_name,
          brand: favorite.brand || undefined,
          quantity: gramsPlan / 100,
          grams: gramsPlan,
          serving_description: favorite.serving_size || formatServing(gramsPlan, 'g'),
          calories: safeNum(calPlan),
          protein: safeNum(protPlan),
          carbs: safeNum(carbPlan),
          fats: safeNum(fatPlan),
          fiber: safeNum(fibPlan),
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

      // Calculate nutrition for default serving using calcMacros when food_items JOIN is available
      const favFoodItemDiary = (favorite as any).food_items;
      const gramsDiary = favorite.default_grams;
      let calories: number, protein: number, carbs: number, fat: number, fiber: number;
      if (favFoodItemDiary && favFoodItemDiary.serving_size > 0) {
        const m = calcMacros(favFoodItemDiary, gramsDiary);
        calories = m.calories; protein = m.protein; carbs = m.carbs; fat = m.fat; fiber = m.fiber;
      } else {
        const multiplier = gramsDiary / 100;
        calories = favorite.per100_calories * multiplier;
        protein = favorite.per100_protein * multiplier;
        carbs = favorite.per100_carbs * multiplier;
        fat = favorite.per100_fat * multiplier;
        fiber = favorite.per100_fiber * multiplier;
      }
      console.log('[AddFood] handleAddFavorite diary: grams=', gramsDiary, 'calories=', calories);

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

      // NORMAL DIARY MODE: Log to diary via RPC
      console.log('[AddFood] Calling log_food RPC for favorite:', favorite.food_name);
      const { data: rpcDataFav, error: rpcErrorFav } = await supabase.rpc('log_food', {
        p_user_id: user.id,
        p_date: date,
        p_meal_type: mealType,
        p_food_id: foodId,
        p_food_item_id: (favorite as any).food_item_id ?? null,
        p_quantity: gramsDiary / 100,
        p_calories: safeNum(calories),
        p_protein: safeNum(protein),
        p_carbs: safeNum(carbs),
        p_fats: safeNum(fat),
        p_fiber: safeNum(fiber),
        p_serving_description: favorite.serving_size || formatServing(gramsDiary, 'g'),
        p_grams: gramsDiary,
        p_logged_at: new Date().toISOString(),
      });

      if (rpcErrorFav) {
        console.error('[AddFood] log_food RPC error for favorite:', rpcErrorFav);
        Alert.alert('Error', 'Failed to add food to meal');
        return;
      }

      const mealId = rpcDataFav?.meal_id;
      console.log('[AddFood] ✅ Favorite added to meal successfully, meal_id:', mealId, 'meal_item_id:', rpcDataFav?.meal_item_id);
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

  const renderSearchResultItem = useCallback((item: SearchResultItem, index: number) => {
    const displayName = item.product.product_name || 'Unknown Product';
    const displayBrand = item.product.brands || '';
    const calories = Math.round(item.displayCalories);
    const protein = Math.round(isFinite(item.displayProtein) ? item.displayProtein : 0);
    const carbs = Math.round(isFinite(item.displayCarbs) ? item.displayCarbs : 0);
    const fat = Math.round(isFinite(item.displayFats) ? item.displayFats : 0);

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
            <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text }]} numberOfLines={1}>
              {displayName}
            </Text>
            {displayBrand ? (
              <Text style={[styles.foodServing, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]} numberOfLines={1}>
                {displayBrand}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 12, color: isDark ? colors.textSecondaryDark : colors.textSecondary }}>
                {item.servingText}
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

          {/* Show quick-add button in my_meals_builder or meal-plan mode */}
          {context === 'my_meals_builder' ? (
            <TouchableOpacity
              style={styles.addButton}
              onPress={(e) => {
                e.stopPropagation();
                console.log('[AddFood] Search result + button pressed:', displayName, 'context: my_meals_builder');
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
                console.log('[AddFood] Search result + button pressed:', displayName, 'mode: meal-plan');
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
              <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text }]} numberOfLines={1}>
                {favorite.food_name}
              </Text>
              {favorite.brand ? (
                <Text style={[styles.foodServing, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]} numberOfLines={1}>
                  {favorite.brand}
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

            {/* Show quick-add button based on context */}
            {context === 'my_meals_builder' ? (
              <TouchableOpacity
                style={styles.addButton}
                onPress={(e) => {
                  e.stopPropagation();
                  console.log('[AddFood] Favorite + button pressed:', favorite.food_name, 'context: my_meals_builder');
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
                  console.log('[AddFood] Favorite + button pressed:', favorite.food_name, 'context:', context);
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

    // MEAL PLAN MODE: add all saved meal items directly to plan
    if (mode === 'meal-plan' && planId) {
      console.log('[AddFood] Meal plan mode — adding saved meal to plan:', planId);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { Alert.alert('Error', 'You must be logged in'); return; }

        const { data: mealItems, error: itemsError } = await supabase
          .from('saved_meal_items')
          .select(`
            id, food_item_id, food_id, food_name, food_brand,
            serving_amount, serving_unit, servings_count,
            calories, protein, carbs, fat, fiber,
            food_items!saved_meal_items_food_item_id_fkey (
              id, name, brand, calories, protein, carbs, fat, fiber, serving_size, macros_per
            )
          `)
          .eq('saved_meal_id', meal.id);

        if (itemsError || !mealItems || mealItems.length === 0) {
          Alert.alert('Error', 'Failed to load meal items');
          return;
        }

        for (const item of mealItems as any[]) {
          const fi = item.food_items;
          const itemName = fi?.name ?? item.food_name ?? 'Unknown';
          let calories = 0, protein = 0, carbs = 0, fats = 0, fiber = 0;

          // Use stored macros first (already correct per serving)
          if (item.calories != null) {
            calories = item.calories;
            protein = item.protein ?? 0;
            carbs = item.carbs ?? 0;
            fats = item.fat ?? 0;
            fiber = item.fiber ?? 0;
          } else if (fi && fi.serving_size && fi.serving_size > 0) {
            // Fallback: calculate from food_items join
            const divisor = fi.macros_per === '100g' ? 100 : fi.serving_size;
            const ratio = (item.serving_amount * item.servings_count) / divisor;
            calories = fi.calories * ratio;
            protein = fi.protein * ratio;
            carbs = fi.carbs * ratio;
            fats = fi.fat * ratio;
            fiber = (fi.fiber ?? 0) * ratio;
          }
          console.log('[AddFood] Adding saved meal item to plan:', itemName, { calories, protein, carbs, fats, fiber });
          await addMealPlanItem(planId, {
            date,
            meal_type: mealType,
            food_name: itemName,
            brand: fi?.brand ?? item.food_brand ?? undefined,
            quantity: item.servings_count,
            grams: item.serving_amount * item.servings_count,
            serving_description: `${item.serving_amount} ${item.serving_unit}`,
            calories: safeNum(calories),
            protein: safeNum(protein),
            carbs: safeNum(carbs),
            fats: safeNum(fats),
            fiber: safeNum(fiber),
          });
        }
        showSuccessBanner('Added to plan');
      } catch (err) {
        console.error('[AddFood] Error adding saved meal to plan:', err);
        Alert.alert('Error', 'Failed to add meal to plan');
      }
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to add meal');
        return;
      }

      // Fetch the saved meal items
      console.log('[AddFood] Fetching saved meal items for diary, meal_id:', meal.id);
      const { data: mealItems, error: itemsError } = await supabase
        .from('saved_meal_items')
        .select(`
          id,
          food_item_id,
          food_id,
          food_name,
          food_brand,
          serving_amount,
          serving_unit,
          servings_count,
          calories,
          protein,
          carbs,
          fat,
          fiber,
          food_items!saved_meal_items_food_item_id_fkey (
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
        `)
        .eq('saved_meal_id', meal.id);

      if (itemsError || !mealItems || mealItems.length === 0) {
        console.error('[AddFood] Error loading meal items:', itemsError);
        Alert.alert('Error', 'Failed to load meal items');
        return;
      }

      console.log('[AddFood] Loaded', mealItems.length, 'items from saved meal');

      // Add each food item from the saved meal via RPC
      console.log('[AddFood] Logging', mealItems.length, 'saved meal items via log_food RPC');

      for (const item of mealItems as any[]) {
        const fi = item.food_items;
        const itemName = fi?.name ?? item.food_name ?? 'Unknown';
        let calories = 0, protein = 0, carbs = 0, fats = 0, fiber = 0;

        if (item.calories != null) {
          // Use stored macros directly — already correct
          calories = item.calories;
          protein = item.protein ?? 0;
          carbs = item.carbs ?? 0;
          fats = item.fat ?? 0;
          fiber = item.fiber ?? 0;
        } else if (fi && fi.serving_size && fi.serving_size > 0) {
          // Fallback: calculate from food_items join
          const divisor = fi.macros_per === '100g' ? 100 : fi.serving_size;
          const ratio = (item.serving_amount * item.servings_count) / divisor;
          calories = fi.calories * ratio;
          protein = fi.protein * ratio;
          carbs = fi.carbs * ratio;
          fats = fi.fat * ratio;
          fiber = (fi.fiber ?? 0) * ratio;
        }

        console.log('[AddFood] Calling log_food RPC for saved meal item:', itemName);
        const { data: rpcData, error: rpcError } = await supabase.rpc('log_food', {
          p_user_id: user.id,
          p_date: date,
          p_meal_type: mealType,
          p_food_id: item.food_id ?? null,
          p_food_item_id: item.food_item_id ?? null,
          p_quantity: item.servings_count,
          p_calories: calories,
          p_protein: protein,
          p_carbs: carbs,
          p_fats: fats,
          p_fiber: fiber,
          p_serving_description: `${item.serving_amount} ${item.serving_unit}`,
          p_grams: item.serving_amount,
          p_logged_at: new Date().toISOString(),
        });

        if (rpcError) {
          console.error('[AddFood] log_food RPC error for saved meal item:', itemName, rpcError);
          Alert.alert('Error', 'Failed to add meal items');
          return;
        }

        console.log('[AddFood] log_food RPC success for', itemName, 'meal_id:', rpcData?.meal_id, 'meal_item_id:', rpcData?.meal_item_id);

        // ── Log food usage (fire-and-forget) ──
        const catalogId: string | null = item.food_item_id ?? null;
        if (catalogId) {
          console.log('[AddFood] Logging food usage for saved meal item, food_item_id:', catalogId);
          logFoodUsage(catalogId, 'search');
        } else {
          console.log('[AddFood] Skipping logFoodUsage for saved meal item — no food_item_id for item:', item.id);
        }
      }

      console.log('[AddFood] ✅ Saved meal added successfully!');

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
  }, [context, date, mealType, showSuccessBanner, mode, planId]);

  const renderSavedMealItem = useCallback((meal: SavedMeal, index: number) => {
    const mealCalories = Math.round(meal.total_calories || 0);
    const mealProtein = Math.round(meal.total_protein || 0);
    const mealCarbs = Math.round(meal.total_carbs || 0);
    const mealFats = Math.round(meal.total_fats || 0);
    const itemCount = meal.item_count || 0;
    const itemLabel = itemCount === 1 ? 'item' : 'items';

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
                <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text }]} numberOfLines={1}>
                  {meal.name}
                </Text>
                <Text style={[styles.foodServing, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]} numberOfLines={1}>
                  {itemCount} {itemLabel}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#E74C3C' }}>P {mealProtein}g</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#3498DB' }}>C {mealCarbs}g</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#F39C12' }}>F {mealFats}g</Text>
                </View>
              </View>

              <View style={{ alignItems: 'flex-end', justifyContent: 'center', marginRight: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: isDark ? colors.textDark : colors.text }}>
                  {mealCalories}
                </Text>
                <Text style={{ fontSize: 11, color: isDark ? colors.textSecondaryDark : colors.textSecondary }}>
                  kcal
                </Text>
              </View>

              {/* Show quick-add button only in meal_log context */}
              {context !== 'my_meals_builder' && (
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    if (!isSwiping) {
                      console.log('[AddFood] Saved meal + button pressed:', meal.name, 'context:', context);
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
      <View style={styles.emptyState}>
        <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
          Search for a food to get started
        </Text>
      </View>
    );
  }, [searchQuery, isSearching, searchError, searchResults, isDark, handleRetrySearch, renderSearchResultItem]);

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
                mode={mode === 'meal-plan' ? 'meal-plan' : (context === 'my_meals_builder' ? 'mymeal' : 'diary')}
                planId={planId || ''}
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
