import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {snapshot,row,uuid,adminFor,envelope,root} from './fixtures.mjs';
const require=createRequire(import.meta.url); const {endpoint,compile}=require('./runtime.cjs');
const clientRoot=process.env.SEARCH_AUTHORITY_CLIENT_ROOT || new URL("../../client",import.meta.url).pathname;
const client=compile(path.join(clientRoot,'utils/openFoodFacts.ts'), {
 './catalogSelection':compile(path.join(clientRoot,'utils/catalogSelection.ts')),
 '@/utils/stringUtils':compile(path.join(clientRoot,'utils/stringUtils.ts')),
});
const request=(extra={})=>new Request('https://local.invalid/search-foods',{method:'POST',body:JSON.stringify({query:'banana',...extra})});
const cached=[{fdc_id:'123',payload:envelope}];

test('actual endpoint + actual V2 client preserve corrected 45g/80kcal, three pieces and true zero',async()=>{
 const old=snapshot({calories:900,serving_size:100});
 const corrected=snapshot({macros_per:'serving',calories:80,protein:0,carbs:20,fat:0,fiber:0,serving_size:45,serving_quantity:'999',serving_description:'pieces',serving_count:3,nutriments:{'proteins_100g':99,'fat_serving':9,'iron_100g':0}});
 const admin=adminFor([old],[row(corrected,true)],cached);
 const response=await endpoint(admin).handleSearch(request()); assert.equal(response.status,200);
 const body=await response.json(), p=body.products[0];
 assert.equal(body.status,'complete'); assert.equal(body.count,1); assert.equal(p._serving_authority,'confirmed_correction');
 assert.equal(p.serving_quantity,'45'); assert.equal(p.serving_size,'3 pieces (45 g)');
 assert.ok(Math.abs(p.nutriments['energy-kcal_100g']-80*100/45)<1e-12);
 for(const k of ['proteins_100g','fat_100g','fiber_100g','iron_100g'])assert.equal(p.nutriments[k],0);
 assert.equal(p.nutriments.fat_serving,undefined);
 assert.strictEqual(client.normalizeUsdaProduct(p),p);
 const serving=client.extractServingSize(p); assert.equal(serving.grams,15);
 assert.equal(client.extractNutritionPerServing(p,45).calories,80);
 assert.equal(client.extractNutritionPerServing(p,serving.grams).calories,27);
 assert.equal(p._usda_fdc_id,'123'); assert.equal(p._db_id,old.id);
 assert.deepEqual(body.providers,{db:'ok',usda:'skipped',off:'skipped'});
});

test('per100g protected macros stay per100g, null optional nutrient not fabricated',async()=>{
 const current=snapshot({serving_size:45,serving_description:'slice',fiber:null,nutriments:{'fiber_100g':null,'sodium_100g':0}});
 const body=await (await endpoint(adminFor([current],[row(current,true)],cached)).handleSearch(request())).json();
 assert.equal(body.products[0].nutriments['energy-kcal_100g'],89);
 assert.equal(body.products[0].nutriments['fiber_100g'],undefined);assert.equal(body.products[0].nutriments['sodium_100g'],0);
 assert.equal(body.products[0].serving_size,'1 slice (45 g)');
});

test('unprotected row retains exact USDA cache portion behavior',async()=>{
 const current=snapshot(); const body=await (await endpoint(adminFor([current],[row(current)],cached)).handleSearch(request())).json();
 const p=body.products[0]; assert.equal(p._serving_authority,undefined);assert.equal(p.serving_quantity,118);assert.equal(p._portion_evidence.fdcId,'123');
 assert.equal(client.normalizeUsdaProduct(p).serving_quantity,118);
});

for(const [name,hydration] of [['missing',[]],['duplicate',[row(snapshot()),row(snapshot(),true)]],['failure',()=>Promise.reject(new Error('secret'))],['timeout',()=>new Promise(()=>{})]]) {
 test('unknown '+name+' retains useful coherent projection, no providers/portion fetch/client enrichment/cache',async()=>{
  const old=snapshot({calories:80,macros_per:'serving',serving_size:45,serving_quantity:'45'});
  const admin=adminFor([old],hydration,cached); const start=Date.now();
  const body=await (await endpoint(admin).handleSearch(request())).json(); const p=body.products[0];
  assert.equal(body.status,'partial'); assert.equal(body.count,1); assert.ok(Date.now()-start<900);
  assert.deepEqual(admin.calls.map(c=>c.name),['search_food_catalog_v2','read_food_search_snapshots_v1','read_catalog_portion_sources_v1']);
  assert.deepEqual(admin.calls.at(-1).args,{p_food_ids:[old.id]});
  assert.equal(p.serving_quantity,'45');assert.equal(p.serving_size,'45 g');assert.equal(p._db_id,old.id);
  assert.equal(p._usda_fdc_id,undefined);assert.equal(p._serving_authority,undefined);assert.equal(p._portion_evidence,undefined);
  assert.strictEqual(client.normalizeUsdaProduct(p),p); assert.equal(client.extractNutritionPerServing(p,45).calories,80);
 });
}

test('mixed known/unknown results retain order, decorate only eligible FDC IDs and leak no row/verification data',async()=>{
 const first=snapshot({id:uuid(1),usda_fdc_id:'111'}),second=snapshot({id:uuid(2),usda_fdc_id:'123',calories:90}),third=snapshot({id:uuid(3),usda_fdc_id:'333',calories:91});
 const admin=adminFor([first,second,third],[row(second),row(third,true)],cached);
 const body=await (await endpoint(admin).handleSearch(request({products:[{_serving_authority:'confirmed_correction'}],protected:true}))).json();
 assert.deepEqual(body.products.map(p=>p._db_id),[first.id,second.id,third.id]);
 assert.deepEqual(admin.calls.find(c=>c.name==='read_usda_portions_v1').args,{p_fdc_ids:['123','333']});
 for(const p of body.products)for(const key of ['_db_row','snapshot','protected','verified','ai_verified','ai_verified_source','user_id'])assert.equal(p[key],undefined);
 assert.equal(body.products[0]._serving_authority,undefined);assert.equal(body.products[1]._serving_authority,undefined);assert.equal(body.products[2]._serving_authority,'confirmed_correction');
});

test('changed canonical FDC and barcode bind entirely to current snapshot',async()=>{
 const old=snapshot({barcode:'012345678901',usda_fdc_id:'111'});
 const current=snapshot({barcode:'999999999999',usda_fdc_id:'333',calories:100,serving_size:50});
 const body=await (await endpoint(adminFor([old],[row(current,true)],cached)).handleSearch(request())).json();
 assert.equal(body.products[0].code,current.barcode);assert.equal(body.products[0]._usda_fdc_id,'333');assert.equal(body.products[0].nutriments['energy-kcal_100g'],100);
});

test('unknown FDC remains available internally for searchCore cross-provider dedupe',async()=>{
 const old=snapshot({name:'Banana bar',product_name:'Banana bar',brand:'Brand',usda_fdc_id:'123'});
 let fetches=0;
 const provider=async()=>{fetches++;return new Response(JSON.stringify({foods:[{fdcId:123,description:'Banana bar',brandOwner:'Brand',dataType:'Branded',foodNutrients:[{nutrientId:1008,unitName:'kcal',value:100}]}]}));};
 const body=await (await endpoint(adminFor([old],[]),provider).handleSearch(request())).json();
 assert.equal(fetches,1);assert.equal(body.count,1);assert.equal(body.products[0]._db_id,old.id);assert.equal(body.products[0]._usda_fdc_id,undefined);
});

test('USDA mapper retains nutrition-v1 exact IDs/units and no serving double-normalization',()=>{
 const {mapUsdaToOff}=endpoint(adminFor([],[]));
 const p=mapUsdaToOff({fdcId:999,description:'Banana',dataType:'Branded',servingSize:45,servingSizeUnit:'g',foodNutrients:[{nutrientId:1008,unitName:'kcal',value:80},{nutrientId:1003,unitName:'g',value:0}]});
 assert.equal(p.nutriments['energy-kcal_100g'],80);assert.equal(p.nutriments['proteins_100g'],0);
});

test('request validation and CORS remain intact; no RPC for invalid request',async()=>{
 const admin=adminFor([],[]),handler=endpoint(admin).handleSearch;
 assert.equal((await handler(new Request('https://local.invalid',{method:'OPTIONS'}))).status,204);
 assert.equal((await handler(request({query:'x'}))).status,400);assert.equal((await handler(request({limit:101}))).status,400);assert.equal(admin.calls.length,0);
});
