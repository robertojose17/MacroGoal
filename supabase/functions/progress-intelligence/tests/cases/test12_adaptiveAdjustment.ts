import { assertApprox, assertEq, assertNotIncludes, offsetDate, TestResult } from '../helpers.ts';
import { computeLoggingReliability, DailyNutrition } from '../../loggingReliability.ts';
import { buildTargetTimeline, getTargetOnDate } from '../../historicalTargets.ts';
import { computeAdherence } from '../../adherence.ts';

export function runTest12(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const today = '2025-01-31';

  // Goal: created Jan 1, daily_calories=1850, protein=150, base_daily_calories=null
  const goals = [{
    id: 'goal-1',
    daily_calories: 1850,
    protein_g: 150,
    base_daily_calories: null,
    created_at: '2025-01-01T00:00:00Z',
    is_active: true,
  }];

  // tdee row: week_start='2025-01-10', created_at='2025-01-17T10:00:00Z'
  // prescribed_calories=1850, adjustment_amount=-150, adjustment_applied=true
  // estimated_tdee=2350, data_days_count=6
  const tdeeEstimates = [{
    id: 'tdee-1',
    week_start: '2025-01-10',
    created_at: '2025-01-17T10:00:00Z',
    prescribed_calories: 1850,
    adjustment_amount: -150,
    adjustment_applied: true,
    skip_reason: null,
    estimated_tdee: 2350,
    avg_calories_eaten: 1900,
    avg_weight_lbs: 178.5,
    data_days_count: 6,
  }];

  const timeline = buildTargetTimeline(goals, tdeeEstimates);
  outputs['timeline'] = timeline;

  // Verify timeline:
  // Jan 1: base target = prescribed(1850) - adjustment(-150) = 2000
  // Jan 17: adaptive adjustment → 1850
  const jan1Target = getTargetOnDate(timeline, '2025-01-01');
  const jan16Target = getTargetOnDate(timeline, '2025-01-16');
  const jan17Target = getTargetOnDate(timeline, '2025-01-17');
  const jan31Target = getTargetOnDate(timeline, '2025-01-31');

  outputs['jan1Target'] = jan1Target;
  outputs['jan16Target'] = jan16Target;
  outputs['jan17Target'] = jan17Target;
  outputs['jan31Target'] = jan31Target;

  assertEq(failures, 'jan1Target.calorieTarget', jan1Target.calorieTarget, 2000);
  assertEq(failures, 'jan16Target.calorieTarget', jan16Target.calorieTarget, 2000);
  assertEq(failures, 'jan17Target.calorieTarget', jan17Target.calorieTarget, 1850);
  assertEq(failures, 'jan31Target.calorieTarget', jan31Target.calorieTarget, 1850);

  // Food: 1900kcal/155g all 14 days
  const dailyNutrition: DailyNutrition[] = [];
  for (let i = 0; i < 14; i++) {
    dailyNutrition.push({
      date: offsetDate(today, -(13 - i)),
      calories: 1900,
      protein: 155,
      carbs: 200,
      fats: 60,
      mealTypeCount: 3,
    });
  }

  const loggingResult = computeLoggingReliability(dailyNutrition, today);
  assertNotIncludes(failures, 'no LOW_LOGGING_FREQUENCY', loggingResult.dataQualityFlags, 'LOW_LOGGING_FREQUENCY');

  const adherence = computeAdherence(dailyNutrition, timeline, loggingResult.loggingReliability, today);
  outputs['adherence'] = adherence;

  // All 14 days (Jan 18-31): target=1850, 1900 within 15% (1572-2127) → adherent
  // protein: 155g >= 150*0.85=127.5 → adherent
  assertApprox(failures, 'adherence.score', adherence.score, 1.0, 0.001);

  // lastAdaptiveAdjustment.adjustmentKcal = -150
  const lastAdj = tdeeEstimates.filter(t => t.adjustment_applied && t.prescribed_calories !== null)
    .sort((a, b) => b.week_start.localeCompare(a.week_start))[0];
  outputs['adjustmentKcal'] = lastAdj?.adjustment_amount;
  assertEq(failures, 'adjustmentKcal', lastAdj?.adjustment_amount, -150);

  return { name: 'test12_adaptiveAdjustment', passed: failures.length === 0, failures, outputs };
}
