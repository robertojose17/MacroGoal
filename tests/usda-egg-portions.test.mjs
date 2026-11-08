import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require(process.env.BARCODE_RECOVERY_NODE_MODULES?process.env.BARCODE_RECOVERY_NODE_MODULES+'/typescript':'typescript');
const candidate=process.env.NUTRITION_CAPTURE_CANDIDATE_DIR;
const root=candidate?pathToFileURL(candidate+'/'):new URL('../supabase/functions/_shared/',import.meta.url);
let source=fs.readFileSync(new URL(candidate?'portionEndpoint.extended.ts':'portionEndpoint.ts',root),'utf8');
source=source.replace("import {refreshCachedSelection,readProviderJSON} from './nutritionRefresh.mjs';","const refreshCachedSelection=()=>{throw Error('UUID must not mutate food')};const readProviderJSON=async r=>r.json();").replace(/(['"])\.\/(selectedNutrition|portionCache)\.mjs\1/g,(_,q,name)=>JSON.stringify(new URL(name+(candidate&&name==='portionCache'?'.extended':'')+'.mjs',root).href));
const {handlePortionRequest}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
// Nutrition-independent portion excerpt from official FDC748967 fetched2026-11-08.
// https://api.nal.usda.gov/fdc/v1/food/748967 ; never substitute legacy50g for50.3g.
const food={fdcId:748967,description:'Eggs, Grade A, Large, egg whole',dataType:'Foundation',foodPortions:[{id:193781,amount:1,gramWeight:50.3,modifier:'whole without shell',measureUnit:{name:'egg'}},{id:312625,amount:1,gramWeight:50,measureUnit:{name:'RACC'}}]};
test('exact egg cache miss hydrates measured50.3g once and persists portion evidence without food edits',async()=>{
 const id='11111111-1111-4111-8111-111111111111',calls=[],originalFetch=globalThis.fetch,originalDeno=globalThis.Deno;let fetches=0,cache=null;
 const snapshot={id,name:food.description,source:'usda',usda_fdc_id:'748967',macros_per:'100g',serving_size:50,serving_unit:'g',calories:148};
 const admin={auth:{getUser:async()=>({data:{user:{id:'22222222-2222-4222-8222-222222222222'}}})},from(){throw Error('no food mutation');},rpc(name,args){calls.push(name);return {abortSignal:async()=>{
  if(name==='read_food_search_snapshots_v1')return {data:[{id,snapshot,protected:false}]};
  if(name==='read_usda_portions_v1')return {data:cache?[{fdc_id:'748967',payload:cache}]:[]};
  if(name==='claim_selected_nutrition_v1')return {data:{status:'claimed'}};
  if(name==='record_selected_nutrition_v1')return {data:{status:'captured'}};
  if(name==='record_usda_portions_v1'){cache=args.p_payload;return {data:{}};}
  throw Error('unexpected RPC '+name);
 }}}};
 try{
  globalThis.Deno={env:{get:()=>undefined}};globalThis.fetch=async url=>{assert.match(String(url),/\/food\/748967\?/);fetches++;await new Promise(r=>setTimeout(r,1650));return new Response(JSON.stringify(food));};
  const request=()=>new Request('https://fixture.invalid',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify({operation:'usda_portions_v1',food_item_id:id})});
  const first=await handlePortionRequest(request(),admin,{}),out=await first.json();assert.equal(first.status,200);assert.equal(out.binding_verified,true);assert.equal(out.portion_persisted,true);assert.equal(out.portion_evidence.portions[0].grams,50.3);assert.equal(out.portion_evidence.portions[0].description,'egg, whole without shell');assert.equal(out.portion_evidence.portions[1].grams,50);assert.equal(fetches,1);
  await handlePortionRequest(request(),admin,{});assert.equal(fetches,1);assert.equal(calls.filter(x=>x==='record_usda_portions_v1').length,1);
 }finally{globalThis.fetch=originalFetch;globalThis.Deno=originalDeno;}
});
test('UUID denied, busy, rate-limited or unavailable claim performs zero provider fetches',async()=>{
 const id='11111111-1111-4111-8111-111111111111',oldFetch=globalThis.fetch,oldDeno=globalThis.Deno;let fetches=0;
 try{
  globalThis.Deno={env:{get:()=>undefined}};globalThis.fetch=async()=>{fetches++;throw Error('forbidden');};
  for(const admission of [{data:{status:'busy'}},{data:{status:'rate_limited'}},{error:'unavailable'},{data:{status:'fresh',evidence:null}}]){
   const admin={auth:{getUser:async()=>({data:{user:{id:'synthetic'}}})},rpc(name){return {abortSignal:async()=>name==='read_food_search_snapshots_v1'?{data:[{id,protected:false,snapshot:{id,name:food.description,source:'usda',usda_fdc_id:'748967',macros_per:'100g'}}]}:name==='read_usda_portions_v1'?{data:[]}:admission}}};
   const out=await handlePortionRequest(new Request('https://fixture.invalid',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify({operation:'usda_portions_v1',food_item_id:id})}),admin,{});assert.equal((await out.json()).portion_evidence,null);
  }assert.equal(fetches,0);
 }finally{globalThis.fetch=oldFetch;globalThis.Deno=oldDeno;}
});
test('extended hard deadline is8s, legacy cap2s remains; noncooperative fetch aborted once',async()=>{
 const {resolvePortionsWithin}=await import(new URL(candidate?'portionCache.extended.mjs':'portionCache.mjs',root));
 const oldSet=globalThis.setTimeout,oldClear=globalThis.clearTimeout;
 try{
  for(const [extended,expected] of [[true,8000],[false,2000]]){
   let expire,fetches=0,writes=0,signal;
   globalThis.setTimeout=(callback,delay)=>{assert.equal(delay,expected);expire=callback;return 1;};globalThis.clearTimeout=()=>{};
   const pending=resolvePortionsWithin('748967',{cache:{read:async()=>null,write:async()=>{writes++;}},fetchExactFood:async(_,s)=>{fetches++;signal=s;return await new Promise(()=>{});},now:()=>new Date().toISOString()},99999,extended);
   for(let i=0;i<20&&!fetches;i++)await Promise.resolve();assert.equal(fetches,1);expire();const result=await pending;assert.equal(result.envelope,null);assert.equal(result.persisted,false);assert.equal(signal.aborted,true);assert.equal(writes,0);assert.equal(fetches,1);
  }
 }finally{globalThis.setTimeout=oldSet;globalThis.clearTimeout=oldClear;}
});
