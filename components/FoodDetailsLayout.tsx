
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Platform, ActivityIndicator, Alert, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { OpenFoodFactsProduct, extractServingSize, extractNutrition, ServingSizeInfo } from '@/utils/openFoodFacts';
import { isFavorite, toggleFavorite } from '@/utils/favoritesDatabase';
import { addToDraft } from '@/utils/myMealsDraft';

// Unit conversion factors (grams as base)
const UNIT_CONVERSIONS: Record<string, number> = {
  'g': 1,
  'oz': 28.3495,
  'ml': 1, // Approximate for water-like liquids
  'cup': 240,
  'tbsp': 15,
  'tsp': 5,
};

type ServingUnit = 'g' | 'oz' | 'ml' | 'cup' | 'tbsp' | 'tsp';
type ServingOption = ServingUnit | 'portion';

interface FoodDetailsLayoutProps {
  mode: 'view' | 'edit';
  // For view mode (Food Details)
  offData?: string;
  mealType?: string;
  date?: string;
  context?: string;
  returnTo?: string;
  // For edit mode (Full Edit)
  itemId?: string;
  onSaveComplete?: () => void;
}

export default function FoodDetailsLayout({
  mode,
  offData,
  mealType = 'breakfast',
  date = new Date().toISOString().split('T')[0],
  context,
  returnTo,
  itemId,
  onSaveComplete,
}: FoodDetailsLayoutProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [product, setProduct] = useState<OpenFoodFactsProduct | null>(null);
  const [servingInfo, setServingInfo] = useState<ServingSizeInfo | null>(null);
  const [nutrition, setNutrition] = useState<any>(null);
  
  // CRITICAL: baseServingGrams represents the weight of ONE PORTION
  // This is extracted from the nutrition table's serving size
  // When "portion" is selected, this is the grams per portion
  const [baseServingGrams, setBaseServingGrams] = useState(100);
  
  // Current serving controls
  const [servingAmount, setServingAmount] = useState('1');
  const [servingUnit, setServingUnit] = useState<ServingUnit>('g');
  const [numberOfServings, setNumberOfServings] = useState('1');
  const [selectedOption, setSelectedOption] = useState<ServingOption>('portion');
  
  const [saving, setSaving] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [nutritionExpanded, setNutritionExpanded] = useState(false);

  // Edit mode specific state
  const [editItem, setEditItem] = useState<any>(null);
  const [editLoading, setEditLoading] = useState(false);

  const isMountedRef = useRef(true);

  const [bannerQueue, setBannerQueue] = useState<string[]>([]);
  const [currentBanner, setCurrentBanner] = useState<string | null>(null);
  const [bannerOpacity] = useState(new Animated.Value(0));
  const isShowingBannerRef = useRef(false);
  const bannerTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadEditItem = useCallback(async () => {
    if (!itemId) return;

    try {
      setEditLoading(true);
      console.log('[FoodDetailsLayout] ========== LOADING EDIT ITEM ==========');
      console.log('[FoodDetailsLayout] Item ID:', itemId);
      
      const { data, error } = await supabase
        .from('meal_items')
        .select(`
          *,
          foods (
            id,
            name,
            brand,
            serving_amount,
            serving_unit,
            calories,
            protein,
            carbs,
            fats,
            fiber,
            user_created,
            barcode
          )
        `)
        .eq('id', itemId)
        .single();

      if (error) {
        console.error('[FoodDetailsLayout] Error loading item:', error);
        Alert.alert('Error', 'Failed to load food item');
        router.back();
        return;
      }

      console.log('[FoodDetailsLayout] ✅ Edit item loaded:', {
        id: data.id,
        quantity: data.quantity,
        grams: data.grams,
        serving_description: data.serving_description,
        food_name: data.foods?.name,
      });
      
      setEditItem(data);

      // Convert to OpenFoodFacts format for consistency
      const productData: OpenFoodFactsProduct = {
        code: data.foods?.barcode || '',
        product_name: data.foods?.name || 'Unknown Product',
        brands: data.foods?.brand || '',
        serving_size: `${data.foods?.serving_amount || 100} ${data.foods?.serving_unit || 'g'}`,
        nutriments: {
          'energy-kcal_100g': data.foods?.calories || 0,
          'proteins_100g': data.foods?.protein || 0,
          'carbohydrates_100g': data.foods?.carbs || 0,
          'fat_100g': data.foods?.fats || 0,
          'fiber_100g': data.foods?.fiber || 0,
          'sugars_100g': 0,
          'sodium_100g': 0,
          'saturated-fat_100g': 0,
        },
      };

      setProduct(productData);

      const serving = extractServingSize(productData);
      setServingInfo(serving);

      // CRITICAL FIX: Use the actual logged grams and quantity
      // data.grams = total logged grams (e.g., 45g for 1 serving of 45g)
      // data.quantity = number of servings (e.g., 1)
      // We need: per-serving grams = total grams / quantity
      
      console.log('[FoodDetailsLayout] ========== CALCULATING SERVING SIZE ==========');
      console.log('[FoodDetailsLayout] Logged data from database:');
      console.log('[FoodDetailsLayout]   - Total grams:', data.grams);
      console.log('[FoodDetailsLayout]   - Quantity (servings):', data.quantity);
      console.log('[FoodDetailsLayout]   - Serving description:', data.serving_description);
      
      // CRITICAL: Use the actual logged grams, not the default serving size
      const totalLoggedGrams = data.grams || 100;
      const loggedQuantity = data.quantity || 1;
      const perServingGrams = totalLoggedGrams / loggedQuantity;
      
      console.log('[FoodDetailsLayout] Calculated values:');
      console.log('[FoodDetailsLayout]   - Per-serving grams:', perServingGrams);
      console.log('[FoodDetailsLayout]   - This is what should appear in the input field');
      
      setBaseServingGrams(perServingGrams);

      // Set to portion mode
      setServingUnit('g');
      setSelectedOption('portion');

      // Set serving amount to the quantity (number of portions)
      console.log('[FoodDetailsLayout] Setting servingAmount to:', loggedQuantity.toString());
      setServingAmount(loggedQuantity.toString());

      // Set number of servings
      console.log('[FoodDetailsLayout] Setting numberOfServings to:', loggedQuantity.toString());
      setNumberOfServings(loggedQuantity.toString());

      const nutritionData = extractNutrition(productData);
      setNutrition(nutritionData);

      console.log('[FoodDetailsLayout] ✅ Edit mode initialized with:');
      console.log('[FoodDetailsLayout]   - Serving Amount:', loggedQuantity);
      console.log('[FoodDetailsLayout]   - Per-portion grams:', perServingGrams);
      console.log('[FoodDetailsLayout]   - Total Grams:', totalLoggedGrams);

      setIsReady(true);
      setEditLoading(false);

      checkFavoriteStatus(productData);
    } catch (error) {
      console.error('[FoodDetailsLayout] Error in loadEditItem:', error);
      Alert.alert('Error', 'An unexpected error occurred');
      router.back();
      setEditLoading(false);
    }
  }, [itemId, router]);

  // Load data for edit mode
  useEffect(() => {
    if (mode === 'edit' && itemId) {
      loadEditItem();
    }
  }, [mode, itemId, loadEditItem]);

  const loadViewData = useCallback(() => {
    console.log('[FoodDetailsLayout] ========== LOADING VIEW DATA ==========');
    console.log('[FoodDetailsLayout] Mode:', mode);
    console.log('[FoodDetailsLayout] Context:', context);
    console.log('[FoodDetailsLayout] Meal:', mealType);
    console.log('[FoodDetailsLayout] Date:', date);
    console.log('[FoodDetailsLayout] returnTo:', returnTo);
    
    if (!offData) {
      console.error('[FoodDetailsLayout] ❌ No offData provided');
      Alert.alert('Error', 'No product data available', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
      return;
    }

    try {
      console.log('[FoodDetailsLayout] Parsing OpenFoodFacts data...');
      const parsed = JSON.parse(offData);
      
      console.log('[FoodDetailsLayout] ✅ Parsed successfully');
      console.log('[FoodDetailsLayout] Product name:', parsed.product_name || 'Unknown');
      console.log('[FoodDetailsLayout] Brand:', parsed.brands || 'Unknown');
      console.log('[FoodDetailsLayout] Code:', parsed.code || 'N/A');
      console.log('[FoodDetailsLayout] Has nutriments:', !!parsed.nutriments);
      
      const productWithDefaults: OpenFoodFactsProduct = {
        code: parsed.code || '',
        product_name: parsed.product_name || 'Unknown Product',
        brands: parsed.brands || '',
        serving_size: parsed.serving_size || '100 g',
        nutriments: {
          'energy-kcal_100g': parsed.nutriments?.['energy-kcal_100g'] || 0,
          'proteins_100g': parsed.nutriments?.['proteins_100g'] || 0,
          'carbohydrates_100g': parsed.nutriments?.['carbohydrates_100g'] || 0,
          'fat_100g': parsed.nutriments?.['fat_100g'] || 0,
          'fiber_100g': parsed.nutriments?.['fiber_100g'] || 0,
          'sugars_100g': parsed.nutriments?.['sugars_100g'] || 0,
          'sodium_100g': parsed.nutriments?.['sodium_100g'] || 0,
          'saturated-fat_100g': parsed.nutriments?.['saturated-fat_100g'] || 0,
        },
      };
      
      console.log('[FoodDetailsLayout] Product with defaults applied');
      setProduct(productWithDefaults);
      
      console.log('[FoodDetailsLayout] Extracting serving size...');
      const serving = extractServingSize(productWithDefaults);
      console.log('[FoodDetailsLayout] Serving info:', {
        description: serving.description,
        grams: serving.grams,
        displayText: serving.displayText,
        hasValidGrams: serving.hasValidGrams,
        isEstimated: serving.isEstimated,
      });
      
      setServingInfo(serving);
      
      // CRITICAL: baseServingGrams is set to the serving size from the nutrition table
      // This is the weight of ONE PORTION as defined by the product
      // For example: "1 egg (50g)" → baseServingGrams = 50
      // For example: "1 slice (28g)" → baseServingGrams = 28
      // For example: "100g" → baseServingGrams = 100
      console.log('[FoodDetailsLayout] ✅ Setting baseServingGrams to:', serving.grams, 'g (from nutrition table)');
      setBaseServingGrams(serving.grams);
      
      // Always default to portion mode
      setSelectedOption('portion');
      setServingAmount('1');
      setServingUnit('g');
      setNumberOfServings('1');
      
      console.log('[FoodDetailsLayout] Extracting nutrition...');
      const nutritionData = extractNutrition(productWithDefaults);
      console.log('[FoodDetailsLayout] Nutrition (per 100g):', {
        calories: nutritionData.calories,
        protein: nutritionData.protein,
        carbs: nutritionData.carbs,
        fat: nutritionData.fat,
        fiber: nutritionData.fiber,
      });
      setNutrition(nutritionData);
      
      setIsReady(true);
      console.log('[FoodDetailsLayout] ✅ Screen ready to display');
      console.log('[FoodDetailsLayout] ✅ When user selects "portion", it will use', serving.grams, 'g per portion');

      checkFavoriteStatus(productWithDefaults);
    } catch (error) {
      console.error('[FoodDetailsLayout] ❌ Error parsing OpenFoodFacts data:', error);
      
      console.log('[FoodDetailsLayout] Using complete defaults due to parse error');
      setProduct({
        code: '',
        product_name: 'Unknown Product',
        brands: '',
        serving_size: '100 g',
        nutriments: {
          'energy-kcal_100g': 0,
          'proteins_100g': 0,
          'carbohydrates_100g': 0,
          'fat_100g': 0,
          'fiber_100g': 0,
          'sugars_100g': 0,
        },
      } as OpenFoodFactsProduct);
      setServingInfo({
        description: '100 g',
        grams: 100,
        displayText: '100 g',
        hasValidGrams: false,
        isEstimated: false,
      });
      setNutrition({
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        sugars: 0,
      });
      setBaseServingGrams(100);
      setServingAmount('1');
      setServingUnit('g');
      setNumberOfServings('1');
      setIsReady(true);
      
      Alert.alert(
        'Warning',
        'There was an issue loading product data. Some information may be missing.',
        [{ text: 'OK' }]
      );
    }
  }, [offData, context, mealType, date, returnTo, router]);

  // Load data for view mode
  useEffect(() => {
    if (mode === 'view' && offData) {
      loadViewData();
    }
  }, [mode, offData, loadViewData]);

  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
      }
    };
  }, []);

  const checkFavoriteStatus = async (prod: OpenFoodFactsProduct) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const foodSource = prod.code ? 'barcode' : 'library';
      const foodCode = prod.code || undefined;

      const favorited = await isFavorite(
        user.id,
        foodSource,
        foodCode,
        prod.product_name || 'Unknown Product',
        prod.brands || undefined
      );
      setIsFavorited(favorited);
      console.log('[FoodDetailsLayout] Initial favorite status:', favorited);
    } catch (error) {
      console.error('[FoodDetailsLayout] Error checking favorite status:', error);
    }
  };

  const handleToggleFavorite = async () => {
    if (!product || !servingInfo || !nutrition) return;

    setFavoriteLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to favorite foods');
        setFavoriteLoading(false);
        return;
      }

      const foodSource = product.code ? 'barcode' : 'library';
      const foodCode = product.code || undefined;

      console.log('[FoodDetailsLayout] Toggling favorite for:', {
        foodSource,
        foodCode,
        foodName: product.product_name,
        brand: product.brands,
      });

      const newFavoriteStatus = await toggleFavorite(
        user.id,
        foodSource,
        foodCode,
        {
          food_name: product.product_name || 'Unknown Product',
          brand: product.brands || undefined,
          per100_calories: nutrition.calories,
          per100_protein: nutrition.protein,
          per100_carbs: nutrition.carbs,
          per100_fat: nutrition.fat,
          per100_fiber: nutrition.fiber,
          serving_size: servingInfo.displayText,
          serving_unit: servingUnit,
          default_grams: baseServingGrams,
        }
      );

      setIsFavorited(newFavoriteStatus);
      console.log('[FoodDetailsLayout] Favorite toggled successfully, new status:', newFavoriteStatus);
      
      Alert.alert(
        'Success',
        newFavoriteStatus ? 'Added to favorites' : 'Removed from favorites'
      );
    } catch (error: any) {
      console.error('[FoodDetailsLayout] Error toggling favorite:', error);
      Alert.alert('Error', error.message || 'Failed to update favorite');
    } finally {
      setFavoriteLoading(false);
    }
  };

  // Convert serving amount to grams
  const convertToGrams = (amount: number, unit: ServingUnit): number => {
    return amount * UNIT_CONVERSIONS[unit];
  };

  // Convert grams to target unit
  const convertFromGrams = (grams: number, unit: ServingUnit): number => {
    return grams / UNIT_CONVERSIONS[unit];
  };

  // Handle serving amount change (number of portions)
  const handleServingAmountChange = (newAmount: string) => {
    console.log('[FoodDetailsLayout] ========== SERVING AMOUNT CHANGED ==========');
    console.log('[FoodDetailsLayout] New amount (portions):', newAmount);
    
    setServingAmount(newAmount);
    
    // The amount is now the number of portions
    // baseServingGrams stays the same (grams per portion from nutrition table)
    // Total grams = baseServingGrams * amount
    console.log('[FoodDetailsLayout] ✅ Serving amount changed to:', newAmount, 'portions');
    console.log('[FoodDetailsLayout] Weight per portion (from nutrition table):', baseServingGrams, 'g');
    console.log('[FoodDetailsLayout] Total weight:', baseServingGrams * (parseFloat(newAmount) || 1), 'g');
  };

  // Handle serving unit change
  const handleServingUnitChange = (newUnit: ServingUnit) => {
    console.log('[FoodDetailsLayout] Unit changed from', servingUnit, 'to', newUnit);
    
    // Convert current amount to new unit
    const currentGrams = convertToGrams(parseFloat(servingAmount) || baseServingGrams, servingUnit);
    const newAmount = convertFromGrams(currentGrams, newUnit);
    
    setServingUnit(newUnit);
    setServingAmount(newAmount.toFixed(1));
    setSelectedOption(newUnit);
    
    console.log('[FoodDetailsLayout] Converted:', servingAmount, servingUnit, '→', newAmount.toFixed(1), newUnit);
  };

  // Handle number of servings change
  const handleNumberOfServingsChange = (newServings: string) => {
    console.log('[FoodDetailsLayout] Number of servings changed to:', newServings);
    setNumberOfServings(newServings);
  };

  // Calculate total grams
  const getTotalGrams = (): number => {
    if (selectedOption === 'portion') {
      // PORTION MODE: baseServingGrams (from nutrition table) × servingAmount (number of portions)
      // Example: 1 egg (50g) × 2 portions = 100g
      // Example: 1 slice (28g) × 3 portions = 84g
      const amount = parseFloat(servingAmount) || 1;
      const totalGrams = baseServingGrams * amount;
      console.log('[FoodDetailsLayout] getTotalGrams (portion):', baseServingGrams, 'g/portion (from nutrition table) ×', amount, 'portions =', totalGrams, 'g');
      return totalGrams;
    } else {
      // Unit mode: convert servingAmount in servingUnit to grams
      const amount = parseFloat(servingAmount) || 1;
      const totalGrams = convertToGrams(amount, servingUnit);
      console.log('[FoodDetailsLayout] getTotalGrams (unit):', amount, servingUnit, '=', totalGrams, 'g');
      return totalGrams;
    }
  };

  // Calculate macros based on total grams
  const calculateMacros = () => {
    if (!nutrition) return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    
    const totalGrams = getTotalGrams();
    const multiplier = totalGrams / 100;
    
    return {
      calories: nutrition.calories * multiplier,
      protein: nutrition.protein * multiplier,
      carbs: nutrition.carbs * multiplier,
      fat: nutrition.fat * multiplier,
      fiber: nutrition.fiber * multiplier,
    };
  };

  const showSuccessBanner = useCallback((mealName: string) => {
    console.log('[FoodDetailsLayout] ========== ADDING BANNER TO QUEUE ==========');
    setBannerQueue(prev => {
      const newQueue = [...prev, `Added to ${mealName}`];
      console.log('[FoodDetailsLayout] Queue length:', newQueue.length);
      return newQueue;
    });
  }, []);

  useEffect(() => {
    if (bannerQueue.length === 0 || isShowingBannerRef.current) {
      return;
    }

    console.log('[FoodDetailsLayout] ========== SHOWING NEXT BANNER ==========');
    console.log('[FoodDetailsLayout] Queue length:', bannerQueue.length);
    
    isShowingBannerRef.current = true;
    
    const nextBanner = bannerQueue[0];
    setCurrentBanner(nextBanner);
    
    bannerOpacity.setValue(1);
    
    console.log('[FoodDetailsLayout] Banner visible, will hide after 500ms');
    
    bannerTimerRef.current = setTimeout(() => {
      console.log('[FoodDetailsLayout] Hiding banner');
      
      bannerOpacity.setValue(0);
      
      setBannerQueue(prev => prev.slice(1));
      setCurrentBanner(null);
      isShowingBannerRef.current = false;
      
      console.log('[FoodDetailsLayout] Banner hidden, ready for next');
    }, 500);
  }, [bannerQueue, bannerOpacity]);

  const handleSave = async () => {
    // Use the serving amount as the number of portions
    const finalServings = parseFloat(servingAmount) || 1;
    const finalGrams = getTotalGrams();
    
    if (!finalGrams || finalGrams <= 0) {
      Alert.alert('Error', 'Please enter a valid serving amount');
      return;
    }

    console.log('[FoodDetailsLayout] ========== SAVING FOOD ==========');
    console.log('[FoodDetailsLayout] Mode:', mode);
    console.log('[FoodDetailsLayout] Context:', context);
    console.log('[FoodDetailsLayout] Servings (portions):', finalServings);
    console.log('[FoodDetailsLayout] Total Grams:', finalGrams);
    console.log('[FoodDetailsLayout] Base Serving Grams (from nutrition table):', baseServingGrams);

    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to save food');
        setSaving(false);
        return;
      }

      const macros = calculateMacros();
      
      // Extract portion label for serving description
      let portionLabel = 'portion';
      if (servingInfo && servingInfo.description && servingInfo.description !== '100 g' && !servingInfo.description.match(/^\d+\s*g$/i)) {
        portionLabel = servingInfo.description;
        portionLabel = portionLabel.replace(/^\d+\.?\d*\s*/, '');
        portionLabel = portionLabel.replace(/\s*\(.*?\)$/i, '');
        portionLabel = portionLabel.replace(/\s*[-–—]\s*\d+\.?\d*\s*g$/i, '');
        portionLabel = portionLabel.replace(/\s+\d+\.?\d*\s*g$/i, '');
        portionLabel = portionLabel.replace(/[()[\]{}]/g, '');
        portionLabel = portionLabel.trim();
      }
      
      const servingDescription = selectedOption === 'portion' 
        ? `${servingAmount} ${portionLabel} (${Math.round(finalGrams)}g)`
        : `${servingAmount} ${servingUnit} (${Math.round(finalGrams)}g)`;

      if (mode === 'edit') {
        // UPDATE EXISTING MEAL ITEM
        console.log('[FoodDetailsLayout] Updating meal item:', itemId);

        const { error: itemError } = await supabase
          .from('meal_items')
          .update({
            quantity: finalServings,
            calories: macros.calories,
            protein: macros.protein,
            carbs: macros.carbs,
            fats: macros.fat,
            fiber: macros.fiber,
            serving_description: servingDescription,
            grams: finalGrams,
          })
          .eq('id', itemId);

        if (itemError) {
          console.error('[FoodDetailsLayout] ❌ Error updating meal item:', itemError);
          Alert.alert('Error', 'Failed to update food entry');
          setSaving(false);
          return;
        }

        console.log('[FoodDetailsLayout] ✅ Food updated successfully!');
        Alert.alert('Success', 'Food entry updated!', [
          {
            text: 'OK',
            onPress: () => {
              if (onSaveComplete) {
                onSaveComplete();
              }
              router.back();
            },
          },
        ]);
        setSaving(false);
        return;
      }

      // CRITICAL FIX: Check for my_meals_builder context (with 's')
      if (context === 'my_meals_builder') {
        console.log('[FoodDetailsLayout] ========== MY MEALS BUILDER CONTEXT ==========');
        console.log('[FoodDetailsLayout] Adding to My Meal draft');
        
        // First, ensure food exists in database
        let foodIdForDraft: string | null = null;

        if (product?.code) {
          console.log('[FoodDetailsLayout] Checking for existing food with barcode:', product.code);
          const { data: existingFood } = await supabase
            .from('foods')
            .select('id, user_created, created_by')
            .eq('barcode', product.code)
            .maybeSingle();

          if (existingFood) {
            foodIdForDraft = existingFood.id;
            console.log('[FoodDetailsLayout] ✅ Using existing food:', foodIdForDraft);
            console.log('[FoodDetailsLayout] Food details:', {
              id: existingFood.id,
              user_created: existingFood.user_created,
              created_by: existingFood.created_by,
            });
          }
        }

        if (!foodIdForDraft) {
          console.log('[FoodDetailsLayout] Creating new food in database...');
          console.log('[FoodDetailsLayout] Food data:', {
            name: product?.product_name || 'Unknown Product',
            brand: product?.brands || null,
            calories: nutrition?.calories || 0,
            protein: nutrition?.protein || 0,
            carbs: nutrition?.carbs || 0,
            fats: nutrition?.fat || 0,
            fiber: nutrition?.fiber || 0,
            barcode: product?.code || null,
            user_created: false,
          });
          
          const { data: newFood, error: foodError } = await supabase
            .from('foods')
            .insert({
              name: product?.product_name || 'Unknown Product',
              brand: product?.brands || null,
              serving_amount: 100,
              serving_unit: 'g',
              calories: nutrition?.calories || 0,
              protein: nutrition?.protein || 0,
              carbs: nutrition?.carbs || 0,
              fats: nutrition?.fat || 0,
              fiber: nutrition?.fiber || 0,
              barcode: product?.code || null,
              user_created: false,
            })
            .select()
            .single();

          if (foodError) {
            console.error('[FoodDetailsLayout] ❌ Error creating food:', foodError);
            console.error('[FoodDetailsLayout] Error code:', foodError.code);
            console.error('[FoodDetailsLayout] Error message:', foodError.message);
            console.error('[FoodDetailsLayout] Error details:', foodError.details);
            Alert.alert('Error', 'Failed to save food');
            setSaving(false);
            return;
          }

          foodIdForDraft = newFood.id;
          console.log('[FoodDetailsLayout] ✅ Created new food:', foodIdForDraft);
          console.log('[FoodDetailsLayout] New food details:', {
            id: newFood.id,
            name: newFood.name,
            user_created: newFood.user_created,
            created_by: newFood.created_by,
          });
        }
        
        // Add to draft
        console.log('[FoodDetailsLayout] ========== ADDING TO DRAFT ==========');
        console.log('[FoodDetailsLayout] Draft item data:', {
          food_id: foodIdForDraft,
          food_name: product?.product_name || 'Unknown Product',
          food_brand: product?.brands || undefined,
          serving_amount: baseServingGrams,
          serving_unit: servingUnit,
          servings_count: finalServings,
          calories: macros.calories,
          protein: macros.protein,
          carbs: macros.carbs,
          fats: macros.fat,
          fiber: macros.fiber,
        });
        
        await addToDraft({
          food_id: foodIdForDraft,
          food_name: product?.product_name || 'Unknown Product',
          food_brand: product?.brands || undefined,
          serving_amount: baseServingGrams,
          serving_unit: servingUnit,
          servings_count: finalServings,
          calories: macros.calories,
          protein: macros.protein,
          carbs: macros.carbs,
          fats: macros.fat,
          fiber: macros.fiber,
        });

        console.log('[FoodDetailsLayout] ✅ Added to My Meal draft!');
        
        // CRITICAL FIX: Navigate back to My Meals Create screen
        // Use router.back() to go back to the previous screen (My Meals Create)
        // This will dismiss the Food Details screen and return to the builder
        console.log('[FoodDetailsLayout] ========== NAVIGATING BACK TO MY MEALS BUILDER ==========');
        setSaving(false);
        
        Alert.alert('Success', 'Food added to meal!', [
          {
            text: 'OK',
            onPress: () => {
              // Go back to the My Meals Create screen
              // Since we came from barcode scanner -> food details, we need to go back twice
              // But router.back() should handle this correctly
              router.back();
            },
          },
        ]);
        return;
      }

      // VIEW MODE: ADD NEW FOOD TO DIARY (meal_log context)
      console.log('[FoodDetailsLayout] ========== MEAL LOG CONTEXT ==========');
      console.log('[FoodDetailsLayout] Meal:', mealType);
      console.log('[FoodDetailsLayout] Date:', date);
      console.log('[FoodDetailsLayout] returnTo:', returnTo);

      let foodId: string | null = null;

      if (product?.code) {
        console.log('[FoodDetailsLayout] Checking for existing food with barcode:', product.code);
        const { data: existingFood } = await supabase
          .from('foods')
          .select('id')
          .eq('barcode', product.code)
          .maybeSingle();

        if (existingFood) {
          foodId = existingFood.id;
          console.log('[FoodDetailsLayout] ✅ Using existing food:', foodId);
        }
      }

      if (!foodId) {
        console.log('[FoodDetailsLayout] Creating new food in database...');
        const { data: newFood, error: foodError } = await supabase
          .from('foods')
          .insert({
            name: product?.product_name || 'Unknown Product',
            brand: product?.brands || null,
            serving_amount: 100,
            serving_unit: 'g',
            calories: nutrition?.calories || 0,
            protein: nutrition?.protein || 0,
            carbs: nutrition?.carbs || 0,
            fats: nutrition?.fat || 0,
            fiber: nutrition?.fiber || 0,
            barcode: product?.code || null,
            user_created: false,
          })
          .select()
          .single();

        if (foodError) {
          console.error('[FoodDetailsLayout] ❌ Error creating food:', foodError);
          Alert.alert('Error', 'Failed to save food');
          setSaving(false);
          return;
        }

        foodId = newFood.id;
        console.log('[FoodDetailsLayout] ✅ Created new food:', foodId);
      }

      // NORMAL DIARY MODE: Log to diary
      console.log('[FoodDetailsLayout] Logging to diary...');
      
      const { data: existingMeal } = await supabase
        .from('meals')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', date)
        .eq('meal_type', mealType)
        .maybeSingle();

      let mealIdForLog = existingMeal?.id;

      if (!mealIdForLog) {
        console.log('[FoodDetailsLayout] Creating new meal for', mealType, 'on', date);
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
          console.error('[FoodDetailsLayout] ❌ Error creating meal:', mealError);
          Alert.alert('Error', 'Failed to create meal');
          setSaving(false);
          return;
        }

        mealIdForLog = newMeal.id;
        console.log('[FoodDetailsLayout] ✅ Created new meal:', mealIdForLog);
      } else {
        console.log('[FoodDetailsLayout] ✅ Using existing meal:', mealIdForLog);
      }

      console.log('[FoodDetailsLayout] Inserting NEW meal item');
      const { error: mealItemError } = await supabase
        .from('meal_items')
        .insert({
          meal_id: mealIdForLog,
          food_id: foodId,
          quantity: finalServings,
          calories: macros.calories,
          protein: macros.protein,
          carbs: macros.carbs,
          fats: macros.fat,
          fiber: macros.fiber,
          serving_description: servingDescription,
          grams: finalGrams,
        });

      if (mealItemError) {
        console.error('[FoodDetailsLayout] ❌ Error creating meal item:', mealItemError);
        Alert.alert('Error', 'Failed to add food to meal');
        setSaving(false);
        return;
      }

      console.log('[FoodDetailsLayout] ✅ Food added successfully!');
      
      const mealLabels: Record<string, string> = {
        breakfast: 'Breakfast',
        lunch: 'Lunch',
        dinner: 'Dinner',
        snack: 'Snacks',
      };
      showSuccessBanner(mealLabels[mealType] || mealType);
      
      setSaving(false);
      
      console.log('[FoodDetailsLayout] ✅ NAVIGATING TO FOOD HOME');
      
      setTimeout(() => {
        router.push('/(tabs)/(home)/');
      }, 600);
    } catch (error) {
      console.error('[FoodDetailsLayout] ❌ Error in handleSave:', error);
      Alert.alert('Error', 'An unexpected error occurred');
      setSaving(false);
    }
  };

  if (!isReady || !product || !servingInfo || !nutrition || (mode === 'edit' && editLoading)) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: isDark ? colors.textDark : colors.text }]}>
            Loading product details...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const macros = calculateMacros();
  const totalGrams = getTotalGrams();

  const mealLabels: Record<string, string> = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snacks',
  };

  // Extract portion label for display
  let portionLabel = 'Portion';
  if (servingInfo && servingInfo.description && servingInfo.description !== '100 g' && !servingInfo.description.match(/^\d+\s*g$/i)) {
    portionLabel = servingInfo.description;
    
    // Remove leading numbers (e.g., "1 large egg" -> "large egg")
    portionLabel = portionLabel.replace(/^\d+\.?\d*\s*/, '');
    
    // Remove trailing grams in parentheses if present (e.g., "(50g)" or "(50 g)")
    portionLabel = portionLabel.replace(/\s*\(.*?\)$/i, '');
    
    // Remove trailing weight indicators like "- 50g" or "50g"
    portionLabel = portionLabel.replace(/\s*[-–—]\s*\d+\.?\d*\s*g$/i, '');
    portionLabel = portionLabel.replace(/\s+\d+\.?\d*\s*g$/i, '');
    
    // Remove any remaining parentheses or brackets
    portionLabel = portionLabel.replace(/[()[\]{}]/g, '');
    
    // Trim whitespace
    portionLabel = portionLabel.trim();
    
    // Capitalize first letter of each word for better display
    if (portionLabel.length > 0) {
      portionLabel = portionLabel
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }
  }

  // CRITICAL FIX: Determine button text based on context
  let buttonText = 'Add to Meal';
  if (mode === 'edit') {
    buttonText = 'Save Changes';
  } else if (context === 'my_meals_builder') {
    // MY MEALS BUILDER CONTEXT
    buttonText = 'Add to My Meal';
  } else {
    // NORMAL MEAL LOG CONTEXT
    buttonText = `Add to ${mealLabels[mealType]}`;
  }

  // CRITICAL FIX: Calculate the TOTAL weight display (servingAmount × baseServingGrams)
  // This replaces the "480g" badge in the image
  const totalWeightGrams = totalGrams;
  const totalWeightText = totalWeightGrams % 1 === 0 
    ? `${Math.round(totalWeightGrams)}g` 
    : `${totalWeightGrams.toFixed(1)}g`;

  // Available unit options
  const unitOptions: Array<{ value: ServingOption; label: string }> = [
    { value: 'portion', label: portionLabel },
    { value: 'g', label: 'Grams' },
    { value: 'oz', label: 'Ounces' },
    { value: 'cup', label: 'Cups' },
    { value: 'tbsp', label: 'Tbsp' },
    { value: 'tsp', label: 'Tsp' },
  ];

  const handleUnitOptionPress = (option: ServingOption) => {
    console.log('[FoodDetailsLayout] Unit option pressed:', option);
    
    if (option === 'portion') {
      // Switch to portion mode
      // CRITICAL: When switching to portion mode, reset to 1 portion
      // baseServingGrams is already set to the serving size from the nutrition table
      setSelectedOption('portion');
      setServingAmount('1');
      console.log('[FoodDetailsLayout] ✅ Switched to portion mode');
      console.log('[FoodDetailsLayout] Using baseServingGrams:', baseServingGrams, 'g (from nutrition table)');
    } else {
      // Switch to unit mode
      const newUnit = option as ServingUnit;
      
      if (selectedOption === 'portion') {
        // Converting from portion to unit
        const currentGrams = baseServingGrams * (parseFloat(servingAmount) || 1);
        const newAmount = convertFromGrams(currentGrams, newUnit);
        setServingAmount(newAmount.toFixed(1));
        setServingUnit(newUnit);
        setSelectedOption(newUnit);
        console.log('[FoodDetailsLayout] Converted from portion to', newUnit, ':', newAmount.toFixed(1));
      } else {
        // Converting from one unit to another
        const currentGrams = convertToGrams(parseFloat(servingAmount) || 1, servingUnit);
        const newAmount = convertFromGrams(currentGrams, newUnit);
        setServingAmount(newAmount.toFixed(1));
        setServingUnit(newUnit);
        setSelectedOption(newUnit);
        console.log('[FoodDetailsLayout] Converted from', servingUnit, 'to', newUnit, ':', newAmount.toFixed(1));
      }
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={isDark ? colors.textDark : colors.text}
          />
        </TouchableOpacity>
        <View style={styles.headerSpacer} />
        {mode === 'view' && (
          <TouchableOpacity 
            onPress={handleToggleFavorite}
            disabled={favoriteLoading}
            style={styles.favoriteButton}
          >
            {favoriteLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <IconSymbol
                ios_icon_name={isFavorited ? "star.fill" : "star"}
                android_material_icon_name={isFavorited ? "star" : "star-border"}
                size={24}
                color={isFavorited ? "#FFD700" : (isDark ? colors.textDark : colors.text)}
              />
            )}
          </TouchableOpacity>
        )}
        {mode === 'edit' && <View style={{ width: 24 }} />}
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* COMPACT HEADER */}
        <View style={styles.foodHeader}>
          <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text }]}>
            {product.product_name || 'Unknown Product'}
          </Text>
          {product.brands && (
            <Text style={[styles.foodBrand, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              {product.brands}
            </Text>
          )}
        </View>

        {/* SERVING CONTROLS - COMPACT WITH INLINE TOTAL WEIGHT */}
        <View style={[styles.servingCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          {/* Label and Input Row - All on one line with TOTAL weight */}
          <View style={styles.servingLabelRow}>
            <Text style={[styles.servingLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Serving Amount
            </Text>
            <View style={styles.servingInputRowInline}>
              <TextInput
                style={[styles.servingInputCompact, { 
                  backgroundColor: isDark ? colors.backgroundDark : colors.background, 
                  borderColor: isDark ? colors.borderDark : colors.border, 
                  color: isDark ? colors.textDark : colors.text 
                }]}
                placeholder="1"
                placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                keyboardType="decimal-pad"
                value={servingAmount}
                onChangeText={handleServingAmountChange}
              />
              <View style={styles.weightBadgeInline}>
                <Text style={[styles.weightBadgeText, { color: '#FFFFFF' }]}>
                  {totalWeightText}
                </Text>
              </View>
            </View>
          </View>

          {/* UNITS MENU - Chip/Button Grid - NOW MORE VISIBLE */}
          <View style={styles.unitsMenuContainer}>
            <Text style={[styles.unitsMenuLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Unit
            </Text>
            <View style={styles.unitsGrid}>
              {unitOptions.map((option) => {
                const isSelected = selectedOption === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.unitChip,
                      {
                        backgroundColor: isSelected 
                          ? colors.primary 
                          : (isDark ? colors.backgroundDark : colors.background),
                        borderColor: isSelected 
                          ? colors.primary 
                          : (isDark ? colors.borderDark : colors.border),
                      }
                    ]}
                    onPress={() => handleUnitOptionPress(option.value)}
                  >
                    <Text style={[
                      styles.unitChipText,
                      {
                        color: isSelected 
                          ? '#FFFFFF' 
                          : (isDark ? colors.textDark : colors.text)
                      }
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* MACROS + CALORIES - COMPACT ROW WITH IMPROVED SPACING */}
        <View style={[styles.macrosCard, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
          <View style={styles.macrosRow}>
            <View style={styles.caloriesSection}>
              <Text style={[styles.caloriesLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Calories
              </Text>
              <Text style={[styles.caloriesValue, { color: colors.calories }]}>
                {Math.round(macros.calories)}
              </Text>
            </View>
            <View style={styles.macrosDivider} />
            <View style={styles.macrosGrid}>
              <View style={styles.macroItem}>
                <Text style={[styles.macroValue, { color: colors.carbs }]}>
                  {macros.carbs.toFixed(1)}g
                </Text>
                <Text style={[styles.macroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Carbs
                </Text>
              </View>
              <View style={styles.macroItem}>
                <Text style={[styles.macroValue, { color: colors.fats }]}>
                  {macros.fat.toFixed(1)}g
                </Text>
                <Text style={[styles.macroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Fat
                </Text>
              </View>
              <View style={styles.macroItem}>
                <Text style={[styles.macroValue, { color: colors.protein }]}>
                  {macros.protein.toFixed(1)}g
                </Text>
                <Text style={[styles.macroLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  Protein
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ADD/SAVE BUTTON - DIRECTLY UNDER MACROS */}
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.addButtonText}>{buttonText}</Text>
          )}
        </TouchableOpacity>

        {/* NUTRITION FACTS - COLLAPSIBLE */}
        <TouchableOpacity
          style={[styles.nutritionHeader, { backgroundColor: isDark ? colors.cardDark : colors.card }]}
          onPress={() => setNutritionExpanded(!nutritionExpanded)}
        >
          <Text style={[styles.nutritionHeaderText, { color: isDark ? colors.textDark : colors.text }]}>
            Nutrition Facts
          </Text>
          <IconSymbol
            ios_icon_name={nutritionExpanded ? "chevron.up" : "chevron.down"}
            android_material_icon_name={nutritionExpanded ? "expand_less" : "expand_more"}
            size={24}
            color={isDark ? colors.textDark : colors.text}
          />
        </TouchableOpacity>

        {nutritionExpanded && (
          <View style={[styles.nutritionContent, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <View style={styles.nutritionRow}>
              <Text style={[styles.nutritionLabel, { color: isDark ? colors.textDark : colors.text }]}>
                Fiber
              </Text>
              <Text style={[styles.nutritionValue, { color: isDark ? colors.textDark : colors.text }]}>
                {macros.fiber.toFixed(1)}g
              </Text>
            </View>
            {nutrition.sugars > 0 && (
              <View style={styles.nutritionRow}>
                <Text style={[styles.nutritionLabel, { color: isDark ? colors.textDark : colors.text }]}>
                  Sugars
                </Text>
                <Text style={[styles.nutritionValue, { color: isDark ? colors.textDark : colors.text }]}>
                  {(nutrition.sugars * (totalGrams / 100)).toFixed(1)}g
                </Text>
              </View>
            )}
            {nutrition.sodium > 0 && (
              <View style={styles.nutritionRow}>
                <Text style={[styles.nutritionLabel, { color: isDark ? colors.textDark : colors.text }]}>
                  Sodium
                </Text>
                <Text style={[styles.nutritionValue, { color: isDark ? colors.textDark : colors.text }]}>
                  {(nutrition.sodium * (totalGrams / 100) * 1000).toFixed(0)}mg
                </Text>
              </View>
            )}
            {nutrition['saturated-fat'] > 0 && (
              <View style={styles.nutritionRow}>
                <Text style={[styles.nutritionLabel, { color: isDark ? colors.textDark : colors.text }]}>
                  Saturated Fat
                </Text>
                <Text style={[styles.nutritionValue, { color: isDark ? colors.textDark : colors.text }]}>
                  {(nutrition['saturated-fat'] * (totalGrams / 100)).toFixed(1)}g
                </Text>
              </View>
            )}
            <View style={[styles.nutritionRow, { borderTopWidth: 1, borderTopColor: isDark ? colors.borderDark : colors.border, paddingTop: spacing.sm, marginTop: spacing.sm }]}>
              <Text style={[styles.nutritionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, fontSize: 12 }]}>
                Per 100g
              </Text>
              <Text style={[styles.nutritionValue, { color: isDark ? colors.textSecondaryDark : colors.textSecondary, fontSize: 12 }]}>
                {Math.round(nutrition.calories)} kcal • P: {nutrition.protein.toFixed(1)}g • C: {nutrition.carbs.toFixed(1)}g • F: {nutrition.fat.toFixed(1)}g
              </Text>
            </View>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {currentBanner && mode === 'view' && context !== 'my_meals_builder' && (
        <Animated.View 
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
              android_material_icon_name="check-circle"
              size={20}
              color="#FFFFFF"
            />
            <Text style={styles.bannerText}>
              {currentBanner}
            </Text>
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'android' ? spacing.lg : 0,
    paddingBottom: spacing.sm,
  },
  headerSpacer: {
    flex: 1,
  },
  favoriteButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  foodHeader: {
    marginBottom: spacing.md,
  },
  foodName: {
    ...typography.h2,
    fontSize: 24,
    marginBottom: spacing.xs,
  },
  foodBrand: {
    ...typography.body,
    fontSize: 14,
  },
  servingCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  servingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  servingLabel: {
    ...typography.caption,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  servingInputRowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    justifyContent: 'flex-end',
  },
  servingInputCompact: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    fontSize: 18,
    fontWeight: '600',
    minWidth: 80,
    textAlign: 'center',
  },
  weightBadgeInline: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightBadgeText: {
    fontSize: 16,
    fontWeight: '700',
  },
  unitsMenuContainer: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  unitsMenuLabel: {
    ...typography.caption,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
    fontWeight: '600',
  },
  unitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  unitChip: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  macrosCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  macrosRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  caloriesSection: {
    flex: 1,
    alignItems: 'center',
  },
  caloriesLabel: {
    ...typography.caption,
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  caloriesValue: {
    fontSize: 36,
    fontWeight: '700',
  },
  macrosDivider: {
    width: 1,
    height: 60,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  macrosGrid: {
    flex: 1.5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  macroItem: {
    alignItems: 'center',
    minWidth: 60,
  },
  macroValue: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  macroLabel: {
    ...typography.caption,
    fontSize: 11,
  },
  addButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  nutritionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.xs,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  nutritionHeaderText: {
    ...typography.bodyBold,
    fontSize: 16,
  },
  nutritionContent: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  nutritionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  nutritionLabel: {
    ...typography.body,
    fontSize: 14,
  },
  nutritionValue: {
    ...typography.bodyBold,
    fontSize: 14,
  },
  bottomSpacer: {
    height: 100,
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
    paddingVertical: spacing.md,
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
});
