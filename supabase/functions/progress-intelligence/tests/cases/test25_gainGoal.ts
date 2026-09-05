import { assertEq, offsetDate, TestResult } from '../helpers.ts';
import { computeWeightPace } from '../../weightPace.ts';
import { computeProgressStatus } from '../../progressStatus.ts';
import { computeProjection } from '../../projection.ts';
import { WeightDataPoint } from '../../weightSource.ts';

export function runTest25(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const base = '2025-01-01';
  const today = '2025-01-22';

  // Adequate weigh-ins: 8 over 21 days
  const points: WeightDataPoint[] = [];
  for (let i = 0; i < 8; i++) {
    points.push({ date: offsetDate(base, i * 3), weightLbs: 150 + i * 0.2 });
  }

  const pace = computeWeightPace(points, today);
  outputs['pace'] = pace;

  // goalType='gain'
  const lastPoint = points[points.length - 1];
  const statusResult = computeProgressStatus(
    pace, 'gain', lastPoint.weightLbs, 165, 2500, null, points, today, 21
  );
  outputs['progressStatus'] = statusResult.progressStatus;
  assertEq(failures, 'progressStatus', statusResult.progressStatus, 'INSUFFICIENT_DATA');

  // gainGoalLimitedSupport = true (goalType === 'gain')
  const gainGoalLimitedSupport = true;
  outputs['gainGoalLimitedSupport'] = gainGoalLimitedSupport;
  assertEq(failures, 'gainGoalLimitedSupport', gainGoalLimitedSupport, true);

  // projection.projectionBasis = 'none' for gain goal
  const projection = computeProjection(lastPoint.weightLbs, 165, pace, null, 'gain', today);
  outputs['projection'] = projection;
  assertEq(failures, 'projection.projectionBasis', projection.projectionBasis, 'none');

  return { name: 'test25_gainGoal', passed: failures.length === 0, failures, outputs };
}
