import { assertApprox, assertEq, TestResult } from '../helpers.ts';
import { computeTDEE } from '../../tdee.ts';

export function runTest22(): TestResult {
  const failures: string[] = [];
  const outputs: Record<string, unknown> = {};

  const today = '2025-07-01';

  // Profile: sex='male', dob='1990-12-15', height=178cm, current_weight=82kg, activity_level='moderate'
  // today=2025-07-01, birthday Dec 15 NOT yet occurred → age=34
  const profile = {
    sex: 'male',
    date_of_birth: '1990-12-15',
    height: 178,
    current_weight: 82,
    activity_level: 'moderate',
  };

  const tdee = computeTDEE([], profile, today);
  outputs['tdee'] = tdee;

  assertEq(failures, 'tdee.source', tdee.source, 'formula');
  assertEq(failures, 'tdee.confidence', tdee.confidence, 'low');

  // BMR (Mifflin-St Jeor male, age=34):
  // 10*82 + 6.25*178 - 5*34 + 5
  // = 820 + 1112.5 - 170 + 5 = 1767.5
  // TDEE = 1767.5 * 1.55 = 2739.625 ≈ 2740
  assertApprox(failures, 'tdee.value', tdee.value, 2740, 5);

  return { name: 'test22_birthdayNotYet', passed: failures.length === 0, failures, outputs };
}
