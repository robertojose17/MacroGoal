
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
