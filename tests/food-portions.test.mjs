import test from 'node:test';
import assert from 'node:assert/strict';
import {captureUsdaPortions,readUsdaPortions,defaultUsdaPortion,portionGrams,nutritionForGrams} from '../supabase/functions/_shared/foodPortions.mjs';
const date='2026-11-03T00:00:00Z';
const food=(portions)=>({fdcId:123,description:'Fixture food, cooked',dataType:'Foundation',foodPortions:portions});
const p=(amount=1,gramWeight=118,modifier='medium')=>({id:456,amount,gramWeight,modifier});
test('exact FDC identity required; descriptions never resolve another preparation',()=>{
 assert.equal(captureUsdaPortions(food([p()]),124,date),null);
 const e=captureUsdaPortions(food([p()]),123,date);
 assert.deepEqual(readUsdaPortions(e,124),[]);
 assert.equal(e.foodDescription,'Fixture food, cooked');
 assert.equal(e.provider,'usda'); assert.equal(e.portions[0].sourcePortionId,'456');
});
test('captured grams scale immutable per100 basis without rounding or mutation',()=>{
 const original={calories:89,protein:1.09,carbs:22.8,fat:0.33,fiber:null};
 const saved=structuredClone(original);
 const e=captureUsdaPortions(food([p()]),123,date);
 const grams=portionGrams(defaultUsdaPortion(e,123),1);
 assert.equal(grams,118); assert.equal(nutritionForGrams(original,grams).calories,105.02);
 assert.deepEqual(original,saved);
});
test('fractional measures retain exact quantity and weight',()=>{
 const e=captureUsdaPortions(food([p(0.5,80,'cup')]),123,date);
 assert.equal(portionGrams(e.portions[0],0.5),80);
 assert.equal(portionGrams(e.portions[0],1),160);
});
test('multiple measures are preserved; no arbitrary first default',()=>{
 const e=captureUsdaPortions(food([p(),p(1,140,'large')]),123,date);
 assert.equal(readUsdaPortions(e,123).length,2);
 assert.equal(defaultUsdaPortion(e,123).grams,100);
});
test('missing or malformed measures fall back without invented food weights',()=>{
 for(const portions of [[],[p(0)],[p(1,0)],[p(1,NaN)],[p(1,100,'')]]){
  assert.equal(captureUsdaPortions(food(portions),123,date),null);
 }
 assert.equal(defaultUsdaPortion(null,123).grams,100);
 assert.equal(portionGrams(p(),1),null);
});
test('ambiguous or unsafe cache envelope is rejected as a whole',()=>{
 const e=captureUsdaPortions(food([p()]),123,date);
 assert.deepEqual(readUsdaPortions({...e,provider:'client'},123),[]);
 assert.deepEqual(readUsdaPortions({...e,portions:[{...e.portions[0],grams:-1}]},123),[]);
 assert.equal(captureUsdaPortions(food([p()]),123,'invalid'),null);
});
test('dedupe only identical measures; preserve different weights',()=>{
 const e=captureUsdaPortions(food([p(),p(),p(1,120)]),123,date);
 assert.equal(e.portions.length,2);
});
test('nutrient validation preserves unknowns and rejects negative values',()=>{
 assert.equal(nutritionForGrams({calories:-1},100),null);
 assert.equal(nutritionForGrams({calories:10},100).protein,null);
 assert.equal(nutritionForGrams({calories:10},0),null);
});

import {resolveExactPortions,resolvePortionsWithin,servicePortionCache} from '../supabase/functions/_shared/portionCache.mjs';
const dependencies=(overrides={})=>({now:()=>date,cache:{read:async()=>null,write:async()=>{}},fetchExactFood:async()=>food([p()]),...overrides});
test('cache hit bypasses provider; cache identity mismatch cannot leak another portion',async()=>{
 const e=captureUsdaPortions(food([p()]),123,date); let fetches=0;
 const dep=dependencies({cache:{read:async()=>e,write:async()=>{}},fetchExactFood:async()=>{fetches++;return food([p()]);}});
 assert.equal((await resolveExactPortions('123',dep)).persisted,true); assert.equal(fetches,0);
 assert.equal((await resolveExactPortions('124',dep)).envelope,null); assert.equal(fetches,1);
});
test('provider result is persisted with exact identity and retrieval provenance',async()=>{
 let saved;
 const dep=dependencies({cache:{read:async()=>null,write:async(key,value)=>{saved={key,value};}}});
 const result=await resolveExactPortions('123',dep);
 assert.equal(result.persisted,true); assert.equal(saved.key,'123'); assert.equal(saved.value.retrievedAt,new Date(date).toISOString());
});
test('write failure retains fetched evidence but never reports persisted',async()=>{
 const dep=dependencies({cache:{read:async()=>null,write:async()=>{throw Error('fixture');}}});
 const result=await resolveExactPortions('123',dep);
 assert.ok(result.envelope); assert.equal(result.persisted,false);
});
test('provider failure and wrong preparation ID never write cache',async()=>{
 let writes=0; const cache={read:async()=>null,write:async()=>{writes++;}};
 for(const fetchExactFood of [async()=>{throw Error('fixture');},async()=>({...food([p()]),fdcId:456})]){
  assert.equal((await resolveExactPortions('123',dependencies({cache,fetchExactFood}))).envelope,null);
 }
 assert.equal(writes,0);
});
test('whole operation timeout covers hung cache before provider call',async()=>{
 let fetches=0; const dep=dependencies({cache:{read:()=>new Promise(()=>{}),write:async()=>{}},fetchExactFood:async()=>{fetches++;return food([p()]);}});
 const result=await resolvePortionsWithin('123',dep,10);
 assert.equal(result.envelope,null); assert.equal(fetches,0);
});
test('aborted request cannot fetch or persist',async()=>{
 let reads=0; const controller=new AbortController(); controller.abort();
 const dep=dependencies({cache:{read:async()=>{reads++;},write:async()=>{throw Error('must not write');}}});
 assert.equal((await resolveExactPortions('123',dep,controller.signal)).persisted,false); assert.equal(reads,0);
});
test('service cache RPC error propagates instead of false persistence success',async()=>{
 const admin={rpc:()=>Promise.resolve({error:{message:'fixture'},data:null})};
 const cache=servicePortionCache(admin);
 await assert.rejects(()=>cache.write('123',captureUsdaPortions(food([p()]),123,date)),/PORTION_CACHE_WRITE/);
});

import {applyUsdaPortion} from '../supabase/functions/_shared/foodPortions.mjs';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
registerHooks({resolve(specifier,context,next){return next(specifier==='@/utils/stringUtils'?new URL('../utils/stringUtils.ts',import.meta.url).href:specifier,context);}});
const {extractServingSize,extractNutritionPerServing}=await import('../utils/openFoodFacts.ts');
const {formatFoodRowServing}=await import('../utils/servingDisplay.ts');
const {buildSyntheticOffData}=await import('../utils/servingParser.ts');
test('search label, detail grams and logged nutrition share the actual adapter basis',()=>{
 for(const [amount,weight,description] of [[1,118,'medium'],[0.5,80,'cup'],[2,28,'slice'],[1,13.5,'tablespoon']]){
  const evidence=captureUsdaPortions(food([p(amount,weight,description)]),123,date);
  const raw={code:'catalog-id',_db_id:'catalog-id',_usda_fdc_id:'123',product_name:'Fixture food, cooked',serving_quantity:100,serving_size:'999 g',nutriments:{'energy-kcal_100g':89,'proteins_100g':1.09,'energy-kcal_serving':900}};
  const unchanged=structuredClone(raw);const product=applyUsdaPortion(raw,evidence);
  const serving=extractServingSize(product);const nutrition=extractNutritionPerServing(product,serving.grams);
  assert.equal(serving.grams,weight/amount);assert.equal(nutrition.calories,Math.round(89*weight/amount/100));
  assert.ok(formatFoodRowServing(product.serving_size,1,serving.grams).includes(String(Number((weight/amount).toFixed(2)))));
  assert.equal(product._db_id,raw._db_id);assert.equal(product.code,raw.code);assert.deepEqual(raw,unchanged);
 }
});
test('same FDC but wrong food description cannot apply a measure to another preparation',()=>{
 const evidence=captureUsdaPortions(food([p()]),123,date);
 const result=applyUsdaPortion({_usda_fdc_id:'123',product_name:'Fixture food, raw',nutriments:{}},evidence);
 assert.equal(result.serving_quantity,100);assert.equal(result._portion_evidence,null);
});
test('ambiguous measures and gram-only measures retain 100g default',()=>{
 for(const list of [[p(),p(1,200,'large')],[p(100,100,'g')]]){
  const evidence=captureUsdaPortions(food(list),123,date);
  const result=applyUsdaPortion({_usda_fdc_id:'123',product_name:'Fixture food, cooked',nutriments:{}},evidence);
  assert.equal(result.serving_quantity,100);assert.equal(result.serving_size,'100 g');
 }
});
test('actual barcode adapter preserves per100 macros and uses the same exact evidence',()=>{
 const evidence=captureUsdaPortions(food([p()]),123,date);
 const item={name:'Fixture food, cooked',barcode:'fixture-code',usda_fdc_id:'123',calories:89,protein:1.09,carbs:22.8,fat:0.33,fiber:null,serving_size:999,serving_quantity:100,macros_per:'100g',_portion_evidence:evidence};
 const saved=structuredClone(item);const scanned=buildSyntheticOffData(item);
 assert.equal(extractServingSize(scanned).grams,118);
 assert.equal(scanned.nutriments['energy-kcal_100g'],89);assert.deepEqual(item,saved);
});
test('non-USDA barcode measures remain unchanged',()=>{
 const product={code:'package',serving_quantity:42.5,serving_size:'1 pack (42.5 g)',nutriments:{'energy-kcal_100g':200}};
 assert.equal(applyUsdaPortion(product,null),product);
});
test('historical edit loader remains byte-identical to baseline',()=>{
 const file='components/FoodDetailsLayout.tsx';
 const current=readFileSync(new URL('../'+file,import.meta.url),'utf8');
 const baseline=readFileSync(new URL('../../baseline/'+file,import.meta.url),'utf8');
 const section=s=>{const start=s.indexOf('  const loadEditItem = useCallback');assert.ok(start>0);const end=s.indexOf('\n  useEffect(() => {',start);assert.ok(end>start);return s.slice(start,end);};
 assert.equal(section(current),section(baseline));
});

const {handlePortionRequest}=await import('../supabase/functions/_shared/portionEndpoint.ts');
function endpointFixture(existing=null){
 const catalog=new Map(existing?[['123',structuredClone(existing)]]:[]),cache=new Map();let insertions=0;
 const admin={auth:{getUser:async()=>({data:{user:{id:'fixture-owner'}},error:null})},
  rpc(name,args){const run=()=>{if(name==='read_usda_portions_v1')return {data:[...cache].map(([fdc_id,payload])=>({fdc_id,payload})),error:null};cache.set(args.p_fdc_id,structuredClone(args.p_payload));return {data:null,error:null};};return {abortSignal:async()=>run(),then:(a,b)=>Promise.resolve(run()).then(a,b)};},
  from(table){assert.equal(table,'food_items');let key,payload;
   const query={select(){return query;},eq(column,value){assert.equal(column,'usda_fdc_id');key=value;return query;},maybeSingle(){return query;},insert(value){payload=value;return query;},single(){return query;},async abortSignal(){if(payload){insertions++;const row={...payload,id:'22222222-2222-4222-8222-222222222222'};catalog.set(payload.usda_fdc_id,row);return {data:row,error:null};}return {data:catalog.get(key)??null,error:null};}};return query;}
 };
 return {admin,catalog,cache,get insertions(){return insertions;}};
}
const providerDetail=()=>({...food([p()]),foodNutrients:[
 {nutrient:{id:1008,unitName:'kcal'},amount:89},{nutrient:{id:1003,unitName:'g'},amount:1.09},
 {nutrient:{id:1004,unitName:'g'},amount:0.33},{nutrient:{id:1005,unitName:'g'},amount:22.8}]});
const portionRequest=(extra={},auth=true)=>new Request('https://fixture.invalid/lookup-barcode',{method:'POST',headers:auth?{Authorization:'Bearer fixture'}:{},body:JSON.stringify({operation:'usda_portions_v1',fdc_id:'123',...extra})});
test('actual authenticated endpoint inserts exact provider food once and reuses cached UUID',async()=>{
 const f=endpointFixture();const oldFetch=globalThis.fetch,oldDeno=globalThis.Deno;let fetches=0;
 globalThis.Deno={env:{get:()=> 'fixture-key'}};
 globalThis.fetch=async url=>{fetches++;assert.equal(new URL(url).pathname,'/fdc/v1/food/123');return Response.json(providerDetail());};
 try{
  const first=await handlePortionRequest(portionRequest(),f.admin,{});assert.equal(first.status,200);
  const saved=await first.json();assert.equal(saved.portion_persisted,true);assert.equal(saved.food_item_id,'22222222-2222-4222-8222-222222222222');
  assert.equal(f.catalog.get('123').calories,89);assert.equal(f.catalog.get('123').serving_size,100);assert.equal(f.cache.get('123').portions[0].grams,118);
  const second=await(await handlePortionRequest(portionRequest(),f.admin,{})).json();
  assert.equal(second.food_item_id,saved.food_item_id);assert.equal(fetches,1);assert.equal(f.insertions,1);
 }finally{globalThis.fetch=oldFetch;globalThis.Deno=oldDeno;}
});
test('actual capture never overwrites an existing catalog row or historical reference',async()=>{
 const existing={id:'11111111-1111-4111-8111-111111111111',name:'Fixture food, cooked',calories:91,serving_size:100,usda_fdc_id:'123'};
 const f=endpointFixture(existing);const oldFetch=globalThis.fetch,oldDeno=globalThis.Deno;
 globalThis.Deno={env:{get:()=> 'fixture-key'}};globalThis.fetch=async()=>Response.json(providerDetail());
 try{const result=await(await handlePortionRequest(portionRequest(),f.admin,{})).json();assert.equal(result.food_item_id,existing.id);assert.deepEqual(f.catalog.get('123'),existing);assert.equal(f.insertions,0);assert.equal(f.cache.size,1);}
 finally{globalThis.fetch=oldFetch;globalThis.Deno=oldDeno;}
});
test('capture rejects unauthenticated or client-supplied nutrient evidence before fetching',async()=>{
 const f=endpointFixture();const oldFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('must not fetch');};
 try{assert.equal((await handlePortionRequest(portionRequest({},false),f.admin,{})).status,401);assert.equal((await handlePortionRequest(portionRequest({foodPortions:[p()]}),f.admin,{})).status,400);assert.equal(calls,0);assert.equal(f.cache.size,0);assert.equal(f.insertions,0);}
 finally{globalThis.fetch=oldFetch;}
});
