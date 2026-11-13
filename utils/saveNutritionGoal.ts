import type { Database } from '@/lib/supabase/types';
import { checkIdentity, decodeRequestIdentity, finite, copyJson, createRequestController, fail, NutritionGoalRequestError, preservedGoalKeys, readGoal, record, sameFields, validGoal } from './nutritionGoalRequest';
import type { GoalRow, RequestIdentity, RequestOptions } from './nutritionGoalRequest';
export type GoalPatch = Partial<Pick<GoalRow, 'goal_type' | 'goal_intensity' | 'target_weight' | 'daily_calories' | 'protein_g' | 'carbs_g' | 'fats_g' | 'fiber_g' | 'loss_rate_lbs_per_week' | 'start_date' | 'start_journey_date' | 'macro_preset'>>;
type UserRow = Database['public']['Tables']['users']['Row'];
export type ProfilePatch = Partial<Pick<UserRow, 'activity_level' | 'sex' | 'date_of_birth' | 'height' | 'current_weight' | 'preferred_units' | 'dietary_restrictions' | 'protein_preferences' | 'recipe_styles' | 'disliked_foods' | 'onboarding_completed' | 'journey_start_date' | 'journey_start_weight'>>;
export type NutritionGoalSaveInput = RequestIdentity & { operation: 'initial_onboarding' | 'manual_goal'; goal: GoalPatch; profile: ProfilePatch };
const allowedGoal = [...preservedGoalKeys, 'start_date', 'start_journey_date'];
export function createNutritionGoalSaveController(options: RequestOptions) {
  return createRequestController(options, (input: NutritionGoalSaveInput, requestId) => {
    checkIdentity(input);
    if (!record(input.goal) || !Object.keys(input.goal).length || Object.keys(input.goal).some(k => !allowedGoal.includes(k)) || !record(input.profile)) fail('invalid_goal_request');
    if (!['manual_goal', 'initial_onboarding'].includes(input.operation)) fail('invalid_goal_operation');
    if (input.operation === 'manual_goal' && Object.keys(input.profile).some(k => k !== 'activity_level')) fail('manual_profile_only');
    const candidate = { ...input.expectedGoal, ...input.goal };
    for (const key of ['daily_calories', 'protein_g', 'carbs_g', 'fats_g', 'fiber_g'] as const) {
      const value = candidate[key];
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10000 || (key === 'daily_calories' && value === 0)) fail('incomplete_goal_targets');
    }
    if (input.expectedGoal && candidate.daily_calories !== undefined && candidate.daily_calories < input.expectedGoal.daily_calories) fail('goal_reduction_requires_review');
    return {
      p_expected_goal_id: input.expectedGoal?.id ?? null, p_expected_updated_at: input.expectedGoal?.updated_at ?? null,
      p_request_id: requestId, p_goal: copyJson(input.goal), p_profile: copyJson(input.profile),
      p_expected_user_id: input.userId, p_expected_profile_updated_at: input.expectedProfileUpdatedAt, p_operation: input.operation,
    };
  }, async (payload, input) => {
    const { data, error } = await options.client.rpc('save_accepted_nutrition_goal_v1', payload);
    if (error) throw error;
    if (!validGoal(data, input.userId) || data.id === input.expectedGoal?.id || data.updated_at === null || data.created_at !== data.updated_at || data.base_daily_calories !== data.daily_calories || data.last_adaptive_update !== null) throw new NutritionGoalRequestError('goal_response_unverified', 'READBACK', true);
    const expected = { ...input.expectedGoal, ...input.goal };
    if (!sameFields(data, expected, ([...preservedGoalKeys, 'start_date', 'start_journey_date'] as const).filter(k => expected[k] !== undefined))) throw new NutritionGoalRequestError('goal_response_mismatch', 'READBACK', true);
    const goal = await readGoal(options.client, input.userId);
    if (goal.id !== data.id || !sameFields(goal, data, [...preservedGoalKeys, 'updated_at', 'created_at', 'start_date', 'start_journey_date', 'base_daily_calories', 'last_adaptive_update'])) throw new NutritionGoalRequestError('goal_changed_after_save', 'READBACK', true);
    const { data: profile, error: profileError } = await options.client.from('users').select('*').eq('id', input.userId).maybeSingle();
    if (profileError || !profile || profile.id !== input.userId) throw new NutritionGoalRequestError('profile_readback_unavailable', 'READBACK', true);
    for (const [key, value] of Object.entries(input.profile)) {
      if (!(key in profile) || JSON.stringify(Reflect.get(profile, key)) !== JSON.stringify(value)) throw new NutritionGoalRequestError('profile_response_mismatch', 'READBACK', true);
    }
    if ('target_weight' in input.goal && profile.goal_weight !== input.goal.target_weight) throw new NutritionGoalRequestError('profile_goal_weight_mismatch', 'READBACK', true);
    return goal;
  }, { operation: 'save', scope: input => input.operation, decode: decodeSavedNutritionGoal });
}

function decodeSavedNutritionGoal(value: unknown, current: () => boolean): NutritionGoalSaveInput {
  const identity = decodeRequestIdentity(value,current);
  if (!record(value) || Object.keys(value).some(k => !['userId','expectedProfileUpdatedAt','expectedGoal','operation','goal','profile'].includes(k)) || (value.operation !== 'manual_goal' && value.operation !== 'initial_onboarding') || !record(value.goal) || !record(value.profile)) fail('invalid_saved_request');
  const goal: GoalPatch = {};
  const numericKeys = ['daily_calories','protein_g','carbs_g','fats_g','fiber_g','goal_intensity','target_weight','loss_rate_lbs_per_week'] as const;
  const nullableKeys = ['goal_intensity','target_weight','loss_rate_lbs_per_week'] as const;
  for (const key of numericKeys) if (key in value.goal) { const v = value.goal[key]; if (finite(v)) goal[key] = v; else if (v !== null || !nullableKeys.some(k => k === key)) fail('invalid_saved_request'); }
  for (const key of nullableKeys) if (value.goal[key] === null) goal[key] = null;
  for (const key of ['goal_type','macro_preset','start_date','start_journey_date'] as const) if (key in value.goal) { const v = value.goal[key]; if (typeof v === 'string') goal[key] = v; else if (v === null && key !== 'goal_type') goal[key] = null; else fail('invalid_saved_request'); }
  if (Object.keys(value.goal).some(k => !allowedGoal.includes(k))) fail('invalid_saved_request');
  const profile: ProfilePatch = {};
  const profileKeys = ['activity_level','sex','date_of_birth','height','current_weight','preferred_units','dietary_restrictions','protein_preferences','recipe_styles','disliked_foods','onboarding_completed','journey_start_date','journey_start_weight'];
  if (Object.keys(value.profile).some(k => !profileKeys.includes(k))) fail('invalid_saved_request');
  for (const key of ['activity_level','sex','date_of_birth','preferred_units','disliked_foods','journey_start_date'] as const) if (key in value.profile) { const v=value.profile[key]; if (typeof v !== 'string' && v !== null) fail('invalid_saved_request'); profile[key]=v; }
  for (const key of ['height','current_weight','journey_start_weight'] as const) if (key in value.profile) { const v=value.profile[key]; if (!finite(v) && v !== null) fail('invalid_saved_request'); profile[key]=v; }
  for (const key of ['dietary_restrictions','protein_preferences','recipe_styles'] as const) if (key in value.profile) { const v=value.profile[key]; if (!Array.isArray(v) || !v.every((item): item is string => typeof item === 'string')) fail('invalid_saved_request'); profile[key]=[...v]; }
  if ('onboarding_completed' in value.profile) { if (typeof value.profile.onboarding_completed !== 'boolean') fail('invalid_saved_request'); profile.onboarding_completed=value.profile.onboarding_completed; }
  return {...identity,operation:value.operation,goal,profile};
}
