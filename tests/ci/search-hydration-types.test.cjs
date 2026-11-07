'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require(process.env.TYPESCRIPT_MODULE || 'typescript');
const root = path.resolve(__dirname, '../..');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

test('search type annotation leaves the exact original source and emitted JavaScript intact', () => {
  const text = fs.readFileSync(path.join(root, 'supabase/functions/search-foods/index.ts'), 'utf8');
  const annotation = '// @ts-types="../_shared/searchHydration.d.mts"\n';
  assert.ok(text.startsWith(annotation));
  const original = text.slice(annotation.length);
  assert.equal(sha256(original), '80fce41874d79bccbfeb6321dffa080d0306a9b521ead57997a5dfbaa4e9e3a0');
  const compilerOptions = { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, removeComments: true };
  assert.equal(ts.transpileModule(text, { compilerOptions }).outputText, ts.transpileModule(original, { compilerOptions }).outputText);
  assert.equal(sha256(fs.readFileSync(path.join(root, 'supabase/functions/_shared/searchHydration.mjs'))), '85502f73b8f97a01beac8abfb653e7ee678f49fab9fc3ec162359a3f1d4bcb9d');
});

test('strict contract preserves unknown data and narrows nutrition and authority without any', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'search-hydration-contract-'));
  try {
    const declaration = path.join(root, 'supabase/functions/_shared/searchHydration.d.mts');
    const contract = fs.readFileSync(declaration, 'utf8');
    assert.doesNotMatch(contract, /\bany\b/);
    fs.copyFileSync(declaration, path.join(directory, 'searchHydration.d.mts'));
    fs.writeFileSync(path.join(directory, 'contract.mts'), `
import { hydrateSearchRows, normalizeSearchNutrition, type SearchSnapshotReader, type SearchAuthority, type SearchSnapshotField } from './searchHydration.mjs';
declare const admin: SearchSnapshotReader;
type IsAny<T> = 0 extends (1 & T) ? true : false;
type AssertFalse<T extends false> = T;
type Result = Awaited<ReturnType<typeof hydrateSearchRows>>;
type RowIsNotAny = AssertFalse<IsAny<Result[number]['row']>>;
type AuthorityIsNotAny = AssertFalse<IsAny<Result[number]['authority']>>;
const hydrated = await hydrateSearchRows([{}, null, 1], admin, new AbortController().signal, 150);
hydrated.map(({ row, authority }) => {
  const record: Record<string, unknown> = row;
  const known: SearchAuthority = authority;
  // @ts-expect-error Raw nutrition is not validated by the projection contract.
  const unsafeCalories: number = row.calories;
  const normalized = normalizeSearchNutrition(row);
  if (normalized.valid) {
    const calories: number = normalized.nutriments['energy-kcal_100g'];
    const grams: number = normalized.servingSize;
    // @ts-expect-error Success has no failure reason.
    normalized.reason;
  } else {
    const reason: string = normalized.reason;
    // @ts-expect-error Failure has no selectable nutrients.
    normalized.nutriments;
  }
  return record;
});
// @ts-expect-error Caller fields cannot invent authority.
const forged: SearchAuthority = 'client_confirmed';
// @ts-expect-error Private fields are not in the snapshot allowlist.
const privateField: SearchSnapshotField = 'user_id';
`);
    const options = { strict: true, noEmit: true, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022, types: [], skipLibCheck: false };
    const program = ts.createProgram([path.join(directory, 'contract.mts')], options);
    const errors = ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    assert.deepEqual(errors, []);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
