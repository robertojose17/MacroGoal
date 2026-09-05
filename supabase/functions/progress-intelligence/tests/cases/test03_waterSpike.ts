import { assertApprox, assertEq, offsetDate, TestResult } from '../helpers.ts';
import { computeTrendWeight } from '../../trendWeight.ts';
import { computeWeightPace } from '../../weightPace.ts';
import { computeProgressStatus } from '../../progressStatus.ts';
import { WeightDataPoint } from '../../weightSource.ts';

export function runTest03(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const base = '2025-01-01';
  const today = '2025-01-22';

  // 8 weigh-ins at days 0,3,6,9,12,15,18,21
  const dayOffsets = [0, 3, 6, 9, 12, 15, 18, 21];
  const values = [180.000, 179.571, 179.143, 178.714, 178.286, 177.857, 177.429, 180.000];

  const points: WeightDataPoint[] = dayOffsets.map((d, i) => ({
    date: offsetDate(base, d),
    weightLbs: values[i],
  }));

  const trendWeight = computeTrendWeight(points);
  outputs['trendWeight'] = trendWeight;
  assertApprox(failures, 'trendWeight', trendWeight, 178.807, 0.005);

  const pace = computeWeightPace(points, today);
  outputs['pace'] = pace;
  assertApprox(failures, 'pace.lbsPerWeek', pace.lbsPerWeek, -0.223, 0.005);

  const statusResult = computeProgressStatus(
    pace, 'lose', 180.000, 160, 2000, 1.0, points, today, 21
  );
  outputs['progressStatus'] = statusResult.progressStatus;
  assertEq(failures, 'progressStatus', statusResult.progressStatus, 'BELOW_TARGET_PACE');

  return { name: 'test03_waterSpike', passed: failures.length === 0, failures, outputs };
}
