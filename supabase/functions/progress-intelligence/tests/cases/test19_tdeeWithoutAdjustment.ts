import { assertEq, TestResult } from '../helpers.ts';
import { computeTDEE } from '../../tdee.ts';

export function runTest19(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const today = '2025-01-31';

  // 2 tdee rows — adjustment_applied is irrelevant for computeTDEE (uses estimated_tdee + skip_reason)
  const tdeeEstimates = [
    {
      week_start: '2025-01-24',
      estimated_tdee: 2400,
      skip_reason: null,
      adjustment_applied: false,
      data_days_count: 6,
    },
    {
      week_start: '2025-01-17',
      estimated_tdee: 2350,
      skip_reason: null,
      adjustment_applied: true,
      data_days_count: 5,
    },
  ];

  const tdee = computeTDEE(tdeeEstimates, null, today);
  outputs['tdee'] = tdee;

  // Most recent valid row is week_start='2025-01-24' with estimated_tdee=2400
  assertEq(failures, 'tdee.value', tdee.value, 2400);
  assertEq(failures, 'tdee.source', tdee.source, 'observed');

  return { name: 'test19_tdeeWithoutAdjustment', passed: failures.length === 0, failures, outputs };
}
