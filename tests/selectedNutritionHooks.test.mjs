import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=process.env.NUTRITION_CAPTURE_CANDIDATE_DIR?pathToFileURL(process.env.NUTRITION_CAPTURE_CANDIDATE_DIR.replace(/\\/g,'/')+'/'):new URL('../supabase/functions/_shared/',import.meta.url);
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require(process.env.BARCODE_RECOVERY_NODE_MODULES?process.env.BARCODE_RECOVERY_NODE_MODULES+'/typescript':'typescript');
let source=fs.readFileSync(new URL('selectedNutritionHooks.ts',root),'utf8');
source=source.replace("'./selectedNutrition.mjs'",JSON.stringify(new URL('selectedNutrition.mjs',root).href));
source=source.replace("import {handleSelectedNutrition} from './selectedNutritionEndpoint.ts';","const handleSelectedNutrition=async()=>({});");
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const hooks=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('runtime registers before work, absent runtime never detaches work',async()=>{
 delete globalThis.EdgeRuntime;let ran=false;assert.equal(hooks.scheduleNutritionCapture(async()=>{ran=true}),false);assert.equal(ran,false);
 let tracked;globalThis.EdgeRuntime={waitUntil:p=>{assert.equal(ran,false);tracked=p;}};
 assert.equal(hooks.scheduleNutritionCapture(async()=>{ran=true}),true);await tracked;assert.equal(ran,true);
});
test('already fetched OFF is stored without provider fetch or invented food link',async()=>{
 globalThis.fetch=()=>{throw Error('no provider fetch')};let args;
 const admin={rpc:(name,a)=>{assert.equal(name,'record_selected_nutrition_batch_v1');args=a;return Promise.resolve({data:{status:'captured'}})}};
 await hooks.recordFetchedNutrition(admin,new Request('https://example.invalid'),'openfoodfacts','123',{code:'123',nutriments:{calcium_100g:0}},null,'search_response');
 assert.equal(args.p_items[0].food_id,null);assert.equal(args.p_items[0].evidence.complete,false);assert.equal(args.p_items[0].evidence.raw_payload.nutriments.calcium_100g,0);
});
test('USDA already fetched response uses admission and record without refetch',async()=>{
 const names=[];globalThis.fetch=()=>{throw Error('no provider fetch')};
 const admin={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:(name,args)=>{names.push(name);return Promise.resolve({data:{status:name.startsWith('claim')?'claimed':'captured'}})}};
 await hooks.recordFetchedNutrition(admin,new Request('https://example.invalid',{headers:{authorization:'Bearer test'}}),'usda','1',{fdcId:1,foodNutrients:[]},null,'detail_response');
 assert.deepEqual(names,['claim_selected_nutrition_v1','record_selected_nutrition_v1']);
});
test('full live-v42 artifacts contain real scan and existing USDA fetch hooks',()=>{
 const lookup=fs.readFileSync(new URL(process.env.NUTRITION_CAPTURE_CANDIDATE_DIR?'lookup-barcode.full-nutrition.ts':'../lookup-barcode/index.ts',root),'utf8');
 const portion=fs.readFileSync(new URL(process.env.NUTRITION_CAPTURE_CANDIDATE_DIR?'portionEndpoint.full-nutrition.ts':'portionEndpoint.ts',root),'utf8');
 assert.match(lookup,/scheduleCachedNutrition\(supabase,req,String\(dbRow.id\)\)/);
 assert.match(lookup,/scheduleFetchedNutrition\(supabase,req,'openfoodfacts'/);
 assert.match(portion,/claim_selected_nutrition_v1/);assert.match(portion,/record_selected_nutrition_v1/);assert.match(portion,/let food:any=cachedRaw/);
});
