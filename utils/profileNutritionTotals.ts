export type ProfileNutritionTotals = { calories: number; protein: number; carbs: number; fats: number; fiber: number };
const keys = ['calories', 'protein', 'carbs', 'fats', 'fiber'] as const;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const zero = (): ProfileNutritionTotals => ({ calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 });
function complete(value: Record<string, unknown>): ProfileNutritionTotals | null {
  if (!numeric(value.calories) || !numeric(value.protein) || !numeric(value.carbs) || !numeric(value.fats) || !numeric(value.fiber)) return null;
  return { calories: value.calories, protein: value.protein, carbs: value.carbs, fats: value.fats, fiber: value.fiber };
}
/** Stored complete nutrition is authoritative, including explicit zero. */
export function profileItemNutrition(value: unknown): ProfileNutritionTotals | null {
  if (!record(value)) return null;
  const stored = complete(value);
  if (stored) return stored;
  // Invalid known values may not be repaired by choosing another source.
  if (keys.some(key => value[key] !== null && value[key] !== undefined && !numeric(value[key]))) return null;
  const food = value.food_items;
  if (!record(food) || !numeric(value.grams)) return null;
  const base = complete({ ...food, fats: food.fat });
  if (!base) return null;
  const divisor = food.macros_per === '100g' ? 100
    : food.macros_per === 'serving' && numeric(food.serving_size) && food.serving_size > 0 ? food.serving_size : null;
  if (divisor === null) return null;
  const ratio = value.grams / divisor;
  const resolved = { calories: base.calories * ratio, protein: base.protein * ratio, carbs: base.carbs * ratio, fats: base.fats * ratio, fiber: base.fiber * ratio };
  if (!complete(resolved)) return null;
  // A partial stored receipt must agree with the proposed fallback, not be silently replaced.
  if (keys.some(key => numeric(value[key]) && Math.abs(value[key] - resolved[key]) > 1e-6)) return null;
  return resolved;
}
function mealTotals(value: unknown): { totals: ProfileNutritionTotals; tracked: boolean } | null {
  if (!record(value) || !Array.isArray(value.meal_items)) return null;
  const totals = zero(); let tracked = false;
  for (const item of value.meal_items) {
    if (!record(item)) return null;
    if (item.is_scheduled === true) continue;
    if (item.is_scheduled !== false && item.is_scheduled !== null && item.is_scheduled !== undefined) return null;
    const nutrition = profileItemNutrition(item);
    if (!nutrition) return null;
    for (const key of keys) { totals[key] += nutrition[key]; if (!Number.isFinite(totals[key])) return null; }
    tracked = true;
  }
  return { totals, tracked };
}
export function profileNutritionAverage(meals: unknown, days: number): ProfileNutritionTotals | null {
  if (!Array.isArray(meals) || !Number.isInteger(days) || days < 1) return null;
  const totals = zero();
  for (const meal of meals) {
    const result = mealTotals(meal); if (!result) return null;
    for (const key of keys) { totals[key] += result.totals[key]; if (!Number.isFinite(totals[key])) return null; }
  }
  for (const key of keys) totals[key] /= days;
  return totals;
}
/** Empty/scheduled-only meals do not count as tracking. Unknown food makes the score unavailable. */
export function profileNutritionByDate(meals: unknown): Record<string, ProfileNutritionTotals> | null {
  if (!Array.isArray(meals)) return null;
  const dates: Record<string, ProfileNutritionTotals> = {};
  for (const meal of meals) {
    if (!record(meal) || typeof meal.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(meal.date) || !Number.isFinite(Date.parse(meal.date)) || new Date(meal.date).toISOString().slice(0, 10) !== meal.date) return null;
    const result = mealTotals(meal); if (!result) return null;
    if (!result.tracked) continue;
    const totals = dates[meal.date] ?? zero();
    for (const key of keys) { totals[key] += result.totals[key]; if (!Number.isFinite(totals[key])) return null; }
    dates[meal.date] = totals;
  }
  return dates;
}
