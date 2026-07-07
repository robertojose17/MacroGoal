
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
    console.log('[FoodDB] getRecentFoods: starting fetch');

    // ── Auth ──────────────────────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('[FoodDB] getRecentFoods: no user logged in, returning []');
      return [];
    }

    // ── Step 1: lightweight scan – collect unique food_item_ids in recency order ──
    console.log('[FoodDB] getRecentFoods: step 1 — querying meal_items');
    const { data: mealItems, error: step1Error } = await supabase
      .from('meal_items')
      .select(`
        id,
        food_item_id,
        created_at,
        meals!inner (
          user_id
        )
      `)
      .eq('meals.user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (step1Error) {
      console.error('[FoodDB] getRecentFoods: step 1 error:', step1Error);
      return [];
    }

    if (!mealItems || mealItems.length === 0) {
      console.log('[FoodDB] getRecentFoods: no meal items found, returning []');
      return [];
    }

    console.log(`[FoodDB] getRecentFoods: step 1 scanned ${mealItems.length} meal items`);

    // Collect up to `limit` unique non-null food_item_ids in recency order
    const seenFoodItemIds = new Set<string>();
    const orderedFoodItemIds: string[] = [];

    for (const item of mealItems) {
      if (orderedFoodItemIds.length >= limit) break;
      const fid: string | null = (item as any).food_item_id ?? null;
      if (!fid) continue; // skip AI-generated / legacy entries
      if (!seenFoodItemIds.has(fid)) {
        seenFoodItemIds.add(fid);
        orderedFoodItemIds.push(fid);
      }
    }

    console.log(`[FoodDB] getRecentFoods: step 1 found ${orderedFoodItemIds.length} unique food_item_ids`);

    if (orderedFoodItemIds.length === 0) {
      console.log('[FoodDB] getRecentFoods: no food_item_ids found, returning []');
      return [];
    }

    // ── Step 2: single IN query for all collected ids ─────────────────────────
    console.log('[FoodDB] getRecentFoods: step 2 — querying food_items IN', orderedFoodItemIds);
    const { data: foodItemRows, error: step2Error } = await supabase
      .from('food_items')
      .select('id, name, brand, barcode, serving_size, serving_unit, serving_description, serving_count, calories, protein, carbs, fat, fiber, macros_per, off_data, source')
      .in('id', orderedFoodItemIds);

    if (step2Error) {
      console.error('[FoodDB] getRecentFoods: step 2 error:', step2Error);
      return [];
    }

    console.log(`[FoodDB] getRecentFoods: step 2 fetched ${foodItemRows?.length ?? 0} food_items rows`);

    const foodItemMap = new Map<string, Record<string, any>>();
    for (const row of (foodItemRows ?? [])) {
      foodItemMap.set(row.id, row);
    }

    // ── Build Food[] in recency order ─────────────────────────────────────────
    const results: Food[] = [];

    for (const fid of orderedFoodItemIds) {
      if (results.length >= limit) break;

      const fi = foodItemMap.get(fid);
      if (!fi) {
        console.log(`[FoodDB] getRecentFoods: food_item_id ${fid} not found in step 2, skipping (orphaned ref)`);
        continue;
      }

      const servingSize = Number(fi.serving_size) || 100;

      // Compute macros for 1 standard serving
      let calories: number, protein: number, carbs: number, fats: number, fiber: number;

      if (servingSize > 0) {
        const result = calcMacros(fi, servingSize);
        calories = result.calories;
        protein  = result.protein;
        carbs    = result.carbs;
        fats     = result.fat;
        fiber    = result.fiber;
      } else {
        calories = Number(fi.calories) || 0;
        protein  = Number(fi.protein)  || 0;
        carbs    = Number(fi.carbs)    || 0;
        fats     = Number(fi.fat)      || 0;
        fiber    = Number(fi.fiber)    || 0;
      }

      // ── Serving display string ──────────────────────────────────────────────
      let displayServingUnit: string;
      const servingGramsForDisplay: number = servingSize > 0 ? servingSize : 100;

      if (fi.serving_description) {
        const servingCount = Number(fi.serving_count) || 1;
        const countLabel = servingCount !== 1 ? `${servingCount} ` : '1 ';
        displayServingUnit = `${countLabel}${fi.serving_description} (${servingGramsForDisplay}g)`;
      } else if (fi.serving_unit && fi.serving_unit.toLowerCase() !== 'g' && fi.serving_unit.toLowerCase() !== 'ml') {
        const servingCount = Number(fi.serving_count) || 1;
        const countLabel = servingCount !== 1 ? `${servingCount} ` : '1 ';
        displayServingUnit = `${countLabel}${fi.serving_unit} (${servingGramsForDisplay}g)`;
      } else {
        displayServingUnit = `1 serving (${servingGramsForDisplay}g)`;
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

      console.log(`[FoodDB] getRecentFoods: built food "${food.name}" cal=${calories} p=${protein} c=${carbs} f=${fats}`);
      results.push(food);
    }

    console.log(`[FoodDB] getRecentFoods: returning ${results.length} recent foods`);
    return results;
  } catch (error) {
    console.error('[FoodDB] getRecentFoods: unexpected error:', error);
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
