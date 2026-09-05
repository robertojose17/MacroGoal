import { assertApprox, assertIncludes, offsetDate, TestResult } from '../helpers.ts';
import { computeLoggingReliability, DailyNutrition } from '../../loggingReliability.ts';
import { buildTargetTimeline } from '../../historicalTargets.ts';
import { computeAdherence } from '../../adherence.ts';

export function runTest10(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const today = '2025-01-14';

  // Days 0-12: 1900kcal/155g/3 meal types
  // Day 13 (today): 4800kcal/200g/4 meal types
  const dailyNutrition: DailyNutrition[] = [];
  for (let i = 0; i < 13; i++) {
    dailyNutrition.push({
      date: offsetDate('2025-01-01', i),
      calories: 1900,
      protein: 155,
      carbs: 200,
      fats: 60,
      mealTypeCount: 3,
    });
  }
  dailyNutrition.push({
    date: '2025-01-14',
    calories: 4800,
    protein: 200,
    carbs: 500,
    fats: 150,
    mealTypeCount: 4,
  });

  const loggingResult = computeLoggingReliability(dailyNutrition, today);
  outputs['dataQualityFlags'] = loggingResult.dataQualityFlags;
  assertIncludes(failures, 'dataQualityFlags has VERY_HIGH_RECORDED_INTAKE', loggingResult.dataQualityFlags, 'VERY_HIGH_RECORDED_INTAKE');

  // Goal: 2000kcal, protein=150g
  const goals = [{
    id: 'goal-1',
    daily_calories: 2000,
    protein_g: 150,
    base_daily_calories: null,
    created_at: '2025-01-01T00:00:00Z',
    is_active: true,
  }];
  const timeline = buildTargetTimeline(goals, []);
  const adherence = computeAdherence(dailyNutrition, timeline, loggingResult.loggingReliability, today);
  outputs['adherence'] = adherence;

  // 13 days at 1900kcal: calorie adherent (within 15% of 2000)
  // 1 day at 4800kcal: not calorie adherent (4800 > 2000*1.15=2300)
  // protein: 155g >= 127.5 → adherent for 13 days; 200g >= 127.5 → adherent for 1 day
  // 13 days: 0.75*1 + 0.25*1 = 1.0
  // 1 day: 0.75*0 + 0.25*1 = 0.25
  // total = (13.0 + 0.25) / 14 = 13.25/14 = 0.9464
  assertApprox(failures, 'adherence.score', adherence.score, 0.946, 0.01);

  return { name: 'test10_veryHighCalories', passed: failures.length === 0, failures, outputs };
}
