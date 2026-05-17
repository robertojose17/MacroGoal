#!/usr/bin/env node
/**
 * Fix existing meal_recipes in Supabase by re-fetching ingredient macros from Open Food Facts.
 * Run: SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/update-ingredients-off.js
 *
 * This corrects corrupted USDA data (e.g. garlic showing 39g fat, sugar showing 18g fat).
 */

const OFF_BASE = 'https://world.openfoodfacts.org/cgi/search.pl';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://esgptfiofoaeguslgvcq.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var is required');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Known macros — checked before any OFF request (most reliable source)
// All values are per 100g
// ---------------------------------------------------------------------------

const KNOWN_MACROS = {
  // Oils & fats
  'olive oil': { calories: 884, protein: 0, carbs: 0, fat: 100, fiber: 0 },
  'extra virgin olive oil': { calories: 884, protein: 0, carbs: 0, fat: 100, fiber: 0 },
  'vegetable oil': { calories: 884, protein: 0, carbs: 0, fat: 100, fiber: 0 },
  'sunflower oil': { calories: 884, protein: 0, carbs: 0, fat: 100, fiber: 0 },
  'coconut oil': { calories: 862, protein: 0, carbs: 0, fat: 100, fiber: 0 },
  'butter': { calories: 717, protein: 0.9, carbs: 0.1, fat: 81, fiber: 0 },
  'ghee': { calories: 900, protein: 0, carbs: 0, fat: 99.5, fiber: 0 },

  // Basic produce
  'garlic': { calories: 149, protein: 6.4, carbs: 33, fat: 0.5, fiber: 2.1 },
  'onion': { calories: 40, protein: 1.1, carbs: 9.3, fat: 0.1, fiber: 1.7 },
  'tomato': { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2 },
  'tomatoes': { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2 },
  'red pepper': { calories: 31, protein: 1, carbs: 6, fat: 0.3, fiber: 2.1 },
  'yellow pepper': { calories: 27, protein: 1, carbs: 6.3, fat: 0.2, fiber: 0.9 },
  'green pepper': { calories: 20, protein: 0.9, carbs: 4.6, fat: 0.2, fiber: 1.7 },
  'carrot': { calories: 41, protein: 0.9, carbs: 10, fat: 0.2, fiber: 2.8 },
  'potato': { calories: 77, protein: 2, carbs: 17, fat: 0.1, fiber: 2.2 },
  'spinach': { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2 },
  'mushroom': { calories: 22, protein: 3.1, carbs: 3.3, fat: 0.3, fiber: 1 },
  'mushrooms': { calories: 22, protein: 3.1, carbs: 3.3, fat: 0.3, fiber: 1 },
  'courgette': { calories: 17, protein: 1.2, carbs: 3.1, fat: 0.3, fiber: 1 },
  'zucchini': { calories: 17, protein: 1.2, carbs: 3.1, fat: 0.3, fiber: 1 },
  'broccoli': { calories: 34, protein: 2.8, carbs: 7, fat: 0.4, fiber: 2.6 },
  'cauliflower': { calories: 25, protein: 1.9, carbs: 5, fat: 0.3, fiber: 2 },
  'celery': { calories: 16, protein: 0.7, carbs: 3, fat: 0.2, fiber: 1.6 },
  'leek': { calories: 61, protein: 1.5, carbs: 14, fat: 0.3, fiber: 1.8 },
  'cucumber': { calories: 15, protein: 0.7, carbs: 3.6, fat: 0.1, fiber: 0.5 },
  'lettuce': { calories: 15, protein: 1.4, carbs: 2.9, fat: 0.2, fiber: 1.3 },
  'cabbage': { calories: 25, protein: 1.3, carbs: 5.8, fat: 0.1, fiber: 2.5 },
  'kale': { calories: 49, protein: 4.3, carbs: 8.8, fat: 0.9, fiber: 3.6 },
  'sweet potato': { calories: 86, protein: 1.6, carbs: 20, fat: 0.1, fiber: 3 },
  'pumpkin': { calories: 26, protein: 1, carbs: 6.5, fat: 0.1, fiber: 0.5 },
  'aubergine': { calories: 25, protein: 1, carbs: 5.9, fat: 0.2, fiber: 3 },
  'eggplant': { calories: 25, protein: 1, carbs: 5.9, fat: 0.2, fiber: 3 },
  'asparagus': { calories: 20, protein: 2.2, carbs: 3.9, fat: 0.1, fiber: 2.1 },
  'corn': { calories: 86, protein: 3.3, carbs: 19, fat: 1.4, fiber: 2.7 },
  'peas': { calories: 81, protein: 5.4, carbs: 14, fat: 0.4, fiber: 5.1 },
  'green beans': { calories: 31, protein: 1.8, carbs: 7, fat: 0.1, fiber: 2.7 },

  // Herbs & spices
  'parsley': { calories: 36, protein: 3, carbs: 6.3, fat: 0.8, fiber: 3.3 },
  'cilantro': { calories: 23, protein: 2.1, carbs: 3.7, fat: 0.5, fiber: 2.8 },
  'coriander': { calories: 23, protein: 2.1, carbs: 3.7, fat: 0.5, fiber: 2.8 },
  'basil': { calories: 23, protein: 3.2, carbs: 2.7, fat: 0.6, fiber: 1.6 },
  'mint': { calories: 70, protein: 3.8, carbs: 14.9, fat: 0.9, fiber: 8 },
  'thyme': { calories: 101, protein: 5.6, carbs: 24, fat: 1.7, fiber: 14 },
  'rosemary': { calories: 131, protein: 3.3, carbs: 21, fat: 5.9, fiber: 14 },
  'oregano': { calories: 265, protein: 9, carbs: 69, fat: 4.3, fiber: 43 },
  'tarragon': { calories: 295, protein: 22.8, carbs: 50.2, fat: 7.2, fiber: 7.4 },
  'dill': { calories: 43, protein: 3.5, carbs: 7, fat: 1.1, fiber: 2.1 },
  'chives': { calories: 30, protein: 3.3, carbs: 4.4, fat: 0.7, fiber: 2.5 },
  'sage': { calories: 315, protein: 10.6, carbs: 60.7, fat: 12.7, fiber: 40.3 },
  'bay leaf': { calories: 313, protein: 7.6, carbs: 75, fat: 8.4, fiber: 26.3 },
  'bay leaves': { calories: 313, protein: 7.6, carbs: 75, fat: 8.4, fiber: 26.3 },
  'ginger': { calories: 80, protein: 1.8, carbs: 18, fat: 0.8, fiber: 2 },
  'turmeric': { calories: 354, protein: 7.8, carbs: 65, fat: 9.9, fiber: 21 },
  'cumin': { calories: 375, protein: 17.8, carbs: 44, fat: 22, fiber: 10.5 },
  'paprika': { calories: 282, protein: 14.1, carbs: 54, fat: 12.9, fiber: 34.9 },
  'cinnamon': { calories: 247, protein: 4, carbs: 81, fat: 1.2, fiber: 53 },
  'chilli': { calories: 40, protein: 1.9, carbs: 8.8, fat: 0.4, fiber: 1.5 },
  'chili': { calories: 40, protein: 1.9, carbs: 8.8, fat: 0.4, fiber: 1.5 },
  'cayenne': { calories: 318, protein: 12.5, carbs: 57, fat: 17.3, fiber: 27 },
  'nutmeg': { calories: 525, protein: 5.8, carbs: 49, fat: 36.3, fiber: 20.8 },
  'cardamom': { calories: 311, protein: 10.8, carbs: 68, fat: 6.7, fiber: 28 },
  'cloves': { calories: 274, protein: 6, carbs: 66, fat: 13, fiber: 33.9 },
  'star anise': { calories: 337, protein: 17.6, carbs: 50, fat: 15.9, fiber: 14.6 },
  'vanilla': { calories: 288, protein: 0.1, carbs: 13, fat: 0.1, fiber: 0 },

  // Proteins
  'chicken breast': { calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 },
  'chicken thigh': { calories: 209, protein: 26, carbs: 0, fat: 10.9, fiber: 0 },
  'chicken thighs': { calories: 209, protein: 26, carbs: 0, fat: 10.9, fiber: 0 },
  'chicken leg': { calories: 184, protein: 27, carbs: 0, fat: 8, fiber: 0 },
  'chicken legs': { calories: 184, protein: 27, carbs: 0, fat: 8, fiber: 0 },
  'chicken drumstick': { calories: 172, protein: 28.3, carbs: 0, fat: 5.7, fiber: 0 },
  'beef': { calories: 250, protein: 26, carbs: 0, fat: 17, fiber: 0 },
  'ground beef': { calories: 254, protein: 26, carbs: 0, fat: 17, fiber: 0 },
  'minced beef': { calories: 254, protein: 26, carbs: 0, fat: 17, fiber: 0 },
  'pork': { calories: 242, protein: 27, carbs: 0, fat: 14, fiber: 0 },
  'lamb': { calories: 294, protein: 25, carbs: 0, fat: 21, fiber: 0 },
  'salmon': { calories: 208, protein: 20, carbs: 0, fat: 13, fiber: 0 },
  'tuna': { calories: 132, protein: 28, carbs: 0, fat: 1.3, fiber: 0 },
  'shrimp': { calories: 99, protein: 24, carbs: 0.2, fat: 0.3, fiber: 0 },
  'prawns': { calories: 99, protein: 24, carbs: 0.2, fat: 0.3, fiber: 0 },
  'egg': { calories: 143, protein: 12.6, carbs: 0.7, fat: 9.5, fiber: 0 },
  'eggs': { calories: 143, protein: 12.6, carbs: 0.7, fat: 9.5, fiber: 0 },
  'tofu': { calories: 76, protein: 8, carbs: 1.9, fat: 4.8, fiber: 0.3 },
  'bacon': { calories: 541, protein: 37, carbs: 1.4, fat: 42, fiber: 0 },
  'chorizo': { calories: 455, protein: 24.1, carbs: 1.9, fat: 38.3, fiber: 0 },
  'turkey': { calories: 189, protein: 29, carbs: 0, fat: 7.4, fiber: 0 },
  'duck': { calories: 337, protein: 19, carbs: 0, fat: 28, fiber: 0 },

  // Dairy
  'milk': { calories: 61, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0 },
  'cream': { calories: 345, protein: 2.1, carbs: 2.8, fat: 36, fiber: 0 },
  'double cream': { calories: 462, protein: 1.7, carbs: 2.7, fat: 48, fiber: 0 },
  'sour cream': { calories: 198, protein: 2.4, carbs: 4.6, fat: 19.4, fiber: 0 },
  'yogurt': { calories: 59, protein: 3.5, carbs: 5, fat: 3.3, fiber: 0 },
  'greek yogurt': { calories: 97, protein: 9, carbs: 3.6, fat: 5, fiber: 0 },
  'cheddar': { calories: 403, protein: 25, carbs: 1.3, fat: 33, fiber: 0 },
  'parmesan': { calories: 431, protein: 38, carbs: 4.1, fat: 29, fiber: 0 },
  'mozzarella': { calories: 280, protein: 28, carbs: 3.1, fat: 17, fiber: 0 },
  'feta': { calories: 264, protein: 14, carbs: 4, fat: 21, fiber: 0 },
  'brie': { calories: 334, protein: 20, carbs: 0.5, fat: 28, fiber: 0 },

  // Grains & starches
  'rice': { calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 },
  'pasta': { calories: 131, protein: 5, carbs: 25, fat: 1.1, fiber: 1.8 },
  'bread': { calories: 265, protein: 9, carbs: 49, fat: 3.2, fiber: 2.7 },
  'flour': { calories: 364, protein: 10, carbs: 76, fat: 1, fiber: 2.7 },
  'oats': { calories: 389, protein: 17, carbs: 66, fat: 7, fiber: 10.6 },
  'couscous': { calories: 376, protein: 12.8, carbs: 77, fat: 0.6, fiber: 2.2 },
  'quinoa': { calories: 368, protein: 14.1, carbs: 64, fat: 6.1, fiber: 7 },
  'lentils': { calories: 116, protein: 9, carbs: 20, fat: 0.4, fiber: 7.9 },
  'chickpeas': { calories: 164, protein: 8.9, carbs: 27, fat: 2.6, fiber: 7.6 },
  'black beans': { calories: 132, protein: 8.9, carbs: 24, fat: 0.5, fiber: 8.7 },
  'kidney beans': { calories: 127, protein: 8.7, carbs: 22.8, fat: 0.5, fiber: 6.4 },
  'butter beans': { calories: 115, protein: 7.1, carbs: 20.9, fat: 0.4, fiber: 5.2 },

  // Sugars & sweeteners
  'sugar': { calories: 387, protein: 0, carbs: 100, fat: 0, fiber: 0 },
  'brown sugar': { calories: 380, protein: 0, carbs: 98, fat: 0, fiber: 0 },
  'dark brown sugar': { calories: 380, protein: 0, carbs: 98, fat: 0, fiber: 0 },
  'honey': { calories: 304, protein: 0.3, carbs: 82, fat: 0, fiber: 0.2 },
  'maple syrup': { calories: 260, protein: 0, carbs: 67, fat: 0.1, fiber: 0 },

  // Condiments & sauces
  'soy sauce': { calories: 53, protein: 8.1, carbs: 4.9, fat: 0.1, fiber: 0.8 },
  'fish sauce': { calories: 35, protein: 5.1, carbs: 3.6, fat: 0, fiber: 0 },
  'tomato paste': { calories: 82, protein: 4.3, carbs: 19, fat: 0.5, fiber: 4.1 },
  'tomato puree': { calories: 82, protein: 4.3, carbs: 19, fat: 0.5, fiber: 4.1 },
  'worcestershire sauce': { calories: 78, protein: 1.1, carbs: 19, fat: 0.1, fiber: 0 },
  'vinegar': { calories: 18, protein: 0, carbs: 0.9, fat: 0, fiber: 0 },
  'lemon juice': { calories: 22, protein: 0.4, carbs: 6.9, fat: 0.2, fiber: 0.3 },
  'lime juice': { calories: 25, protein: 0.4, carbs: 8.4, fat: 0.1, fiber: 0.4 },
  'coconut milk': { calories: 230, protein: 2.3, carbs: 5.5, fat: 23.8, fiber: 2.2 },
  'stock': { calories: 15, protein: 1.5, carbs: 1.5, fat: 0.5, fiber: 0 },
  'broth': { calories: 15, protein: 1.5, carbs: 1.5, fat: 0.5, fiber: 0 },
  'wine': { calories: 83, protein: 0.1, carbs: 2.6, fat: 0, fiber: 0 },
  'red wine': { calories: 85, protein: 0.1, carbs: 2.6, fat: 0, fiber: 0 },
  'white wine': { calories: 82, protein: 0.1, carbs: 2.6, fat: 0, fiber: 0 },
};

// ---------------------------------------------------------------------------
// Piece weights — grams per single whole item (for bare-number measures)
// ---------------------------------------------------------------------------

const PIECE_WEIGHTS = {
  'chicken thigh': 120, 'chicken thighs': 120,
  'chicken breast': 170, 'chicken breasts': 170,
  'chicken leg': 200, 'chicken legs': 200,
  'chicken drumstick': 100, 'chicken drumsticks': 100,
  'egg': 50, 'eggs': 50,
  'onion': 110, 'onions': 110,
  'potato': 150, 'potatoes': 150,
  'tomato': 120, 'tomatoes': 120,
  'carrot': 80, 'carrots': 80,
  'pepper': 160, 'peppers': 160,
  'red pepper': 160, 'yellow pepper': 160, 'green pepper': 160,
  'courgette': 200, 'zucchini': 200,
  'aubergine': 300, 'eggplant': 300,
  'lemon': 100, 'lemons': 100,
  'lime': 60, 'limes': 60,
  'orange': 130, 'oranges': 130,
  'apple': 180, 'apples': 180,
  'banana': 120, 'bananas': 120,
  'avocado': 200, 'avocados': 200,
  'garlic clove': 5, 'garlic cloves': 5,
  'shallot': 30, 'shallots': 30,
  'mushroom': 20, 'mushrooms': 20,
  'sausage': 80, 'sausages': 80,
  'rasher': 25, 'rashers': 25,
  'bacon rasher': 25,
  'fillet': 150, 'fillets': 150,
  'steak': 200, 'steaks': 200,
  'pork chop': 180, 'pork chops': 180,
  'lamb chop': 150, 'lamb chops': 150,
};

// ---------------------------------------------------------------------------
// Unit → grams conversion table (shared with parseAmount)
// ---------------------------------------------------------------------------

const MEASURE_TO_GRAMS = {
  'g': 1, 'gram': 1, 'grams': 1,
  'kg': 1000, 'kilogram': 1000,
  'oz': 28.35, 'ounce': 28.35, 'ounces': 28.35,
  'lb': 453.6, 'pound': 453.6, 'pounds': 453.6,
  'ml': 1, 'milliliter': 1, 'milliliters': 1,
  'l': 1000, 'liter': 1000, 'liters': 1000,
  'tsp': 5, 'teaspoon': 5, 'teaspoons': 5,
  'tbsp': 15, 'tablespoon': 15, 'tablespoons': 15,
  'cup': 240, 'cups': 240,
  'fl oz': 30, 'fluid ounce': 30,
  'pint': 473, 'quart': 946,
  'clove': 5, 'cloves': 5,
  'slice': 30, 'slices': 30,
  'piece': 50, 'pieces': 50,
  'sprig': 3, 'sprigs': 3,
  'leaf': 2, 'leaves': 2,
  'stalk': 40, 'stalks': 40,
  'can': 400, 'cans': 400,
  'packet': 30, 'packets': 30,
  'handful': 30,
  'pinch': 0.5, 'dash': 0.5,
  'bunch': 100,
  'head': 500,
  'fillet': 150,
  'breast': 170,
  'thigh': 120,
  'leg': 200,
  'whole': 100,
};

const DENSITY = {
  'oil': 0.92, 'olive oil': 0.92, 'vegetable oil': 0.92, 'coconut oil': 0.9,
  'butter': 0.91, 'ghee': 0.9,
  'honey': 1.4, 'maple syrup': 1.3, 'molasses': 1.4,
  'flour': 0.57, 'sugar': 0.85, 'brown sugar': 0.72, 'powdered sugar': 0.56,
  'salt': 1.2, 'baking soda': 0.7, 'baking powder': 0.9,
  'milk': 1.03, 'cream': 1.0, 'yogurt': 1.05,
  'rice': 0.75, 'oats': 0.34,
  'cocoa': 0.5, 'cornstarch': 0.6,
  'peanut butter': 1.1, 'almond butter': 1.1,
  'soy sauce': 1.1, 'fish sauce': 1.1, 'worcestershire': 1.05,
  'tomato paste': 1.1, 'ketchup': 1.1,
  'vinegar': 1.0, 'lemon juice': 1.03, 'lime juice': 1.03,
  'water': 1.0, 'broth': 1.0, 'stock': 1.0,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Parse a MealDB measure string into grams.
 * Handles fractions, units, volume→mass conversion, and bare piece counts.
 */
function parseAmount(measureStr, ingredientName) {
  if (!measureStr || measureStr.trim() === '') return 100;
  const s = measureStr.trim().toLowerCase();
  let amount = 0;

  const fracMatch = s.match(/^(\d+)\s+(\d+)\/(\d+)/);
  const simpleFrac = s.match(/^(\d+)\/(\d+)/);
  const numMatch = s.match(/^(\d+\.?\d*)/);

  if (fracMatch) {
    amount = parseInt(fracMatch[1]) + parseInt(fracMatch[2]) / parseInt(fracMatch[3]);
  } else if (simpleFrac) {
    amount = parseInt(simpleFrac[1]) / parseInt(simpleFrac[2]);
  } else if (numMatch) {
    amount = parseFloat(numMatch[1]);
  } else {
    amount = 1;
  }
  if (amount === 0) amount = 1;

  const unitMatch = s.match(/[\d/\s.]+([a-z\s]+)/);
  const unit = unitMatch ? unitMatch[1].trim() : '';
  const gramsPerUnit = MEASURE_TO_GRAMS[unit];

  if (gramsPerUnit) {
    let grams = amount * gramsPerUnit;
    // Apply density correction for volume units
    if (['ml', 'l', 'tsp', 'tbsp', 'cup', 'cups', 'fl oz', 'pint', 'quart'].includes(unit)) {
      const ingLower = ingredientName.toLowerCase();
      for (const [key, density] of Object.entries(DENSITY)) {
        if (ingLower.includes(key)) { grams = grams * density; break; }
      }
    }
    return Math.round(grams);
  }

  // No recognised unit — check if this is a bare piece count (e.g. "8" for "Chicken Thighs")
  if (amount >= 1 && amount <= 20 && Number.isInteger(amount)) {
    const ingLower = ingredientName.toLowerCase();
    for (const [key, weight] of Object.entries(PIECE_WEIGHTS)) {
      if (ingLower.includes(key)) {
        return Math.round(amount * weight);
      }
    }
    // Unknown ingredient with bare number — assume 50g per piece as fallback
    return Math.round(amount * 50);
  }

  // Large bare number — treat as grams directly
  if (amount > 20) return Math.round(amount);

  return Math.round(amount * 50);
}

// Sanity check: returns true if macros look plausible for the ingredient
function passesSanityCheck(ingredientName, macros) {
  const name = ingredientName.toLowerCase();

  // Nothing can exceed ~900 kcal/100g (pure fat)
  if (macros.calories > 900) return false;

  // Sugar/carb-only ingredients should have negligible fat
  const sugarLike = ['sugar', 'honey', 'syrup', 'flour', 'starch'];
  if (sugarLike.some(k => name.includes(k)) && macros.fat > 2) return false;

  // Herbs and spices should not be calorie-dense or fatty
  const herbSpice = ['garlic', 'tarragon', 'basil', 'oregano', 'thyme', 'parsley',
    'cilantro', 'rosemary', 'sage', 'mint', 'dill', 'chive'];
  if (herbSpice.some(k => name.includes(k))) {
    if (macros.calories > 400) return false;
    if (macros.fat > 5) return false;
  }

  return true;
}

/**
 * Score how well an OFF product name matches the target ingredient.
 * Higher score = better match. Used to prefer raw/simple ingredients over
 * processed products (e.g. raw garlic over garlic butter).
 */
function scoreProduct(ingredientName, productName) {
  if (!productName) return 0;
  const ing = ingredientName.toLowerCase();
  const prod = productName.toLowerCase();
  let score = 0;

  // Exact match is best
  if (prod === ing) score += 100;
  // Product name starts with ingredient name
  else if (prod.startsWith(ing)) score += 50;
  // Product name contains ingredient name as a whole word
  else if (new RegExp(`\\b${ing}\\b`).test(prod)) score += 30;
  // Product name contains ingredient name anywhere
  else if (prod.includes(ing)) score += 10;

  // Penalise processed/compound products
  const processedKeywords = [
    'sauce', 'butter', 'oil', 'paste', 'powder', 'extract', 'flavour', 'flavor',
    'seasoning', 'mix', 'blend', 'spread', 'dip', 'dressing', 'marinade',
    'soup', 'broth', 'stock', 'cream', 'frozen', 'canned', 'tinned', 'dried',
    'pickled', 'smoked', 'roasted', 'fried', 'baked',
  ];
  for (const kw of processedKeywords) {
    if (prod.includes(kw) && !ing.includes(kw)) score -= 20;
  }

  // Bonus for short product names (raw ingredients tend to have simple names)
  if (prod.split(' ').length <= 3) score += 5;

  return score;
}

const offCache = new Map();

async function getOFFMacros(ingredientName) {
  const key = ingredientName.toLowerCase().trim();
  if (offCache.has(key)) return offCache.get(key);

  // 1. Check known macros first — most reliable, no network needed
  for (const [knownKey, macros] of Object.entries(KNOWN_MACROS)) {
    if (key === knownKey || key.includes(knownKey) || knownKey.includes(key)) {
      offCache.set(key, macros);
      return macros;
    }
  }

  // 2. Known zero-calorie ingredients — skip OFF entirely
  const zeroCalorie = ['water', 'salt', 'pepper', 'black pepper', 'white pepper', 'ice'];
  if (zeroCalorie.some(z => key.includes(z))) {
    const result = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    offCache.set(key, result);
    return result;
  }

  // 3. Fall back to Open Food Facts
  await sleep(200);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const query = encodeURIComponent(key);
    const url = `${OFF_BASE}?search_terms=${query}&search_simple=1&action=process&json=1&page_size=10&sort_by=unique_scans_n&fields=code,product_name,nutriments`;

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'MacroGoal/1.0' },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      offCache.set(key, null);
      return null;
    }

    const data = await res.json();
    const products = data.products || [];

    // Collect all valid products, score each one, pick the best
    const candidates = [];

    for (const product of products) {
      const n = product.nutriments || {};
      const calories = n['energy-kcal_100g'] || n['energy-kcal'] || (n['energy_100g'] ? n['energy_100g'] / 4.184 : 0) || 0;

      if (calories <= 0) continue;

      const macros = {
        calories: Math.round(calories * 10) / 10,
        protein: Math.round((n['proteins_100g'] || n['proteins'] || 0) * 10) / 10,
        carbs: Math.round((n['carbohydrates_100g'] || n['carbohydrates'] || 0) * 10) / 10,
        fat: Math.round((n['fat_100g'] || n['fat'] || 0) * 10) / 10,
        fiber: Math.round((n['fiber_100g'] || n['fiber'] || 0) * 10) / 10,
      };

      if (!passesSanityCheck(key, macros)) {
        process.stdout.write(`[sanity-fail:${product.product_name}]`);
        continue;
      }

      const score = scoreProduct(key, product.product_name);
      candidates.push({ macros, score, name: product.product_name });
    }

    if (candidates.length === 0) {
      offCache.set(key, null);
      return null;
    }

    // Sort by score descending, pick the best match
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    process.stdout.write(`[off:${best.name}(${best.score})]`);
    offCache.set(key, best.macros);
    return best.macros;
  } catch (err) {
    offCache.set(key, null);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

async function fetchAllRecipes() {
  const pageSize = 1000;
  let offset = 0;
  const all = [];

  let hasMore = true;
  while (hasMore) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/meal_recipes?select=id,name,ingredients&limit=${pageSize}&offset=${offset}`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to fetch recipes: ${res.status} ${err}`);
    }
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) { hasMore = false; break; }
    all.push(...page);
    if (page.length < pageSize) { hasMore = false; break; }
    offset += pageSize;
  }

  return all;
}

async function updateRecipe(id, ingredients, calories, protein, carbs, fat) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/meal_recipes?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ ingredients, calories, protein, carbs, fat }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PATCH failed for id=${id}: ${res.status} ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('🔧 Starting ingredient macro correction using Open Food Facts...\n');

  const recipes = await fetchAllRecipes();
  console.log(`📋 Fetched ${recipes.length} recipes from Supabase\n`);

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (let i = 0; i < recipes.length; i++) {
    const recipe = recipes[i];
    const { id, name, ingredients } = recipe;

    process.stdout.write(`[${i + 1}/${recipes.length}] ${name}... `);

    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      console.log('⏭  No ingredients, skipping');
      totalSkipped++;
      continue;
    }

    try {
      let totalCal = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;
      let anyUpdated = false;
      const updatedIngredients = [];

      for (const ing of ingredients) {
        const ingName = ing.name || '';

        // Recalculate grams from measure string to fix bare-number bugs
        // (e.g. measure="8" for "Chicken Thighs" → 8×120g = 960g, not 8g)
        const grams = ing.measure
          ? parseAmount(ing.measure, ingName)
          : (ing.grams || 100);

        const macros = await getOFFMacros(ingName);

        if (macros) {
          const factor = grams / 100;
          const cal = Math.round(macros.calories * factor);
          const protein = Math.round(macros.protein * factor * 10) / 10;
          const carbs = Math.round(macros.carbs * factor * 10) / 10;
          const fat = Math.round(macros.fat * factor * 10) / 10;
          const fiber = Math.round((macros.fiber || 0) * factor * 10) / 10;

          totalCal += cal;
          totalProtein += protein;
          totalCarbs += carbs;
          totalFat += fat;

          updatedIngredients.push({
            ...ing,
            grams,
            calories: cal,
            protein,
            carbs,
            fat,
            fiber,
          });
          anyUpdated = true;
        } else {
          // No OFF data — keep existing values to avoid corrupting further
          totalCal += ing.calories || 0;
          totalProtein += ing.protein || 0;
          totalCarbs += ing.carbs || 0;
          totalFat += ing.fat || 0;
          updatedIngredients.push({ ...ing, grams });
        }
      }

      if (!anyUpdated) {
        console.log('⏭  No OFF data found for any ingredient');
        totalSkipped++;
        await sleep(100);
        continue;
      }

      const oldCal = ingredients.reduce((s, ing) => s + (ing.calories || 0), 0);
      const newCal = Math.round(totalCal);

      await updateRecipe(
        id,
        updatedIngredients,
        newCal,
        Math.round(totalProtein),
        Math.round(totalCarbs),
        Math.round(totalFat)
      );

      console.log(`✅ was ${oldCal} cal → now ${newCal} cal`);
      totalUpdated++;
    } catch (err) {
      console.log(`❌ Error: ${err.message}`);
      totalErrors++;
    }

    await sleep(100);
  }

  console.log('\n─────────────────────────────────────');
  console.log('✅ Update complete!');
  console.log(`   Updated: ${totalUpdated}`);
  console.log(`   Skipped: ${totalSkipped}`);
  console.log(`   Errors:  ${totalErrors}`);
}

main().catch(console.error);
