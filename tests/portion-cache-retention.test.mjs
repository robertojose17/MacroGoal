import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const candidate=process.env.NUTRITION_CAPTURE_CANDIDATE_DIR;
const root=candidate?pathToFileURL(candidate+'/'):new URL('../supabase/functions/_shared/',import.meta.url);
const {decorateCachedProducts}=await import(new URL(candidate?'portionCache.preserve-evidence.mjs':'portionCache.mjs',root));
const {attachCatalogPortionSources}=await import(new URL('catalogPortionBatch.mjs',root));
const {SEARCH_SNAPSHOT_FIELDS}=await import(new URL('searchHydration.mjs',root));
const envelope={version:1,provider:'usda',fdcId:'1105073',foodDescription:'Bananas, overripe, raw',retrievedAt:new Date().toISOString(),portions:[{key:'0',amount:1,grams:110,description:'Banana, Peeled'},{key:'1',amount:1,grams:140,description:'RACC'}]};
const product={product_name:envelope.foodDescription,_usda_fdc_id:'1105073',_portion_evidence:envelope,serving_quantity:110,serving_size:'1 Banana, Peeled (110 g)',nutriments:{'energy-kcal_100g':85}};
test('valid exact atomic source evidence survives without a redundant read',async()=>{
 const [out]=await decorateCachedProducts([product],{rpc(){throw Error('redundant read forbidden');}});assert.equal(out,product);assert.equal(out._portion_evidence,envelope);assert.equal(out.serving_quantity,110);assert.equal(out.nutriments['energy-kcal_100g'],85);
});
test('mixed batch reads only missing evidence; misses cannot erase existing valid evidence',async()=>{
 let calls=0;const other={...product,_usda_fdc_id:'173944',product_name:'Bananas, raw',_portion_evidence:null};
 const out=await decorateCachedProducts([product,other],{rpc(name,args){calls++;assert.equal(name,'read_usda_portions_v1');assert.deepEqual(args.p_fdc_ids,['173944']);return {abortSignal:async()=>({data:[]})};}});
 assert.equal(calls,1);assert.equal(out[0],product);assert.equal(out[1]._portion_evidence,null);
});
test('timeout for a missing row does not erase another row atomic evidence',async()=>{
 const other={...product,_usda_fdc_id:'173944',_portion_evidence:null};const out=await decorateCachedProducts([product,other],{rpc:()=>({abortSignal:()=>new Promise(()=>{})})},1);assert.equal(out[0],product);assert.equal(out[0]._portion_evidence.portions[0].grams,110);
});
test('different FDC, food variant or malformed portions cannot claim retained authority',async()=>{
 for(const invalid of [{...envelope,fdcId:'173944'},{...envelope,foodDescription:'Bananas, raw'},{...envelope,retrievedAt:'2000-01-01T00:00:00Z'},{...envelope,retrievedAt:'2999-01-01T00:00:00Z'},{...envelope,portions:[{amount:1,grams:0,description:'Banana, Peeled'}]}]){
  let calls=0;const [out]=await decorateCachedProducts([{...product,_portion_evidence:invalid}],{rpc:()=>{calls++;return {abortSignal:async()=>({data:[]})};}});assert.equal(calls,1);assert.equal(out._portion_evidence,null);assert.equal(out.serving_quantity,100);
 }
});
test('confirmed serving corrections stay byte-identical without any provider-cache read',async()=>{
 const corrected={...product,_serving_authority:'confirmed_correction',serving_quantity:42};const [out]=await decorateCachedProducts([corrected],{rpc(){throw Error('correction cannot be enriched');}});assert.equal(out,corrected);assert.equal(out.serving_quantity,42);
});
test('actual atomic batch then optional decorator retains overripe110g source across reject/bad-response/timeout',async()=>{
 const id='11111111-1111-4111-8111-111111111111';
 const snapshot={...Object.fromEntries(SEARCH_SNAPSHOT_FIELDS.map(k=>[k,null])),id,name:envelope.foodDescription,source:'usda',usda_fdc_id:'1105073',calories:85,protein:.73,carbs:20.1,fat:.22,fiber:1.7,macros_per:'100g',serving_size:118,serving_unit:'g'};
 const [atomic]=await attachCatalogPortionSources([{_db_id:id}],{rpc(name){assert.equal(name,'read_catalog_portion_sources_v1');return {abortSignal:async()=>({data:[{id,snapshot,protected:false,food_revision:0,portion_source:{provider:'usda',source_id:'1105073',portion_evidence:envelope}}]})};}},r=>({_db_id:r.id,_usda_fdc_id:r.usda_fdc_id,product_name:r.name,nutriments:{'energy-kcal_100g':r.calories}}));
 assert.equal(atomic._portion_evidence.portions[0].grams,110);
 for(const reply of [()=>Promise.reject(Error('offline')),async()=>({data:'malformed'}),()=>new Promise(()=>{})]){
  let calls=0;const missing={...product,_usda_fdc_id:'173944',_portion_evidence:null};
  const out=await decorateCachedProducts([atomic,missing],{rpc(name,args){calls++;assert.deepEqual(args.p_fdc_ids,['173944']);return {abortSignal:reply};}},1);
  assert.equal(calls,1);assert.equal(out[0],atomic);assert.equal(out[0]._portion_evidence.portions[0].description,'Banana, Peeled');assert.equal(out[0]._portion_evidence.portions[0].grams,110);assert.equal(out[0].nutriments['energy-kcal_100g'],85);
 }
});
