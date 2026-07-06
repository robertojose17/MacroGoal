/**
 * Calcula los macros de un food_item para una cantidad dada en gramos.
 * Respeta el campo macros_per: '100g' divide por 100, 'serving' divide por serving_size.
 */
export interface FoodItemForCalc {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  serving_size: number;
  macros_per?: string | null;
}

export interface MacroResult {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export function calcMacros(fi: FoodItemForCalc, grams: number): MacroResult {
  if (!fi || !fi.serving_size || fi.serving_size === 0 || grams === 0) {
    return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  }
  const divisor = fi.macros_per === '100g' ? 100 : fi.serving_size;
  const ratio = grams / divisor;
  return {
    calories: fi.calories * ratio,
    protein: fi.protein * ratio,
    carbs: fi.carbs * ratio,
    fat: fi.fat * ratio,
    fiber: (fi.fiber ?? 0) * ratio,
  };
}
