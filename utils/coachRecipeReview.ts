import type { GuidedOption } from './coachJourney';
import type { DailyMealSlot } from './coachDailyAction';
import { addReviewedSavedMeal } from './manualSavedMealAdd';

// Ephemeral handoff, never a serialized nutrition payload in a deep link.
export type RecipeReview = { owner: string; date: string; meal: DailyMealSlot; option: GuidedOption; stopped?: boolean };
let held: { key: string; value: RecipeReview } | undefined;
let sequence = 0;
export function holdRecipeReview(value: RecipeReview): string {
  const key = `coach-review-${++sequence}`;
  held = { key, value }; return key;
}
export function readRecipeReview(key: unknown) { return held && held.key === key ? held.value : undefined; }
export function clearRecipeReview() { held = undefined; }
export function reviewRecipeModel(value: RecipeReview) {
  const o = value.option;
  if (!o.recipe) return null;
  return { id: o.id, name: o.name, description: '', image_url: null, source_name: o.source_label,
    source_url: o.source_url, prep_time_minutes: null, servings: o.recipe.source_servings,
    calories_per_serving: o.nutrition.calories / o.source_servings,
    protein_per_serving: o.nutrition.protein / o.source_servings,
    carbs_per_serving: o.nutrition.carbs / o.source_servings,
    fat_per_serving: o.nutrition.fats / o.source_servings,
    fiber_per_serving: o.nutrition.fiber / o.source_servings,
    ingredients: o.recipe.ingredients.map(name => ({ name, amount: '', calories: 0, protein: 0, carbs: 0, fat: 0 })),
    instructions: o.recipe.instructions, reviews: [], tags: [] };
}
export async function addCoachRecipe(value: RecipeReview, servings: number, deps: {
  owner(): Promise<string | undefined>; today(): string;
  store: Parameters<typeof addReviewedSavedMeal>[0]['store'];
  write(body: Record<string, unknown>): Promise<void>;
}) {
  if (value.stopped || !Number.isFinite(servings) || servings < 0.5 || servings > 20 || !value.option.recipe) return { status: 'blocked' as const, completed: 0 };
  const scale = servings / value.option.source_servings;
  const o = value.option;
  const item = { p_user_id: value.owner, p_date: value.date, p_meal_type: value.meal,
    p_food_id: null, p_food_item_id: null, p_food_name: o.name, p_food_brand: null,
    p_quantity: servings, p_grams: null, p_serving_description: `${servings} source servings`,
    p_calories: o.nutrition.calories * scale, p_protein: o.nutrition.protein * scale,
    p_carbs: o.nutrition.carbs * scale, p_fats: o.nutrition.fats * scale, p_fiber: o.nutrition.fiber * scale,
    p_logged_at: new Date().toISOString() };
  const result = await addReviewedSavedMeal({ owner: value.owner, date: value.date, mealId: `coach-recipe:${o.id}`, mealType: value.meal,
    items: [item], store: deps.store, currentOwner: deps.owner,
    isCurrent: () => !value.stopped && deps.today() === value.date && held?.value === value,
    write: deps.write });
  if (result.status === 'complete' || result.status === 'review') value.stopped = true;
  return result;
}
