const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require(process.env.TS_TEST_COMPILER_PATH || 'typescript');
test('disabled service factory throws before constructing any storage or network dependency',()=>{
 const released=fs.readFileSync(path.join(__dirname,'../utils/manualNutritionEvidenceServices.ts'),'utf8');
 assert.match(released,/MANUAL_NUTRITION_EVIDENCE_ENABLED=true/);
 const source=released.replace('MANUAL_NUTRITION_EVIDENCE_ENABLED=true','MANUAL_NUTRITION_EVIDENCE_ENABLED=false');
 const calls=[];const forbidden=()=>{calls.push('io');throw Error('unexpected_io');};
 const dependencies={
 '@react-native-async-storage/async-storage':{getItem:forbidden,setItem:forbidden,getAllKeys:forbidden,removeItem:forbidden},
 'expo-crypto':{randomUUID:forbidden},
 '@/lib/supabase/client':{supabase:{auth:{getSession:forbidden}},SUPABASE_PROJECT_URL:'https://example.supabase.co',supabasePublicKey:'synthetic'},
 './manualNutritionEvidenceTransport':{createManualNutritionEvidenceTransport:forbidden},
 './manualNutritionEvidenceJournal':{createManualNutritionEvidenceJournal:forbidden},
 './manualNutritionEvidenceController':{createManualNutritionEvidenceController:forbidden},
 };
 const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{assert.ok(n in dependencies);return dependencies[n];}});
 assert.equal(exports.MANUAL_NUTRITION_EVIDENCE_ENABLED,false);
 assert.throws(()=>exports.makeManualNutritionEvidenceServices(()=>true),/manual_evidence_disabled/);
 assert.deepEqual(calls,[]);
});
function enabledBranchHarness(corrupt=false){
 // Unit harness uses fake dependencies only; it never contacts the application or database.
 const original=fs.readFileSync(path.join(__dirname,'../utils/manualNutritionEvidenceServices.ts'),'utf8');
 assert.match(original,/MANUAL_NUTRITION_EVIDENCE_ENABLED=true/);
 const source=original;
 const calls=[];let entry={ownerId:'owner',itemId:'item',request:{requestId:'request',expected:{values:'private'}}};let owner='owner';
 const transport={requireSession:async expected=>{calls.push('session');if(owner!==expected)throw Error('account_changed');},dispose(){}};
 const journal={discardInvalidKeyExact:async(o,k,raw)=>{calls.push('discard-key');assert.equal(o,'owner');assert.equal(k,'own-private-corrupt-key');assert.equal(raw,'not-json');return true;},discardInvalidExact:async(o,r,raw)=>{calls.push('discard-invalid');assert.equal(o,'owner');assert.equal(r,'request');assert.equal(raw,'not-json');return true;},inspectOwnerPending:async()=>{calls.push('list');return corrupt==='key'?[{kind:'invalid-key',storageKey:'own-private-corrupt-key',raw:'not-json'}]:corrupt?[{kind:'invalid',requestId:'request',raw:'not-json'}]:[{kind:'valid',entry}];},read:async()=>{calls.push('read');return entry;},clearExact:async(_o,_r,value)=>{calls.push('clear');assert.equal(value,entry);entry=null;return true;},listPending:async()=>[]};
 const deps={'@react-native-async-storage/async-storage':{},'expo-crypto':{randomUUID(){return 'opaque-local-id';}},'@/lib/supabase/client':{supabase:{auth:{}},SUPABASE_PROJECT_URL:'https://example.supabase.co',supabasePublicKey:'synthetic'},'./manualNutritionEvidenceTransport':{createManualNutritionEvidenceTransport:()=>transport},'./manualNutritionEvidenceJournal':{createManualNutritionEvidenceJournal:()=>journal},'./manualNutritionEvidenceController':{createManualNutritionEvidenceController:()=>({beginConfirmedLog(){throw Error('unexpected_write');},recover(){throw Error('unexpected_write');},deactivate(){}})}};
 const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>deps[n]});
 return{service:exports.makeManualNutritionEvidenceServices(()=>true),calls,setOwner:v=>{owner=v;}};
}
test('explicit pending listing returns IDs only and verifies owner before and after',async()=>{const h=enabledBranchHarness();assert.deepEqual(JSON.parse(JSON.stringify(await h.service.listPending('owner'))),[{itemId:'item',requestId:'request'}]);assert.deepEqual(h.calls,['session','list','session']);});
test('discard exact local journal never calls writer and checks selected item',async()=>{const h=enabledBranchHarness();await assert.rejects(h.service.discardPending('owner','wrong','request'),/invalid_journal/);assert.equal(h.calls.includes('clear'),false);assert.equal(await h.service.discardPending('owner','item','request'),true);assert.equal(h.calls.filter(x=>x==='clear').length,1);});
test('wrong active owner cannot enumerate or discard journal',async()=>{const h=enabledBranchHarness();h.setOwner('another');await assert.rejects(h.service.listPending('owner'),/account_changed/);await assert.rejects(h.service.discardPending('owner','item','request'),/account_changed/);assert.deepEqual(h.calls,['session','session']);});

test('corrupt journal raw stays private and local discard requires prior own listing',async()=>{const h=enabledBranchHarness(true);await assert.rejects(h.service.discardPending('owner',null,'request'),/invalid_journal/);const rows=await h.service.listPending('owner');assert.deepEqual(JSON.parse(JSON.stringify(rows)),[{itemId:null,requestId:'request',invalid:true}]);assert.equal(await h.service.discardPending('owner',null,'request'),true);assert.equal(h.calls.filter(x=>x==='discard-invalid').length,1);await assert.rejects(h.service.discardPending('owner',null,'request'),/invalid_journal/);});

test('malformed storage key is private and cannot become a server request',async()=>{const h=enabledBranchHarness('key');const rows=await h.service.listPending('owner');assert.deepEqual(JSON.parse(JSON.stringify(rows)),[{itemId:null,requestId:'opaque-local-id',invalid:true}]);assert.equal(JSON.stringify(rows).includes('private-corrupt'),false);assert.equal(await h.service.discardPending('owner',null,'opaque-local-id'),true);assert.equal(h.calls.filter(x=>x==='discard-key').length,1);});
