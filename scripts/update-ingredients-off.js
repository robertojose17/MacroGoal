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
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
        process.stdout.write(`[sanity-fail:${product.product_name}]`);
        continue;
      }

      offCache.set(key, macros);
      return macros;
    }

    offCache.set(key, null);
    return null;
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
        const grams = ing.grams || 100;
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
          updatedIngredients.push(ing);
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
