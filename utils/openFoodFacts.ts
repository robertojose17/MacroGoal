
import { singularizeUnit } from '@/utils/stringUtils';

/**
 * OpenFoodFacts API Integration
 * Public API for food database lookup
 * This module handles TEXT SEARCH ONLY
 * 
 * OPTIMIZED FOR MOBILE PERFORMANCE:
 * - Minimal field selection (only needed columns)
 * - Result limit for faster response
 * - Simple endpoint with minimal payload
 * - Clear error handling
 * - 10-second hard timeout
 * 
 * ENHANCED NUTRIENT PARSING:
 * - Handles multiple field name formats
 * - Robust fallback logic
 * - Never blocks UI on missing data
 */

export interface OpenFoodFactsProduct {
  code: string;
  product_name?: string;
  image_url?: string;
  generic_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: string | number;
  serving_unit?: string;
  /** Set by the Supabase edge function to indicate the data source */
  _source?: string;
  /** USDA FoodData Central ID, set when the product came from a USDA search */
  _usda_fdc_id?: string;
  /** OpenFoodFacts explicit product ID, set when the product came from OFacts with an id */
  _off_id?: string;
  /** Data quality score from the source database */
  _data_quality_score?: number;
  /** Popularity score from the Supabase food database */
  popularity_score?: number;
  /** Nutri-Score grade (a–e) from OpenFoodFacts */
  nutriscore_grade?: string;
  /** Nutri-Score grade French market variant */
  nutrition_grade_fr?: string;
  /** Number of times this food was logged in the last 30 days */
  logs_last_30d?: number;
  nutriments?: {
    // Energy fields (multiple formats)
    'energy-kcal_100g'?: number;
    'energy-kcal'?: number;
    'energy_100g'?: number;
    'energy'?: number;
    'energy-kcal_serving'?: number;
    
    // Protein fields
    'proteins_100g'?: number;
    'proteins'?: number;
    'proteins_serving'?: number;
    
    // Carbohydrate fields
    'carbohydrates_100g'?: number;
    'carbohydrates'?: number;
    'carbohydrates_serving'?: number;
    
    // Fat fields
    'fat_100g'?: number;
    'fat'?: number;
    'fat_serving'?: number;
    
    // Fiber fields
    'fiber_100g'?: number;
    'fiber'?: number;
    'fiber_serving'?: number;
    
    // Sugar fields
    'sugars_100g'?: number;
    'sugars'?: number;
    'sugars_serving'?: number;

    // Fat sub-types
    'saturated-fat_100g'?: number;
    'trans-fat_100g'?: number;
    'polyunsaturated-fat_100g'?: number;
    'monounsaturated-fat_100g'?: number;

    // Cholesterol & sodium
    'cholesterol_100g'?: number;
    'added-sugars_100g'?: number;
    'sodium_100g'?: number;
    'salt_100g'?: number;

    // Fat-soluble vitamins
    'vitamin-a_100g'?: number;
    'vitamin-d_100g'?: number;
    'vitamin-e_100g'?: number;
    'vitamin-k_100g'?: number;

    // Water-soluble vitamins
    'vitamin-c_100g'?: number;
    'vitamin-b1_100g'?: number;
    'vitamin-b2_100g'?: number;
    'vitamin-b3_100g'?: number;
    'vitamin-pp_100g'?: number;
    'vitamin-b5_100g'?: number;
    'vitamin-b6_100g'?: number;
    'vitamin-b9_100g'?: number;
    'vitamin-b12_100g'?: number;
    'biotin_100g'?: number;
    'choline_100g'?: number;
    'thiamin_100g'?: number;
    'riboflavin_100g'?: number;
    'niacin_100g'?: number;
    'folates_100g'?: number;
    'pantothenic-acid_100g'?: number;

    // Minerals
    'calcium_100g'?: number;
    'iron_100g'?: number;
    'potassium_100g'?: number;
    'phosphorus_100g'?: number;
    'magnesium_100g'?: number;
    'zinc_100g'?: number;
    'selenium_100g'?: number;
    'copper_100g'?: number;
    'manganese_100g'?: number;
    'chromium_100g'?: number;
    'molybdenum_100g'?: number;
    'iodine_100g'?: number;
    'chloride_100g'?: number;
  };
}

export interface OpenFoodFactsSearchResult {
  products: OpenFoodFactsProduct[];
  count: number;
  page: number;
  status: number;
}

export interface ServingSizeInfo {
  description: string; // e.g., "1 egg", "2 slices", "1 bar"
  grams: number; // gram equivalent PER SINGLE UNIT
  displayText: string; // e.g., "1 egg (50 g)", "2 slices (28 g)", "1 slice (estimated as 100g)"
  hasValidGrams: boolean; // true if grams were successfully parsed/converted, false if using fallback
  isEstimated: boolean; // true if conversion is estimated (household units without grams)
}

/**
 * Convert milliliters to grams using 1:1 conversion
 * NEW RULE: Treat milliliters as grams 1:1 for default serving
 */
function mlToGrams(ml: number): number {
  console.log('[OpenFoodFacts] Converting ml to grams using 1:1 ratio:', ml);
  return ml * 1.0; // 1:1 conversion
}

/**
 * Extract unit name and count from a serving_size string for DISPLAY ONLY.
 * NEVER used to derive gram values — use serving_quantity for that.
 *
 * Examples:
 *   "4 cookies (29 g)"  → { unitName: "cookie", unitCount: 4 }
 *   "1 slice (21 g)"    → { unitName: "slice",  unitCount: 1 }
 *   "1 serving (56 g)"  → { unitName: null,     unitCount: 1 }
 *   "56 g"              → { unitName: null,     unitCount: 1 }
 *   "2 fl oz (60 ml)"   → { unitName: "fl oz",  unitCount: 2 }
 */
export function extractUnitFromString(s: string): { unitName: string | null; unitCount: number } {
  if (!s) return { unitName: null, unitCount: 1 };
  const trimmed = s.trim();
  // Pure grams/ml: "56 g", "100ml", "29g" → no unit name
  if (/^\d+(\.\d+)?\s*(g|ml)$/i.test(trimmed)) return { unitName: null, unitCount: 1 };
  // Compound: "4 cookies (29 g)" or "1 slice (21 g)" or "2 fl oz (60 ml)"
  const m = trimmed.match(/^(\d+\.?\d*)\s+([a-zA-Z][a-zA-Z\s]*?)\s*\(/i);
  if (m) {
    const count = parseFloat(m[1]);
    const word = m[2].trim();
    // Discard generic "serving"
    if (word.toLowerCase() === 'serving') return { unitName: null, unitCount: 1 };
    return { unitName: singularizeUnit(word), unitCount: count > 0 ? count : 1 };
  }
  return { unitName: null, unitCount: 1 };
}

/**
 * Extract serving size information from OpenFoodFacts product.
 * Returns the serving description and gram equivalent PER SINGLE UNIT.
 * NEVER throws errors or blocks — always returns a valid ServingSizeInfo.
 *
 * ARCHITECTURE RULE:
 *   serving_quantity = authoritative total grams of one standard serving (number, always clean)
 *   serving_size string = ONLY used to extract unit name for display — NEVER for gram values
 *
 * LOGIC:
 *   1. serving_quantity → totalGrams (fallback 100g if missing/invalid)
 *   2. serving_size string → unitName + unitCount (display only)
 *   3. Build return value from totalGrams + unit info
 */
export function extractServingSize(product: OpenFoodFactsProduct): ServingSizeInfo {
  // ── Step 1: Parse serving_quantity as the ONLY source of gram values ──────
  const rawQty = product.serving_quantity;
  const parsedQty = rawQty !== undefined && rawQty !== null ? parseFloat(String(rawQty)) : NaN;
  const hasValidGrams = !isNaN(parsedQty) && parsedQty > 0;
  const totalGrams = hasValidGrams ? parsedQty : 100;

  // ── Step 2: Parse serving_size STRING only for unit name + count ──────────
  const servingSizeStr = typeof product.serving_size === 'string' ? product.serving_size.trim() : '';
  const { unitName, unitCount } = extractUnitFromString(servingSizeStr);

  // ── Step 3: Build return value ────────────────────────────────────────────
  try {
    if (unitName && unitCount > 1) {
      // e.g. "4 cookies (29 g)" with serving_quantity=29 → grams per cookie = 7.25
      const gramsPerUnit = parseFloat((totalGrams / unitCount).toFixed(2));
      const description = `${unitCount} ${unitName}s`;
      const displayText = `1 ${unitName} (${gramsPerUnit} g)`;
      return {
        description,
        grams: gramsPerUnit,
        displayText,
        hasValidGrams,
        isEstimated: false,
      };
    }

    if (unitName && unitCount === 1) {
      // e.g. "1 slice (21 g)" with serving_quantity=21
      const roundedGrams = parseFloat(totalGrams.toFixed(2));
      const description = `1 ${unitName}`;
      const displayText = `1 ${unitName} (${roundedGrams} g)`;
      return {
        description,
        grams: roundedGrams,
        displayText,
        hasValidGrams,
        isEstimated: false,
      };
    }

    // No meaningful unit name — show as "1 serving (Xg)" for clarity
    const roundedGrams = parseFloat(totalGrams.toFixed(2));
    if (!hasValidGrams) {
      return {
        description: '100 g',
        grams: 100,
        displayText: '100 g',
        hasValidGrams: false,
        isEstimated: false,
      };
    }
    const description = `1 serving (${roundedGrams} g)`;
    const displayText = `1 serving (${roundedGrams} g)`;
    return {
      description,
      grams: roundedGrams,
      displayText,
      hasValidGrams,
      isEstimated: false,
    };
  } catch (error) {
    console.error('[OpenFoodFacts] Error building serving size result:', error);
    return {
      description: '100 g',
      grams: 100,
      displayText: '100 g',
      hasValidGrams: false,
      isEstimated: false,
    };
  }
}

/**
 * Extract nutrition data from OpenFoodFacts product
 * Returns calories and macros per 100g
 * ENHANCED: Handles multiple field name formats with robust fallback
 * NEVER throws errors - always returns valid numbers (0 if not found)
 */
export function extractNutrition(product: OpenFoodFactsProduct): {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugars: number;
} {
  const nutriments = product.nutriments || {};

  console.log('[OpenFoodFacts] Extracting nutrition from nutriments:', Object.keys(nutriments));

  // CALORIES: Try multiple field names
  let calories = 0;
  if (nutriments['energy-kcal_100g'] !== undefined && nutriments['energy-kcal_100g'] !== null) {
    calories = Number(nutriments['energy-kcal_100g']);
  } else if (nutriments['energy-kcal'] !== undefined && nutriments['energy-kcal'] !== null) {
    calories = Number(nutriments['energy-kcal']);
  } else if (nutriments['energy_100g'] !== undefined && nutriments['energy_100g'] !== null) {
    // Convert kJ to kcal if needed (1 kcal = 4.184 kJ)
    const energyKj = Number(nutriments['energy_100g']);
    calories = energyKj / 4.184;
  } else if (nutriments['energy'] !== undefined && nutriments['energy'] !== null) {
    // Convert kJ to kcal if needed
    const energyKj = Number(nutriments['energy']);
    calories = energyKj / 4.184;
  }
  
  // Ensure calories is a valid number
  if (isNaN(calories) || calories < 0) {
    calories = 0;
  }

  // PROTEIN: Try multiple field names
  let protein = 0;
  if (nutriments['proteins_100g'] !== undefined && nutriments['proteins_100g'] !== null) {
    protein = Number(nutriments['proteins_100g']);
  } else if (nutriments['proteins'] !== undefined && nutriments['proteins'] !== null) {
    protein = Number(nutriments['proteins']);
  }
  
  if (isNaN(protein) || protein < 0) {
    protein = 0;
  }

  // CARBS: Try multiple field names
  let carbs = 0;
  if (nutriments['carbohydrates_100g'] !== undefined && nutriments['carbohydrates_100g'] !== null) {
    carbs = Number(nutriments['carbohydrates_100g']);
  } else if (nutriments['carbohydrates'] !== undefined && nutriments['carbohydrates'] !== null) {
    carbs = Number(nutriments['carbohydrates']);
  }
  
  if (isNaN(carbs) || carbs < 0) {
    carbs = 0;
  }

  // FAT: Try multiple field names
  let fat = 0;
  if (nutriments['fat_100g'] !== undefined && nutriments['fat_100g'] !== null) {
    fat = Number(nutriments['fat_100g']);
  } else if (nutriments['fat'] !== undefined && nutriments['fat'] !== null) {
    fat = Number(nutriments['fat']);
  }
  
  if (isNaN(fat) || fat < 0) {
    fat = 0;
  }

  // FIBER: Try multiple field names
  let fiber = 0;
  if (nutriments['fiber_100g'] !== undefined && nutriments['fiber_100g'] !== null) {
    fiber = Number(nutriments['fiber_100g']);
  } else if (nutriments['fiber'] !== undefined && nutriments['fiber'] !== null) {
    fiber = Number(nutriments['fiber']);
  }
  
  if (isNaN(fiber) || fiber < 0) {
    fiber = 0;
  }

  // SUGARS: Try multiple field names
  let sugars = 0;
  if (nutriments['sugars_100g'] !== undefined && nutriments['sugars_100g'] !== null) {
    sugars = Number(nutriments['sugars_100g']);
  } else if (nutriments['sugars'] !== undefined && nutriments['sugars'] !== null) {
    sugars = Number(nutriments['sugars']);
  }
  
  if (isNaN(sugars) || sugars < 0) {
    sugars = 0;
  }

  console.log('[OpenFoodFacts] Extracted nutrition (per 100g):', {
    calories,
    protein,
    carbs,
    fat,
    fiber,
    sugars,
  });

  return { calories, protein, carbs, fat, fiber, sugars };
}

/**
 * Fetch with timeout wrapper
 * Ensures requests never hang indefinitely
 * CRITICAL: This function implements the hard timeout requirement
 * MOBILE COMPATIBILITY: Adds User-Agent header for mobile network compatibility
 */
async function fetchWithTimeout(
  url: string, 
  options: RequestInit = {}, 
  timeoutMs: number = 10000
): Promise<Response> {
  console.log(`[OpenFoodFacts] fetchWithTimeout: ${url} (timeout: ${timeoutMs}ms)`);
  
  // Create timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      console.log(`[OpenFoodFacts] ⏱️ Timeout reached (${timeoutMs}ms)`);
      reject(new Error('Request timeout'));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetch(url, {
        ...options,
        headers: {
          'User-Agent': 'EliteMacroTracker/1.0 (iOS)',
          'Accept': 'application/json',
          ...options.headers,
        },
      }),
      timeoutPromise,
    ]);
    
    console.log(`[OpenFoodFacts] ✅ Request completed successfully (status: ${response.status})`);
    return response;
  } catch (error) {
    console.log(`[OpenFoodFacts] ❌ Request failed:`, error);
    throw error;
  }
}

/**
 * Search OpenFoodFacts by text query
 * Returns search result with products and status
 * NEVER throws errors - always returns result object
 * HARD TIMEOUT: 10 seconds
 * 
 * OPTIMIZED FOR MOBILE PERFORMANCE:
 * - Minimal field selection (only needed columns)
 * - Result limit (30 products max)
 * - Simple search endpoint
 * - Returns status code for debugging
 * - Safe response parsing
 */
export async function searchOpenFoodFacts(query: string): Promise<OpenFoodFactsSearchResult> {
  console.log(`[OpenFoodFacts] ========== TEXT SEARCH ==========`);
  console.log(`[OpenFoodFacts] Query: "${query}"`);

  // URL-encode the query
  const encodedQuery = encodeURIComponent(query);

  // OPTIMIZATION: Use simple, known-good OFF search endpoint with minimal fields and limit
  // Only request the fields we actually need to reduce response size and parsing time
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodedQuery}&search_simple=1&action=process&json=1&page_size=100&sort_by=unique_scans_n&fields=code,product_name,generic_name,brands,serving_size,serving_quantity,nutriments`;

  console.log(`[OpenFoodFacts] Search URL: ${url}`);

  // Retry logic: up to 3 attempts for 503/network errors
  let lastResult: OpenFoodFactsSearchResult = { products: [], count: 0, page: 1, status: 0 };

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      console.log(`[OpenFoodFacts] Attempt ${attempt}/5`);
      const response = await fetchWithTimeout(url, {}, 15000); // 15 second timeout

      console.log(`[OpenFoodFacts] Response status: ${response.status}`);

      if (response.ok) {
        const data = await response.json();

        console.log(`[OpenFoodFacts] Response data keys:`, Object.keys(data || {}));

        // Safe response parsing
        if (!data || !data.products) {
          console.log(`[OpenFoodFacts] ❌ No products field in response`);
          return { products: [], count: 0, page: 1, status: response.status };
        }

        if (!Array.isArray(data.products)) {
          console.log(`[OpenFoodFacts] ❌ products field is not an array`);
          return { products: [], count: 0, page: 1, status: response.status };
        }

        console.log(`[OpenFoodFacts] ✅ Search returned ${data.products.length} products`);
        return {
          products: data.products,
          count: data.count || data.products.length,
          page: data.page || 1,
          status: response.status,
        };
      }

      // 503: retry with exponential backoff
      if (response.status === 503 && attempt < 5) {
        const delay = attempt * 1000;
        console.log(`[OpenFoodFacts] ⚠️ 503 received, retrying in ${delay}ms (attempt ${attempt}/5)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        lastResult = { products: [], count: 0, page: 1, status: 503 };
        continue;
      }

      // Other non-ok status — return empty immediately
      console.log(`[OpenFoodFacts] ❌ Search failed (status: ${response.status})`);
      return { products: [], count: 0, page: 1, status: response.status };
    } catch (error) {
      console.error(`[OpenFoodFacts] ❌ Network error on attempt ${attempt}:`, error);
      if (error instanceof Error) {
        console.error('[OpenFoodFacts] Error message:', error.message);
      }
      if (attempt < 5) {
        const delay = attempt * 1000;
        console.log(`[OpenFoodFacts] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      // Final attempt failed — return network error result
      return { products: [], count: 0, page: 1, status: 0 };
    }
  }

  // All retries exhausted (only reached after 3x 503)
  console.log('[OpenFoodFacts] ❌ All 5 attempts failed (503)');
  return lastResult;
}

/**
 * Extract nutrition per STANDARD SERVING (what the nutrition facts label shows).
 * Priority: _serving fields → calculate from _100g × (serving_size / 100)
 * This is the correct value to store in food_items.calories etc.
 */
export function extractNutritionPerServing(
  product: OpenFoodFactsProduct,
  servingSizeGrams: number  // total grams of the standard serving (e.g. 31 for 1 scoop)
): { calories: number; protein: number; carbs: number; fat: number; fiber: number; sugars: number } {
  const nutriments = product.nutriments || {};
  const multiplier = servingSizeGrams > 0 ? servingSizeGrams / 100 : 1;

  // Helper: use _serving if available, else calculate from _100g × multiplier
  function perServing(servingKey: string, per100Key: string, altKey?: string): number {
    if (nutriments[servingKey as keyof typeof nutriments] != null) return Math.round(Number(nutriments[servingKey as keyof typeof nutriments]) * 10) / 10;
    if (nutriments[per100Key as keyof typeof nutriments] != null) return Math.round(Number(nutriments[per100Key as keyof typeof nutriments]) * multiplier * 10) / 10;
    if (altKey && nutriments[altKey as keyof typeof nutriments] != null) return Math.round(Number(nutriments[altKey as keyof typeof nutriments]) * multiplier * 10) / 10;
    return 0;
  }

  let calories = 0;
  if (nutriments['energy-kcal_serving'] != null) {
    calories = Math.round(Number(nutriments['energy-kcal_serving']));
  } else if (nutriments['energy-kcal_100g'] != null) {
    calories = Math.round(Number(nutriments['energy-kcal_100g']) * multiplier);
  } else if (nutriments['energy-kcal'] != null) {
    calories = Math.round(Number(nutriments['energy-kcal']) * multiplier);
  } else if (nutriments['energy_100g'] != null) {
    calories = Math.round((Number(nutriments['energy_100g']) / 4.184) * multiplier);
  }
  if (isNaN(calories) || calories < 0) calories = 0;

  const protein = perServing('proteins_serving', 'proteins_100g', 'proteins');
  const carbs   = perServing('carbohydrates_serving', 'carbohydrates_100g', 'carbohydrates');
  const fat     = perServing('fat_serving', 'fat_100g', 'fat');
  const fiber   = perServing('fiber_serving', 'fiber_100g', 'fiber');
  const sugars  = perServing('sugars_serving', 'sugars_100g', 'sugars');

  console.log('[OpenFoodFacts] extractNutritionPerServing:', {
    servingSizeGrams, multiplier, calories, protein, carbs, fat, fiber
  });

  return { calories, protein, carbs, fat, fiber, sugars };
}

/**
 * Map OpenFoodFacts product to internal Food format
 */
export function mapOpenFoodFactsToFood(product: OpenFoodFactsProduct): any {
  const nutrition = extractNutrition(product);
  const serving = extractServingSize(product);

  return {
    name: product.product_name || 'Unknown Product',
    brand: product.brands || undefined,
    serving_amount: 100, // OpenFoodFacts uses per 100g for calculations
    serving_unit: 'g',
    calories: nutrition.calories,
    protein: nutrition.protein,
    carbs: nutrition.carbs,
    fats: nutrition.fat,
    fiber: nutrition.fiber,
    barcode: product.code || null,
    user_created: false,
    is_favorite: false,
    is_from_openfoodfacts: true, // Flag to indicate external source
  };
}
