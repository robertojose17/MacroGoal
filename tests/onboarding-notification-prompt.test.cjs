const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../utils/firstAppNotificationPrompt.ts'), 'utf8');
const moduleUnderTest = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: moduleUnderTest, exports: moduleUnderTest.exports });
const { createFirstAppNotificationPrompt, isFirstAppNotificationRoute } = moduleUnderTest.exports;
test('only Food root and Coach root are eligible', () => {
  for (const route of [['(tabs)', '(home)'], ['(tabs)', '(home)', 'index'], ['(tabs)', 'coach']]) assert.equal(isFirstAppNotificationRoute(route), true);
  for (const route of [['subscription'], ['onboarding', 'complete'], ['(tabs)', 'profile'], ['(tabs)', 'dashboard'], ['(tabs)', '(home)', 'details']]) assert.equal(isFirstAppNotificationRoute(route), false);
});
for (const status of ['undetermined', 'denied', 'granted']) test(`preserves ${status} decision and suppresses repeated/concurrent prompts`, async () => {
  let marker = null, count = 0;
  const run = createFirstAppNotificationPrompt();
  const deps = { readMarker: async () => marker, mark: async () => { marker = 'true'; }, permission: async () => ({ status, canAskAgain: true }), isCurrent: () => true, request: async () => { count++; } };
  await Promise.all([run(deps), run(deps)]); await run(deps);
  assert.equal(count, status === 'undetermined' ? 1 : 0);
});
test('previous marker, unfocused route, storage failure and cannot-ask-again never prompt', async () => {
  let count = 0;
  const deps = { readMarker: async () => null, mark: async () => {}, permission: async () => ({ status: 'undetermined', canAskAgain: true }), isCurrent: () => true, request: async () => { count++; } };
  await createFirstAppNotificationPrompt()({ ...deps, readMarker: async () => 'true' });
  await createFirstAppNotificationPrompt()({ ...deps, isCurrent: () => false });
  await createFirstAppNotificationPrompt()({ ...deps, permission: async () => ({ status: 'undetermined', canAskAgain: false }) });
  await assert.rejects(createFirstAppNotificationPrompt()({ ...deps, mark: async () => { throw Error('storage'); } }), /storage/);
  assert.equal(count, 0);
});
