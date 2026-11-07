'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');

test('Node globals are scoped to tooling/tests, with no rule disabled globally', () => {
  const config = require(path.join(root, '.eslintrc.js'));
  const node = config.overrides.find(item => item.env?.node === true);
  assert.deepEqual(node.files, ['scripts/**/*.{js,cjs,mjs}', 'tests/**/*.{js,cjs,mjs}']);
  assert.equal(node.rules, undefined);
  assert.equal(config.env.node, undefined);
  assert.equal(config.rules['no-undef'], undefined);
  assert.equal(config.rules['no-control-regex'], undefined);
  const esm = config.overrides.find(item => item.files.includes('scripts/**/*.mjs'));
  for (const name of ['__dirname', '__filename', 'require', 'module', 'exports']) assert.equal(esm.globals[name], 'off');
});

test('ignore scope names server entrypoints and fixture copies, not the whole Supabase tree', () => {
  const lines = fs.readFileSync(path.join(root, '.eslintignore'), 'utf8').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  for (const entry of ['supabase/localization-rollout/functions/', 'supabase/premium-checkpoints-rollout/edge/index.ts', 'supabase/premium-checkpoints-rollout/track-onboarding/', 'scripts/ci/native-database/src/']) assert.ok(lines.includes(entry));
  for (const entry of ['supabase/', 'supabase/**', 'supabase/premium-checkpoints-rollout/', 'supabase/premium-checkpoints-rollout/edge/', 'supabase/premium-checkpoints-rollout/edge/protocol.ts', 'app/', 'utils/', 'components/']) assert.ok(!lines.includes(entry));
});

test('absolute app diagnostics survive stage metadata and imported excluded roots remain checked', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'macrogoal-scope-regression-'));
  function put(name, content) {
    const destination = path.join(dir, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  }
  try {
    for (const name of ['run-stage.cjs', 'check-app-types.cjs', 'offline-node.cjs']) put('scripts/ci/' + name, fs.readFileSync(path.join(root, 'scripts/ci', name)));
    fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
    fs.symlinkSync(path.dirname(require.resolve('typescript/package.json')), path.join(dir, 'node_modules/typescript'), 'dir');
    put('tsconfig.json', JSON.stringify({ compilerOptions: { strict: true, target: 'ES2022', module: 'CommonJS', skipLibCheck: true, types: [] }, include: ['**/*.ts', '**/*.tsx'], exclude: ['node_modules'] }));
    put('index.ts', "import { imported } from './supabase/localization-rollout/functions/imported';\nexport const value = imported;\nconst realAppError: number = 'wrong';\n");
    put('supabase/localization-rollout/functions/imported.ts', "export const imported: number = 'wrong';\n");
    put('supabase/localization-rollout/functions/unimported.ts', 'Deno.serve(() => new Response());\n');
    put('supabase/premium-checkpoints-rollout/edge/index.ts', 'Deno.serve(() => new Response());\n');
    put('supabase/premium-checkpoints-rollout/edge/index.ts.client.ts', "export const adjacentApplicationRoot: number = 'wrong';\n");
    put('supabase/premium-checkpoints-rollout/edge/protocol.ts', "export const sharedProtocol: number = 'wrong';\n");
    put('tests/release-review/fixtures/history.ts', "export const oldFixture: number = 'wrong';\n");
    const run = spawnSync(process.execPath, ['scripts/ci/run-stage.cjs', 'app-types'], { cwd: dir, env: process.env, encoding: 'utf8' });
    assert.equal(run.status, 1, run.stdout + run.stderr);
    const diagnostics = JSON.parse(fs.readFileSync(path.join(dir, '.ci-results/app-types-diagnostics.json'), 'utf8'));
    const stage = JSON.parse(fs.readFileSync(path.join(dir, '.ci-results/app-types.json'), 'utf8'));
    assert.equal(diagnostics.kind, 'absolute-application-typecheck');
    assert.equal(diagnostics.diagnosticCount, 4);
    assert.deepEqual(diagnostics.diagnostics.map(item => item.file).sort(), ['index.ts', 'supabase/localization-rollout/functions/imported.ts', 'supabase/premium-checkpoints-rollout/edge/index.ts.client.ts', 'supabase/premium-checkpoints-rollout/edge/protocol.ts']);
    assert.deepEqual(diagnostics.rootFiles, ['index.ts', 'supabase/premium-checkpoints-rollout/edge/index.ts.client.ts', 'supabase/premium-checkpoints-rollout/edge/protocol.ts']);
    assert.equal(stage.stage, 'app-types');
    assert.equal(stage.stageExitCode, 1);
    assert.equal(stage.processExitCode, 1);
    assert.equal(stage.diagnostics, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
