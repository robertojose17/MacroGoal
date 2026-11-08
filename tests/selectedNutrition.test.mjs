import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=process.env.NUTRITION_CAPTURE_CANDIDATE_DIR?pathToFileURL(process.env.NUTRITION_CAPTURE_CANDIDATE_DIR.replace(/\\/g,'/')+'/'):new URL('../supabase/functions/_shared/',import.meta.url);
const {selectedSourceEnvelope:capture}=await import(new URL('selectedNutrition.mjs',root));
test('complete raw source includes unmapped nutrition without fabricated zero',()=>{
 const raw={fdcId:1,foodNutrients:[{nutrient:{id:1106,name:'Vitamin A RAE',unitName:'UG'},amount:0},{nutrient:{id:1180,name:'Choline',unitName:'MG'},amount:null}],extra:{kept:true}};
 const e=capture('usda','1',raw);
 assert.equal(e.nutrition.nutrients[0].amount,0);assert.equal(e.nutrition.nutrients[1].amount,null);
 assert.equal(e.nutrition.nutrients[1].status,'missing');assert.deepEqual(e.raw_payload,raw);
 assert.throws(()=>capture('usda','2',raw),/identity/);
 const large={...raw,huge:'x'.repeat(300000)};
 assert.throws(()=>capture('usda','1',large,undefined,'search_response'),/too_large/);
 assert.deepEqual(capture('usda','1',large).raw_payload,large);
 assert.throws(()=>capture('usda','1',{...raw,huge:'x'.repeat(1048576)}),/too_large/);
 assert.equal(capture('usda','1',raw,undefined,'search_response').complete,false);
 assert.equal(e.complete,true);
});
test('OFF normalized fields are not mislabeled as display units',()=>{
 const raw={code:'123',nutriments:{calcium_100g:0.12,calcium_unit:'mg',calcium_value:120,'vitamin-a_100g':null}};
 const e=capture('openfoodfacts','123',raw);
 assert.equal(e.nutrition.nutrients.find(n=>n.provider_key==='calcium_100g').unit,'g');
 assert.equal(e.nutrition.nutrients.find(n=>n.provider_key==='calcium_value').unit,'mg');
 assert.equal(e.nutrition.nutrients.find(n=>n.provider_key==='vitamin-a_100g').unit,null);
 assert.deepEqual(e.raw_payload,raw);
});
test('OFF search ID fallback never overrides explicit conflicting code',()=>{
 assert.equal(capture('openfoodfacts','123',{_id:'123',nutriments:{}},undefined,'search_response').source_id,'123');
 assert.throws(()=>capture('openfoodfacts','123',{code:'456',_id:'123',nutriments:{}}),/identity/);
});

