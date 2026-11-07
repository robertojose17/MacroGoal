import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixture,lit,uuid} from './fixture.mjs';
import {product,gtin} from './products.mjs';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../../../supabase/functions/',import.meta.url));
process.env.SEARCH_AUTHORITY_FUNCTIONS_ROOT=root;
const {compile,endpoint}=require('./runtime.cjs');
let db,activeId;const calls={provider:0,model:0,rpc:[]};
const oldDeno=globalThis.Deno;globalThis.Deno={env:{get:()=>''}};
before(async()=>{db=await fixture()});after(async()=>{await db?.close();globalThis.Deno=oldDeno});
async function role(sql){await db.exec('SET ROLE service_role');try{return await db.query(sql)}finally{await db.exec('RESET ROLE')}}
const admin={auth:{getUser:async()=>({data:{user:{id:'synthetic-owner'}}})},from(table){assert.equal(table,'food_items');let codes=[];return {select(){return this},in(_key,values){codes=values;return this},async limit(n){return {data:(await role(`SELECT * FROM public.food_items WHERE barcode IN (${codes.map(lit).join(',')}) LIMIT ${Number(n)}`)).rows,error:null}}}},rpc(name,args){calls.rpc.push(name);return{async abortSignal(){
 if(name==='search_food_catalog_v2')return {data:(await role(`SELECT * FROM public.food_items WHERE id=${lit(activeId)}`)).rows,error:null};
 if(name==='read_food_search_snapshots_v1')return {data:(await role(`SELECT * FROM public.read_food_search_snapshots_v1(ARRAY[${args.p_food_ids.map(lit).join(',')}]::uuid[])`)).rows,error:null};
 if(name==='read_usda_portions_v1')return {data:[],error:null};
 if(name==='create_off_mass_food_v1')return {data:(await role(`SELECT public.create_off_mass_food_v1(${lit(args.p_request_id)},${lit(args.p_expected_code)},${lit(args.p_evidence)}) result`)).rows[0].result,error:null};
 throw Error('Unexpected actual RPC '+name);
 }}}};
function lookup(enabled){let handler;compile(path.join(root,'lookup-barcode/index.ts'),{'jsr:@supabase/functions-js/edge-runtime.d.ts':{},'jsr:@supabase/supabase-js@2':{createClient:()=>admin}},{Deno:{env:{get:k=>k==='OFF_MASS_CAPTURE_ENABLED'?(enabled?'true':'false'):'fixture'},serve:f=>handler=f},fetch:async url=>{if(String(url).includes('openrouter')){calls.model++;throw Error('Model prohibited')}calls.provider++;return Response.json({status:1,product:product(700)})}});return handler;}
const request=(body)=>new Request('https://synthetic.invalid',{method:'POST',headers:{authorization:'Bearer synthetic'},body:JSON.stringify(body)});
test('final actual lookup writes one proven food through actual assembled SQL RPC then actual search hydrates same row',async()=>{
 const handler=lookup(true),res=await handler(request({barcode:gtin(700),review_capability:'label_confirmation_v1'})),body=await res.json();
 assert.equal(res.status,200);assert.equal(body.persisted,true);activeId=body.item.id;assert.ok(activeId);assert.equal(body.item.calories,400);assert.equal(body.item.serving_size,40);assert.equal(calls.provider,1);assert.equal(calls.model,0);
 assert.equal((await db.query(`SELECT count(*)::int n FROM macrogoal_food_private.nutrition_evidence WHERE food_id=${lit(activeId)}`)).rows[0].n,1);
 const before=(await db.query(`SELECT to_jsonb(f) j FROM public.food_items f WHERE id=${lit(activeId)}`)).rows[0].j;
 const search=endpoint(admin,async()=>{throw Error('Search must not fetch provider for exact branded canonical match')});
 const sr=await search.handleSearch(request({query:'Synthetic oats',review_capability:'label_confirmation_v1'})),out=await sr.json();assert.equal(sr.status,200);assert.equal(out.count,1);assert.equal(out.products[0]._db_id,activeId);assert.equal(out.products[0].nutriments['energy-kcal_100g'],400);
 assert.deepEqual((await db.query(`SELECT to_jsonb(f) j FROM public.food_items f WHERE id=${lit(activeId)}`)).rows[0].j,before);
});
test('same final actual lookup cached path reads exact stored row without another provider or write',async()=>{const before=calls.provider;const res=await lookup(false)(request({barcode:gtin(700)})),body=await res.json();assert.equal(res.status,200);assert.equal(body.item.id,activeId);assert.equal(calls.provider,before);assert.equal(calls.model,0);assert.equal((await db.query(`SELECT count(*)::int n FROM macrogoal_food_private.nutrition_evidence WHERE food_id=${lit(activeId)}`)).rows[0].n,1);});
test('full SQL stack private-only confirmed serving preserved by assembled search without altering history',async()=>{activeId=uuid(991);await db.exec(`INSERT INTO public.food_items(id,name,source,usda_fdc_id,macros_per,serving_size,serving_quantity,serving_unit,serving_description,serving_count,calories,protein,carbs,fat,fiber) VALUES(${lit(activeId)},'Banana, raw','user','123','serving',20,'20','g','piece',1,60,1,10,2,0);UPDATE macrogoal_food_private.nutrition_current SET confirmed=true WHERE food_id=${lit(activeId)};INSERT INTO public.synthetic_diary VALUES(991,${lit(activeId)},(SELECT to_jsonb(f) FROM public.food_items f WHERE id=${lit(activeId)}));`);const before=(await db.query('SELECT snapshot FROM public.synthetic_diary WHERE id=991')).rows[0].snapshot;const out=await (await endpoint(admin,async()=>{throw Error('No provider fallback')}).handleSearch(request({query:'banana',review_capability:'label_confirmation_v1'}))).json();assert.equal(out.products[0].serving_quantity,'20');assert.equal(out.products[0]._serving_authority,'confirmed_correction');assert.equal(out.products[0].nutriments['energy-kcal_100g'],300);assert.deepEqual((await db.query('SELECT snapshot FROM public.synthetic_diary WHERE id=991')).rows[0].snapshot,before);});
test('full SQL stack volume row remains named review-only for V5; missing capability receives no selectable product',async()=>{activeId=uuid(992);await db.exec(`INSERT INTO public.food_items(id,name,source,macros_per,serving_size,serving_quantity,serving_unit,calories,protein,carbs,fat) VALUES(${lit(activeId)},'Banana drink','user','serving',250,'250','ml',100,1,20,2);UPDATE macrogoal_food_private.nutrition_current SET confirmed=true WHERE food_id=${lit(activeId)};`);const handler=endpoint(admin,async()=>{throw Error('No provider fallback')}).handleSearch;let res=await handler(request({query:'banana',review_capability:'label_confirmation_v1'})),out=await res.json();assert.equal(res.status,200);assert.equal(out.products[0].product_name,'Banana drink');assert.equal(out.products[0].requires_label_confirmation,true);assert.equal(out.products[0].nutrition_issue,'volume_basis_requires_confirmation');assert.equal(out.products[0].nutriments,undefined);res=await handler(request({query:'banana'}));out=await res.json();assert.equal(res.status,409);assert.deepEqual(out.products,[]);assert.equal(out.error,'SEARCH_REVIEW_UPDATE_REQUIRED');});
