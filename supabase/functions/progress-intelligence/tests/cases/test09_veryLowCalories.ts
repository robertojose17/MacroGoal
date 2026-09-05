import { assertApprox, assertIncludes, offsetDate, TestResult } from '../helpers.ts';
import { computeLoggingReliability, DailyNutrition } from '../../loggingReliability.ts';
import { buildTargetTimeline } from '../../historicalTargets.ts';
import { computeAdherence } from '../../adherence.ts';

export function runTest09(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const today = '2025-01-14';

  // 14 logged days: days 0-13 from '2025-01-01'
  // Days 0-12: 1900kcal/155g/3 meal types
  // Day 13 (today): 350kcal/30g/1 meal type
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
    calories: 350,
    protein: 30,
    carbs: 40,
    fats: 10,
    mealTypeCount: 1,
  });

  const loggingResult = computeLoggingReliability(dailyNutrition, today);
  outputs['dataQualityFlags'] = loggingResult.dataQualityFlags;
  assertIncludes(failures, 'dataQualityFlags has VERY_LOW_RECORDED_INTAKE', loggingResult.dataQualityFlags, 'VERY_LOW_RECORDED_INTAKE');

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

  // 13 days at 1900kcal (within 15% of 2000): calorie adherent
  // 1 day at 350kcal: not adherent
  // protein: 155g >= 150*0.85=127.5 → adherent for 13 days; 30g < 127.5 → not adherent for 1 day
  // score per day = 0.75*cal + 0.25*prot
  // 13 days: 0.75*1 + 0.25*1 = 1.0
  // 1 day: 0.75*0 + 0.25*0 = 0.0
  // total = 13.0 / 14 = 0.9286
  assertApprox(failures, 'adherence.score', adherence.score, 0.929, 0.01);

  return { name: 'test09_veryLowCalories', passed: failures.length === 0, failures, outputs };
}
