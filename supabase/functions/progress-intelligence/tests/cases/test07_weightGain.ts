import { assertApprox, assertEq, offsetDate, TestResult } from '../helpers.ts';
import { computeWeightPace } from '../../weightPace.ts';
import { computeProgressStatus } from '../../progressStatus.ts';
import { WeightDataPoint } from '../../weightSource.ts';

export function runTest07(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const base = '2025-01-01';
  const today = '2025-01-22';

  // 8 weigh-ins every 3 days
  const values = [180.0, 180.13, 180.26, 180.39, 180.52, 180.65, 180.78, 180.91];
  const points: WeightDataPoint[] = values.map((w, i) => ({
    date: offsetDate(base, i * 3),
    weightLbs: w,
  }));

  const pace = computeWeightPace(points, today);
  outputs['pace'] = pace;
  assertApprox(failures, 'pace.lbsPerWeek', pace.lbsPerWeek, 0.303, 0.02);

  const lastPoint = points[points.length - 1];
  const statusResult = computeProgressStatus(
    pace, 'lose', lastPoint.weightLbs, 160, 2000, 1.0, points, today, 21
  );
  outputs['progressStatus'] = statusResult.progressStatus;
  assertEq(failures, 'progressStatus', statusResult.progressStatus, 'TRENDING_UP');

  return { name: 'test07_weightGain', passed: failures.length === 0, failures, outputs };
}
