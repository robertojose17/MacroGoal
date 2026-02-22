
/**
 * Favorites Database Management
 * Handles CRUD operations for favorite foods
 */

import { supabase } from '@/app/integrations/supabase/client';

export interface Favorite {
  id: string;
  user_id: string;
  food_source: 'library' | 'barcode' | 'quickadd' | 'custom';
  food_code?: string;
  food_name: string;
  brand?: string;
  per100_calories: number;
  per100_protein: number;
  per100_carbs: number;
  per100_fat: number;
  per100_fiber: number;
  serving_size?: string;
  serving_unit?: string;
  default_grams: number;
  created_at: string;
  updated_at?: string;
}

/**
 * Generate a unique food code for foods without a barcode
 * This ensures the unique constraint works properly
 */
function generateFoodCode(foodName: string, brand?: string): string {
  const normalized = `${foodName}_${brand || 'no-brand'}`.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `library_${normalized}`;
}

/**
 * Get the food code to use for favorites
 * For barcode foods: use the barcode
 * For library foods: generate a unique code from name + brand
 */
function getFoodCodeForFavorite(foodSource: string, foodCode: string | undefined, foodName: string, brand?: string): string {
  if (foodCode) {
    return foodCode;
  }
  // For library foods without a barcode, generate a unique code
  return generateFoodCode(foodName, brand);
}

/**
 * Check if a food is favorited
 */
export async function isFavorite(
  userId: string,
  foodSource: string,
  foodCode: string | undefined,
  foodName?: string,
  brand?: string
): Promise<boolean> {
  try {
    const actualFoodCode = getFoodCodeForFavorite(foodSource, foodCode, foodName || '', brand);

    console.log('[Favorites] Checking if favorite:', { foodSource, actualFoodCode });

    const { data, error } = await supabase
      .from('favorites')
      .select('id')
      .eq('user_id', userId)
      .eq('food_source', foodSource)
      .eq('food_code', actualFoodCode)
      .maybeSingle();

    if (error) {
      console.error('[Favorites] Error checking favorite:', error);
      return false;
    }

    const result = !!data;
    console.log('[Favorites] Is favorite:', result);
    return result;
  } catch (error) {
    console.error('[Favorites] Error in isFavorite:', error);
    return false;
  }
}

/**
 * Add a food to favorites
 */
export async function addFavorite(favorite: Omit<Favorite, 'id' | 'created_at' | 'updated_at'>): Promise<Favorite | null> {
  try {
    console.log('[Favorites] Adding favorite:', favorite.food_name);

    // Get the actual food code to use (generate one if needed)
    const actualFoodCode = getFoodCodeForFavorite(
      favorite.food_source,
      favorite.food_code,
      favorite.food_name,
      favorite.brand
    );

    console.log('[Favorites] Using food_code:', actualFoodCode);

    // Use upsert to handle duplicates gracefully
    const { data, error } = await supabase
      .from('favorites')
      .upsert(
        {
          user_id: favorite.user_id,
          food_source: favorite.food_source,
          food_code: actualFoodCode,
          food_name: favorite.food_name,
          brand: favorite.brand || null,
          per100_calories: favorite.per100_calories,
          per100_protein: favorite.per100_protein,
          per100_carbs: favorite.per100_carbs,
          per100_fat: favorite.per100_fat,
          per100_fiber: favorite.per100_fiber,
          serving_size: favorite.serving_size || null,
          serving_unit: favorite.serving_unit || null,
          default_grams: favorite.default_grams,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,food_source,food_code',
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();

    if (error) {
      console.error('[Favorites] Error adding favorite:', error);
      throw error;
    }

    console.log('[Favorites] Favorite added successfully:', data.id);
    return data as Favorite;
  } catch (error) {
    console.error('[Favorites] Error in addFavorite:', error);
    throw error;
  }
}

/**
 * Remove a food from favorites using composite key
 */
export async function removeFavorite(
  userId: string,
  foodSource: string,
  foodCode: string | undefined,
  foodName?: string,
  brand?: string
): Promise<boolean> {
  try {
    const actualFoodCode = getFoodCodeForFavorite(foodSource, foodCode, foodName || '', brand);

    console.log('[Favorites] Removing favorite by composite key:', { 
      userId, 
      foodSource, 
      actualFoodCode 
    });

    const { data, error, count } = await supabase
      .from('favorites')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('food_source', foodSource)
      .eq('food_code', actualFoodCode)
      .select();

    if (error) {
      console.error('[Favorites] Error removing favorite:', error);
      throw error;
    }

    // According to requirements: treat "0 rows affected" as success
    // The item is already gone, which is the desired state
    if (!count || count === 0) {
      console.log('[Favorites] No rows deleted (item already removed or not found) - treating as success');
      return true;
    }

    console.log('[Favorites] Favorite removed successfully, rows affected:', count);
    return true;
  } catch (error) {
    console.error('[Favorites] Error in removeFavorite:', error);
    throw error;
  }
}

/**
 * Remove a favorite by ID
 * This is the preferred method when you have the favorite ID
 */
export async function removeFavoriteById(favoriteId: string): Promise<boolean> {
  try {
    console.log('[Favorites] Removing favorite by ID:', favoriteId);

    const { data, error, count } = await supabase
      .from('favorites')
      .delete({ count: 'exact' })
      .eq('id', favoriteId)
      .select();

    if (error) {
      console.error('[Favorites] Error removing favorite by ID:', error);
      throw error;
    }

    // According to requirements: treat "0 rows affected" as success
    // The item is already gone, which is the desired state
    if (!count || count === 0) {
      console.log('[Favorites] No rows deleted (item already removed or not found) - treating as success');
      return true;
    }

    console.log('[Favorites] Favorite removed successfully by ID, rows affected:', count);
    return true;
  } catch (error) {
    console.error('[Favorites] Error in removeFavoriteById:', error);
    throw error;
  }
}

/**
 * Get all favorites for a user
 */
export async function getFavorites(userId: string): Promise<Favorite[]> {
  try {
    console.log('[Favorites] Getting favorites for user:', userId);

    const { data, error } = await supabase
      .from('favorites')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Favorites] Error getting favorites:', error);
      throw error;
    }

    console.log('[Favorites] Found', data.length, 'favorites');
    return data as Favorite[];
  } catch (error) {
    console.error('[Favorites] Error in getFavorites:', error);
    return [];
  }
}

/**
 * Toggle favorite status
 */
export async function toggleFavorite(
  userId: string,
  foodSource: string,
  foodCode: string | undefined,
  foodData: {
    food_name: string;
    brand?: string;
    per100_calories: number;
    per100_protein: number;
    per100_carbs: number;
    per100_fat: number;
    per100_fiber: number;
    serving_size?: string;
    serving_unit?: string;
    default_grams: number;
  }
): Promise<boolean> {
  try {
    // Check if already favorited
    const isAlreadyFavorite = await isFavorite(userId, foodSource, foodCode, foodData.food_name, foodData.brand);

    if (isAlreadyFavorite) {
      // Remove from favorites
      console.log('[Favorites] Removing from favorites (toggle OFF)');
      await removeFavorite(userId, foodSource, foodCode, foodData.food_name, foodData.brand);
      return false; // Return false to indicate it's no longer favorited
    } else {
      // Add to favorites
      console.log('[Favorites] Adding to favorites (toggle ON)');
      await addFavorite({
        user_id: userId,
        food_source: foodSource as 'library' | 'barcode' | 'quickadd' | 'custom',
        food_code: foodCode,
        ...foodData,
      });
      return true; // Return true to indicate it's now favorited
    }
  } catch (error) {
    console.error('[Favorites] Error in toggleFavorite:', error);
    throw error;
  }
}
