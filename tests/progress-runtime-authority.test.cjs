'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const manifest = JSON.parse(fs.readFileSync('release-candidates/tdee-consistent-observation/runtime-authority.json', 'utf8'));
test('standard Supabase config selects the verified observed entrypoint, preserving JWT', () => {
  const config = fs.readFileSync('supabase/config.toml', 'utf8');
  const entries = config.match(/\[functions\.progress-intelligence\][\s\S]*?(?=\n\[|$)/g);
  assert.equal(entries?.length, 1);
  assert.match(entries[0], /^verify_jwt\s*=\s*true$/m);
  const entrypoint = /^entrypoint\s*=\s*"([^"]+)"$/m.exec(entries[0])?.[1];
  assert.equal(path.normalize(path.join('supabase', entrypoint)), manifest.entrypoint);
  assert.notEqual(manifest.entrypoint, 'supabase/functions/progress-intelligence/index.ts');
});
test('all 40 runtime files bind the exact read-back production source', () => {
  assert.equal(Object.keys(manifest.live_runtime_files).length, 40);
  for (const [name, expected] of Object.entries(manifest.live_runtime_files)) {
    assert.equal(name.startsWith('functions/') && !name.includes('..'), true);
    const bytes = fs.readFileSync(path.join('supabase/functions/observed-snapshot-release', name));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected, name);
  }
});
test('two reconstructed declaration modules have no executable statements', () => {
  assert.equal(Object.keys(manifest.reconstructed_type_only_files).length, 2);
  for (const [name, expected] of Object.entries(manifest.reconstructed_type_only_files)) {
    const source = fs.readFileSync(path.join('supabase/functions/observed-snapshot-release', name), 'utf8');
    assert.equal(crypto.createHash('sha256').update(source).digest('hex'), expected, name);
    const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
    assert.equal(file.statements.every(statement => ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)), true, name);
  }
});
test('runtime authority is not a new deployment or acceptance approval', () => {
  assert.equal(manifest.live_version, 15); assert.equal(manifest.verify_jwt, true);
  assert.equal(manifest.deployment_performed, false);
  assert.ok(manifest.blocked.includes('adaptive-recommendation-activation'));
  const source = fs.readFileSync(manifest.entrypoint, 'utf8');
  assert.match(source, /createObservedProgressDispatcher/);
  assert.match(source, /createObservationDispatcher/);
});
