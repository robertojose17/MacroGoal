
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
  generic_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: string;
  serving_unit?: string;
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
 * Extract serving size information from OpenFoodFacts product
 * Returns the serving description and gram equivalent PER SINGLE UNIT
 * NEVER throws errors or blocks - always returns a valid ServingSizeInfo
 * 
 * CRITICAL FIX: Now correctly handles serving sizes with quantities > 1
 * Example: "4 cookies (29g)" → returns grams = 7.25 (29g / 4 cookies = 7.25g per cookie)
 * Example: "2 slices 56g" → returns grams = 28 (56g / 2 slices = 28g per slice)
 * 
 * PRIORITY ORDER:
 * 1) Serving label with quantity AND grams → divide grams by quantity → use per-unit grams
 * 2) Serving label that already includes grams (quantity = 1) → use directly
 * 3) Serving label with oz/ml/tbsp/tsp/cup → convert to grams → use
 * 4) Household unit without grams → show unit, estimate grams as 100g but mark estimated
 * 5) No serving label at all → default to 100g
 */
export function extractServingSize(product: OpenFoodFactsProduct): ServingSizeInfo {
  console.log('[OpenFoodFacts] ========== EXTRACT SERVING SIZE ==========');
  console.log('[OpenFoodFacts] Input:', {
    serving_size: product.serving_size,
    serving_quantity: product.serving_quantity,
    product_name: product.product_name,
  });

  // Default to 100g if no serving info available
  const defaultServing: ServingSizeInfo = {
    description: '100 g',
    grams: 100,
    displayText: '100 g',
    hasValidGrams: false,
    isEstimated: false,
  };

  // If no serving_size at all, return default immediately
  if (!product.serving_size || typeof product.serving_size !== 'string') {
    console.log('[OpenFoodFacts] No serving_size found, using default 100g');
    return defaultServing;
  }

  const servingSize = product.serving_size.trim();
  
  // Empty string check
  if (servingSize.length === 0) {
    console.log('[OpenFoodFacts] Empty serving_size, using default 100g');
    return defaultServing;
  }

  console.log('[OpenFoodFacts] Parsing serving size:', servingSize);

  try {
    // ========== PRIORITY 1: QUANTITY + UNIT + GRAMS (e.g., "4 cookies (29g)", "2 slices 56g") ==========
    
    // Pattern: "X unit (Yg)" or "X unit Yg" where X > 1
    // This handles cases like "4 cookies (29g)" or "2 slices 56g"
    const quantityUnitGramsPattern = /^(\d+\.?\d*)\s+([a-zA-Z\s]+?)\s*[(-]?\s*(\d+\.?\d*)\s*g\)?$/i;
    const quantityMatch = servingSize.match(quantityUnitGramsPattern);
    
    if (quantityMatch) {
      const quantity = parseFloat(quantityMatch[1]);
      const unit = quantityMatch[2].trim();
      const totalGrams = parseFloat(quantityMatch[3]);
      
      if (!isNaN(quantity) && quantity > 0 && !isNaN(totalGrams) && totalGrams > 0 && unit.length > 0) {
        // CRITICAL: Calculate grams PER SINGLE UNIT
        const gramsPerUnit = totalGrams / quantity;
        
        console.log('[OpenFoodFacts] ✅ QUANTITY + UNIT + GRAMS pattern matched:');
        console.log('[OpenFoodFacts]   - Quantity:', quantity);
        console.log('[OpenFoodFacts]   - Unit:', unit);
        console.log('[OpenFoodFacts]   - Total grams:', totalGrams);
        console.log('[OpenFoodFacts]   - Grams per unit:', gramsPerUnit);
        
        // Return description as "1 unit" (singular form)
        // Try to singularize the unit (remove trailing 's' if present)
        let singularUnit = unit;
        if (unit.endsWith('s') && unit.length > 1) {
          singularUnit = unit.slice(0, -1);
        }
        
        return {
          description: `1 ${singularUnit}`,
          grams: gramsPerUnit,
          displayText: `1 ${singularUnit} (${Math.round(gramsPerUnit)} g)`,
          hasValidGrams: true,
          isEstimated: false,
        };
      }
    }
    
    // ========== PRIORITY 2: GRAMS ALREADY IN SERVING SIZE (quantity = 1) ==========
    
    // Pattern 1: "X unit (Yg)" or "X unit (Y g)"
    const pattern1 = /^(.+?)\s*\((\d+\.?\d*)\s*g\)$/i;
    const match1 = servingSize.match(pattern1);
    if (match1) {
      const description = match1[1].trim();
      const grams = parseFloat(match1[2]);
      
      if (!isNaN(grams) && grams > 0) {
        console.log('[OpenFoodFacts] Pattern 1 matched (grams in parentheses):', { description, grams });
        return {
          description,
          grams,
          displayText: `${description} (${Math.round(grams)} g)`,
          hasValidGrams: true,
          isEstimated: false,
        };
      }
    }

    // Pattern 2: Just grams "Yg" or "Y g"
    const pattern2 = /^(\d+\.?\d*)\s*g$/i;
    const match2 = servingSize.match(pattern2);
    if (match2) {
      const grams = parseFloat(match2[1]);
      
      if (!isNaN(grams) && grams > 0) {
        console.log('[OpenFoodFacts] Pattern 2 matched (pure grams):', grams);
        return {
          description: `${Math.round(grams)} g`,
          grams,
          displayText: `${Math.round(grams)} g`,
          hasValidGrams: true,
          isEstimated: false,
        };
      }
    }

    // Pattern 3: "X unit - Yg" or "X unit Yg" or "unit Yg"
    const pattern3 = /^(.+?)\s*[-–—]?\s*(\d+\.?\d*)\s*g$/i;
    const match3 = servingSize.match(pattern3);
    if (match3) {
      const description = match3[1].trim();
      const grams = parseFloat(match3[2]);
      
      // Make sure description is not just a number (to avoid matching "45g" as description="45")
      if (!isNaN(grams) && grams > 0 && description && !/^\d+\.?\d*$/.test(description)) {
        console.log('[OpenFoodFacts] Pattern 3 matched (grams with optional dash):', { description, grams });
        return {
          description,
          grams,
          displayText: `${description} (${Math.round(grams)} g)`,
          hasValidGrams: true,
          isEstimated: false,
        };
      }
    }

    // Pattern 4: "portion_name Yg" (e.g., "tortilla 45g", "slice 28g", "egg 50g")
    // This pattern specifically looks for a word followed by a number and 'g'
    const pattern4 = /^([a-zA-Z\s]+?)\s+(\d+\.?\d*)\s*g$/i;
    const match4 = servingSize.match(pattern4);
    if (match4) {
      const description = match4[1].trim();
      const grams = parseFloat(match4[2]);
      
      if (!isNaN(grams) && grams > 0 && description && description.length > 0) {
        console.log('[OpenFoodFacts] Pattern 4 matched (portion name + grams):', { description, grams });
        return {
          description,
          grams,
          displayText: `${description} (${Math.round(grams)} g)`,
          hasValidGrams: true,
          isEstimated: false,
        };
      }
    }

    // Pattern 5: Try to find any number followed by g anywhere in the string (fallback)
    const pattern5 = /(\d+\.?\d*)\s*g/i;
    const match5 = servingSize.match(pattern5);
    if (match5) {
      const grams = parseFloat(match5[1]);
      
      if (!isNaN(grams) && grams > 0) {
        // Try to extract description before the grams
        const description = servingSize.replace(pattern5, '').trim();
        console.log('[OpenFoodFacts] Pattern 5 matched (grams anywhere - fallback):', { description, grams });
        
        if (description && description.length > 0) {
          return {
            description,
            grams,
            displayText: `${description} (${Math.round(grams)} g)`,
            hasValidGrams: true,
            isEstimated: false,
          };
        }
        
        return {
          description: `${Math.round(grams)} g`,
          grams,
          displayText: `${Math.round(grams)} g`,
          hasValidGrams: true,
          isEstimated: false,
        };
      }
    }

    // ========== PRIORITY 3: CONVERT OTHER UNITS TO GRAMS ==========
    
    // A) OUNCES (oz)
    // Pattern: "X oz" or "X ounce" or "X ounces"
    const ozPattern = /(\d+\.?\d*)\s*(oz|ounce|ounces)/i;
    const ozMatch = servingSize.match(ozPattern);
    if (ozMatch) {
      const oz = parseFloat(ozMatch[1]);
      if (!isNaN(oz) && oz > 0) {
        const grams = oz * 28.3495;
        console.log('[OpenFoodFacts] Ounces detected:', { oz, grams });
        
        // Extract full description
        const description = servingSize.trim();
        
        return {
          description,
          grams: Math.round(grams),
          displayText: `${description} (≈ ${Math.round(grams)} g)`,
          hasValidGrams: true,
          isEstimated: true,
        };
      }
    }

    // B) MILLILITERS (ml)
    // Pattern: "X ml" or "X milliliter" or "X milliliters"
    const mlPattern = /(\d+\.?\d*)\s*(ml|milliliter|milliliters|mL)/i;
    const mlMatch = servingSize.match(mlPattern);
    if (mlMatch) {
      const ml = parseFloat(mlMatch[1]);
      if (!isNaN(ml) && ml > 0) {
        const grams = mlToGrams(ml);
        console.log('[OpenFoodFacts] Milliliters detected:', { ml, grams });
        
        // Extract full description
        const description = servingSize.trim();
        
        // NEW: Use 1:1 conversion, no "≈" symbol needed
        return {
          description,
          grams: Math.round(grams),
          displayText: `${description} (${Math.round(grams)} g)`,
          hasValidGrams: true,
          isEstimated: false, // Not estimated anymore since we're using intentional 1:1
        };
      }
    }

    // C) TABLESPOONS (tbsp)
    // Pattern: "X tbsp" or "X tablespoon" or "X tablespoons"
    const tbspPattern = /(\d+\.?\d*)\s*(tbsp|tablespoon|tablespoons|Tbsp|TBSP)/i;
    const tbspMatch = servingSize.match(tbspPattern);
    if (tbspMatch) {
      const tbsp = parseFloat(tbspMatch[1]);
      if (!isNaN(tbsp) && tbsp > 0) {
        const ml = tbsp * 15; // 1 tbsp = 15 ml
        const grams = mlToGrams(ml);
        console.log('[OpenFoodFacts] Tablespoons detected:', { tbsp, ml, grams });
        
        // Extract full description
        const description = servingSize.trim();
        
        // NEW: Use 1:1 conversion, no "≈" symbol needed
        return {
          description,
          grams: Math.round(grams),
          displayText: `${description} (${Math.round(grams)} g)`,
          hasValidGrams: true,
          isEstimated: false, // Not estimated anymore since we're using intentional 1:1
        };
      }
    }

    // D) TEASPOONS (tsp)
    // Pattern: "X tsp" or "X teaspoon" or "X teaspoons"
    const tspPattern = /(\d+\.?\d*)\s*(tsp|teaspoon|teaspoons|Tsp|TSP)/i;
    const tspMatch = servingSize.match(tspPattern);
    if (tspMatch) {
      const tsp = parseFloat(tspMatch[1]);
      if (!isNaN(tsp) && tsp > 0) {
        const ml = tsp * 5; // 1 tsp = 5 ml
        const grams = mlToGrams(ml);
        console.log('[OpenFoodFacts] Teaspoons detected:', { tsp, ml, grams });
        
        // Extract full description
        const description = servingSize.trim();
        
        // NEW: Use 1:1 conversion, no "≈" symbol needed
        return {
          description,
          grams: Math.round(grams),
          displayText: `${description} (${Math.round(grams)} g)`,
          hasValidGrams: true,
          isEstimated: false, // Not estimated anymore since we're using intentional 1:1
        };
      }
    }

    // E) CUPS
    // Pattern: "X cup" or "X cups"
    const cupPattern = /(\d+\.?\d*)\s*(cup|cups)/i;
    const cupMatch = servingSize.match(cupPattern);
    if (cupMatch) {
      const cups = parseFloat(cupMatch[1]);
      if (!isNaN(cups) && cups > 0) {
        const ml = cups * 240; // 1 cup = 240 ml
        const grams = mlToGrams(ml);
        console.log('[OpenFoodFacts] Cups detected:', { cups, ml, grams });
        
        // Extract full description
        const description = servingSize.trim();
        
        // NEW: Use 1:1 conversion, no "≈" symbol needed
        return {
          description,
          grams: Math.round(grams),
          displayText: `${description} (${Math.round(grams)} g)`,
          hasValidGrams: true,
          isEstimated: false, // Not estimated anymore since we're using intentional 1:1
        };
      }
    }

    // ========== PRIORITY 4: HOUSEHOLD UNITS WITHOUT GRAMS ==========
    
    // Check if serving_quantity provides a gram value
    if (product.serving_quantity) {
      const quantityStr = String(product.serving_quantity).trim();
      const grams = parseFloat(quantityStr);
      
      if (!isNaN(grams) && grams > 0) {
        console.log('[OpenFoodFacts] Using serving_quantity:', grams);
        return {
          description: servingSize,
          grams,
          displayText: `${servingSize} (${Math.round(grams)} g)`,
          hasValidGrams: true,
          isEstimated: false,
        };
      }
    }

    // Household units pattern: "X slice", "X egg", "X piece", "X bar", "X tortilla", etc.
    // EXPANDED: Added more common portion types
    const householdPattern = /(\d+\.?\d*)\s*(slice|slices|egg|eggs|piece|pieces|bar|bars|serving|servings|item|items|unit|units|tortilla|tortillas|pancake|pancakes|waffle|waffles|cookie|cookies|cracker|crackers|biscuit|biscuits|roll|rolls|muffin|muffins|bagel|bagels|patty|patties|nugget|nuggets|wing|wings|drumstick|drumsticks|breast|breasts|thigh|thighs|fillet|fillets|steak|steaks|chop|chops|sausage|sausages|link|links|strip|strips|stick|sticks|ball|balls|cube|cubes|wedge|wedges|ring|rings|chip|chips|fry|fries)/i;
    const householdMatch = servingSize.match(householdPattern);
    if (householdMatch) {
      console.log('[OpenFoodFacts] Household unit detected without grams:', servingSize);
      
      // Return the unit as-is with 100g estimate
      return {
        description: servingSize,
        grams: 100,
        displayText: `${servingSize} (estimated as 100g)`,
        hasValidGrams: false,
        isEstimated: true,
      };
    }

    // ========== PRIORITY 5: FALLBACK ==========
    
    // Fallback: We have a serving description but no parseable grams or convertible units
    // Return the description as-is with 100g default for calculations
    console.log('[OpenFoodFacts] Could not parse grams or convert units, using description with 100g fallback');
    return {
      description: servingSize,
      grams: 100,
      displayText: `${servingSize} (estimated as 100g)`,
      hasValidGrams: false,
      isEstimated: true,
    };
  } catch (error) {
    // If ANY error occurs during parsing, return default
    console.error('[OpenFoodFacts] Error parsing serving size:', error);
    return defaultServing;
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
  try {
    console.log(`[OpenFoodFacts] ========== TEXT SEARCH ==========`);
    console.log(`[OpenFoodFacts] Query: "${query}"`);
    
    // URL-encode the query
    const encodedQuery = encodeURIComponent(query);
    
    // OPTIMIZATION: Use simple, known-good OFF search endpoint with minimal fields and limit
    // Only request the fields we actually need to reduce response size and parsing time
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodedQuery}&search_simple=1&action=process&json=1&page_size=30&fields=code,product_name,generic_name,brands,serving_size,serving_quantity,nutriments`;
    
    console.log(`[OpenFoodFacts] Search URL: ${url}`);
    
    const response = await fetchWithTimeout(url, {}, 10000); // 10 second timeout
    
    console.log(`[OpenFoodFacts] Response status: ${response.status}`);
    
    if (!response.ok) {
      console.log(`[OpenFoodFacts] ❌ Search failed (status: ${response.status})`);
      return {
        products: [],
        count: 0,
        page: 1,
        status: response.status,
      };
    }

    const data = await response.json();
    
    console.log(`[OpenFoodFacts] Response data keys:`, Object.keys(data || {}));
    
    // Safe response parsing
    if (!data || !data.products) {
      console.log(`[OpenFoodFacts] ❌ No products field in response`);
      return {
        products: [],
        count: 0,
        page: 1,
        status: response.status,
      };
    }
    
    if (!Array.isArray(data.products)) {
      console.log(`[OpenFoodFacts] ❌ products field is not an array`);
      return {
        products: [],
        count: 0,
        page: 1,
        status: response.status,
      };
    }
    
    console.log(`[OpenFoodFacts] ✅ Search returned ${data.products.length} products`);
    return {
      products: data.products,
      count: data.count || data.products.length,
      page: data.page || 1,
      status: response.status,
    };
  } catch (error) {
    console.error('[OpenFoodFacts] ❌ Error searching:', error);
    if (error instanceof Error) {
      console.error('[OpenFoodFacts] Error message:', error.message);
    }
    // NEVER throw - always return result object on failure
    return {
      products: [],
      count: 0,
      page: 1,
      status: 0, // 0 indicates network error
    };
  }
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
