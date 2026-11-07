import type { SavedPortion } from './catalogSelection';
import type { Json, Tables, TablesUpdate } from '@/lib/supabase/types';

/** Persist only JSON values. In particular, provider evidence must be serializable. */
export function foodJsonSnapshot(value: unknown): Json {
  const ancestors = new Set<object>();
  function snapshot(input: unknown): Json {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (typeof input !== 'object' || input === null || ancestors.has(input)) {
      throw new Error('invalid_food_snapshot');
    }
    ancestors.add(input);
    try {
      if (Array.isArray(input)) return input.map(item => item === undefined ? null : snapshot(item));
      const result: { [key: string]: Json } = {};
      for (const [key, item] of Object.entries(input)) {
        if (item !== undefined) {
          Object.defineProperty(result, key, {
            value: snapshot(item), enumerable: true, configurable: true, writable: true,
          });
        }
      }
      return result;
    } finally {
      ancestors.delete(input);
    }
  }
  return snapshot(value);
}

/** A saved meal uses fat, serving_amount and servings_count, not diary columns. */
export function savedMealForFoodDetails<T extends Tables<'saved_meal_items'>>(item: T) {
  return {
    ...item,
    fats: item.fat,
    grams: item.serving_amount * item.servings_count,
    quantity: item.servings_count,
    // Saved labels are not diary measurement instructions.
    serving_description: null,
    off_data: null,
  };
}

type FoodEdit = {
  quantity: number;
  grams: number;
  servingDescription: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
};

export function savedMealFoodUpdate(item: FoodEdit): TablesUpdate<'saved_meal_items'> {
  if (!Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.grams) || item.grams <= 0) {
    throw new Error('invalid_saved_meal_portion');
  }
  return {
    servings_count: item.quantity,
    serving_amount: item.grams / item.quantity,
    serving_unit: item.servingDescription,
    calories: item.calories,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fats,
    fiber: item.fiber,
  };
}

/** log_food returns JSON. Diagnostic IDs are optional and never authorize a retry. */
export function foodLogIds(value: Json | undefined): {meal_id?: string; meal_item_id?: string} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return {
    meal_id: typeof value.meal_id === 'string' ? value.meal_id : undefined,
    meal_item_id: typeof value.meal_item_id === 'string' ? value.meal_item_id : undefined,
  };
}

/** Restore saved rows from their numeric columns, never from a volume/density guess. */
export function savedMealPortionForDetails(
  item: Pick<Tables<'saved_meal_items'>, 'serving_amount' | 'servings_count' | 'serving_unit'>,
): SavedPortion {
  const positiveNumber = (value: unknown): number | null => {
    const number = typeof value === 'number' ? value
      : typeof value === 'string' && /^[0-9.e+-]+$/i.test(value) ? Number(value) : NaN;
    return Number.isFinite(number) && number > 0 ? number : null;
  };
  const gramsPerUnit = positiveNumber(item.serving_amount);
  const count = positiveNumber(item.servings_count);
  if (gramsPerUnit === null || count === null || !Number.isFinite(gramsPerUnit * count)) {
    throw new Error('invalid_saved_meal_portion');
  }
  // The label supplies display text only. Strip a repeated count when it agrees
  // with the saved count; neither this text nor a rounded gram suffix drives math.
  const label = item.serving_unit.trim().replace(/\s*\([\d.e+-]+\s*g\)$/i, '').trim();
  const counted = label.match(/^([\d.e+-]+)\s+(.+)$/);
  const description = counted && Number(counted[1]) === count ? counted[2] : label;
  return {description: description || 'serving', gramsPerUnit};
}
