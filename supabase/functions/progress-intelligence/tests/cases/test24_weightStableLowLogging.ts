import { assertEq, offsetDate, TestResult } from '../helpers.ts';
import { computeWeightPace } from '../../weightPace.ts';
import { computeProgressStatus } from '../../progressStatus.ts';
import { computeLoggingReliability, DailyNutrition } from '../../loggingReliability.ts';
import { WeightDataPoint } from '../../weightSource.ts';

export function runTest24(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const today = '2025-01-30';
  const journeyStartDate = offsetDate(today, -30);

  // 30 daily weigh-ins all at 180.0
  const points: WeightDataPoint[] = [];
  for (let t = 0; t < 30; t++) {
    points.push({ date: offsetDate(journeyStartDate, t), weightLbs: 180.0 });
  }

  const pace = computeWeightPace(points, today);
  outputs['pace'] = pace;

  // daysSinceJourneyStart = 30 >= plateauMinDays=21 → plateau check runs
  const statusResult = computeProgressStatus(
    pace, 'lose', 180.0, 160, 2000, 1.0, points, today, 30
  );
  outputs['progressStatus'] = statusResult.progressStatus;
  outputs['possiblePlateau'] = statusResult.possiblePlateau;

  assertEq(failures, 'progressStatus', statusResult.progressStatus, 'WEIGHT_STABLE');
  assertEq(failures, 'possiblePlateau', statusResult.possiblePlateau, true);

  // 3 logged days in last 7 → loggingReliability='low'
  const dailyNutrition: DailyNutrition[] = [
    { date: offsetDate(today, -6), calories: 1900, protein: 150, carbs: 200, fats: 60, mealTypeCount: 2 },
    { date: offsetDate(today, -4), calories: 1900, protein: 150, carbs: 200, fats: 60, mealTypeCount: 2 },
    { date: offsetDate(today, -2), calories: 1900, protein: 150, carbs: 200, fats: 60, mealTypeCount: 2 },
  ];

  const loggingResult = computeLoggingReliability(dailyNutrition, today);
  outputs['loggingReliability'] = loggingResult.loggingReliability;
  assertEq(failures, 'loggingReliability', loggingResult.loggingReliability, 'low');

  const lowLoggingReliability = loggingResult.loggingReliability === 'low' || loggingResult.loggingReliability === 'insufficient';
  outputs['lowLoggingReliability'] = lowLoggingReliability;
  assertEq(failures, 'lowLoggingReliability', lowLoggingReliability, true);

  return { name: 'test24_weightStableLowLogging', passed: failures.length === 0, failures, outputs };
}
