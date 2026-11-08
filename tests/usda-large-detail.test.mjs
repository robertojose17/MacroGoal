import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
const candidate=process.env.NUTRITION_CAPTURE_CANDIDATE_DIR;
const root=candidate?pathToFileURL(candidate+'/'):new URL('../supabase/functions/_shared/',import.meta.url);
const file=name=>new URL(candidate?name.replace(/\.(mjs|ts)$/,'.usda-large.$1'):name,root);
const {readProviderJSON}=await import(file('nutritionRefresh.mjs'));
const {selectedSourceEnvelope,postgresJsonbBytes}=await import(file('selectedNutrition.mjs'));
const egg={fdcId:748967,description:'Eggs, Grade A, Large, egg whole',dataType:'Foundation',foodPortions:[{id:193781,amount:1,gramWeight:50.3,modifier:'whole without shell',measureUnit:{name:'egg'}}],foodNutrients:Array.from({length:101},(_,i)=>({nutrient:{id:1000+i,name:'synthetic nutrient '+i,unitName:'G'},amount:i/10})),inputFoods:[{labData:'x'.repeat(830000)}]};
test('default/OFF cap256KiB unchanged; explicit USDA detail stream cap1MiB preserves allraw',async()=>{
 const body=JSON.stringify(egg);assert.ok(Buffer.byteLength(body)>800000);
 await assert.rejects(()=>readProviderJSON(new Response(body)),/provider_body_too_large/);
 const raw=await readProviderJSON(new Response(body),{maxBytes:1048576});assert.deepEqual(raw,egg);
 const e=selectedSourceEnvelope('usda','748967',raw);assert.deepEqual(e.raw_payload,raw);assert.equal(e.nutrition.nutrients.length,101);assert.ok(postgresJsonbBytes(e)<2097152);
 assert.throws(()=>selectedSourceEnvelope('usda','748967',raw,new Date().toISOString(),'search_response'),/source_payload_too_large/);
 assert.throws(()=>selectedSourceEnvelope('openfoodfacts','0024126018312',{code:'0024126018312',nutriments:{fat_100g:1},padding:'x'.repeat(300000)}),/source_payload_too_large/);
 await assert.rejects(()=>readProviderJSON(new Response('x'.repeat(1048577)),{maxBytes:1048576}),/provider_body_too_large/);
 await assert.rejects(()=>readProviderJSON(new Response('{}'),{maxBytes:1048577}),/invalid_body_limit/);
});
const require=createRequire(import.meta.url),ts=require(process.env.BARCODE_RECOVERY_NODE_MODULES?process.env.BARCODE_RECOVERY_NODE_MODULES+'/typescript':'typescript');
let endpoint=fs.readFileSync(file('portionEndpoint.ts'),'utf8').replace(/(['"])\.\/(selectedNutrition|nutritionRefresh)\.mjs\1/g,(_,q,n)=>JSON.stringify(file(n+'.mjs').href)).replace("'./portionCache.mjs'",JSON.stringify(new URL(candidate?'portionCache.extended.mjs':'portionCache.mjs',root).href));
const {handlePortionRequest}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(endpoint,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
let selectedEndpoint=fs.readFileSync(file('selectedNutritionEndpoint.ts'),'utf8').replace(/(['"])\.\/(selectedNutrition|nutritionRefresh)\.mjs\1/g,(_,q,n)=>JSON.stringify(file(n+'.mjs').href)).replace("'./offMass.mjs'",JSON.stringify(new URL('offMass.mjs',root).href));
const {handleSelectedNutrition}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(selectedEndpoint,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
async function verifyActualPipeline(raw){
 const oldFetch=globalThis.fetch,oldDeno=globalThis.Deno;let fetched=0,recorded,portions;
 const id='11111111-1111-4111-8111-111111111111';const snapshot={id,source:'usda',usda_fdc_id:String(raw.fdcId),name:raw.description,macros_per:'100g'};
 const admin={auth:{getUser:async()=>({data:{user:{id:'22222222-2222-4222-8222-222222222222'}}})},from(){throw Error('catalog mutation forbidden');},rpc(name,args){return {abortSignal:async()=>{
  if(name==='read_food_search_snapshots_v1')return {data:[{id,snapshot,protected:false}]};
  if(name==='read_usda_portions_v1')return {data:[]};
  if(name==='claim_selected_nutrition_v1')return {data:{status:'claimed'}};
  if(name==='record_selected_nutrition_v1'){recorded=args.p_evidence;return {data:{status:'captured'}};}
  if(name==='record_usda_portions_v1'){portions=args.p_payload;return {data:{}};}
  throw Error('unexpected '+name);
 }}}};
 try{
  globalThis.Deno={env:{get:()=>undefined}};globalThis.fetch=async url=>{assert.match(String(url),new RegExp('/food/'+raw.fdcId+'\\?'));fetched++;return new Response(JSON.stringify(raw));};
  const response=await handlePortionRequest(new Request('https://fixture.invalid',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify({operation:'usda_portions_v1',food_item_id:id})}),admin,{}),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.binding_verified,true);assert.equal(body.portion_persisted,true);assert.equal(body.portion_evidence.portions[0].grams,50.3);assert.equal(portions.portions[0].grams,50.3);assert.deepEqual(recorded.raw_payload,raw);assert.equal(recorded.nutrition.nutrients.length,raw.foodNutrients.length);assert.equal(fetched,1);
  const selected=await handleSelectedNutrition(new Request('https://fixture.invalid',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify({operation:'capture_selected_nutrition_v1',request_id:'33333333-3333-4333-8333-333333333333',provider:'usda',source_id:String(raw.fdcId)})}),admin,{});assert.equal(selected.status,200);assert.equal((await selected.json()).canonical_applied,false);assert.deepEqual(recorded.raw_payload,raw);assert.equal(fetched,2);
 }finally{globalThis.fetch=oldFetch;globalThis.Deno=oldDeno;}
}
test('actual UUID endpoint passes full-size raw through REAL stream parser and evidence builder once',()=>verifyActualPipeline(egg));
if(process.env.USDA_LARGE_REAL_FIXTURE)test('local official748967 complete response survives real parser + envelope + UUID pipeline',async t=>{
 const bytes=fs.readFileSync(process.env.USDA_LARGE_REAL_FIXTURE),raw=JSON.parse(bytes);assert.equal(raw.fdcId,748967);
 await assert.rejects(()=>readProviderJSON(new Response(bytes)),/provider_body_too_large/);
 const parsed=await readProviderJSON(new Response(bytes),{maxBytes:1048576});assert.deepEqual(parsed,raw);
 const envelope=selectedSourceEnvelope('usda','748967',parsed);assert.deepEqual(envelope.raw_payload,raw);await verifyActualPipeline(raw);
 t.diagnostic(JSON.stringify({wire:bytes.length,rawPg:postgresJsonbBytes(raw),envelopePg:postgresJsonbBytes(envelope),nutrients:envelope.nutrition.nutrients.length}));
});
