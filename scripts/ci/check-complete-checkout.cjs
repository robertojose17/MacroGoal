'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const { baseCommit, files } = require('./base-checkout-paths.json');
// Check presence only. Do not open SQL, credential files, or excluded sources.
const missing = files.filter(file => !fs.existsSync(path.join(root, file)));
const supplemental = [
  'scripts/release-review/check.mjs',
  'tests/library-barcode-integration.test.cjs',
  'tests/release-review/backend/assembled-contracts.test.mjs',
];
for (const file of supplemental) if (!fs.existsSync(path.join(root, file))) missing.push(file);
fs.mkdirSync('.ci-results', { recursive: true });
const report = { baseCommit, expectedBaseFiles: files.length, missing, complete: missing.length === 0 };
fs.writeFileSync('.ci-results/checkout-completeness.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (missing.length) process.exitCode = 1;
