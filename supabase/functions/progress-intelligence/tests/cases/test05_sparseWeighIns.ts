import { assertNull, assertEq, assertIncludes, offsetDate, TestResult } from '../helpers.ts';
import { computeWeightPace } from '../../weightPace.ts';
import { computeProgressStatus } from '../../progressStatus.ts';
import { WeightDataPoint } from '../../weightSource.ts';
import { PROGRESS_CONFIG } from '../../config.ts';

export function runTest05(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const base = '2025-01-01';
  const today = '2025-01-21';

  // Only 2 weigh-ins — below paceMinWeighIns=4
  const points: WeightDataPoint[] = [
    { date: offsetDate(base, 0), weightLbs: 180.0 },
    { date: offsetDate(base, 20), weightLbs: 177.0 },
  ];

  const pace = computeWeightPace(points, today);
  outputs['pace'] = pace;
  assertNull(failures, 'pace.lbsPerWeek', pace.lbsPerWeek);
  assertNull(failures, 'pace.confidence', pace.confidence);

  const statusResult = computeProgressStatus(
    pace, 'lose', 177.0, 160, 2000, 1.0, points, today, 20
  );
  outputs['progressStatus'] = statusResult.progressStatus;
  assertEq(failures, 'progressStatus', statusResult.progressStatus, 'INSUFFICIENT_DATA');

  // WEIGHT_DATA_SPARSE: check via assemble logic — 2 points in last 30 days < sparseMinWeighIns=4
  const sparseWindowCutoff = new Date(today + 'T00:00:00Z');
  sparseWindowCutoff.setDate(sparseWindowCutoff.getDate() - PROGRESS_CONFIG.weightDataSparseWindowDays);
  const sparseWindowStr = sparseWindowCutoff.toISOString().split('T')[0];
  const recentWeighIns = points.filter(p => p.date >= sparseWindowStr);
  const isSparse = recentWeighIns.length < PROGRESS_CONFIG.weightDataSparseMinWeighIns;
  outputs['isSparse'] = isSparse;
  if (!isSparse) {
    failures.push('WEIGHT_DATA_SPARSE: expected sparse condition to be true with 2 weigh-ins');
  }

  return { name: 'test05_sparseWeighIns', passed: failures.length === 0, failures, outputs };
}
