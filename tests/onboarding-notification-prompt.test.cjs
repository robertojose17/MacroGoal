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

test('session epoch rejects a stale auth result before owner resolution', async () => {
  const epoch = moduleUnderTest.exports.createNotificationSessionEpoch();
  const oldRead = epoch.capture();
  epoch.invalidate(); // sign-out / account change while getUser is pending
  let requests = 0, marks = 0;
  const deps = { readMarker: async () => null, mark: async () => { marks++; }, permission: async () => ({ status: 'undetermined', canAskAgain: true }), isCurrent: () => epoch.isCurrent(oldRead), request: async () => { requests++; } };
  await createFirstAppNotificationPrompt()(deps);
  assert.equal(requests, 0); assert.equal(marks, 0);
  const freshRead = epoch.capture();
  assert.equal(epoch.isCurrent(freshRead), true);
  await createFirstAppNotificationPrompt()({ ...deps, permission: async () => { epoch.invalidate(); return { status: 'undetermined', canAskAgain: true }; }, isCurrent: () => epoch.isCurrent(freshRead) });
  assert.equal(requests, 0); assert.equal(marks, 0);
});
test('both native route layouts mount the shared singleton gate', () => {
  for (const name of ['_layout.tsx', '_layout.ios.tsx']) {
    const layout = fs.readFileSync(require('node:path').join(__dirname, '../app/(tabs)', name), 'utf8');
    assert.equal((layout.match(/useFirstAppNotificationPrompt\(\)/g) || []).length, 1);
  }
});
