import { assertApprox, assertEq, assertNotIncludes, offsetDate, TestResult } from '../helpers.ts';
import { computeTrendWeight } from '../../trendWeight.ts';
import { computeWeightPace } from '../../weightPace.ts';
import { computeProgressStatus } from '../../progressStatus.ts';
import { computeLoggingReliability, aggregateNutritionByDay, DailyNutrition } from '../../loggingReliability.ts';
import { buildTargetTimeline } from '../../historicalTargets.ts';
import { computeAdherence } from '../../adherence.ts';
import { WeightDataPoint } from '../../weightSource.ts';

export function runTest01(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const base = '2025-01-01';
  const today = '2025-01-30';

  // 30 daily weigh-ins: w(t) = 180 - t/7
  const points: WeightDataPoint[] = [];
  for (let t = 0; t < 30; t++) {
    points.push({ date: offsetDate(base, t), weightLbs: 180 - t / 7 });
  }

  const trendWeight = computeTrendWeight(points);
  outputs['trendWeight'] = trendWeight;
  assertApprox(failures, 'trendWeight', trendWeight, 176.773, 0.05);

  const pace = computeWeightPace(points, today);
  outputs['pace'] = pace;
  assertApprox(failures, 'pace.lbsPerWeek', pace.lbsPerWeek, -1.000, 0.02);
  assertEq(failures, 'pace.confidence', pace.confidence, 'high');

  // Build nutrition: 1900kcal/155g protein/4 meal types for all 14 days
  const dailyNutrition: DailyNutrition[] = [];
  for (let i = 0; i < 14; i++) {
    dailyNutrition.push({
      date: offsetDate(today, -(13 - i)),
      calories: 1900,
      protein: 155,
      carbs: 200,
      fats: 60,
      mealTypeCount: 4,
    });
  }

  const loggingResult = computeLoggingReliability(dailyNutrition, today);
  outputs['loggingReliability'] = loggingResult.loggingReliability;
  outputs['dataQualityFlags'] = loggingResult.dataQualityFlags;

  // dataQualityFlags should be empty (no low logging, no sparse, no extreme calories)
  assertNotIncludes(failures, 'dataQualityFlags no LOW_LOGGING_FREQUENCY', loggingResult.dataQualityFlags, 'LOW_LOGGING_FREQUENCY');
  assertNotIncludes(failures, 'dataQualityFlags no SPARSE_MEAL_DISTRIBUTION', loggingResult.dataQualityFlags, 'SPARSE_MEAL_DISTRIBUTION');
  assertNotIncludes(failures, 'dataQualityFlags no VERY_LOW_RECORDED_INTAKE', loggingResult.dataQualityFlags, 'VERY_LOW_RECORDED_INTAKE');
  assertNotIncludes(failures, 'dataQualityFlags no VERY_HIGH_RECORDED_INTAKE', loggingResult.dataQualityFlags, 'VERY_HIGH_RECORDED_INTAKE');

  // Build target timeline: goal with 2000kcal, 150g protein
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

  // Status
  const lastPoint = points[points.length - 1];
  const currentWeightLbs = lastPoint.weightLbs;
  const statusResult = computeProgressStatus(
    pace, 'lose', currentWeightLbs, 160, 2000, 1.0, points, today, 29
  );
  outputs['progressStatus'] = statusResult.progressStatus;
  assertEq(failures, 'progressStatus', statusResult.progressStatus, 'ON_TRACK');

  return { name: 'test01_perfectLinear', passed: failures.length === 0, failures, outputs };
}
