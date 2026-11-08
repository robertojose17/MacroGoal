import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';

import {pathToFileURL} from 'node:url';
const root=process.env.NUTRITION_CAPTURE_CANDIDATE_DIR?pathToFileURL(process.env.NUTRITION_CAPTURE_CANDIDATE_DIR.replace(/\\/g,'/')+'/'):new URL('../supabase/functions/_shared/',import.meta.url);
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require(process.env.BARCODE_RECOVERY_NODE_MODULES?process.env.BARCODE_RECOVERY_NODE_MODULES+'/typescript':'typescript');
let source=fs.readFileSync(new URL('selectedNutritionEndpoint.ts',root),'utf8');
source=source.replace("'./selectedNutrition.mjs'",JSON.stringify(new URL('selectedNutrition.mjs',root).href));
source=source.replace("import {readProviderJSON,createSelectionCapture} from './nutritionRefresh.mjs';","const readProviderJSON=async r=>r.json();const createSelectionCapture=()=>async()=>({status:'disabled'});");
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {handleSelectedNutrition}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
globalThis.Deno={env:{get:()=>undefined}};
const requestId='12345678-1234-4234-8234-123456789012';
const request=(extra={})=>new Request('https://example.invalid',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify({operation:'capture_selected_nutrition_v1',request_id:requestId,provider:'usda',source_id:'1',...extra})});
test('explicit exact source stores raw evidence and returns correlated acknowledgment',async()=>{
 let stored;globalThis.fetch=async()=>new Response(JSON.stringify({fdcId:1,foodNutrients:[{nutrient:{id:1106,unitName:'UG'},amount:0}]}));
 const admin={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:(name,args)=>{if(name==='claim_selected_nutrition_v1')return {abortSignal:async()=>({data:{status:'claimed'}})};stored={name,args};return {abortSignal:async()=>({data:{status:'captured',snapshot_id:'snapshot',version:1}})}}};
 const result=await handleSelectedNutrition(request(),admin,{});const body=await result.json();
 assert.equal(body.status,'captured');assert.equal(body.request_id,requestId);assert.equal(body.food_item_id,null);assert.equal(body.canonical_applied,false);
 assert.equal(stored.args.p_evidence.raw_payload.foodNutrients[0].amount,0);assert.equal(stored.name,'record_selected_nutrition_v1');
});
test('client supplied nutrients rejected before provider fetch',async()=>{
 globalThis.fetch=()=>{throw Error('must not fetch')};const admin={auth:{getUser:async()=>({data:{user:{id:'owner'}}})}};
 assert.equal((await handleSelectedNutrition(request({nutrition:{calories:1}}),admin,{})).status,400);
});
test('provider variant mismatch never reaches persistence',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify({fdcId:2,foodNutrients:[]}));const admin={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:name=>{if(name==='claim_selected_nutrition_v1')return {abortSignal:async()=>({data:{status:'claimed'}})};throw Error('must not persist')}};
 const response=await handleSelectedNutrition(request(),admin,{});assert.equal(response.status,503);assert.equal((await response.json()).complete,false);
});
test('fresh durable snapshot prevents all provider calls',async()=>{
 globalThis.fetch=()=>{throw Error('must not fetch')};
 const admin={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:()=>({abortSignal:async()=>({data:{status:'fresh',snapshot_id:'existing',version:2}})})};
 const response=await handleSelectedNutrition(request(),admin,{});const body=await response.json();assert.equal(body.status,'duplicate');assert.equal(body.snapshot_id,'existing');
});
