import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require(process.env.BARCODE_RECOVERY_NODE_MODULES?process.env.BARCODE_RECOVERY_NODE_MODULES+'/typescript':'typescript');
const override=process.env.NUTRITION_CAPTURE_SOURCE_BUNDLE?JSON.parse(fs.readFileSync(process.env.NUTRITION_CAPTURE_SOURCE_BUNDLE,'utf8')):null;
const read=path=>override?.files.find(f=>f.path===path)?.content??fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const data=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const shared=name=>read('supabase/functions/_shared/'+name);
const transpile=source=>data(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
let selected=shared('selectedNutritionEndpoint.ts')
 .replace("'./offMass.mjs'",JSON.stringify(data(shared('offMass.mjs'))))
 .replace("'./selectedNutrition.mjs'",JSON.stringify(data(shared('selectedNutrition.mjs'))))
 .replace("import {readProviderJSON,createSelectionCapture} from './nutritionRefresh.mjs';","const readProviderJSON=async r=>r.json();const createSelectionCapture=()=>async()=>({status:'disabled'});");
const {handleSelectedNutrition}=await import(transpile(selected));
const portions=data(shared('foodPortions.mjs'));
const cache=data(shared('portionCache.mjs').replace("'./foodPortions.mjs'",JSON.stringify(portions)));
let endpoint=shared('portionEndpoint.ts')
 .replace("import {selectedSourceEnvelope} from './selectedNutrition.mjs';","const selectedSourceEnvelope=()=>{throw Error('capture forbidden')};")
 .replace("import {refreshCachedSelection,readProviderJSON} from './nutritionRefresh.mjs';","const refreshCachedSelection=()=>{throw Error('refresh forbidden')};const readProviderJSON=()=>{throw Error('provider forbidden')};")
 .replace("'./portionCache.mjs'",JSON.stringify(cache));
const {handlePortionRequest}=await import(transpile(endpoint));
const fixture=JSON.parse(read('tests/fixtures/off-bread-upc-source.json'));
const requestId='12345678-1234-4234-8234-123456789012';
const owner='11111111-1111-4111-8111-111111111111';
const foodId='22222222-2222-4222-8222-222222222222';
const req=body=>new Request('https://fixture.invalid',{method:'POST',headers:{authorization:'Bearer synthetic-test-only'},body:JSON.stringify(body)});
globalThis.Deno={env:{get:()=>undefined}};
test('real public OFF nutrition excerpt survives checksum-valid UPC/EAN alias without raw mutation',async()=>{
 const original=globalThis.fetch;const calls=[];
 try{
  globalThis.fetch=async url=>{assert.match(String(url),/0024126018312/);return new Response(JSON.stringify({status:1,product:fixture.product}));};
  const admin={auth:{getUser:async()=>({data:{user:{id:owner}}})},rpc:(name,args)=>{calls.push({name,args});return {abortSignal:async()=>({data:{status:name.startsWith('claim')?'claimed':'captured',snapshot_id:'test-snapshot',version:1}})}}};
  const response=await handleSelectedNutrition(req({operation:'capture_selected_nutrition_v1',request_id:requestId,provider:'openfoodfacts',source_id:fixture.requested_code}),admin,{});
  const result=await response.json();assert.equal(response.status,200);assert.equal(result.status,'captured');assert.equal(result.source_id,fixture.requested_code);assert.equal(result.captured_source_id,fixture.product.code);
  assert.equal(calls[0].args.p_source_id,fixture.product.code);assert.deepEqual(calls[1].args.p_evidence.raw_payload,fixture.product);assert.equal(Object.keys(calls[1].args.p_evidence.raw_payload.nutriments).length,100);
 }finally{globalThis.fetch=original;}
});
test('a different Hawaiian bread variant is not accepted as an alias',async()=>{
 const original=globalThis.fetch;let records=0;
 try{
  globalThis.fetch=async()=>new Response(JSON.stringify({status:1,product:{...fixture.product,code:'0024126018756',_id:'0024126018756'}}));
  const admin={auth:{getUser:async()=>({data:{user:{id:owner}}})},rpc:name=>{if(name.startsWith('record'))records++;return {abortSignal:async()=>({data:{status:'claimed'}})}}};
  assert.equal((await handleSelectedNutrition(req({operation:'capture_selected_nutrition_v1',request_id:requestId,provider:'openfoodfacts',source_id:fixture.requested_code}),admin,{})).status,503);assert.equal(records,0);
 }finally{globalThis.fetch=original;}
});
const snapshot={id:foodId,source:'usda',usda_fdc_id:'171689',name:'Apples, raw, without skin',macros_per:'100g'};
const envelope={version:1,provider:'usda',fdcId:'171689',foodDescription:snapshot.name,dataType:'SR Legacy',retrievedAt:'2026-11-08T00:00:00.000Z',portions:[{key:'0',amount:1,grams:161,description:'medium (3" dia)',sourcePortionId:'89199'}]};
function cacheAdmin({cached=envelope,protectedRow=false,authenticated=true}={}){
 const calls=[];return {calls,auth:{getUser:async()=>authenticated?{data:{user:{id:owner}}}:{error:'synthetic denied'}},from(){throw Error('food mutation forbidden')},rpc:(name,args)=>{
  calls.push(name);assert.ok(['read_food_search_snapshots_v1','read_usda_portions_v1'].includes(name),'write or claim forbidden: '+name);
  return {abortSignal:async()=>({data:name==='read_food_search_snapshots_v1'?[{id:foodId,snapshot,protected:protectedRow}]:cached?[{fdc_id:'171689',payload:cached}]:[]})};
 }};
}
test('cache-only operation returns exact medium161g using read RPCs only',async()=>{
 const original=globalThis.fetch;try{globalThis.fetch=()=>{throw Error('provider forbidden')};const admin=cacheAdmin();const response=await handlePortionRequest(req({operation:'usda_portions_cached_v1',food_item_id:foodId}),admin,{});const result=await response.json();assert.equal(response.status,200);assert.equal(result.cache_only,true);assert.equal(result.cached,true);assert.equal(result.food_item_id,foodId);assert.equal(result.binding_verified,true);assert.equal(result.food_description,envelope.foodDescription);assert.equal(result.portion_evidence.portions[0].grams,161);assert.equal(result.calories,undefined);}finally{globalThis.fetch=original;}
});
test('cache-only miss never invokes provider or write-capable capture path',async()=>{
 const original=globalThis.fetch;try{globalThis.fetch=()=>{throw Error('provider forbidden')};const response=await handlePortionRequest(req({operation:'usda_portions_cached_v1',food_item_id:foodId}),cacheAdmin({cached:null}),{});const result=await response.json();assert.equal(response.status,200);assert.equal(result.code,'cache_miss');assert.equal(result.cached,false);assert.equal(result.portion_evidence,null);}finally{globalThis.fetch=original;}
});
test('cache-only protected rows and unauthenticated requests cannot reveal portions',async()=>{
 for(const [options,status]of [[{protectedRow:true},409],[{authenticated:false},401]]){const admin=cacheAdmin(options);const response=await handlePortionRequest(req({operation:'usda_portions_cached_v1',food_item_id:foodId}),admin,{});assert.equal(response.status,status);assert.equal((await response.json()).portion_evidence,undefined);assert.ok(!admin.calls.includes('read_usda_portions_v1'));}
});
test('cache-only requires UUID and dispatcher explicitly routes both portion operations',async()=>{
 for(const body of [{fdc_id:'171689'},{food_item_id:foodId,fdc_id:'171689'}])assert.equal((await handlePortionRequest(req({operation:'usda_portions_cached_v1',...body}),cacheAdmin(),{})).status,400);
 assert.match(read('supabase/functions/lookup-barcode/index.ts'),/\['usda_portions_v1','usda_portions_cached_v1'\]\.includes/);
});
