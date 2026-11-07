'use strict';
// Absolute application check. No baseline comparison and no diagnostic filtering.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = process.cwd();
const configPath = path.join(root, 'tsconfig.json');
const read = ts.readConfigFile(configPath, ts.sys.readFile);
if (read.error) {
  console.error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
  process.exit(1);
}
const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root);
// The separate Deno job checks actual backend entrypoints. The reviewed test
// fixtures contain frozen source snapshots, not application compilation units.
// Archived server entrypoints are also not app roots. Shared protocol modules
// remain roots; any excluded module imported by app code still enters the program.
const exclusions = [
  'supabase/functions/',
  'tests/release-review/',
  'supabase/localization-rollout/functions/',
  'supabase/premium-checkpoints-rollout/edge/index.ts',
  'supabase/premium-checkpoints-rollout/track-onboarding/',
];
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const roots = parsed.fileNames.filter(file => !exclusions.some(entry => entry.endsWith('/') ? relative(file).startsWith(entry) : relative(file) === entry));
if (!roots.length || !roots.some(file => relative(file) === 'index.ts')) {
  throw new Error('A complete application checkout with index.ts is required.');
}
const program = ts.createProgram(roots, { ...parsed.options, noEmit: true });
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
const report = {
  kind: 'absolute-application-typecheck',
  rootFileCount: roots.length,
  excludedRuntimePrefixes: exclusions,
  rootFiles: roots.map(relative).sort(),
  diagnosticCount: diagnostics.length,
  diagnostics: diagnostics.map(d => ({
    file: d.file ? relative(d.file.fileName) : '<config>',
    line: d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : null,
    code: d.code,
    category: ts.DiagnosticCategory[d.category],
    message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
  })),
};
fs.mkdirSync('.ci-results', { recursive: true });
fs.writeFileSync('.ci-results/app-types-diagnostics.json', JSON.stringify(report, null, 2) + '\n');
console.log(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCurrentDirectory: () => root,
  getCanonicalFileName: file => file,
  getNewLine: () => '\n',
}));
console.log(JSON.stringify({ rootFileCount: roots.length, diagnosticCount: diagnostics.length, excludedRuntimePrefixes: exclusions }));
process.exitCode = diagnostics.length ? 1 : 0;
