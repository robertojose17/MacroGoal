
/**
 * Shared food-search utilities used by add-food.tsx and food-search.tsx.
 *
 * Key sorting contract:
 *  - supabase results arrive pre-sorted by the server (name_match → logs_last_30d → popularity_score).
 *    We preserve that order and never re-sort them.
 *  - off / local results are sorted client-side by name relevance.
 *  - Supabase items always appear before off/local items in the final list.
 */

import { searchSelectionNeedsConfirmation } from './searchSelectionSafety';
import { buildSyntheticOffData } from './servingParser';
import { OpenFoodFactsProduct, extractServingSize, extractNutritionPerServing, normalizeUsdaProduct } from '@/utils/openFoodFacts';
import { formatFoodRowServing } from '@/utils/servingDisplay';
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
  requiresConfirmation?: boolean;
  source: ResultSource;
}

export function buildResultItem(product: OpenFoodFactsProduct, source: ResultSource): SearchResultItem {
  // Keep external names/brands visible without interpreting ambiguous mass or nutrient values.
  if (searchSelectionNeedsConfirmation(product)) return {
    product, source, requiresConfirmation: true, hasNutrition: false, servingText: '',
    displayCalories: NaN, displayProtein: NaN, displayCarbs: NaN, displayFats: NaN, displayFiber: NaN,
  };
  product = normalizeUsdaProduct(product);
  const servingInfo = extractServingSize(product);
  const nutrition = extractNutritionPerServing(product, servingInfo.grams);
  return {
    product,
    displayCalories: nutrition.calories,
    displayProtein: nutrition.protein,
    displayCarbs: nutrition.carbs,
    displayFats: nutrition.fat,
    displayFiber: nutrition.fiber,
    servingText: formatFoodRowServing(servingInfo.displayText, 1, servingInfo.grams),
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
    if (!product.product_name && !product.generic_name) continue; // skip nameless products
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
    if (item && (item.hasNutrition || item.requiresConfirmation)) {
      supabaseItems.push(item);
    }
  }

  // Collect non-supabase items.
  for (const [key, item] of existing.entries()) {
    if (!supabaseKeySet.has(key) && item.source !== 'supabase') {
      if (item.hasNutrition || item.requiresConfirmation) {
        clientItems.push(item);
      }
    }
  }

  // Also include any supabase items already in the map from a previous call
  // (supabaseOrder only tracks the current batch — existing supabase items
  //  from prior batches are already in supabaseItems via the loop above, but
  //  we need to catch pre-existing supabase entries not in supabaseOrder).
  for (const [key, item] of existing.entries()) {
    if (item.source === 'supabase' && !supabaseKeySet.has(key) && (item.hasNutrition || item.requiresConfirmation)) {
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
             source, usda_fdc_id, data_quality_score, ingredients_text, allergens, ai_verified, ai_verified_source`)
    .eq('id', foodItemId)
    .maybeSingle();

  if (error || !fi) {
    console.warn('[buildOffProductFromFoodItemId] Lookup failed:', error);
    return null;
  }

  // Use the same canonical row adapter as barcode lookup: macros_per may be serving.
  // Existing confirmation columns protect an explicit corrected serving, never grant writes.
  return { ...buildSyntheticOffData(fi), _db_id: fi.id };
}

export { persistUsdaSelection } from './usdaSelectionPersistence';
