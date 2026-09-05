import { assertEq, TestResult } from '../helpers.ts';
import { hasTargetIntegrityConflict } from '../../historicalTargets.ts';

export function runTest23(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  // Test A: diff=51 > 50 → flag raised
  const tdeeA = [{
    id: 'tdee-a',
    week_start: '2025-01-17',
    created_at: '2025-01-24T10:00:00Z',
    prescribed_calories: 1850,
    adjustment_amount: -100,
    adjustment_applied: true,
    skip_reason: null,
  }];

  const conflictA = hasTargetIntegrityConflict(1901, tdeeA);
  outputs['conflictA'] = conflictA;
  // |1901 - 1850| = 51 > 50 → true
  assertEq(failures, 'conflictA (diff=51)', conflictA, true);

  // Test B: diff=50 NOT > 50 (strict >) → flag NOT raised
  const tdeeB = [{
    id: 'tdee-b',
    week_start: '2025-01-17',
    created_at: '2025-01-24T10:00:00Z',
    prescribed_calories: 1850,
    adjustment_amount: -100,
    adjustment_applied: true,
    skip_reason: null,
  }];

  const conflictB = hasTargetIntegrityConflict(1900, tdeeB);
  outputs['conflictB'] = conflictB;
  // |1900 - 1850| = 50, NOT > 50 → false
  assertEq(failures, 'conflictB (diff=50)', conflictB, false);

  return { name: 'test23_targetDisagreement', passed: failures.length === 0, failures, outputs };
}
