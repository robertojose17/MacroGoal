
import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_KEY = '@my_meals_draft';

export interface DraftItem {
  tempId: string;
  food_id: string;
  food_name: string;
  food_brand?: string;
  serving_amount: number;
  serving_unit: string;
  servings_count: number;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
}

/**
 * Save draft items to AsyncStorage
 */
export async function saveDraft(items: DraftItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(items));
    console.log('[MyMealsDraft] Draft saved:', items.length, 'items');
  } catch (error) {
    console.error('[MyMealsDraft] Error saving draft:', error);
  }
}

/**
 * Load draft items from AsyncStorage
 */
export async function loadDraft(): Promise<DraftItem[]> {
  try {
    const data = await AsyncStorage.getItem(DRAFT_KEY);
    if (data) {
      const items = JSON.parse(data);
      console.log('[MyMealsDraft] Draft loaded:', items.length, 'items');
      return items;
    }
    return [];
  } catch (error) {
    console.error('[MyMealsDraft] Error loading draft:', error);
    return [];
  }
}

/**
 * Clear draft items from AsyncStorage
 */
export async function clearDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DRAFT_KEY);
    console.log('[MyMealsDraft] Draft cleared');
  } catch (error) {
    console.error('[MyMealsDraft] Error clearing draft:', error);
  }
}

/**
 * Add a food item to the draft
 */
export async function addToDraft(item: Omit<DraftItem, 'tempId'>): Promise<void> {
  try {
    const currentDraft = await loadDraft();
    const newItem: DraftItem = {
      ...item,
      tempId: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    const updatedDraft = [...currentDraft, newItem];
    await saveDraft(updatedDraft);
    console.log('[MyMealsDraft] Item added to draft');
  } catch (error) {
    console.error('[MyMealsDraft] Error adding to draft:', error);
  }
}
