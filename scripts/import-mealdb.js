#!/usr/bin/env node
/**
 * TheMealDB + Open Food Facts → Supabase import script
 * Run once: SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/import-mealdb.js
 */

const MEALDB_BASE = 'https://www.themealdb.com/api/json/v1/1';
const OFF_BASE = 'https://world.openfoodfacts.org/cgi/search.pl';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://esgptfiofoaeguslgvcq.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY env var is required');
  process.exit(1);
}

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
    if (['ml','l','tsp','tbsp','cup','cups','fl oz','pint','quart'].includes(unit)) {
      const ingLower = ingredientName.toLowerCase();
      for (const [key, density] of Object.entries(DENSITY)) {
        if (ingLower.includes(key)) { grams = grams * density; break; }
      }
    }
    return Math.round(grams);
  }
  if (amount > 5) return Math.round(amount);
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

const offCache = new Map();

async function getOFFMacros(ingredientName) {
  const key = ingredientName.toLowerCase().trim();
  if (offCache.has(key)) return offCache.get(key);

  // Known zero-calorie ingredients — skip OFF entirely
  const zeroCalorie = ['water', 'salt', 'pepper', 'black pepper', 'white pepper', 'ice'];
  if (zeroCalorie.some(z => key.includes(z))) {
    const result = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    offCache.set(key, result);
    return result;
  }

  await sleep(200);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const query = encodeURIComponent(key);
    const url = `${OFF_BASE}?search_terms=${query}&search_simple=1&action=process&json=1&page_size=10&sort_by=unique_scans_n&fields=code,product_name,nutriments`;

    console.log(`   [OFF] Searching: "${key}"`);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'MacroGoal/1.0' },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.log(`   [OFF] HTTP ${res.status} for "${key}"`);
      offCache.set(key, null);
      return null;
    }

    const data = await res.json();
    const products = data.products || [];

    for (const product of products) {
      const n = product.nutriments || {};
      const calories = n['energy-kcal_100g'] || n['energy-kcal'] || (n['energy_100g'] ? n['energy_100g'] / 4.184 : 0) || 0;

      // Skip products with no calorie data
      if (calories <= 0) continue;

      const macros = {
        calories: Math.round(calories * 10) / 10,
        protein: Math.round((n['proteins_100g'] || n['proteins'] || 0) * 10) / 10,
        carbs: Math.round((n['carbohydrates_100g'] || n['carbohydrates'] || 0) * 10) / 10,
        fat: Math.round((n['fat_100g'] || n['fat'] || 0) * 10) / 10,
        fiber: Math.round((n['fiber_100g'] || n['fiber'] || 0) * 10) / 10,
      };

      if (!passesSanityCheck(key, macros)) {
        console.log(`   [OFF] Sanity fail for "${key}" on product "${product.product_name}" (${macros.calories} kcal, ${macros.fat}g fat) — trying next`);
        continue;
      }

      console.log(`   [OFF] Found "${key}": ${macros.calories} kcal, ${macros.protein}g P, ${macros.carbs}g C, ${macros.fat}g F`);
      offCache.set(key, macros);
      return macros;
    }

    console.log(`   [OFF] No valid result for "${key}"`);
    offCache.set(key, null);
    return null;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log(`   [OFF] Timeout for "${key}"`);
    } else {
      console.log(`   [OFF] Error for "${key}": ${err.message}`);
    }
    offCache.set(key, null);
    return null;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function detectMealType(category) {
  if (category === 'Breakfast') return 'breakfast';
  if (['Starter','Side','Dessert','Vegan','Vegetarian'].includes(category)) return 'snack';
  if (['Pasta','Seafood','Miscellaneous'].includes(category)) return 'lunch';
  return 'dinner';
}

function detectDietaryTags(ingredients) {
  const meatKeywords = ['beef','chicken','pork','lamb','turkey','duck','veal','bacon','ham','sausage','chorizo','pepperoni','anchovy','tuna','salmon','shrimp','prawn','crab','lobster','fish','seafood','mince','steak','ribs'];
  const dairyKeywords = ['milk','cream','butter','cheese','yogurt','ghee','mozzarella','parmesan','cheddar','brie','feta'];
  const glutenKeywords = ['flour','bread','pasta','noodle','wheat','barley','rye','soy sauce','breadcrumb','pita','tortilla','couscous'];
  const all = ingredients.map(i => i.name.toLowerCase()).join(' ');
  const hasMeat = meatKeywords.some(k => all.includes(k));
  const hasDairy = dairyKeywords.some(k => all.includes(k));
  const hasGluten = glutenKeywords.some(k => all.includes(k));
  const tags = [];
  if (!hasMeat) tags.push('vegetarian');
  if (!hasMeat && !hasDairy) tags.push('vegan');
  if (!hasGluten) tags.push('gluten-free');
  if (!hasDairy) tags.push('dairy-free');
  return tags;
}

function detectMainProtein(ingredients) {
  const proteinMap = [
    ['chicken','chicken'],['beef','beef'],['pork','pork'],['lamb','lamb'],
    ['turkey','turkey'],['duck','duck'],['salmon','salmon'],['tuna','tuna'],
    ['shrimp','shrimp'],['prawn','shrimp'],['crab','seafood'],['lobster','seafood'],
    ['fish','fish'],['egg','eggs'],['tofu','tofu'],['lentil','lentils'],
    ['chickpea','legumes'],['bean','legumes'],['paneer','paneer'],
    ['cheese','cheese'],['yogurt','yogurt'],
  ];
  const all = ingredients.map(i => i.name.toLowerCase()).join(' ');
  for (const [keyword, protein] of proteinMap) {
    if (all.includes(keyword)) return protein;
  }
  return 'none';
}

function detectCuisine(area) {
  const map = {
    'American':'American','British':'British','Canadian':'American',
    'Chinese':'Asian','Croatian':'Mediterranean','Dutch':'European',
    'Egyptian':'Middle Eastern','Filipino':'Asian','French':'French',
    'Greek':'Mediterranean','Indian':'Indian','Irish':'British',
    'Italian':'Italian','Jamaican':'Caribbean','Japanese':'Japanese',
    'Kenyan':'African','Malaysian':'Asian','Mexican':'Mexican',
    'Moroccan':'Middle Eastern','Polish':'European','Portuguese':'Mediterranean',
    'Russian':'European','Spanish':'Mediterranean','Thai':'Asian',
    'Tunisian':'Middle Eastern','Turkish':'Middle Eastern','Uruguayan':'American',
    'Vietnamese':'Asian','Unknown':'International',
  };
  return map[area] || area || 'International';
}

async function supabaseInsert(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/meal_recipes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const err = await res.text();
    // Ignore duplicate key errors (23505) silently
    if (err.includes('23505')) return;
    throw new Error(`Supabase insert failed: ${res.status} ${err}`);
  }
}

async function supabaseGetExistingIds() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/meal_recipes?select=mealdb_id&source=eq.mealdb`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return new Set();
    const data = await res.json();
    return new Set(data.filter(r => r.mealdb_id).map(r => r.mealdb_id));
  } catch (e) {
    return new Set();
  }
}

async function fetchAllCategories() {
  const res = await fetch(`${MEALDB_BASE}/categories.php`);
  const data = await res.json();
  return data.categories.map(c => c.strCategory);
}

async function fetchMealsByCategory(category) {
  const res = await fetch(`${MEALDB_BASE}/filter.php?c=${encodeURIComponent(category)}`);
  const data = await res.json();
  return (data.meals || []).map(m => ({ id: m.idMeal, name: m.strMeal }));
}

async function fetchMealDetail(id) {
  const res = await fetch(`${MEALDB_BASE}/lookup.php?i=${id}`);
  const data = await res.json();
  return data.meals ? data.meals[0] : null;
}

async function processMeal(meal, category, existingIds) {
  if (existingIds.has(meal.idMeal)) return null;
  const rawIngredients = [];
  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`];
    const measure = meal[`strMeasure${i}`];
    if (name && name.trim()) rawIngredients.push({ name: name.trim(), measure: (measure || '').trim() });
  }
  if (rawIngredients.length === 0) return null;

  let totalCal = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;
  const ingredients = [];

  for (const ing of rawIngredients) {
    const grams = parseAmount(ing.measure, ing.name);
    const macros = await getOFFMacros(ing.name);
    let cal = 0, protein = 0, carbs = 0, fat = 0, fiber = 0;
    if (macros) {
      const factor = grams / 100;
      cal = Math.round(macros.calories * factor);
      protein = Math.round(macros.protein * factor * 10) / 10;
      carbs = Math.round(macros.carbs * factor * 10) / 10;
      fat = Math.round(macros.fat * factor * 10) / 10;
      fiber = Math.round((macros.fiber || 0) * factor * 10) / 10;
    }
    totalCal += cal; totalProtein += protein; totalCarbs += carbs; totalFat += fat;
    ingredients.push({ name: ing.name, measure: ing.measure, grams, calories: cal, protein, carbs, fat, fiber });
  }

  if (totalCal < 20) return null;

  return {
    name: meal.strMeal,
    cuisine: detectCuisine(meal.strArea),
    meal_type: detectMealType(category),
    calories: Math.round(totalCal),
    protein: Math.round(totalProtein),
    carbs: Math.round(totalCarbs),
    fat: Math.round(totalFat),
    description: `${meal.strMeal} — ${detectCuisine(meal.strArea)} ${detectMealType(category)}`,
    dietary_tags: detectDietaryTags(ingredients),
    main_protein: detectMainProtein(ingredients),
    source: 'mealdb',
    mealdb_id: meal.idMeal,
    ingredients: ingredients,
    instructions: meal.strInstructions ? meal.strInstructions.trim() : null,
    thumbnail_url: meal.strMealThumb || null,
    approved_for_meal_plan: true,
    is_public: true,
    review_count: 0,
    average_rating: 0,
  };
}

async function main() {
  console.log('🍽️  Starting TheMealDB → Supabase import (using Open Food Facts)...\n');
  const existingIds = await supabaseGetExistingIds();
  console.log(`📋 Already imported: ${existingIds.size} recipes\n`);
  const categories = await fetchAllCategories();
  console.log(`📂 Found ${categories.length} categories: ${categories.join(', ')}\n`);

  let totalImported = 0, totalSkipped = 0, totalErrors = 0;

  for (const category of categories) {
    console.log(`\n🔍 Category: ${category}`);
    const meals = await fetchMealsByCategory(category);
    console.log(`   Found ${meals.length} meals`);

    for (const meal of meals) {
      try {
        process.stdout.write(`   Processing: ${meal.name}... `);
        await sleep(100);
        const detail = await fetchMealDetail(meal.id);
        if (!detail) { console.log('❌ No detail'); totalErrors++; continue; }
        const row = await processMeal(detail, category, existingIds);
        if (!row) { console.log('⏭  Skipped'); totalSkipped++; continue; }
        await supabaseInsert([row]);
        existingIds.add(meal.id);
        totalImported++;
        console.log(`✅ ${row.calories} cal, ${row.protein}g protein`);
      } catch (err) {
        console.log(`❌ Error: ${err.message}`);
        totalErrors++;
      }
    }
  }

  console.log(`\n✅ Import complete!`);
  console.log(`   Imported: ${totalImported}`);
  console.log(`   Skipped:  ${totalSkipped}`);
  console.log(`   Errors:   ${totalErrors}`);
}

main().catch(console.error);
