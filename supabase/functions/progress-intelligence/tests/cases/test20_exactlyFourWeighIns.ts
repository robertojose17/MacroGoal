import { assertEq, assertNotIncludes, offsetDate, TestResult } from '../helpers.ts';
import { computeWeightPace } from '../../weightPace.ts';
import { WeightDataPoint } from '../../weightSource.ts';
import { PROGRESS_CONFIG } from '../../config.ts';

export function runTest20(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const base = '2025-01-01';
  const today = '2025-01-30';

  // 4 weigh-ins at days 0,10,20,29
  const points: WeightDataPoint[] = [
    { date: offsetDate(base, 0), weightLbs: 180.0 },
    { date: offsetDate(base, 10), weightLbs: 178.6 },
    { date: offsetDate(base, 20), weightLbs: 177.2 },
    { date: offsetDate(base, 29), weightLbs: 175.9 },
  ];

  const pace = computeWeightPace(points, today);
  outputs['pace'] = pace;

  // 4 weigh-ins, span=29 days >= paceMinSpanDays=14 → valid pace
  // count=4 < highMinWeighIns=8 → confidence='medium'
  assertEq(failures, 'pace.confidence', pace.confidence, 'medium');

  // WEIGHT_DATA_SPARSE check: 4 points in last 30 days >= sparseMinWeighIns=4 → NOT sparse
  const sparseWindowCutoff = new Date(today + 'T00:00:00Z');
  sparseWindowCutoff.setDate(sparseWindowCutoff.getDate() - PROGRESS_CONFIG.weightDataSparseWindowDays);
  const sparseWindowStr = sparseWindowCutoff.toISOString().split('T')[0];
  const recentWeighIns = points.filter(p => p.date >= sparseWindowStr);
  outputs['recentWeighInsCount'] = recentWeighIns.length;

  if (recentWeighIns.length < PROGRESS_CONFIG.weightDataSparseMinWeighIns) {
    failures.push(`WEIGHT_DATA_SPARSE: expected NOT sparse with ${recentWeighIns.length} weigh-ins in last 30 days`);
  }

  return { name: 'test20_exactlyFourWeighIns', passed: failures.length === 0, failures, outputs };
}
