import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {dbFixture,seed,lit,row as foodRow} from "../base-review/harness.mjs";
const CAND=new URL("../search",import.meta.url).pathname;
const ROOT=process.env.SEARCH_AUTHORITY_FUNCTIONS_ROOT||CAND+'/integration/supabase/functions';
const SQL=process.env.SEARCH_AUTHORITY_SQL_ROOT||CAND+'/sql';
const {hydrateSearchRows,SEARCH_SNAPSHOT_FIELDS,searchNutriments}=await import(path.join(ROOT,'_shared/searchHydration.mjs'));
const require=createRequire(import.meta.url);const {endpoint,compile}=require(CAND+'/tests/runtime.cjs');
const clientRoot=process.env.SEARCH_AUTHORITY_CLIENT_ROOT||new URL("../client",import.meta.url).pathname;
const client=compile(clientRoot+'/utils/openFoodFacts.ts',{'./catalogSelection':compile(clientRoot+'/utils/catalogSelection.ts'),'@/utils/stringUtils':compile(clientRoot+'/utils/stringUtils.ts')});
const uuid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const arr=ids=>`ARRAY[${ids.map(lit).join(',')}]::uuid[]`;
const snap=(overrides={})=>({...Object.fromEntries(SEARCH_SNAPSHOT_FIELDS.map(x=>[x,null])),id:uuid(1),name:'Banana, raw',product_name:'Banana, raw',source:'usda',usda_fdc_id:'123',calories:80,protein:0,carbs:20,fat:0,fiber:null,macros_per:'serving',serving_size:45,serving_unit:'g',serving_quantity:'45',serving_count:1,nutriments:{},...overrides});
const request=()=>new Request('https://local.invalid/search',{method:'POST',body:JSON.stringify({query:'banana'})});
const wire=s=>({id:s.id,snapshot:s,protected:true});
function admin(initial,snapshotRows,cache=[]){const calls=[];return {calls,rpc(name,args){calls.push({name,args});return {abortSignal(signal){calls.at(-1).signal=signal;return name==='search_food_catalog_v2'?Promise.resolve({data:initial}):name==='read_food_search_snapshots_v1'?(typeof snapshotRows==='function'?snapshotRows(signal):Promise.resolve({data:snapshotRows})):name==='read_usda_portions_v1'?Promise.resolve({data:cache}):Promise.reject(Error('UnexpectedRPC'));}};}};}
let db,id, originalDefinitions;
const definitions=async()=> (await db.query("SELECT proname,pg_get_functiondef(oid) body FROM pg_proc WHERE pronamespace='macrogoal_food_private'::regnamespace AND proname IN ('guard_food_nutrition_v1','audit_food_nutrition_v1','nutrition_snapshot_v1') ORDER BY proname")).rows;
before(async()=>{db=await dbFixture(new URL("../nutrition/sql/enrichment.CANDIDATE.sql",import.meta.url).pathname);originalDefinitions=await definitions();await db.exec(fs.readFileSync(SQL+'/search-snapshots.CANDIDATE.sql','utf8'));id=await seed(db,{verified:false,ai_verified:false,ai_verified_source:null,name:'Banana, raw',product_name:'Banana, raw',nutriments:{'iron_100g':0,user_id:'SECRET',nested:{private:'SECRET'}},off_data:{secret:'SECRET'}});await db.exec(`UPDATE macrogoal_food_private.nutrition_current SET confirmed=true WHERE food_id=${lit(id)}`);});
after(async()=>{await db.close()});
async function read(q,role='service_role'){await db.exec('SET ROLE '+role);try{return(await db.query(q)).rows;}finally{await db.exec('RESET ROLE')}}
const sqlRead=ids=>read(`SELECT * FROM public.read_food_search_snapshots_v1(${arr(ids)})`);

test('real baseline guard, audit and forceRLS survive additive install byte-for-byte',async()=>{
 assert.deepEqual(await definitions(), originalDefinitions);assert.equal(originalDefinitions.length,3);
 const r=(await db.query("SELECT c.relname,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='macrogoal_food_private' AND c.relkind='r'")).rows;assert.ok(r.length>=5);assert.ok(r.every(x=>x.relforcerowsecurity));
 await assert.rejects(()=>read(`UPDATE public.food_items SET calories=10 WHERE id=${lit(id)}`),e=>e.code==='P0001');
});
test('private confirmed alone binds exact current tuple; raw nested extras do not escape endpoint',async()=>{
 const actual=(await sqlRead([id]))[0];assert.equal(actual.protected,true);assert.equal(actual.snapshot.id,id);assert.equal(actual.snapshot.calories,89);assert.equal(actual.snapshot.verified,undefined);assert.equal(actual.snapshot.off_data,undefined);
 const a=admin([snap({id})],[actual]);const out=await(await endpoint(a).handleSearch(request())).json();assert.equal(out.status,'complete');assert.equal(out.products[0]._serving_authority,'confirmed_correction');assert.equal(JSON.stringify(out).includes('SECRET'),false);assert.equal(out.products[0].nutriments.iron_100g,0);
});
test('SQL exact IDs only, 100 duplicates allowed, 101 rejected, nondefault array lower bound accepted safely',async()=>{
 assert.equal((await sqlRead(Array(100).fill(id))).length,1);await assert.rejects(()=>sqlRead(Array(101).fill(id)),e=>e.code==='22023');
 const out=await read(`SELECT * FROM public.read_food_search_snapshots_v1(('[0:0]={${id}}')::uuid[])`);assert.equal(out[0].id,id);assert.equal((await sqlRead([uuid(98)])).length,0);
});
test('both SQL gates reject forged JWT claims and owner invocation without service active role',async()=>{
 await db.exec(`SET request.jwt.claims='{"role":"service_role"}'; GRANT USAGE ON SCHEMA macrogoal_food_private TO authenticated; GRANT EXECUTE ON FUNCTION public.read_food_search_snapshots_v1(uuid[]),macrogoal_food_private.read_search_snapshots_v1(uuid[]) TO authenticated;`);
 for(const role of ['authenticated','postgres'])for(const f of ['public.read_food_search_snapshots_v1','macrogoal_food_private.read_search_snapshots_v1'])await assert.rejects(()=>read(`SELECT * FROM ${f}(${arr([id])})`,role),e=>e.code==='42501');
 await db.exec('RESET request.jwt.claims');assert.equal((await sqlRead([id])).length,1);
});
for(const [label,change] of [
 ['negative macro',{protein:-1}],['blank macro',{calories:''}],['boolean macro',{fat:false}],['nonfinite macro',{carbs:Infinity}],['nonpositive serving',{serving_size:0}],['array nutrients',{nutriments:[]}],['unknown basis',{macros_per:'100ml'}],['absent field',{serving_unit:undefined}],
])test('malformed trusted snapshot '+label+' cannot change original tuple or trigger cached enrichment',async()=>{
 const original=snap();const changed=snap({calories:900,...change});if(label==='absent field')delete changed.serving_unit;
 const a=admin([original],[wire(changed)]);const out=await(await endpoint(a).handleSearch(request())).json();assert.equal(out.status,'partial');assert.equal(out.products.length,1);assert.equal(out.products[0]._serving_authority,undefined);assert.equal(out.products[0]._usda_fdc_id,undefined);assert.ok(Math.abs(out.products[0].nutriments['energy-kcal_100g']-80*100/45)<1e-9);assert.equal(a.calls.filter(x=>x.name==='read_usda_portions_v1').length,0);assert.strictEqual(client.normalizeUsdaProduct(out.products[0]),out.products[0]);
});
test('false authority is not upgraded by trusted snapshot extra markers',async()=>{
 const s=snap({_serving_authority:'confirmed_correction',verified:true,off_data:{private:'SECRET'}});const result=await hydrateSearchRows([s],admin([],[{...wire(s),protected:false}]));assert.equal(result[0].authority,'known');assert.equal(result[0].row.verified,undefined);assert.equal(result[0].row._serving_authority,undefined);
});
test('duplicate entries reject only corresponding identity; unrequested protected identity ignored',async()=>{
 const first=snap(),second=snap({id:uuid(2)});const out=await hydrateSearchRows([first,second],admin([],[wire(first),wire({...first,calories:999}),wire(second),wire(snap({id:uuid(99)}))]));assert.deepEqual(out.map(x=>x.authority),['unknown','confirmed_correction']);assert.equal(out[0].row.calories,80);
});
test('aborted batch and late noncooperative result cannot later mutate returned original tuple',async()=>{
 let resolve;const a=admin([],()=>new Promise(r=>resolve=r));const start=Date.now();const out=await hydrateSearchRows([snap()],a,undefined,5);assert.ok(Date.now()-start<200);assert.equal(out[0].authority,'unknown');resolve({data:[wire(snap({calories:900}))]});await new Promise(r=>setTimeout(r,5));assert.equal(out[0].row.calories,80);assert.ok(a.calls[0].signal.aborted);
});
test('protected per-serving tuple and count roundtrip actual client without FDC provider redecoration',async()=>{
 const s=snap({serving_count:3,serving_description:'pieces',serving_quantity:'999',nutriments:{fat_100g:99,iron_100g:0}});const a=admin([snap({calories:999})],[wire(s)],[{fdc_id:'123',payload:{}}]);const out=await(await endpoint(a).handleSearch(request())).json();const p=out.products[0];assert.equal(p.serving_size,'3 pieces (45 g)');assert.equal(p.serving_quantity,'45');assert.equal(client.extractServingSize(p).grams,15);assert.equal(client.extractNutritionPerServing(p,45).calories,80);assert.equal(p.nutriments.fat_100g,0);assert.equal(p.nutriments.iron_100g,0);assert.strictEqual(client.normalizeUsdaProduct(p),p);
});
test('numeric extras only; real zero kept and all private object/string payloads excluded',()=>{
 assert.deepEqual(searchNutriments({iron_100g:0,calcium_100g:'0',private_100g:'SECRET',nested_100g:{secret:1},negative_100g:-1,'bad!_100g':5,iron_serving:1,fiber_100g:null}),{iron_100g:0,calcium_100g:0});
});
