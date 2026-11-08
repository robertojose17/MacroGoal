'use strict';
// Audit only. Actual local source; external I/O is replaced by controlled doubles.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ts=require(process.env.TYPESCRIPT_MODULE || 'typescript');
const SOURCE=process.env.DEADLINE_SOURCE || path.resolve(__dirname,'..');
const OVERLAY=process.env.DEADLINE_OVERLAY;
const ALLOWLIST=new Set([
 'supabase/functions/_shared/searchNutritionCapture.mjs','supabase/functions/_shared/selectedNutrition.mjs',
 'supabase/functions/search-foods/index.ts','supabase/functions/search-foods/searchCore.ts',
 'supabase/functions/_shared/searchHydration.mjs','supabase/functions/_shared/portionCache.mjs',
 'supabase/functions/_shared/foodPortions.mjs','supabase/functions/_shared/nutritionProvider.mjs',
 'supabase/functions/_shared/offMass.mjs','supabase/functions/_shared/nutritionRefresh.mjs',
 'supabase/functions/_shared/portionEndpoint.ts','utils/foodSearchHybrid.ts','utils/foodSearchUtils.ts',
]);
const NEVER=()=>new Promise(()=>{});
const plain=x=>JSON.parse(JSON.stringify(x));
class Clock{
 time=0; sequence=0; timers=new Map();
 setTimeout=(fn,ms=0)=>{const id=++this.sequence;this.timers.set(id,{at:this.time+Math.max(0,ms),fn});return id;};
 clearTimeout=id=>this.timers.delete(id);
 delay=(ms,value)=>new Promise(resolve=>this.setTimeout(()=>resolve(value),ms));
 async flush(){for(let i=0;i<60;i++)await Promise.resolve();}
 async advance(to){assert.ok(to>=this.time);await this.flush();for(;;){const next=[...this.timers].filter(([,t])=>t.at<=to).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;this.time=next[1].at;this.timers.delete(next[0]);next[1].fn();await this.flush();}this.time=to;await this.flush();}
}
function fixture({admin={},fetcher=NEVER,cache=async()=>null,env={}}={}){
 const clock=new Clock(),modules=new Map(),calls=[],warnings=[];let served;
 class FakeDate extends Date{constructor(...args){super(...(args.length?args:[clock.time]));}static now(){return clock.time;}}
 const globals={console:{log(){},error(){},warn(...args){warnings.push(args);}},Date:FakeDate,setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout,AbortController,Request,Response,TextDecoder,TextEncoder,Uint8Array,crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000000'},Deno:{env:{get:key=>env[key]??'fixture'},serve:fn=>{served=fn;}},fetch:(...args)=>{calls.push({at:clock.time,args});return fetcher(...args);}};
 function load(relative){
  assert.ok(ALLOWLIST.has(relative),'Non-allowlisted runtime input: '+relative);
  if(modules.has(relative))return modules.get(relative);
  const disk=OVERLAY&&fs.existsSync(path.join(OVERLAY,relative))?path.join(OVERLAY,relative):path.join(SOURCE,relative);
  const source=fs.readFileSync(disk,'utf8');
  const js=ts.transpileModule(source,{fileName:relative.replace(/\.mjs$/,'.ts'),compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,allowJs:true,esModuleInterop:true}}).outputText;
  const module={exports:{}};modules.set(relative,module.exports);
  const mocks={
   'jsr:@supabase/functions-js/edge-runtime.d.ts':{},'jsr:@supabase/supabase-js@2':{createClient:()=>admin},
   './foodSearchCache':{getLocalCache:cache,setLocalCache:async()=>{}},
   '@/lib/supabase/client':{SUPABASE_PROJECT_URL:'https://fixture.invalid',supabasePublicKey:'fixture',supabase:admin},
   './searchSelectionSafety':{},'./catalogSelection':{exactFdcId:value=>/^\d+$/.test(String(value))?String(value):null},
   './servingParser':{},'@/utils/openFoodFacts':{},'@/utils/servingDisplay':{},
  };
  vm.runInNewContext(js,{...globals,exports:module.exports,module,require:id=>Object.hasOwn(mocks,id)?mocks[id]:load(path.posix.normalize(path.posix.join(path.posix.dirname(relative),id)))},{filename:relative});
  return module.exports;
 }
 return {clock,load,calls,warnings,get handler(){return served;}};
}
const UUID='0963bb3b-f75f-415e-ade5-49b7f5f16bdb';
const row={id:UUID,name:'Apples, raw',calories:52,protein:0.3,carbs:14,fat:0.2,fiber:2.4,macros_per:'100g',serving_size:182,serving_unit:'g'};
const request=signal=>new Request('https://fixture.invalid/search',{method:'POST',signal,body:JSON.stringify({query:'apple',limit:30,review_capability:'label_confirmation_v1'})});
function observe(promise){const s={settled:false};promise.then(value=>Object.assign(s,{settled:true,value}),error=>Object.assign(s,{settled:true,error}));return s;}

function edge({dbMs=0,rows=[{...row,usda_fdc_id:'123'}],snapshotMs=Infinity,protectedRow=null,fetcher}={}){
 let f;const rpc=[];
 const admin={rpc:name=>({abortSignal:signal=>{
  rpc.push({name,at:f.clock.time,signal});
  if(name==='search_food_catalog_v2')return f.clock.delay(dbMs,{data:rows,error:null});
  if(name==='read_food_search_snapshots_v1'){
   if(snapshotMs===Infinity)return NEVER();
   const fields=f.load('supabase/functions/_shared/searchHydration.mjs').SEARCH_SNAPSHOT_FIELDS;
   return f.clock.delay(snapshotMs,{data:rows.map(r=>({id:r.id,protected:!!protectedRow,snapshot:{...Object.fromEntries(fields.map(field=>[field,null])),...r,...protectedRow}})),error:null});
  }
  if(name==='read_usda_portions_v1')return Promise.resolve({data:[],error:null});
  throw Error('Unexpected RPC');
 }})};
 f=fixture({admin,fetcher:fetcher||(()=>{throw Error('No fallback expected for basic food');})});f.load('supabase/functions/search-foods/index.ts');return {...f,rpc,run:body=>f.handler(body?new Request('https://fixture.invalid/search',{method:'POST',body:JSON.stringify(body)}):request())};
}
for(const dbMs of [1700,1790,1799])test(`late ready catalog at ${dbMs} ms survives optional hydration without inventing authority`,async()=>{
 const f=edge({dbMs});const result=observe(f.run());await f.clock.advance(1800);
 assert.equal(result.settled,true);assert.equal(result.value.status,200);const body=await result.value.json();
 assert.equal(body.count,1);assert.equal(body.status,'partial');assert.equal(body.providers.db,'ok');assert.equal(body.products[0]._db_id,UUID);assert.equal(body.products[0].nutriments['energy-kcal_100g'],52);
 assert.equal(body.products[0]._usda_fdc_id,undefined);assert.equal(body.products[0]._serving_authority,undefined);assert.equal(body.products[0]._db_row,undefined);assert.equal(f.calls.length,0);assert.equal(f.clock.timers.size,0);
 const hydration=f.rpc.find(x=>x.name==='read_food_search_snapshots_v1');if(dbMs>=1775)assert.equal(hydration,undefined);else assert.equal(hydration.signal.aborted,true);
});

test('real protected snapshot within remaining budget retains exact corrected serving and macros',async()=>{
 const f=edge({dbMs:1700,snapshotMs:40,protectedRow:{macros_per:'serving',serving_size:20,serving_count:1,serving_description:'piece',calories:60,protein:1,carbs:10,fat:2,fiber:0}});
 const result=observe(f.run());await f.clock.advance(1740);assert.equal(result.settled,true);const body=await result.value.json();
 assert.equal(body.status,'complete');assert.equal(body.products[0]._serving_authority,'confirmed_correction');assert.equal(body.products[0].serving_quantity,'20');assert.equal(body.products[0].serving_size,'1 piece (20 g)');assert.equal(body.products[0].nutriments['energy-kcal_100g'],300);assert.equal(f.calls.length,0);
});

test('ordinary early DB keeps full 150 ms optional hydration cap',async()=>{
 const f=edge({dbMs:100});const result=observe(f.run());await f.clock.advance(249);assert.equal(result.settled,false);await f.clock.advance(250);assert.equal(result.settled,true);assert.equal((await result.value.json()).count,1);
});

test('zero optional budget returns unknown projection without starting RPC or timer',async()=>{
 const f=fixture();const hydrate=f.load('supabase/functions/_shared/searchHydration.mjs').hydrateSearchRows;let calls=0;
 const result=observe(hydrate([row],{rpc(){calls++;throw Error('No RPC expected');}},undefined,0));await f.clock.advance(0);assert.equal(result.settled,true);const out=result.value;
 assert.equal(out[0].authority,'unknown');assert.equal(out[0].row.calories,52);assert.equal(calls,0);assert.equal(f.clock.timers.size,0);
});

test('late snapshot cannot replace already-returned coherent nutrition or set authority',async()=>{
 const f=edge({dbMs:1700,snapshotMs:140,protectedRow:{calories:999}});const result=observe(f.run());await f.clock.advance(1775);assert.equal(result.settled,true);const body=await result.value.json();assert.equal(body.products[0].nutriments['energy-kcal_100g'],52);
 await f.clock.advance(1840);assert.equal(body.products[0].nutriments['energy-kcal_100g'],52);assert.equal(body.products[0]._serving_authority,undefined);assert.equal(f.calls.length,0);
});

test('late visible unsafe unit remains review-only and V3 capability remains required',async()=>{
 for(const supportsReview of [true,false]){
  const f=edge({dbMs:1799,rows:[{...row,macros_per:'serving',serving_unit:'ml',serving_size:250}]});
  const result=observe(f.run({query:'apple',...(supportsReview?{review_capability:'label_confirmation_v1'}:{})}));await f.clock.advance(1800);const body=await result.value.json();
  if(supportsReview){assert.equal(result.value.status,200);assert.equal(body.count,1);assert.equal(body.products[0].requires_label_confirmation,true);assert.equal(body.products[0].nutrition_issue,'volume_basis_requires_confirmation');assert.equal(body.products[0].nutriments,undefined);assert.equal(body.products[0].serving_quantity,undefined);}
  else{assert.equal(result.value.status,409);assert.equal(body.status,'update_required');assert.equal(body.count,0);}
  assert.equal(f.calls.length,0);
 }
});

test('DB late composite does not suppress or shorten full USDA search fallback',async()=>{
 let clock;const usda={fdcId:999,description:'Apples, raw',dataType:'Foundation',foodNutrients:[{nutrientId:1008,unitName:'kcal',value:52},{nutrientId:1003,unitName:'g',value:0.3},{nutrientId:1004,unitName:'g',value:0.2},{nutrientId:1005,unitName:'g',value:14}]};
 const f=edge({dbMs:1799,rows:[{...row,name:'Apple pie',brand:'Fixture Brand'}],fetcher:async()=>({ok:true,json:()=>clock.delay(1399,{foods:[usda]})})});clock=f.clock;
 const result=observe(f.run());await f.clock.advance(3198);assert.equal(result.settled,true);const body=await result.value.json();assert.equal(body.count,2);assert.equal(body.products[0]._usda_fdc_id,'999');assert.equal(body.products[1]._db_id,UUID);assert.equal(body.providers.usda,'ok');assert.equal(f.calls[0].at,1799);assert.equal(f.calls.length,1);
});

test('all original provider budgets and sequential OFF coverage remain unchanged',async()=>{
 const f=fixture(),core=f.load('supabase/functions/search-foods/searchCore.ts'),stages=[];
 const providers=Object.fromEntries(['db','usda','off'].map(name=>[name,(q,signal,deadlineMs)=>{stages.push({name,at:f.clock.time,deadlineMs,signal});return NEVER();}]));
 const result=observe(core.searchCatalog('apple',30,providers));await f.clock.advance(3799);assert.equal(result.settled,false);await f.clock.advance(3800);assert.equal(result.value.count,0);
 assert.deepEqual(stages.map(x=>[x.name,x.at,x.deadlineMs]),[['db',0,1800],['usda',1800,3200],['off',3200,3800]]);assert.ok(stages.every(x=>x.signal.aborted));
});
