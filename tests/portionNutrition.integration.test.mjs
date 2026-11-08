import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=process.env.NUTRITION_CAPTURE_CANDIDATE_DIR?pathToFileURL(process.env.NUTRITION_CAPTURE_CANDIDATE_DIR.replace(/\\/g,'/')+'/'):new URL('../supabase/functions/_shared/',import.meta.url);
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require(process.env.BARCODE_RECOVERY_NODE_MODULES?process.env.BARCODE_RECOVERY_NODE_MODULES+'/typescript':'typescript');
let source=fs.readFileSync(new URL(process.env.NUTRITION_CAPTURE_CANDIDATE_DIR?'portionEndpoint.full-nutrition.ts':'portionEndpoint.ts',root),'utf8');
source=source.replace(/^import .*$/mg,'');
source=`const selectedSourceEnvelope=(provider,id,raw)=>({raw_payload:raw});const refreshCachedSelection=async()=>{};const readProviderJSON=async r=>r.json();const servicePortionCache=()=>({read:async()=>null,write:async()=>{}});const resolvePortionsWithin=async(id,deps)=>{await deps.cache.read(id,new AbortController().signal);await deps.fetchExactFood(id,new AbortController().signal);return {envelope:null,persisted:false};};\n`+source;
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {handlePortionRequest}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
globalThis.Deno={env:{get:()=>undefined}};
const food={fdcId:1,description:'Exact USDA food',dataType:'Foundation',foodNutrients:[{nutrient:{id:1008,unitName:'kcal'},amount:100},...[1003,1004,1005].map(id=>({nutrient:{id,unitName:'g'},amount:5}))]};
function admin(status){const calls=[];const db={select:()=>db,eq:()=>db,maybeSingle:()=>db,abortSignal:async()=>({data:{id:'food'}})};return {calls,auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from:()=>db,rpc:(name,args)=>{calls.push({name,args});return {abortSignal:async()=>({data:name.startsWith('claim')?{status,evidence:{raw_payload:food}}:{status:'captured'}})}}};}
const req=()=>new Request('https://example.invalid',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify({operation:'usda_portions_v1',fdc_id:'1'})});
test('existing live portion handler reuses fresh full source snapshot without USDA fetch',async()=>{
 globalThis.fetch=()=>{throw Error('must not fetch')};const a=admin('fresh');const r=await handlePortionRequest(req(),a,{});assert.equal(r.status,200);assert.equal(a.calls.filter(x=>x.name.startsWith('record')).length,0);
});
test('portion handler fetches once and persists same response using admission request ID',async()=>{
 let fetches=0;globalThis.fetch=async()=>{fetches++;return new Response(JSON.stringify(food))};const a=admin('claimed');const r=await handlePortionRequest(req(),a,{});assert.equal(r.status,200);assert.equal(fetches,1);const c=a.calls.find(x=>x.name.startsWith('claim')),s=a.calls.find(x=>x.name.startsWith('record'));assert.equal(c.args.p_request_id,s.args.p_request_id);assert.deepEqual(s.args.p_evidence.raw_payload,food);
});
