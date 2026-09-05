import { createClient } from "npm:@supabase/supabase-js@2";

export function createSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface UserProfile {
  id: string;
  sex: string | null;
  date_of_birth: string | null;
  height: number | null;
  current_weight: number | null;
  goal_weight: number | null;
  activity_level: string | null;
  weight_unit: string | null;
  journey_start_date: string | null;
  journey_start_weight: number | null;
  preferred_units: string | null;
}

export interface GoalRow {
  id: string;
  daily_calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fats_g: number | null;
  goal_type: string | null;
  loss_rate_lbs_per_week: number | null;
  macro_preset: string | null;
  base_daily_calories: number | null;
  last_adaptive_update: string | null;
  created_at: string;
  is_active: boolean;
  start_date: string | null;
}

export interface TdeeEstimateRow {
  id: string;
  week_start: string;
  created_at: string;
  estimated_tdee: number | null;
  prescribed_calories: number | null;
  adjustment_amount: number | null;
  adjustment_applied: boolean;
  skip_reason: string | null;
  avg_calories_eaten: number | null;
  avg_weight_lbs: number | null;
  data_days_count: number | null;
}

export interface NutritionMealRow {
  date: string;
  meal_type: string;
  meal_items: Array<{ calories: number; protein: number; carbs: number; fats: number }> | null;
}

export async function fetchAllData(
  supabase: ReturnType<typeof createSupabaseClient>,
  userId: string
) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const fourteenDaysAgoStr = fourteenDaysAgo.toISOString().split('T')[0];

  const { data: trackerData } = await supabase
    .from('trackers')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', 'weight')
    .limit(1)
    .maybeSingle();

  const weightTrackerId = trackerData?.id ?? null;

  const [
    profileResult,
    activeGoalResult,
    allGoalsResult,
    trackerResult,
    checkInResult,
    nutritionResult,
    tdeeResult,
  ] = await Promise.all([
    supabase
      .from('users')
      .select('id, sex, date_of_birth, height, current_weight, goal_weight, activity_level, weight_unit, journey_start_date, journey_start_weight, preferred_units')
      .eq('id', userId)
      .maybeSingle(),

    supabase
      .from('goals')
      .select('id, daily_calories, protein_g, carbs_g, fats_g, goal_type, loss_rate_lbs_per_week, macro_preset, base_daily_calories, last_adaptive_update, created_at, is_active, start_date')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle(),

    supabase
      .from('goals')
      .select('id, daily_calories, protein_g, base_daily_calories, created_at, is_active')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),

    weightTrackerId
      ? supabase
          .from('tracker_entries')
          .select('date, value')
          .eq('user_id', userId)
          .eq('tracker_id', weightTrackerId)
          .order('date', { ascending: true })
          .limit(200)
      : Promise.resolve({ data: [], error: null }),

    supabase
      .from('check_ins')
      .select('date, weight, updated_at')
      .eq('user_id', userId)
      .not('weight', 'is', null)
      .order('date', { ascending: true })
      .order('updated_at', { ascending: false })
      .limit(400),

    supabase
      .from('meals')
      .select('date, meal_type, meal_items(calories, protein, carbs, fats)')
      .eq('user_id', userId)
      .gte('date', fourteenDaysAgoStr)
      .lte('date', todayStr),

    supabase
      .from('tdee_estimates')
      .select('id, week_start, created_at, estimated_tdee, prescribed_calories, adjustment_amount, adjustment_applied, skip_reason, avg_calories_eaten, avg_weight_lbs, data_days_count')
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(8),
  ]);

  return {
    profile: profileResult.data as UserProfile | null,
    activeGoal: activeGoalResult.data as GoalRow | null,
    allGoals: (allGoalsResult.data ?? []) as GoalRow[],
    trackerWeights: (trackerResult.data ?? []) as Array<{ date: string; value: number }>,
    checkInWeights: (checkInResult.data ?? []) as Array<{ date: string; weight: number; updated_at: string }>,
    nutritionRaw: (nutritionResult.data ?? []) as NutritionMealRow[],
    tdeeEstimates: (tdeeResult.data ?? []) as TdeeEstimateRow[],
    todayStr,
    fourteenDaysAgoStr,
  };
}
