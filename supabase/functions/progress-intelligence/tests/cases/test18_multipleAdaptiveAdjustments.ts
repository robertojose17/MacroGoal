import { assertApprox, assertEq, offsetDate, TestResult } from '../helpers.ts';
import { computeLoggingReliability, DailyNutrition } from '../../loggingReliability.ts';
import { buildTargetTimeline } from '../../historicalTargets.ts';
import { computeAdherence } from '../../adherence.ts';

export function runTest18(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const today = '2025-01-31';

  // Goal: Dec 1, 1800kcal/140g
  const goals = [{
    id: 'goal-1',
    daily_calories: 1800,
    protein_g: 140,
    base_daily_calories: null,
    created_at: '2024-12-01T00:00:00Z',
    is_active: true,
  }];

  // 4 tdee rows (all adjustment_applied=true)
  const tdeeEstimates = [
    {
      id: 'tdee-1',
      week_start: '2024-12-13',
      created_at: '2024-12-20T10:00:00Z',
      prescribed_calories: 2050,
      adjustment_amount: -50,
      adjustment_applied: true,
      skip_reason: null,
      estimated_tdee: 2550,
      avg_calories_eaten: 2100,
      avg_weight_lbs: 182.0,
      data_days_count: 6,
    },
    {
      id: 'tdee-2',
      week_start: '2024-12-27',
      created_at: '2025-01-03T10:00:00Z',
      prescribed_calories: 1950,
      adjustment_amount: -100,
      adjustment_applied: true,
      skip_reason: null,
      estimated_tdee: 2450,
      avg_calories_eaten: 2000,
      avg_weight_lbs: 181.0,
      data_days_count: 5,
    },
    {
      id: 'tdee-3',
      week_start: '2025-01-10',
      created_at: '2025-01-17T10:00:00Z',
      prescribed_calories: 1850,
      adjustment_amount: -100,
      adjustment_applied: true,
      skip_reason: null,
      estimated_tdee: 2350,
      avg_calories_eaten: 1900,
      avg_weight_lbs: 180.0,
      data_days_count: 6,
    },
    {
      id: 'tdee-4',
      week_start: '2025-01-17',
      created_at: '2025-01-24T10:00:00Z',
      prescribed_calories: 1800,
      adjustment_amount: -50,
      adjustment_applied: true,
      skip_reason: null,
      estimated_tdee: 2300,
      avg_calories_eaten: 1850,
      avg_weight_lbs: 179.0,
      data_days_count: 5,
    },
  ];

  const timeline = buildTargetTimeline(goals, tdeeEstimates);
  outputs['timeline'] = timeline;

  const adaptiveCount = tdeeEstimates.filter(t => t.adjustment_applied && t.prescribed_calories !== null).length;
  outputs['adaptiveAdjustmentCount'] = adaptiveCount;
  assertEq(failures, 'adaptiveAdjustmentCount', adaptiveCount, 4);

  // Food: 1850kcal/145g all 14 days
  const dailyNutrition: DailyNutrition[] = [];
  for (let i = 0; i < 14; i++) {
    dailyNutrition.push({
      date: offsetDate(today, -(13 - i)),
      calories: 1850,
      protein: 145,
      carbs: 200,
      fats: 60,
      mealTypeCount: 3,
    });
  }

  const loggingResult = computeLoggingReliability(dailyNutrition, today);
  const adherence = computeAdherence(dailyNutrition, timeline, loggingResult.loggingReliability, today);
  outputs['adherence'] = adherence;

  // Jan 18-23 (6 days): target=1850 (from Jan 17 adj), 1850 within 15% → adherent
  // Jan 24-31 (8 days): target=1800 (from Jan 24 adj), 1850 within 15% (1530-2070) → adherent
  // protein: 145g >= 140*0.85=119 → adherent all days
  assertApprox(failures, 'adherence.score', adherence.score, 1.0, 0.001);

  return { name: 'test18_multipleAdaptiveAdjustments', passed: failures.length === 0, failures, outputs };
}
