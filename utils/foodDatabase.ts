
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
 * Returns last N unique foods the user logged, ordered by most recent
 * CRITICAL: Never throws, returns empty array on error
 */
export async function getRecentFoods(limit: number = 20): Promise<Food[]> {
  try {
    console.log('[FoodDB] Fetching recent foods from user diary...');
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('[FoodDB] No user logged in, returning empty array');
      return [];
    }

    // Query user's meal items with food details, ordered by most recent
    const { data: mealItems, error } = await supabase
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
        food_items!food_item_id (
          id,
          name,
          brand,
          serving_size,
          serving_unit,
          serving_quantity,
          serving_description,
          serving_count,
          calories,
          protein,
          carbs,
          fat,
          nutriments,
          off_data
        ),
        meals!inner (
          user_id
        )
      `)
      .eq('meals.user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(300); // Get more than we need to allow for deduplication

    if (error) {
      console.error('[FoodDB] Error fetching recent foods:', error);
      return [];
    }

    if (!mealItems || mealItems.length === 0) {
      console.log('[FoodDB] No recent foods found');
      return [];
    }

    console.log(`[FoodDB] Found ${mealItems.length} meal items`);

    // Deduplicate: prefer food_item_id, but also track food_id so the same
    // physical food doesn't get two slots when logged via different paths.
    const seenFoodItemIds = new Set<string>();
    const seenFoodIds = new Set<string>();
    const uniqueFoods: Food[] = [];

    for (const item of mealItems) {
      const fi = (item as any).food_items;
      const hasBarcode = fi != null;
      const hasFoodItemId = !!(item as any).food_item_id;
      const hasFoodsRow = !!(item.foods && item.food_id);

      // Skip only if we have absolutely nothing to build a Food object from
      if (!hasBarcode && !hasFoodsRow && !hasFoodItemId) continue;

      const fid: string | undefined = (item as any).food_item_id || undefined;
      const foid: string | undefined = item.food_id || undefined;

      // If this food_item_id was already seen, skip
      if (fid && seenFoodItemIds.has(fid)) continue;
      // If this food_id was already seen (by any key), skip
      if (foid && seenFoodIds.has(foid)) continue;

      // Mark both as seen
      if (fid) seenFoodItemIds.add(fid);
      if (foid) seenFoodIds.add(foid);

      // If we have food_item_id but the join returned null, fall back to logged macro values
      if (hasFoodItemId && !hasBarcode && !hasFoodsRow) {
        console.log(`[FoodDB] food_item_id join fallback for item ${(item as any).food_item_id}, using logged values`);
        const fallbackFood: Food = {
          id: (item as any).food_item_id,
          name: 'Scanned Food',
          brand: undefined,
          barcode: undefined,
          serving_amount: item.grams ?? 100,
          serving_unit: item.serving_description || 'g',
          calories: item.calories ?? 0,
          protein: item.protein ?? 0,
          carbs: item.carbs ?? 0,
          fats: item.fats ?? 0,
          fiber: item.fiber ?? 0,
          user_created: false,
          is_favorite: false,
          last_serving_description: item.serving_description || undefined,
          food_item_id: (item as any).food_item_id,
        };
        uniqueFoods.push(fallbackFood);
        if (uniqueFoods.length >= limit) break;
        continue;
      }

      // Build base Food object from the foods catalog row (may be null for barcode-only items)
      // The foods table stores per-100g values (serving_amount=100, serving_unit='g'),
      // so we use the actual logged serving_description and grams from the meal_item instead.
      const loggedGrams = item.grams ?? item.foods?.serving_amount ?? 100;
      const loggedServingDesc = item.serving_description || null;

      // Use the logged serving_description as the display unit (e.g. "1 slice", "2 pieces", "28 g").
      // Fall back to a plain gram string if no description was stored.
      let displayServingUnit: string;
      if (loggedServingDesc && loggedServingDesc.trim().length > 0) {
        displayServingUnit = loggedServingDesc;
      } else {
        displayServingUnit = `${Math.round(loggedGrams)}g`;
      }

      // Scale macros from per-100g catalog values to the actual logged grams.
      const multiplier = loggedGrams / 100;
      const scaledCalories = Math.round((item.foods?.calories ?? 0) * multiplier);
      const scaledProtein = Math.round((item.foods?.protein ?? 0) * multiplier * 10) / 10;
      const scaledCarbs = Math.round((item.foods?.carbs ?? 0) * multiplier * 10) / 10;
      const scaledFats = Math.round((item.foods?.fats ?? 0) * multiplier * 10) / 10;
      const scaledFiber = Math.round((item.foods?.fiber ?? 0) * multiplier * 10) / 10;

      console.log(
        `[FoodDB] foods-table item "${item.foods?.name ?? 'unknown'}": ` +
        `grams=${loggedGrams}, serving="${displayServingUnit}", ` +
        `cal=${scaledCalories}, protein=${scaledProtein}, carbs=${scaledCarbs}, fat=${scaledFats}`
      );

      let food: Food = {
        id: item.foods?.id ?? fi?.id ?? '',
        name: item.foods?.name ?? fi?.name ?? '',
        brand: item.foods?.brand ?? fi?.brand ?? undefined,
        barcode: item.foods?.barcode ?? undefined,
        serving_amount: loggedGrams,
        serving_unit: displayServingUnit,
        calories: scaledCalories,
        protein: scaledProtein,
        carbs: scaledCarbs,
        fats: scaledFats,
        fiber: scaledFiber,
        user_created: item.foods?.user_created || false,
        is_favorite: false,
        // Store the last used serving description for display only
        last_serving_description: loggedServingDesc || undefined,
        // Carry through the catalog ID so logFoodUsage gets the right table's ID
        food_item_id: (item as any).food_item_id ?? undefined,
      };

      if (hasBarcode) {
        // food_items (barcode scan): use per-serving values from nutriments when available
        const nutriments = fi.nutriments || {};
        const servingGrams = Number(fi.serving_size) || 100;

        const calPerServing =
          nutriments['energy-kcal_serving'] != null
            ? nutriments['energy-kcal_serving']
            : nutriments['energy-kcal_100g'] != null
            ? (nutriments['energy-kcal_100g'] * servingGrams) / 100
            : fi.calories ?? 0;

        const proteinPerServing =
          nutriments['proteins_serving'] != null
            ? nutriments['proteins_serving']
            : nutriments['proteins_100g'] != null
            ? (nutriments['proteins_100g'] * servingGrams) / 100
            : fi.protein ?? 0;

        const carbsPerServing =
          nutriments['carbohydrates_serving'] != null
            ? nutriments['carbohydrates_serving']
            : nutriments['carbohydrates_100g'] != null
            ? (nutriments['carbohydrates_100g'] * servingGrams) / 100
            : fi.carbs ?? 0;

        const fatPerServing =
          nutriments['fat_serving'] != null
            ? nutriments['fat_serving']
            : nutriments['fat_100g'] != null
            ? (nutriments['fat_100g'] * servingGrams) / 100
            : fi.fat ?? 0;

        const fiberPerServing =
          nutriments['fiber_serving'] != null
            ? nutriments['fiber_serving']
            : nutriments['fiber_100g'] != null
            ? (nutriments['fiber_100g'] * servingGrams) / 100
            : 0;

        console.log(
          `[FoodDB] Barcode food "${fi.name}": serving=${servingGrams}g, ` +
          `cal=${Math.round(calPerServing)}, protein=${Math.round(proteinPerServing * 10) / 10}, ` +
          `carbs=${Math.round(carbsPerServing * 10) / 10}, fat=${Math.round(fatPerServing * 10) / 10}`
        );

        // Use serving_description column directly when available (no regex needed).
        // Fall back to extractServingSize from off_data for older rows without it.
        let servingGramsForDisplay: number;
        let servingDisplayText: string;

        if (fi.serving_description) {
          // New path: serving_description is the human-readable label (e.g. "cookie")
          // serving_count tells us how many units make up serving_size grams.
          const servingCount = Number(fi.serving_count) || 1;
          const gramsPerUnit = servingGrams / servingCount;
          servingGramsForDisplay = gramsPerUnit;
          const countLabel = servingCount > 1 ? `${servingCount} ` : '1 ';
          servingDisplayText = `${countLabel}${fi.serving_description} (${servingGrams} g)`;
          console.log(`[FoodDB] Using serving_description="${fi.serving_description}" serving_count=${servingCount} gramsPerUnit=${gramsPerUnit} for "${fi.name}"`);
        } else {
          // Legacy path: parse off_data with regex
          const offProduct = fi.off_data || {
            serving_size: fi.serving_size ? String(fi.serving_size) : undefined,
            serving_quantity: fi.serving_quantity ? String(fi.serving_quantity) : undefined,
          };
          const servingInfo = extractServingSize(offProduct);
          servingGramsForDisplay = servingInfo.grams;
          servingDisplayText = servingInfo.displayText;
        }

        food = {
          ...food,
          id: fi.id,
          name: fi.name,
          brand: fi.brand ?? undefined,
          serving_amount: servingGramsForDisplay,
          serving_unit: servingDisplayText,
          calories: Math.round(calPerServing),
          protein: Math.round(proteinPerServing * 10) / 10,
          carbs: Math.round(carbsPerServing * 10) / 10,
          fats: Math.round(fatPerServing * 10) / 10,
          fiber: Math.round(fiberPerServing * 10) / 10,
        };
      }
      // else: foods table (per-100g catalog / user-created) — macros already scaled above

      uniqueFoods.push(food);

      // Stop once we have enough unique foods
      if (uniqueFoods.length >= limit) break;
    }

    console.log(`[FoodDB] Returning ${uniqueFoods.length} unique recent foods`);
    return uniqueFoods;
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
