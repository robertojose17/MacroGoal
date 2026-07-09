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
  if (!fi || grams === 0) {
    return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  }
  // If macros_per is 'serving', we need serving_size to divide correctly.
  // If serving_size is missing/zero, fall back to per-100g calculation.
  const isPerServing = fi.macros_per === 'serving' && fi.serving_size && fi.serving_size > 0;
  const divisor = isPerServing ? fi.serving_size : 100;
  const ratio = grams / divisor;
  return {
    calories: fi.calories * ratio,
    protein: fi.protein * ratio,
    carbs: fi.carbs * ratio,
    fat: fi.fat * ratio,
    fiber: (fi.fiber ?? 0) * ratio,
  };
}
