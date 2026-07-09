
/**
 * utils/servingParser.ts
 * Single source of truth for all serving size parsing logic.
 * Used by barcode-scanner, barcode-lookup, and FoodDetailsLayout.
 */

/**
 * Naively singularize a food unit word.
 * "cookies" → "cookie", "slices" → "slice", "pieces" → "piece"
 */
export function singularizeUnit(word: string): string {
  if (!word || word.length <= 3) return word;
  if (word === 'serving' || word === 'servings') return 'serving';
  if (word.endsWith('ies') && word.length > 4) {
    const stem = word.slice(0, -3); // strip 'ies': "berr", "cook", "brown", "cand"
    const vowels = 'aeiou';
    const lastChar = stem[stem.length - 1] || '';
    const secondLastChar = stem.length >= 2 ? stem[stem.length - 2] : '';
    // Doubled consonant at end of stem → y→ies pattern (berry→berr+ies, cherry→cherr+ies)
    if (lastChar === secondLastChar && lastChar && !vowels.includes(lastChar)) {
      return stem + 'y'; // "berr" → "berry", "cherr" → "cherry"
    }
    // Stem ends in vowel+consonant → "ie" base word (cookie: stem="cook", calorie: stem="calor")
    if (vowels.includes(secondLastChar.toLowerCase())) {
      return word.slice(0, -1); // drop 's' → "cookie", "calorie"
    }
    // Stem ends in common consonant clusters that form "ie" words (brownie: "wn", smoothie: "th")
    const ieConsonantClusters = ['wn', 'th', 'sh', 'ch', 'gh', 'ph'];
    if (ieConsonantClusters.some(c => stem.endsWith(c))) {
      return word.slice(0, -1); // drop 's' → "brownie", "smoothie"
    }
    // Default: apply ies→y (candy→cand+y, pastry→pastr+y)
    return stem + 'y';
  }
  if (word.endsWith('es') && word.length > 4 && !word.endsWith('ss')) return word.slice(0, -1);
  if (word.endsWith('s') && word.length > 3 && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * Parse a serving_size string to extract ONLY the display fields (description + count).
 * NEVER use this to derive gram values — use serving_quantity for that.
 *
 * Examples:
 *   "4 cookies (29 g)"  → { description: "cookies", count: 4 }
 *   "1 serving (56 g)"  → { description: null, count: null }  (count=1 → null, "serving" → null)
 *   "1 slice (21 g)"    → { description: "slice", count: null }
 *   "2 slices (56 g)"   → { description: "slices", count: 2 }
 *   "56 g"              → { description: null, count: null }
 *   "29g"               → { description: null, count: null }
 */
export function parseServingString(servingSizeStr: string | undefined): {
  description: string | null;
  count: number | null;
} {
  if (!servingSizeStr) return { description: null, count: null };
  const s = servingSizeStr.trim();

  // Pure gram/ml: "50 g", "100ml", "29g" → no description
  if (/^\d+(\.\d+)?\s*(g|ml)$/i.test(s)) return { description: null, count: null };

  // Compound: "4 cookies (29 g)" or "1 slice (21 g)" or "1 serving (56 g)"
  const compoundMatch = s.match(/^(\d+\.?\d*)\s+([a-zA-Z][a-zA-Z\s]*?)\s*\(\d/i);
  if (compoundMatch) {
    const count = parseFloat(compoundMatch[1]);
    const rawWord = compoundMatch[2].trim();
    // Strip any leading number from word (safety net)
    const word = rawWord.replace(/^\d+(\.\d+)?\s+/, '').trim();
    // "serving" is not a meaningful unit name for display
    const description = word && word.toLowerCase() !== 'serving' ? word : null;
    return {
      description,
      count: count > 1 ? count : null,
    };
  }

  return { description: null, count: null };
}

/**
 * Build a canonical off_data object from food_items columns.
 * This is what barcode-scanner and barcode-lookup pass to FoodDetailsLayout as offData.
 *
 * The serving_size string is built from the NUMERIC columns (never from a raw string).
 * This guarantees the string is always correct regardless of what was originally in the DB.
 *
 * Rule: serving_size column = TOTAL GRAMS of one standard serving (e.g. 29 for Oreos)
 *       serving_count = how many units make up that serving (e.g. 4 cookies)
 *       serving_description = the unit word without numbers (e.g. "cookies")
 *
 * @param item - A food_items row (or equivalent object from the edge function response)
 */
export function buildSyntheticOffData(item: {
  name?: string;
  brand?: string;
  barcode?: string;
  serving_size?: number | string | null;
  serving_unit?: string | null;
  serving_description?: string | null;
  serving_count?: number | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  fiber?: number | null;
  macros_per?: string | null;
  nutriments?: Record<string, number> | null;
  sugar_g?: number | null;
  saturated_fat_g?: number | null;
  polyunsaturated_fat_g?: number | null;
  monounsaturated_fat_g?: number | null;
  trans_fat_g?: number | null;
  cholesterol_mg?: number | null;
  sodium_mg?: number | null;
  potassium_mg?: number | null;
  calcium_mg?: number | null;
  iron_mg?: number | null;
  vitamin_c_mg?: number | null;
  vitamin_a_mcg?: number | null;
  vitamin_d_mcg?: number | null;
  vitamin_e_mg?: number | null;
  vitamin_k_mcg?: number | null;
  vitamin_b1_mg?: number | null;
  vitamin_b2_mg?: number | null;
  vitamin_b3_mg?: number | null;
  vitamin_b6_mg?: number | null;
  vitamin_b12_mcg?: number | null;
  folate_mcg?: number | null;
  magnesium_mg?: number | null;
  phosphorus_mg?: number | null;
  zinc_mg?: number | null;
  manganese_mg?: number | null;
  selenium_mcg?: number | null;
  image_url?: string | null;
  ingredients_text?: string | null;
  allergens?: string | null;
  source?: string | null;
  data_quality_score?: number | null;
  [key: string]: unknown;
}): object {
  // serving_size IS total grams of one standard serving (new architecture)
  const totalGrams = Number(item.serving_size) || 100;
  const servingCount = Number(item.serving_count) || null;
  const servingDesc = item.serving_description || null;

  // Build canonical serving_size string from numeric columns
  let servingSizeStr: string;
  if (servingDesc && servingCount && servingCount > 1) {
    servingSizeStr = `${servingCount} ${servingDesc} (${totalGrams} g)`;
  } else if (servingDesc) {
    servingSizeStr = `1 ${servingDesc} (${totalGrams} g)`;
  } else {
    servingSizeStr = `${totalGrams} g`;
  }

  console.log('[servingParser] buildSyntheticOffData:', {
    name: item.name,
    totalGrams,
    servingCount,
    servingDesc,
    servingSizeStr,
  });

  // Build per-100g nutriments
  const n = (item.nutriments ?? {}) as Record<string, number>;
  const macrosPer = item.macros_per ?? '100g';
  const multiplier = macrosPer === '100g' ? 1 : (totalGrams > 0 ? 100 / totalGrams : 1);

  const nutriments: Record<string, number | undefined> = {
    'energy-kcal_100g': (Number(item.calories) || 0) * multiplier,
    'proteins_100g': (Number(item.protein) || 0) * multiplier,
    'carbohydrates_100g': (Number(item.carbs) || 0) * multiplier,
    'fat_100g': (Number(item.fat) || 0) * multiplier,
    'fiber_100g': (Number(item.fiber) || 0) * multiplier,
    'sugars_100g': item.sugar_g != null ? Number(item.sugar_g) * multiplier : undefined,
    'saturated-fat_100g': item.saturated_fat_g != null ? Number(item.saturated_fat_g) * multiplier : undefined,
    'polyunsaturated-fat_100g': item.polyunsaturated_fat_g != null ? Number(item.polyunsaturated_fat_g) * multiplier : undefined,
    'monounsaturated-fat_100g': item.monounsaturated_fat_g != null ? Number(item.monounsaturated_fat_g) * multiplier : undefined,
    'trans-fat_100g': item.trans_fat_g != null ? Number(item.trans_fat_g) * multiplier : undefined,
    'cholesterol_100g': item.cholesterol_mg != null ? Number(item.cholesterol_mg) / 1000 : undefined,
    'sodium_100g': item.sodium_mg != null ? Number(item.sodium_mg) / 1000 : undefined,
    'potassium_100g': item.potassium_mg != null ? Number(item.potassium_mg) / 1000 : undefined,
    'calcium_100g': item.calcium_mg != null ? Number(item.calcium_mg) / 1000 : undefined,
    'iron_100g': item.iron_mg != null ? Number(item.iron_mg) / 1000 : undefined,
    'vitamin-c_100g': item.vitamin_c_mg != null ? Number(item.vitamin_c_mg) / 1000 : undefined,
    'vitamin-a_100g': item.vitamin_a_mcg != null ? Number(item.vitamin_a_mcg) / 1000000 : undefined,
    'vitamin-d_100g': item.vitamin_d_mcg != null ? Number(item.vitamin_d_mcg) / 1000000 : undefined,
    'vitamin-e_100g': item.vitamin_e_mg != null ? Number(item.vitamin_e_mg) / 1000 : undefined,
    'vitamin-k_100g': item.vitamin_k_mcg != null ? Number(item.vitamin_k_mcg) / 1000000 : undefined,
    'vitamin-b1_100g': item.vitamin_b1_mg != null ? Number(item.vitamin_b1_mg) / 1000 : undefined,
    'vitamin-b2_100g': item.vitamin_b2_mg != null ? Number(item.vitamin_b2_mg) / 1000 : undefined,
    'vitamin-b3_100g': item.vitamin_b3_mg != null ? Number(item.vitamin_b3_mg) / 1000 : undefined,
    'vitamin-b6_100g': item.vitamin_b6_mg != null ? Number(item.vitamin_b6_mg) / 1000 : undefined,
    'vitamin-b12_100g': item.vitamin_b12_mcg != null ? Number(item.vitamin_b12_mcg) / 1000000 : undefined,
    'folate_100g': item.folate_mcg != null ? Number(item.folate_mcg) / 1000000 : undefined,
    'magnesium_100g': item.magnesium_mg != null ? Number(item.magnesium_mg) / 1000 : undefined,
    'phosphorus_100g': item.phosphorus_mg != null ? Number(item.phosphorus_mg) / 1000 : undefined,
    'zinc_100g': item.zinc_mg != null ? Number(item.zinc_mg) / 1000 : undefined,
    'manganese_100g': item.manganese_mg != null ? Number(item.manganese_mg) / 1000 : undefined,
    'selenium_100g': item.selenium_mcg != null ? Number(item.selenium_mcg) / 1000000 : undefined,
    // Spread any additional per-100g nutriments from the nutriments JSONB column
    ...Object.fromEntries(
      Object.entries(n).filter(([k]) => k.endsWith('_100g'))
    ),
  };

  return {
    code: item.barcode || undefined,
    product_name: item.name || '',
    brands: item.brand || '',
    serving_size: servingSizeStr,
    serving_quantity: totalGrams,
    nutriments,
    image_url: item.image_url || undefined,
    _source: item.source || undefined,
    _usda_fdc_id: (item as any).usda_fdc_id || undefined,
    _data_quality_score: item.data_quality_score || undefined,
    ingredients_text: item.ingredients_text || undefined,
    allergens_tags: item.allergens || undefined,
  };
}
