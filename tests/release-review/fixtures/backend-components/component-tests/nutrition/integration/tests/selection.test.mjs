import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSelectionCapture,readProviderJSON,scheduleCachedSelection} from '../supabase/functions/_shared/nutritionRefresh.mjs';
const requestId='00000000-0000-4000-8000-000000000001',foodId='00000000-0000-4000-8000-000000000002';
const raw={fdcId:123,description:'Banana, raw',dataType:'Foundation',foodNutrients:[{nutrient:{id:1162,unitName:'mg'},amount:10},{nutrient:{id:99999,unitName:'mg'},amount:42}]};
const selection={foodId,provider:'usda',sourceId:'123',request:new Request('https://example.test',{headers:{authorization:'Bearer fake-test-token'}})};
function mock({state={revision:7},claim={status:'claimed'},hangAuth=false,hangRead=false,hangWrite=false}={}){
 const calls=[];
 return {calls,admin:{auth:{getUser:async()=>{calls.push('auth');if(hangAuth)return new Promise(()=>{});return {data:{user:{id:'test-user'}}};}},rpc(name,args){calls.push({name,args});return {abortSignal:async signal=>{calls.push({signal});if(name==='read_food_nutrition_refresh_state_v1'){if(hangRead)return new Promise(()=>{});return {data:state};}if(name==='claim_food_nutrition_refresh_v1')return {data:claim};if(hangWrite)return new Promise(()=>{});return {data:{status:'evidence_only'}};}};}}};
}
const factory=(m,extra={})=>createSelectionCapture({admin:m.admin,enabled:true,networkEnabled:true,requestId:()=>requestId,...extra});
test('runtime defaults disabled, no auth/read/provider/RPC activity',async()=>{const m=mock();assert.equal((await createSelectionCapture({admin:m.admin})(selection)).status,'disabled');assert.equal(m.calls.length,0);});
test('existing complete raw USDA capture after state and claim; no second provider fetch',async()=>{
 const m=mock();const input={...selection,providerFood:structuredClone(raw)};const before=structuredClone(input.providerFood);let fetches=0;
 assert.equal((await factory(m,{fetchImpl:()=>{fetches++;throw Error();}})(input)).status,'evidence_only');assert.equal(fetches,0);assert.deepEqual(input.providerFood,before);
 const names=m.calls.filter(c=>c.name).map(c=>c.name);assert.deepEqual(names,['read_food_nutrition_refresh_state_v1','claim_food_nutrition_refresh_v1','refresh_food_nutrition_v1']);
 const write=m.calls.find(c=>c.name==='refresh_food_nutrition_v1');assert.equal(write.args.p_expected_revision,7);assert.equal(write.args.p_evidence.nutrients.length,2);assert.equal(write.args.p_evidence.canonical_candidates,undefined);
});
test('exact DB reuse fetches exact ID only after claim',async()=>{
 const m=mock();let url;const result=await factory(m,{fetchImpl:async(u,{signal})=>{url=u;assert.ok(signal instanceof AbortSignal);assert.ok(m.calls.some(c=>c.name==='claim_food_nutrition_refresh_v1'));return new Response(JSON.stringify(raw));}})(selection);
 assert.equal(result.status,'evidence_only');assert.match(url,/\/food\/123\?api_key=/);
});
test('fresh or busy server claim performs no provider fetch/write',async()=>{for(const status of ['fresh','busy']){const m=mock({claim:{status}});let count=0;assert.equal((await factory(m,{fetchImpl:()=>{count++;}})(selection)).status,status);assert.equal(count,0);assert.ok(!m.calls.some(c=>c.name==='refresh_food_nutrition_v1'));}});
test('authentication and read state hang bounded, response hook never throws',async()=>{
 for(const options of [{hangAuth:true},{hangRead:true}]){const m=mock(options);assert.equal((await factory(m,{timeoutMs:10})(selection)).status,'capture_unavailable');assert.ok(!m.calls.some(c=>c.name==='claim_food_nutrition_refresh_v1'));}
});
test('missing/invalid revision does not fabricate revision zero or fetch',async()=>{const m=mock({state:{}});assert.equal((await factory(m)(selection)).status,'state_unavailable');assert.ok(!m.calls.some(c=>c.name==='claim_food_nutrition_refresh_v1'));});
test('OFF full raw evidence retained but ambiguous basis never asserts per100g',async()=>{
 const m=mock();await factory(m)({...selection,provider:'openfoodfacts',sourceId:'12345678',providerFood:{code:'12345678',product_name:'Food',nutriments:{'vitamin-c_100g':.01,'vitamin-c_unit':'mg','new-micro_100g':4}}});
 const e=m.calls.find(c=>c.name==='refresh_food_nutrition_v1').args.p_evidence;assert.equal(e.nutrients.length,2);assert.equal(e.basis.kind,'provider_100');
});
test('identity mismatch never calls refresh RPC',async()=>{const m=mock();assert.equal((await factory(m)({...selection,providerFood:{...raw,fdcId:999}})).status,'invalid_provider_evidence');assert.ok(!m.calls.some(c=>c.name==='refresh_food_nutrition_v1'));});
test('copied provider module exactly matches tested canonical source',()=>{assert.equal(readFileSync(new URL('../supabase/functions/_shared/nutritionProvider.mjs',import.meta.url),'utf8'),readFileSync(new URL('../../src/provider.mjs',import.meta.url),'utf8'));});
test('baseline response expressions remain byte-identical at every existing return',()=>{
 const root=new URL("../../../../inputs/01-live-baseline/supabase/functions",import.meta.url).pathname;
 for(const file of ['lookup-barcode/index.ts','_shared/portionEndpoint.ts']){
  const baseline=readFileSync(`${root}/${file}`,'utf8'),candidate=readFileSync(new URL(`../supabase/functions/${file}`,import.meta.url),'utf8');
  const replies=s=>s.replaceAll('(nutrition.food_item??dbRow)','dbRow').replaceAll('nutrition.food_item??persisted.item','persisted.item').split('\n').filter(l=>/return (jsonResponse|reply)\(/.test(l));assert.deepEqual(replies(candidate),replies(baseline));
 }
});
test('search candidate changes only mapper and its import, no refresh/fetch fanout',()=>{
 const baseline=readFileSync(new URL("../../../../inputs/01-live-baseline/supabase/functions/search-foods/index.ts",import.meta.url).pathname,'utf8');
 const candidate=readFileSync(new URL('../supabase/functions/search-foods/index.ts',import.meta.url),'utf8');
 const strip=s=>s.replace("import {usdaSearchNutriments} from '../_shared/nutritionProvider.mjs';\n",'').replace(/export function mapUsdaToOff[\s\S]*?\n}\n/,'MAPPER\n');
 assert.equal(strip(candidate),strip(baseline));assert.ok(!candidate.includes('captureSelectedNutrition'));
});
test('actual search mapper keeps branded per100 values, exact units, missing is not zero',async()=>{
 const {stripTypeScriptTypes}=await import('node:module');const {usdaSearchNutriments}=await import('../supabase/functions/_shared/nutritionProvider.mjs');
 const text=readFileSync(new URL('../supabase/functions/search-foods/index.ts',import.meta.url),'utf8');
 const source=text.match(/export function mapUsdaToOff[\s\S]*?\n}\n/)[0].replace('export ','');
 const mapper=new Function('usdaSearchNutriments','scoreProduct',stripTypeScriptTypes(source)+';return mapUsdaToOff;')(usdaSearchNutriments,()=>0);
 const product=mapper({fdcId:123,description:'Branded food',dataType:'Branded',servingSize:25,servingSizeUnit:'g',foodNutrients:[{nutrientId:1008,unitName:'KCAL',value:100},{nutrientId:1093,unitName:'MG',value:500},{nutrientId:1003,unitName:'G',value:4}]});
 assert.equal(product.nutriments['energy-kcal_100g'],100);assert.equal(product.nutriments.sodium_100g,.5);assert.equal(product.nutriments.proteins_100g,4);assert.equal(product.nutriments.fat_100g,undefined);assert.equal(product.serving_quantity,'25');
});

test('provider JSON stream byte cap applies before parsing and ignores missing content-length',async()=>{
 await assert.rejects(readProviderJSON(new Response(' '.repeat(262145))),/provider_body_too_large/);
 await assert.rejects(readProviderJSON(new Response('{}',{headers:{'content-length':'262145'}})),/provider_body_too_large/);
 const response=new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(200000));c.enqueue(new Uint8Array(100000));c.close();}}));
 await assert.rejects(readProviderJSON(response),/provider_body_too_large/);
 assert.deepEqual(await readProviderJSON(new Response('{"safe":1}')),{safe:1});
});
test('all changed TypeScript overlay files parse without syntax errors',async()=>{
 const {stripTypeScriptTypes}=await import('node:module');for(const name of ['lookup-barcode/index.ts','search-foods/index.ts','_shared/portionEndpoint.ts'])assert.doesNotThrow(()=>stripTypeScriptTypes(readFileSync(new URL(`../supabase/functions/${name}`,import.meta.url),'utf8')));
});
test('streamed provider body that hangs is bounded by whole hook deadline',async()=>{
 const m=mock();const result=await factory(m,{timeoutMs:15,fetchImpl:async()=>new Response(new ReadableStream({start(){}}))})(selection);
 assert.equal(result.status,'provider_timeout');assert.ok(!m.calls.some(c=>c.name==='refresh_food_nutrition_v1'));
});

test('only applied barcode capture rereads exact canonical row within remaining deadline',async()=>{
 for(const status of ['applied','evidence_only','fresh']){
  const m=mock({claim:{status:status==='fresh'?'fresh':'claimed'}});const original=m.admin.rpc.bind(m.admin);let reads=0;
  m.admin.rpc=(name,args)=>name==='refresh_food_nutrition_v1'?{abortSignal:async()=>({data:{status}})}:original(name,args);
  m.admin.from=table=>{assert.equal(table,'food_items');return {select:columns=>{assert.equal(columns,'*');return {eq:(key,id)=>{assert.equal(key,'id');assert.equal(id,foodId);return {maybeSingle:()=>({abortSignal:async()=>{reads++;return {data:{id:foodId,vitamin_c_mg:10}};}})};}};}};};
  const result=await factory(m)({...selection,providerFood:raw,returnFoodItem:true});
  assert.equal(reads,status==='applied'?1:0);assert.equal(result.food_item?.vitamin_c_mg,status==='applied'?10:undefined);
 }
});
test('canonical reread failure or hang preserves applied status and original fallback',async()=>{
 for(const mode of ['error','hang']){
  const m=mock();const original=m.admin.rpc.bind(m.admin);m.admin.rpc=(name,args)=>name==='refresh_food_nutrition_v1'?{abortSignal:async()=>({data:{status:'applied'}})}:original(name,args);
  m.admin.from=()=>({select:()=>({eq:()=>({maybeSingle:()=>({abortSignal:()=>mode==='hang'?new Promise(()=>{}):Promise.reject(Error('read failed'))})})})});
  const result=await factory(m,{timeoutMs:15})({...selection,providerFood:raw,returnFoodItem:true});assert.equal(result.status,'applied');assert.equal(result.food_item,undefined);
 }
});

test('cached hit registers bounded task and returns before hung provider or RPC',async()=>{
 for(const stage of ['provider','rpc']){
  const m=mock({hangWrite:stage==='rpc'});const tracked=[];let fetches=0;
  const options={admin:m.admin,enabled:true,networkEnabled:true,requestId:()=>requestId,fetchImpl:async()=>{fetches++;return new Promise(()=>{});}};
  const started=Date.now();const result=await scheduleCachedSelection(options,{...selection,...(stage==='rpc'?{providerFood:raw}:{})},{backgroundTimeoutMs:35,waitUntil:task=>tracked.push(task)});
  assert.equal(result.status,'scheduled');assert.equal(tracked.length,1);assert.ok(Date.now()-started<30);
  const finished=await tracked[0];assert.equal(finished.status,stage==='rpc'?'rpc_write_uncertain':'provider_timeout');assert.equal(fetches,stage==='rpc'?0:1);
 }
});
test('absent or throwing scheduler uses actual short budget, never starts long orphan task',async()=>{
 for(const waitUntil of [undefined,()=>{throw Error('runtime unavailable');}]){
  const m=mock({hangAuth:true});const started=Date.now();const result=await scheduleCachedSelection({admin:m.admin,enabled:true,networkEnabled:true},selection,{waitUntil,backgroundTimeoutMs:8000,foregroundTimeoutMs:15});
  assert.equal(result.status,'capture_unavailable');assert.ok(Date.now()-started<150);assert.equal(m.calls.filter(x=>x==='auth').length,1);assert.ok(!m.calls.some(c=>c.name==='claim_food_nutrition_refresh_v1'));
 }
});
test('disabled cached scheduling creates no task or reads; background never rereads current response',async()=>{
 const m=mock();let registered=0;assert.equal((await scheduleCachedSelection({admin:m.admin},selection,{waitUntil:()=>registered++})).status,'disabled');assert.equal(registered,0);assert.equal(m.calls.length,0);
 const original=m.admin.rpc.bind(m.admin);m.admin.rpc=(name,args)=>name==='refresh_food_nutrition_v1'?{abortSignal:async()=>({data:{status:'applied'}})}:original(name,args);
 m.admin.from=()=>{throw Error('must not reread cached response');};let tracked;
 await scheduleCachedSelection({admin:m.admin,enabled:true,networkEnabled:true,requestId:()=>requestId},{...selection,providerFood:raw,returnFoodItem:true},{waitUntil:task=>{tracked=task;}});
 const result=await tracked;assert.equal(result.status,'applied');assert.equal(result.food_item,undefined);
});
