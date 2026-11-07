#!/usr/bin/env node
// Explicit, offline-only test selection. Never discover or glob all repository tests.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(import.meta.url);
const group=process.argv.includes('--group')?process.argv[process.argv.indexOf('--group')+1]:'all';
const allowed=['all','client','contracts','syntax'];
if(!allowed.includes(group))throw Error('Unknown group: '+group);
const typescript=process.env.TYPESCRIPT_MODULE||require.resolve('typescript');
const ts=require(typescript);
const modules=process.env.BARCODE_RECOVERY_NODE_MODULES||path.dirname(path.dirname(path.dirname(require.resolve(typescript))));
const env={...process.env,TYPESCRIPT_MODULE:typescript,BARCODE_RECOVERY_NODE_MODULES:modules,MACROGOAL_CLIENT_ROOT:root,SEARCH_AUTHORITY_FUNCTIONS_ROOT:path.join(root,'supabase/functions')};
const client=[
 'tests/client-readiness.test.cjs',
 'tests/barcode-recovery-ui.test.mjs',
 'tests/barcode-unconfirmed-lookup.test.cjs',
 'tests/camera-capture-bytes.test.mjs',
 'tests/library-barcode-integration.test.cjs',
 'tests/manual-recovery-save.test.mjs',
 'tests/search-selection-safety.test.cjs',
 'tests/unknown-barcode-callbacks.cjs',
 'tests/unknown-barcode-client.test.mjs',
 'tests/release-review/client/independent-final-callbacks.cjs',
 'tests/release-review/client/independent-label-confirmation-contract.cjs',
 'tests/release-review/client/client-adversarial.test.cjs',
 'tests/release-review/client/independent-off-search-v4.cjs',
 'tests/release-review/client/independent-review-capability-v5.cjs',
 'tests/release-review/client/independent-identity-reservation-v5.cjs',
];
function run(files){
 const r=spawnSync(process.execPath,['--test','--test-reporter=tap',...files],{cwd:root,env,stdio:'inherit'});
 if(r.error)throw r.error;
 if(r.status!==0)process.exit(r.status??1);
}
if(group==='all'||group==='syntax'){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'release-candidates/food-catalog/source-lineage.json'),'utf8'));
 let checked=0,errors=0;
 for(const {path:p,origin} of manifest.files){
  if(origin==='inactive-sql-candidate')continue;
  if(/\.tsx?$/.test(p)){
   const result=ts.transpileModule(fs.readFileSync(path.join(root,p),'utf8'),{fileName:p,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}});
   for(const d of result.diagnostics||[]){console.error(p,ts.flattenDiagnosticMessageText(d.messageText,' '));errors++;}checked++;
  }else if(/\.(mjs|cjs)$/.test(p)){
   const r=spawnSync(process.execPath,['--check',p],{cwd:root,env,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)errors++;checked++;
  }
 }
 console.log(JSON.stringify({scope:'syntax only, not semantic types, lint, native bundle or deployment',checked,errors,typescript:ts.version}));
 if(errors)process.exit(1);
}
if(group==='all'||group==='client')run(client);
if(group==='all'||group==='contracts')run(['tests/release-review/backend/assembled-contracts.test.mjs']);
