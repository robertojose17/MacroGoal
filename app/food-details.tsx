
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Platform, ActivityIndicator, Alert, KeyboardAvoidingView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import { useColorScheme } from '@/hooks/useColorScheme';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { OpenFoodFactsProduct, extractServingSize, extractNutrition, ServingSizeInfo } from '@/utils/openFoodFacts';
import { isFavorite, toggleFavorite } from '@/utils/favoritesDatabase';

export default function FoodDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const mode = (params.mode as string) || 'diary';
  const mealType = (params.meal as string) || 'breakfast';
  const date = (params.date as string) || new Date().toISOString().split('T')[0];
  const offDataString = params.offData as string;
  const returnTo = (params.returnTo as string) || undefined;
  const myMealId = (params.mealId as string) || undefined;

  const [product, setProduct] = useState<OpenFoodFactsProduct | null>(null);
  const [servingInfo, setServingInfo] = useState<ServingSizeInfo | null>(null);
  const [nutrition, setNutrition] = useState<any>(null);
  
  // NEW: Separate state for servings and grams
  const [servings, setServings] = useState('1');
  const [grams, setGrams] = useState('100');
  
  const [saving, setSaving] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);

  // NEW: Per-serving macros (derived from per-100g data)
  const [perServingMacros, setPerServingMacros] = useState({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
  });

  useEffect(() => {
    console.log('[FoodDetails] ========== COMPONENT MOUNTED ==========');
    console.log('[FoodDetails] Mode:', mode);
    console.log('[FoodDetails] Meal:', mealType);
    console.log('[FoodDetails] Date:', date);
    console.log('[FoodDetails] returnTo:', returnTo);
    console.log('[FoodDetails] mealId:', myMealId);
    console.log('[FoodDetails] offDataString length:', offDataString?.length || 0);
    
    if (!offDataString) {
      console.error('[FoodDetails] ❌ No offData provided');
      Alert.alert('Error', 'No product data available', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
      return;
    }

    try {
      console.log('[FoodDetails] Parsing OpenFoodFacts data...');
      const parsed = JSON.parse(offDataString);
      
      console.log('[FoodDetails] ✅ Parsed successfully');
      console.log('[FoodDetails] Product name:', parsed.product_name || 'Unknown');
      console.log('[FoodDetails] Brand:', parsed.brands || 'Unknown');
      console.log('[FoodDetails] Code:', parsed.code || 'N/A');
      console.log('[FoodDetails] Has nutriments:', !!parsed.nutriments);
      
      // Apply defaults for missing fields - NEVER block the UI
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
        },
      };
      
      console.log('[FoodDetails] Product with defaults applied');
      setProduct(productWithDefaults);
      
      // Extract serving size information from OpenFoodFacts
      console.log('[FoodDetails] Extracting serving size...');
      const serving = extractServingSize(productWithDefaults);
      console.log('[FoodDetails] Serving info:', {
        description: serving.description,
        grams: serving.grams,
        displayText: serving.displayText,
        hasValidGrams: serving.hasValidGrams,
        isEstimated: serving.isEstimated,
      });
      
      setServingInfo(serving);
      
      // NEW: Initialize servings to 1.0 and grams to base serving size
      setServings('1');
      setGrams(serving.grams.toString());
      
      // Extract nutrition information (per 100g)
      console.log('[FoodDetails] Extracting nutrition...');
      const nutritionData = extractNutrition(productWithDefaults);
      console.log('[FoodDetails] Nutrition (per 100g):', {
        calories: nutritionData.calories,
        protein: nutritionData.protein,
        carbs: nutritionData.carbs,
        fat: nutritionData.fat,
        fiber: nutritionData.fiber,
      });
      setNutrition(nutritionData);
      
      // NEW: Calculate per-serving macros
      const servingMultiplier = serving.grams / 100;
      const perServing = {
        calories: nutritionData.calories * servingMultiplier,
        protein: nutritionData.protein * servingMultiplier,
        carbs: nutritionData.carbs * servingMultiplier,
        fat: nutritionData.fat * servingMultiplier,
        fiber: nutritionData.fiber * servingMultiplier,
      };
      console.log('[FoodDetails] Per-serving macros:', perServing);
      setPerServingMacros(perServing);
      
      // Mark as ready immediately - never block the UI
      setIsReady(true);
      console.log('[FoodDetails] ✅ Screen ready to display');

      // Check if this food is favorited
      checkFavoriteStatus(productWithDefaults);
    } catch (error) {
      console.error('[FoodDetails] ❌ Error parsing OpenFoodFacts data:', error);
      
      // Even on error, show something to the user with defaults
      console.log('[FoodDetails] Using complete defaults due to parse error');
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
      setPerServingMacros({
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
      });
      setServings('1');
      setGrams('100');
      setIsReady(true);
      
      Alert.alert(
        'Warning',
        'There was an issue loading product data. Some information may be missing.',
        [{ text: 'OK' }]
      );
    }
  }, [offDataString, router]);

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
      console.log('[FoodDetails] Initial favorite status:', favorited);
    } catch (error) {
      console.error('[FoodDetails] Error checking favorite status:', error);
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

      console.log('[FoodDetails] Toggling favorite for:', {
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
          serving_unit: servingInfo.description.includes('g') ? 'g' : 'serving',
          default_grams: servingInfo.grams,
        }
      );

      setIsFavorited(newFavoriteStatus);
      console.log('[FoodDetails] Favorite toggled successfully, new status:', newFavoriteStatus);
      
      // Show success message
      Alert.alert(
        'Success',
        newFavoriteStatus ? 'Added to favorites' : 'Removed from favorites'
      );
    } catch (error: any) {
      console.error('[FoodDetails] Error toggling favorite:', error);
      Alert.alert('Error', error.message || 'Failed to update favorite');
    } finally {
      setFavoriteLoading(false);
    }
  };

  // NEW: Handle servings change
  const handleServingsChange = (newServings: string) => {
    console.log('[FoodDetails] Servings changed to:', newServings);
    setServings(newServings);
    
    if (!servingInfo) return;
    
    const servingsNum = parseFloat(newServings);
    if (!isNaN(servingsNum) && servingsNum > 0) {
      // Update grams based on servings
      const newGrams = servingInfo.grams * servingsNum;
      console.log('[FoodDetails] Updating grams to:', newGrams);
      setGrams(newGrams.toFixed(1));
    }
  };

  // NEW: Handle grams change
  const handleGramsChange = (newGrams: string) => {
    console.log('[FoodDetails] Grams changed to:', newGrams);
    setGrams(newGrams);
    
    if (!servingInfo) return;
    
    const gramsNum = parseFloat(newGrams);
    if (!isNaN(gramsNum) && gramsNum > 0 && servingInfo.grams > 0) {
      // Update servings based on grams
      const newServings = gramsNum / servingInfo.grams;
      console.log('[FoodDetails] Updating servings to:', newServings);
      setServings(newServings.toFixed(2));
    }
  };

  // Show loading only briefly while parsing
  if (!isReady || !product || !servingInfo || !nutrition) {
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

  // Calculate nutrition for the specified servings/grams
  const servingsNum = parseFloat(servings) || 1;
  const gramsNum = parseFloat(grams) || servingInfo.grams;
  
  // Calculate macros based on servings (more accurate)
  const calculatedCalories = perServingMacros.calories * servingsNum;
  const calculatedProtein = perServingMacros.protein * servingsNum;
  const calculatedCarbs = perServingMacros.carbs * servingsNum;
  const calculatedFats = perServingMacros.fat * servingsNum;
  const calculatedFiber = perServingMacros.fiber * servingsNum;

  // Generate serving description for display
  const getServingDescription = (): string => {
    const currentGrams = parseFloat(grams) || servingInfo.grams;
    const currentServings = parseFloat(servings) || 1;
    
    // If exactly 1 serving, use the original serving description
    if (Math.abs(currentServings - 1) < 0.01) {
      return servingInfo.displayText;
    }
    
    // If the original serving had a unit description (not just grams)
    if (servingInfo.description !== servingInfo.displayText && !servingInfo.description.match(/^\d+\s*g$/i)) {
      // Try to scale the serving (e.g., "1 cup" -> "2 cups", "2 slices" -> "3 slices")
      const match = servingInfo.description.match(/^(\d+\.?\d*)\s+(.+)$/);
      if (match) {
        const originalCount = parseFloat(match[1]);
        const unit = match[2];
        const newCount = originalCount * currentServings;
        
        // If it's close to a whole number, use that
        if (Math.abs(newCount - Math.round(newCount)) < 0.1) {
          if (servingInfo.isEstimated) {
            return `${Math.round(newCount)} ${unit} (≈ ${Math.round(currentGrams)} g)`;
          } else {
            return `${Math.round(newCount)} ${unit} (${Math.round(currentGrams)} g)`;
          }
        }
        
        // Otherwise show decimal
        if (servingInfo.isEstimated) {
          return `${newCount.toFixed(1)} ${unit} (≈ ${Math.round(currentGrams)} g)`;
        } else {
          return `${newCount.toFixed(1)} ${unit} (${Math.round(currentGrams)} g)`;
        }
      }
    }
    
    // Fallback: just show grams
    return `${Math.round(currentGrams)} g`;
  };

  const handleSave = async () => {
    const finalServings = parseFloat(servings);
    const finalGrams = parseFloat(grams);
    
    if (!finalServings || finalServings <= 0 || !finalGrams || finalGrams <= 0) {
      Alert.alert('Error', 'Please enter valid servings and grams');
      return;
    }

    console.log('[FoodDetails] ========== SAVING FOOD ==========');
    console.log('[FoodDetails] Mode:', mode);
    console.log('[FoodDetails] Meal:', mealType);
    console.log('[FoodDetails] Servings:', finalServings);
    console.log('[FoodDetails] Grams:', finalGrams);
    console.log('[FoodDetails] returnTo:', returnTo);
    console.log('[FoodDetails] mealId:', myMealId);

    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to add food');
        setSaving(false);
        return;
      }

      console.log('[FoodDetails] User ID:', user.id);

      // Check if this food already exists in our database (by barcode)
      let foodId: string | null = null;

      if (product.code) {
        console.log('[FoodDetails] Checking for existing food with barcode:', product.code);
        const { data: existingFood } = await supabase
          .from('foods')
          .select('id')
          .eq('barcode', product.code)
          .maybeSingle();

        if (existingFood) {
          foodId = existingFood.id;
          console.log('[FoodDetails] ✅ Using existing food:', foodId);
        }
      }

      // If food doesn't exist, create it
      if (!foodId) {
        console.log('[FoodDetails] Creating new food in database...');
        const { data: newFood, error: foodError } = await supabase
          .from('foods')
          .insert({
            name: product.product_name || 'Unknown Product',
            brand: product.brands || null,
            serving_amount: 100, // OpenFoodFacts uses per 100g for calculations
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
          console.error('[FoodDetails] ❌ Error creating food:', foodError);
          Alert.alert('Error', 'Failed to save food');
          setSaving(false);
          return;
        }

        foodId = newFood.id;
        console.log('[FoodDetails] ✅ Created new food:', foodId);
      }

      // Generate the serving description for storage
      const finalServingDescription = getServingDescription();

      console.log('[FoodDetails] Serving description:', finalServingDescription);
      console.log('[FoodDetails] Final servings:', finalServings);
      console.log('[FoodDetails] Final grams:', finalGrams);
      console.log('[FoodDetails] Calculated nutrition:', {
        calories: calculatedCalories,
        protein: calculatedProtein,
        carbs: calculatedCarbs,
        fats: calculatedFats,
        fiber: calculatedFiber,
      });

      // If mode is "mymeal", return to builder/details instead of logging to diary
      if (mode === 'mymeal') {
        console.log('[FoodDetails] Mode is mymeal, returning to My Meal screen');

        // Get the full food data for the builder/details
        const { data: foodData } = await supabase
          .from('foods')
          .select('*')
          .eq('id', foodId)
          .single();

        const newFoodItem = {
          food_id: foodId,
          food: foodData,
          quantity: finalServings, // Store servings as quantity
          calories: calculatedCalories,
          protein: calculatedProtein,
          carbs: calculatedCarbs,
          fats: calculatedFats,
          fiber: calculatedFiber,
          serving_description: finalServingDescription,
          grams: finalGrams,
        };

        console.log('[FoodDetails] ✅ FIXED: Using returnTo parameter:', returnTo || '/my-meal-builder');
        
        // FIXED: Use the returnTo parameter to go back to the correct screen
        // This will be either /my-meal-details or /my-meal-builder
        router.dismissTo({
          pathname: returnTo || '/my-meal-builder',
          params: {
            mealId: myMealId || '',
            newFoodItem: JSON.stringify(newFoodItem),
          },
        });

        setSaving(false);
        return;
      }

      // Normal diary mode - log to diary
      console.log('[FoodDetails] Logging to diary...');
      
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
        console.log('[FoodDetails] Creating new meal for', mealType, 'on', date);
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
          console.error('[FoodDetails] ❌ Error creating meal:', mealError);
          Alert.alert('Error', 'Failed to create meal');
          setSaving(false);
          return;
        }

        mealId = newMeal.id;
        console.log('[FoodDetails] ✅ Created new meal:', mealId);
      } else {
        console.log('[FoodDetails] ✅ Using existing meal:', mealId);
      }

      // ALWAYS INSERT a new meal item (never update existing ones)
      console.log('[FoodDetails] Inserting NEW meal item');
      const { error: mealItemError } = await supabase
        .from('meal_items')
        .insert({
          meal_id: mealId,
          food_id: foodId,
          quantity: finalServings, // Store servings as quantity
          calories: calculatedCalories,
          protein: calculatedProtein,
          carbs: calculatedCarbs,
          fats: calculatedFats,
          fiber: calculatedFiber,
          serving_description: finalServingDescription,
          grams: finalGrams,
        });

      if (mealItemError) {
        console.error('[FoodDetails] ❌ Error creating meal item:', mealItemError);
        Alert.alert('Error', 'Failed to add food to meal');
        setSaving(false);
        return;
      }

      console.log('[FoodDetails] ✅ Food added successfully!');
      console.log('[FoodDetails] Navigating back to diary');
      
      // Navigate back to the home/diary screen
      router.dismissTo('/(tabs)/(home)/');
    } catch (error) {
      console.error('[FoodDetails] ❌ Error in handleSave:', error);
      Alert.alert('Error', 'An unexpected error occurred');
      setSaving(false);
    }
  };

  // Check if product has missing data
  const hasMissingData = 
    product.product_name === 'Unknown Product' || 
    !product.brands ||
    (nutrition.calories === 0 && nutrition.protein === 0 && nutrition.carbs === 0 && nutrition.fat === 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]} edges={['top']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow_back"
              size={24}
              color={isDark ? colors.textDark : colors.text}
            />
          </TouchableOpacity>
          <Text style={[styles.title, { color: isDark ? colors.textDark : colors.text }]}>
            Food Details
          </Text>
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
                android_material_icon_name={isFavorited ? "star" : "star_border"}
                size={24}
                color={isFavorited ? "#FFD700" : (isDark ? colors.textDark : colors.text)}
              />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {hasMissingData && (
            <View style={[styles.warningCard, { backgroundColor: 'rgba(255, 149, 0, 0.1)', borderColor: colors.warning || '#FF9500' }]}>
              <IconSymbol
                ios_icon_name="exclamationmark.triangle"
                android_material_icon_name="warning"
                size={24}
                color={colors.warning || '#FF9500'}
              />
              <Text style={[styles.warningText, { color: colors.warning || '#FF9500' }]}>
                Some product information is missing. You can still add this food and manually enter nutrition info later.
              </Text>
            </View>
          )}

          <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <View style={styles.offBadgeContainer}>
              <Text style={[styles.offBadge, { color: colors.primary }]}>
                ✓ OpenFoodFacts
              </Text>
            </View>
            
            <Text style={[styles.foodName, { color: isDark ? colors.textDark : colors.text }]}>
              {product.product_name || 'Unknown Product'}
            </Text>
            
            {product.brands && (
              <Text style={[styles.foodBrand, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                {product.brands}
              </Text>
            )}
            
            <View style={styles.servingSizeInfo}>
              <Text style={[styles.servingSizeLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Label serving size:
              </Text>
              <Text style={[styles.servingSize, { color: colors.primary }]}>
                {servingInfo.displayText}
              </Text>
              {servingInfo.isEstimated && !servingInfo.hasValidGrams && (
                <Text style={[styles.servingWarning, { color: colors.warning || '#FF9500' }]}>
                  ⚠️ Estimated - no gram value found, using 100g for calculations
                </Text>
              )}
              {servingInfo.isEstimated && servingInfo.hasValidGrams && (
                <Text style={[styles.servingInfo, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  ℹ️ Converted using estimated density
                </Text>
              )}
            </View>
            
            {product.code && (
              <Text style={[styles.barcode, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Barcode: {product.code}
              </Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
              Your Portion
            </Text>
            <Text style={[styles.servingInfoText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              Adjust servings or grams - both are synchronized
            </Text>
            
            <View style={styles.servingPreview}>
              <Text style={[styles.servingPreviewLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                Will be logged as:
              </Text>
              <Text style={[styles.servingPreviewText, { color: colors.primary }]}>
                {getServingDescription()}
              </Text>
            </View>

            {/* NEW: Servings input */}
            <View style={styles.servingInput}>
              <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                Servings:
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                  placeholder="1"
                  placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                  keyboardType="decimal-pad"
                  value={servings}
                  onChangeText={handleServingsChange}
                />
                <Text style={[styles.unitLabel, { color: isDark ? colors.textDark : colors.text }]}>servings</Text>
              </View>
            </View>

            {/* Existing grams input */}
            <View style={styles.servingInput}>
              <Text style={[styles.label, { color: isDark ? colors.textDark : colors.text }]}>
                Grams:
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? colors.backgroundDark : colors.background, borderColor: isDark ? colors.borderDark : colors.border, color: isDark ? colors.textDark : colors.text }]}
                  placeholder={servingInfo.grams.toString()}
                  placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondary}
                  keyboardType="decimal-pad"
                  value={grams}
                  onChangeText={handleGramsChange}
                />
                <Text style={[styles.unitLabel, { color: isDark ? colors.textDark : colors.text }]}>g</Text>
              </View>
            </View>
            
            <View style={styles.quickButtons}>
              <TouchableOpacity
                style={[styles.quickButton, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
                onPress={() => handleServingsChange('0.5')}
              >
                <Text style={[styles.quickButtonText, { color: isDark ? colors.textDark : colors.text }]}>½</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickButton, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
                onPress={() => handleServingsChange('1')}
              >
                <Text style={[styles.quickButtonText, { color: isDark ? colors.textDark : colors.text }]}>1x</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickButton, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
                onPress={() => handleServingsChange('1.5')}
              >
                <Text style={[styles.quickButtonText, { color: isDark ? colors.textDark : colors.text }]}>1.5x</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickButton, { backgroundColor: isDark ? colors.backgroundDark : colors.background }]}
                onPress={() => handleServingsChange('2')}
              >
                <Text style={[styles.quickButtonText, { color: isDark ? colors.textDark : colors.text }]}>2x</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: isDark ? colors.cardDark : colors.card }]}>
            <Text style={[styles.sectionTitle, { color: isDark ? colors.textDark : colors.text }]}>
              Nutrition Facts
            </Text>
            <Text style={[styles.nutritionNote, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
              For {servingsNum.toFixed(2)} servings ({Math.round(gramsNum)}g)
            </Text>

            {nutrition.calories === 0 && nutrition.protein === 0 && nutrition.carbs === 0 && nutrition.fat === 0 ? (
              <View style={styles.noNutritionContainer}>
                <Text style={[styles.noNutritionText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  ⚠️ No nutrient data available for this food
                </Text>
                <Text style={[styles.noNutritionSubtext, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                  You can still add this food and manually enter nutrition info later
                </Text>
              </View>
            ) : (
              <React.Fragment>
                <View style={styles.nutritionGrid}>
                  <View style={styles.nutritionItem}>
                    <Text style={[styles.nutritionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      Calories
                    </Text>
                    <Text style={[styles.nutritionValue, { color: colors.calories }]}>
                      {Math.round(calculatedCalories)} kcal
                    </Text>
                  </View>

                  <View style={styles.nutritionItem}>
                    <Text style={[styles.nutritionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      Protein
                    </Text>
                    <Text style={[styles.nutritionValue, { color: colors.protein }]}>
                      {calculatedProtein.toFixed(1)}g
                    </Text>
                  </View>

                  <View style={styles.nutritionItem}>
                    <Text style={[styles.nutritionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      Carbs
                    </Text>
                    <Text style={[styles.nutritionValue, { color: colors.carbs }]}>
                      {calculatedCarbs.toFixed(1)}g
                    </Text>
                  </View>

                  <View style={styles.nutritionItem}>
                    <Text style={[styles.nutritionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      Fats
                    </Text>
                    <Text style={[styles.nutritionValue, { color: colors.fats }]}>
                      {calculatedFats.toFixed(1)}g
                    </Text>
                  </View>

                  <View style={styles.nutritionItem}>
                    <Text style={[styles.nutritionLabel, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                      Fiber
                    </Text>
                    <Text style={[styles.nutritionValue, { color: colors.fiber }]}>
                      {calculatedFiber.toFixed(1)}g
                    </Text>
                  </View>
                </View>

                <View style={styles.per100gInfo}>
                  <Text style={[styles.per100gTitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    Per 100g:
                  </Text>
                  <Text style={[styles.per100gText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    {Math.round(nutrition.calories)} kcal • P: {nutrition.protein.toFixed(1)}g • C: {nutrition.carbs.toFixed(1)}g • F: {nutrition.fat.toFixed(1)}g
                  </Text>
                </View>

                <View style={styles.perServingInfo}>
                  <Text style={[styles.perServingTitle, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    Per serving ({servingInfo.displayText}):
                  </Text>
                  <Text style={[styles.perServingText, { color: isDark ? colors.textSecondaryDark : colors.textSecondary }]}>
                    {Math.round(perServingMacros.calories)} kcal • P: {perServingMacros.protein.toFixed(1)}g • C: {perServingMacros.carbs.toFixed(1)}g • F: {perServingMacros.fat.toFixed(1)}g
                  </Text>
                </View>
              </React.Fragment>
            )}
          </View>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>Add to {mealType.charAt(0).toUpperCase() + mealType.slice(1)}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
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
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.h3,
    flex: 1,
    textAlign: 'center',
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
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  offBadgeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  offBadge: {
    fontSize: 12,
    fontWeight: '700',
  },
  foodName: {
    ...typography.h2,
    marginBottom: spacing.xs,
  },
  foodBrand: {
    ...typography.body,
    marginBottom: spacing.sm,
  },
  servingSizeInfo: {
    marginBottom: spacing.sm,
  },
  servingSizeLabel: {
    ...typography.caption,
    marginBottom: 2,
  },
  servingSize: {
    ...typography.bodyBold,
    fontSize: 16,
  },
  servingWarning: {
    ...typography.caption,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  servingInfo: {
    ...typography.caption,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  barcode: {
    ...typography.caption,
    fontStyle: 'italic',
    marginBottom: 2,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: spacing.sm,
  },
  servingInfoText: {
    ...typography.caption,
    marginBottom: spacing.md,
  },
  servingPreview: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  servingPreviewLabel: {
    ...typography.caption,
    marginBottom: 4,
  },
  servingPreviewText: {
    ...typography.bodyBold,
    fontSize: 18,
  },
  servingInput: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  label: {
    ...typography.bodyBold,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontSize: 18,
    fontWeight: '600',
  },
  unitLabel: {
    ...typography.h3,
    fontSize: 18,
  },
  quickButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickButtonText: {
    ...typography.bodyBold,
    fontSize: 14,
  },
  nutritionNote: {
    ...typography.caption,
    marginBottom: spacing.md,
    fontStyle: 'italic',
  },
  noNutritionContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  noNutritionText: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  noNutritionSubtext: {
    ...typography.caption,
    textAlign: 'center',
  },
  nutritionGrid: {
    gap: spacing.md,
  },
  nutritionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  nutritionLabel: {
    ...typography.body,
  },
  nutritionValue: {
    ...typography.bodyBold,
    fontSize: 18,
  },
  per100gInfo: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  per100gTitle: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  per100gText: {
    ...typography.caption,
  },
  perServingInfo: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  perServingTitle: {
    ...typography.caption,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  perServingText: {
    ...typography.caption,
  },
  saveButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  bottomSpacer: {
    height: 100,
  },
});
