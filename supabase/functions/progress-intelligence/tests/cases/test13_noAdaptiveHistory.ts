import { assertApprox, assertEq, TestResult } from '../helpers.ts';
import { computeTDEE } from '../../tdee.ts';

export function runTest13(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const today = '2025-07-01';

  // Profile: sex='male', dob='1990-06-15', height=178cm, current_weight=82kg, activity_level='moderate'
  // today=2025-07-01, birthday June 15 passed → age=35
  const profile = {
    sex: 'male',
    date_of_birth: '1990-06-15',
    height: 178,
    current_weight: 82,
    activity_level: 'moderate',
  };

  const tdee = computeTDEE([], profile, today);
  outputs['tdee'] = tdee;

  assertEq(failures, 'tdee.source', tdee.source, 'formula');
  assertEq(failures, 'tdee.confidence', tdee.confidence, 'low');

  // BMR (Mifflin-St Jeor male, age=35):
  // 10*82 + 6.25*178 - 5*35 + 5
  // = 820 + 1112.5 - 175 + 5 = 1762.5
  // TDEE = 1762.5 * 1.55 (moderate) = 2731.875 ≈ 2732
  assertApprox(failures, 'tdee.value', tdee.value, 2732, 5);

  return { name: 'test13_noAdaptiveHistory', passed: failures.length === 0, failures, outputs };
}
