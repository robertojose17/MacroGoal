import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {snapshot,row,adminFor,envelope} from './fixtures.mjs';
const {endpoint}=createRequire(import.meta.url)('./runtime.cjs');
const req=(capability='label_confirmation_v1')=>new Request('https://local.invalid',{method:'POST',body:JSON.stringify({query:'banana',...(capability?{review_capability:capability}:{})})});
async function run(s,protectedRow=true,capability='label_confirmation_v1'){
 let providers=0;const admin=adminFor([s],[row(s,protectedRow)],[{fdc_id:'123',payload:envelope}]);const result=await endpoint(admin,async()=>{providers++;throw Error('No provider retry');}).handleSearch(req(capability));return {result,body:await result.json(),admin,providers};
}
const forbidden=['nutriments','serving_size','serving_quantity','serving_unit','_serving_authority','_portion_evidence','_usda_fdc_id'];
for(const unit of ['ml','mL','milliliter','millilitres','L','liter','litres','fl oz','fl. oz','fluid ounces'])test('protected canonical explicit volume '+unit+' is review-only, never relabeled grams',async()=>{
 const s=snapshot({serving_unit:unit,serving_size:250,serving_quantity:'250'}),{result,body,admin,providers}=await run(s);const p=body.products[0];
 assert.equal(result.status,200);assert.equal(body.status,'partial');assert.equal(p._db_id,s.id);assert.equal(p.requires_label_confirmation,true);assert.equal(p.nutrition_issue,'volume_basis_requires_confirmation');for(const key of forbidden)assert.equal(p[key],undefined);assert.equal(providers,0);assert.equal(admin.calls.some(c=>c.name==='read_usda_portions_v1'),false);
});
for(const unit of ['cup','cups','piece','oz','kg','UNKNOWN',false,0,{}])test('unsupported canonical unit '+JSON.stringify(unit)+' requires confirmation without conversion',async()=>{
 const s=snapshot({serving_unit:unit}),{body,providers}=await run(s);const p=body.products[0];assert.equal(p.requires_label_confirmation,true);assert.equal(p.nutrition_issue,'nutrition_basis_requires_confirmation');for(const key of forbidden)assert.equal(p[key],undefined);assert.equal(providers,0);
});
for(const unit of [null,undefined,'','   '])test('missing unit '+JSON.stringify(unit)+' never proves per-serving grams',async()=>{
 const s=snapshot({macros_per:'serving',serving_unit:unit,serving_size:250}),{body,providers}=await run(s);assert.equal(body.products[0].requires_label_confirmation,true);assert.equal(body.products[0].nutrition_issue,'nutrition_basis_requires_confirmation');for(const key of forbidden)assert.equal(body.products[0][key],undefined);assert.equal(providers,0);
});
for(const protectedRow of [true,false])test('valid per100g absent unit exposes exact100g only, no FDC redecoration (protected='+protectedRow+')',async()=>{
 for(const serving_unit of [null,undefined,'','   ']){
  const s=snapshot({serving_unit,serving_size:250,serving_quantity:'250',serving_count:2,serving_description:'unproven cups',protein:0}),{result,body,admin}=await run(s,protectedRow,null);const p=body.products[0];
  assert.equal(result.status,200);assert.equal(body.status,'partial');assert.equal(p.serving_size,'100 g');assert.equal(p.serving_quantity,'100');assert.equal(p.nutriments['energy-kcal_100g'],89);assert.equal(p.nutriments.proteins_100g,0);assert.equal(p.requires_label_confirmation,undefined);assert.equal(p._usda_fdc_id,undefined);assert.equal(p._portion_evidence,undefined);assert.equal(p._serving_authority,undefined);assert.equal(admin.calls.some(c=>c.name==='read_usda_portions_v1'),false);
 }
});
test('known g/gram/grams aliases preserve confirmed45g/80kcal3pieces and truezero',async()=>{
 for(const serving_unit of ['g','gram','grams',' G ']){
  const s=snapshot({macros_per:'serving',serving_unit,serving_size:45,serving_quantity:'45',serving_description:'pieces',serving_count:3,calories:80,protein:0,fat:0});const {body}=await run(s);const p=body.products[0];assert.equal(body.status,'complete');assert.equal(p._serving_authority,'confirmed_correction');assert.equal(p.serving_size,'3 pieces (45 g)');assert.equal(p.serving_quantity,'45');assert.ok(Math.abs(p.nutriments['energy-kcal_100g']-80*100/45)<1e-12);assert.equal(p.nutriments.proteins_100g,0);assert.equal(p.nutriments.fat_100g,0);
 }
});
test('legacy request receives update-required for canonical volume, normal g unaffected',async()=>{
 const volume=await run(snapshot({serving_unit:'ml'}),true,null);assert.equal(volume.result.status,409);assert.equal(volume.body.error,'SEARCH_REVIEW_UPDATE_REQUIRED');assert.deepEqual(volume.body.products,[]);
 const normal=await run(snapshot(),true,null);assert.equal(normal.result.status,200);assert.equal(normal.body.status,'complete');
});
