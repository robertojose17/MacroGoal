import { assertApprox, assertEq, offsetDate, TestResult } from '../helpers.ts';
import { computeTrendWeight } from '../../trendWeight.ts';
import { computeWeightPace } from '../../weightPace.ts';
import { computeProgressStatus } from '../../progressStatus.ts';
import { WeightDataPoint } from '../../weightSource.ts';

export function runTest02(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const base = '2025-01-01';
  const today = '2025-01-30';
  const noise = [+0.8,-1.2,+0.5,-0.9,+1.1,-0.7,+0.3,-1.4,+0.6,-0.8,+1.0,-0.5,+0.7,-1.1,+0.4,-0.9,+1.3,-0.6,+0.8,-1.0,+0.5,-0.7,+1.2,-0.4,+0.9,-1.1,+0.3,-0.8,+0.6,-1.3];

  const points: WeightDataPoint[] = [];
  for (let t = 0; t < 30; t++) {
    points.push({ date: offsetDate(base, t), weightLbs: 180 - t / 7 + noise[t] });
  }

  // currentWeightLbs = last point = 180 - 29/7 + noise[29]
  const lastWeight = 180 - 29 / 7 + noise[29];
  outputs['lastWeight'] = lastWeight;
  // Expected: 180 - 4.142857 - 1.3 = 174.557
  assertApprox(failures, 'currentWeightLbs', lastWeight, 174.557, 0.001);

  const trendWeight = computeTrendWeight(points);
  outputs['trendWeight'] = trendWeight;
  assertApprox(failures, 'trendWeight', trendWeight, 176.606, 0.05);

  const pace = computeWeightPace(points, today);
  outputs['pace'] = pace;

  // pace between -0.91 and -1.09
  if (pace.lbsPerWeek === null || pace.lbsPerWeek > -0.91) {
    failures.push(`pace.lbsPerWeek upper bound: expected <= -0.91, got ${pace.lbsPerWeek}`);
  }
  if (pace.lbsPerWeek === null || pace.lbsPerWeek < -1.09) {
    failures.push(`pace.lbsPerWeek lower bound: expected >= -1.09, got ${pace.lbsPerWeek}`);
  }

  const statusResult = computeProgressStatus(
    pace, 'lose', lastWeight, 160, 2000, 1.0, points, today, 29
  );
  outputs['progressStatus'] = statusResult.progressStatus;
  assertEq(failures, 'progressStatus', statusResult.progressStatus, 'ON_TRACK');

  return { name: 'test02_noisyLoss', passed: failures.length === 0, failures, outputs };
}
