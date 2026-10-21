import { dailyAccess, type DailyAccess, type DailyMealSlot, type DailySnapshot } from './coachDailyAction';

export type SavedMealOption = { id: string; name: string; calories: number; protein: number; carbs: number; fats: number };
export type MealRecommendations = { kind: 'ready'; owner: string; date: string; meal: DailyMealSlot; options: SavedMealOption[] } | { kind: 'blocked' | 'unavailable' };
export type DailyActionServices = {
  recovery?: DailyActionServices;
  load(access: DailyAccess, date: string): Promise<DailySnapshot>;
  recommend(access: DailyAccess, date: string, meal: DailyMealSlot): Promise<MealRecommendations>;
};
const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// Bind only to the reviewed saved_meals-only server adapter, through the existing
// admission/request journal. No endpoint, token handling or permissive default.
export function createManualHandoffServices(deps: {
  catalogSource: 'owned_saved_meals';
  owner(): Promise<string | undefined>;
  request(body: { intent: 'today' | 'recommend'; meal_type?: DailyMealSlot }): Promise<Response>;
  recover?(body: { intent: 'today' | 'recommend'; meal_type?: DailyMealSlot }): Promise<Response>;
}): DailyActionServices {
  async function admitted(access: DailyAccess) {
    if (dailyAccess(access) !== 'ready') return undefined;
    return deps.owner();
  }
  return {
    recovery: deps.recover ? createManualHandoffServices({ ...deps, request: deps.recover, recover: undefined }) : undefined,
    async load(access, date) {
      const gate = dailyAccess(access); if (gate !== 'ready') return { kind: gate };
      try {
        const owner = await admitted(access); if (!owner) return { kind: 'blocked' };
        const response = await deps.request({ intent: 'today' });
        if (await deps.owner() !== owner) return { kind: 'blocked' };
        const b = await response.json();
        if (await deps.owner() !== owner) return { kind: 'blocked' };
        if (!response.ok) return { kind: b.error === 'premium_required' ? 'locked' : b.error === 'permission_required' ? 'permission' : [401,403,429].includes(response.status) ? 'blocked' : 'unavailable' };
        if (b.status !== 'ready' || b.owner !== owner || b.date !== date || b.coverage !== 'logged_only' || !Number.isInteger(b.entry_count) || b.entry_count < 0) return { kind: 'unavailable' };
        if (!b.entry_count) return { kind: 'ready', owner, date, summary: { kind: 'empty' } };
        if (!b.logged || !['calories','protein','carbs','fats'].every(k => valid(b.logged[k]))) return { kind: 'unavailable' };
        return { kind: 'ready', owner, date, summary: { kind: 'logged', totals: b.logged, goal: b.target && valid(b.target.calories) && b.target.calories > 0 && valid(b.target.protein) && b.target.protein > 0 ? { calories: b.target.calories, protein: b.target.protein } : null } };
      } catch { return { kind: 'unavailable' }; }
    },
    async recommend(access, date, meal) {
      try {
        const owner = await admitted(access); if (!owner) return { kind: 'blocked' };
        const response = await deps.request({ intent: 'recommend', meal_type: meal });
        if (await deps.owner() !== owner) return { kind: 'blocked' };
        if (!response.ok) return { kind: [401,403,429].includes(response.status) ? 'blocked' : 'unavailable' };
        const b = await response.json();
        if (await deps.owner() !== owner) return { kind: 'blocked' };
        if (deps.catalogSource !== 'owned_saved_meals' || b.schema !== 'saved_meal_recommendations_v1' || b.owner !== owner || b.date !== date || b.meal_type !== meal || b.context?.date !== date || b.context?.coverage !== 'logged_only' || !Array.isArray(b.options) || b.options.length > 3) return { kind: 'unavailable' };
        if (b.status === 'no_options' && b.options.length === 0 && b.next_action === 'none') return { kind: 'ready', owner, date, meal, options: [] };
        if (b.status !== 'options' || !b.options.length || b.next_action !== 'review_saved_meal') return { kind: 'unavailable' };
        const options: SavedMealOption[] = [];
        for (const row of b.options) {
          if (!uuid(row.meal_id) || options.some(o => o.id === row.meal_id) || row.source !== 'saved_meal' || row.portion_basis !== '1_saved_meal' || row.nutrition_authority !== 'advisory_snapshot' || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 300 || !row.nutrition || !['calories','protein','carbs','fats'].every(k => valid(row.nutrition[k]))) return { kind: 'unavailable' };
          options.push({ id: row.meal_id, name: row.name, calories: row.nutrition.calories, protein: row.nutrition.protein, carbs: row.nutrition.carbs, fats: row.nutrition.fats });
        }
        return { kind: 'ready', owner, date, meal, options };
      } catch { return { kind: 'unavailable' }; }
    },
  };
}

export function savedMealReviewRoute(result: MealRecommendations, id: string, access: DailyAccess, owner: string | undefined, date: string, meal: DailyMealSlot) {
  if (dailyAccess(access) !== 'ready' || result.kind !== 'ready' || result.owner !== owner || result.date !== date || result.meal !== meal || !result.options.some(option => option.id === id)) return null;
  return { pathname: '/my-meals-details' as const, params: { mealId: id, meal, date, coachReview: 'true', coachOwner: result.owner } };
}

// Resolve the final identity wait before reading the current day and gates.
export async function recheckSavedMealReview(result: MealRecommendations, id: string, meal: DailyMealSlot, expectedOwner: string, current: {
  owner(): Promise<string | undefined>; today(): string; access(): DailyAccess; isCurrent(): boolean;
}) {
  const owner = await current.owner();
  if (!current.isCurrent() || owner !== expectedOwner) return null;
  return savedMealReviewRoute(result, id, current.access(), owner, current.today(), meal);
}
