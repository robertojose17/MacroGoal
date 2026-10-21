type Store = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };
export type ManualAddResult = { status: 'complete' | 'busy' | 'blocked' | 'unavailable' | 'review'; completed: number };
const inFlight = new Set<string>();

type DiarySourceItem = {
  food_id: string | null; food_item_id: string | null; food_name: string | null; food_brand: string | null;
  food_items?: { name: string; brand: string | null } | null; foods?: { name: string; brand: string | null } | null;
  serving_amount: number; servings_count: number; serving_unit: string;
};
type DiaryMacros = { calories: number; protein: number; carbs: number; fats: number; fiber: number };
// Prepare the entire explicitly reviewed batch before the first log_food RPC.
// Names/brands mirror Details' display precedence; no catalog or synthetic fallback is invented.
export function prepareSavedMealDiaryItems<T extends DiarySourceItem>(items: T[], multiplier: number, calculate: (item: T, multiplier: number) => DiaryMacros) {
  if (!items.length || !Number.isFinite(multiplier) || multiplier <= 0) throw Error('invalid_saved_meal');
  const validId = (id: unknown) => id === null || typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  return items.map(item => {
    const name = item.food_items?.name ?? item.foods?.name ?? item.food_name;
    const brand = item.food_items?.brand ?? item.foods?.brand ?? item.food_brand;
    const quantity = item.servings_count * multiplier;
    const grams = Math.round(item.serving_amount * quantity);
    const macros = calculate(item, multiplier);
    if (typeof name !== 'string' || !name.trim() || brand != null && typeof brand !== 'string' ||
        !validId(item.food_id) || !validId(item.food_item_id) ||
        !Number.isFinite(item.serving_amount) || item.serving_amount <= 0 || !Number.isFinite(quantity) || quantity <= 0 ||
        !Number.isFinite(grams) || grams <= 0 || typeof item.serving_unit !== 'string' || !item.serving_unit.trim() ||
        !['calories','protein','carbs','fats','fiber'].every(key => typeof macros[key as keyof DiaryMacros] === 'number' && Number.isFinite(macros[key as keyof DiaryMacros]) && macros[key as keyof DiaryMacros] >= 0) || macros.calories > 99999) throw Error('invalid_saved_meal_item');
    return {
      p_food_id: item.food_id, p_food_item_id: item.food_item_id,
      p_food_name: name.trim(), p_food_brand: brand?.trim() || null,
      p_quantity: quantity, p_grams: grams,
      p_calories: macros.calories, p_protein: macros.protein, p_carbs: macros.carbs, p_fats: macros.fats, p_fiber: macros.fiber,
      p_serving_description: `${Math.round(quantity)} x ${Math.round(item.serving_amount)} ${item.serving_unit}`,
    };
  });
}

// A local no-retry fence for the existing per-item log_food flow, not a server transaction.
export async function addReviewedSavedMeal<T>(input: {
  owner: string; date: string; mealId: string; mealType: string; items: T[]; store: Store;
  currentOwner(): Promise<string | undefined>; isCurrent(): boolean; write(item: T): Promise<void>;
}): Promise<ManualAddResult> {
  const key = `manual_saved_meal_pending_v1:${JSON.stringify([input.owner, input.date, input.mealType, input.mealId])}`;
  if (inFlight.has(key)) return { status: 'busy', completed: 0 };
  inFlight.add(key);
  let completed = 0, attempted = false, marked = false;
  try {
    if (!input.items.length || !input.isCurrent() || await input.currentOwner() !== input.owner || !input.isCurrent()) return { status: 'blocked', completed };
    if (await input.store.getItem(key)) return { status: 'review', completed };
    await input.store.setItem(key, JSON.stringify({ completed: 0 }));
    marked = true;
    for (const item of input.items) {
      if (!input.isCurrent() || await input.currentOwner() !== input.owner || !input.isCurrent()) throw Error('scope_changed');
      // Mark before dispatch. A lost acknowledgement is never assumed to be a failed write.
      attempted = true;
      await input.write(item);
      completed++;
      await input.store.setItem(key, JSON.stringify({ completed }));
    }
    await input.store.removeItem(key);
    return { status: 'complete', completed };
  } catch {
    if (attempted) return { status: 'review', completed };
    if (marked) { try { await input.store.removeItem(key); } catch { /* Keep conservative fence. */ } }
    return { status: 'unavailable', completed };
  } finally { inFlight.delete(key); }
}
