import { createRequestController, decodeRequestIdentity, fail, finite, NutritionGoalRequestError, preservedGoalKeys, readGoal, record, sameFields } from './nutritionGoalRequest';
import type { GoalRow, RequestIdentity, RequestOptions } from './nutritionGoalRequest';
export type JourneyRestartInput = RequestIdentity & { expectedGoal: GoalRow; startDate: string; startWeightKg: number; currentWeightKg: number; activityLevel: string };
export function createJourneyRestartController(options: RequestOptions) {
  return createRequestController(options, (input: JourneyRestartInput, requestId) => {
    if (!input.expectedGoal || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || new Date(input.startDate + 'T00:00:00Z').toISOString().slice(0, 10) !== input.startDate ||
      !finite(input.startWeightKg) || input.startWeightKg < 20 || input.startWeightKg > 500 || !finite(input.currentWeightKg) || input.currentWeightKg < 20 || input.currentWeightKg > 500 ||
      !['sedentary', 'light', 'moderate', 'active', 'very_active'].includes(input.activityLevel)) fail('invalid_restart_input');
    return { p_request_id: requestId, p_start_date: input.startDate, p_start_weight_kg: input.startWeightKg,
      p_current_weight_kg: input.currentWeightKg, p_activity_level: input.activityLevel, p_expected_goal_id: input.expectedGoal.id,
      p_expected_goal_updated_at: input.expectedGoal.updated_at, p_expected_user_id: input.userId,
      p_expected_profile_updated_at: input.expectedProfileUpdatedAt };
  }, async (payload, input) => {
    const { data, error } = await options.client.rpc('restart_accepted_nutrition_journey_v1', payload);
    if (error) throw error;
    if (!record(data) || typeof data.goal_id !== 'string' || !data.goal_id || data.goal_id === input.expectedGoal.id ||
      data.request_id !== payload.p_request_id || data.journey_start_date !== input.startDate || typeof data.replayed !== 'boolean') throw new NutritionGoalRequestError('restart_receipt_unverified', 'READBACK', true);
    const goal = await readGoal(options.client, input.userId);
    if (goal.id !== data.goal_id || goal.updated_at === null || goal.created_at !== goal.updated_at || !sameFields(goal, input.expectedGoal, preservedGoalKeys) || goal.base_daily_calories !== input.expectedGoal.daily_calories ||
      goal.last_adaptive_update !== null || goal.start_date !== input.startDate || goal.start_journey_date !== input.startDate) throw new NutritionGoalRequestError('restart_goal_unverified', 'READBACK', true);
    const { data: profile, error: profileError } = await options.client.from('users').select('*').eq('id', input.userId).maybeSingle();
    if (profileError || !profile || profile.id !== input.userId || profile.journey_start_date !== input.startDate || profile.journey_start_weight !== input.startWeightKg ||
      profile.current_weight !== input.currentWeightKg || profile.activity_level !== input.activityLevel) throw new NutritionGoalRequestError('restart_profile_unverified', 'READBACK', true);
    return goal;
  }, { operation: 'restart', decode: decodeSavedJourneyRestart });
}

function decodeSavedJourneyRestart(value: unknown, current: () => boolean): JourneyRestartInput {
  const identity=decodeRequestIdentity(value,current);
  if (!record(value) || Object.keys(value).some(k => !['userId','expectedProfileUpdatedAt','expectedGoal','startDate','startWeightKg','currentWeightKg','activityLevel'].includes(k)) || !identity.expectedGoal || typeof value.startDate !== 'string' || !finite(value.startWeightKg) || !finite(value.currentWeightKg) || typeof value.activityLevel !== 'string') fail('invalid_saved_request');
  return {...identity,expectedGoal:identity.expectedGoal,startDate:value.startDate,startWeightKg:value.startWeightKg,currentWeightKg:value.currentWeightKg,activityLevel:value.activityLevel};
}
