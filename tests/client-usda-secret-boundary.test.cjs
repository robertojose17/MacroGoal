'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
function sourceFiles(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const name = path.join(dir, entry.name); return entry.isDirectory() ? sourceFiles(name) : /\.[cm]?[jt]sx?$/.test(name) ? [name] : [];
}); }
test('tracked client environment contains no USDA credential entry', () => {
  // Do not print environment contents or offending secret values on failure.
  const found = fs.readFileSync('.env', 'utf8').split(/\r?\n/).some(line => /^\s*(?:export\s+)?(?:EXPO_PUBLIC_)?USDA_API_KEY\s*=/.test(line));
  assert.equal(found, false, 'Remove the USDA key entry from tracked client configuration.');
});
test('no app source embeds a USDA client credential or direct USDA API request', () => {
  for (const file of ['app', 'components', 'contexts', 'hooks', 'utils'].flatMap(sourceFiles)) {
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(/EXPO_PUBLIC_USDA_API_KEY|api\.nal\.usda\.gov/.test(source), false, 'Client USDA secret/request boundary violated: ' + file);
  }
});
test('existing scoped USDA selection uses backend and deployed server reads its secret', () => {
  const selection = fs.readFileSync('utils/usdaSelectionPersistence.ts', 'utf8');
  assert.equal(selection.includes("supabase.functions.invoke('lookup-barcode'"), true);
  const backend = fs.readFileSync('supabase/functions/lookup-barcode/_shared/portionEndpoint.ts', 'utf8');
  assert.equal(backend.includes("Deno.env.get('USDA_API_KEY')"), true);
  assert.equal(backend.includes('EXPO_PUBLIC_USDA_API_KEY'), false);
});
