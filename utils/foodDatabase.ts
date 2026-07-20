
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
 * Uses a single query joining meal_items → food_items and meal_items → foods,
 * with macros and serving display reset to the food's default serving.
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

    // ── Step 1: scan recent meal_items with full food data joined ────────────
    const { data: mealItems, error: step1Error } = await supabase
      .from('meal_items')
      .select(`
        id,
        food_item_id,
        food_id,
        serving_description,
        quantity,
        grams,
        created_at,
        meals!inner (
          user_id
        ),
        food_items:food_item_id (
          id, name, brand, barcode,
          serving_size, serving_unit, serving_description,
          serving_count, serving_quantity, calories, protein, carbs, fat, fiber,
          macros_per, off_data
        ),
        foods:food_id (
          id, name, brand,
          serving_amount, serving_unit,
          calories, protein, carbs, fats, fiber
        )
      `)
      .eq('meals.user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(300);

    if (step1Error) {
      console.error('[FoodDB] getRecentFoods: step 1 error:', step1Error);
      return [];
    }

    if (!mealItems || mealItems.length === 0) {
      console.log('[FoodDB] getRecentFoods: no meal items found, returning []');
      return [];
    }

    // Build Food[] in recency order, deduplicating by food_item_id or food_id
    const results: Food[] = [];
    const seenKeys = new Set<string>();

    for (const item of mealItems as any[]) {
      if (results.length >= limit) break;

      const fi = item.food_items ?? null;
      const f  = item.foods ?? null;

      if (fi) {
        const key = `fi:${fi.id}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        // serving_size IS total grams of one standard serving
        // serving_quantity is an alias for the same value in some rows
        const servingSize = Number(fi.serving_size) || Number(fi.serving_quantity) || 0;

        let macroCalories: number, macroProtein: number, macroCarbs: number, macroFats: number, macroFiber: number;

        if (servingSize > 0) {
          const macroResult = calcMacros(fi, servingSize);
          macroCalories = macroResult.calories;
          macroProtein  = macroResult.protein;
          macroCarbs    = macroResult.carbs;
          macroFats     = macroResult.fat;
          macroFiber    = macroResult.fiber;
        } else {
          // No serving size info — use stored values directly (they are per-serving)
          macroCalories = Number(fi.calories) || 0;
          macroProtein  = Number(fi.protein)  || 0;
          macroCarbs    = Number(fi.carbs)    || 0;
          macroFats     = Number(fi.fat)      || 0;
          macroFiber    = Number(fi.fiber)    || 0;
        }

        const gramsLabel = servingSize > 0 ? `${servingSize}g` : '';

        let displayServingUnit: string;
        if (fi.serving_description) {
          const count = Number(fi.serving_count) || 1;
          const countLabel = count !== 1 ? `${count} ` : '1 ';
          displayServingUnit = gramsLabel
            ? `${countLabel}${fi.serving_description} (${gramsLabel})`
            : `${countLabel}${fi.serving_description}`;
        } else if (fi.serving_unit && fi.serving_unit.toLowerCase() !== 'g' && fi.serving_unit.toLowerCase() !== 'ml') {
          const count = Number(fi.serving_count) || 1;
          const countLabel = count !== 1 ? `${count} ` : '1 ';
          displayServingUnit = gramsLabel
            ? `${countLabel}${fi.serving_unit} (${gramsLabel})`
            : `${countLabel}${fi.serving_unit}`;
        } else {
          displayServingUnit = gramsLabel ? `1 serving (${gramsLabel})` : '1 serving';
        }

        results.push({
          id: fi.id,
          name: fi.name ?? 'Unknown Food',
          brand: fi.brand ?? undefined,
          barcode: fi.barcode ?? undefined,
          serving_amount: servingSize > 0 ? servingSize : 1,
          serving_unit: displayServingUnit,
          calories: macroCalories,
          protein: macroProtein,
          carbs: macroCarbs,
          fats: macroFats,
          fiber: macroFiber,
          user_created: false,
          is_favorite: false,
          food_item_id: fi.id,
          off_data: fi.off_data ?? undefined,
        });

      } else if (f) {
        const key = `f:${f.id}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        // foods table stores macros per-serving — use directly.
        // Prefer the food's own serving_amount; fall back to grams logged in this meal_item.
        const servingAmount = Number(f.serving_amount) || Number(item.grams) || 100;
        const servingUnit = (f.serving_unit || 'g').toLowerCase();

        // Prefer the serving_description saved at log time (e.g. "1 serving", "31 g")
        // over a generic reconstructed string.
        let displayServingUnit: string;
        if (item.serving_description && String(item.serving_description).trim()) {
          displayServingUnit = String(item.serving_description).trim();
        } else {
          displayServingUnit = `1 serving (${servingAmount}${servingUnit})`;
        }

        results.push({
          id: f.id,
          name: f.name ?? 'Unknown Food',
          brand: f.brand ?? undefined,
          serving_amount: servingAmount,
          serving_unit: displayServingUnit,
          calories: Number(f.calories) || 0,
          protein: Number(f.protein) || 0,
          carbs: Number(f.carbs) || 0,
          fats: Number(f.fats) || 0,
          fiber: Number(f.fiber) || 0,
          user_created: true,
          is_favorite: false,
          food_item_id: undefined,
        });
      }
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
