import { assertApprox, assertNull, assertEq, offsetDate, TestResult } from '../helpers.ts';
import { computeLoggingReliability, DailyNutrition } from '../../loggingReliability.ts';
import { buildTargetTimeline } from '../../historicalTargets.ts';
import { computeAdherence } from '../../adherence.ts';

export function runTest16(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const today = '2025-01-14';

  // Goal: daily_calories=2000, protein_g=null
  const goals = [{
    id: 'goal-1',
    daily_calories: 2000,
    protein_g: null,
    base_daily_calories: null,
    created_at: '2025-01-01T00:00:00Z',
    is_active: true,
  }];

  const timeline = buildTargetTimeline(goals, []);
  outputs['timeline'] = timeline;

  // Food: 1900kcal/0g protein, 3 meal types, 7/7 days
  const dailyNutrition: DailyNutrition[] = [];
  for (let i = 0; i < 7; i++) {
    dailyNutrition.push({
      date: offsetDate(today, -(6 - i)),
      calories: 1900,
      protein: 0,
      carbs: 250,
      fats: 80,
      mealTypeCount: 3,
    });
  }

  const loggingResult = computeLoggingReliability(dailyNutrition, today);
  outputs['loggingReliability'] = loggingResult.loggingReliability;

  const adherence = computeAdherence(dailyNutrition, timeline, loggingResult.loggingReliability, today);
  outputs['adherence'] = adherence;

  // No protein target → calorie-only scoring
  // 1900kcal within 15% of 2000 (1700-2300) → adherent all 7 days
  // score = 1.0 (calorie-only, no protein weight)
  assertApprox(failures, 'adherence.score', adherence.score, 1.0, 0.001);
  assertNull(failures, 'adherence.proteinAdherenceFraction', adherence.proteinAdherenceFraction);

  return { name: 'test16_proteinTargetMissing', passed: failures.length === 0, failures, outputs };
}
