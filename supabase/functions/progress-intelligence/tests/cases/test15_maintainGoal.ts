import { assertEq, offsetDate, TestResult } from '../helpers.ts';
import { computeWeightPace } from '../../weightPace.ts';
import { computeProgressStatus } from '../../progressStatus.ts';
import { computeLoggingReliability, DailyNutrition } from '../../loggingReliability.ts';
import { WeightDataPoint } from '../../weightSource.ts';

export function runTest15(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const base = '2025-01-01';
  const today = '2025-01-22';

  // 8 weigh-ins every 3 days
  const values = [175.0, 175.3, 174.8, 175.2, 174.9, 175.4, 175.1, 174.7];
  const points: WeightDataPoint[] = values.map((w, i) => ({
    date: offsetDate(base, i * 3),
    weightLbs: w,
  }));

  const pace = computeWeightPace(points, today);
  outputs['pace'] = pace;

  // goalType='maintain', intendedLossRate=0, target=2200
  const lastPoint = points[points.length - 1];
  const statusResult = computeProgressStatus(
    pace, 'maintain', lastPoint.weightLbs, null, 2200, 0, points, today, 21
  );
  outputs['progressStatus'] = statusResult.progressStatus;
  outputs['possiblePlateau'] = statusResult.possiblePlateau;

  assertEq(failures, 'progressStatus', statusResult.progressStatus, 'MAINTAINING');
  assertEq(failures, 'possiblePlateau', statusResult.possiblePlateau, false);

  // Food: 2150kcal/170g, 6/7 days logged
  const dailyNutrition: DailyNutrition[] = [];
  for (let i = 0; i < 6; i++) {
    dailyNutrition.push({
      date: offsetDate(today, -(6 - i)),
      calories: 2150,
      protein: 170,
      carbs: 230,
      fats: 75,
      mealTypeCount: 3,
    });
  }

  const loggingResult = computeLoggingReliability(dailyNutrition, today);
  outputs['loggingReliability'] = loggingResult.loggingReliability;
  // 6 logged days in last 7 — should be 'medium' (6 >= loggingMediumMinDaysLast7=4, but avg meals=3 >= 2.5 → high? check)
  // Actually 6 >= loggingHighMinDaysLast7=5 and avgMeals=3 >= 2.5 → 'high'
  // But no very low/high days → 'high'
  outputs['loggedDaysLast7'] = loggingResult.loggedDaysLast7;

  return { name: 'test15_maintainGoal', passed: failures.length === 0, failures, outputs };
}
