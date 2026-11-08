import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const root=process.env.MACROGOAL_FUNCTIONS_ROOT?pathToFileURL(process.env.MACROGOAL_FUNCTIONS_ROOT.replace(/\/$/,'')+'/'):new URL('../integration/supabase/functions/',import.meta.url);
const {handlePortionRequest}=await import(new URL('_shared/portionEndpoint.ts',root));
const {captureUsdaPortions}=await import(new URL('_shared/foodPortions.mjs',root));
const food=()=>({fdcId:123,description:'Synthetic oats, raw',dataType:'Foundation',foodPortions:[{id:456,amount:1,gramWeight:40,modifier:'portion'}],foodNutrients:[[1008,'kcal',400],[1003,'g',10],[1004,'g',10],[1005,'g',60],[1162,'mg',4],[9999,'IU',7]].map(([id,unitName,amount])=>({nutrient:{id,unitName},amount}))});
const id='11111111-1111-4111-8111-111111111111';
const request=()=>new Request('https://fixture.invalid/lookup',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify({operation:'usda_portions_v1',fdc_id:'123'})});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function fixture({gateStage='state',cached=false,existing=cached,providerFailure=false,enabled=true,scheduler='tracked'}={}){
 const old={fetch:globalThis.fetch,Deno:globalThis.Deno,EdgeRuntime:globalThis.EdgeRuntime};
 const calls={auth:0,provider:0,insert:0,rpc:[],order:[],tracked:[],signals:[]};let catalog=existing?{id,usda_fdc_id:'123'}:null;
 let cache=cached?captureUsdaPortions(food(),'123',new Date().toISOString()):null,release;
 const gate=new Promise(r=>{release=r});let released=false;
 const admin={auth:{getUser:async()=>{calls.auth++;return {data:{user:{id:'synthetic-user'}}}}},
 rpc(name,args){return {abortSignal:async signal=>{
  calls.rpc.push({name,args});
  if(name==='read_usda_portions_v1')return {data:cache?[{fdc_id:'123',payload:cache}]:[]};
  if(name==='record_usda_portions_v1'){cache=structuredClone(args.p_payload);return {data:null};}
  if(name==='claim_selected_nutrition_v1')return {data:{status:'unavailable'}}; // Isolate legacy enrichment; new capture has dedicated tests.
  const stage=name==='read_food_nutrition_refresh_state_v1'?'state':name==='claim_food_nutrition_refresh_v1'?'claim':'write';
  calls.order.push(stage);calls.signals.push(signal);
  if(stage===gateStage)await gate;
  if(name==='read_food_nutrition_refresh_state_v1')return {data:{revision:1,source_id:'123'}};
  if(name==='claim_food_nutrition_refresh_v1')return {data:{status:'claimed'}};
  if(name==='refresh_food_nutrition_v1')return {data:{status:'evidence_only'}};
  throw Error('unexpected RPC '+name);
 }}},
 from(table){assert.equal(table,'food_items');let payload;const q={select(){return q},eq(k,v){assert.equal(k,'usda_fdc_id');assert.equal(v,'123');return q},maybeSingle(){return q},single(){return q},insert(p){payload=p;return q},abortSignal:async()=>{if(payload){calls.insert++;catalog={...payload,id};}return {data:catalog,error:null}}};return q;}
 };
 globalThis.Deno={env:{get:k=>['NUTRIENT_REFRESH_ENABLED','NUTRIENT_REFRESH_NETWORK_ENABLED'].includes(k)?(enabled?'true':'false'):'synthetic-key'}};
 globalThis.fetch=async url=>{calls.provider++;assert.equal(new URL(url).pathname,'/fdc/v1/food/123');if(providerFailure)throw Error('synthetic provider failure');return Response.json(food())};
 globalThis.EdgeRuntime=scheduler==='absent'?undefined:{waitUntil(p){calls.order.push('waitUntil');calls.tracked.push(p);if(scheduler==='throws')throw Error('synthetic scheduler unavailable')}};
 return {admin,calls,release(){released=true;release()},async close(){if(!released)release();await Promise.all(calls.tracked);await pause(5);globalThis.fetch=old.fetch;globalThis.Deno=old.Deno;globalThis.EdgeRuntime=old.EdgeRuntime}};
}
async function promptly(p){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('portion response waited for optional enrichment')),900)})])}finally{clearTimeout(timer)}}
for(const gateStage of ['state','write'])test('actual portion handler responds while tracked '+gateStage+' remains pending',async()=>{
 const f=fixture({gateStage});try{
  const response=await promptly(handlePortionRequest(request(),f.admin,{})),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.food_item_id,id);assert.equal(body.portion_persisted,true);assert.equal(body.portion_evidence.portions[0].grams,40);
  assert.equal(f.calls.auth,1);assert.equal(f.calls.provider,1);assert.equal(f.calls.insert,1);assert.equal(f.calls.tracked.length,1);assert.equal(f.calls.order[0],'waitUntil');
  let finished=false;void f.calls.tracked[0].then(()=>{finished=true});await pause(10);assert.equal(finished,false);
  f.release();await f.calls.tracked[0];assert.equal(f.calls.provider,1);assert.equal(f.calls.auth,1);
  const write=f.calls.rpc.filter(c=>c.name==='refresh_food_nutrition_v1');assert.equal(write.length,1);assert.equal(write[0].args.p_food_id,id);assert.equal(write[0].args.p_evidence.source_id,'123');assert.ok(write[0].args.p_evidence.nutrients.some(n=>n.provider_key==='9999'&&n.amount===7));
 }finally{await f.close()}
});
for(const scheduler of ['absent','throws'])test('actual portion handler '+scheduler+' scheduler uses one bounded foreground attempt',async()=>{
 const f=fixture({scheduler,gateStage:'state'});try{const begin=performance.now(),response=await promptly(handlePortionRequest(request(),f.admin,{})),elapsed=performance.now()-begin;assert.equal((await response.json()).food_item_id,id);assert.ok(elapsed<700);assert.ok(elapsed>=100);assert.equal(f.calls.order.filter(v=>v==='state').length,1);assert.equal(f.calls.provider,1);assert.equal(f.calls.auth,1);assert.equal(f.calls.signals.length,1);assert.equal(f.calls.signals[0].aborted,true);assert.equal(f.calls.order.includes('claim'),false);if(scheduler==='throws')assert.equal((await f.calls.tracked[0]).status,'scheduling_unavailable');else assert.equal(f.calls.tracked.length,0);f.release();await pause(20);assert.equal(f.calls.order.includes('claim'),false);assert.equal(f.calls.order.includes('write'),false);assert.equal(f.calls.provider,1)}finally{await f.close()}
});
test('actual failed provider attempt never schedules enrichment or retries a provider',async()=>{const f=fixture({providerFailure:true,existing:true});try{const r=await promptly(handlePortionRequest(request(),f.admin,{})),body=await r.json();assert.equal(body.food_item_id,id);assert.equal(body.portion_evidence,null);assert.equal(f.calls.provider,1);assert.equal(f.calls.auth,1);assert.equal(f.calls.tracked.length,0);assert.equal(f.calls.rpc.some(c=>c.name==='read_food_nutrition_refresh_state_v1'),false)}finally{await f.close()}});
test('actual cached portion hit permits only one eligible background nutrient fetch',async()=>{const f=fixture({cached:true});try{const response=await promptly(handlePortionRequest(request(),f.admin,{}));assert.equal((await response.json()).food_item_id,id);assert.equal(f.calls.provider,0);assert.equal(f.calls.insert,0);assert.equal(f.calls.tracked.length,1);f.release();await f.calls.tracked[0];assert.equal(f.calls.provider,1);assert.equal(f.calls.auth,1);assert.equal(f.calls.rpc.filter(c=>c.name==='refresh_food_nutrition_v1').length,1)}finally{await f.close()}});
test('actual disabled nutrition flags do not register or start background work',async()=>{const f=fixture({enabled:false});try{const response=await promptly(handlePortionRequest(request(),f.admin,{}));assert.equal((await response.json()).food_item_id,id);assert.equal(f.calls.tracked.length,0);assert.equal(f.calls.rpc.some(c=>c.name==='read_food_nutrition_refresh_state_v1'),false);assert.equal(f.calls.provider,1);assert.equal(f.calls.auth,1)}finally{await f.close()}});
