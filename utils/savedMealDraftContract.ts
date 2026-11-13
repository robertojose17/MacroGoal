import type { DraftItem } from './myMealsDraft';
import type { Database } from '@/lib/supabase/types';
type SavedItem = Omit<Database['public']['Tables']['saved_meal_items']['Insert'], 'saved_meal_id'>;
export function knownNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
/** Validate the whole batch before creating a parent or discarding local drafts. */
export function prepareSavedMealDraftItems(items: DraftItem[]): SavedItem[] {
  if (!items.length) throw Error('No foods to save.');
  return items.map(item => {
    if (!item || typeof item.food_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.food_id)) throw Error('A food is missing its verified catalog ID. Review it before saving; your draft is preserved.');
    if (!item.food_name?.trim() || !item.serving_unit?.trim() || !knownNonnegative(item.serving_amount) || item.serving_amount === 0 || !knownNonnegative(item.servings_count) || item.servings_count === 0 || ![item.calories,item.protein,item.carbs,item.fats,item.fiber].every(knownNonnegative)) throw Error('A food has unknown nutrition or serving data. Review it before saving; your draft is preserved.');
    return { food_id:item.food_id, food_item_id:item.food_item_id || null, food_name:item.food_name, food_brand:item.food_brand || null,
      serving_amount:item.serving_amount, serving_unit:item.serving_unit, servings_count:item.servings_count,
      calories:item.calories, protein:item.protein, carbs:item.carbs, fat:item.fats, fiber:item.fiber };
  });
}
