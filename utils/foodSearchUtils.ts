
/**
 * Shared food-search utilities used by add-food.tsx and food-search.tsx.
 *
 * Key sorting contract:
 *  - supabase results arrive pre-sorted by the server (name_match → logs_last_30d → popularity_score).
 *    We preserve that order and never re-sort them.
 *  - off / local results are sorted client-side by name relevance.
 *  - Supabase items always appear before off/local items in the final list.
 */

import { OpenFoodFactsProduct, extractServingSize, extractNutritionPerServing } from '@/utils/openFoodFacts';
import { supabase } from '@/lib/supabase/client';

// Source tag for progressive UI
export type ResultSource = 'local' | 'supabase' | 'off';

export interface SearchResultItem {
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

export function buildResultItem(product: OpenFoodFactsProduct, source: ResultSource): SearchResultItem {
  const servingInfo = extractServingSize(product);
  const nutrition = extractNutritionPerServing(product, servingInfo.grams);
  return {
    product,
    displayCalories: nutrition.calories,
    displayProtein: nutrition.protein,
    displayCarbs: nutrition.carbs,
    displayFats: nutrition.fat,
    displayFiber: nutrition.fiber,
    servingText: servingInfo.displayText,
    hasNutrition: nutrition.calories > 0 || nutrition.protein > 0 || nutrition.carbs > 0 || nutrition.fat > 0,
    source,
  };
}

/**
 * Merge incoming products into the existing results map.
 * Deduplicates by product.code. Priority: supabase > off > local.
 *
 * Sorting rules:
 *  - supabase items: server order is preserved (no client re-sort).
 *  - off / local items: sorted by name relevance score.
 *  - Final list: all supabase items first, then off/local items sorted by relevance.
 */
export function mergeProducts(
  existing: Map<string, SearchResultItem>,
  incoming: OpenFoodFactsProduct[],
  source: ResultSource,
  query: string,
): SearchResultItem[] {
  const sourcePriority: Record<ResultSource, number> = { supabase: 3, off: 2, local: 1 };
  const incomingPriority = sourcePriority[source];

  // Track insertion order for supabase items so we can preserve server sort.
  // We use a separate ordered list keyed by the same keys as the map.
  const supabaseOrder: string[] = [];

  for (const product of incoming) {
    const key = product.code || `${product.product_name || ''}-${product.brands || ''}`;
    if (!key) continue;
    const existing_ = existing.get(key);
    if (!existing_ || sourcePriority[existing_.source] < incomingPriority) {
      existing.set(key, buildResultItem(product, source));
      if (source === 'supabase') {
        supabaseOrder.push(key);
      }
    }
  }

  const q = query.toLowerCase().trim();

  const nameRelevanceScore = (item: SearchResultItem): number => {
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

  // Partition into supabase (server-ordered) vs client-sorted buckets.
  const supabaseItems: SearchResultItem[] = [];
  const clientItems: SearchResultItem[] = [];

  // Collect supabase items in server insertion order.
  const supabaseKeySet = new Set(supabaseOrder);
  for (const key of supabaseOrder) {
    const item = existing.get(key);
    if (item && item.hasNutrition) {
      supabaseItems.push(item);
    }
  }

  // Collect non-supabase items.
  for (const [key, item] of existing.entries()) {
    if (!supabaseKeySet.has(key) && item.source !== 'supabase') {
      if (item.hasNutrition) {
        clientItems.push(item);
      }
    }
  }

  // Also include any supabase items already in the map from a previous call
  // (supabaseOrder only tracks the current batch — existing supabase items
  //  from prior batches are already in supabaseItems via the loop above, but
  //  we need to catch pre-existing supabase entries not in supabaseOrder).
  for (const [key, item] of existing.entries()) {
    if (item.source === 'supabase' && !supabaseKeySet.has(key) && item.hasNutrition) {
      supabaseItems.push(item);
    }
  }

  // Sort client-side items by name relevance.
  clientItems.sort((a, b) => nameRelevanceScore(b) - nameRelevanceScore(a));

  return [...supabaseItems, ...clientItems].slice(0, 80);
}

/**
 * Fetch a food_items row by id and build a complete OpenFoodFactsProduct shape.
 * This is the single source of truth for all food-details entry points.
 * Returns null if the row doesn't exist.
 */
export async function buildOffProductFromFoodItemId(foodItemId: string): Promise<OpenFoodFactsProduct | null> {
  console.log('[buildOffProductFromFoodItemId] Fetching food_items row:', foodItemId);
  const { data: fi, error } = await supabase
    .from('food_items')
    .select(`id, name, brand, barcode, calories, protein, carbs, fat, fiber,
             serving_size, serving_unit, serving_quantity, serving_description, serving_count, macros_per,
             sugar_g, saturated_fat_g, polyunsaturated_fat_g, monounsaturated_fat_g, trans_fat_g,
             cholesterol_mg, sodium_mg, potassium_mg, calcium_mg, iron_mg, magnesium_mg,
             phosphorus_mg, zinc_mg, vitamin_a_mcg, vitamin_c_mg, vitamin_d_mcg, vitamin_e_mg,
             vitamin_k_mcg, vitamin_b1_mg, vitamin_b2_mg, vitamin_b3_mg, vitamin_b6_mg,
             vitamin_b12_mcg, folate_mcg, choline_mg, pantothenic_acid_mg, selenium_mcg,
             source, usda_fdc_id, data_quality_score, ingredients_text, allergens, off_data`)
    .eq('id', foodItemId)
    .maybeSingle();

  if (error || !fi) {
    console.warn('[buildOffProductFromFoodItemId] Lookup failed:', error);
    return null;
  }

  console.log('[buildOffProductFromFoodItemId] ✅ Fetched:', fi.name, '| off_data present:', !!fi.off_data);

  // If legacy off_data exists, use it as base but enrich with serving_description
  if (fi.off_data && typeof fi.off_data === 'object') {
    const base = fi.off_data as OpenFoodFactsProduct;
    const servingDesc = (fi as any).serving_description as string | null | undefined;
    const gramsVal = (fi as any).serving_size ?? (fi as any).serving_quantity ?? 100;
    const servingCount = Number((fi as any).serving_count) || 1;
    const countLabel = servingCount > 1 ? `${servingCount} ` : '1 ';
    const enriched: OpenFoodFactsProduct = {
      ...base,
      serving_size: servingDesc
        ? `${countLabel}${servingDesc} (${gramsVal} g)`
        : base.serving_size,
      _source: (fi as any).source,
      _usda_fdc_id: (fi as any).usda_fdc_id,
      _data_quality_score: (fi as any).data_quality_score,
      ingredients_text: (fi as any).ingredients_text,
      allergens_tags: (fi as any).allergens,
    };
    console.log('[buildOffProductFromFoodItemId] Using off_data path, serving_size=', enriched.serving_size);
    return enriched;
  }

  // Modern path — build from columns
  const n = fi as any;
  const servingDesc = n.serving_description as string | null | undefined;
  const gramsVal = Number(n.serving_size) || 100;
  const servingCount = Number(n.serving_count) || 1;
  const countLabel = servingCount > 1 ? `${servingCount} ` : '1 ';
  const servingSizeStr = servingDesc
    ? `${countLabel}${servingDesc} (${gramsVal} g)`
    : `${gramsVal} g`;

  // Normalize to per-100g for nutriments
  const to100 = (val: number | null | undefined, servingG: number): number | undefined => {
    if (val == null) return undefined;
    return n.macros_per === '100g' ? val : (servingG > 0 ? (val / servingG) * 100 : val);
  };

  const product: OpenFoodFactsProduct = {
    code: n.barcode || undefined,
    product_name: n.name,
    brands: n.brand || undefined,
    serving_size: servingSizeStr,
    serving_quantity: gramsVal,
    _source: n.source,
    _usda_fdc_id: n.usda_fdc_id,
    _data_quality_score: n.data_quality_score,
    ingredients_text: n.ingredients_text,
    allergens_tags: n.allergens,
    nutriments: {
      'energy-kcal_100g': to100(n.calories, gramsVal),
      'proteins_100g': to100(n.protein, gramsVal),
      'carbohydrates_100g': to100(n.carbs, gramsVal),
      'fat_100g': to100(n.fat, gramsVal),
      'fiber_100g': to100(n.fiber, gramsVal),
      'sugars_100g': to100(n.sugar_g, gramsVal),
      'saturated-fat_100g': to100(n.saturated_fat_g, gramsVal),
      'polyunsaturated-fat_100g': to100(n.polyunsaturated_fat_g, gramsVal),
      'monounsaturated-fat_100g': to100(n.monounsaturated_fat_g, gramsVal),
      'trans-fat_100g': to100(n.trans_fat_g, gramsVal),
      'cholesterol_100g': n.cholesterol_mg != null ? n.cholesterol_mg / 1000 : undefined,
      'sodium_100g': n.sodium_mg != null ? n.sodium_mg / 1000 : undefined,
      'potassium_100g': n.potassium_mg != null ? n.potassium_mg / 1000 : undefined,
      'calcium_100g': n.calcium_mg != null ? n.calcium_mg / 1000 : undefined,
      'iron_100g': n.iron_mg != null ? n.iron_mg / 1000 : undefined,
      'magnesium_100g': n.magnesium_mg != null ? n.magnesium_mg / 1000 : undefined,
      'phosphorus_100g': n.phosphorus_mg != null ? n.phosphorus_mg / 1000 : undefined,
      'zinc_100g': n.zinc_mg != null ? n.zinc_mg / 1000 : undefined,
      'vitamin-a_100g': n.vitamin_a_mcg != null ? n.vitamin_a_mcg / 1000000 : undefined,
      'vitamin-c_100g': n.vitamin_c_mg != null ? n.vitamin_c_mg / 1000 : undefined,
      'vitamin-d_100g': n.vitamin_d_mcg != null ? n.vitamin_d_mcg / 1000000 : undefined,
      'vitamin-e_100g': n.vitamin_e_mg != null ? n.vitamin_e_mg / 1000 : undefined,
      'vitamin-k_100g': n.vitamin_k_mcg != null ? n.vitamin_k_mcg / 1000000 : undefined,
      'vitamin-b6_100g': n.vitamin_b6_mg != null ? n.vitamin_b6_mg / 1000 : undefined,
      'vitamin-b12_100g': n.vitamin_b12_mcg != null ? n.vitamin_b12_mcg / 1000000 : undefined,
      'folate_100g': n.folate_mcg != null ? n.folate_mcg / 1000000 : undefined,
      'selenium_100g': n.selenium_mcg != null ? n.selenium_mcg / 1000000 : undefined,
      'choline_100g': n.choline_mg != null ? n.choline_mg / 1000 : undefined,
    },
  };

  console.log('[buildOffProductFromFoodItemId] Built from columns, serving_size=', product.serving_size);
  return product;
}
