
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
import { supabase } from '@/app/integrations/supabase/client';
import { Food } from '@/types';
import { addToDraft } from '@/utils/myMealsDraft';
import QuickAddHome from '@/components/QuickAddHome';

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
  
  console.log('[AddFood] ========== SCREEN LOADED ==========');
  console.log('[AddFood] Context:', context);
  console.log('[AddFood] Meal Type:', mealType);
  console.log('[AddFood] Return To:', returnTo);
  
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const date = (params.date as string) || new Date().toISOString().split('T')[0];
  
  const [activeTab, setActiveTab] = useState<TabType>('all');
  
  const [recentFoods, setRecentFoods] = useState<Food[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSavedMeals, setLoadingSavedMeals] = useState(false);

  // INLINE SEARCH STATE
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OpenFoodFactsProduct[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestQueryRef = useRef<string>('');

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
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
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
   * INLINE SEARCH LOGIC
   * Performs actual OpenFoodFacts API call
   */
  const performSearch = useCallback(async (query: string) => {
    console.log('[AddFood] ========== PERFORM SEARCH ==========');
    console.log('[AddFood] Query:', query);
    console.log('[AddFood] Latest query ref:', latestQueryRef.current);
    
    // Update latest query ref
    latestQueryRef.current = query;
    
    // Clear previous results and errors
    setSearchResults([]);
    setSearchError(null);
    
    // Empty query - do nothing (Recent Foods will show)
    if (query.trim().length === 0) {
      console.log('[AddFood] Empty query, showing Recent Foods');
      setIsSearching(false);
      return;
    }
    
    // Less than 2 characters - do nothing
    if (query.trim().length < 2) {
      console.log('[AddFood] Query too short, waiting for more characters');
      setIsSearching(false);
      return;
    }
    
    // Start searching
    setIsSearching(true);
    console.log('[AddFood] Starting OpenFoodFacts search...');
    
    try {
      // URL-encode the query
      const encodedQuery = encodeURIComponent(query.trim());
      
      // Use the exact endpoint specified in requirements
      const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodedQuery}&search_simple=1&action=process&json=1&page_size=20`;
      
      console.log('[AddFood] Fetching:', url);
      
      // Fetch with User-Agent header
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'EliteMacroTracker/1.0 (iOS)',
        },
      });
      
      console.log('[AddFood] Response status:', response.status);
      
      // Check if this search is still relevant
      if (query !== latestQueryRef.current) {
        console.log('[AddFood] Search result outdated, ignoring');
        return;
      }
      
      if (!response.ok) {
        console.error('[AddFood] HTTP error:', response.status);
        setSearchError('Network error. Please check your connection and try again.');
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      
      const data = await response.json();
      
      console.log('[AddFood] Response data:', {
        hasProducts: !!data.products,
        isArray: Array.isArray(data.products),
        count: data.products?.length || 0,
      });
      
      // Check if this search is still relevant (again, after async operation)
      if (query !== latestQueryRef.current) {
        console.log('[AddFood] Search result outdated after parsing, ignoring');
        return;
      }
      
      // Safe parsing - handle missing or invalid products array
      const products = Array.isArray(data.products) ? data.products : [];
      
      if (products.length === 0) {
        console.log('[AddFood] No products found');
        setSearchError('No foods found. Try a different search term.');
        setSearchResults([]);
      } else {
        console.log('[AddFood] Found', products.length, 'products');
        setSearchResults(products);
        setSearchError(null);
      }
    } catch (error) {
      console.error('[AddFood] Search error:', error);
      
      // Check if this search is still relevant
      if (query !== latestQueryRef.current) {
        console.log('[AddFood] Search error for outdated query, ignoring');
        return;
      }
      
      setSearchError('An error occurred. Please try again.');
      setSearchResults([]);
    } finally {
      // Only update loading state if this is still the latest query
      if (query === latestQueryRef.current) {
        setIsSearching(false);
      }
    }
  }, []);

  /**
   * Handle search input change with debouncing
   */
  const handleSearchChange = useCallback((text: string) => {
    console.log('[AddFood] Search input changed:', text);
    setSearchQuery(text);
    
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // If query is empty, clear results immediately
    if (text.trim().length === 0) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      latestQueryRef.current = '';
      return;
    }
    
    // Show searching state immediately for queries >= 2 chars
    if (text.trim().length >= 2) {
      setIsSearching(true);
    }
    
    // Debounce search with 500ms delay
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(text);
    }, 500);
  }, [performSearch]);

  /**
   * Retry search after error
   */
  const handleRetrySearch = useCallback(() => {
    console.log('[AddFood] Retrying search');
    performSearch(searchQuery);
  }, [searchQuery, performSearch]);

  /**
   * Open food details for a search result
   * CRITICAL: Pass context through to Food Details
   */
  const handleOpenSearchResultDetails = useCallback((product: OpenFoodFactsProduct) => {
    console.log('[AddFood] ========== OPENING SEARCH RESULT DETAILS ==========');
    console.log('[AddFood] Product:', product.product_name);
    console.log('[AddFood] Context:', context);
    console.log('[AddFood] CRITICAL: Passing context to Food Details');

    router.replace({
      pathname: '/food-details',
      params: {
        offData: JSON.stringify(product),
        meal: mealType,
        date: date,
        context: context || '',
        returnTo: returnTo || '/(tabs)/(home)/',
      },
    });
  }, [router, mealType, date, context, returnTo]);

  /**
   * FAST ADD: Add search result directly to My Meal draft
   * Only available in my_meals_builder context
   */
  const handleQuickAddSearchResult = useCallback(async (product: OpenFoodFactsProduct) => {
    console.log('[AddFood] ========== QUICK ADD SEARCH RESULT ==========');
    console.log('[AddFood] Product:', product.product_name);
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
            calories: nutrition.calories,
            protein: nutrition.protein,
            carbs: nutrition.carbs,
            fats: nutrition.fat,
            fiber: nutrition.fiber,
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
        calories: calories,
        protein: protein,
        carbs: carbs,
        fats: fat,
        fiber: fiber,
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
    
    router.push({
      pathname: '/copy-from-previous',
      params: {
        meal: mealType,
        date: date,
        context: context || '',
        returnTo: returnTo,
      },
    });
  }, [router, mealType, date, context, returnTo]);

  const handleAIMealEstimator = useCallback(() => {
    console.log('[AddFood] ========== NAVIGATING TO AI MEAL ESTIMATOR ==========');
    console.log('[AddFood] Context:', context);
    console.log('[AddFood] CRITICAL: Passing context to AI Meal Estimator');
    
    router.push({
      pathname: '/chatbot',
      params: {
        meal: mealType,
        date: date,
        context: context || '',
        returnTo: returnTo,
      },
    });
  }, [router, mealType, date, context, returnTo]);

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
    console.log('[AddFood] CRITICAL: Passing context to Barcode Scanner');
    
    router.push({
      pathname: '/barcode-scanner',
      params: {
        meal: mealType,
        date: date,
        context: context || '',
        returnTo: returnTo,
      },
    });
  }, [router, mealType, date, context, returnTo]);

  /**
   * Open food details for a recent food
   * CRITICAL: Pass context through to Food Details
   */
  const handleOpenRecentFoodDetails = useCallback(async (food: Food) => {
    console.log('[AddFood] ========== OPENING RECENT FOOD DETAILS ==========');
    console.log('[AddFood] Food:', food.name);
    console.log('[AddFood] Food ID:', food.id);
    console.log('[AddFood] Context:', context);
    console.log('[AddFood] CRITICAL: Passing context to Food Details');

    try {
      // Fetch the full food data from database to get per-100g values
      const { data: foodData, error: foodError } = await supabase
        .from('foods')
        .select('*')
        .eq('id', food.id)
        .single();

      if (foodError || !foodData) {
        console.error('[AddFood] Error fetching food data:', foodError);
        Alert.alert('Error', 'Failed to load food details');
        return;
      }

      console.log('[AddFood] ✅ Food data fetched successfully');

      // Convert to OpenFoodFacts format for the food-details screen
      const offProduct = {
        code: foodData.barcode || '',
        product_name: foodData.name,
        brands: foodData.brand || '',
        serving_size: food.last_serving_description || `${Math.round(food.serving_amount)} g`,
        nutriments: {
          'energy-kcal_100g': foodData.calories,
          'proteins_100g': foodData.protein,
          'carbohydrates_100g': foodData.carbs,
          'fat_100g': foodData.fats,
          'fiber_100g': foodData.fiber,
          'sugars_100g': 0,
        },
      };

      router.replace({
        pathname: '/food-details',
        params: {
          offData: JSON.stringify(offProduct),
          meal: mealType,
          date: date,
          context: context || '',
          returnTo: returnTo || '/(tabs)/(home)/',
        },
      });

      console.log('[AddFood] ✅ Navigation triggered successfully');
    } catch (error) {
      console.error('[AddFood] Error opening recent food details:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  }, [router, mealType, date, context, returnTo]);

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
      // Fetch the full food data from database to get per-100g values
      const { data: foodData, error: foodError } = await supabase
        .from('foods')
        .select('*')
        .eq('id', food.id)
        .single();

      if (foodError || !foodData) {
        console.error('[AddFood] Error fetching food data:', foodError);
        Alert.alert('Error', 'Failed to load food details');
        return;
      }

      // Use the food's serving_amount as the default (this is the grams from last time)
      const gramsToAdd = food.serving_amount;
      const multiplier = gramsToAdd / 100;

      // Calculate nutrition for the default serving
      const calories = foodData.calories * multiplier;
      const protein = foodData.protein * multiplier;
      const carbs = foodData.carbs * multiplier;
      const fats = foodData.fats * multiplier;
      const fiber = foodData.fiber * multiplier;

      // Add to draft
      await addToDraft({
        food_id: food.id,
        food_name: food.name,
        food_brand: food.brand || undefined,
        serving_amount: gramsToAdd,
        serving_unit: 'g',
        servings_count: 1,
        calories: calories,
        protein: protein,
        carbs: carbs,
        fats: fats,
        fiber: fiber,
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
  const handleAddRecentFood = useCallback(async (food: Food) => {
    console.log('[AddFood] ========== ADD RECENT FOOD ==========');
    console.log('[AddFood] Food:', food.name);
    console.log('[AddFood] Context:', context);

    // CRITICAL: If in my_meals_builder context, don't allow quick add
    if (context === 'my_meals_builder') {
      console.log('[AddFood] ❌ Cannot quick-add in my_meals_builder context');
      Alert.alert('Not Available', 'Please tap the food to view details and add it to your meal.');
      return;
    }

    try {
      // Get the food from database to get per-100g values
      const { data: foodData, error: foodError } = await supabase
        .from('foods')
        .select('*')
        .eq('id', food.id)
        .single();

      if (foodError || !foodData) {
        console.error('[AddFood] Error fetching food data:', foodError);
        Alert.alert('Error', 'Failed to load food details');
        return;
      }

      // Use the food's serving_amount as the default (this is the grams from last time)
      const gramsToAdd = food.serving_amount;
      const servingDescription = food.last_serving_description || `${Math.round(gramsToAdd)} g`;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to add food');
        return;
      }

      const multiplier = gramsToAdd / 100;

      // Calculate nutrition for the default serving
      const calories = foodData.calories * multiplier;
      const protein = foodData.protein * multiplier;
      const carbs = foodData.carbs * multiplier;
      const fats = foodData.fats * multiplier;
      const fiber = foodData.fiber * multiplier;

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
          food_id: food.id,
          quantity: multiplier,
          calories: calories,
          protein: protein,
          carbs: carbs,
          fats: fats,
          fiber: fiber,
          serving_description: servingDescription,
          grams: gramsToAdd,
        });

      if (mealItemError) {
        console.error('[AddFood] Error creating meal item:', mealItemError);
        Alert.alert('Error', 'Failed to add food to meal');
        return;
      }

      console.log('[AddFood] ✅ Recent food added successfully!');
      console.log('[AddFood] Triggering success banner');
      
      // Show success banner (will interrupt if one is already showing)
      showSuccessBanner();
      
      console.log('[AddFood] Keeping modal open for multiple adds');
    } catch (error) {
      console.error('[AddFood] Error adding recent food:', error);
      Alert.alert('Error', 'An unexpected error occurred while adding food');
    }
  }, [context, date, mealType, showSuccessBanner]);

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
        serving_size: favorite.serving_size || `${favorite.default_grams}g`,
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

      router.replace({
        pathname: '/food-details',
        params: {
          offData: JSON.stringify(offProduct),
          meal: mealType,
          date: date,
          context: context || '',
          returnTo: returnTo || '/(tabs)/(home)/',
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
            calories: favorite.per100_calories,
            protein: favorite.per100_protein,
            carbs: favorite.per100_carbs,
            fats: favorite.per100_fat,
            fiber: favorite.per100_fiber,
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
        calories: calories,
        protein: protein,
        carbs: carbs,
        fats: fat,
        fiber: fiber,
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
            calories: favorite.per100_calories,
            protein: favorite.per100_protein,
            carbs: favorite.per100_carbs,
            fats: favorite.per100_fat,
            fiber: favorite.per100_fiber,
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
          calories: calories,
          protein: protein,
          carbs: carbs,
          fats: fat,
          fiber: fiber,
          serving_description: favorite.serving_size || `${favorite.default_grams}g`,
          grams: favorite.default_grams,
        });

      if (mealItemError) {
        console.error('[AddFood] Error adding meal item:', mealItemError);
        Alert.alert('Error', 'Failed to add food to meal');
        return;
      }

      console.log('[AddFood] ✅ Favorite added to meal successfully');
      console.log('[AddFood] Triggering success banner');
      
      // Show success banner (will interrupt if one is already showing)
      showSuccessBanner();
      
      console.log('[AddFood] Keeping modal open for multiple adds');
    } catch (error) {
      console.error('[AddFood] Error adding favorite:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  }, [context, date, mealType, showSuccessBanner]);

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
    const servingText = food.last_serving_description || `${Math.round(food.serving_amount)}g`;
    const macrosText = `P: ${Math.round(food.protein)}g • C: ${Math.round(food.carbs)}g • F: ${Math.round(food.fats)}g`;
    
    return (
      <React.Fragment key={food.id ?? `recent-food-${index}`}>
        <TouchableOpacity 
          style={[
            styles.foodCard,
            { backgroundColor: isDark ? colors.cardDark : colors.card }
          ]}
          onPress={() => handleOpenRecentFoodDetails(food)}
          activeOpacity={0.7}
        >
          <View style={styles.foodInfo}>
            <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text }]}>
              {food.name}
            </Text>
            <Text style={[styles.foodServing, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {food.brand ? `${food.brand} • ` : ''}{servingText} • {Math.round(food.calories)} cal
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
                handleQuickAddRecentFood(food);
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
                handleAddRecentFood(food);
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
      </React.Fragment>
    );
  }, [isDark, context, handleOpenRecentFoodDetails, handleQuickAddRecentFood, handleAddRecentFood]);

  const renderSearchResultItem = useCallback((product: OpenFoodFactsProduct, index: number) => {
    const nutrition = extractNutrition(product);
    const serving = extractServingSize(product);
    
    const displayName = product.product_name || 'Unknown Product';
    const displayBrand = product.brands || '';
    const servingText = serving.displayText;
    const calories = Math.round(nutrition.calories * (serving.grams / 100));
    const protein = Math.round(nutrition.protein * (serving.grams / 100));
    const carbs = Math.round(nutrition.carbs * (serving.grams / 100));
    const fat = Math.round(nutrition.fat * (serving.grams / 100));
    const macrosText = `P: ${protein}g • C: ${carbs}g • F: ${fat}g`;
    
    return (
      <React.Fragment key={product.code ?? `search-result-${index}`}>
        <TouchableOpacity 
          style={[
            styles.foodCard,
            { backgroundColor: isDark ? colors.cardDark : colors.card }
          ]}
          onPress={() => handleOpenSearchResultDetails(product)}
          activeOpacity={0.7}
        >
          <View style={styles.foodInfo}>
            <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text }]}>
              {displayName}
            </Text>
            <Text style={[styles.foodServing, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {displayBrand ? `${displayBrand} • ` : ''}{servingText} • {calories} cal
            </Text>
            <Text style={[styles.foodMacros, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {macrosText}
            </Text>
          </View>
          
          {/* Show quick-add button only in my_meals_builder context */}
          {context === 'my_meals_builder' ? (
            <TouchableOpacity
              style={styles.addButton}
              onPress={(e) => {
                e.stopPropagation();
                handleQuickAddSearchResult(product);
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
  }, [isDark, context, handleOpenSearchResultDetails, handleQuickAddSearchResult]);

  const renderFavoriteItem = useCallback((favorite: Favorite, index: number) => {
    const multiplier = favorite.default_grams / 100;
    const calories = Math.round(favorite.per100_calories * multiplier);
    const protein = Math.round(favorite.per100_protein * multiplier);
    const carbs = Math.round(favorite.per100_carbs * multiplier);
    const fat = Math.round(favorite.per100_fat * multiplier);

    const servingText = favorite.serving_size || `${favorite.default_grams}g`;
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
      
      if (isSearching) {
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
            {searchResults.map((product, index) => renderSearchResultItem(product, index))}
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
        {recentFoods.length > 0 ? (
          recentFoods.map((food, index) => renderFoodItem(food, index))
        ) : (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              No recent foods yet
            </Text>
          </View>
        )}
      </React.Fragment>
    );
  }, [searchQuery, isSearching, searchError, searchResults, recentFoods, isDark, handleRetrySearch, renderSearchResultItem, renderFoodItem]);

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
