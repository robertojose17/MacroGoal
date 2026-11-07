'use strict';
// Offline orchestration tests. spawnSync is a fake, not an actual Deno result.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../scripts/ci/run-stage.cjs'), 'utf8');

function scenario({ stage = 'deno-candidate', committed = false, cacheCode = 0, checkCode = 1, stale = false }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deno-lock-orchestration-'));
  const name = stage === 'deno-candidate' ? 'candidate' : 'repository-vision';
  const results = path.join(root, '.ci-results');
  const lock = path.join(root, 'scripts/ci/deno-' + name + '.lock');
  const generated = path.join(results, 'deno-' + name + '.generated.lock');
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.mkdirSync(results, { recursive: true });
  if (committed) fs.writeFileSync(lock, 'reviewed fixture lock');
  if (stale) fs.writeFileSync(generated, 'stale fixture lock');
  const calls = [];
  const fakeProcess = { cwd: () => root, argv: ['node', 'run-stage.cjs', stage], env: {}, execPath: process.execPath, stdout: { write() {} } };
  const fakeSpawnSync = (executable, args, options) => {
    calls.push({ executable, args, options });
    if (args[0] === 'cache') {
      assert.equal(fs.existsSync(generated), false, 'stale evidence must be removed before generation');
      if (cacheCode === 0) fs.writeFileSync(generated, 'new fixture lock');
      return { status: cacheCode, signal: null, stdout: '', stderr: cacheCode ? 'fixture cache failure' : '' };
    }
    assert.equal(args[0], 'check');
    return { status: checkCode, signal: null, stdout: '', stderr: checkCode ? 'fixture type failure' : '' };
  };
  const fakeRequire = name => name === 'node:child_process' ? { spawnSync: fakeSpawnSync } : require(name);
  try {
    vm.runInNewContext(source, { require: fakeRequire, process: fakeProcess, console: { log() {} } });
    const record = JSON.parse(fs.readFileSync(path.join(results, stage + '.json'), 'utf8'));
    return { calls, record, exitCode: fakeProcess.exitCode, generated: fs.existsSync(generated), committed: committed ? fs.readFileSync(lock, 'utf8') : null, log: fs.readFileSync(path.join(results, stage + '.log'), 'utf8') };
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

for (const stage of ['deno-candidate', 'deno-repository-vision']) {
  test(stage + ': cache captures lock before a failed typecheck, but stage remains blocked', () => {
    const r = scenario({ stage, stale: true });
    assert.deepEqual(r.calls.map(c => c.args[0]), ['cache', 'check']);
    assert.equal(r.generated, true);
    assert.equal(r.record.lockGeneration.generatedLockPresent, true);
    assert.equal(r.record.lockGeneration.processExitCode, 0);
    assert.equal(r.record.processExitCode, 1);
    assert.equal(r.record.missingCommittedDenoLock, true);
    assert.equal(r.exitCode, 1);
    assert.match(r.log, /No committed Deno dependency lock/);
    for (const c of r.calls) {
      assert.equal(c.executable, 'deno');
      assert.ok(c.args.includes('--no-config'));
      assert.equal(c.options.shell, false);
      assert.ok(!c.args.some(arg => /^(run|serve|deploy)$/.test(arg)));
    }
  });
}
test('successful typecheck cannot turn an unreviewed generated lock green', () => {
  const r = scenario({ checkCode: 0 });
  assert.equal(r.record.processExitCode, 0);
  assert.equal(r.exitCode, 1);
});
test('failed cache cannot advertise a stale lock as generated evidence', () => {
  const r = scenario({ cacheCode: 1, stale: true });
  assert.equal(r.generated, false);
  assert.equal(r.record.lockGeneration.generatedLockPresent, false);
  assert.equal(r.record.lockGeneration.processExitCode, 1);
  assert.equal(r.exitCode, 1);
});
for (const checkCode of [0, 1]) test('committed lock only runs frozen check and preserves result ' + checkCode, () => {
  const r = scenario({ committed: true, checkCode });
  assert.equal(r.calls.length, 1);
  assert.ok(r.calls[0].args.includes('--frozen'));
  assert.equal(r.record.lockGeneration, null);
  assert.equal(r.record.missingCommittedDenoLock, false);
  assert.equal(r.committed, 'reviewed fixture lock');
  assert.equal(r.exitCode, checkCode);
});
