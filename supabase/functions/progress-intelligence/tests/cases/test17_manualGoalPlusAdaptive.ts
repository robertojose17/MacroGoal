import { assertApprox, assertNotIncludes, offsetDate, TestResult } from '../helpers.ts';
import { computeLoggingReliability, DailyNutrition } from '../../loggingReliability.ts';
import { buildTargetTimeline } from '../../historicalTargets.ts';
import { computeAdherence } from '../../adherence.ts';

export function runTest17(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const today = '2025-01-31';

  // Goal A: Jan 1, 2200kcal/165g (inactive)
  // Goal B: Jan 12, 1900kcal/150g (active)
  const goals = [
    {
      id: 'goal-a',
      daily_calories: 2200,
      protein_g: 165,
      base_daily_calories: null,
      created_at: '2025-01-01T00:00:00Z',
      is_active: false,
    },
    {
      id: 'goal-b',
      daily_calories: 1900,
      protein_g: 150,
      base_daily_calories: null,
      created_at: '2025-01-12T00:00:00Z',
      is_active: true,
    },
  ];

  // tdee row: week_start='2025-01-17', created_at='2025-01-24T10:00:00Z'
  // prescribed_calories=1900, adjustment_amount=-100, adjustment_applied=true
  const tdeeEstimates = [{
    id: 'tdee-1',
    week_start: '2025-01-17',
    created_at: '2025-01-24T10:00:00Z',
    prescribed_calories: 1900,
    adjustment_amount: -100,
    adjustment_applied: true,
    skip_reason: null,
    estimated_tdee: 2400,
    avg_calories_eaten: 1950,
    avg_weight_lbs: 177.0,
    data_days_count: 5,
  }];

  const timeline = buildTargetTimeline(goals, tdeeEstimates);
  outputs['timeline'] = timeline;

  // Food: 1950kcal/155g all 14 days
  const dailyNutrition: DailyNutrition[] = [];
  for (let i = 0; i < 14; i++) {
    dailyNutrition.push({
      date: offsetDate(today, -(13 - i)),
      calories: 1950,
      protein: 155,
      carbs: 210,
      fats: 65,
      mealTypeCount: 3,
    });
  }

  const loggingResult = computeLoggingReliability(dailyNutrition, today);
  outputs['dataQualityFlags'] = loggingResult.dataQualityFlags;
  assertNotIncludes(failures, 'no LOW_LOGGING_FREQUENCY', loggingResult.dataQualityFlags, 'LOW_LOGGING_FREQUENCY');

  const adherence = computeAdherence(dailyNutrition, timeline, loggingResult.loggingReliability, today);
  outputs['adherence'] = adherence;

  // Jan 18-23 (6 days): target=1900 (base for goal B), 1950 within 15% (1615-2185) → adherent
  // Jan 24-31 (8 days): target=1900 (adaptive), 1950 within 15% → adherent
  // protein: 155g >= 150*0.85=127.5 → adherent all days
  assertApprox(failures, 'adherence.score', adherence.score, 1.0, 0.001);

  return { name: 'test17_manualGoalPlusAdaptive', passed: failures.length === 0, failures, outputs };
}
