import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {adminFor} from './fixtures.mjs';
const {endpoint}=createRequire(import.meta.url)('./runtime.cjs');
const request=capability=>new Request('https://local.invalid',{method:'POST',body:JSON.stringify({query:'banana',...(capability===undefined?{}:{review_capability:capability})})});
const off=(overrides={})=>({code:'0123456789012',product_name:'Banana drink',brands:'Example',serving_size:'250 ml',serving_quantity:250,nutriments:{'energy-kcal_100g':60,proteins_100g:1},...overrides});
async function run(products,capability){
 const calls=[];const fetch=async url=>{calls.push(url);return Response.json(url.includes('api.nal.usda')?{foods:[]}:{products});};
 const response=await endpoint(adminFor([],[]),fetch).handleSearch(request(capability));return {response,body:await response.json(),calls};
}
test('external OFF visible on V4 only as explicit review-only identity with honest raw volume label',async()=>{
 const {response,body,calls}=await run([off()],'label_confirmation_v1');const p=body.products[0];assert.equal(response.status,200);assert.equal(body.status,'partial');assert.equal(body.count,1);assert.equal(p.product_name,'Banana drink');assert.equal(p.brands,'Example');assert.equal(p.code,'0123456789012');assert.equal(p._source,'openfoodfacts');assert.equal(p.requires_label_confirmation,true);assert.equal(p.nutrition_issue,'volume_basis_requires_confirmation');assert.equal(p.unconfirmed_serving_label,'250 ml');for(const key of ['nutriments','serving_quantity','serving_size','_db_id','_portion_evidence','_usda_fdc_id'])assert.equal(p[key],undefined);assert.equal(calls.length,2);assert.ok(calls.every(url=>url.includes('/foods/search?')||url.includes('/cgi/search.pl?')));
});
for(const capability of [undefined,null,false,{},[],['label_confirmation_v1'],'label_confirmation_v0'])test('old/malformed capability fails closed for raw OFF: '+String(capability),async()=>{
 const {response,body,calls}=await run([off()],capability);assert.equal(response.status,409);assert.equal(body.error,'SEARCH_REVIEW_UPDATE_REQUIRED');assert.equal(body.status,'update_required');assert.deepEqual(body.products,[]);assert.equal(body.count,0);assert.equal(calls.length,2);
});
test('explicit gram serving text remains unconfirmed external evidence, not proof of per100g basis',async()=>{
 for(const serving_size of ['30 g','2 tbsp (30 g)','250 ml (200 g)','no measurement']) {
  const {body}=await run([off({serving_size})],'label_confirmation_v1');assert.equal(body.products[0].nutrition_issue,'external_food_requires_confirmation');assert.equal(body.products[0].unconfirmed_serving_label,serving_size);assert.equal(body.products[0].nutriments,undefined);
 }
});
test('non-numeric or absent OFF nutrition remains visible for confirmation; arbitrary raw payload and unsafe label omitted',async()=>{
 const {body}=await run([off({nutriments:{private:'SECRET',fat_100g:Infinity},serving_size:'<script>SECRET</script>'})],'label_confirmation_v1');assert.equal(body.count,1);assert.equal(body.products[0].unconfirmed_serving_label,undefined);assert.equal(JSON.stringify(body).includes('SECRET'),false);assert.equal(body.products[0].nutrition_issue,'external_food_requires_confirmation');
});
test('normal no-results response does not require review capability',async()=>{
 const {response,body}=await run([],undefined);assert.equal(response.status,200);assert.equal(body.status,'complete');assert.deepEqual(body.products,[]);
});


test('distinct external packages keep identity after numeric stripping; same barcode still dedupes',async()=>{
 const first=off({code:'0123456789012',serving_size:'250 ml'}),second=off({code:'0123456789013',serving_size:'500 ml'});
 const {body}=await run([first,second,{...first}],'label_confirmation_v1');assert.equal(body.count,2);assert.deepEqual(body.products.map(p=>p.code),[first.code,second.code]);assert.deepEqual(body.products.map(p=>p.unconfirmed_serving_label),['250 ml','500 ml']);
});
