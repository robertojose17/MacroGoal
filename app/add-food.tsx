
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { getRecentFoods } from '@/utils/foodDatabase';
import { getFavorites, removeFavoriteById, Favorite } from '@/utils/favoritesDatabase';
import { OpenFoodFactsProduct, extractServingSize, extractNutrition } from '@/utils/openFoodFacts';
import { supabase } from '@/app/integrations/supabase/client';
import { Food, MyMeal } from '@/types';

type TabType = 'all' | 'favorites' | 'my-meals' | 'quick-add';

export default function AddFoodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<any>() || {};

  const mode = params.mode ?? "diary";
  const mealType = params.mealType ?? params.meal ?? "breakfast";
  const returnTo = params.returnTo as string | undefined;
  const myMealId = params.mealId as string | undefined;
  
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const date = (params.date as string) || new Date().toISOString().split('T')[0];
  
  const [activeTab, setActiveTab] = useState<TabType>('all');
  
  const [recentFoods, setRecentFoods] = useState<Food[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [myMeals, setMyMeals] = useState<MyMeal[]>([]);
  const [loading, setLoading] = useState(false);

  // INLINE SEARCH STATE
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OpenFoodFactsProduct[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestQueryRef = useRef<string>('');

  const mealLabels: Record<string, string> = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snacks',
  };

  const loadFavorites = async () => {
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
  };

  const loadMyMeals = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[AddFood] No user found for My Meals');
        setMyMeals([]);
        return;
      }

      console.log('[AddFood] Loading My Meals for user:', user.id);

      const { data: mealsData, error } = await supabase
        .from('my_meals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[AddFood] Error loading My Meals:', error);
        setMyMeals([]);
      } else {
        console.log('[AddFood] Loaded', mealsData?.length || 0, 'My Meals');
        setMyMeals(mealsData || []);
      }
    } catch (error) {
      console.error('[AddFood] Error loading My Meals:', error);
      setMyMeals([]);
    }
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const recent = await getRecentFoods();
      setRecentFoods(recent);

      // Load favorites
      await loadFavorites();

      // Load my meals
      await loadMyMeals();

      console.log('[AddFood] Loaded data:', { recent: recent.length });
    } catch (error) {
      console.error('[AddFood] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('[AddFood] Screen focused, loading data');
      loadData();
    }, [loadData])
  );

  /**
   * INLINE SEARCH LOGIC
   * Performs actual OpenFoodFacts API call
   */
  const performSearch = async (query: string) => {
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
  };

  /**
   * Handle search input change with debouncing
   */
  const handleSearchChange = (text: string) => {
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
  };

  /**
   * Retry search after error
   */
  const handleRetrySearch = () => {
    console.log('[AddFood] Retrying search');
    performSearch(searchQuery);
  };

  /**
   * Open food details for a search result
   * FIXED: Use router.replace to close Add Food and show Food Details on top
   */
  const handleOpenSearchResultDetails = (product: OpenFoodFactsProduct) => {
    console.log('[AddFood] ========== OPENING SEARCH RESULT DETAILS ==========');
    console.log('[AddFood] Product:', product.product_name);
    console.log('[AddFood] Using router.replace to close Add Food and show Food Details');

    router.replace({
      pathname: '/food-details',
      params: {
        offData: JSON.stringify(product),
        meal: mealType,
        date: date,
        mode: mode,
        returnTo: '/(tabs)/(home)/',
        mealId: myMealId,
      },
    });
  };

  const handleCopyFromPrevious = () => {
    console.log('[AddFood] Navigating to copy-from-previous');
    router.push({
      pathname: '/copy-from-previous',
      params: {
        meal: mealType,
        date: date,
      },
    });
  };

  const handleQuickAdd = () => {
    console.log('[AddFood] Navigating to quick-add');
    router.push({
      pathname: '/quick-add',
      params: {
        meal: mealType,
        date: date,
        mode: mode,
        returnTo: returnTo,
        mealId: myMealId,
      },
    });
  };

  const handleAIMealEstimator = () => {
    console.log('[AddFood] Navigating to AI Meal Estimator');
    router.push({
      pathname: '/chatbot',
      params: {
        meal: mealType,
        date: date,
        mode: mode,
        returnTo: returnTo,
        mealId: myMealId,
      },
    });
  };

  const handleBarcodeScanner = () => {
    console.log('[AddFood] Navigating to Barcode Scanner');
    router.push({
      pathname: '/barcode-scanner',
      params: {
        meal: mealType,
        date: date,
        mode: mode,
        mealId: myMealId,
      },
    });
  };

  const handleCreateMyMeal = () => {
    console.log('[AddFood] Navigating to create My Meal');
    router.push('/my-meal-builder');
  };

  const handleOpenMyMeal = (meal: MyMeal) => {
    console.log('[AddFood] Opening My Meal details:', meal.id);
    router.push({
      pathname: '/my-meal-details',
      params: {
        mealId: meal.id,
      },
    });
  };

  /**
   * Open food details for a recent food
   * FIXED: Use router.replace to close Add Food and show Food Details on top
   */
  const handleOpenRecentFoodDetails = async (food: Food) => {
    console.log('[AddFood] ========== OPENING RECENT FOOD DETAILS ==========');
    console.log('[AddFood] Food:', food.name);
    console.log('[AddFood] Using router.replace to close Add Food and show Food Details');

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

      console.log('[AddFood] Navigating to food-details with OFF data');

      router.replace({
        pathname: '/food-details',
        params: {
          offData: JSON.stringify(offProduct),
          meal: mealType,
          date: date,
          mode: mode,
          returnTo: '/(tabs)/(home)/',
          mealId: myMealId,
        },
      });
    } catch (error) {
      console.error('[AddFood] Error opening recent food details:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  /**
   * Add a recent food directly
   * MODIFIED: Respect mode parameter
   */
  const handleAddRecentFood = async (food: Food) => {
    console.log('[AddFood] ========== ADD RECENT FOOD ==========');
    console.log('[AddFood] Food:', food.name);
    console.log('[AddFood] Mode:', mode);

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

      // CHECK MODE: If mymeal, return to builder instead of logging to diary
      if (mode === 'mymeal') {
        console.log('[AddFood] Mode is mymeal, returning to builder with food item');

        const newFoodItem = {
          food_id: food.id,
          food: foodData,
          quantity: multiplier,
          calories: calories,
          protein: protein,
          carbs: carbs,
          fats: fats,
          fiber: fiber,
          serving_description: servingDescription,
          grams: gramsToAdd,
        };

        // Use dismissTo to go directly back to the builder with params
        router.dismissTo({
          pathname: returnTo || '/my-meal-builder',
          params: {
            mealId: myMealId || '',
            newFoodItem: JSON.stringify(newFoodItem),
          },
        });

        return;
      }

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

      console.log('[AddFood] Recent food added successfully!');
      console.log('[AddFood] Navigating back to diary');
      
      // Navigate back to the home/diary screen
      router.dismissTo('/(tabs)/(home)/');
    } catch (error) {
      console.error('[AddFood] Error adding recent food:', error);
      Alert.alert('Error', 'An unexpected error occurred while adding food');
    }
  };

  /**
   * Open food details for a favorite
   * FIXED: Use router.replace to close Add Food and show Food Details on top
   */
  const handleOpenFavoriteDetails = async (favorite: Favorite) => {
    console.log('[AddFood] ========== OPENING FAVORITE DETAILS ==========');
    console.log('[AddFood] Favorite:', favorite.food_name);
    console.log('[AddFood] Using router.replace to close Add Food and show Food Details');

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
          mode: mode,
          returnTo: '/(tabs)/(home)/',
          mealId: myMealId,
        },
      });
    } catch (error) {
      console.error('[AddFood] Error opening favorite details:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  /**
   * Handle adding favorite
   * MODIFIED: Respect mode parameter
   */
  const handleAddFavorite = async (favorite: Favorite) => {
    console.log('[AddFood] ========== ADD FAVORITE ==========');
    console.log('[AddFood] Favorite:', favorite.food_name);
    console.log('[AddFood] Mode:', mode);
    
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

      // Get full food data for builder
      const { data: foodData } = await supabase
        .from('foods')
        .select('*')
        .eq('id', foodId)
        .single();

      // CHECK MODE: If mymeal, return to builder instead of logging to diary
      if (mode === 'mymeal') {
        console.log('[AddFood] Mode is mymeal, returning to builder with food item');

        const newFoodItem = {
          food_id: foodId,
          food: foodData,
          quantity: multiplier,
          calories: calories,
          protein: protein,
          carbs: carbs,
          fats: fat,
          fiber: fiber,
          serving_description: favorite.serving_size || `${favorite.default_grams}g`,
          grams: favorite.default_grams,
        };

        // Use dismissTo to go directly back to the builder with params
        router.dismissTo({
          pathname: returnTo || '/my-meal-builder',
          params: {
            mealId: myMealId || '',
            newFoodItem: JSON.stringify(newFoodItem),
          },
        });

        return;
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

      console.log('[AddFood] Favorite added to meal successfully');
      router.dismissTo('/(tabs)/(home)/');
    } catch (error) {
      console.error('[AddFood] Error adding favorite:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  /**
   * Remove a favorite from the list
   */
  const handleRemoveFavorite = async (favoriteId: string) => {
    console.log('[AddFood] ========== REMOVE FAVORITE ==========');
    console.log('[AddFood] Favorite ID to remove:', favoriteId);
    
    Alert.alert(
      'Remove Favorite',
      'Are you sure you want to remove this food from your favorites?',
      [
        { 
          text: 'Cancel', 
          style: 'cancel',
          onPress: () => console.log('[AddFood] Remove canceled by user')
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            console.log('[AddFood] User confirmed removal');
            
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
          },
        },
      ]
    );
  };

  const renderFoodItem = (food: Food, index: number) => {
    const servingText = food.last_serving_description || `${Math.round(food.serving_amount)}g`;
    const macrosText = `P: ${Math.round(food.protein)}g • C: ${Math.round(food.carbs)}g • F: ${Math.round(food.fats)}g`;
    
    return (
      <React.Fragment key={food.id ?? `recent-food-${index}`}>
        <View 
          style={[
            styles.foodCard,
            { backgroundColor: isDark ? colors.cardDark : '#FFFFFF' }
          ]}
        >
          <Pressable
            style={styles.foodInfoPressable}
            onPress={() => handleOpenRecentFoodDetails(food)}
            android_ripple={{ color: 'rgba(0, 0, 0, 0.1)' }}
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
          </Pressable>
          
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => handleAddRecentFood(food)}
            activeOpacity={0.7}
          >
            <IconSymbol
              ios_icon_name="plus"
              android_material_icon_name="add"
              size={20}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </View>
      </React.Fragment>
    );
  };

  const renderSearchResultItem = (product: OpenFoodFactsProduct, index: number) => {
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
        <View 
          style={[
            styles.foodCard,
            { backgroundColor: isDark ? colors.cardDark : '#FFFFFF' }
          ]}
        >
          <Pressable
            style={styles.foodInfoPressable}
            onPress={() => handleOpenSearchResultDetails(product)}
            android_ripple={{ color: 'rgba(0, 0, 0, 0.1)' }}
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
          </Pressable>
          
          <View style={styles.chevronContainer}>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="chevron_right"
              size={20}
              color={isDark ? colors.textSecondaryDark : colors.textSecondary}
            />
          </View>
        </View>
      </React.Fragment>
    );
  };

  const renderFavoriteItem = (favorite: Favorite, index: number) => {
    const multiplier = favorite.default_grams / 100;
    const calories = Math.round(favorite.per100_calories * multiplier);
    const protein = Math.round(favorite.per100_protein * multiplier);
    const carbs = Math.round(favorite.per100_carbs * multiplier);
    const fat = Math.round(favorite.per100_fat * multiplier);

    const servingText = favorite.serving_size || `${favorite.default_grams}g`;
    const macrosText = `P: ${protein}g • C: ${carbs}g • F: ${fat}g`;

    return (
      <React.Fragment key={favorite.id ?? `favorite-${index}`}>
        <View 
          style={[
            styles.foodCard,
            { backgroundColor: isDark ? colors.cardDark : '#FFFFFF' }
          ]}
        >
          <Pressable
            style={styles.foodInfoPressable}
            onPress={() => handleOpenFavoriteDetails(favorite)}
            android_ripple={{ color: 'rgba(0, 0, 0, 0.1)' }}
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
          </Pressable>
          
          <View style={styles.favoriteActions}>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => handleAddFavorite(favorite)}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="plus"
                android_material_icon_name="add"
                size={20}
                color="#FFFFFF"
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => handleRemoveFavorite(favorite.id)}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="trash"
                android_material_icon_name="delete"
                size={18}
                color="#FF3B30"
              />
            </TouchableOpacity>
          </View>
        </View>
      </React.Fragment>
    );
  };

  const renderMyMealCard = (meal: MyMeal, index: number) => {
    return (
      <React.Fragment key={meal.id ?? `my-meal-${index}`}>
        <TouchableOpacity
          style={[
            styles.mealCard,
            { backgroundColor: isDark ? colors.cardDark : '#FFFFFF' }
          ]}
          onPress={() => handleOpenMyMeal(meal)}
          activeOpacity={0.7}
        >
          <View style={styles.mealInfo}>
            <Text style={[styles.mealName, { color: isDark ? colors.textDark : colors.text }]}>
              {meal.name}
            </Text>
            {meal.note && (
              <Text style={[styles.mealNote, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {meal.note}
              </Text>
            )}
            <View style={styles.mealStats}>
              <Text style={[styles.mealCalories, { color: colors.calories }]}>
                {Math.round(meal.total_calories)} cal
              </Text>
              <Text style={[styles.mealMacros, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                P: {Math.round(meal.total_protein)}g • C: {Math.round(meal.total_carbs)}g • F: {Math.round(meal.total_fats)}g
              </Text>
            </View>
          </View>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron_right"
            size={20}
            color={isDark ? colors.textSecondaryDark : colors.textSecondary}
          />
        </TouchableOpacity>
      </React.Fragment>
    );
  };

  const renderListContent = () => {
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
  };

  return (
    <SafeAreaView 
      style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : '#F5F5F5' }]} 
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
          {mode === 'mymeal' ? 'Add to My Meal' : `Add to ${mealLabels[mealType]}`}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.searchContainer, { backgroundColor: isDark ? colors.backgroundDark : '#F5F5F5' }]}>
        <View 
          style={[
            styles.searchBar,
            { 
              backgroundColor: isDark ? colors.cardDark : '#FFFFFF',
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
        <View style={[styles.tabContainer, { backgroundColor: isDark ? colors.backgroundDark : '#F5F5F5' }]}>
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
                <View style={styles.quickActionsGrid}>
                  <TouchableOpacity
                    style={[styles.quickActionCard, styles.quickActionCardGreen]}
                    onPress={handleCopyFromPrevious}
                    activeOpacity={0.7}
                  >
                    <View style={styles.quickActionIconContainer}>
                      <IconSymbol
                        ios_icon_name="calendar"
                        android_material_icon_name="event"
                        size={28}
                        color="#10B981"
                      />
                    </View>
                    <Text style={styles.quickActionTitle}>
                      Copy from Previous
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.quickActionCard, styles.quickActionCardYellow]}
                    onPress={handleAIMealEstimator}
                    activeOpacity={0.7}
                  >
                    <View style={styles.quickActionIconContainer}>
                      <IconSymbol
                        ios_icon_name="sparkles"
                        android_material_icon_name="auto_awesome"
                        size={28}
                        color="#F59E0B"
                      />
                    </View>
                    <Text style={styles.quickActionTitle}>
                      AI Meal Estimator
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.quickActionCard, styles.quickActionCardPurple]}
                    onPress={handleBarcodeScanner}
                    activeOpacity={0.7}
                  >
                    <View style={styles.quickActionIconContainer}>
                      <IconSymbol
                        ios_icon_name="barcode.viewfinder"
                        android_material_icon_name="qr_code_scanner"
                        size={28}
                        color="#8B5CF6"
                      />
                    </View>
                    <Text style={styles.quickActionTitle}>
                      Barcode Scan
                    </Text>
                  </TouchableOpacity>
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

            {activeTab === 'my-meals' && (
              <React.Fragment>
                <TouchableOpacity
                  style={[styles.createButton, { backgroundColor: colors.primary }]}
                  onPress={handleCreateMyMeal}
                  activeOpacity={0.7}
                >
                  <IconSymbol
                    ios_icon_name="plus.circle.fill"
                    android_material_icon_name="add_circle"
                    size={24}
                    color="#FFFFFF"
                  />
                  <Text style={styles.createButtonText}>Create My Meal</Text>
                </TouchableOpacity>

                <Text style={[styles.sectionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Saved Meals
                </Text>

                {loading ? (
                  <View style={styles.emptyState}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.md }]}>
                      Loading...
                    </Text>
                  </View>
                ) : myMeals.length === 0 ? (
                  <View style={styles.emptyState}>
                    <IconSymbol
                      ios_icon_name="fork.knife"
                      android_material_icon_name="restaurant"
                      size={64}
                      color={isDark ? colors.textSecondaryDark : colors.textSecondary}
                    />
                    <Text style={[styles.emptyText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.md }]}>
                      No saved meals yet
                    </Text>
                    <Text style={[styles.emptySubtext, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, marginTop: spacing.xs }]}>
                      Create a meal template to quickly log your favorite meals
                    </Text>
                  </View>
                ) : (
                  myMeals.map((meal, index) => renderMyMealCard(meal, index))
                )}
              </React.Fragment>
            )}

            {activeTab === 'quick-add' && (
              <View style={styles.quickAddContainer}>
                <Text style={[styles.sectionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Quick Add Calories
                </Text>
                <TouchableOpacity
                  style={[styles.quickAddButton, { backgroundColor: colors.primary }]}
                  onPress={handleQuickAdd}
                  activeOpacity={0.7}
                >
                  <IconSymbol
                    ios_icon_name="pencil"
                    android_material_icon_name="edit"
                    size={24}
                    color="#FFFFFF"
                  />
                  <Text style={styles.quickAddButtonText}>
                    Manually Enter Calories & Macros
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </React.Fragment>
        )}

        <View style={{ height: 100 }} />
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
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  quickActionCard: {
    width: '48.5%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg + spacing.sm,
    borderRadius: borderRadius.lg,
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.06)',
    elevation: 1,
  },
  quickActionCardGreen: {
    backgroundColor: '#D1FAE5',
  },
  quickActionCardYellow: {
    backgroundColor: '#FEF3C7',
  },
  quickActionCardPurple: {
    backgroundColor: '#EDE9FE',
  },
  quickActionIconContainer: {
    marginBottom: spacing.sm,
  },
  quickActionTitle: {
    ...typography.bodyBold,
    fontSize: 14,
    color: '#1F2937',
    textAlign: 'center',
  },
  foodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
    elevation: 1,
    overflow: 'hidden',
  },
  foodInfoPressable: {
    flex: 1,
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
  favoriteActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    marginVertical: spacing.md,
  },
  chevronContainer: {
    paddingRight: spacing.md,
    paddingVertical: spacing.md,
  },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
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
  quickAddContainer: {
    paddingTop: spacing.md,
  },
  quickAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  quickAddButtonText: {
    ...typography.bodyBold,
    fontSize: 16,
    color: '#FFFFFF',
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
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  createButtonText: {
    ...typography.bodyBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  mealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
    elevation: 1,
  },
  mealInfo: {
    flex: 1,
  },
  mealName: {
    ...typography.bodyBold,
    fontSize: 16,
    marginBottom: 4,
  },
  mealNote: {
    ...typography.caption,
    fontSize: 13,
    marginBottom: 6,
  },
  mealStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mealCalories: {
    ...typography.bodyBold,
    fontSize: 14,
  },
  mealMacros: {
    ...typography.caption,
    fontSize: 12,
  },
});
