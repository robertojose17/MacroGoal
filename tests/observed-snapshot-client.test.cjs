'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const base = path.join(__dirname,'../supabase/functions/observed-snapshot-release/functions');
const cache = new Map();
function load(file) {
  file = path.resolve(file); if(cache.has(file)) return cache.get(file);
  const exports = {}; cache.set(file,exports);
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:name=>load(path.resolve(path.dirname(file),name)),Date,Intl,Response,Request,URL,Set,Map,console},{filename:file});
  return exports;
}
const {parseObservedSnapshot} = load(path.join(base,'observed-program/snapshot.ts'));
const {createObservationHandler} = load(path.join(base,'observed-program/handler.ts'));
const capturedAt = '2026-11-13T12:00:00.123456+00:00';
const civil = n => new Date(Date.parse('2026-11-13T00:00:00Z')+n*86400000).toISOString().slice(0,10);
function fixture() {
  const meals = Array.from({length:28},(_,i)=>Array.from({length:3},(_,j)=>({id:`m${i}-${j}`,date:civil(i-29),meal_type:['breakfast','lunch','dinner'][j]}))).flat();
  const sources = {timezone:'UTC',dateOfBirth:'1990-06-15',journeyStartDate:null,trackers:[],trackerWeights:[],
    checkIns:Array.from({length:29},(_,i)=>({id:`w${i}`,date:civil(i-29),weight:80,created_at:`${civil(i-29)}T12:00:00+00:00`,updated_at:null})),
    meals,items:meals.map(m=>({id:`i${m.id}`,meal_id:m.id,calories:800,is_scheduled:false}))};
  return {version:'observed-snapshot-v1',ownerId:'owner',capturedAt,sourceFingerprint:'b'.repeat(64),
    context:{ownerId:'owner',premium:true,enabled:true,reviewDay:0,today:'2026-11-13',nextReviewDate:'2026-11-15',reviewDue:false,currentGoal:null,fingerprint:'a'.repeat(64),proposal:null,safety:{enabled:false,eligibility:'unverified'}},
    counts:Object.fromEntries(['trackers','trackerWeights','checkIns','meals','items'].map(k=>[k,sources[k].length])),sources};
}
function setup(snapshot=fixture(), extra={}) {
  const calls=[];
  const deps={authenticate:async()=>{calls.push('auth');return 'owner';},snapshot:async()=>{calls.push('snapshot');return snapshot;},context:async()=>{calls.push('context');return snapshot.context;},settings:async()=>{calls.push('settings');return snapshot.context;},...extra};
  return {calls,handle:createObservationHandler(deps)};
}
const request = (method='GET',body,view='program') => new Request(`https://example.invalid/?mode=observed-program-v1&view=${view}`,{method,headers:{authorization:'Bearer mock'},...(body?{body:JSON.stringify(body)}:{})});
test('actual adapter accepts full exact snapshot and preserves zero rather than imputing',()=>{
  const x=fixture(); assert.equal(parseObservedSnapshot(x,'owner'),x); x.sources.items[0].calories=0; assert.equal(parseObservedSnapshot(x,'owner').sources.items[0].calories,0);
});
test('actual handler estimates using server capture date, no JS clock or legacy reads',async()=>{
  const {handle,calls}=setup(); const res=await handle(request());const body=await res.json();
  assert.equal(res.status,200);assert.equal(body.estimate.kcalPerDay,2400);assert.equal(body.proposal,null);assert.equal(body.estimate.confidence,'low');assert.deepEqual(calls,['auth','snapshot','context']);
});
test('estimate view remains observational',async()=>{
  const {handle}=setup();const res=await handle(request('GET',null,'estimate'));const b=await res.json();assert.equal(b.observationOnly,true);assert.equal(b.kcalPerDay,2400);
});
test('missing RPC and malformed response fail closed with no fallback or context read',async()=>{
  for(const implementation of [async()=>{throw new Error('missing RPC');},async()=>null]) {const {handle,calls}=setup(fixture(),{snapshot:implementation});const r=await handle(request());assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'source_error'});assert.deepEqual(calls,['auth']);}
});
for(const [name,mutate] of [
  ['wrong owner',x=>x.ownerId='other'],['wrong context owner',x=>x.context.ownerId='other'],['marker',x=>x.version='other'],['missing capture zone',x=>x.capturedAt='2026-11-13T12:00:00'],['invalid capture date',x=>x.capturedAt='2026-02-30T12:00:00Z'],['source hash',x=>x.sourceFingerprint='fake'],['context hash',x=>x.context.fingerprint='fake'],['prescription',x=>x.context.proposal={}],['enabled safety',x=>x.context.safety.enabled=true],['due recommendation',x=>x.context.reviewDue=true],['invented goal',x=>x.context.currentGoal={id:'g',daily_calories:null}],['timezone',x=>x.sources.timezone='bad/zone'],['capture day mismatch',x=>x.context.today='2026-11-12'],['count mismatch',x=>x.counts.items++],['duplicate ID',x=>x.sources.items[1].id=x.sources.items[0].id],['orphan meal',x=>x.sources.items[0].meal_id='foreign'],['orphan tracker',x=>{x.sources.trackerWeights=[{id:'t',tracker_id:'foreign',date:civil(-1),value:80,created_at:capturedAt}];x.counts.trackerWeights=1;}],['unknown calories',x=>x.sources.items[0].calories=null],['scheduled',x=>x.sources.items[0].is_scheduled=true],['open day',x=>x.sources.checkIns[0].date=civil(0)],['outside window',x=>x.sources.checkIns[0].date=civil(-30)],['missing journey',x=>delete x.sources.journeyStartDate],['two trackers',x=>{x.sources.trackers=[{id:'a',unit:'kg'},{id:'b',unit:'kg'}];x.counts.trackers=2;}],['too many meals',x=>{x.sources.meals=Array.from({length:501},(_,i)=>({id:`m${i}`,date:civil(-1),meal_type:'breakfast'}));x.counts.meals=501;}],['source cap',x=>{x.sources.items=Array.from({length:5001},(_,i)=>({id:`i${i}`,meal_id:'m0-0',calories:1,is_scheduled:false}));x.counts.items=5001;}]
]) test(`parser rejects ${name}`,()=>{const x=fixture();mutate(x);assert.throws(()=>parseObservedSnapshot(x,'owner'),/snapshot_invalid/);});
test('disabled and nonpremium require null sources/counts and never compute or recheck',async()=>{
  for(const key of ['enabled','premium']) {const x=fixture();x.context[key]=false;assert.throws(()=>parseObservedSnapshot(x,'owner'));x.sources=null;x.counts=null;const {handle,calls}=setup(x);const r=await handle(request());assert.equal(r.status,200);assert.equal((await r.json()).estimate,null);assert.deepEqual(calls,['auth','snapshot']);}
});
test('context change after snapshot rejects estimate',async()=>{
  const x=fixture(); const {handle}=setup(x,{context:async()=>({...x.context,fingerprint:'c'.repeat(64)})});assert.equal((await handle(request())).status,409);
});
test('zero provenance pauses same real engine, sparse data never invents target',async()=>{
  const x=fixture();x.sources.items[0].calories=0;const {handle}=setup(x);const b=await (await handle(request())).json();assert.equal(b.estimate.reason,'unknown_calorie_provenance');assert.equal(b.estimate.kcalPerDay,null);
});
test('settings POST remains separate, never reads snapshot and success not masked by read',async()=>{
  const {handle,calls}=setup();const r=await handle(request('POST',{action:'dynamic_settings',enabled:true,reviewDay:0}));assert.equal(r.status,200);assert.deepEqual(calls,['auth','context','settings']);
});
test('recommendations remain unconditionally denied',async()=>{
  for(const action of ['dynamic_review','dynamic_accept','dynamic_reject']) {const {handle,calls}=setup();assert.equal((await handle(request('POST',{action}))).status,409);assert.deepEqual(calls,['auth','context']);}
});
test('anonymous or missing auth performs no snapshot',async()=>{
  const {handle,calls}=setup(fixture(),{authenticate:async()=>null});assert.equal((await handle(request())).status,401);assert.deepEqual(calls,[]);
});
test('runtime calls only no-argument snapshot RPC, no table reader remains',()=>{
  const source=fs.readFileSync(path.join(base,'observed-program/runtime.ts'),'utf8');assert.match(source,/\.rpc\('observed_get_tdee_snapshot_v1'\)/);assert.doesNotMatch(source,/\.from\(|allRows|readObservedSources|service_role/i);
});
