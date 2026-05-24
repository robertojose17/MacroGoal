import { supabase } from '@/lib/supabase/client';

async function getCurrentUserId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Not authenticated');
  return user.id;
}

export interface MealPlan {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  created_at: string;
}

export interface MealPlanItem {
  id: string;
  plan_id: string;
  date: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  food_name: string;
  brand?: string;
  quantity: number;
  grams?: number;
  serving_unit?: string;
  serving_description?: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber?: number;
  dish_description?: string;
  recipe_url?: string;
}

export interface MealPlanDetail extends MealPlan {
  items: MealPlanItem[];
}

export interface GroceryItem {
  name: string;
  brand?: string;
  total_grams: number;
  display_amount: string;
}

export interface GroceryCategory {
  category: string;
  emoji: string;
  items: GroceryItem[];
}

export interface GroceryListResponse {
  plan_name: string;
  categories: GroceryCategory[];
}

export interface AddMealPlanItemBody {
  date: string;
  meal_type: string;
  food_name: string;
  brand?: string;
  quantity?: number;
  grams?: number;
  serving_unit?: string | null;
  serving_description?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
  fiber?: number;
  dish_description?: string;
  recipe_url?: string;
}

export async function listMealPlans(): Promise<{ plans: MealPlan[] }> {
  console.log('[MealPlansApi] listMealPlans()');
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[MealPlansApi] listMealPlans error:', error.message);
    throw new Error(error.message);
  }
  return { plans: data || [] };
}

export async function createMealPlan(body: { name: string; start_date: string; end_date: string }): Promise<MealPlan> {
  console.log('[MealPlansApi] createMealPlan()', body);
  const userId = await getCurrentUserId();

  // Ensure dates are valid strings — never pass null/undefined to Supabase
  const today = new Date();
  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const startDate = body.start_date && body.start_date.length === 10 ? body.start_date : formatDate(today);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 6);
  const endDate = body.end_date && body.end_date.length === 10 ? body.end_date : formatDate(nextWeek);

  console.log('[MealPlansApi] Inserting with dates:', startDate, endDate);

  const { data, error } = await supabase
    .from('meal_plans')
    .insert({ user_id: userId, name: body.name, start_date: startDate, end_date: endDate })
    .select()
    .single();
  if (error) {
    console.error('[MealPlansApi] createMealPlan error:', error.message, error.code, error.details);
    throw new Error(error.message);
  }
  return data;
}

export async function getMealPlan(planId: string): Promise<MealPlanDetail> {
  console.log('[MealPlansApi] getMealPlan()', planId);
  const userId = await getCurrentUserId();
  const { data: plan, error: planError } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('id', planId)
    .eq('user_id', userId)
    .single();
  if (planError || !plan) {
    console.error('[MealPlansApi] getMealPlan error:', planError?.message);
    throw new Error(planError?.message || 'Plan not found');
  }
  const { data: items, error: itemsError } = await supabase
    .from('meal_plan_items')
    .select('*')
    .eq('plan_id', planId)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });
  if (itemsError) {
    console.error('[MealPlansApi] getMealPlan items error:', itemsError.message);
    throw new Error(itemsError.message);
  }
  return { ...plan, items: items || [] };
}

export async function deleteMealPlan(planId: string): Promise<void> {
  console.log('[MealPlansApi] deleteMealPlan()', planId);
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from('meal_plans')
    .delete()
    .eq('id', planId)
    .eq('user_id', userId);
  if (error) {
    console.error('[MealPlansApi] deleteMealPlan error:', error.message);
    throw new Error(error.message);
  }
}

export async function addMealPlanItem(planId: string, body: AddMealPlanItemBody): Promise<MealPlanItem> {
  console.log('[MealPlansApi] addMealPlanItem()', planId, body.food_name);
  const { data, error } = await supabase
    .from('meal_plan_items')
    .insert({
      plan_id: planId,
      date: body.date,
      meal_type: body.meal_type,
      food_name: body.food_name,
      brand: body.brand || null,
      quantity: body.quantity || 1,
      grams: body.grams || null,
      serving_unit: body.serving_unit || null,
      serving_description: body.serving_description || null,
      calories: body.calories || 0,
      protein: body.protein || 0,
      carbs: body.carbs || 0,
      fats: body.fats || 0,
      fiber: body.fiber || 0,
      dish_description: body.dish_description || null,
      recipe_url: body.recipe_url || null,
    })
    .select()
    .single();
  if (error) {
    console.error('[MealPlansApi] addMealPlanItem error:', error.message);
    throw new Error(error.message);
  }
  return data;
}

export async function updateMealPlan(planId: string, body: { name?: string; start_date?: string; end_date?: string }): Promise<void> {
  console.log('[MealPlansApi] updateMealPlan()', planId, body);
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from('meal_plans')
    .update(body)
    .eq('id', planId)
    .eq('user_id', userId);
  if (error) {
    console.error('[MealPlansApi] updateMealPlan error:', error.message);
    throw new Error(error.message);
  }
}

export async function updateMealPlanItem(planId: string, itemId: string, body: { grams?: number; quantity?: number; calories?: number; protein?: number; carbs?: number; fats?: number }): Promise<void> {
  console.log('[MealPlansApi] updateMealPlanItem()', planId, itemId, body);
  const { error } = await supabase
    .from('meal_plan_items')
    .update(body)
    .eq('id', itemId)
    .eq('plan_id', planId);
  if (error) {
    console.error('[MealPlansApi] updateMealPlanItem error:', error.message);
    throw new Error(error.message);
  }
}

export async function deleteMealPlanItem(planId: string, itemId: string): Promise<void> {
  console.log('[MealPlansApi] deleteMealPlanItem()', planId, itemId);
  const { error } = await supabase
    .from('meal_plan_items')
    .delete()
    .eq('id', itemId)
    .eq('plan_id', planId);
  if (error) {
    console.error('[MealPlansApi] deleteMealPlanItem error:', error.message);
    throw new Error(error.message);
  }
}

const PROTEIN_KEYWORDS = ['chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'turkey', 'egg', 'shrimp', 'tofu', 'meat', 'steak', 'lamb'];
const VEGETABLE_KEYWORDS = ['broccoli', 'spinach', 'carrot', 'lettuce', 'tomato', 'cucumber', 'pepper', 'onion', 'garlic', 'kale', 'zucchini', 'celery', 'asparagus'];
const FRUIT_KEYWORDS = ['apple', 'banana', 'orange', 'berry', 'strawberry', 'mango', 'grape', 'peach', 'pear', 'melon', 'blueberry', 'raspberry'];
const DAIRY_KEYWORDS = ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'whey', 'cottage'];
const GRAIN_KEYWORDS = ['rice', 'oat', 'bread', 'pasta', 'quinoa', 'wheat', 'flour', 'cereal', 'tortilla', 'bagel', 'wrap', 'noodle'];

function categorizeFood(name: string): { category: string; emoji: string } {
  const lower = name.toLowerCase();
  if (PROTEIN_KEYWORDS.some(k => lower.includes(k))) return { category: 'Proteins', emoji: '🥩' };
  if (VEGETABLE_KEYWORDS.some(k => lower.includes(k))) return { category: 'Vegetables', emoji: '🥦' };
  if (FRUIT_KEYWORDS.some(k => lower.includes(k))) return { category: 'Fruits', emoji: '🍎' };
  if (DAIRY_KEYWORDS.some(k => lower.includes(k))) return { category: 'Dairy', emoji: '🥛' };
  if (GRAIN_KEYWORDS.some(k => lower.includes(k))) return { category: 'Grains', emoji: '🌾' };
  return { category: 'Other', emoji: '🛒' };
}

export async function getGroceryList(planId: string): Promise<GroceryListResponse> {
  console.log('[MealPlansApi] getGroceryList()', planId);
  const userId = await getCurrentUserId();
  const { data: plan, error: planError } = await supabase
    .from('meal_plans')
    .select('name, start_date, end_date')
    .eq('id', planId)
    .eq('user_id', userId)
    .single();
  if (planError || !plan) throw new Error('Plan not found');

  const { data: items, error: itemsError } = await supabase
    .from('meal_plan_items')
    .select('food_name, brand, grams, quantity, meal_type')
    .eq('plan_id', planId);
  if (itemsError) throw new Error(itemsError.message);

  // Deduplicate items by food_name+meal_type (same as frontend dedup)
  const seen = new Set<string>();
  const uniqueItems: typeof items = [];
  for (const item of (items || [])) {
    const key = (item.food_name as string).toLowerCase().trim() + '|' + item.meal_type;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueItems.push(item);
    }
  }

  // Calculate numDays from plan dates
  const start = new Date(plan.start_date + 'T00:00:00');
  const end = new Date(plan.end_date + 'T00:00:00');
  const numDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  console.log('[MealPlansApi] getGroceryList numDays:', numDays, 'uniqueItems:', uniqueItems.length);

  // Aggregate with numDays multiplier
  const grouped: Record<string, { name: string; brand: string | null; total_grams: number }> = {};
  for (const item of uniqueItems) {
    const key = (item.food_name as string).toLowerCase().trim();
    if (!grouped[key]) {
      grouped[key] = { name: item.food_name as string, brand: (item.brand as string) || null, total_grams: 0 };
    }
    grouped[key].total_grams += ((item.grams as number) || ((item.quantity as number) * 100)) * numDays;
  }

  const categoryMap: Record<string, GroceryCategory> = {};
  for (const entry of Object.values(grouped)) {
    const { category, emoji } = categorizeFood(entry.name);
    if (!categoryMap[category]) categoryMap[category] = { category, emoji, items: [] };
    const totalGrams = Math.round(entry.total_grams);
    const displayAmount = totalGrams >= 1000
      ? `${(totalGrams / 1000).toFixed(1)} kg`
      : `${totalGrams} g`;
    categoryMap[category].items.push({
      name: entry.name,
      brand: entry.brand || undefined,
      total_grams: totalGrams,
      display_amount: displayAmount,
    });
  }

  const categoryOrder = ['Proteins', 'Vegetables', 'Fruits', 'Dairy', 'Grains', 'Other'];
  const categories = categoryOrder.filter(c => categoryMap[c]).map(c => categoryMap[c]);
  return { plan_name: plan.name, categories };
}

export interface DayAssignment {
  id: string;
  date: string; // 'YYYY-MM-DD'
  meal_plan_id: string;
  plan_name?: string;
}

/** Assign (or replace) a plan to a specific day. Uses upsert on (user_id, date). */
export async function assignPlanToDay(date: string, mealPlanId: string): Promise<void> {
  console.log('[MealPlansApi] assignPlanToDay()', date, mealPlanId);
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from('day_plan_assignments')
    .upsert({ user_id: userId, date, meal_plan_id: mealPlanId }, { onConflict: 'user_id,date' });
  if (error) throw new Error(error.message);
}

/** Remove the plan assignment for a specific day. */
export async function removePlanFromDay(date: string): Promise<void> {
  console.log('[MealPlansApi] removePlanFromDay()', date);
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from('day_plan_assignments')
    .delete()
    .eq('user_id', userId)
    .eq('date', date);
  if (error) throw new Error(error.message);
}

/** Get all assignments for a given month (YYYY-MM). */
export async function getMonthAssignments(yearMonth: string): Promise<DayAssignment[]> {
  console.log('[MealPlansApi] getMonthAssignments()', yearMonth);
  const userId = await getCurrentUserId();
  const startDate = `${yearMonth}-01`;
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate(); // last day of the month
  const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('day_plan_assignments')
    .select('id, date, meal_plan_id')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate);
  if (error) throw new Error(error.message);
  const rows = data || [];
  if (rows.length === 0) return [];
  const planIds = [...new Set(rows.map((r: any) => r.meal_plan_id))];
  const { data: plans } = await supabase
    .from('meal_plans')
    .select('id, name')
    .in('id', planIds);
  const planMap: Record<string, string> = {};
  for (const p of (plans || [])) planMap[(p as any).id] = (p as any).name;
  return rows.map((row: any) => ({
    id: row.id,
    date: row.date,
    meal_plan_id: row.meal_plan_id,
    plan_name: planMap[row.meal_plan_id],
  }));
}

/** Get all assignments within a date range (inclusive). */
export async function getRangeAssignments(startDate: string, endDate: string): Promise<DayAssignment[]> {
  console.log('[MealPlansApi] getRangeAssignments()', startDate, endDate);
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('day_plan_assignments')
    .select('id, date, meal_plan_id')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate);
  if (error) throw new Error(error.message);
  const rows = data || [];
  if (rows.length === 0) return [];
  const planIds = [...new Set(rows.map((r: any) => r.meal_plan_id))];
  const { data: plans } = await supabase
    .from('meal_plans')
    .select('id, name')
    .in('id', planIds);
  const planMap: Record<string, string> = {};
  for (const p of (plans || [])) planMap[(p as any).id] = (p as any).name;
  return rows.map((row: any) => ({
    id: row.id,
    date: row.date,
    meal_plan_id: row.meal_plan_id,
    plan_name: planMap[row.meal_plan_id],
  }));
}

/** Consolidated grocery list for multiple plans with per-plan day counts. */
export async function getMultiPlanGroceryList(
  planCounts: { planId: string; count: number }[],
  rangeLabel: string
): Promise<GroceryListResponse> {
  console.log('[MealPlansApi] getMultiPlanGroceryList()', planCounts, rangeLabel);
  await getCurrentUserId();
  const planIds = planCounts.map(p => p.planId);

  const { data: items, error } = await supabase
    .from('meal_plan_items')
    .select('plan_id, food_name, brand, grams, quantity, meal_type')
    .in('plan_id', planIds);
  if (error) throw new Error(error.message);

  const perPlanSeen: Record<string, Set<string>> = {};
  const uniqueItems: typeof items = [];
  for (const item of (items || [])) {
    const pid = item.plan_id as string;
    if (!perPlanSeen[pid]) perPlanSeen[pid] = new Set();
    const key = (item.food_name as string).toLowerCase().trim() + '|' + item.meal_type;
    if (!perPlanSeen[pid].has(key)) {
      perPlanSeen[pid].add(key);
      uniqueItems.push(item);
    }
  }

  const grouped: Record<string, { name: string; brand: string | null; total_grams: number }> = {};
  for (const item of uniqueItems) {
    const planCount = planCounts.find(p => p.planId === item.plan_id)?.count || 1;
    const key = (item.food_name as string).toLowerCase().trim();
    if (!grouped[key]) {
      grouped[key] = { name: item.food_name as string, brand: (item.brand as string) || null, total_grams: 0 };
    }
    grouped[key].total_grams += ((item.grams as number) || ((item.quantity as number) * 100)) * planCount;
  }

  const categoryMap: Record<string, GroceryCategory> = {};
  for (const entry of Object.values(grouped)) {
    const { category, emoji } = categorizeFood(entry.name);
    if (!categoryMap[category]) categoryMap[category] = { category, emoji, items: [] };
    const totalGrams = Math.round(entry.total_grams);
    const displayAmount = totalGrams >= 1000
      ? `${(totalGrams / 1000).toFixed(1)} kg`
      : `${totalGrams} g`;
    categoryMap[category].items.push({
      name: entry.name,
      brand: entry.brand || undefined,
      total_grams: totalGrams,
      display_amount: displayAmount,
    });
  }

  const categoryOrder = ['Proteins', 'Vegetables', 'Fruits', 'Dairy', 'Grains', 'Other'];
  const categories = categoryOrder.filter(c => categoryMap[c]).map(c => categoryMap[c]);
  return { plan_name: rangeLabel, categories };
}
