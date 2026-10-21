export type DailyAccess = {
  isPremium: boolean;
  premiumLoading: boolean;
  premiumError?: string | null;
  gated: boolean;
  busy: boolean;
};

export function dailyAccess(access: DailyAccess): 'ready' | 'locked' | 'blocked' {
  if (access.premiumLoading || access.premiumError || access.gated || access.busy) return 'blocked';
  return access.isPremium ? 'ready' : 'locked';
}

type Totals = { calories: number; protein: number; carbs: number; fats: number };
export type DailySummary =
  | { kind: 'empty' }
  | { kind: 'incomplete' }
  | { kind: 'logged'; totals: Totals; goal: { calories: number; protein: number } | null };
export type DailySnapshot =
  | { kind: 'blocked' | 'locked' | 'permission' | 'unavailable' }
  | { kind: 'ready'; owner: string; date: string; summary: DailySummary };

function numeric(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function summarizeDay(meals: unknown, goal: any): DailySummary {
  if (!Array.isArray(meals)) return { kind: 'incomplete' };
  const totals: Totals = { calories: 0, protein: 0, carbs: 0, fats: 0 };
  let count = 0;
  for (const meal of meals) {
    if (!Array.isArray(meal?.meal_items)) return { kind: 'incomplete' };
    for (const item of meal.meal_items) {
      for (const key of Object.keys(totals) as (keyof Totals)[]) {
        const value = numeric(item?.[key]);
        if (value === null) return { kind: 'incomplete' };
        totals[key] += value;
        if (!Number.isFinite(totals[key])) return { kind: 'incomplete' };
      }
      count++;
    }
  }
  if (!count) return { kind: 'empty' };
  const calories = numeric(goal?.daily_calories);
  const protein = numeric(goal?.protein_g);
  return { kind: 'logged', totals, goal: calories !== null && calories > 0 && protein !== null && protein > 0 ? { calories, protein } : null };
}

// Read-only adapter for existing app contracts. No inferred memories or AI requests.
export async function loadDailyAction(db: any, access: DailyAccess, date: string): Promise<DailySnapshot> {
  const gate = dailyAccess(access);
  if (gate !== 'ready') return { kind: gate };
  try {
    const auth = await db.auth.getUser();
    const owner = auth.data?.user?.id;
    if (auth.error || !owner) return { kind: 'blocked' };
    const permissions = await db.from('coach_permissions').select('permission_level, can_add_food').eq('user_id', owner).maybeSingle();
    if (permissions.error) return { kind: 'unavailable' };
    if (permissions.data?.can_add_food !== true || ![2, 3, 4].includes(permissions.data?.permission_level)) return { kind: 'permission' };
    const [meals, goal] = await Promise.all([
      db.from('meals').select('meal_items(calories, protein, carbs, fats)').eq('user_id', owner).eq('date', date),
      db.from('goals').select('daily_calories, protein_g').eq('user_id', owner).eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (meals.error || goal.error) return { kind: 'unavailable' };
    const current = await db.auth.getUser();
    if (current.error || current.data?.user?.id !== owner) return { kind: 'blocked' };
    return { kind: 'ready', owner, date, summary: summarizeDay(meals.data, goal.data) };
  } catch { return { kind: 'unavailable' }; }
}

export const DAILY_MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type DailyMealSlot = typeof DAILY_MEAL_SLOTS[number];
export function dailyMealRoute(snapshot: DailySnapshot, access: DailyAccess, owner: string | undefined, date: string, meal: DailyMealSlot) {
  if (dailyAccess(access) !== 'ready' || snapshot.kind !== 'ready' || snapshot.owner !== owner || snapshot.date !== date || !DAILY_MEAL_SLOTS.includes(meal)) return null;
  return { pathname: '/my-meals' as const, params: { meal, date, returnTo: '/(tabs)/coach', coachReview: 'true' } };
}
