
import { OpenFoodFactsProduct, extractServingSize, extractNutrition, extractUnitFromString } from '@/utils/openFoodFacts';
import { parseServingString, singularizeUnit } from '@/utils/servingParser';
import ServingPicker from '@/components/ServingPicker';
import { calcMacros } from '@/utils/macros';
import { formatServing } from '@/utils/servingFormat';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, SUPABASE_PROJECT_URL } from '@/lib/supabase/client';
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
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useColorScheme } from '@/hooks/useColorScheme';

// ─── Micronutrient helpers ────────────────────────────────────────────────────

/** Scale a per-100g nutriment value to the current serving grams */
function scaleNutriment(per100g: number | undefined, servingGrams: number): number | null {
  if (per100g == null || !isFinite(per100g)) return null;
  return (per100g * servingGrams) / 100;
}

/** Format a scaled value with the given unit, rounding to 1 decimal */
function fmtNutrient(value: number | null, unit: string): string | null {
  if (value == null) return null;
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}${unit}`;
}

type NutrientRow = { label: string; value: string };

function buildExtendedMacroRows(n: Record<string, number | undefined>, servingGrams: number): NutrientRow[] {
  const rows: NutrientRow[] = [];
  const add = (label: string, key: string, unit: string, divisor = 1) => {
    const raw = n[key];
    const scaled = scaleNutriment(raw != null ? raw * divisor : undefined, servingGrams);
    const formatted = fmtNutrient(scaled, unit);
    if (formatted != null) rows.push({ label, value: formatted });
  };
  add('Saturated Fat', 'saturated-fat_100g', 'g');
  add('Polyunsaturated Fat', 'polyunsaturated-fat_100g', 'g');
  add('Monounsaturated Fat', 'monounsaturated-fat_100g', 'g');
  add('Trans Fat', 'trans-fat_100g', 'g');
  // cholesterol stored as kg in OFF (mg/1000), display in mg
  add('Cholesterol', 'cholesterol_100g', 'mg', 1000);
  add('Sugar', 'sugars_100g', 'g');
  // sodium stored as kg in OFF (mg/1000), display in mg
  add('Sodium', 'sodium_100g', 'mg', 1000);
  return rows;
}

function buildVitaminRows(n: Record<string, number | undefined>, servingGrams: number): NutrientRow[] {
  const rows: NutrientRow[] = [];
  const addMcg = (label: string, key: string) => {
    const raw = n[key];
    // stored as kg (mcg/1e6), display in mcg
    const scaled = scaleNutriment(raw != null ? raw * 1000000 : undefined, servingGrams);
    const formatted = fmtNutrient(scaled, 'mcg');
    if (formatted != null) rows.push({ label, value: formatted });
  };
  const addMg = (label: string, key: string) => {
    const raw = n[key];
    // stored as kg (mg/1000), display in mg
    const scaled = scaleNutriment(raw != null ? raw * 1000 : undefined, servingGrams);
    const formatted = fmtNutrient(scaled, 'mg');
    if (formatted != null) rows.push({ label, value: formatted });
  };
  addMcg('Vitamin A', 'vitamin-a_100g');
  addMg('Vitamin C', 'vitamin-c_100g');
  addMcg('Vitamin D', 'vitamin-d_100g');
  addMg('Vitamin E', 'vitamin-e_100g');
  addMcg('Vitamin K', 'vitamin-k_100g');
  addMg('Vitamin B1 (Thiamine)', 'vitamin-b1_100g');
  addMg('Vitamin B2 (Riboflavin)', 'vitamin-b2_100g');
  addMg('Vitamin B3 (Niacin)', 'vitamin-b3_100g');
  addMg('Vitamin B6', 'vitamin-b6_100g');
  addMcg('Vitamin B12', 'vitamin-b12_100g');
  addMcg('Folate', 'folate_100g');
  return rows;
}

function buildMineralRows(n: Record<string, number | undefined>, servingGrams: number): NutrientRow[] {
  const rows: NutrientRow[] = [];
  const addMg = (label: string, key: string) => {
    const raw = n[key];
    const scaled = scaleNutriment(raw != null ? raw * 1000 : undefined, servingGrams);
    const formatted = fmtNutrient(scaled, 'mg');
    if (formatted != null) rows.push({ label, value: formatted });
  };
  const addMcg = (label: string, key: string) => {
    const raw = n[key];
    const scaled = scaleNutriment(raw != null ? raw * 1000000 : undefined, servingGrams);
    const formatted = fmtNutrient(scaled, 'mcg');
    if (formatted != null) rows.push({ label, value: formatted });
  };
  addMg('Calcium', 'calcium_100g');
  addMg('Iron', 'iron_100g');
  addMg('Magnesium', 'magnesium_100g');
  addMg('Phosphorus', 'phosphorus_100g');
  addMg('Potassium', 'potassium_100g');
  addMg('Zinc', 'zinc_100g');
  addMg('Manganese', 'manganese_100g');
  addMcg('Selenium', 'selenium_100g');
  return rows;
}

/** Safely coerce any value to a finite number, defaulting to 0 on NaN/null/undefined */
function safeNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return isFinite(n) ? n : fallback;
}

// ─── USDA nutrient ID → food_items column mapping ────────────────────────────
const USDA_NUTRIENT_MAP: Record<number, string> = {
  1008: 'calories',
  1003: 'protein',
  1005: 'carbs',
  1004: 'fat',
  1079: 'fiber',
  2000: 'sugar_g',
  1258: 'saturated_fat_g',
  1257: 'trans_fat_g',
  1253: 'cholesterol_mg',
  1093: 'sodium_mg',
  1092: 'potassium_mg',
  1087: 'calcium_mg',
  1089: 'iron_mg',
  1090: 'magnesium_mg',
  1091: 'phosphorus_mg',
  1095: 'zinc_mg',
  1106: 'vitamin_a_mcg',
  1162: 'vitamin_c_mg',
  1114: 'vitamin_d_mcg',
  1109: 'vitamin_e_mg',
  1185: 'vitamin_k_mcg',
  1165: 'vitamin_b1_mg',
  1166: 'vitamin_b2_mg',
  1167: 'vitamin_b3_mg',
  1175: 'vitamin_b6_mg',
  1178: 'vitamin_b12_mcg',
  1177: 'folate_mcg',
  1180: 'choline_mg',
  1170: 'pantothenic_acid_mg',
};

const USDA_API_KEY = 'DN51vT8uB7dGinfwpljsxal93BOMtOJvgfEyP3Jx';

/**
 * Background enrichment: fetches full micronutrient data from USDA and updates
 * the food_items row. Fire-and-forget — never throws, never blocks the UI.
 */
async function enrichWithUSDA(prod: OpenFoodFactsProduct, foodItemId: string): Promise<void> {
  try {
    // Check existing data_quality_score — skip if already enriched
    const { data: existing } = await supabase
      .from('food_items')
      .select('data_quality_score')
      .eq('id', foodItemId)
      .maybeSingle();

    const existingScore = (existing as any)?.data_quality_score ?? 0;
    if (existingScore > 50) {
      console.log('[FoodDetails] enrichWithUSDA: skipping, already enriched (score=', existingScore, ') for id=', foodItemId);
      return;
    }

    if (prod.code) {
      // ── Case A: has barcode — delegate to lookup-barcode edge function ──
      console.log('[FoodDetails] enrichWithUSDA: Case A — barcode lookup for', prod.code);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${SUPABASE_PROJECT_URL}/functions/v1/lookup-barcode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ barcode: prod.code.trim() }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.warn('[FoodDetails] enrichWithUSDA: lookup-barcode returned', res.status, errText.slice(0, 200));
      } else {
        console.log('[FoodDetails] enrichWithUSDA: lookup-barcode succeeded for barcode=', prod.code);
      }
    } else {
      // ── Case B: no barcode — search USDA FoodData Central directly ──
      const foodName = (prod.product_name || prod.generic_name || '').trim();
      if (!foodName) {
        console.log('[FoodDetails] enrichWithUSDA: Case B — no food name, skipping');
        return;
      }
      console.log('[FoodDetails] enrichWithUSDA: Case B — USDA search for', foodName);
      const usdaUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(foodName)}&dataType=Foundation,SR%20Legacy&pageSize=3`;
      const usdaRes = await fetch(usdaUrl);
      if (!usdaRes.ok) {
        const errText = await usdaRes.text();
        console.warn('[FoodDetails] enrichWithUSDA: USDA search returned', usdaRes.status, errText.slice(0, 200));
        return;
      }
      const usdaJson = await usdaRes.json();
      const foods = usdaJson?.foods;
      if (!Array.isArray(foods) || foods.length === 0) {
        console.log('[FoodDetails] enrichWithUSDA: USDA returned no results for', foodName);
        return;
      }
      const usdaFood = foods[0];
      console.log('[FoodDetails] enrichWithUSDA: USDA matched', usdaFood.description, '(fdcId=', usdaFood.fdcId, ')');

      // Map nutrientId → column value
      const mappedNutrients: Record<string, number> = {};
      const nutrients: { nutrientId: number; value: number }[] = usdaFood.foodNutrients ?? [];
      for (const n of nutrients) {
        const col = USDA_NUTRIENT_MAP[n.nutrientId];
        if (col && n.value != null) {
          mappedNutrients[col] = n.value;
        }
      }

      // Compute a simple quality score: count how many mapped fields are present
      const filledCount = Object.keys(mappedNutrients).length;
      const computedScore = Math.min(100, Math.round((filledCount / Object.keys(USDA_NUTRIENT_MAP).length) * 100));

      console.log('[FoodDetails] enrichWithUSDA: mapped', filledCount, 'nutrients, score=', computedScore);

      const { error: updateErr } = await supabase
        .from('food_items')
        .update({
          source: 'usda',
          usda_fdc_id: String(usdaFood.fdcId),
          macros_per: '100g',
          ...mappedNutrients,
          data_quality_score: computedScore,
          last_verified_at: new Date().toISOString(),
        })
        .eq('id', foodItemId);

      if (updateErr) {
        console.warn('[FoodDetails] enrichWithUSDA: update error:', updateErr.message);
      } else {
        console.log('[FoodDetails] enrichWithUSDA: food_items row enriched successfully, id=', foodItemId);
      }
    }
  } catch (err) {
    console.warn('[FoodDetails] enrichWithUSDA: unexpected error (silenced):', err);
  }
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
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  unitOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  unitOptionText: {
    fontSize: 16,
    flex: 1,
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
  microSection: {
    marginBottom: spacing.lg,
  },
  microToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  microToggleText: {
    fontSize: 16,
    fontWeight: '600',
  },
  microCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  microSubheading: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  microRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  microLabel: {
    fontSize: 14,
  },
  microValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.sm,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  ingredientsText: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs,
  },
  allergensText: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs,
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
  const [selectedServingOptionKey, setSelectedServingOptionKey] = useState('default');
  // In edit mode, the 'default' option gramsPerUnit is derived from the saved DB grams,
  // NOT from extractServingSize — so they stay in sync.
  const [editDefaultGramsPerUnit, setEditDefaultGramsPerUnit] = useState<number | null>(null);

  // Memoized serving options — must be declared before any early returns to satisfy Rules of Hooks.
  // `product` may be null during loading; we guard with a fallback so the array is always valid.
  const servingOptions = useMemo<ServingOption[]>(() => {
    const options: ServingOption[] = [];

    if (product) {
      // ── Natural unit (cookie, egg, slice, etc.) ──────────────────────────
      const totalGrams = product.serving_quantity
        ? parseFloat(String(product.serving_quantity))
        : null;

      const servingSizeStr = typeof product.serving_size === 'string' ? product.serving_size.trim() : '';
      const { unitName: rawUnitName, unitCount } = extractUnitFromString(servingSizeStr);

      // Normalize unit name to lowercase for display
      const unitName = rawUnitName ? rawUnitName.toLowerCase() : null;

      const defGrams =
        mode === 'edit' && editDefaultGramsPerUnit !== null
          ? editDefaultGramsPerUnit
          : (totalGrams ?? 100);

      if (totalGrams && totalGrams > 0 && unitName) {
        const singular = singularizeUnit(unitName);
        // Capitalize first letter for display
        const singularDisplay = singular.charAt(0).toUpperCase() + singular.slice(1);
        const pluralDisplay = singularDisplay + 's';

        if (unitCount > 1) {
          // Case A: unitName exists AND unitCount > 1
          // → "N unitNames (Xg)" — the full standard serving
          options.push({
            key: 'natural_serving',
            label: `${unitCount} ${pluralDisplay} (${totalGrams}g)`,
            gramsPerUnit: totalGrams,
          });
          // → "1 unitName (Yg)" — individual unit
          const gramsPerUnit = totalGrams / unitCount;
          options.push({
            key: 'natural_unit',
            label: `1 ${singularDisplay} (${Math.round(gramsPerUnit)}g)`,
            gramsPerUnit: gramsPerUnit,
          });
          // SKIP default — would be a 3rd duplicate
        } else {
          // Case B: unitName exists AND unitCount === 1
          // → "1 unitName (Xg)" as the only named option
          options.push({
            key: 'default',
            label: `1 ${singularDisplay} (${defGrams}g)`,
            gramsPerUnit: defGrams,
          });
        }
      } else {
        // Case C: no unitName — plain grams product
        const defLabel = (servingSizeStr && !/^\d+(\.\d+)?\s*(g|ml)$/i.test(servingSizeStr) && !/^\d+\s+\d/.test(servingSizeStr) && /[a-zA-Z]/.test(servingSizeStr))
          ? servingSizeStr
          : `1 serving (${defGrams}g)`;

        options.push({
          key: 'default',
          label: defLabel,
          gramsPerUnit: defGrams,
        });
      }
    } else {
      options.push({ key: 'default', label: '1 serving (100g)', gramsPerUnit: 100 });
    }

    // ── Standard measurement units (always present) ──────────────────────
    options.push(
      { key: 'g',     label: '1 g',     gramsPerUnit: 1 },
      { key: 'oz',    label: '1 oz',    gramsPerUnit: 28.35 },
      { key: 'lb',    label: '1 lb',    gramsPerUnit: 453.592 },
      { key: 'ml',    label: '1 ml',    gramsPerUnit: 1 },
      { key: 'tsp',   label: '1 tsp',   gramsPerUnit: 5 },
      { key: 'tbsp',  label: '1 tbsp',  gramsPerUnit: 15 },
      { key: 'cup',   label: '1 cup',   gramsPerUnit: 240 },
      { key: 'fl oz', label: '1 fl oz', gramsPerUnit: 29.57 },
    );

    return options;
  }, [product, editDefaultGramsPerUnit, mode]);

  // Per-100g macros from the foods table — the immutable calculation reference
  const [per100Macros, setPer100Macros] = useState<{ calories: number; protein: number; carbs: number; fats: number; fiber: number } | null>(null);
  // Reference for serving_size and macros_per so calculateMacros can use calcMacros correctly
  const [foodItemRef, setFoodItemRef] = useState<{ serving_size: number; macros_per: string | null } | null>(null);

  const [bannerQueue, setBannerQueue] = useState<{ id: number; message: string; timestamp: number }[]>([]);
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const [showMicroDetails, setShowMicroDetails] = useState(false);

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
      setFoodItemRef({ serving_size: servingInfo.grams, macros_per: '100g' });
      setServingUnit('serving');

      // Use serving_quantity as the authoritative gram value
      const totalGrams = parsedProduct.serving_quantity
        ? parseFloat(String(parsedProduct.serving_quantity))
        : servingInfo.grams;

      // Extract unit name and count from the serving_size string (display only)
      const servingSizeStr = typeof parsedProduct.serving_size === 'string' ? parsedProduct.serving_size.trim() : '';
      const { unitName, unitCount } = extractUnitFromString(servingSizeStr);

      if (unitName && totalGrams > 0) {
        // We have a real unit — select natural_unit, set quantity to unitCount
        const gramsPerUnit = unitCount > 1 ? totalGrams / unitCount : totalGrams;
        const singular = singularizeUnit(unitName);
        console.log('[FoodDetails] loadViewData: natural unit detected from serving_size=', parsedProduct.serving_size, '→ singular=', singular, 'gramsPerUnit=', gramsPerUnit, 'unitCount=', unitCount, 'totalGrams=', totalGrams);
        setServingAmount(gramsPerUnit);
        setNumberOfServings(unitCount > 1 ? String(unitCount) : '1');
        setSelectedServingOptionKey('natural_unit');
      } else {
        // No natural unit — default serving
        console.log('[FoodDetails] loadViewData: no natural unit, using default. totalGrams=', totalGrams);
        setServingAmount(totalGrams);
        setNumberOfServings('1');
        setSelectedServingOptionKey('default');
      }

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
    // serving_size is now TOTAL grams of one standard serving (new architecture).
    // serving_count tells how many units make up that total (e.g. 4 cookies = 29g total).
    let servingSize: string;
    const totalGrams = Number(foodItem.serving_size ?? foodItem.serving_quantity ?? food.serving_amount);
    const sc = Number(foodItem.serving_count) || 1;
    if (foodItem.serving_description) {
      const isNumericDesc = /^\d+(\.\d+)?\s*[a-z]*$/i.test(foodItem.serving_description.trim());
      if (isNumericDesc) {
        // serving_description is just a number+unit like "63g" — treat as no description
        servingSize = `${totalGrams} g`;
        console.log('[FoodDetails] buildMockProductFromFoodItem: numeric serving_description ignored, built servingSize=', servingSize);
      } else if (sc > 1) {
        servingSize = `${sc} ${foodItem.serving_description} (${totalGrams} g)`;
        console.log('[FoodDetails] buildMockProductFromFoodItem: using serving_description →', servingSize, 'serving_count=', sc, 'totalGrams=', totalGrams);
      } else {
        servingSize = `1 ${foodItem.serving_description} (${totalGrams} g)`;
        console.log('[FoodDetails] buildMockProductFromFoodItem: single unit →', servingSize, 'totalGrams=', totalGrams);
      }
    } else {
      // No serving_description — build a plain "<grams> g" string
      servingSize = `${totalGrams} g`;
      console.log('[FoodDetails] buildMockProductFromFoodItem: no serving_description, built servingSize=', servingSize);
    }
    const servingQty = totalGrams;
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
          food_name,
          food_brand,
          foods!left(*),
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

      // Use food_name/food_brand columns as fallback when foods JOIN is null
      const food = mealItem.foods ?? (
        (mealItem as any).food_name
          ? {
              name: (mealItem as any).food_name,
              brand: (mealItem as any).food_brand ?? undefined,
              calories: mealItem.calories ?? 0,
              protein: mealItem.protein ?? 0,
              carbs: mealItem.carbs ?? 0,
              fats: mealItem.fats ?? 0,
              fiber: mealItem.fiber ?? 0,
              serving_amount: mealItem.grams ?? 100,
              serving_unit: mealItem.serving_description ?? 'g',
              user_created: false,
            }
          : mealItem.food_item_id
            ? {
                // food_item_id is present — real data will be loaded from food_items below
                // Use stored macro values as placeholder; they'll be overridden by the food_items fetch
                name: 'Loading...',
                brand: undefined,
                calories: mealItem.calories ?? 0,
                protein: mealItem.protein ?? 0,
                carbs: mealItem.carbs ?? 0,
                fats: mealItem.fats ?? 0,
                fiber: mealItem.fiber ?? 0,
                serving_amount: mealItem.grams ?? 100,
                serving_unit: mealItem.serving_description ?? 'g',
                user_created: false,
              }
            : null
      );
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

      let foodItem: any = null;
      if (mealItem.food_item_id) {
        console.log('[FoodDetails] loadEditItem: fetching food_items columns for id=', mealItem.food_item_id);
        const { data: fetchedFoodItem } = await supabase
          .from('food_items')
          .select('id, name, brand, barcode, calories, protein, carbs, fat, fiber, serving_size, serving_unit, serving_quantity, serving_description, serving_count, macros_per, nutriments, sugar_g, saturated_fat_g, polyunsaturated_fat_g, monounsaturated_fat_g, trans_fat_g, cholesterol_mg, sodium_mg, potassium_mg, calcium_mg, iron_mg, magnesium_mg, phosphorus_mg, zinc_mg, vitamin_a_mcg, vitamin_c_mg, vitamin_d_mcg, vitamin_e_mg, vitamin_k_mcg, vitamin_b1_mg, vitamin_b2_mg, vitamin_b3_mg, vitamin_b6_mg, vitamin_b12_mcg, folate_mcg, choline_mg, pantothenic_acid_mg, selenium_mcg, source, usda_fdc_id, data_quality_score, ingredients_text, allergens')
          .eq('id', mealItem.food_item_id)
          .single();
        foodItem = fetchedFoodItem;

        if (foodItem) {
          // Build mockProduct from individual columns
          console.log('[FoodDetails] loadEditItem: building mockProduct from columns, source=', foodItem.source);
          const n = foodItem;
          // serving_size is now TOTAL grams of one standard serving (new architecture)
          const servingSize = n.serving_description && n.serving_size
            ? (() => {
                const sc = Number(n.serving_count) || 1;
                const totalG = Number(n.serving_size); // serving_size IS total grams
                return `${sc} ${n.serving_description} (${totalG} g)`;
              })()
            : n.serving_size ? `${n.serving_size} g` : undefined;
          mockProduct = {
            code: n.barcode || undefined,
            product_name: n.name,
            brands: n.brand || undefined,
            serving_size: servingSize,
            serving_quantity: n.serving_size, // total grams
            _source: n.source,
            _usda_fdc_id: n.usda_fdc_id,
            _data_quality_score: n.data_quality_score,
            ingredients_text: n.ingredients_text,
            allergens_tags: n.allergens,
            nutriments: (() => {
              const totalGrams = Number(n.serving_size); // already total grams
              return {
                'energy-kcal_100g': n.macros_per === '100g' ? n.calories : (totalGrams ? (n.calories / totalGrams) * 100 : n.calories),
                'proteins_100g': n.macros_per === '100g' ? n.protein : (totalGrams ? (n.protein / totalGrams) * 100 : n.protein),
                'carbohydrates_100g': n.macros_per === '100g' ? n.carbs : (totalGrams ? (n.carbs / totalGrams) * 100 : n.carbs),
                'fat_100g': n.macros_per === '100g' ? n.fat : (totalGrams ? (n.fat / totalGrams) * 100 : n.fat),
                'fiber_100g': n.macros_per === '100g' ? n.fiber : (totalGrams ? ((n.fiber ?? 0) / totalGrams) * 100 : n.fiber),
                'sugars_100g': n.sugar_g != null ? (n.macros_per === '100g' ? n.sugar_g : (totalGrams ? (n.sugar_g / totalGrams) * 100 : n.sugar_g)) : undefined,
                'saturated-fat_100g': n.saturated_fat_g != null ? (n.macros_per === '100g' ? n.saturated_fat_g : (totalGrams ? (n.saturated_fat_g / totalGrams) * 100 : n.saturated_fat_g)) : undefined,
                'sodium_100g': n.sodium_mg != null ? n.sodium_mg / 1000 : undefined,
                'potassium_100g': n.potassium_mg != null ? n.potassium_mg / 1000 : undefined,
                'calcium_100g': n.calcium_mg != null ? n.calcium_mg / 1000 : undefined,
                'iron_100g': n.iron_mg != null ? n.iron_mg / 1000 : undefined,
                'vitamin-c_100g': n.vitamin_c_mg != null ? n.vitamin_c_mg / 1000 : undefined,
                'vitamin-a_100g': n.vitamin_a_mcg != null ? n.vitamin_a_mcg / 1000000 : undefined,
                'vitamin-d_100g': n.vitamin_d_mcg != null ? n.vitamin_d_mcg / 1000000 : undefined,
                'vitamin-e_100g': n.vitamin_e_mg != null ? n.vitamin_e_mg / 1000 : undefined,
                'vitamin-k_100g': n.vitamin_k_mcg != null ? n.vitamin_k_mcg / 1000000 : undefined,
                'vitamin-b6_100g': n.vitamin_b6_mg != null ? n.vitamin_b6_mg / 1000 : undefined,
                'vitamin-b12_100g': n.vitamin_b12_mcg != null ? n.vitamin_b12_mcg / 1000000 : undefined,
                'folate_100g': n.folate_mcg != null ? n.folate_mcg / 1000000 : undefined,
                'magnesium_100g': n.magnesium_mg != null ? n.magnesium_mg / 1000 : undefined,
                'phosphorus_100g': n.phosphorus_mg != null ? n.phosphorus_mg / 1000 : undefined,
                'zinc_100g': n.zinc_mg != null ? n.zinc_mg / 1000 : undefined,
                'selenium_100g': n.selenium_mcg != null ? n.selenium_mcg / 1000000 : undefined,
                'cholesterol_100g': n.cholesterol_mg != null ? n.cholesterol_mg / 1000 : undefined,
              };
            })(),
          };
          // Derive per-100g macros from the built nutriments
          const nm = mockProduct.nutriments as Record<string, number | undefined>;
          per100Cals = safeNum(nm['energy-kcal_100g'] ?? food.calories);
          per100Protein = safeNum(nm['proteins_100g'] ?? food.protein);
          per100Carbs = safeNum(nm['carbohydrates_100g'] ?? food.carbs);
          per100Fats = safeNum(nm['fat_100g'] ?? food.fats);
          per100Fiber = safeNum(nm['fiber_100g'] ?? food.fiber ?? 0);
          console.log('[FoodDetails] loadEditItem: per100 from columns — cals=', per100Cals, 'protein=', per100Protein, 'carbs=', per100Carbs, 'fat=', per100Fats);
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

      // Set foodItemRef so calculateMacros can use calcMacros with correct serving_size/macros_per
      if (mealItem.food_item_id && foodItem?.serving_size) {
        setFoodItemRef({
          serving_size: safeNum(foodItem.serving_size, 100),
          macros_per: foodItem.macros_per ?? null,
        });
      } else {
        setFoodItemRef({ serving_size: 100, macros_per: '100g' });
      }

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
          console.log('[FoodDetails] Edit load (natural unit): unit=', singularUnit, 'gramsPerUnit=', gramsPerUnit, 'desc=', desc);
          setSelectedServingOptionKey('natural_unit');
          setEditDefaultGramsPerUnit(null);
        } else {
          // Default serving — CRITICAL: store gramsPerUnit so the 'default' picker option
          // is built with this value, keeping servingAmount and gramsPerUnit in sync.
          console.log('[FoodDetails] Edit load (default serving): gramsPerUnit=', gramsPerUnit, 'totalGrams=', totalGrams, 'desc=', desc);
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
    // Use the currently selected option's gramsPerUnit (not stale servingAmount state)
    // to accurately compute total grams before switching units.
    const currentOption =
      servingOptions.find((o) => o.key === selectedServingOptionKey) ?? servingOptions[0];
    const currentGramsPerUnit = currentOption?.gramsPerUnit ?? servingAmount;
    const totalGrams = currentGramsPerUnit * (parseFloat(numberOfServings) || 1);
    const newNumberOfServings = totalGrams / option.gramsPerUnit;
    console.log('[FoodDetails] Serving unit changed to:', option.label, 'gramsPerUnit=', option.gramsPerUnit, 'currentGramsPerUnit=', currentGramsPerUnit, 'totalGrams=', totalGrams, 'newNumberOfServings=', newNumberOfServings);
    setServingAmount(option.gramsPerUnit);
    // Discrete units (default / natural_unit / natural_serving) must be whole numbers.
    // Continuous units (g/oz/lb) can be fractional.
    const isDiscrete = option.key === 'default' || option.key === 'natural_unit' || option.key === 'natural_serving';
    if (isDiscrete) {
      const rounded = Math.max(1, Math.round(newNumberOfServings));
      setNumberOfServings(rounded.toString());
    } else {
      setNumberOfServings(newNumberOfServings.toFixed(2));
    }
    setSelectedServingOptionKey(option.key);
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
    if (!per100Macros || !foodItemRef) {
      return { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 };
    }
    const totalGrams = getTotalGrams();
    const fi = {
      calories: per100Macros.calories,
      protein: per100Macros.protein,
      carbs: per100Macros.carbs,
      fat: per100Macros.fats,
      fiber: per100Macros.fiber,
      serving_size: foodItemRef.serving_size,
      macros_per: foodItemRef.macros_per,
    };
    const result = calcMacros(fi, totalGrams);
    return {
      calories: Math.round(result.calories),
      protein: Math.round(result.protein),
      carbs: Math.round(result.carbs),
      fats: Math.round(result.fat),
      fiber: Math.round(result.fiber),
    };
  };

  /**
   * Upsert an OFacts product into food_items and return its id.
   * Uses select-then-insert/update to avoid relying on a unique constraint.
   * Returns null if the product has no usable name.
   */
  const upsertFoodItem = async (prod: OpenFoodFactsProduct): Promise<string | null> => {
    const barcode = prod.code?.trim() || null;
    const pName = (prod.product_name || prod.generic_name || '').trim();
    const pBrand = (prod.brands || '').trim() || null;
    if (!pName) return null;

    // food_items is exclusively for externally verified foods.
    // Only save if the product has a real external identifier.
    const hasExternalSource =
      !!(prod.code?.trim()) ||          // barcode from scan or OFacts
      !!(prod._usda_fdc_id?.trim()) ||  // came from USDA search
      !!(prod._off_id?.trim());         // came from OFacts with explicit id

    if (!hasExternalSource) {
      console.log('[FoodDetails] upsertFoodItem: skipped — no external source (user-created or AI-estimated food)');
      return null;
    }

    const servingInfo = extractServingSize(prod);
    const { description: servingDesc, count: servingCountVal } = parseServingString(prod.serving_size);
    // serving_quantity is the authoritative gram value — use it directly if available
    const totalServingGrams = prod.serving_quantity
      ? parseFloat(String(prod.serving_quantity))
      : servingInfo.grams * (servingCountVal ?? 1);
    // Macros must be per 100g — food_items.macros_per is always "100g"
    const nutrition = extractNutrition(prod);

    console.log('[FoodDetails] upsertFoodItem: serving_description=', servingDesc, 'serving_count=', servingCountVal, 'totalServingGrams=', totalServingGrams, 'for', pName);

    let payload = {
      name: pName,
      brand: pBrand,
      barcode: barcode,
      macros_per: '100g',
      serving_size: totalServingGrams,  // TOTAL grams of one standard serving (not per-unit)
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
      off_data: (() => {
        // Build canonical serving_size to avoid storing corrupted strings (e.g. "1 4 cookies (7.25 g)")
        const canonicalServingSize = servingDesc && servingCountVal && servingCountVal > 1
          ? `${servingCountVal} ${servingDesc} (${totalServingGrams} g)`
          : servingDesc
            ? `1 ${servingDesc} (${totalServingGrams} g)`
            : `${totalServingGrams} g`;
        console.log('[FoodDetails] upsertFoodItem: canonical serving_size=', canonicalServingSize);
        return { ...prod, serving_size: canonicalServingSize };
      })(),
    };

    // ── Pre-save validation: catch corrupted values before they reach the DB ──
    const validationErrors: string[] = [];

    // serving_description must not contain digits
    if (payload.serving_description && /\d/.test(payload.serving_description)) {
      validationErrors.push(`serving_description contains digits: "${payload.serving_description}"`);
      // Strip leading number+space from description (e.g. "4 cookies" → "cookies")
      payload.serving_description = payload.serving_description.replace(/^\d+(\.\d+)?\s+/, '').trim() || null;
    }

    // serving_size must be total grams (reasonable range: 0.1g – 2000g)
    if (payload.serving_size <= 0 || payload.serving_size > 2000) {
      validationErrors.push(`serving_size out of range: ${payload.serving_size}`);
      // Clamp to totalServingGrams as fallback
      payload.serving_size = totalServingGrams;
    }

    // serving_count must be positive integer if set
    if (payload.serving_count !== null && (payload.serving_count < 1 || !Number.isFinite(payload.serving_count))) {
      validationErrors.push(`serving_count invalid: ${payload.serving_count}`);
      payload.serving_count = null;
    }

    // macros must be non-negative finite numbers
    const macroFields = ['calories', 'protein', 'carbs', 'fat'] as const;
    for (const field of macroFields) {
      const val = payload[field] as number;
      if (val < 0 || !Number.isFinite(val)) {
        validationErrors.push(`${field} invalid: ${val}`);
        (payload as Record<string, unknown>)[field] = 0;
      }
    }

    if (validationErrors.length > 0) {
      console.warn('[FoodDetails] upsertFoodItem: validation corrections applied:', validationErrors);
    }
    // ── End validation ──

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
        // Non-blocking enrichment
        enrichWithUSDA(prod, existing.id).catch(err =>
          console.warn('[FoodDetails] enrichWithUSDA failed silently:', err)
        );
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
      // Non-blocking enrichment
      enrichWithUSDA(prod, existingByName.id).catch(err =>
        console.warn('[FoodDetails] enrichWithUSDA failed silently:', err)
      );
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
    // Non-blocking enrichment
    enrichWithUSDA(prod, inserted.id).catch(err =>
      console.warn('[FoodDetails] enrichWithUSDA failed silently:', err)
    );
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
      } else if (selectedServingOptionKey === 'natural_unit' || selectedServingOptionKey === 'natural_serving') {
        // Natural unit (e.g. "1 cookie", "4 cookies") — extract unit word from the option label
        const currentOpt = servingOptions.find((o) => o.key === selectedServingOptionKey);
        const optLabel = currentOpt ? currentOpt.label : '1 serving';
        const naturalMatch = optLabel.match(/^([\d.]+)\s+(.+)$/);
        let naturalUnit = naturalMatch ? naturalMatch[2].trim() : 'serving';
        // Singularize if already plural so formatServing can re-pluralize correctly
        if (naturalUnit.length > 2 && naturalUnit.endsWith('s') && !['oz', 'lbs', 'tbs'].includes(naturalUnit.toLowerCase())) {
          naturalUnit = naturalUnit.slice(0, -1);
        }
        servingDescription = formatServing(servingsCountForDisplay, naturalUnit);
        console.log('[FoodDetailsLayout] handleSave natural unit branch — optLabel:', optLabel, 'naturalUnit:', naturalUnit, 'servingsCount:', servingsCountForDisplay, '→', servingDescription);
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
          console.log('[FoodDetails] handleSave: inserting meal_item, meal_id=', mealId, 'food_id=', foodId, 'food_item_id=', foodItemId, 'food_name=', foodName);
          const { error: mealItemError } = await supabase
            .from('meal_items')
            .insert([{
              meal_id: mealId,
              food_id: foodId,
              ...(foodItemId ? { food_item_id: foodItemId } : {}),
              food_name: foodName,
              food_brand: foodBrand || undefined,
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
          {product?.product_name ? (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: textColor, marginBottom: 2 }}>
                {product.product_name}
              </Text>
              {product.brands ? (
                <Text style={{ fontSize: 13, color: textColor, opacity: 0.6 }}>
                  {product.brands}
                </Text>
              ) : null}
            </View>
          ) : null}
          <Text style={[styles.sectionTitle, { color: textColor }]}>Serving Size</Text>

          <ServingPicker
            options={servingOptions}
            selectedKey={selectedServingOptionKey}
            quantity={numberOfServings}
            onOptionChange={(option) => {
              console.log('[FoodDetails] ServingPicker option changed:', option.key, option.label);
              handleServingOptionChange(option);
            }}
            onQuantityChange={(value) => {
              console.log('[FoodDetails] ServingPicker quantity changed:', value);
              handleNumberOfServingsChange(value);
            }}
            isDark={isDark}
          />
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

        {/* ── Micronutrients section ── */}
        {(() => {
          const n = (product.nutriments ?? {}) as Record<string, number | undefined>;
          const servingGrams = getTotalGrams();
          const extMacroRows = buildExtendedMacroRows(n, servingGrams);
          const vitaminRows = buildVitaminRows(n, servingGrams);
          const mineralRows = buildMineralRows(n, servingGrams);
          const hasAnyMicro = extMacroRows.length > 0 || vitaminRows.length > 0 || mineralRows.length > 0;
          const ingredientsText = (product as any).ingredients_text as string | undefined;
          const allergensTags = (product as any).allergens_tags as string[] | undefined;
          const dataSource = (product as any)._source as string | undefined;
          const qualityScore = (product as any)._data_quality_score as number | undefined;

          if (!hasAnyMicro && !ingredientsText && !allergensTags) return null;

          const sourceLabel =
            dataSource === 'usda' ? 'USDA' :
            dataSource === 'openfoodfacts' ? 'Open Food Facts' :
            dataSource === 'ai' ? 'AI Estimated' :
            dataSource === 'manual' ? 'Manual Entry' :
            null;

          const qualityBadgeColor =
            qualityScore != null && qualityScore >= 80 ? '#22c55e' :
            qualityScore != null && qualityScore >= 50 ? '#f59e0b' :
            null;
          const qualityBadgeLabel =
            qualityScore != null && qualityScore >= 80 ? 'Verified' :
            qualityScore != null && qualityScore >= 50 ? 'Partial data' :
            null;

          return (
            <View style={styles.microSection}>
              {/* Badges row */}
              {(sourceLabel || qualityBadgeLabel) && (
                <View style={styles.badgeRow}>
                  {sourceLabel && (
                    <View style={[styles.badge, { backgroundColor: isDark ? '#1e3a5f' : '#dbeafe' }]}>
                      <Text style={[styles.badgeText, { color: isDark ? '#93c5fd' : '#1d4ed8' }]}>
                        {sourceLabel}
                      </Text>
                    </View>
                  )}
                  {qualityBadgeLabel && qualityBadgeColor && (
                    <View style={[styles.badge, { backgroundColor: qualityBadgeColor + '22' }]}>
                      <Text style={[styles.badgeText, { color: qualityBadgeColor }]}>
                        {qualityBadgeLabel}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Toggle button */}
              {hasAnyMicro && (
                <TouchableOpacity
                  style={[styles.microToggle, { backgroundColor: cardBackground }]}
                  onPress={() => {
                    console.log('[FoodDetails] Show more nutrition toggled, now:', !showMicroDetails);
                    setShowMicroDetails((v) => !v);
                  }}
                >
                  <Text style={[styles.microToggleText, { color: textColor }]}>
                    {showMicroDetails ? 'Hide detailed nutrition' : 'Show more nutrition'}
                  </Text>
                  <IconSymbol
                    ios_icon_name={showMicroDetails ? 'chevron.up' : 'chevron.down'}
                    android_material_icon_name={showMicroDetails ? 'expand-less' : 'expand-more'}
                    size={18}
                    color={textColor}
                  />
                </TouchableOpacity>
              )}

              {showMicroDetails && (
                <View style={[styles.microCard, { backgroundColor: cardBackground }]}>
                  {/* Extended macros */}
                  {extMacroRows.length > 0 && (
                    <>
                      <Text style={[styles.microSubheading, { color: isDark ? '#aaa' : '#666' }]}>
                        Extended Macros
                      </Text>
                      {extMacroRows.map((row, i) => (
                        <View
                          key={row.label}
                          style={[styles.microRow, { borderBottomColor: borderColor, borderBottomWidth: i < extMacroRows.length - 1 ? StyleSheet.hairlineWidth : 0 }]}
                        >
                          <Text style={[styles.microLabel, { color: textColor }]}>{row.label}</Text>
                          <Text style={[styles.microValue, { color: textColor }]}>{row.value}</Text>
                        </View>
                      ))}
                    </>
                  )}

                  {/* Vitamins */}
                  {vitaminRows.length > 0 && (
                    <>
                      <Text style={[styles.microSubheading, { color: isDark ? '#aaa' : '#666', marginTop: extMacroRows.length > 0 ? spacing.md : spacing.xs }]}>
                        Vitamins
                      </Text>
                      {vitaminRows.map((row, i) => (
                        <View
                          key={row.label}
                          style={[styles.microRow, { borderBottomColor: borderColor, borderBottomWidth: i < vitaminRows.length - 1 ? StyleSheet.hairlineWidth : 0 }]}
                        >
                          <Text style={[styles.microLabel, { color: textColor }]}>{row.label}</Text>
                          <Text style={[styles.microValue, { color: textColor }]}>{row.value}</Text>
                        </View>
                      ))}
                    </>
                  )}

                  {/* Minerals */}
                  {mineralRows.length > 0 && (
                    <>
                      <Text style={[styles.microSubheading, { color: isDark ? '#aaa' : '#666', marginTop: (extMacroRows.length > 0 || vitaminRows.length > 0) ? spacing.md : spacing.xs }]}>
                        Minerals
                      </Text>
                      {mineralRows.map((row, i) => (
                        <View
                          key={row.label}
                          style={[styles.microRow, { borderBottomColor: borderColor, borderBottomWidth: i < mineralRows.length - 1 ? StyleSheet.hairlineWidth : 0 }]}
                        >
                          <Text style={[styles.microLabel, { color: textColor }]}>{row.label}</Text>
                          <Text style={[styles.microValue, { color: textColor }]}>{row.value}</Text>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              )}

              {/* Ingredients */}
              {ingredientsText && (
                <View style={[styles.microCard, { backgroundColor: cardBackground }]}>
                  <Text style={[styles.microSubheading, { color: isDark ? '#aaa' : '#666' }]}>Ingredients</Text>
                  <Text style={[styles.ingredientsText, { color: isDark ? '#ccc' : '#444' }]}>{ingredientsText}</Text>
                </View>
              )}

              {/* Allergens */}
              {allergensTags && allergensTags.length > 0 && (
                <View style={[styles.microCard, { backgroundColor: cardBackground }]}>
                  <Text style={[styles.microSubheading, { color: isDark ? '#aaa' : '#666' }]}>Allergens</Text>
                  <Text style={[styles.allergensText, { color: isDark ? '#fca5a5' : '#b91c1c' }]}>
                    {allergensTags.join(', ')}
                  </Text>
                </View>
              )}
            </View>
          );
        })()}

        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: colors.primary }]}
          onPress={() => {
            console.log('[FoodDetails] Add to Meal / Update button pressed, mode=', mode);
            handleSave();
          }}
        >
          <Text style={styles.saveButtonText}>{mode === 'ingredient' ? 'Add Ingredient' : mode === 'edit' ? 'Update' : 'Add to Meal'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
