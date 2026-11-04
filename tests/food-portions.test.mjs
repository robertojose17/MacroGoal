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
  rpc(name,args){const run=()=>{if(name==='record_food_nutrition_evidence_v1')return {data:1,error:null};if(name==='read_usda_portions_v1')return {data:[...cache].map(([fdc_id,payload])=>({fdc_id,payload})),error:null};cache.set(args.p_fdc_id,structuredClone(args.p_payload));return {data:null,error:null};};return {abortSignal:async()=>run(),then:(a,b)=>Promise.resolve(run()).then(a,b)};},
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
  assert.equal(f.catalog.get('123').off_data.nutrition_evidence.facts['1008'].value,89);
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

test('multi-unit package labels and macros describe the same one-unit selection',()=>{
 const product={code:'fixture-package',serving_size:'4 cookies (29 g)',serving_quantity:29,nutriments:{'energy-kcal_100g':400,'energy-kcal_serving':116,'proteins_100g':8,'proteins_serving':2.32}};
 const before=structuredClone(product), serving=extractServingSize(product);
 assert.equal(serving.grams,7.25);
 assert.ok(formatFoodRowServing(serving.displayText,1,serving.grams).includes('7.25'));
 assert.equal(extractNutritionPerServing(product,serving.grams).calories,29);
 assert.equal(extractNutritionPerServing(product,29).calories,116);
 assert.equal(extractNutritionPerServing(product,serving.grams).protein,0.6);
 assert.deepEqual(product,before);
});
test('serving-only nutrients scale from their declared mass without inventing a basis',()=>{
 const product={code:'fixture-package',serving_quantity:30,nutriments:{'energy-kcal_serving':120,'proteins_serving':6}};
 assert.equal(extractNutritionPerServing(product,15).calories,60);
 assert.equal(extractNutritionPerServing(product,15).protein,3);
 assert.equal(extractNutritionPerServing({...product,serving_quantity:undefined},15).calories,0);
});
test('new view uses one natural unit and only verified volume choices; old edit loader stays protected',()=>{
 const source=readFileSync(new URL('../components/FoodDetailsLayout.tsx',import.meta.url),'utf8');
 const start=source.indexOf('  const loadViewData = useCallback'),end=source.indexOf('  // Helper: build a minimal',start);
 const view=source.slice(start,end);
 assert.ok(view.includes("setNumberOfServings('1');"));
 assert.ok(!view.includes('setNumberOfServings(unitCount'));
 assert.ok(source.includes("if (mode === 'edit' || itemId) options.push("));
});

test('fractional package mass is not rounded before detail or log calculations',()=>{
 const product={code:'fixture-third',serving_size:'3 pieces (100 g)',serving_quantity:100,nutriments:{'energy-kcal_100g':300}};
 const unit=extractServingSize(product);
 assert.equal(unit.grams,100/3);assert.equal(extractNutritionPerServing(product,unit.grams).calories,100);
});
test('entire SQL candidate retains complete regex literals and atomic service-only ACLs',()=>{
 const sql=readFileSync(new URL('../supabase/review/food-search-v2/portion-cache.CANDIDATE.sql',import.meta.url),'utf8');
 assert.equal(sql.split("'^[0-9]{1,20}$'").length-1,3);
 assert.equal(sql.split('$fn$').length-1,4);
 assert.equal((sql.match(/^CREATE FUNCTION /gm)||[]).length,2);
 assert.equal((sql.match(/^BEGIN;/gm)||[]).length,1);
 assert.match(sql,/COMMIT;\s*$/);
 for(const signature of ['read_usda_portions_v1(text[])','record_usda_portions_v1(text,jsonb)']){
  assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.'+signature+' FROM PUBLIC,anon,authenticated;'));
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.'+signature+' TO service_role;'));
 }
 assert.equal((sql.match(/SECURITY INVOKER SET search_path = ''/g)||[]).length,2);
 assert.ok(!/GRANT[^;]*TO (PUBLIC|anon|authenticated)/i.test(sql));
});

const evidence=await import('../supabase/functions/_shared/nutritionEvidence.mjs');
const nutrientFood={fdcId:123,description:'Exact food, cooked',publicationDate:'2026-01-01',foodNutrients:[{nutrient:{id:1008,unitName:'kcal'},amount:100},{nutrient:{id:1093,unitName:'mg'},amount:0},{nutrient:{id:1106,unitName:'ug'},amount:5}]};
test('all available nutrient amounts retain units and explicit zero; absence stays absent',()=>{
 const result=evidence.captureUsdaNutrition(nutrientFood,123,date);
 assert.equal(result.facts['1093'].value,0);assert.equal(result.facts['1093'].unit,'mg');
 assert.equal(result.facts['1106'].unit,'ug');assert.equal(result.facts['1003'],undefined);
 assert.equal(evidence.captureUsdaNutrition(nutrientFood,124,date),null);
});
test('malformed or contradictory provider nutrient amounts are not silently selected',()=>{
 assert.equal(evidence.captureUsdaNutrition({...nutrientFood,foodNutrients:[...nutrientFood.foodNutrients,{nutrient:{id:1093,unitName:'mg'},amount:4}]},123,date),null);
 const result=evidence.captureUsdaNutrition({...nutrientFood,foodNutrients:[{nutrient:{id:1,unitName:'g'},amount:null},{nutrient:{id:2,unitName:'g'},amount:0}]},123,date);
 assert.equal(result.facts['1'],undefined);assert.equal(result.facts['2'].value,0);
});
test('refresh fills only missing facts and protects known zero and immutable snapshots',()=>{
 const candidate=evidence.captureUsdaNutrition(nutrientFood,123,date), current={...structuredClone(candidate),revision:1,facts:{'1093':candidate.facts['1093']}};
 const before=structuredClone(current);const result=evidence.resolveNutritionRefresh(current,candidate,1);
 assert.equal(result.status,'fill_missing');assert.equal(result.record.facts['1093'].value,0);assert.equal(result.record.facts['1106'].value,5);assert.deepEqual(current,before);
 assert.equal(evidence.resolveNutritionRefresh(current,candidate,0).status,'conflict');
 assert.equal(evidence.resolveNutritionRefresh({...current,confirmed:true},candidate,1).status,'protected');
 assert.equal(evidence.resolveNutritionRefresh(current,{...candidate,formulation:'new formulation'},1).status,'identity_conflict');
 const changed=structuredClone(candidate);changed.facts['1093'].value=1;
 assert.equal(evidence.resolveNutritionRefresh(current,changed,1).status,'nutrient_conflict');
});
test('OFF preserves ambiguous liquid basis and requires exact provider identity',()=>{
 const product={code:'012345678905',product_name:'Fixture drink',serving_size:'250 ml',serving_quantity:250,nutriments:{sodium_100g:0,'energy-kcal_serving':80}};
 const result=evidence.captureOffNutrition(product,product.code,date);
 assert.equal(result.facts.sodium_100g.basis,'provider_100');assert.equal(result.facts['energy-kcal_serving'].grams,undefined);
 assert.equal(evidence.captureOffNutrition(product,'999999999999',date),null);
});
test('fresh evidence and confirmed corrections do not trigger provider refresh',()=>{
 const now=Date.parse(date);assert.equal(evidence.shouldRefreshNutrition({retrievedAt:date},now),false);
 assert.equal(evidence.shouldRefreshNutrition({confirmed:true},now),false);
 assert.equal(evidence.shouldRefreshNutrition(null,now),true);
});

test('evidence append reports database errors and timeouts without blocking the food flow',async()=>{
 const fact=evidence.captureUsdaNutrition(nutrientFood,123,date);let args;
 const admin={rpc(name,values){assert.equal(name,'record_food_nutrition_evidence_v1');args=values;return {abortSignal:async()=>({data:1,error:null})};}};
 assert.equal(await evidence.recordNutritionEvidence(admin,'fixture-food',fact),true);
 assert.equal(args.p_expected_revision,null);assert.deepEqual(args.p_payload,fact);
 assert.equal(await evidence.recordNutritionEvidence({rpc:()=>({abortSignal:async()=>({error:{code:'fixture'}})})},'fixture-food',fact),false);
 let signal;const hung={rpc:()=>({abortSignal:s=>{signal=s;return new Promise(()=>{});}})};
 assert.equal(await evidence.recordNutritionEvidence(hung,'fixture-food',fact,10),false);assert.equal(signal.aborted,true);
});
test('evidence SQL remains append-only and service-only pending separate activation',()=>{
 const sql=readFileSync(new URL('../supabase/review/food-search-v2/nutrition-evidence.CANDIDATE.sql',import.meta.url),'utf8');
 assert.ok(sql.includes("SECURITY INVOKER SET search_path=''"));
 assert.ok(sql.includes('GRANT SELECT,INSERT ON macrogoal_food_private.nutrition_evidence TO service_role;'));
 assert.ok(!/UPDATE public\.food_items|DELETE FROM|GRANT[^;]+TO (anon|authenticated|PUBLIC)/i.test(sql));
});

const correction=await import('../supabase/functions/vision-nutrition-extract/identity.mjs');
const checkedLabel={product_name:'Exact package',brand:'Fixture',confidence:'high',match:true,serving_size_g:30,serving_quantity:'1 pack (30 g)',per_serving:{calories:120,protein:4,carbs:20,fat:3,fiber:null}};
test('actual correction workflow forwards original version and preserves unknown fiber',async()=>{
 const row={id:'fixture-food',barcode:'012345678905',updated_at:'2026-11-03T00:00:00Z'};let received;
 const result=await correction.handleVerifiedCorrection(checkedLabel,{row,barcode:row.barcode,isNew:false},{update:async(id,values,expected)=>{received={id,values,expected};return {...row,...values};}});
 assert.equal(result.status,'approved');assert.equal(received.expected,row);assert.equal(received.values.fiber,null);assert.equal(received.values.macros_per,'serving');
});
test('concurrent correction conflict cannot return approval or overwrite a newer record',async()=>{
 const row={id:'fixture-food',barcode:'012345678905',updated_at:'old'};let calls=0;
 const result=await correction.handleVerifiedCorrection(checkedLabel,{row,barcode:row.barcode,isNew:false},{update:async()=>{calls++;throw Object.assign(Error('catalog_changed'),{code:'40001'});}});
 assert.equal(result.status,'error');assert.equal(calls,1);assert.equal(result.food_item,undefined);
});
test('insert race fails visibly without reading or overwriting the winning row',async()=>{
 let reads=0,updates=0;
 await assert.rejects(correction.persistVerifiedCorrection({row:null,barcode:'012345678905',isNew:true},{name:'Stale proposal'},{insert:async()=>{throw {code:'23505'};},findByBarcodes:async()=>{reads++;return [{id:'winner',_nutrition_revision:9}];},update:async()=>{updates++;}}),error=>error.code==='40001');
 assert.equal(reads,0);assert.equal(updates,0);
});
test('two proposals confirmed against absence cannot overwrite the first insert winner',async()=>{
 let winner=null,updates=0;const identity={row:null,barcode:'012345678905',isNew:true};
 const repo={insert:async values=>{await Promise.resolve();if(winner)throw {code:'23505'};winner={id:'winner',...values};return winner;},update:async()=>{updates++;throw Error('must not overwrite');}};
 const other={...checkedLabel,product_name:'Other confirmed package',per_serving:{...checkedLabel.per_serving,calories:250}};
 const results=await Promise.all([correction.handleVerifiedCorrection(checkedLabel,identity,repo),correction.handleVerifiedCorrection(other,identity,repo)]);
 assert.equal(results.filter(r=>r.status==='approved').length,1);assert.equal(results.filter(r=>r.status==='error').length,1);assert.equal(updates,0);assert.equal(winner.name,checkedLabel.product_name);assert.equal(winner.calories,checkedLabel.per_serving.calories);
});
test('global guard candidate is private, role-bound and patches only verified live recovery baseline',()=>{
 const sql=readFileSync(new URL('../supabase/review/food-search-v2/nutrition-authority.CANDIDATE.sql',import.meta.url),'utf8');
 assert.ok(sql.includes("current_setting('role',true)='service_role'"));
 assert.ok(sql.includes("current_setting('macrogoal.correction_context',true)='confirmed_v1'"));
 assert.ok(sql.includes('BEFORE INSERT OR UPDATE OR DELETE ON public.food_items'));
 assert.ok(sql.includes('AFTER INSERT OR UPDATE ON public.food_items'));
 assert.equal((sql.match(/^BEGIN;/gm)||[]).length,1);assert.equal((sql.match(/^COMMIT;/gm)||[]).length,1);
 assert.equal((sql.match(/^CREATE FUNCTION /gm)||[]).length,5);
 assert.equal(sql.split('$fn$').length-1,10);assert.equal(sql.split('$patch$').length-1,2);
 assert.equal(sql.split("'^[0-9]{8,14}$'").length-1,2);
 assert.ok(sql.includes('945fc10d72f144171132e0a56e8b3e43'));
 assert.ok(sql.includes('OLD.ai_verified_source'));assert.ok(sql.includes('p_expected_revision'));assert.ok(!sql.includes('p_expected_updated_at'));
 assert.ok(!/GRANT[^;]+TO (PUBLIC|anon|authenticated)/i.test(sql));
 const source=readFileSync(new URL('../supabase/functions/vision-nutrition-extract/index.ts',import.meta.url),'utf8');
 const start=source.indexOf('if (type === "correction") {',source.indexOf('let foodItem:'));
 const end=source.indexOf('} else {',start);const branch=source.slice(start,end);
 assert.ok(branch.includes('apply_verified_food_correction_v1'));assert.ok(branch.includes('p_expected_revision:expected._nutrition_revision'));assert.ok(!branch.includes('.update(values)'));
 assert.ok(source.includes('read_food_correction_targets_v1'));
});

test('forged verification is checked before private writes; only AFTER events audit actual upsert winners',()=>{
 const sql=readFileSync(new URL('../supabase/review/food-search-v2/nutrition-authority.CANDIDATE.sql',import.meta.url),'utf8');
 const start=sql.indexOf('CREATE FUNCTION macrogoal_food_private.guard_food_nutrition_v1'),end=sql.indexOf('CREATE FUNCTION macrogoal_food_private.audit_food_nutrition_v1');
 const before=sql.slice(start,end);
 assert.ok(!/INSERT INTO|UPDATE SET|DELETE FROM/.test(before));
 assert.ok(before.includes('verification_metadata_server_only'));assert.ok(before.includes('NEW.ai_verified_source'));assert.ok(before.includes('RETURN OLD;'));
 assert.ok(before.includes("IF TG_OP='DELETE' THEN RAISE EXCEPTION"));
 assert.equal((sql.match(/ON DELETE RESTRICT/g)||[]).length,2);
 const audit=sql.slice(end,sql.indexOf('CREATE FUNCTION public.read_food_correction_targets_v1'));
 assert.ok(audit.includes('AFTER INSERT OR UPDATE'));assert.ok(audit.includes('before_value IS NOT DISTINCT FROM after_value THEN RETURN NEW'));
 assert.ok(sql.includes('close_importer_access_first'));
});
test('insert and update consume one explicit normalized patch including sugar and complete restoration metadata',()=>{
 const sql=readFileSync(new URL('../supabase/review/food-search-v2/nutrition-authority.CANDIDATE.sql',import.meta.url),'utf8');
 const writer=sql.slice(sql.indexOf('CREATE FUNCTION public.apply_verified_food_correction_v1'),sql.indexOf('-- Preserve the actual deployed recovery'));
 assert.ok(writer.includes("jsonb_populate_record(NULL::public.food_items,'{}'::jsonb)"));
 assert.equal((writer.match(/replacement:=jsonb_populate_record/g)||[]).length,1);
 assert.ok(writer.includes('INTO saved USING replacement;'));assert.ok(writer.includes('INTO saved USING replacement,p_id;'));
 const snapshot=sql.slice(sql.indexOf('CREATE FUNCTION macrogoal_food_private.nutrition_snapshot_v1'),sql.indexOf('REVOKE ALL ON FUNCTION macrogoal_food_private.nutrition_snapshot_v1'));
 for(const key of ['sugar','off_data','ingredients_text','allergens','nutriscore_grade','image_url','data_quality_score','ai_verified_at'])assert.ok(snapshot.includes("'"+key+"'"),key);
 assert.ok(writer.includes("'ai_verified_source','two_read_correction_v1'"));assert.ok(writer.includes("'ai_verified_at',now()"));
});
test('server revision wins over edited timestamp and prevents two stale confirmations committing',async()=>{
 let current={id:'same-id',barcode:'012345678905',updated_at:'client-edited',_nutrition_revision:4},writes=0;
 const identity={row:structuredClone(current),barcode:current.barcode,isNew:false};
 const repo={update:async(id,values,expected)=>{
  await Promise.resolve();
  if(expected._nutrition_revision!==current._nutrition_revision)throw {code:'40001'};
  writes++;current={...current,...values,_nutrition_revision:current._nutrition_revision+1};return current;
 }};
 const results=await Promise.all([correction.handleVerifiedCorrection(checkedLabel,identity,repo),correction.handleVerifiedCorrection(checkedLabel,identity,repo)]);
 assert.equal(results.filter(r=>r.status==='approved').length,1);assert.equal(writes,1);assert.equal(current.id,'same-id');assert.equal(current._nutrition_revision,5);
});
test('importer candidate restricts EXECUTE and scopes only a skip context, never its body or credentials',()=>{
 const sql=readFileSync(new URL('../supabase/review/food-search-v2/importer-access.CANDIDATE.sql',import.meta.url),'utf8');
 assert.ok(sql.includes('REVOKE EXECUTE ON FUNCTION public.import_usda_page(text,integer) FROM PUBLIC,anon,authenticated;'));
 assert.ok(sql.includes('TO service_role;'));assert.ok(!/CREATE OR REPLACE|api_key=|Bearer |sk-[a-z0-9]/i.test(sql));
 const statements=sql.split('\n').filter(line=>line.startsWith('ALTER FUNCTION'));
 assert.deepEqual(statements,["ALTER FUNCTION public.import_usda_page(text,integer) SET macrogoal.import_context = 'usda_import_v1';"]);
});

test('protected upsert skip requires backend and scoped importer marker; other writers fail visibly',()=>{
 const sql=readFileSync(new URL('../supabase/review/food-search-v2/nutrition-authority.CANDIDATE.sql',import.meta.url),'utf8');
 assert.ok(sql.includes("IF backend AND current_setting('macrogoal.import_context',true)='usda_import_v1' THEN RETURN OLD; END IF;"));
 assert.ok(sql.includes("RAISE EXCEPTION 'confirmed_nutrition_protected' USING ERRCODE='40001'"));
 assert.ok(sql.includes('configure_importer_context_first'));
 // Isolated decision fixture, not a PostgreSQL transaction/privilege execution.
 const decision=(backend,context,explicit)=>explicit&&backend?'write':backend&&context==='usda_import_v1'?'keep':'error';
 assert.equal(decision(false,'usda_import_v1',false),'error');
 assert.equal(decision(true,'',false),'error');
 assert.equal(decision(true,'usda_import_v1',false),'keep');
 assert.equal(decision(true,'',true),'write');
});

test('recovery SQL removes timestamp authority before enabling the confirmed write context',()=>{
 const sql=readFileSync(new URL('../supabase/review/food-search-v2/nutrition-authority.CANDIDATE.sql',import.meta.url),'utf8');
 const patch=sql.slice(sql.indexOf('-- Preserve the actual deployed recovery'));
 assert.ok(patch.includes("jsonb_typeof(p_payload->'expected_revision') is distinct from 'number'"));
 assert.ok(patch.includes('macrogoal_food_private.nutrition_current c where c.food_id=item.id'));
 assert.ok(patch.includes('recovery revision patch not applied'));
 const recoverySource=readFileSync(new URL('../supabase/functions/vision-nutrition-extract/recovery.ts',import.meta.url),'utf8');
 assert.ok(recoverySource.includes('read_food_correction_targets_v1'));assert.ok(recoverySource.includes('nutrition_revision:identity.row?._nutrition_revision??null'));assert.ok(!recoverySource.includes('updated_at:identity'));
});

test('OFF preserves explicit nutrient units without assuming liquid density or missing units',()=>{
 const p={code:'012345678905',product_name:'Fixture',nutriments:{sodium_100g:0,sodium_unit:'mg','energy-kcal_100g':55,proteins_serving:3,proteins_unit:'g'}};
 const captured=evidence.captureOffNutrition(p,p.code,date);
 assert.equal(captured.facts.sodium_100g.value,0);assert.equal(captured.facts.sodium_100g.unit,'mg');assert.equal(captured.facts.sodium_100g.basis,'provider_100');
 assert.equal(captured.facts['energy-kcal_100g'].unit,'provider_field');assert.equal(captured.facts.proteins_serving.unit,'g');assert.equal(captured.facts.proteins_serving.grams,undefined);
});
test('refresh validates evidence and rejects malformed facts without mutating the current record',()=>{
 const candidate=evidence.captureUsdaNutrition(nutrientFood,123,date);const current={...structuredClone(candidate),revision:3};const before=structuredClone(current);
 for(const change of [{version:2},{provider:'unknown'},{facts:{}},{facts:{x:{value:-1,unit:'g',basis:'100g'}}},{facts:{x:{value:1,unit:'g',basis:'100g',grams:30}}}])assert.equal(evidence.resolveNutritionRefresh(current,{...candidate,...change},3).status,'invalid');
 assert.equal(evidence.resolveNutritionRefresh(current,candidate,null).status,'conflict');assert.deepEqual(current,before);
});
test('refresh compares fact meaning rather than JSON key order and rejects older evidence',()=>{
 const candidate=evidence.captureUsdaNutrition(nutrientFood,123,date);const current={...structuredClone(candidate),revision:2};
 const reordered=structuredClone(candidate);for(const key of Object.keys(reordered.facts)){const f=reordered.facts[key];reordered.facts[key]={basis:f.basis,unit:f.unit,value:f.value};}
 assert.equal(evidence.resolveNutritionRefresh(current,reordered,2).status,'fill_missing');
 assert.equal(evidence.resolveNutritionRefresh(current,{...candidate,retrievedAt:'2000-01-01T00:00:00Z'},2).status,'stale_evidence');
});
test('refresh respects formulation, units, basis and confirmed provenance',()=>{
 const candidate=evidence.captureUsdaNutrition(nutrientFood,123,date),current={...structuredClone(candidate),revision:2};const key=Object.keys(candidate.facts)[0];
 for(const change of [{provider:'openfoodfacts'},{identity:'456'},{description:'Different preparation'},{formulation:'other release'}])assert.equal(evidence.resolveNutritionRefresh(current,{...candidate,...change},2).status,'identity_conflict');
 for(const change of [{unit:'mg'},{basis:'serving',grams:20}]){const next=structuredClone(candidate);next.facts[key]={...next.facts[key],...change};assert.equal(evidence.resolveNutritionRefresh(current,next,2).status,'nutrient_conflict');}
 assert.equal(evidence.resolveNutritionRefresh({...current,confirmed:true},candidate,2).status,'protected');
 assert.equal(evidence.shouldRefreshNutrition({retrievedAt:'2099-01-01T00:00:00Z'},Date.parse(date)),true);assert.equal(evidence.shouldRefreshNutrition({confirmed:true},Date.parse(date)),false);
});
