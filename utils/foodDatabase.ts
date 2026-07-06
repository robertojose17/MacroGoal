
/**
 * Internal Food Database Management
 * Handles local storage and caching of foods
 * 
 * CRITICAL: All functions are non-blocking and never throw errors
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Food, Meal, MealItem, DailySummary, MealType } from '@/types';
import { mockFoods } from '@/data/mockData';
import { supabase } from '@/lib/supabase/client';
import { extractServingSize } from '@/utils/openFoodFacts';
import { calcMacros } from '@/utils/macros';

const FOODS_STORAGE_KEY = '@elite_macro_foods';
const MEALS_STORAGE_KEY = '@elite_macro_meals';
const MEAL_ITEMS_STORAGE_KEY = '@elite_macro_meal_items';
const DAILY_SUMMARY_STORAGE_KEY = '@elite_macro_daily_summary';

/**
 * Initialize food database with mock data
 * CRITICAL: Non-blocking, never throws
 */
export async function initializeFoodDatabase(): Promise<void> {
  try {
    console.log('[FoodDB] Initializing food database...');
    
    // Add timeout to prevent hanging
    const initPromise = AsyncStorage.getItem(FOODS_STORAGE_KEY);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database init timeout')), 3000)
    );
    
    const existing = await Promise.race([initPromise, timeoutPromise]) as string | null;
    
    if (!existing) {
      console.log('[FoodDB] No existing data, initializing with mock data');
      await AsyncStorage.setItem(FOODS_STORAGE_KEY, JSON.stringify(mockFoods));
      console.log('[FoodDB] ✅ Mock data initialized');
    } else {
      console.log('[FoodDB] ✅ Existing data found');
    }
  } catch (error) {
    console.error('[FoodDB] ⚠️ Error initializing database (non-blocking):', error);
    // CRITICAL: Do not throw, app must continue
  }
}

/**
 * Get all foods from internal database
 * CRITICAL: Never throws, returns mock data on error
 */
export async function getAllFoods(): Promise<Food[]> {
  try {
    const data = await AsyncStorage.getItem(FOODS_STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
    return mockFoods;
  } catch (error) {
    console.error('[FoodDB] Error getting all foods:', error);
    return mockFoods;
  }
}

/**
 * Search foods by name or brand in internal database
 * CRITICAL: Never throws, returns empty array on error
 */
export async function searchInternalFoods(query: string): Promise<Food[]> {
  try {
    console.log(`[FoodDB] Searching internal foods: ${query}`);
    const foods = await getAllFoods();
    const lowerQuery = query.toLowerCase();
    
    const results = foods.filter(food => 
      food.name.toLowerCase().includes(lowerQuery) ||
      (food.brand && food.brand.toLowerCase().includes(lowerQuery))
    );
    
    console.log(`[FoodDB] Found ${results.length} internal results`);
    return results;
  } catch (error) {
    console.error('[FoodDB] Error searching internal foods:', error);
    return [];
  }
}

/**
 * Insert or update food in internal database
 * CRITICAL: Never throws, returns a valid Food object
 */
export async function upsertFood(food: Partial<Food>): Promise<Food> {
  try {
    const foods = await getAllFoods();
    
    // Check if food already exists (by barcode or id)
    const existingIndex = foods.findIndex(f => 
      (food.id && f.id === food.id) || 
      (food.barcode && f.barcode === food.barcode)
    );
    
    let savedFood: Food;
    
    if (existingIndex >= 0) {
      // Update existing food
      console.log(`[FoodDB] Updating existing food: ${food.name}`);
      savedFood = { ...foods[existingIndex], ...food } as Food;
      foods[existingIndex] = savedFood;
    } else {
      // Insert new food
      console.log(`[FoodDB] Inserting new food: ${food.name}`);
      savedFood = {
        id: food.id || `food-${Date.now()}`,
        name: food.name || 'Unknown',
        serving_amount: food.serving_amount || 100,
        serving_unit: food.serving_unit || 'g',
        calories: food.calories || 0,
        protein: food.protein || 0,
        carbs: food.carbs || 0,
        fats: food.fats || 0,
        fiber: food.fiber || 0,
        user_created: food.user_created || false,
        is_favorite: food.is_favorite || false,
        ...food,
      } as Food;
      foods.push(savedFood);
    }
    
    await AsyncStorage.setItem(FOODS_STORAGE_KEY, JSON.stringify(foods));
    console.log(`[FoodDB] Food saved successfully: ${savedFood.id}`);
    
    return savedFood;
  } catch (error) {
    console.error('[FoodDB] Error upserting food:', error);
    // CRITICAL: Return a valid food object even on error
    return {
      id: food.id || `food-error-${Date.now()}`,
      name: food.name || 'Unknown',
      serving_amount: food.serving_amount || 100,
      serving_unit: food.serving_unit || 'g',
      calories: food.calories || 0,
      protein: food.protein || 0,
      carbs: food.carbs || 0,
      fats: food.fats || 0,
      fiber: food.fiber || 0,
      user_created: food.user_created || false,
      is_favorite: food.is_favorite || false,
    } as Food;
  }
}

/**
 * Get food by ID from internal database
 * CRITICAL: Never throws, returns null on error
 */
export async function getFoodById(id: string): Promise<Food | null> {
  try {
    const foods = await getAllFoods();
    return foods.find(food => food.id === id) || null;
  } catch (error) {
    console.error('[FoodDB] Error getting food by ID:', error);
    return null;
  }
}

/**
 * Get recent foods from user's actual diary entries
 * Returns last N unique foods the user logged, ordered by most recent.
 * Uses a two-step DB approach for elite deduplication:
 *   Step 1 – lightweight meal_items scan to collect unique food_item_ids in recency order
 *   Step 2 – single IN query on food_items for full canonical data + standard-portion macros
 * CRITICAL: Never throws, returns empty array on error
 */
export async function getRecentFoods(limit: number = 20): Promise<Food[]> {
  try {
    console.log('[FoodDB] Fetching recent foods (two-step elite dedup)...');

    // ── Auth ──────────────────────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('[FoodDB] No user logged in, returning empty array');
      return [];
    }

    // ── Step 1: lightweight scan – collect unique food_item_ids in recency order ──
    const { data: mealItems, error: step1Error } = await supabase
      .from('meal_items')
      .select(`
        id,
        food_id,
        food_item_id,
        serving_description,
        grams,
        calories,
        protein,
        carbs,
        fats,
        fiber,
        created_at,
        food_name,
        food_brand,
        foods (
          id,
          name,
          brand,
          barcode,
          serving_amount,
          serving_unit,
          calories,
          protein,
          carbs,
          fats,
          fiber,
          user_created
        ),
        meals!inner (
          user_id
        )
      `)
      .eq('meals.user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (step1Error) {
      console.error('[FoodDB] Step 1 error:', step1Error);
      return [];
    }

    if (!mealItems || mealItems.length === 0) {
      console.log('[FoodDB] No recent meal items found');
      return [];
    }

    console.log(`[FoodDB] Step 1: scanned ${mealItems.length} meal items`);

    // Collect unique food_item_ids in recency order (first appearance wins)
    const seenFoodItemIds = new Set<string>();
    const orderedFoodItemIds: string[] = [];

    // Also collect legacy items (no food_item_id) for fallback, deduped by food_id
    const seenLegacyFoodIds = new Set<string>();
    type LegacyItem = typeof mealItems[number];
    const legacyItems: LegacyItem[] = [];

    for (const item of mealItems) {
      const fid: string | null = (item as any).food_item_id ?? null;

      if (fid) {
        if (!seenFoodItemIds.has(fid)) {
          seenFoodItemIds.add(fid);
          orderedFoodItemIds.push(fid);
        }
      } else {
        // Legacy item: no food_item_id — deduplicate by food_id or item id
        const legacyKey: string = item.food_id ?? item.id;
        if (!seenLegacyFoodIds.has(legacyKey)) {
          seenLegacyFoodIds.add(legacyKey);
          legacyItems.push(item);
        }
      }

      // Stop scanning once we have enough candidates
      const totalFound = orderedFoodItemIds.length + legacyItems.length;
      if (totalFound >= limit * 3) break; // over-fetch to allow trimming later
    }

    console.log(
      `[FoodDB] Step 1 result: ${orderedFoodItemIds.length} unique food_item_ids, ` +
      `${legacyItems.length} legacy items`
    );

    // ── Step 2: fetch full food_items rows for all collected ids ─────────────
    let foodItemMap = new Map<string, Record<string, any>>();

    if (orderedFoodItemIds.length > 0) {
      const { data: foodItemRows, error: step2Error } = await supabase
        .from('food_items')
        .select('id, name, brand, barcode, serving_size, serving_unit, serving_description, serving_count, calories, protein, carbs, fat, fiber, macros_per, off_data, nutriments, source')
        .in('id', orderedFoodItemIds);

      if (step2Error) {
        console.error('[FoodDB] Step 2 error:', step2Error);
        // Continue — we can still return legacy items
      } else if (foodItemRows) {
        console.log(`[FoodDB] Step 2: fetched ${foodItemRows.length} food_items rows`);
        for (const row of foodItemRows) {
          foodItemMap.set(row.id, row);
        }
      }
    }

    // ── Build Food[] from food_item_id path (standard portion) ───────────────
    const results: Food[] = [];

    for (const fid of orderedFoodItemIds) {
      if (results.length >= limit) break;

      const fi = foodItemMap.get(fid);
      if (!fi) {
        // food_items row missing — skip (orphaned reference)
        console.log(`[FoodDB] food_item_id ${fid} not found in step-2 result, skipping`);
        continue;
      }

      const servingSize = Number(fi.serving_size) || 0;

      // Compute macros for exactly 1 standard serving
      let calories: number, protein: number, carbs: number, fats: number, fiber: number;

      if (servingSize > 0) {
        const result = calcMacros(fi, servingSize);
        calories = result.calories;
        protein  = result.protein;
        carbs    = result.carbs;
        fats     = result.fat;
        fiber    = result.fiber;
        console.log(
          `[FoodDB] ✅ standard portion "${fi.name ?? 'unknown'}": ` +
          `serving_size=${servingSize}g, macros_per=${fi.macros_per ?? 'serving'}, ` +
          `cal=${calories}, protein=${protein}, carbs=${carbs}, fat=${fats}`
        );
      } else {
        // serving_size is 0 or missing — fall back to stored per-serving values
        calories = Number(fi.calories) || 0;
        protein  = Number(fi.protein)  || 0;
        carbs    = Number(fi.carbs)    || 0;
        fats     = Number(fi.fat)      || 0;
        fiber    = Number(fi.fiber)    || 0;
        console.log(
          `[FoodDB] ⚠️ serving_size=0 for "${fi.name ?? 'unknown'}", using stored values: ` +
          `cal=${calories}, protein=${protein}, carbs=${carbs}, fat=${fats}`
        );
      }

      // ── Serving display string ──────────────────────────────────────────────
      let displayServingUnit: string;
      let servingGramsForDisplay: number = servingSize || 100;

      if (fi.serving_description) {
        const servingCount = Number(fi.serving_count) || 1;
        const gramsPerUnit = servingSize > 0 ? servingSize / servingCount : 100;
        servingGramsForDisplay = servingSize > 0 ? servingSize : 100;
        const countLabel = servingCount > 1 ? `${servingCount} ` : '1 ';
        displayServingUnit = `${countLabel}${fi.serving_description} (${servingSize > 0 ? servingSize : 100} g)`;
        console.log(`[FoodDB] serving_description="${fi.serving_description}" count=${servingCount} gramsPerUnit=${gramsPerUnit} for "${fi.name}"`);
      } else if (fi.off_data) {
        const offProduct = fi.off_data || {
          serving_size: fi.serving_size ? String(fi.serving_size) : undefined,
        };
        const servingInfo = extractServingSize(offProduct);
        servingGramsForDisplay = servingInfo.grams;
        displayServingUnit = servingInfo.displayText;
      } else {
        displayServingUnit = servingSize > 0 ? `${servingSize}g` : '100g';
      }

      const food: Food = {
        id: fi.id,
        name: fi.name ?? 'Unknown Food',
        brand: fi.brand ?? undefined,
        barcode: fi.barcode ?? undefined,
        serving_amount: servingGramsForDisplay,
        serving_unit: displayServingUnit,
        calories,
        protein,
        carbs,
        fats,
        fiber,
        user_created: false,
        is_favorite: false,
        last_serving_description: undefined,
        food_item_id: fi.id,
      };

      results.push(food);
    }

    // ── Legacy fallback: items without food_item_id ───────────────────────────
    for (const item of legacyItems) {
      if (results.length >= limit) break;

      const hasFoodsRow = !!(item.foods && item.food_id);
      if (!hasFoodsRow && !(item as any).food_name) continue;

      const loggedGrams = item.grams ?? 100;
      const calories = item.calories ?? 0;
      const protein  = item.protein  ?? 0;
      const carbs    = item.carbs    ?? 0;
      const fats     = item.fats     ?? 0;
      const fiber    = item.fiber    ?? 0;

      const foodName  = (item as any).food_name  ?? item.foods?.name  ?? 'Unknown Food';
      const foodBrand = (item as any).food_brand ?? item.foods?.brand ?? undefined;

      const loggedServingDesc = item.serving_description || null;
      const displayServingUnit = (loggedServingDesc && loggedServingDesc.trim().length > 0)
        ? loggedServingDesc
        : `${Math.round(loggedGrams)}g`;

      console.log(
        `[FoodDB] ⚠️ legacy fallback for "${foodName}": ` +
        `cal=${calories}, protein=${protein}, carbs=${carbs}, fat=${fats}`
      );

      const food: Food = {
        id: item.foods?.id ?? item.food_id ?? item.id,
        name: foodName,
        brand: foodBrand,
        barcode: item.foods?.barcode ?? undefined,
        serving_amount: loggedGrams,
        serving_unit: displayServingUnit,
        calories,
        protein,
        carbs,
        fats,
        fiber,
        user_created: item.foods?.user_created || false,
        is_favorite: false,
        last_serving_description: item.serving_description || undefined,
        food_item_id: undefined,
      };

      results.push(food);
    }

    console.log(`[FoodDB] Returning ${results.length} unique recent foods`);
    return results;
  } catch (error) {
    console.error('[FoodDB] Error getting recent foods:', error);
    return [];
  }
}

/**
 * Get favorite foods
 * CRITICAL: Never throws, returns empty array on error
 */
export async function getFavoriteFoods(): Promise<Food[]> {
  try {
    const foods = await getAllFoods();
    return foods.filter(food => food.is_favorite);
  } catch (error) {
    console.error('[FoodDB] Error getting favorite foods:', error);
    return [];
  }
}

/**
 * Get or create meal for a specific date and meal type
 * CRITICAL: Never throws, returns a valid Meal object
 */
async function getOrCreateMeal(date: string, mealType: MealType): Promise<Meal> {
  try {
    const mealsData = await AsyncStorage.getItem(MEALS_STORAGE_KEY);
    const meals: Meal[] = mealsData ? JSON.parse(mealsData) : [];
    
    // Find existing meal
    let meal = meals.find(m => m.date === date && m.meal_type === mealType);
    
    if (!meal) {
      // Create new meal
      meal = {
        id: `meal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        user_id: 'user-1', // In a real app, get from auth context
        date,
        meal_type: mealType,
      };
      meals.push(meal);
      await AsyncStorage.setItem(MEALS_STORAGE_KEY, JSON.stringify(meals));
      console.log(`[FoodDB] Created new meal: ${meal.id}`);
    }
    
    return meal;
  } catch (error) {
    console.error('[FoodDB] Error getting or creating meal:', error);
    // CRITICAL: Return a valid meal object even on error
    return {
      id: `meal-error-${Date.now()}`,
      user_id: 'user-1',
      date,
      meal_type: mealType,
    };
  }
}

/**
 * Add a meal item (for AI-estimated items or custom items)
 * CRITICAL: Never throws, returns a valid MealItem object
 */
export async function addMealItem(params: {
  mealType: string;
  date: string;
  foodName: string;
  servingDescription: string;
  quantity: number;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
}): Promise<MealItem> {
  try {
    console.log('[FoodDB] Adding meal item:', params.foodName);
    
    // Get or create the meal
    const meal = await getOrCreateMeal(params.date, params.mealType as MealType);
    
    // Create a custom food entry for this item
    const customFood: Food = {
      id: `food-custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: params.foodName,
      serving_amount: 1,
      serving_unit: params.servingDescription,
      calories: params.calories,
      protein: params.protein,
      carbs: params.carbs,
      fats: params.fats,
      fiber: params.fiber,
      user_created: true,
      is_favorite: false,
    };
    
    // Save the custom food
    await upsertFood(customFood);
    
    // Create the meal item
    const mealItem: MealItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      meal_id: meal.id,
      food_id: customFood.id,
      food: customFood,
      quantity: params.quantity,
      calories: params.calories * params.quantity,
      protein: params.protein * params.quantity,
      carbs: params.carbs * params.quantity,
      fats: params.fats * params.quantity,
      fiber: params.fiber * params.quantity,
    };
    
    // Save the meal item
    const itemsData = await AsyncStorage.getItem(MEAL_ITEMS_STORAGE_KEY);
    const items: MealItem[] = itemsData ? JSON.parse(itemsData) : [];
    items.push(mealItem);
    await AsyncStorage.setItem(MEAL_ITEMS_STORAGE_KEY, JSON.stringify(items));
    
    console.log('[FoodDB] Meal item added successfully:', mealItem.id);
    return mealItem;
  } catch (error) {
    console.error('[FoodDB] Error adding meal item:', error);
    // CRITICAL: Return a valid meal item even on error
    const errorFood: Food = {
      id: `food-error-${Date.now()}`,
      name: params.foodName,
      serving_amount: 1,
      serving_unit: params.servingDescription,
      calories: params.calories,
      protein: params.protein,
      carbs: params.carbs,
      fats: params.fats,
      fiber: params.fiber,
      user_created: true,
      is_favorite: false,
    };
    
    return {
      id: `item-error-${Date.now()}`,
      meal_id: `meal-error-${Date.now()}`,
      food_id: errorFood.id,
      food: errorFood,
      quantity: params.quantity,
      calories: params.calories * params.quantity,
      protein: params.protein * params.quantity,
      carbs: params.carbs * params.quantity,
      fats: params.fats * params.quantity,
      fiber: params.fiber * params.quantity,
    };
  }
}

/**
 * Update daily summary for a specific date
 * CRITICAL: Never throws
 */
export async function updateDailySummary(date: string): Promise<void> {
  try {
    console.log('[FoodDB] Updating daily summary for:', date);
    
    // Get all meals for this date
    const mealsData = await AsyncStorage.getItem(MEALS_STORAGE_KEY);
    const meals: Meal[] = mealsData ? JSON.parse(mealsData) : [];
    const todayMeals = meals.filter(m => m.date === date);
    
    // Get all meal items for today's meals
    const itemsData = await AsyncStorage.getItem(MEAL_ITEMS_STORAGE_KEY);
    const allItems: MealItem[] = itemsData ? JSON.parse(itemsData) : [];
    const todayItems = allItems.filter(item => 
      todayMeals.some(meal => meal.id === item.meal_id)
    );
    
    // Calculate totals
    const totals = todayItems.reduce(
      (acc, item) => ({
        calories: acc.calories + item.calories,
        protein: acc.protein + item.protein,
        carbs: acc.carbs + item.carbs,
        fats: acc.fats + item.fats,
        fiber: acc.fiber + item.fiber,
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 }
    );
    
    // Get existing daily summary
    const summaryData = await AsyncStorage.getItem(DAILY_SUMMARY_STORAGE_KEY);
    const summaries: DailySummary[] = summaryData ? JSON.parse(summaryData) : [];
    
    // Find or create summary for this date
    let summaryIndex = summaries.findIndex(s => s.date === date);
    
    if (summaryIndex >= 0) {
      // Update existing summary
      summaries[summaryIndex] = {
        ...summaries[summaryIndex],
        total_calories: totals.calories,
        total_protein: totals.protein,
        total_carbs: totals.carbs,
        total_fats: totals.fats,
        total_fiber: totals.fiber,
      };
    } else {
      // Create new summary
      summaries.push({
        id: `summary-${Date.now()}`,
        user_id: 'user-1', // In a real app, get from auth context
        date,
        total_calories: totals.calories,
        total_protein: totals.protein,
        total_carbs: totals.carbs,
        total_fats: totals.fats,
        total_fiber: totals.fiber,
        water_ml: 0,
      });
    }
    
    await AsyncStorage.setItem(DAILY_SUMMARY_STORAGE_KEY, JSON.stringify(summaries));
    console.log('[FoodDB] Daily summary updated successfully');
  } catch (error) {
    console.error('[FoodDB] Error updating daily summary:', error);
    // CRITICAL: Do not throw, app must continue
  }
}
