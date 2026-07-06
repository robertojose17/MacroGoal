
import { OpenFoodFactsProduct, extractServingSize, extractNutrition } from '@/utils/openFoodFacts';
import { formatServing } from '@/utils/servingFormat';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase/client';
import { toLocalDateString } from '@/utils/dateUtils';
import { IconSymbol } from '@/components/IconSymbol';
import { isFavorite, toggleFavorite } from '@/utils/favoritesDatabase';
import { useRouter } from 'expo-router';
import { addToDraft } from '@/utils/myMealsDraft';
import { tryAwardMealLogged, evaluateDailyGoals } from '@/utils/xpAwarder';
import { emitMealLogged } from '@/utils/xpEvents';
import { logFoodUsage, type FoodLogSource } from '@/utils/logFoodUsage';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Platform, ActivityIndicator, Alert, Animated } from 'react-native';
import { colors, spacing, borderRadius, typography } from '@/styles/commonStyles';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useColorScheme } from '@/hooks/useColorScheme';

/** Safely coerce any value to a finite number, defaulting to 0 on NaN/null/undefined */
function safeNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return isFinite(n) ? n : fallback;
}

/**
 * Naively singularize a food unit word.
 * e.g. "slices" → "slice", "cookies" → "cookie", "pieces" → "piece"
 * Leaves short words, "glass", "serving" etc. unchanged.
 */
function singularizeUnit(word: string): string {
  if (!word || word.length <= 3) return word;
  if (word === 'serving' || word === 'servings') return 'serving';
  // "slices" → "slice", "pieces" → "piece" (ends in 'es', not 'ss')
  if (word.endsWith('es') && word.length > 4 && !word.endsWith('ss')) return word.slice(0, -1);
  // "cookies" → "cookie" handled above via 'es'; "chips" → "chip"
  if (word.endsWith('s') && word.length > 3 && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

type ServingUnit = 'g' | 'oz' | 'ml' | 'fl oz' | 'cup' | 'tbsp' | 'tsp' | 'piece' | 'serving';

type ServingOption = {
  key: string;
  label: string;
  gramsPerUnit: number;
};

interface FoodDetailsLayoutProps {
  mode: 'view' | 'edit' | 'ingredient';
  offData?: string;
  mealType?: string;
  date?: string;
  context?: string;
  returnTo?: string;
  itemId?: string;
  planId?: string;
  source?: FoodLogSource;
  onSaveComplete?: () => void;
  onMealPlanSave?: (foodData: {
    food_name: string;
    brand?: string;
    quantity: number;
    grams?: number;
    serving_description?: string;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    fiber?: number;
  }) => Promise<void>;
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
  servingAmountDisplay: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginRight: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  unitButton: {
    flex: 2,
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
  planId,
  source = 'search',
  onSaveComplete,
  onMealPlanSave,
}: FoodDetailsLayoutProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const [product, setProduct] = useState<OpenFoodFactsProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFav, setIsFav] = useState(false);

  const [servingAmount, setServingAmount] = useState(1);
  const [servingUnit, setServingUnit] = useState<ServingUnit>('serving');
  const [numberOfServings, setNumberOfServings] = useState('1');
  const [showUnitOptions, setShowUnitOptions] = useState(false);
  const [selectedServingOptionKey, setSelectedServingOptionKey] = useState('default');
  const [customUnitLabel, setCustomUnitLabel] = useState<string | null>(null);
  const [customUnitGramsPerUnit, setCustomUnitGramsPerUnit] = useState<number>(100);
  // In edit mode, the 'default' option gramsPerUnit is derived from the saved DB grams,
  // NOT from extractServingSize — so they stay in sync.
  const [editDefaultGramsPerUnit, setEditDefaultGramsPerUnit] = useState<number | null>(null);

  // Per-100g macros from the foods table — the immutable calculation reference
  const [per100Macros, setPer100Macros] = useState<{ calories: number; protein: number; carbs: number; fats: number; fiber: number } | null>(null);

  const [bannerQueue, setBannerQueue] = useState<{ id: number; message: string; timestamp: number }[]>([]);
  const bannerOpacity = useRef(new Animated.Value(0)).current;

  const backgroundColor = isDark ? colors.backgroundDark : colors.background;
  const textColor = isDark ? colors.textDark : colors.text;
  const borderColor = isDark ? colors.borderDark : colors.border;
  const cardBackground = isDark ? colors.cardDark : colors.card;

  const loadViewData = useCallback(async () => {
    if (!offData) {
      console.log('No offData provided');
      setLoading(false);
      return;
    }

    try {
      const parsedProduct: OpenFoodFactsProduct = JSON.parse(offData);
      setProduct(parsedProduct);

      const nutrition = extractNutrition(parsedProduct);
      setPer100Macros({
        calories: safeNum(nutrition.calories),
        protein: safeNum(nutrition.protein),
        carbs: safeNum(nutrition.carbs),
        fats: safeNum(nutrition.fat),
        fiber: safeNum(nutrition.fiber),
      });

      const servingInfo = extractServingSize(parsedProduct);
      // For discrete units like "1 egg", "2 slices", extract the leading number as the initial amount.
      // For continuous units like "50 g", fall back to grams.
      const leadingNumberMatch = servingInfo.description.match(/^(\d+\.?\d*)\s+/);
      const initialAmount = leadingNumberMatch ? parseFloat(leadingNumberMatch[1]) : servingInfo.grams;
      setServingAmount(initialAmount);
      setServingUnit('serving');
      setNumberOfServings('1');
      setSelectedServingOptionKey('default');

      await checkFavoriteStatus(parsedProduct);
    } catch (error) {
      console.error('Error loading view data:', error);
      Alert.alert('Error', 'Failed to load food details');
    } finally {
      setLoading(false);
    }
  }, [offData]);

  // Helper: build a minimal OpenFoodFactsProduct from a food_items row
  const buildMockProductFromFoodItem = (
    foodItem: { name?: string; brand?: string; serving_size?: string | number; serving_quantity?: number; serving_unit?: string; serving_description?: string | null; serving_count?: number | null; nutriments?: Record<string, number> | null },
    food: { name: string; brand?: string; calories: number; protein: number; carbs: number; fats: number; fiber?: number; serving_amount: number; serving_unit: string }
  ): OpenFoodFactsProduct => {
    // If serving_description is set, build a rich serving_size string like "4 cookies (29 g)"
    // so extractServingSize can parse it correctly downstream.
    // serving_count tells how many units make up serving_size grams (e.g. 4 cookies = 29g).
    let servingSize: string;
    if (foodItem.serving_description) {
      const gramsVal = foodItem.serving_size ?? foodItem.serving_quantity ?? food.serving_amount;
      const servingCount = Number(foodItem.serving_count) || 1;
      const countLabel = servingCount > 1 ? `${servingCount} ` : '1 ';
      servingSize = `${countLabel}${foodItem.serving_description} (${gramsVal} g)`;
      console.log('[FoodDetails] buildMockProductFromFoodItem: using serving_description →', servingSize, 'serving_count=', servingCount);
    } else {
      servingSize = foodItem.serving_size != null
        ? String(foodItem.serving_size)
        : (foodItem.serving_quantity != null && foodItem.serving_unit
          ? `${foodItem.serving_quantity} ${foodItem.serving_unit}`
          : `${food.serving_amount} ${food.serving_unit}`);
    }
    const servingQty = foodItem.serving_quantity ?? food.serving_amount;
    const n = (foodItem.nutriments ?? {}) as Record<string, number>;
    return {
      product_name: foodItem.name ?? food.name,
      brands: foodItem.brand ?? food.brand ?? '',
      nutriments: {
        'energy-kcal_100g': n['energy-kcal_100g'] ?? n['energy-kcal'] ?? food.calories,
        proteins_100g: n['proteins_100g'] ?? n['proteins'] ?? food.protein,
        carbohydrates_100g: n['carbohydrates_100g'] ?? n['carbohydrates'] ?? food.carbs,
        fat_100g: n['fat_100g'] ?? n['fat'] ?? food.fats,
        fiber_100g: n['fiber_100g'] ?? n['fiber'] ?? food.fiber ?? 0,
      },
      serving_size: servingSize,
      serving_quantity: servingQty,
    };
  };

  // Helper: build a minimal OpenFoodFactsProduct from a foods row (legacy path)
  const buildMockProductFromFoods = (
    food: { name: string; brand?: string; calories: number; protein: number; carbs: number; fats: number; fiber?: number; serving_amount: number; serving_unit: string }
  ): OpenFoodFactsProduct => ({
    product_name: food.name,
    brands: food.brand ?? '',
    nutriments: {
      'energy-kcal_100g': food.calories,
      proteins_100g: food.protein,
      carbohydrates_100g: food.carbs,
      fat_100g: food.fats,
      fiber_100g: food.fiber ?? 0,
    },
    serving_size: `${food.serving_amount} ${food.serving_unit}`,
    serving_quantity: food.serving_amount,
  });

  // Helper: extract per-100g values from a nutriments JSONB object and call setter
  const extractPer100FromNutriments = (
    nutriments: Record<string, number> | null | undefined,
    setter: (cals: number, protein: number, carbs: number, fats: number, fiber: number) => void
  ) => {
    if (!nutriments) return;
    const n = nutriments as Record<string, number>;
    setter(
      safeNum(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0),
      safeNum(n['proteins_100g'] ?? n['proteins'] ?? 0),
      safeNum(n['carbohydrates_100g'] ?? n['carbohydrates'] ?? 0),
      safeNum(n['fat_100g'] ?? n['fat'] ?? 0),
      safeNum(n['fiber_100g'] ?? n['fiber'] ?? 0),
    );
  };

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
          foods (*),
          food_item_id
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

      // Try to fetch richer serving/nutriment data from food_items when available
      let mockProduct: OpenFoodFactsProduct;
      let per100Cals = safeNum(food.calories);
      let per100Protein = safeNum(food.protein);
      let per100Carbs = safeNum(food.carbs);
      let per100Fats = safeNum(food.fats);
      let per100Fiber = safeNum(food.fiber || 0);

      if (mealItem.food_item_id) {
        console.log('[FoodDetails] loadEditItem: fetching food_items for id=', mealItem.food_item_id);
        const { data: foodItem } = await supabase
          .from('food_items')
          .select('off_data, nutriments, serving_size, serving_quantity, serving_unit, serving_description, serving_count, name, brand')
          .eq('id', mealItem.food_item_id)
          .single();

        if (foodItem) {
          if (foodItem.off_data) {
            // Full OpenFoodFacts product blob — use it directly, but override serving_size
            // with serving_description when available so extractServingSize gets a clean string.
            try {
              mockProduct = JSON.parse(foodItem.off_data) as OpenFoodFactsProduct;
              if ((foodItem as any).serving_description) {
                const gramsVal = (foodItem as any).serving_size ?? mockProduct.serving_quantity ?? 100;
                const servingCount = Number((foodItem as any).serving_count) || 1;
                const countLabel = servingCount > 1 ? `${servingCount} ` : '1 ';
                mockProduct = {
                  ...mockProduct,
                  serving_size: `${countLabel}${(foodItem as any).serving_description} (${gramsVal} g)`,
                };
                console.log('[FoodDetails] loadEditItem: overrode serving_size with serving_description →', mockProduct.serving_size, 'serving_count=', servingCount);
              }
              const nutrition = extractNutrition(mockProduct);
              per100Cals = safeNum(nutrition.calories);
              per100Protein = safeNum(nutrition.protein);
              per100Carbs = safeNum(nutrition.carbs);
              per100Fats = safeNum(nutrition.fat);
              per100Fiber = safeNum(nutrition.fiber);
              console.log('[FoodDetails] loadEditItem: built mockProduct from off_data');
            } catch (parseErr) {
              console.warn('[FoodDetails] loadEditItem: failed to parse off_data, falling back', parseErr);
              mockProduct = buildMockProductFromFoodItem(foodItem, food);
              extractPer100FromNutriments(foodItem.nutriments, (c, p, ca, f, fi) => {
                per100Cals = c; per100Protein = p; per100Carbs = ca; per100Fats = f; per100Fiber = fi;
              });
            }
          } else {
            // No off_data — build from nutriments + serving fields (serving_description handled inside)
            mockProduct = buildMockProductFromFoodItem(foodItem, food);
            if (foodItem.nutriments) {
              const n = foodItem.nutriments as Record<string, number>;
              per100Cals = safeNum(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? food.calories);
              per100Protein = safeNum(n['proteins_100g'] ?? n['proteins'] ?? food.protein);
              per100Carbs = safeNum(n['carbohydrates_100g'] ?? n['carbohydrates'] ?? food.carbs);
              per100Fats = safeNum(n['fat_100g'] ?? n['fat'] ?? food.fats);
              per100Fiber = safeNum(n['fiber_100g'] ?? n['fiber'] ?? food.fiber ?? 0);
              console.log('[FoodDetails] loadEditItem: built per100 from food_items.nutriments');
            }
          }
        } else {
          // food_item_id present but row not found — fall back to foods table
          console.warn('[FoodDetails] loadEditItem: food_items row not found, falling back to foods table');
          mockProduct = buildMockProductFromFoods(food);
        }
      } else {
        // No food_item_id — use foods table (legacy path)
        mockProduct = buildMockProductFromFoods(food);
      }

      setProduct(mockProduct);

      setPer100Macros({
        calories: per100Cals,
        protein: per100Protein,
        carbs: per100Carbs,
        fats: per100Fats,
        fiber: per100Fiber,
      });

      // ── Source of truth: the grams saved in DB ──────────────────────────
      // mealItem.grams is what the user actually ate. Reconstruct state from it.
      // Single source of truth for totalGrams (in priority order):
      // 1. mealItem.grams — what was actually saved (most entries)
      // 2. Invert the calorie formula — works for legacy entries where grams is null
      // 3. quantity × food.serving_amount — last resort
      let totalGrams: number;
      if (mealItem.grams != null && mealItem.grams > 0) {
        totalGrams = mealItem.grams;
      } else if (mealItem.calories > 0 && food.calories > 0) {
        // foods.calories is per-100g; invert: totalGrams = (item_calories / per100_calories) * 100
        totalGrams = (mealItem.calories / food.calories) * 100;
      } else {
        totalGrams = (mealItem.quantity || 1) * (food.serving_amount || 100);
      }
      const rawQuantity = mealItem.quantity || 1;
      setServingUnit('serving');

      const desc = (mealItem.serving_description || '').toLowerCase().trim();
      const isContinuousUnit = /\d+(\.\d+)?\s*(g|oz|lb|ml|tsp|tbsp|cup|fl\s*oz|teaspoon|tablespoon)\b/i.test(desc);

      if (isContinuousUnit) {
        // Saved with a continuous unit (g/oz/lb/ml/tsp/tbsp/cup/fl oz) — servingAmount = gramsPerUnit,
        // numberOfServings = how many of those units were consumed.
        if (/\bg\b/.test(desc)) {
          setServingAmount(1);
          setNumberOfServings(totalGrams.toString());
          setSelectedServingOptionKey('g');
        } else if (/\boz\b/.test(desc) && !/fl\s*oz/i.test(desc)) {
          setServingAmount(28.35);
          setNumberOfServings((totalGrams / 28.35).toFixed(2));
          setSelectedServingOptionKey('oz');
        } else if (/\blb\b/.test(desc)) {
          setServingAmount(453.592);
          setNumberOfServings((totalGrams / 453.592).toFixed(2));
          setSelectedServingOptionKey('lb');
        } else if (/\bml\b/.test(desc)) {
          setServingAmount(1);
          setNumberOfServings(totalGrams.toString());
          setSelectedServingOptionKey('ml');
        } else if (/\btbsp\b|\btablespoon/i.test(desc)) {
          setServingAmount(15);
          setNumberOfServings((totalGrams / 15).toFixed(2));
          setSelectedServingOptionKey('tbsp');
        } else if (/\btsp\b|\bteaspoon/i.test(desc)) {
          setServingAmount(5);
          setNumberOfServings((totalGrams / 5).toFixed(2));
          setSelectedServingOptionKey('tsp');
        } else if (/\bcup\b/i.test(desc)) {
          setServingAmount(240);
          setNumberOfServings((totalGrams / 240).toFixed(2));
          setSelectedServingOptionKey('cup');
        } else if (/fl\s*oz/i.test(desc)) {
          setServingAmount(29.57);
          setNumberOfServings((totalGrams / 29.57).toFixed(2));
          setSelectedServingOptionKey('fl oz');
        } else {
          // unknown continuous — fall back to grams
          setServingAmount(1);
          setNumberOfServings(totalGrams.toString());
          setSelectedServingOptionKey('g');
        }
        setCustomUnitLabel(null);
        setEditDefaultGramsPerUnit(null);
        console.log('[FoodDetails] Edit load (continuous): desc=', desc, 'totalGrams=', totalGrams, 'key=', selectedServingOptionKey);
      } else {
        // Saved with a discrete unit (serving / cookie / slice / etc.)
        // gramsPerUnit = totalGrams / quantity — this is the canonical value.
        const gramsPerUnit = rawQuantity > 0 ? totalGrams / rawQuantity : totalGrams;
        setServingAmount(gramsPerUnit);
        setNumberOfServings(Math.max(1, Math.round(rawQuantity)).toString());

        // Try to extract the unit token from serving_description (e.g. "4 slices" → "slice")
        const unitMatch = desc.match(/^\d+(\.\d+)?\s+(.+)$/) || desc.match(/^(.+)$/);
        const rawUnit = unitMatch ? (unitMatch[2] || unitMatch[1] || '').trim() : '';
        const singularUnit = rawUnit ? singularizeUnit(rawUnit) : '';

        if (singularUnit && singularUnit !== 'serving' && singularUnit !== 'g') {
          console.log('[FoodDetails] Edit load (custom unit): unit=', singularUnit, 'gramsPerUnit=', gramsPerUnit, 'desc=', desc);
          setCustomUnitLabel(`1 ${singularUnit}`);
          setCustomUnitGramsPerUnit(gramsPerUnit);
          setSelectedServingOptionKey('custom');
          setEditDefaultGramsPerUnit(null);
        } else {
          // Default serving — CRITICAL: store gramsPerUnit so the 'default' picker option
          // is built with this value, keeping servingAmount and gramsPerUnit in sync.
          console.log('[FoodDetails] Edit load (default serving): gramsPerUnit=', gramsPerUnit, 'totalGrams=', totalGrams, 'desc=', desc);
          setCustomUnitLabel(null);
          setSelectedServingOptionKey('default');
          setEditDefaultGramsPerUnit(gramsPerUnit);
        }
      }

      await checkFavoriteStatus(mockProduct);
    } catch (error) {
      console.error('Error in loadEditItem:', error);
      Alert.alert('Error', 'Failed to load food item');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [itemId, router, selectedServingOptionKey]);

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
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const foodSource = prod.code ? 'barcode' : 'library';
      const foodCode = prod.code || undefined;
      const favStatus = await isFavorite(user.id, foodSource, foodCode, prod.product_name, prod.brands || undefined);
      console.log('[FoodDetails] checkFavoriteStatus result:', favStatus, 'for', prod.product_name);
      setIsFav(favStatus);
    } catch (error) {
      console.error('[FoodDetails] Error checking favorite status:', error);
    }
  };

  const handleToggleFavorite = async () => {
    console.log('[FoodDetails] Favorite button pressed, current isFav:', isFav);
    if (!product) {
      console.log('[FoodDetails] handleToggleFavorite: no product, aborting');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to save favorites');
        return;
      }

      const nutrition = extractNutrition(product);
      const servingInfo = extractServingSize(product);
      const foodSource = product.code ? 'barcode' : 'library';
      const foodCode = product.code || undefined;

      console.log('[FoodDetails] Toggling favorite for:', product.product_name, 'source:', foodSource, 'code:', foodCode);

      const newFavStatus = await toggleFavorite(
        user.id,
        foodSource,
        foodCode,
        {
          food_name: product.product_name || product.generic_name || 'Unknown Product',
          brand: product.brands || undefined,
          per100_calories: safeNum(nutrition.calories),
          per100_protein: safeNum(nutrition.protein),
          per100_carbs: safeNum(nutrition.carbs),
          per100_fat: safeNum(nutrition.fat),
          per100_fiber: safeNum(nutrition.fiber),
          serving_size: servingInfo.description,
          serving_unit: 'g',
          default_grams: servingInfo.grams,
        }
      );

      console.log('[FoodDetails] toggleFavorite returned:', newFavStatus);
      setIsFav(newFavStatus);

      const message = newFavStatus ? 'Added to favorites' : 'Removed from favorites';
      setBannerQueue((prev) => [...prev, { id: Date.now(), message, timestamp: Date.now() }]);
    } catch (error) {
      console.error('[FoodDetails] Error toggling favorite:', error);
      Alert.alert('Error', 'Failed to update favorites. Please try again.');
    }
  };

  const handleServingOptionChange = (option: ServingOption) => {
    console.log('[FoodDetails] Serving unit changed to:', option.label, 'gramsPerUnit=', option.gramsPerUnit);
    const totalGrams = servingAmount * (parseFloat(numberOfServings) || 1);
    const newNumberOfServings = totalGrams / option.gramsPerUnit;
    setServingAmount(option.gramsPerUnit);
    // Discrete units (default = "1 cookie", "1 slice", etc.) must be whole numbers.
    // Continuous units (g/oz/lb) can be fractional.
    const isDiscrete = option.key === 'default' || option.key === 'custom';
    if (isDiscrete) {
      const rounded = Math.max(1, Math.round(newNumberOfServings));
      setNumberOfServings(rounded.toString());
    } else {
      setNumberOfServings(newNumberOfServings.toFixed(2));
    }
    setSelectedServingOptionKey(option.key);
    setShowUnitOptions(false);
  };

  const handleNumberOfServingsChange = (newServings: string) => {
    console.log('[FoodDetails] Number of servings changed to:', newServings);
    setNumberOfServings(newServings);
  };

  const getTotalGrams = (): number => {
    const servings = parseFloat(numberOfServings) || 1;
    return servingAmount * servings;
  };

  const calculateMacros = () => {
    if (!per100Macros) {
      return { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 };
    }
    const totalGrams = getTotalGrams();
    const multiplier = totalGrams / 100;
    return {
      calories: Math.round(per100Macros.calories * multiplier),
      protein: Math.round(per100Macros.protein * multiplier),
      carbs: Math.round(per100Macros.carbs * multiplier),
      fats: Math.round(per100Macros.fats * multiplier),
      fiber: Math.round(per100Macros.fiber * multiplier),
    };
  };

  /**
   * Upsert an OFacts product into food_items and return its id.
   * Uses select-then-insert/update to avoid relying on a unique constraint.
   * Returns null if the product has no usable name.
   */
  /**
   * Extract a human-readable serving description from an OFF serving_size string.
   * e.g. "1 egg (50 g)" → "egg", "4 cookies (29 g)" → "cookies", "50 g" → null
   */
  const extractServingDescription = (servingSizeStr: string | undefined): string | null => {
    if (!servingSizeStr) return null;
    const s = servingSizeStr.trim();
    // Pure gram/ml: "50 g", "100ml" → null
    if (/^\d+(\.\d+)?\s*(g|ml)$/i.test(s)) return null;
    // Has parenthetical: "4 cookies (29 g)" → remove "(29 g)" → "4 cookies" → remove leading number → "cookies"
    if (s.includes('(')) {
      const withoutParens = s.replace(/\s*\(.*\)\s*$/, '').trim();
      const withoutLeadingNumber = withoutParens.replace(/^\d+(\.\d+)?\s+/, '').trim();
      const result = withoutLeadingNumber || null;
      console.log('[FoodDetails] extractServingDescription:', s, '→', result);
      return result;
    }
    return null;
  };

  /**
   * Extract the serving count (number of units) from an OFF serving_size string.
   * e.g. "4 cookies (29 g)" → 4, "1 egg (50 g)" → null, "50 g" → null
   * Returns null when serving_size is a plain gram/ml value or count is 1.
   */
  const extractServingCount = (servingSizeStr: string | undefined): number | null => {
    if (!servingSizeStr) return null;
    const s = servingSizeStr.trim();
    if (/^\d+(\.\d+)?\s*(g|ml)$/i.test(s)) return null;
    const match = s.match(/^(\d+(\.\d+)?)\s+\D/);
    if (!match) return null;
    const count = parseFloat(match[1]);
    console.log('[FoodDetails] extractServingCount:', s, '→', count);
    return count > 1 ? count : null;
  };

  const upsertFoodItem = async (prod: OpenFoodFactsProduct): Promise<string | null> => {
    const barcode = prod.code?.trim() || null;
    const pName = (prod.product_name || prod.generic_name || '').trim();
    const pBrand = (prod.brands || '').trim() || null;
    if (!pName) return null;

    const nutrition = extractNutrition(prod);
    const servingInfo = extractServingSize(prod);
    const servingDesc = extractServingDescription(prod.serving_size);
    const servingCountVal = extractServingCount(prod.serving_size);

    console.log('[FoodDetails] upsertFoodItem: serving_description=', servingDesc, 'serving_count=', servingCountVal, 'for', pName);

    const payload = {
      name: pName,
      brand: pBrand,
      barcode: barcode,
      serving_size: servingInfo.grams * (servingCountVal ?? 1),
      serving_unit: 'g',
      serving_quantity: null as null,
      serving_description: servingDesc,
      serving_count: servingCountVal,
      calories: safeNum(nutrition.calories),
      protein: safeNum(nutrition.protein),
      carbs: safeNum(nutrition.carbs),
      fat: safeNum(nutrition.fat),
      fiber: safeNum(nutrition.fiber),
      nutriments: prod.nutriments || null,
      off_data: prod,
    };

    // 1. Try to find by barcode first (most reliable dedup key)
    if (barcode) {
      const { data: existing } = await supabase
        .from('food_items')
        .select('id')
        .eq('barcode', barcode)
        .maybeSingle();
      if (existing) {
        console.log('[FoodDetails] upsertFoodItem: found by barcode, id=', existing.id);
        await supabase.from('food_items').update(payload).eq('id', existing.id);
        return existing.id;
      }
    }

    // 2. Try to find by name + brand
    const nameQuery = supabase.from('food_items').select('id').ilike('name', pName);
    if (pBrand) nameQuery.ilike('brand', pBrand);
    const { data: existingByName } = await nameQuery.maybeSingle();
    if (existingByName) {
      console.log('[FoodDetails] upsertFoodItem: found by name+brand, id=', existingByName.id);
      await supabase.from('food_items').update(payload).eq('id', existingByName.id);
      return existingByName.id;
    }

    // 3. Insert new row
    const { data: inserted, error: insertErr } = await supabase
      .from('food_items')
      .insert(payload)
      .select('id')
      .single();
    if (insertErr || !inserted) {
      console.error('[FoodDetails] upsertFoodItem: insert error:', insertErr);
      return null;
    }
    console.log('[FoodDetails] upsertFoodItem: inserted new food_item, id=', inserted.id);
    return inserted.id;
  };

  const handleSave = async () => {
    console.log('[FoodDetails] Add to Meal button pressed, mode=', mode, 'context=', context, 'mealType=', mealType, 'date=', date, 'planId=', planId);
    if (!product) {
      console.log('[FoodDetails] handleSave: no product, aborting');
      return;
    }

    // ── Ingredient mode: save to global bridge and go back ──
    if (mode === 'ingredient') {
      const totalGrams = getTotalGrams();
      const macros = calculateMacros();
      const foodName = (product.product_name || product.generic_name || 'Unknown Product').trim();
      const ingredient = {
        name: foodName,
        grams: Math.round(totalGrams),
        kcal: Math.round(macros.calories),
        protein: Math.round(macros.protein),
        carbs: Math.round(macros.carbs),
        fat: Math.round(macros.fats),
      };
      console.log('[FoodDetails] ingredient mode — saving pendingIngredient:', ingredient);
      (global as any).__pendingIngredient = ingredient;
      router.back();
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
      // per-100g nutrition for the foods table (never scaled)
      const nutrition = extractNutrition(product);
      const servingInfo = extractServingSize(product);

      // Build a human-readable serving description using formatServing for proper pluralization.
      // - For 'default' (discrete unit e.g. "slice", "cookie"): multiply numberOfServings by the
      //   food's base serving amount and format with the base unit. E.g. 6 × "1 slice" → "6 slices".
      // - For continuous units (g/oz/lb): show the total amount in the selected unit.
      const baseServing = extractServingSize(product);
      const servingsCountForDisplay = parseFloat(numberOfServings) || 1;

      let servingDescription: string;
      if (selectedServingOptionKey === 'default') {
        // Parse the leading number and unit from the base description (e.g. "1 slice" → 1, "slice")
        const baseDescMatch = (baseServing.description || '').match(/^([\d.]+)\s*(.+)$/);
        const baseAmount = baseDescMatch ? parseFloat(baseDescMatch[1]) : 1;
        let baseUnit = baseDescMatch ? baseDescMatch[2].trim() : 'serving';
        // Singularize if the base unit is already plural (rare upstream data), so formatServing can re-pluralize correctly
        if (baseUnit.length > 2 && baseUnit.endsWith('s') && !['oz', 'lbs', 'tbs'].includes(baseUnit.toLowerCase())) {
          baseUnit = baseUnit.slice(0, -1);
        }
        const totalUnits = servingsCountForDisplay * baseAmount;
        servingDescription = formatServing(totalUnits, baseUnit);
      } else if (selectedServingOptionKey === 'custom') {
        // Custom unit (e.g. "1 slice", "1 cookie") — extract the unit word from customUnitLabel
        // customUnitLabel is set during edit load (e.g. "1 slice") or by the user picker
        const customMatch = (customUnitLabel || '').match(/^([\d.]+)\s+(.+)$/);
        const customAmount = customMatch ? parseFloat(customMatch[1]) : 1;
        let customUnit = customMatch ? customMatch[2].trim() : 'serving';
        // Singularize if already plural so formatServing can re-pluralize correctly
        if (customUnit.length > 2 && customUnit.endsWith('s') && !['oz', 'lbs', 'tbs'].includes(customUnit.toLowerCase())) {
          customUnit = customUnit.slice(0, -1);
        }
        const totalUnits = servingsCountForDisplay * customAmount;
        servingDescription = formatServing(totalUnits, customUnit);
        console.log('[FoodDetailsLayout] handleSave custom unit branch — customUnitLabel:', customUnitLabel, 'customUnit:', customUnit, 'totalUnits:', totalUnits, '→', servingDescription);
      } else {
        // Continuous unit (g/oz/lb/ml/tsp/tbsp/cup/fl oz). numberOfServings is the count in the selected unit.
        const unitSuffix =
          selectedServingOptionKey === 'oz'    ? 'oz' :
          selectedServingOptionKey === 'lb'    ? 'lb' :
          selectedServingOptionKey === 'ml'    ? 'ml' :
          selectedServingOptionKey === 'tsp'   ? 'tsp' :
          selectedServingOptionKey === 'tbsp'  ? 'tbsp' :
          selectedServingOptionKey === 'cup'   ? 'cup' :
          selectedServingOptionKey === 'fl oz' ? 'fl oz' :
          'g';
        servingDescription = formatServing(servingsCountForDisplay, unitSuffix);
      }

      console.log('[FoodDetailsLayout] handleSave serving_description:', servingDescription, '| selectedServingOptionKey:', selectedServingOptionKey, '| numberOfServings:', numberOfServings);

      // Meal-plan mode: delegate to onMealPlanSave callback
      if (onMealPlanSave) {
        const foodName = (product.product_name || product.generic_name || 'Unknown Product').trim();
        const foodBrand = (product.brands || '').trim() || undefined;
        const safeMacros = {
          calories: safeNum(macros.calories),
          protein: safeNum(macros.protein),
          carbs: safeNum(macros.carbs),
          fats: safeNum(macros.fats),
          fiber: safeNum(macros.fiber),
        };
        console.log('[FoodDetails] handleSave: delegating to onMealPlanSave, food=', foodName);
        await onMealPlanSave({
          food_name: foodName,
          brand: foodBrand,
          quantity: parseFloat(numberOfServings) || 1,
          grams: totalGrams,
          serving_description: servingDescription,
          calories: safeMacros.calories,
          protein: safeMacros.protein,
          carbs: safeMacros.carbs,
          fats: safeMacros.fats,
          fiber: safeMacros.fiber,
        });
        return;
      }

      // Ensure all macro values sent to DB are finite numbers, never NaN/null
      const safeMacros = {
        calories: safeNum(macros.calories),
        protein: safeNum(macros.protein),
        carbs: safeNum(macros.carbs),
        fats: safeNum(macros.fats),
        fiber: safeNum(macros.fiber),
      };

      console.log('[FoodDetails] handleSave: safeMacros =', JSON.stringify(safeMacros));

      if (mode === 'edit' && itemId) {
        console.log('[FoodDetails] handleSave: updating meal_item id=', itemId);
        const { error } = await supabase
          .from('meal_items')
          .update({
            quantity: parseFloat(numberOfServings) || 1,
            calories: safeMacros.calories,
            protein: safeMacros.protein,
            carbs: safeMacros.carbs,
            fats: safeMacros.fats,
            fiber: safeMacros.fiber,
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
        // Sanitize food name — product_name can be undefined from OpenFoodFacts
        const foodName = (product.product_name || product.generic_name || 'Unknown Product').trim();
        const foodBrand = (product.brands || '').trim();
        // barcode may be undefined for search results; only include when present
        const foodBarcode = product.code && product.code.trim().length > 0 ? product.code.trim() : null;

        // CRITICAL: foods table stores per-100g values, NOT scaled serving values.
        // Using macros (scaled) here was the root cause of the null constraint violation
        // when serving size was 0 or NaN, and caused wrong nutrition data in the foods table.
        const foodData = {
          name: foodName,
          brand: foodBrand,
          serving_amount: 100,
          serving_unit: 'g',
          calories: safeNum(nutrition.calories),
          protein: safeNum(nutrition.protein),
          carbs: safeNum(nutrition.carbs),
          fats: safeNum(nutrition.fat),   // extractNutrition returns `fat`, foods table uses `fats`
          fiber: safeNum(nutrition.fiber),
          ...(foodBarcode ? { barcode: foodBarcode } : {}),
          user_created: false,
        };

        console.log('[FoodDetails] handleSave: foodData (per-100g) =', JSON.stringify(foodData));

        if (context === 'my_meals_builder' || context === 'my-meals') {
          console.log('[FoodDetails] handleSave: my_meals_builder context — upserting food then adding to draft');

          // Step 1: Find or create the food record so we have a real food_id for the draft
          console.log('[FoodDetails] handleSave (my_meals_builder): searching for existing food, name=', foodName, 'brand=', foodBrand);
          const { data: existingFoodForDraft, error: searchErrorForDraft } = await supabase
            .from('foods')
            .select('id')
            .eq('name', foodName)
            .eq('brand', foodBrand)
            .maybeSingle();

          if (searchErrorForDraft) {
            console.error('[FoodDetails] handleSave (my_meals_builder): food search error:', searchErrorForDraft);
          }

          let draftFoodId: string;

          if (existingFoodForDraft) {
            console.log('[FoodDetails] handleSave (my_meals_builder): found existing food id=', existingFoodForDraft.id);
            draftFoodId = existingFoodForDraft.id;
          } else {
            console.log('[FoodDetails] handleSave (my_meals_builder): inserting new food');
            const { data: newFoodForDraft, error: insertErrorForDraft } = await supabase
              .from('foods')
              .insert([{ ...foodData, created_by: user.id }])
              .select('id')
              .single();

            if (insertErrorForDraft || !newFoodForDraft) {
              console.error('[FoodDetails] handleSave (my_meals_builder): food insert error:', insertErrorForDraft);
              Alert.alert('Error', `Failed to save food: ${insertErrorForDraft?.message ?? 'unknown error'}`);
              return;
            }

            console.log('[FoodDetails] handleSave (my_meals_builder): new food id=', newFoodForDraft.id);
            draftFoodId = newFoodForDraft.id;
          }

          // Step 1b: Upsert to food_items when offData is present so food_item_id is always set
          let draftFoodItemId: string | null = null;
          if (offData) {
            draftFoodItemId = await upsertFoodItem(product);
            console.log('[FoodDetails] handleSave (my_meals_builder): food_item_id resolved =', draftFoodItemId);
          }

          // Step 2: Add to draft with the correct DraftItem shape
          const servingsCount = parseFloat(numberOfServings) || 1;
          await addToDraft({
            food_id: draftFoodId,
            ...(draftFoodItemId ? { food_item_id: draftFoodItemId } : {}),
            food_name: foodName,
            food_brand: foodBrand || undefined,
            serving_amount: servingAmount || 100,
            serving_unit: servingUnit,
            servings_count: servingsCount,
            calories: safeMacros.calories,
            protein: safeMacros.protein,
            carbs: safeMacros.carbs,
            fats: safeMacros.fats,
            fiber: safeMacros.fiber,
          });

          console.log('[FoodDetails] handleSave (my_meals_builder): item added to draft, food_id=', draftFoodId, 'food_item_id=', draftFoodItemId);
          setBannerQueue((prev) => [...prev, { id: Date.now(), message: 'Added to meal', timestamp: Date.now() }]);

          setTimeout(() => {
            router.back();
          }, 500);
        } else {
          // ── Upsert to food_items (global catalog) when offData present — always populate food_item_id ──
          let foodItemId: string | null = null;
          if (offData) {
            foodItemId = await upsertFoodItem(product);
            console.log('[FoodDetails] handleSave: food_item_id resolved =', foodItemId);
          }

          // Step 1: Find or create the food record
          console.log('[FoodDetails] handleSave: searching for existing food, name=', foodName, 'brand=', foodBrand);
          const { data: existingFood, error: searchError } = await supabase
            .from('foods')
            .select('id')
            .eq('name', foodName)
            .eq('brand', foodBrand)
            .maybeSingle();

          if (searchError) {
            console.error('[FoodDetails] handleSave: food search error:', searchError);
          }

          let foodId: string;

          if (existingFood) {
            console.log('[FoodDetails] handleSave: found existing food id=', existingFood.id);
            foodId = existingFood.id;
          } else {
            console.log('[FoodDetails] handleSave: inserting new food');
            const { data: newFood, error: insertError } = await supabase
              .from('foods')
              .insert([{ ...foodData, created_by: user.id }])
              .select('id')
              .single();

            if (insertError || !newFood) {
              console.error('[FoodDetails] handleSave: food insert error:', insertError);
              Alert.alert('Error', `Failed to save food: ${insertError?.message ?? 'unknown error'}`);
              return;
            }

            console.log('[FoodDetails] handleSave: new food id=', newFood.id);
            foodId = newFood.id;
          }

          // Step 2: Find or create the meal record for this date + meal type
          const targetDate = date || toLocalDateString(new Date());
          const targetMealType = mealType || 'breakfast';

          console.log('[FoodDetails] handleSave: looking up meal, date=', targetDate, 'type=', targetMealType, 'user=', user.id);
          const { data: existingMeal, error: mealSearchError } = await supabase
            .from('meals')
            .select('id')
            .eq('user_id', user.id)
            .eq('date', targetDate)
            .eq('meal_type', targetMealType)
            .maybeSingle();

          if (mealSearchError) {
            console.error('[FoodDetails] handleSave: meal search error:', mealSearchError);
          }

          let mealId: string;

          if (existingMeal) {
            console.log('[FoodDetails] handleSave: found existing meal id=', existingMeal.id);
            mealId = existingMeal.id;
          } else {
            console.log('[FoodDetails] handleSave: creating new meal');
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
              console.error('[FoodDetails] handleSave: meal insert error:', mealInsertError);
              Alert.alert('Error', `Failed to create meal: ${mealInsertError?.message ?? 'unknown error'}`);
              return;
            }

            console.log('[FoodDetails] handleSave: new meal id=', newMeal.id);
            mealId = newMeal.id;
          }

          // Step 3: Insert the meal item linking food → meal
          console.log('[FoodDetails] handleSave: inserting meal_item, meal_id=', mealId, 'food_id=', foodId, 'food_item_id=', foodItemId);
          const { error: mealItemError } = await supabase
            .from('meal_items')
            .insert([{
              meal_id: mealId,
              food_id: foodId,
              ...(foodItemId ? { food_item_id: foodItemId } : {}),
              quantity: parseFloat(numberOfServings) || 1,
              calories: safeMacros.calories,
              protein: safeMacros.protein,
              carbs: safeMacros.carbs,
              fats: safeMacros.fats,
              fiber: safeMacros.fiber,
              serving_description: servingDescription,
              grams: totalGrams,
            }]);

          if (mealItemError) {
            console.error('[FoodDetails] handleSave: meal_item insert error:', mealItemError);
            Alert.alert('Error', `Failed to add food to meal: ${mealItemError.message}`);
            return;
          }

          console.log('[FoodDetails] handleSave: meal_item inserted successfully');
          setBannerQueue((prev) => [...prev, { id: Date.now(), message: 'Food added to meal', timestamp: Date.now() }]);

          // ── Log food usage (fire-and-forget) — only when food came from catalog ──
          if (offData && foodItemId) {
            console.log('[FoodDetails] Logging food usage, food_item_id:', foodItemId, 'source:', source);
            logFoodUsage(foodItemId, source);
          } else {
            console.log('[FoodDetails] Skipping logFoodUsage — no catalog food_item_id (user-created food)');
          }

          // ── XP: award meal_logged (fire-and-forget) ──────────────────────
          // We don't have the new meal_item id here (no .select()), so use mealId+foodId as source
          const xpSourceId = `${mealId}_${foodId}_${targetDate}`;
          console.log('[FoodDetails] awarding meal XP, source_id:', xpSourceId);
          tryAwardMealLogged(xpSourceId, targetMealType, targetDate);
          evaluateDailyGoals(targetDate);

          // Notify challenge hook that a meal was logged
          emitMealLogged();

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

  const defaultServingInfo = extractServingSize(product);
  // In edit mode, the 'default' option must use the gramsPerUnit derived from the saved DB grams
  // (not from extractServingSize) so that servingAmount and gramsPerUnit stay in sync.
  const defaultGramsPerUnit =
    mode === 'edit' && editDefaultGramsPerUnit !== null
      ? editDefaultGramsPerUnit
      : defaultServingInfo.grams;
  const defaultOptionLabel =
    mode === 'edit' && editDefaultGramsPerUnit !== null
      ? `1 serving (${Number.isInteger(editDefaultGramsPerUnit) ? editDefaultGramsPerUnit : editDefaultGramsPerUnit.toFixed(1)}g)`
      : (defaultServingInfo.displayText || defaultServingInfo.description || `1 serving (${defaultServingInfo.grams}g)`);
  const servingOptions: ServingOption[] = [
    ...(customUnitLabel
      ? [{ key: 'custom', label: customUnitLabel, gramsPerUnit: customUnitGramsPerUnit }]
      : []),
    { key: 'default', label: defaultOptionLabel, gramsPerUnit: defaultGramsPerUnit },
    { key: 'g',     label: '1 g',     gramsPerUnit: 1 },
    { key: 'oz',    label: '1 oz',    gramsPerUnit: 28.35 },
    { key: 'lb',    label: '1 lb',    gramsPerUnit: 453.592 },
    { key: 'ml',    label: '1 ml',    gramsPerUnit: 1 },
    { key: 'tsp',   label: '1 tsp',   gramsPerUnit: 5 },
    { key: 'tbsp',  label: '1 tbsp',  gramsPerUnit: 15 },
    { key: 'cup',   label: '1 cup',   gramsPerUnit: 240 },
    { key: 'fl oz', label: '1 fl oz', gramsPerUnit: 29.57 },
  ];

  const currentOption = servingOptions.find((o) => o.key === selectedServingOptionKey) || servingOptions[0];
  const currentUnitLabel = currentOption.label;
  const servingAmountDisplay = servingAmount % 1 === 0 ? servingAmount.toString() : servingAmount.toFixed(2);

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
            {mode === 'ingredient' ? 'Add Ingredient' : mode === 'edit' ? 'Edit Food' : 'Food Details'}
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

          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={[styles.numberOfServingsLabel, { color: textColor }]}>Number of servings:</Text>
            <TextInput
              style={[styles.numberOfServingsInput, { color: textColor, borderColor, backgroundColor: cardBackground, marginRight: spacing.sm }]}
              value={numberOfServings}
              onChangeText={handleNumberOfServingsChange}
              keyboardType="decimal-pad"
              placeholder="1"
              placeholderTextColor={isDark ? '#666' : '#999'}
            />
            <TouchableOpacity
              style={[styles.unitButton, { borderColor, backgroundColor: cardBackground, flexDirection: 'row', justifyContent: 'space-between' }]}
              onPress={() => {
                console.log('[FoodDetails] Unit selector pressed, showUnitOptions=', !showUnitOptions);
                setShowUnitOptions(!showUnitOptions);
              }}
            >
              <Text style={[styles.unitButtonText, { color: textColor, flex: 1 }]} numberOfLines={1}>{currentUnitLabel}</Text>
              <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand-more" size={16} color={textColor} />
            </TouchableOpacity>
          </View>

          {showUnitOptions && (
            <View style={[styles.unitOptionsContainer, { backgroundColor: cardBackground }]}>
              {servingOptions.map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.unitOption, { borderBottomColor: borderColor, backgroundColor: option.key === selectedServingOptionKey ? (isDark ? '#2a2a2a' : '#f0f0f0') : undefined }]}
                  onPress={() => handleServingOptionChange(option)}
                >
                  <Text style={[styles.unitOptionText, { color: textColor }]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
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
          <Text style={styles.saveButtonText}>{mode === 'ingredient' ? 'Add Ingredient' : mode === 'edit' ? 'Update' : 'Add to Meal'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
