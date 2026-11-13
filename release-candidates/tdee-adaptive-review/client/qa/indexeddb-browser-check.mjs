// Real isolated Chromium storage test over an existing local document, not a test app/server.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),ts=require('typescript');
const dir='release-candidates/tdee-adaptive-review/client/';
const compile=name=>ts.transpileModule(fs.readFileSync(dir+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
test('real Chromium independent tabs atomically claim identity-only IndexedDB journal',async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {
  const context=await browser.newContext(),pages=await Promise.all([context.newPage(),context.newPage()]);
  const code={storage:compile('adaptiveTdeeJournalStorage'),journal:compile('adaptiveTdeeJournal')};
  for(const page of pages){await page.goto(pathToFileURL(process.cwd()+'/release-candidates/tdee-adaptive-review/README.md').href);await page.evaluate(code=>{
   const storageModule={exports:{}},journalModule={exports:{}};
   new Function('require','module','exports',code.storage)(name=>name==='react-native'?{Platform:{OS:'web'}}:{},storageModule,storageModule.exports);
   new Function('module','exports',code.journal)(journalModule,journalModule.exports);
   window.journal=journalModule.exports.createAdaptiveTdeeJournal('isolated-browser-qa',storageModule.exports.adaptiveTdeeJournalStorage);
  },code);}
  const ownerId='00000000-0000-4000-8000-000000000001';
  const requests=[2,3].map(n=>({ownerId,requestId:`00000000-0000-4000-8000-00000000000${n}`,proposalId:'00000000-0000-4000-8000-000000000004',proposalDigest:'a'.repeat(64)}));
  const results=await Promise.all(pages.map((p,i)=>p.evaluate(async request=>{try{await window.journal.prepare(request);return 'ok';}catch(e){return e.message;}},requests[i])));
  assert.equal(results.filter(x=>x==='ok').length,1);
  const winner=requests[results.indexOf('ok')],loser=requests[1-results.indexOf('ok')];
  for(const page of pages)assert.deepEqual(await page.evaluate(o=>window.journal.load(o),ownerId),{status:'pending',request:winner});
  assert.notEqual(await pages[0].evaluate(async r=>{try{await window.journal.resolve(r);return 'ok';}catch(e){return e.message;}},loser),'ok');
  await pages[1].evaluate(r=>window.journal.resolve(r),winner);
  assert.equal(await pages[0].evaluate(o=>window.journal.load(o),ownerId),null);
 }finally{await browser.close();}
});
