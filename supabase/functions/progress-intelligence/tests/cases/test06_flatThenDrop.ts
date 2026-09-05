import { assertEq, offsetDate, TestResult } from '../helpers.ts';
import { computeWeightPace } from '../../weightPace.ts';
import { computeProgressStatus } from '../../progressStatus.ts';
import { WeightDataPoint } from '../../weightSource.ts';

export function runTest06(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const base = '2025-01-01';
  const today = '2025-01-30';

  // Days 0-19: 180.0, Days 20-29: 180.0 - (day-19)/5
  const points: WeightDataPoint[] = [];
  for (let t = 0; t < 30; t++) {
    const w = t < 20 ? 180.0 : 180.0 - (t - 19) / 5;
    points.push({ date: offsetDate(base, t), weightLbs: w });
  }

  const pace = computeWeightPace(points, today);
  outputs['pace'] = pace;

  const lastPoint = points[points.length - 1];
  const statusResult = computeProgressStatus(
    pace, 'lose', lastPoint.weightLbs, 160, 2000, 1.0, points, today, 29
  );
  outputs['progressStatus'] = statusResult.progressStatus;
  outputs['possiblePlateau'] = statusResult.possiblePlateau;

  // The 10-day flat period followed by a 10-day drop averages out to a pace of ~-0.509 lbs/week.
  // ON_TRACK range: [-(1.0 × 1.5), -(1.0 × 0.5)] = [-1.5, -0.5]. -0.509 is within range → ON_TRACK.
  assertEq(failures, 'progressStatus', statusResult.progressStatus, 'ON_TRACK');
  assertEq(failures, 'possiblePlateau', statusResult.possiblePlateau, false);

  return { name: 'test06_flatThenDrop', passed: failures.length === 0, failures, outputs };
}
