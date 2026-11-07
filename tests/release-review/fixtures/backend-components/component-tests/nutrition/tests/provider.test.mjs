import test from 'node:test';
import assert from 'node:assert/strict';
import {captureUSDA,captureOFF,resolveMissing,shouldRefreshNutrition,createRefreshService,NUTRIENT_MAP} from '../src/provider.mjs';
import {readFileSync} from 'node:fs';
const time='2026-11-06T12:00:00.000Z',now=Date.parse(time),requestId='00000000-0000-4000-8000-000000000001';
const raw=(rows=[{nutrient:{id:1162,unitName:'mg'},amount:12}])=>({fdcId:123,description:'Banana, raw',dataType:'Foundation',foodNutrients:rows});
const usda=r=>captureUSDA(r??raw(),{capturedAt:time,expectedId:'123'});
const current=e=>({id:'00000000-0000-4000-8000-000000000002',revision:1,provider:e.provider,source_id:e.source_id,identity:e.identity,macros_per:'100g',micronutrients:{},calories:88,protein:1,confirmed:true});
const off=(nutriments,options={})=>captureOFF({code:'12345678',product_name:'Food',nutriments},{capturedAt:time,expectedId:'12345678',...options});
test('USDA preserves mg once, zero, missing, negative and unknown evidence',()=>{
 const e=usda(raw([{nutrient:{id:1162,unitName:'MG'},amount:12},{nutrient:{id:1089,unitName:'mg'},amount:0},{nutrient:{id:1090,unitName:'mg'},amount:-2},{nutrient:{id:1092,unitName:'mg'},amount:null},{nutrient:{id:9999,unitName:'IU'},amount:7}]));
 assert.equal(e.canonical_candidates.vitamin_c_mg.amount,12);assert.equal(e.canonical_candidates.iron_mg.amount,0);assert.equal(e.nutrients.length,5);assert.equal(e.nutrients[4].unit,'iu');assert.equal(e.nutrients[2].status,'negative');assert.equal(e.nutrients[3].status,'missing');assert.equal(e.canonical_candidates.magnesium_mg,undefined);
});
test('unit conversion once and ambiguous RAE retained only',()=>{
 const e=usda(raw([{nutrient:{id:1162,unitName:'g'},amount:.012},{nutrient:{id:1178,unitName:'UG'},amount:2},{nutrient:{id:1106,unitName:'UG'},amount:100}]));
 assert.equal(e.canonical_candidates.vitamin_c_mg.amount,12);assert.equal(e.canonical_candidates.vitamin_b12_mcg.amount,2);assert.equal(Object.keys(e.canonical_candidates).length,2);
});
test('OFF normalized grams ignore display mg, ambiguous 100ml blocks fill',()=>{
 const n={'vitamin-c_100g':.012,'vitamin-c_unit':'mg','unknown-x_100g':4,'unknown-x_unit':'mg','iron_serving':.001};
 const e=off(n);assert.equal(e.nutrients[0].unit,'g');assert.equal(e.nutrients[0].label_unit,'mg');assert.deepEqual({...e.canonical_candidates},{});assert.equal(e.nutrients[1].unit,'unknown');
 const verified=off(n,{verifiedBasis:'per_100g'});assert.equal(verified.canonical_candidates.vitamin_c_mg.amount,12);assert.equal(verified.canonical_candidates.iron_mg,undefined);
});
test('allowlisted projection excludes unrelated objects/URL/account/photo fields',()=>{
 const r=raw();r.secret='DO_NOT_STORE';r.photo='DO_NOT_STORE';r.foodNutrients[0].receipt='DO_NOT_STORE';r.foodNutrients.push({nutrient:{id:9,unitName:'mg'},amount:{secret:'DO_NOT_STORE'}});
 const e=usda(r);assert.ok(!JSON.stringify(e).includes('DO_NOT_STORE'));assert.equal(e.nutrients[1].amount,null);
});
test('duplicate contradictory nutrients block all fill',()=>{
 const e=usda(raw([{nutrient:{id:1162,unitName:'mg'},amount:12},{nutrient:{id:1162,unitName:'mg'},amount:13}]));
 assert.equal(e.conflicts.length,1);assert.deepEqual(resolveMissing(current(e),e).additions,{});
});
test('identity/formulation/preparation/source conflicts never enrich',()=>{
 const e=usda();for(const key of ['description','brand','formulation','preparation','ingredients_text','data_type']){const f=current(e);f.identity={...e.identity,[key]:'other'};assert.deepEqual(resolveMissing(f,e).additions,{});}
 const f=current(e);f.provider='openfoodfacts';assert.deepEqual(resolveMissing(f,e).additions,{});
});
test('only absent micronutrients fill; known zero/null alias, corrected macros and diary safe',()=>{
 const e=usda();const f=current(e);const before=structuredClone(f);assert.equal(resolveMissing(f,e).additions.vitamin_c_mg.amount,12);assert.deepEqual(f,before);
 for(const v of [0,5,-1,'unknown']){assert.deepEqual(resolveMissing({...f,vitamin_c:v},e).additions,{});assert.deepEqual(resolveMissing({...f,micronutrients:{vitamin_c_mg:v}},e).additions,{});}
 assert.equal(resolveMissing({...f,vitamin_c:null},e).additions.vitamin_c_mg.amount,12);
 for(const nest of ['nutriments','off_data']){const override=nest==='nutriments'?{nutriments:{'vitamin-c_100g':null}}:{off_data:{nutriments:{'vitamin-c_100g':0}}};assert.deepEqual(resolveMissing({...f,...override},e).additions,{});}
 assert.deepEqual(resolveMissing({...f,macros_per:'serving'},e).additions,{});
});
test('TTL bounded and future/missing timestamp stale; no confirmed macro lockout',()=>{
 assert.equal(shouldRefreshNutrition({},now),true);assert.equal(shouldRefreshNutrition({captured_at:time},now),false);assert.equal(shouldRefreshNutrition({captured_at:'2027-01-01'},now),true);assert.equal(shouldRefreshNutrition({},NaN),false);assert.equal(shouldRefreshNutrition({},now,0),false);assert.equal(shouldRefreshNutrition({},now,91*86400000),false);
});
test('default network disabled, explicit reuse required, bounded budget',async()=>{
 let calls=0;const deps={claimRefresh:async()=>({status:'claimed'}),fetchProvider:async()=>{calls++;return raw();},refreshEvidence:async()=>({status:'applied'}),now:()=>now};const f=current(usda());
 assert.equal((await createRefreshService(deps).reuse(f,{explicitReuse:true,requestId})).status,'network_disabled');
 const s=createRefreshService({...deps,networkEnabled:true,budget:1});assert.equal((await s.reuse(f,{requestId})).status,'not_explicit_reuse');assert.equal(calls,0);assert.equal((await s.reuse(f,{explicitReuse:true,requestId})).status,'applied');assert.equal((await s.reuse(f,{explicitReuse:true,requestId})).status,'budget_exhausted');assert.equal(calls,1);
});
test('coalesces same revision; RPC captures evidence, no canonical authority from client',async()=>{
 let calls=0,writes=0,payload;const f=current(usda());const s=createRefreshService({claimRefresh:async()=>({status:'claimed'}),networkEnabled:true,now:()=>now,fetchProvider:async()=>{calls++;return raw();},refreshEvidence:async p=>{writes++;payload=p;return {status:'evidence_only'};}});
 const results=await Promise.all([s.reuse(f,{explicitReuse:true,requestId}),s.reuse(f,{explicitReuse:true,requestId})]);assert.equal(calls,1);assert.equal(writes,1);assert.equal(results[0].status,'evidence_only');assert.equal(payload.p_evidence.canonical_candidates,undefined);assert.equal(payload.p_expected_revision,1);assert.equal(payload.p_evidence.version,2);
});
test('provider failure never writes; uncertain RPC never retries or reports success',async()=>{
 const f=current(usda());let writes=0;const s=createRefreshService({claimRefresh:async()=>({status:'claimed'}),networkEnabled:true,now:()=>now,fetchProvider:async()=>{throw Error('bad');},refreshEvidence:async()=>{writes++;}});assert.equal((await s.reuse(f,{explicitReuse:true,requestId})).status,'provider_failed');assert.equal(writes,0);
 const uncertain=createRefreshService({claimRefresh:async()=>({status:'claimed'}),networkEnabled:true,now:()=>now,fetchProvider:async()=>raw(),refreshEvidence:async()=>{writes++;throw Error('connection lost');}});assert.equal((await uncertain.reuse(f,{explicitReuse:true,requestId})).status,'rpc_write_uncertain');assert.equal(writes,1);
});
test('invalid IDs, timestamps, numbers, oversized collections fail closed',()=>{
 assert.throws(()=>captureUSDA(raw(),{capturedAt:time,expectedId:'124'}));assert.throws(()=>captureUSDA(raw(),{capturedAt:'bad',expectedId:'123'}));assert.throws(()=>usda(raw(Array(4097).fill({}))));
 for(const v of [Infinity,NaN,'12',undefined])assert.deepEqual({...usda(raw([{nutrient:{id:1162,unitName:'mg'},amount:v}])).canonical_candidates},{});
});
test('checked-in map matches runtime map',()=>assert.deepEqual(JSON.parse(readFileSync(new URL('../src/nutrient-map.json',import.meta.url))),NUTRIENT_MAP));

test('distributed claim gates provider and uncertain claim never calls provider',async()=>{
 for(const status of ['fresh','busy','revision_conflict','identity_conflict']){let calls=0;const service=createRefreshService({networkEnabled:true,now:()=>now,claimRefresh:async()=>({status}),fetchProvider:async()=>{calls++;}});assert.equal((await service.reuse(current(usda()),{explicitReuse:true,requestId})).status,status);assert.equal(calls,0);}
});
test('bounded timeout aborts fetch and late provider cannot call RPC',async()=>{
 let writes=0,signal;const service=createRefreshService({networkEnabled:true,now:()=>now,timeoutMs:5,claimRefresh:async()=>({status:'claimed'}),fetchProvider:async p=>{signal=p.signal;await new Promise(r=>setTimeout(r,15));return raw();},refreshEvidence:async()=>{writes++;}});
 assert.equal((await service.reuse(current(usda()),{explicitReuse:true,requestId})).status,'provider_timeout');assert.equal(signal.aborted,true);await new Promise(r=>setTimeout(r,20));assert.equal(writes,0);
});
test('provider publication/edit timestamp alone does not create formulation conflict',()=>{
 const first=usda({...raw(),publicationDate:'2020-01-01'}),second=usda({...raw(),publicationDate:'2026-01-01'});assert.deepEqual(first.identity,second.identity);
});

test('legacy nested folates alias protects known folate from filling',()=>{
 const e=usda(raw([{nutrient:{id:1177,unitName:'mcg'},amount:50}]));
 assert.deepEqual(resolveMissing({...current(e),nutriments:{folates_100g:0}},e).additions,{});
 assert.deepEqual(resolveMissing({...current(e),off_data:{nutriments:{folates_100g:null}}},e).additions,{});
});
test('hung claim and RPC are bounded uncertain outcomes, no retry',async()=>{
 const f=current(usda());let providers=0,writes=0,claimSignal,writeSignal;
 const hungClaim=createRefreshService({networkEnabled:true,timeoutMs:10,now:()=>now,claimRefresh:(_,{signal})=>{claimSignal=signal;return new Promise(()=>{});},fetchProvider:()=>{providers++;}});
 assert.equal((await hungClaim.reuse(f,{explicitReuse:true,requestId})).status,'claim_write_uncertain');assert.equal(providers,0);assert.equal(claimSignal.aborted,true);
 const hungWrite=createRefreshService({networkEnabled:true,timeoutMs:10,now:()=>now,claimRefresh:async()=>({status:'claimed'}),fetchProvider:async()=>raw(),refreshEvidence:(_,{signal})=>{writes++;writeSignal=signal;return new Promise(()=>{});}});
 assert.equal((await hungWrite.reuse(f,{explicitReuse:true,requestId})).status,'rpc_write_uncertain');assert.equal(writes,1);assert.equal(writeSignal.aborted,true);
});
test('claim + provider + RPC share one deadline, not separate timeout windows',async()=>{
 let writes=0;const delay=ms=>new Promise(r=>setTimeout(r,ms));
 const service=createRefreshService({networkEnabled:true,timeoutMs:20,now:()=>now,claimRefresh:async()=>{await delay(12);return {status:'claimed'};},fetchProvider:async()=>{await delay(12);return raw();},refreshEvidence:async()=>{writes++;}});
 assert.equal((await service.reuse(current(usda()),{explicitReuse:true,requestId})).status,'provider_timeout');assert.equal(writes,0);
});
test('OFF label-value and unnormalized numeric facts retained without canonical enrichment',()=>{
 const e=off({'vitamin-c_value':12,'vitamin-c_unit':'mg','unusual-micro_value':4,'unusual-micro_unit':'IU','calcium':2});
 assert.equal(e.nutrients.length,3);assert.ok(e.nutrients.every(n=>n.basis.kind==='unknown'));assert.deepEqual({...e.canonical_candidates},{});assert.equal(e.nutrients[0].amount,12);assert.equal(e.nutrients[0].unit,'mg');assert.equal(e.nutrients[1].unit,'iu');
});
test('512-fact and SQL payload limits reject explicitly, never silently truncate',()=>{
 assert.throws(()=>usda(raw(Array.from({length:513},(_,i)=>({nutrient:{id:i+1,unitName:'g'},amount:1})))));
 assert.throws(()=>off(Object.fromEntries(Array.from({length:513},(_,i)=>[`micro${i}_value`,1]))));
 assert.throws(()=>usda(raw([{nutrient:{id:1162,unitName:'mg'},amount:1e10}])));
});
test('present malformed identity fields reject instead of turning branded identity into absence',()=>{
 for(const [key,value] of [['ingredients','x'.repeat(4097)],['ingredients','line\nbreak'],['brandOwner','x'.repeat(161)],['brandOwner',{}],['brandName',{}],['preparation',[]],['dataType',7]])assert.throws(()=>usda({...raw(),[key]:value}),/identity/);
 assert.throws(()=>usda({...raw(),brandOwner:{},brandName:'valid fallback'}),/identity/);
 for(const [key,value] of [['ingredients_text','x'.repeat(4097)],['ingredients_text','line\nbreak'],['brands',{}],['brands','x'.repeat(161)],['preparation',{}]])assert.throws(()=>captureOFF({code:'12345678',product_name:'Food',nutriments:{iron_100g:1},[key]:value},{capturedAt:time,expectedId:'12345678'}),/identity/);
 assert.equal(usda({...raw(),brandOwner:'',brandName:'Actual brand'}).identity.brand,'Actual brand');
});
test('OFF normalized optional mass facts retain grams, alcohol remains unknown',()=>{
 const aliases=['polyunsaturated-fat','monounsaturated-fat','added-sugars','soluble-fiber','insoluble-fiber','starch','water'];
 const nutriments=Object.fromEntries(aliases.flatMap(k=>[[`${k}_100g`,2],[`${k}_serving`,1],[`${k}_unit`,'mg']]));
 nutriments.alcohol_100g=5;nutriments.alcohol_unit='% vol';
 const e=off(nutriments,{verifiedBasis:'per_100g'});
 for(const k of aliases){const normalized=e.nutrients.find(n=>n.provider_key===`${k}_100g`),serving=e.nutrients.find(n=>n.provider_key===`${k}_serving`);assert.equal(normalized.unit,'g');assert.equal(normalized.amount,2);assert.equal(serving.unit,'g');assert.equal(serving.basis.kind,'serving');}
 const alcohol=e.nutrients.find(n=>n.provider_key==='alcohol_100g');assert.equal(alcohol.unit,'unknown');assert.equal(alcohol.label_unit,'% vol');assert.deepEqual({...e.canonical_candidates},{});
});
