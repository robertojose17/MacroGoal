import { assertApprox, assertNotIncludes, offsetDate, TestResult } from '../helpers.ts';
import { computeLoggingReliability, DailyNutrition } from '../../loggingReliability.ts';
import { buildTargetTimeline } from '../../historicalTargets.ts';
import { computeAdherence } from '../../adherence.ts';

export function runTest11(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const today = '2025-01-31';

  // Goal A: Jan 1, 2200kcal/165g protein (inactive)
  // Goal B: Jan 21, 2000kcal/150g protein (active)
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
      daily_calories: 2000,
      protein_g: 150,
      base_daily_calories: null,
      created_at: '2025-01-21T00:00:00Z',
      is_active: true,
    },
  ];

  const timeline = buildTargetTimeline(goals, []);
  outputs['timeline'] = timeline;

  // Food: 2050kcal/155g all 14 days (Jan 18-31)
  const dailyNutrition: DailyNutrition[] = [];
  for (let i = 0; i < 14; i++) {
    dailyNutrition.push({
      date: offsetDate(today, -(13 - i)),
      calories: 2050,
      protein: 155,
      carbs: 220,
      fats: 70,
      mealTypeCount: 3,
    });
  }

  const loggingResult = computeLoggingReliability(dailyNutrition, today);
  outputs['dataQualityFlags'] = loggingResult.dataQualityFlags;
  assertNotIncludes(failures, 'no LOW_LOGGING_FREQUENCY', loggingResult.dataQualityFlags, 'LOW_LOGGING_FREQUENCY');

  const adherence = computeAdherence(dailyNutrition, timeline, loggingResult.loggingReliability, today);
  outputs['adherence'] = adherence;

  // Days Jan 18-20 (3 days): target=2200kcal, 2050 is within 15% (1870-2530) → adherent
  // Days Jan 21-31 (11 days): target=2000kcal, 2050 is within 15% (1700-2300) → adherent
  // protein: 155g >= 165*0.85=140.25 → adherent; 155g >= 150*0.85=127.5 → adherent
  // All 14 days: score = 1.0
  assertApprox(failures, 'adherence.score', adherence.score, 1.0, 0.001);

  return { name: 'test11_goalTargetChange', passed: failures.length === 0, failures, outputs };
}
