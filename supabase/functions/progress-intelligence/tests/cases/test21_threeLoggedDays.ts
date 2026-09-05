import { assertEq, assertIncludes, assertNotIncludes, offsetDate, TestResult } from '../helpers.ts';
import { computeLoggingReliability, DailyNutrition } from '../../loggingReliability.ts';

export function runTest21(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const today = '2025-01-14';

  // 3 logged days in last 7, 2 meal types each, 1900kcal
  const dailyNutrition: DailyNutrition[] = [
    { date: offsetDate(today, -6), calories: 1900, protein: 150, carbs: 200, fats: 60, mealTypeCount: 2 },
    { date: offsetDate(today, -4), calories: 1900, protein: 150, carbs: 200, fats: 60, mealTypeCount: 2 },
    { date: offsetDate(today, -2), calories: 1900, protein: 150, carbs: 200, fats: 60, mealTypeCount: 2 },
  ];

  const result = computeLoggingReliability(dailyNutrition, today);
  outputs['loggingReliability'] = result.loggingReliability;
  outputs['loggedDaysLast7'] = result.loggedDaysLast7;
  outputs['avgMealsPerLoggedDay'] = result.avgMealsPerLoggedDay;
  outputs['dataQualityFlags'] = result.dataQualityFlags;

  assertEq(failures, 'loggingReliability', result.loggingReliability, 'low');
  assertIncludes(failures, 'dataQualityFlags has LOW_LOGGING_FREQUENCY', result.dataQualityFlags, 'LOW_LOGGING_FREQUENCY');
  // avg = 2.0 >= sparseMealDistributionThreshold=1.5 → NOT sparse
  assertNotIncludes(failures, 'dataQualityFlags no SPARSE_MEAL_DISTRIBUTION', result.dataQualityFlags, 'SPARSE_MEAL_DISTRIBUTION');

  return { name: 'test21_threeLoggedDays', passed: failures.length === 0, failures, outputs };
}
