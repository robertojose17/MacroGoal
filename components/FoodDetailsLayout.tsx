
import { OpenFoodFactsProduct, extractServingSize, extractNutrition, ServingSizeInfo } from '@/utils/openFoodFacts';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/app/integrations/supabase/client';
import { IconSymbol } from '@/components/IconSymbol';
import { isFavorite, toggleFavorite } from '@/utils/favoritesDatabase';
import { useRouter } from 'expo-router';
import { addToDraft } from '@/utils/myMealsDraft';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Platform, ActivityIndicator, Alert, Animated } from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useColorScheme } from '@/hooks/useColorScheme';

type ServingUnit = 'g' | 'oz' | 'ml' | 'fl oz' | 'cup' | 'tbsp' | 'tsp' | 'piece' | 'serving';

type ServingOption = {
  unit: ServingUnit;
  label: string;
  gramsPerUnit: number;
};

interface FoodDetailsLayoutProps {
  mode: 'view' | 'edit';
  offData?: string;
  mealType?: string;
  date?: string;
  context?: string;
  returnTo?: string;
  itemId?: string;
  onSaveComplete?: () => void;
}

const UNIT_CONVERSIONS: Record<ServingUnit, number> = {
  'g': 1,
  'oz': 28.35,
  'ml': 1,
  'fl oz': 29.57,
  'cup': 240,
  'tbsp': 15,
  'tsp': 5,
  'piece': 1,
  'serving': 1,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    padding: spacing.xs,
    marginRight: spacing.sm,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    flex: 1,
  },
  favoriteButton: {
    padding: spacing.xs,
  },
  scrollContent: {
    padding: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  foodName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: spacing.xs,
  },
  brandName: {
    fontSize: 16,
    marginBottom: spacing.md,
  },
  servingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  servingInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    fontSize: 16,
    marginRight: spacing.sm,
  },
  unitButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  unitButtonText: {
    fontSize: 16,
  },
  unitOptionsContainer: {
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  unitOption: {
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  unitOptionText: {
    fontSize: 16,
  },
  numberOfServingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  numberOfServingsLabel: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  numberOfServingsInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    fontSize: 16,
  },
  macroCard: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  macroLabel: {
    fontSize: 16,
  },
  macroValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  banner: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  bannerIcon: {
    marginRight: spacing.sm,
  },
  bannerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
});

export default function FoodDetailsLayout({
  mode,
  offData,
  mealType,
  date,
  context,
  returnTo,
  itemId,
  onSaveComplete,
}: FoodDetailsLayoutProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const [product, setProduct] = useState<OpenFoodFactsProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFav, setIsFav] = useState(false);

  const [servingAmount, setServingAmount] = useState('1');
  const [servingUnit, setServingUnit] = useState<ServingUnit>('serving');
  const [numberOfServings, setNumberOfServings] = useState('1');
  const [showUnitOptions, setShowUnitOptions] = useState(false);

  const [bannerQueue, setBannerQueue] = useState<{ id: number; message: string; timestamp: number }[]>([]);
  const bannerOpacity = useRef(new Animated.Value(0)).current;

  const backgroundColor = isDark ? colors.dark.background : colors.light.background;
  const textColor = isDark ? colors.dark.text : colors.light.text;
  const borderColor = isDark ? colors.dark.border : colors.light.border;
  const cardBackground = isDark ? colors.dark.card : colors.light.card;

  const loadViewData = useCallback(async () => {
    if (!offData) {
      console.log('No offData provided');
      setLoading(false);
      return;
    }

    try {
      const parsedProduct: OpenFoodFactsProduct = JSON.parse(offData);
      setProduct(parsedProduct);

      const servingInfo = extractServingSize(parsedProduct);
      setServingAmount(servingInfo.grams.toString());
      setServingUnit('g');

      await checkFavoriteStatus(parsedProduct);
    } catch (error) {
      console.error('Error loading view data:', error);
      Alert.alert('Error', 'Failed to load food details');
    } finally {
      setLoading(false);
    }
  }, [offData]);

  const loadEditItem = useCallback(async () => {
    if (!itemId) {
      console.log('No itemId provided for edit mode');
      setLoading(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in');
        router.back();
        return;
      }

      const { data: mealItem, error } = await supabase
        .from('meal_items')
        .select(`
          *,
          foods (*)
        `)
        .eq('id', itemId)
        .single();

      if (error || !mealItem) {
        console.error('Error loading meal item:', error);
        Alert.alert('Error', 'Failed to load food item');
        router.back();
        return;
      }

      const food = mealItem.foods;
      if (!food) {
        Alert.alert('Error', 'Food data not found');
        router.back();
        return;
      }

      const mockProduct: OpenFoodFactsProduct = {
        product_name: food.name,
        brands: food.brand || '',
        nutriments: {
          'energy-kcal_100g': food.calories,
          proteins_100g: food.protein,
          carbohydrates_100g: food.carbs,
          fat_100g: food.fats,
          fiber_100g: food.fiber || 0,
        },
        serving_size: mealItem.serving_description || `${food.serving_amount}${food.serving_unit}`,
        serving_quantity: food.serving_amount,
      };

      setProduct(mockProduct);
      setServingAmount(mealItem.grams?.toString() || '100');
      setServingUnit('g');
      setNumberOfServings(mealItem.quantity.toString());

      await checkFavoriteStatus(mockProduct);
    } catch (error) {
      console.error('Error in loadEditItem:', error);
      Alert.alert('Error', 'Failed to load food item');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [itemId, router]);

  useEffect(() => {
    if (mode === 'view') {
      loadViewData();
    } else if (mode === 'edit') {
      loadEditItem();
    }
  }, [mode, loadViewData, loadEditItem]);

  useEffect(() => {
    if (bannerQueue.length > 0) {
      Animated.sequence([
        Animated.timing(bannerOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(2000),
        Animated.timing(bannerOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setBannerQueue((prev) => prev.slice(1));
      });
    }
  }, [bannerQueue, bannerOpacity]);

  const checkFavoriteStatus = async (prod: OpenFoodFactsProduct) => {
    const favStatus = await isFavorite(prod.product_name, prod.brands || '');
    setIsFav(favStatus);
  };

  const handleToggleFavorite = async () => {
    if (!product) {
      return;
    }

    const nutrition = extractNutrition(product);
    const servingInfo = extractServingSize(product);

    await toggleFavorite({
      name: product.product_name,
      brand: product.brands || '',
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbs: nutrition.carbs,
      fats: nutrition.fats,
      fiber: nutrition.fiber,
      serving_amount: servingInfo.grams,
      serving_unit: 'g',
      barcode: product.code,
      off_data: JSON.stringify(product),
    });

    const newFavStatus = !isFav;
    setIsFav(newFavStatus);

    const message = newFavStatus ? 'Added to favorites' : 'Removed from favorites';
    setBannerQueue((prev) => [...prev, { id: Date.now(), message, timestamp: Date.now() }]);
  };

  const convertToGrams = (amount: number, unit: ServingUnit): number => {
    return amount * UNIT_CONVERSIONS[unit];
  };

  const convertFromGrams = (grams: number, unit: ServingUnit): number => {
    return grams / UNIT_CONVERSIONS[unit];
  };

  const handleServingAmountChange = (newAmount: string) => {
    setServingAmount(newAmount);
  };

  const handleServingUnitChange = (newUnit: ServingUnit) => {
    const currentGrams = convertToGrams(parseFloat(servingAmount) || 0, servingUnit);
    const newAmount = convertFromGrams(currentGrams, newUnit);
    setServingAmount(newAmount.toFixed(1));
    setServingUnit(newUnit);
    setShowUnitOptions(false);
  };

  const handleNumberOfServingsChange = (newServings: string) => {
    setNumberOfServings(newServings);
  };

  const getTotalGrams = (): number => {
    const amount = parseFloat(servingAmount) || 0;
    const servings = parseFloat(numberOfServings) || 1;
    const gramsPerServing = convertToGrams(amount, servingUnit);
    return gramsPerServing * servings;
  };

  const calculateMacros = () => {
    if (!product) {
      return { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 };
    }

    const totalGrams = getTotalGrams();
    const nutrition = extractNutrition(product);

    const multiplier = totalGrams / 100;

    return {
      calories: Math.round(nutrition.calories * multiplier),
      protein: Math.round(nutrition.protein * multiplier * 10) / 10,
      carbs: Math.round(nutrition.carbs * multiplier * 10) / 10,
      fats: Math.round(nutrition.fats * multiplier * 10) / 10,
      fiber: Math.round(nutrition.fiber * multiplier * 10) / 10,
    };
  };

  const handleSave = async () => {
    if (!product) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in');
        return;
      }

      const totalGrams = getTotalGrams();
      const macros = calculateMacros();
      const servingInfo = extractServingSize(product);

      const servingDescription = `${servingAmount} ${servingUnit}`;

      if (mode === 'edit' && itemId) {
        const { error } = await supabase
          .from('meal_items')
          .update({
            quantity: parseFloat(numberOfServings) || 1,
            calories: macros.calories,
            protein: macros.protein,
            carbs: macros.carbs,
            fats: macros.fats,
            fiber: macros.fiber,
            serving_description: servingDescription,
            grams: totalGrams,
          })
          .eq('id', itemId);

        if (error) {
          console.error('Error updating meal item:', error);
          Alert.alert('Error', 'Failed to update food item');
          return;
        }

        setBannerQueue((prev) => [...prev, { id: Date.now(), message: 'Food updated successfully', timestamp: Date.now() }]);
        
        if (onSaveComplete) {
          onSaveComplete();
        }

        setTimeout(() => {
          router.back();
        }, 500);
      } else {
        const foodData = {
          name: product.product_name,
          brand: product.brands || '',
          serving_amount: servingInfo.grams,
          serving_unit: 'g',
          calories: macros.calories,
          protein: macros.protein,
          carbs: macros.carbs,
          fats: macros.fats,
          fiber: macros.fiber,
          barcode: product.code,
          user_created: false,
          off_data: JSON.stringify(product),
        };

        if (context === 'my-meals') {
          await addToDraft({
            ...foodData,
            quantity: parseFloat(numberOfServings) || 1,
            serving_description: servingDescription,
            grams: totalGrams,
          });

          setBannerQueue((prev) => [...prev, { id: Date.now(), message: 'Added to My Meal draft', timestamp: Date.now() }]);

          setTimeout(() => {
            if (returnTo) {
              router.push(returnTo as any);
            } else {
              router.back();
            }
          }, 500);
        } else {
          const { data: existingFood, error: searchError } = await supabase
            .from('foods')
            .select('id')
            .eq('name', foodData.name)
            .eq('brand', foodData.brand)
            .maybeSingle();

          let foodId: string;

          if (existingFood) {
            foodId = existingFood.id;
          } else {
            const { data: newFood, error: insertError } = await supabase
              .from('foods')
              .insert([{ ...foodData, created_by: user.id }])
              .select('id')
              .single();

            if (insertError || !newFood) {
              console.error('Error inserting food:', insertError);
              Alert.alert('Error', 'Failed to save food');
              return;
            }

            foodId = newFood.id;
          }

          const targetDate = date || new Date().toISOString().split('T')[0];
          const targetMealType = mealType || 'breakfast';

          const { data: existingMeal, error: mealSearchError } = await supabase
            .from('meals')
            .select('id')
            .eq('user_id', user.id)
            .eq('date', targetDate)
            .eq('meal_type', targetMealType)
            .maybeSingle();

          let mealId: string;

          if (existingMeal) {
            mealId = existingMeal.id;
          } else {
            const { data: newMeal, error: mealInsertError } = await supabase
              .from('meals')
              .insert([{
                user_id: user.id,
                date: targetDate,
                meal_type: targetMealType,
              }])
              .select('id')
              .single();

            if (mealInsertError || !newMeal) {
              console.error('Error creating meal:', mealInsertError);
              Alert.alert('Error', 'Failed to create meal');
              return;
            }

            mealId = newMeal.id;
          }

          const { error: mealItemError } = await supabase
            .from('meal_items')
            .insert([{
              meal_id: mealId,
              food_id: foodId,
              quantity: parseFloat(numberOfServings) || 1,
              calories: macros.calories,
              protein: macros.protein,
              carbs: macros.carbs,
              fats: macros.fats,
              fiber: macros.fiber,
              serving_description: servingDescription,
              grams: totalGrams,
            }]);

          if (mealItemError) {
            console.error('Error adding meal item:', mealItemError);
            Alert.alert('Error', 'Failed to add food to meal');
            return;
          }

          setBannerQueue((prev) => [...prev, { id: Date.now(), message: 'Food added to meal', timestamp: Date.now() }]);

          setTimeout(() => {
            router.back();
          }, 500);
        }
      }
    } catch (error) {
      console.error('Error in handleSave:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  const handleUnitOptionPress = (option: ServingOption) => {
    handleServingUnitChange(option.unit);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!product) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <Text style={{ color: textColor }}>No product data available</Text>
        </View>
      </SafeAreaView>
    );
  }

  const macros = calculateMacros();

  const servingOptions: ServingOption[] = [
    { unit: 'g', label: 'Grams (g)', gramsPerUnit: 1 },
    { unit: 'oz', label: 'Ounces (oz)', gramsPerUnit: 28.35 },
    { unit: 'serving', label: 'Serving', gramsPerUnit: extractServingSize(product).grams },
  ];

  const currentBanner = bannerQueue[0];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor }]} edges={['top']}>
      {currentBanner && (
        <Animated.View style={[styles.bannerContainer, { opacity: bannerOpacity }]}>
          <View style={[styles.banner, { backgroundColor: colors.primary }]}>
            <IconSymbol
              ios_icon_name="checkmark.circle.fill"
              android_material_icon_name="check-circle"
              size={20}
              color="#fff"
              style={styles.bannerIcon}
            />
            <Text style={[styles.bannerText, { color: '#fff' }]}>{currentBanner.message}</Text>
          </View>
        </Animated.View>
      )}

      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: textColor }]}>
            {mode === 'edit' ? 'Edit Food' : 'Food Details'}
          </Text>
        </View>
        <TouchableOpacity style={styles.favoriteButton} onPress={handleToggleFavorite}>
          <IconSymbol
            ios_icon_name={isFav ? 'heart.fill' : 'heart'}
            android_material_icon_name={isFav ? 'favorite' : 'favorite-border'}
            size={24}
            color={isFav ? '#FF6B6B' : textColor}
          />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={[styles.foodName, { color: textColor }]}>{product.product_name}</Text>
          {product.brands && (
            <Text style={[styles.brandName, { color: isDark ? '#aaa' : '#666' }]}>{product.brands}</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Serving Size</Text>
          <View style={styles.servingRow}>
            <TextInput
              style={[styles.servingInput, { color: textColor, borderColor, backgroundColor: cardBackground }]}
              value={servingAmount}
              onChangeText={handleServingAmountChange}
              keyboardType="decimal-pad"
              placeholder="Amount"
              placeholderTextColor={isDark ? '#666' : '#999'}
            />
            <TouchableOpacity
              style={[styles.unitButton, { borderColor, backgroundColor: cardBackground }]}
              onPress={() => setShowUnitOptions(!showUnitOptions)}
            >
              <Text style={[styles.unitButtonText, { color: textColor }]}>{servingUnit}</Text>
            </TouchableOpacity>
          </View>

          {showUnitOptions && (
            <View style={[styles.unitOptionsContainer, { backgroundColor: cardBackground }]}>
              {servingOptions.map((option) => (
                <TouchableOpacity
                  key={option.unit}
                  style={[styles.unitOption, { borderBottomColor: borderColor }]}
                  onPress={() => handleUnitOptionPress(option)}
                >
                  <Text style={[styles.unitOptionText, { color: textColor }]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.numberOfServingsRow}>
            <Text style={[styles.numberOfServingsLabel, { color: textColor }]}>Number of servings:</Text>
            <TextInput
              style={[styles.numberOfServingsInput, { color: textColor, borderColor, backgroundColor: cardBackground }]}
              value={numberOfServings}
              onChangeText={handleNumberOfServingsChange}
              keyboardType="decimal-pad"
              placeholder="1"
              placeholderTextColor={isDark ? '#666' : '#999'}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Nutrition Facts</Text>
          <View style={[styles.macroCard, { backgroundColor: cardBackground }]}>
            <View style={styles.macroRow}>
              <Text style={[styles.macroLabel, { color: textColor }]}>Calories</Text>
              <Text style={[styles.macroValue, { color: textColor }]}>{macros.calories} kcal</Text>
            </View>
            <View style={styles.macroRow}>
              <Text style={[styles.macroLabel, { color: textColor }]}>Protein</Text>
              <Text style={[styles.macroValue, { color: textColor }]}>{macros.protein}g</Text>
            </View>
            <View style={styles.macroRow}>
              <Text style={[styles.macroLabel, { color: textColor }]}>Carbs</Text>
              <Text style={[styles.macroValue, { color: textColor }]}>{macros.carbs}g</Text>
            </View>
            <View style={styles.macroRow}>
              <Text style={[styles.macroLabel, { color: textColor }]}>Fats</Text>
              <Text style={[styles.macroValue, { color: textColor }]}>{macros.fats}g</Text>
            </View>
            <View style={styles.macroRow}>
              <Text style={[styles.macroLabel, { color: textColor }]}>Fiber</Text>
              <Text style={[styles.macroValue, { color: textColor }]}>{macros.fiber}g</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.primary }]} onPress={handleSave}>
          <Text style={styles.saveButtonText}>{mode === 'edit' ? 'Update' : 'Add to Meal'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
