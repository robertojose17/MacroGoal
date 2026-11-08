import test from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';import {pathToFileURL} from 'node:url';
const root=process.env.NUTRITION_CAPTURE_CANDIDATE_DIR||path.resolve('supabase/functions/_shared');
const {createSearchNutritionBatch,scheduleSearchNutritionBatch}=await import(pathToFileURL(path.join(root,'searchNutritionCapture.mjs')).href);
const food=(id=1)=>({fdcId:id,description:'Apple',foodNutrients:[{nutrientId:1003,nutrientName:'Protein',unitName:'G',value:0},{nutrientId:1162,nutrientName:'Vitamin C',unitName:'MG',value:6}]});
test('all received search sources keep nutrients, zero and summary provenance',()=>{const b=createSearchNutritionBatch();b.add('usda',[food(),food(2)]);b.add('usda',[food()]);const x=b.snapshot();assert.equal(x.items.length,2);assert.equal(x.items[0].evidence.capture_scope,'search_response');assert.equal(x.items[0].evidence.complete,false);assert.equal(x.items[0].evidence.raw_payload.foodNutrients[0].value,0);});
test('bad or oversized records are skipped explicitly; batch remains valid',()=>{const b=createSearchNutritionBatch({maxItems:1});b.add('usda',[{},food(),food(2)]);assert.equal(b.snapshot().items.length,1);assert.equal(b.snapshot().skipped,2);});
test('no background runtime means no untracked write and no success claim',()=>{let calls=0;const b=createSearchNutritionBatch();b.add('usda',[food()]);assert.equal(scheduleSearchNutritionBatch({rpc(){calls++;}},b).status,'unavailable');assert.equal(calls,0);});
test('registers promise before exactly one batch write, returns without waiting',async()=>{let tracked,registered=false,calls=0,finish;const b=createSearchNutritionBatch();b.add('usda',[food()]);const admin={rpc(name,args){assert(registered);assert.equal(name,'record_selected_nutrition_batch_v1');assert.equal(args.p_items.length,1);calls++;return {abortSignal(){return new Promise(r=>{finish=r;});}};}};const result=scheduleSearchNutritionBatch(admin,b,{waitUntil(p){registered=true;tracked=p;},requestId:()=> '00000000-0000-4000-8000-000000000001'});assert.equal(result.status,'scheduled');assert.equal(calls,1);finish({data:{status:'recorded',persisted:true},error:null});assert.equal((await tracked).status,'completed');});
test('failed writes finish without retry and never interrupt search response',async()=>{let tracked,calls=0;const b=createSearchNutritionBatch();b.add('usda',[food()]);const result=scheduleSearchNutritionBatch({rpc(){calls++;throw Error('offline');}},b,{waitUntil(p){tracked=p;}});assert.equal(result.status,'scheduled');assert.equal((await tracked).status,'unavailable');assert.equal(calls,1);});

test('OFF _id-only source retained',()=>{const b=createSearchNutritionBatch();b.add('openfoodfacts',[{_id:'1234567890123',product_name:'Food',nutriments:{sodium_100g:0}}]);assert.equal(b.snapshot().items.length,1);});

test('jsonb expansion oversize skips only offending source',()=>{
 const b=createSearchNutritionBatch();
 const raw={fdcId:3,foodNutrients:[],padding:'x'.repeat(262000),extra:[1e100,1e-100]};
 assert(Buffer.byteLength(JSON.stringify(raw))<262144);
 b.add('usda',[raw,food(4)]);assert.equal(b.snapshot().skipped,1);assert.equal(b.snapshot().items.length,1);
});
test('batch size includes PostgreSQL separators and never exceeds caller limit',()=>{
 const first=createSearchNutritionBatch();first.add('usda',[food()]);const size=first.snapshot().bytes;
 const tight=createSearchNutritionBatch({maxBytes:size-1});tight.add('usda',[food()]);assert.equal(tight.snapshot().skipped,1);
 const exact=createSearchNutritionBatch({maxBytes:size});exact.add('usda',[food()]);assert.equal(exact.snapshot().items.length,1);assert.equal(exact.snapshot().bytes,size);
});
