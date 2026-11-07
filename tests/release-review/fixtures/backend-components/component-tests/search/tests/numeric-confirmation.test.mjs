import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {snapshot,row,uuid,adminFor,root} from './fixtures.mjs';
const require=createRequire(import.meta.url);const {endpoint}=require('./runtime.cjs');
const {normalizeSearchNutrition}=await import(path.join(root,'_shared/searchHydration.mjs'));
const req=(capability='label_confirmation_v1')=>new Request('https://local.invalid',{method:'POST',body:JSON.stringify({query:'banana',...(capability===undefined?{}:{review_capability:capability})})});
async function response(s,capability='label_confirmation_v1',protectedRow=false){
 let providers=0;const admin=adminFor([s],protectedRow?[row(s,true)]:[]);
 const result=await endpoint(admin,async()=>{providers++;throw Error('Unexpected provider retry');}).handleSearch(req(capability));
 return {result,body:await result.json(),providers,admin};
}
const numericFields=['nutriments','serving_size','serving_quantity','serving_unit','_portion_evidence','_serving_authority','_usda_fdc_id'];
function displayOnly(p,s,issue){assert.equal(p._db_id,s.id);assert.equal(p.product_name,s.product_name);assert.equal(p.requires_label_confirmation,true);assert.equal(p.nutrition_issue,issue);for(const key of numericFields)assert.equal(p[key],undefined);}
for(const value of [null,'',false,undefined,{},[],NaN,Infinity,-1])test('missing/malformed fallback core retains identity with explicit review, never invented zero: '+String(value),async()=>{
 const s=snapshot({protein:value});const {result,body,providers,admin}=await response(s);
 assert.equal(result.status,200);assert.equal(body.status,'partial');assert.equal(body.products.length,1);displayOnly(body.products[0],s,'core_nutrition_requires_confirmation');assert.equal(providers,0);
 assert.deepEqual(body.providers,{db:'ok',usda:'skipped',off:'skipped'});assert.deepEqual(admin.calls.map(c=>c.name),['search_food_catalog_v2','read_food_search_snapshots_v1']);
});
test('normalized optional fiber overflow retains protected identity for review without clamping, null or serving numbers',async()=>{
 const s=snapshot({macros_per:'serving',serving_size:1,calories:1,protein:0,carbs:0,fat:0,fiber:1e308});const {result,body,providers}=await response(s,'label_confirmation_v1',true);
 assert.equal(result.status,200);assert.equal(body.status,'partial');assert.equal(providers,0);displayOnly(body.products[0],s,'normalized_nutrition_requires_confirmation');assert.equal(s.fiber,1e308);
});
test('core overflow and positive-underflow are explicit, representable tiny scaling remains correct',async()=>{
 for(const s of [snapshot({macros_per:'serving',serving_size:1e-308,calories:1e308}),snapshot({macros_per:'serving',serving_size:1e308,protein:1e-308})]) {
  const {body,providers}=await response(s,'label_confirmation_v1',true);displayOnly(body.products[0],s,'normalized_nutrition_requires_confirmation');assert.equal(providers,0);
 }
 const tiny=snapshot({macros_per:'serving',serving_size:1e-308,calories:1e-308,protein:0,carbs:0,fat:0,fiber:null});const normalized=normalizeSearchNutrition(tiny);
 assert.equal(normalized.valid,true);assert.equal(normalized.nutriments['energy-kcal_100g'],100);assert.equal(normalized.nutriments.proteins_100g,0);
});
test('explicit volume unit uses volume review reason rather than suggesting gram interpretation',async()=>{
 for(const change of [{macros_per:'100ml'},{serving_unit:'mL',protein:null},{serving_unit:'fl oz',protein:null}]) {
  const s=snapshot(change),{body}=await response(s);displayOnly(body.products[0],s,'volume_basis_requires_confirmation');
 }
});
test('distinct unsafe DB identities and interleaved valid results remain in original ranked order',async()=>{
 const first=snapshot({id:uuid(1),protein:null,usda_fdc_id:'1'}),valid=snapshot({id:uuid(2),usda_fdc_id:'2'}),last=snapshot({id:uuid(3),protein:null,usda_fdc_id:'3'});
 const admin=adminFor([first,valid,last],[row(valid)]);const response=await endpoint(admin).handleSearch(req());const body=await response.json();
 assert.deepEqual(body.products.map(p=>p._db_id),[first.id,valid.id,last.id]);assert.equal(body.products[1].requires_label_confirmation,undefined);assert.equal(body.products[1].nutriments.proteins_100g,1.1);assert.equal(body.count,3);assert.equal(body.status,'partial');
});
for(const capability of [null,false,true,0,{},[],['label_confirmation_v1'],'','label_confirmation_v0','label_confirmation_v1 '])test('malformed or missing capability fails closed only for unsafe result: '+JSON.stringify(capability),async()=>{
 const s=snapshot({protein:null});const {result,body,providers,admin}=await response(s,capability);
 assert.equal(result.status,409);assert.equal(body.status,'update_required');assert.equal(body.error,'SEARCH_REVIEW_UPDATE_REQUIRED');assert.match(body.message,/Update MacroGoal/);assert.deepEqual(body.products,[]);assert.equal(body.count,0);assert.equal(providers,0);assert.equal(admin.calls.some(c=>c.name==='read_usda_portions_v1'),false);
});
test('omitted capability explicitly rejected for unsafe results; no selectable cached mixture is returned',async()=>{
 const bad=snapshot({protein:null}),good=snapshot({id:uuid(2)}),admin=adminFor([bad,good],[row(good)]);
 const response=await endpoint(admin).handleSearch(new Request('https://local.invalid',{method:'POST',body:JSON.stringify({query:'banana'})}));const body=await response.json();assert.equal(response.status,409);assert.deepEqual(body.products,[]);assert.equal(body.count,0);
});
test('legacy and malformed capabilities do not alter ordinary complete safe results',async()=>{
 const s=snapshot();for(const capability of [null,false,{},'label_confirmation_v0']) {
  const admin=adminFor([s],[row(s,true)]);const result=await endpoint(admin).handleSearch(req(capability));const body=await result.json();assert.equal(result.status,200);assert.equal(body.status,'complete');assert.equal(body.products.length,1);assert.equal(body.products[0].requires_label_confirmation,undefined);
 }
});


test('valid per100g core stays usable as exact100g when optional serving evidence is absent or invalid',async()=>{
 for(const serving_size of [null,undefined,0,-1,Infinity,'',false]){
  const s=snapshot({serving_size,serving_quantity:'777',serving_description:'unproven cup',serving_count:4});
  const {result,body,providers}=await response(s,null);const p=body.products[0];
  assert.equal(result.status,200);assert.equal(body.status,'partial');assert.equal(p.requires_label_confirmation,undefined);assert.equal(p.serving_size,'100 g');assert.equal(p.serving_quantity,'100');assert.equal(p.nutriments['energy-kcal_100g'],89);assert.equal(p._usda_fdc_id,undefined);assert.equal(providers,0);
 }
});

test('per-serving core without valid gram denominator remains explicit review-only',async()=>{
 for(const serving_size of [null,0,-1,undefined]){
  const s=snapshot({macros_per:'serving',serving_size}),{body,providers}=await response(s);displayOnly(body.products[0],s,'nutrition_basis_requires_confirmation');assert.equal(providers,0);
 }
});
