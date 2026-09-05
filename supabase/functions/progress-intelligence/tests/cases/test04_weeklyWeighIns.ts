import { assertApprox, assertEq, assertNotIncludes, offsetDate, TestResult } from '../helpers.ts';
import { computeWeightPace } from '../../weightPace.ts';
import { WeightDataPoint } from '../../weightSource.ts';

export function runTest04(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const base = '2025-01-01';
  const today = '2025-01-22';

  // 4 weigh-ins at days 0,7,14,21
  const points: WeightDataPoint[] = [
    { date: offsetDate(base, 0), weightLbs: 180.0 },
    { date: offsetDate(base, 7), weightLbs: 179.0 },
    { date: offsetDate(base, 14), weightLbs: 178.0 },
    { date: offsetDate(base, 21), weightLbs: 177.0 },
  ];

  const pace = computeWeightPace(points, today);
  outputs['pace'] = pace;
  assertApprox(failures, 'pace.lbsPerWeek', pace.lbsPerWeek, -1.000, 0.05);
  assertEq(failures, 'pace.confidence', pace.confidence, 'medium');

  // 4 weigh-ins over 21 days — span=21 >= paceMinSpanDays=14, count=4 >= paceMinWeighIns=4
  // but count=4 < highMinWeighIns=8, so confidence='medium' (not sparse)
  // WEIGHT_DATA_SPARSE is checked in assemble, not in pace — just verify pace is valid
  outputs['note'] = 'dataQualityFlags checked in assemble; pace itself is valid with 4 weigh-ins';

  return { name: 'test04_weeklyWeighIns', passed: failures.length === 0, failures, outputs };
}
