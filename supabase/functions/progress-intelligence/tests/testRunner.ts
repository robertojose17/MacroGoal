import { runTest01 } from './cases/test01_perfectLinear.ts';
import { runTest02 } from './cases/test02_noisyLoss.ts';
import { runTest03 } from './cases/test03_waterSpike.ts';
import { runTest04 } from './cases/test04_weeklyWeighIns.ts';
import { runTest05 } from './cases/test05_sparseWeighIns.ts';
import { runTest06 } from './cases/test06_flatThenDrop.ts';
import { runTest07 } from './cases/test07_weightGain.ts';
import { runTest08 } from './cases/test08_missingFoodDays.ts';
import { runTest09 } from './cases/test09_veryLowCalories.ts';
import { runTest10 } from './cases/test10_veryHighCalories.ts';
import { runTest11 } from './cases/test11_goalTargetChange.ts';
import { runTest12 } from './cases/test12_adaptiveAdjustment.ts';
import { runTest13 } from './cases/test13_noAdaptiveHistory.ts';
import { runTest14 } from './cases/test14_legacyCheckIns.ts';
import { runTest15 } from './cases/test15_maintainGoal.ts';
import { runTest16 } from './cases/test16_proteinTargetMissing.ts';
import { runTest17 } from './cases/test17_manualGoalPlusAdaptive.ts';
import { runTest18 } from './cases/test18_multipleAdaptiveAdjustments.ts';
import { runTest19 } from './cases/test19_tdeeWithoutAdjustment.ts';
import { runTest20 } from './cases/test20_exactlyFourWeighIns.ts';
import { runTest21 } from './cases/test21_threeLoggedDays.ts';
import { runTest22 } from './cases/test22_birthdayNotYet.ts';
import { runTest23 } from './cases/test23_targetDisagreement.ts';
import { runTest24 } from './cases/test24_weightStableLowLogging.ts';
import { runTest25 } from './cases/test25_gainGoal.ts';
import { TestResult } from './helpers.ts';

const runners = [
  runTest01, runTest02, runTest03, runTest04, runTest05,
  runTest06, runTest07, runTest08, runTest09, runTest10,
  runTest11, runTest12, runTest13, runTest14, runTest15,
  runTest16, runTest17, runTest18, runTest19, runTest20,
  runTest21, runTest22, runTest23, runTest24, runTest25,
];

let passed = 0;
let failed = 0;
const results: TestResult[] = [];

for (const runner of runners) {
  try {
    const result = runner();
    results.push(result);
    if (result.passed) {
      passed++;
      console.log(`PASS  ${result.name}`);
    } else {
      failed++;
      console.log(`FAIL  ${result.name}`);
      for (const f of result.failures) {
        console.log(`      - ${f}`);
      }
    }
  } catch (err) {
    failed++;
    const name = runner.name.replace('run', '').replace(/^T/, 't');
    console.log(`ERROR ${name}: ${err}`);
    results.push({ name, passed: false, failures: [String(err)], outputs: {} });
  }
}

console.log('');
console.log(`Results: ${passed} passed, ${failed} failed out of ${runners.length} tests`);

if (failed > 0) {
  console.log('');
  console.log('=== FAILED TESTS DETAIL ===');
  for (const r of results) {
    if (!r.passed) {
      console.log(`\n${r.name}:`);
      for (const f of r.failures) {
        console.log(`  - ${f}`);
      }
      if (Object.keys(r.outputs).length > 0) {
        console.log('  outputs:', JSON.stringify(r.outputs, null, 2));
      }
    }
  }
  Deno.exit(1);
}
