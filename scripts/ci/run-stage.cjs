'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = process.cwd();
const stage = process.argv[2];
if (process.argv.length !== 3) throw new Error('Exactly one named validation stage is required.');
const results = path.join(root, '.ci-results');
fs.mkdirSync(results, { recursive: true });
const sensitiveNames = /^(?:EXPO_TOKEN|EAS_ACCESS_TOKEN|SUPABASE_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_PASSWORD|DATABASE_URL|PGPASSWORD|APPLE_ID_PASSWORD|ASC_API_KEY|APP_STORE_CONNECT_API_KEY|OPENROUTER_API_KEY|USDA_API_KEY)$/;
for (const [name, value] of Object.entries(process.env)) {
  if (value && sensitiveNames.test(name)) throw new Error('Validation must run without production credentials: ' + name);
}
const env = { ...process.env, CI: 'true', EXPO_NO_TELEMETRY: '1', EXPO_NO_DOTENV: '1', EXPO_OFFLINE: '1' };
delete env.NODE_OPTIONS;
const local = { ...env, NODE_OPTIONS: '--require=' + path.join(root, 'scripts/ci/offline-node.cjs') };
const candidates = [
  'supabase/functions/lookup-barcode/index.ts',
  'supabase/functions/search-foods/index.ts',
  'supabase/functions/sync-subscription/index.ts',
];
const commands = {
  'install-app': ['pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], env],
  'lint': ['pnpm', ['exec', 'eslint', '.', '--ext', '.js,.jsx,.ts,.tsx,.cjs,.mjs', '--ignore-pattern', 'supabase/functions/**', '--ignore-pattern', 'tests/release-review/fixtures/**'], local],
  'app-types': [process.execPath, ['scripts/ci/check-app-types.cjs'], local],
  'client-regressions': [process.execPath, ['scripts/release-review/check.mjs', '--group', 'client'], { ...local, TYPESCRIPT_MODULE: path.join(root, 'node_modules/typescript'), BARCODE_RECOVERY_NODE_MODULES: path.join(root, 'node_modules') }],
  'backend-components': ['python3', ['scripts/ci/run-backend-components.py'], local],
  'backend-contracts': [process.execPath, ['scripts/release-review/check.mjs', '--group', 'contracts'], { ...local, TYPESCRIPT_MODULE: path.join(root, 'node_modules/typescript'), PGLITE_MODULE: path.join(root, 'scripts/ci/test-tooling/node_modules/@electric-sql/pglite/dist/index.js') }],
  'purchase-regressions': [process.execPath, ['--test', '--test-reporter=tap', 'tests/purchase-reliability.test.cjs', 'tests/sync-subscription.test.cjs'], local],
  'ci-regressions': [process.execPath, ['--test', '--test-reporter=tap', 'tests/ci/deno-lock-generation.test.cjs', 'tests/ci/search-hydration-types.test.cjs', 'tests/ci/validation-scopes.test.cjs', 'tests/dulzura-label-diagnosis.test.mjs', 'tests/source-empty-proposal-diagnosis.test.mjs', 'tests/bilingual-quantity-compatibility.test.mjs', 'tests/serving-association.test.mjs', 'tests/sol-label-handler.test.mjs', 'tests/icon-and-theme-contracts.test.cjs', 'tests/food-library-domain-contracts.test.cjs', 'tests/coach-model-conversation.test.cjs', 'tests/coach-recovery-ui.test.cjs', 'tests/premium-checkpoints.test.cjs', 'tests/tdee-production-controllers.test.cjs', 'tests/onboarding-nutrition.test.cjs', 'tests/onboarding-ui-recovery.test.cjs', 'tests/accepted-goal-recovery.test.cjs', 'tests/generation-goal-recovery.test.cjs', 'tests/native-goal-editors-recovery.test.cjs', 'tests/observed-tdee-client.test.cjs', 'tests/observation-focus-recovery.test.cjs', 'tests/dynamic-calculation-contract.test.cjs', 'tests/native-prebuild-contract.test.cjs', 'tests/observed-snapshot-client.test.cjs', 'tests/observed-snapshot-sql.test.cjs', 'tests/adaptive-transaction-model.test.mjs', 'tests/adaptive-tdee-hook-lifecycle.test.cjs', 'release-candidates/revenuecat-entitlement-reconciliation/atomic-model.test.mjs', 'tests/adaptive-api-contract.test.mjs', 'tests/adaptive-proposal-producer.test.mjs', 'tests/adaptive-source-reader.test.mjs', 'tests/adaptive-tdee-journal.test.cjs', 'tests/adaptive-tdee-review-client.test.cjs', 'release-candidates/revenuecat-entitlement-reconciliation/test.mjs', 'tests/tdee-adaptive-proposal.test.cjs', 'tests/tdee-adaptive-acceptance.test.cjs', 'tests/tdee-source-barrier-contract.test.cjs', 'tests/source-barrier-probe-preparation.test.cjs', 'tests/subscription-source-probe-preparation.test.cjs', 'tests/tdee-barrier-evidence.test.cjs', 'tests/release-consumer-contracts.test.cjs', 'tests/coach-goal-manual-recovery.test.cjs', 'tests/checkins-production-contracts.test.cjs', 'tests/profile-production-contracts.test.cjs', 'tests/profile-nutrition-totals.test.cjs', 'tests/record-dto-recovery.test.cjs', 'tests/api-data-contracts-recovery.test.cjs', 'tests/sdk-ui-recovery.test.cjs', 'tests/coach-social-production-types.test.cjs', 'tests/tdee-entrypoints-recovery.test.cjs', 'tests/goal-request-journal.test.cjs', 'tests/goal-session-recovery.test.cjs', 'tests/barcode-source-detail.test.cjs', 'tests/barcode-web-first.test.cjs', 'tests/barcode-web-first-backend.test.cjs', 'tests/onboarding-notification-prompt.test.cjs', 'tests/client-usda-secret-boundary.test.cjs', 'tests/progress-runtime-authority.test.cjs', 'tests/barcode-lookup-create.test.mjs', 'tests/barcode-lookup-rounding.test.mjs', 'tests/barcode-lookup-routing.test.mjs', 'tests/barcode-lookup-source-display.test.mjs', 'tests/barcode-lookup-validator.test.mjs'], local],
  'install-test-tooling': ['npm', ['ci', '--prefix', 'scripts/ci/test-tooling', '--ignore-scripts', '--no-audit', '--no-fund'], env],
};
let command;
let missingLock = false;
let lockGenerationCommand;
let generatedLock;
if (stage === 'export-ios' || stage === 'export-web') {
  const platform = stage.slice(7);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'macrogoal-js-' + platform + '-'));
  command = ['pnpm', ['exec', 'expo', 'export', '--platform', platform, '--output-dir', dir, '--clear'], local];
} else if (stage === 'deno-candidate' || stage === 'deno-repository-vision') {
  const name = stage === 'deno-candidate' ? 'candidate' : 'repository-vision';
  const lock = path.join(root, 'scripts/ci/deno-' + name + '.lock');
  const entries = name === 'candidate' ? candidates : ['supabase/functions/vision-nutrition-extract/index.ts'];
  missingLock = !fs.existsSync(lock);
  const outputLock = missingLock ? path.join(results, 'deno-' + name + '.generated.lock') : lock;
  if (missingLock) {
    // Cache resolves dependencies without running endpoint code. A failing check
    // may not write its lock, so capture the graph before type checking it.
    generatedLock = outputLock;
    fs.rmSync(generatedLock, { force: true });
    lockGenerationCommand = ['deno', ['cache', '--no-config', '--lock=' + outputLock, ...entries], env];
  }
  command = ['deno', ['check', '--no-config', '--lock=' + outputLock, ...(missingLock ? [] : ['--frozen']), ...entries], env];
} else {
  command = commands[stage];
}
if (!command) throw new Error('Unknown stage. Arbitrary commands are not accepted.');
const [executable, args, childEnv] = command;
console.log(JSON.stringify({ stage, executable, args, productionCredentials: false }));
const started = new Date().toISOString();
let lockGeneration = null;
if (lockGenerationCommand) {
  const [cacheExecutable, cacheArgs, cacheEnv] = lockGenerationCommand;
  console.log(JSON.stringify({ stage: stage + '-lock-generation', executable: cacheExecutable, args: cacheArgs, productionCredentials: false }));
  const cached = spawnSync(cacheExecutable, cacheArgs, { cwd: root, env: cacheEnv, encoding: 'utf8', shell: false, maxBuffer: 64 * 1024 * 1024, timeout: 20 * 60 * 1000 });
  let cacheLog = (cached.stdout || '') + (cached.stderr || '');
  if (cached.error) cacheLog += '\nProcess error: ' + cached.error.message + '\n';
  lockGeneration = { command: [cacheExecutable, ...cacheArgs], processExitCode: cached.status, signal: cached.signal, generatedLockPresent: fs.existsSync(generatedLock) };
  fs.writeFileSync(path.join(results, stage + '-lock-generation.log'), cacheLog);
  fs.writeFileSync(path.join(results, stage + '-lock-generation.json'), JSON.stringify(lockGeneration, null, 2) + '\n');
  process.stdout.write(cacheLog);
}
const run = spawnSync(executable, args, { cwd: root, env: childEnv, encoding: 'utf8', shell: false, maxBuffer: 64 * 1024 * 1024, timeout: 20 * 60 * 1000 });
let log = (run.stdout || '') + (run.stderr || '');
if (run.error) log += '\nProcess error: ' + run.error.message + '\n';
if (missingLock) log += '\nBLOCKER: No committed Deno dependency lock. The generated lock is evidence only. Review and commit it before this gate can pass.\n';
const status = run.status === 0 && !run.error && !missingLock ? 0 : 1;
const record = { stage, started, finished: new Date().toISOString(), command: [executable, ...args], processExitCode: run.status, signal: run.signal, stageExitCode: status, missingCommittedDenoLock: missingLock, lockGeneration };
fs.writeFileSync(path.join(results, stage + '.log'), log);
fs.writeFileSync(path.join(results, stage + '.json'), JSON.stringify(record, null, 2) + '\n');
process.stdout.write(log);
process.exitCode = status;
