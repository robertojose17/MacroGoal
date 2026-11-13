import type { Database } from '@/lib/supabase/types';
import type { ActivityLevel, GoalType } from '@/types';
import { calculateBMR, calculateTDEE, calculateTargetCalories, calculateMacrosWithPreset } from './calculations';
import type { GoalPatch, ProfilePatch, NutritionGoalSaveInput } from './saveNutritionGoal';
import { fail, validGoal } from './nutritionGoalRequest';
type UserRow = Database['public']['Tables']['users']['Row'];
export type OnboardingNutritionForm = {
  dateOfBirth: string; sex: 'male' | 'female' | null; units: 'metric' | 'imperial';
  heightFeet: string; heightInches: string; heightCm: string; weight: string; goalWeight: string;
  goalType: GoalType; lossRateLbsPerWeek: number; activityLevel: ActivityLevel | null;
  dietaryRestrictions: string[]; proteinPreferences: string[]; recipeStyles: string[]; dislikedFoods: string;
};
export type OnboardingNutritionSnapshot = { profile: UserRow; goal: Database['public']['Tables']['goals']['Row'] | null };
function numberText(text: string, min: number, max: number) {
  if (typeof text !== 'string' || !/^\d+(?:\.\d+)?$/.test(text.trim())) fail('invalid_numeric_input');
  const value = Number(text.trim());
  if (!Number.isFinite(value) || value < min || value > max) fail('invalid_numeric_input');
  return value;
}
function dateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
/** Pure preparation only: no persistence, inferred dates, historical backfill or automatic recommendations. */
export function prepareOnboardingNutrition(form: OnboardingNutritionForm, snapshot: OnboardingNutritionSnapshot, now: Date) {
  const stored = snapshot.profile;
  if (!stored || (stored.onboarding_completed !== false && stored.onboarding_completed !== null) || !stored.id || !Number.isFinite(now.getTime()) || !stored.timezone) fail('profile_review_required');
  if (stored.updated_at !== null && !Number.isFinite(Date.parse(stored.updated_at))) fail('profile_review_required');
  if (snapshot.goal !== null && !validGoal(snapshot.goal, stored.id)) fail('goal_review_required');
  let today: string;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: stored.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    today = ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)?.value).join('-');
  } catch { return fail('profile_timezone_required'); }
  if (!dateOnly(today) || !dateOnly(form.dateOfBirth)) fail('date_of_birth_required');
  const age = Number(today.slice(0, 4)) - Number(form.dateOfBirth.slice(0, 4)) - (today.slice(5) < form.dateOfBirth.slice(5) ? 1 : 0);
  if (age < 18 || age > 120 || form.dateOfBirth < `${Number(today.slice(0, 4)) - 120}${today.slice(4)}`) fail('adult_profile_required');
  if (form.sex !== 'male' && form.sex !== 'female') fail('sex_required');
  if (!form.activityLevel || !['sedentary', 'light', 'moderate', 'active', 'very_active'].includes(form.activityLevel)) fail('activity_required');
  if (!['lose', 'gain', 'maintain'].includes(form.goalType) || !['metric', 'imperial'].includes(form.units)) fail('invalid_goal_input');
  if (form.units === 'imperial' && !Number.isInteger(numberText(form.heightFeet, 0, 8))) fail('invalid_height');
  const height = form.units === 'metric' ? numberText(form.heightCm, 100, 250) : (numberText(form.heightFeet, 0, 8) * 12 + numberText(form.heightInches, 0, 11.999)) * 2.54;
  if (!Number.isFinite(height) || height < 100 || height > 250) fail('invalid_height');
  const factor = form.units === 'imperial' ? 0.453592 : 1;
  const weight = numberText(form.weight, 0, 2000) * factor;
  const target = numberText(form.goalWeight, 0, 2000) * factor;
  if (weight < 20 || weight > 500 || target < 20 || target > 500) fail('invalid_weight');
  if ((form.goalType === 'lose' && target >= weight) || (form.goalType === 'gain' && target <= weight) || (form.goalType === 'maintain' && target !== weight)) fail('inconsistent_goal_targets');
  if (form.goalType === 'lose' && ![0.5, 1, 1.5, 2].includes(form.lossRateLbsPerWeek)) fail('invalid_loss_rate');
  const journeyDate = stored.journey_start_date, journeyWeight = stored.journey_start_weight;
  const hasDate = journeyDate !== null, hasWeight = journeyWeight !== null;
  if (hasDate !== hasWeight) fail('profile_review_required');
  if (journeyDate !== null && (typeof journeyDate !== 'string' || !dateOnly(journeyDate) || journeyDate > today || typeof journeyWeight !== 'number' || !Number.isFinite(journeyWeight) || journeyWeight < 20 || journeyWeight > 500)) fail('profile_review_required');
  for (const preferences of [form.dietaryRestrictions, form.proteinPreferences, form.recipeStyles]) {
    if (!Array.isArray(preferences) || preferences.length > 50 || preferences.some(value => typeof value !== 'string' || !value.trim() || value.length > 150)) fail('invalid_preferences');
  }
  if (typeof form.dislikedFoods !== 'string' || form.dislikedFoods.length > 2000) fail('invalid_preferences');
  const calories = calculateTargetCalories(calculateTDEE(calculateBMR(weight, height, age, form.sex), form.activityLevel), form.goalType, form.goalType === 'lose' ? form.lossRateLbsPerWeek : undefined);
  if (calories < (form.sex === 'female' ? 1200 : 1500) || calories > 10000) fail('below_product_reference');
  if (snapshot.goal && calories < snapshot.goal.daily_calories) fail('goal_reduction_requires_review');
  const macros = calculateMacrosWithPreset(calories, weight, 'lean_body');
  if (Object.values(macros).some(n => !Number.isInteger(n) || n < 0 || n > 10000) || Math.abs(macros.protein * 4 + macros.carbs * 4 + macros.fats * 9 - calories) > 10) fail('inconsistent_macro_targets');
  const goal: GoalPatch = { goal_type: form.goalType, goal_intensity: 1, target_weight: target, daily_calories: calories, protein_g: macros.protein, carbs_g: macros.carbs, fats_g: macros.fats, fiber_g: macros.fiber, macro_preset: 'lean_body', loss_rate_lbs_per_week: form.goalType === 'lose' ? form.lossRateLbsPerWeek : null };
  const profile: ProfilePatch = { sex: form.sex, date_of_birth: form.dateOfBirth, height, current_weight: weight, activity_level: form.activityLevel, preferred_units: form.units, dietary_restrictions: [...form.dietaryRestrictions], protein_preferences: [...form.proteinPreferences], recipe_styles: [...form.recipeStyles], disliked_foods: form.dislikedFoods, onboarding_completed: true };
  if (!hasDate && !hasWeight) { profile.journey_start_date = today; profile.journey_start_weight = weight; }
  const weeks = form.goalType === 'maintain' ? 0 : Math.round(Math.abs(weight - target) * 2.20462 / (form.goalType === 'lose' ? form.lossRateLbsPerWeek : 0.5));
  return { goal, profile, preview: { calories, ...macros, weeks }, expectedProfileUpdatedAt: stored.updated_at };
}

/** Presentation of the already accepted request only; no new target calculation. */
export type RecoveredOnboardingPresentation = { weeks: number; units: 'metric' | 'imperial'; goalType: 'lose' | 'gain' | 'maintain'; weightUnit: 'kg' | 'lbs'; weight: string; goalWeight: string; lossRateLbsPerWeek: number };
export function recoveredOnboardingPresentation(input: Pick<NutritionGoalSaveInput, 'operation' | 'goal' | 'profile'> | null): RecoveredOnboardingPresentation | null {
  if (!input) return null;
  const { goal, profile } = input;
  const weight = profile.current_weight, target = goal.target_weight, units = profile.preferred_units, kind = goal.goal_type;
  if (input.operation !== 'initial_onboarding' || typeof weight !== 'number' || !Number.isFinite(weight) || weight < 20 || weight > 500 || typeof target !== 'number' || !Number.isFinite(target) || target < 20 || target > 500 ||
      (units !== 'metric' && units !== 'imperial') || (kind !== 'lose' && kind !== 'gain' && kind !== 'maintain')) fail('saved_onboarding_review_required');
  if ((kind === 'lose' && target >= weight) || (kind === 'gain' && target <= weight) || (kind === 'maintain' && target !== weight)) fail('saved_onboarding_review_required');
  const rate = goal.loss_rate_lbs_per_week;
  if (kind === 'lose' && (typeof rate !== 'number' || ![0.5, 1, 1.5, 2].includes(rate))) fail('saved_onboarding_review_required');
  // Preserve the existing onboarding estimate convention, not a measured TDEE
  // or an adaptive recommendation. No RPC/body is derived from these values.
  const estimateRate = kind === 'lose' && typeof rate === 'number' ? rate : kind === 'gain' ? 0.5 : 0;
  const weeks = kind === 'maintain' ? 0 : Math.round(Math.abs(weight - target) * 2.20462 / estimateRate);
  const factor = units === 'imperial' ? 0.453592 : 1;
  return { weeks, units, goalType: kind, weightUnit: units === 'imperial' ? 'lbs' : 'kg',
    weight: String(weight / factor), goalWeight: String(target / factor), lossRateLbsPerWeek: estimateRate };
}
