import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs';
const root=process.env.NUTRITION_CAPTURE_CANDIDATE_DIR?pathToFileURL(process.env.NUTRITION_CAPTURE_CANDIDATE_DIR+'/'):new URL('../supabase/functions/_shared/',import.meta.url);
const {attachCatalogPortionSources:attach}=await import(new URL('catalogPortionBatch.mjs',root));
const {SEARCH_SNAPSHOT_FIELDS}=await import(new URL('searchHydration.mjs',root));
const id='11111111-1111-4111-8111-111111111111';
const row={...Object.fromEntries(SEARCH_SNAPSHOT_FIELDS.map(k=>[k,null])),id,source:'usda',usda_fdc_id:'1105073',name:'Bananas, overripe, raw',macros_per:'100g',serving_unit:'g',serving_size:100,calories:85,protein:.73,carbs:20.1,fat:.22};
const envelope={version:1,provider:'usda',fdcId:'1105073',foodDescription:row.name,retrievedAt:new Date().toISOString(),portions:[{amount:1,grams:110,description:'Banana, Peeled'}]};
const entry={id,snapshot:row,protected:false,food_revision:0,portion_source:{provider:'usda',source_id:'1105073',portion_evidence:envelope}};
const map=(r,p)=>({_db_id:r.id,_usda_fdc_id:r.usda_fdc_id,product_name:r.name,serving_quantity:r.serving_size,nutriments:{},...(p?{_serving_authority:'confirmed_correction'}:{})});
function delayed(rows,ms){let calls=0,signal;return {get calls(){return calls;},get signal(){return signal;},rpc(name,args){calls++;assert.equal(name,'read_catalog_portion_sources_v1');assert.deepEqual(args,{p_food_ids:[id]});return {abortSignal:s=>{signal=s;return new Promise(resolve=>setTimeout(()=>resolve({data:rows}),ms));}};}};}
test('350ms atomic read retains exact source within explicit800ms budget',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});const a=delayed([entry],350),pending=attach([{_db_id:id}],a,map,800);t.mock.timers.tick(350);const [out]=await pending;
 assert.equal(a.calls,1);assert.equal(out._portion_evidence.portions[0].grams,110);assert.equal(out._usda_fdc_id,'1105073');assert.equal(a.signal.aborted,true);
});
test('delayed current correction keeps its serving and never acquires source evidence',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});const a=delayed([{...entry,protected:true,snapshot:{...row,serving_size:42}}],350),pending=attach([{_db_id:id}],a,map,800);t.mock.timers.tick(350);const [out]=await pending;
 assert.equal(out.serving_quantity,42);assert.equal(out._serving_authority,'confirmed_correction');assert.equal(out._portion_evidence,undefined);assert.equal(a.calls,1);
});
test('actual handler reduces atomic allowance after slow provider stages, retaining final response margin',()=>{
 const path=process.env.NUTRITION_CAPTURE_CANDIDATE_DIR?'search-foods.practical-batch.ts':'../search-foods/index.ts';
 const code=fs.readFileSync(new URL(path,root),'utf8');
 const match=code.match(/Math\.min\(800,Math\.max\(1,4200-\(Date\.now\(\)-searchStarted\)\)\)/);assert.ok(match);
 assert.ok(code.indexOf('const searchStarted = Date.now();')<code.indexOf('const result = await searchCatalog'));
 const budget=Function('Date','searchStarted','return '+match[0]);
 for(const [elapsed,want] of [[0,800],[1800,800],[3400,800],[3800,400],[4100,100],[4200,1],[4500,1]])assert.equal(budget({now:()=>elapsed},0),want);
 assert.equal(3800+budget({now:()=>3800},0)+150,4350);
 assert.match(code,/Math\.min\(150, Math\.max\(0, deadlineMs - Date\.now\(\) - 25\)\)/);
});
test('noncooperative read hard-caps800ms and preserves original authority by reference',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});let signal,calls=0;const original={_db_id:id};
 const pending=attach([original],{rpc(){calls++;return {abortSignal:s=>{signal=s;return new Promise(()=>{});}}}},map,999999);
 let done=false;pending.then(()=>{done=true;});t.mock.timers.tick(799);await Promise.resolve();assert.equal(done,false);assert.equal(signal.aborted,false);
 t.mock.timers.tick(1);const [out]=await pending;assert.equal(out,original);assert.equal(signal.aborted,true);assert.equal(calls,1);
});
test('default scan budget remains300ms, failures do not promote unknown authority',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});const original={_db_id:id};let signal;
 const pending=attach([original],{rpc(){return {abortSignal:s=>{signal=s;return new Promise(()=>{});}}}},map);
 t.mock.timers.tick(300);assert.equal((await pending)[0],original);assert.equal(signal.aborted,true);
 const error=delayed([],0);t.mock.timers.reset();assert.equal((await attach([original],error,map,800))[0],original);
});
