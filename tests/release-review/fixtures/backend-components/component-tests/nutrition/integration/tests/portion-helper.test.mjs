import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {applyUsdaPortion,captureUsdaPortions,readUsdaPortions,portionGrams,nutritionForGrams} from '../supabase/functions/_shared/foodPortions.mjs';
const capture=()=>captureUsdaPortions({fdcId:123,description:'Banana, raw',dataType:'Foundation',foodPortions:[{id:1,amount:1,gramWeight:118,modifier:'medium'}]},'123','2026-11-06T12:00:00Z');
test('confirmed corrected USDA serving survives helper with and without provider evidence',()=>{
 const row={_usda_fdc_id:'123',product_name:'Banana, raw',_serving_authority:'confirmed_correction',serving_size:'2 pieces',serving_quantity:150,nutriments:{proteins_serving:3,proteins_100g:2}};
 for(const e of [null,capture()]){const before=structuredClone(row);assert.strictEqual(applyUsdaPortion(row,e),row);assert.deepEqual(row,before);}
});
test('uncorrected USDA exact identity retains measures while preparation mismatch falls back',()=>{
 const row={_usda_fdc_id:'123',product_name:'Banana, raw',nutriments:{proteins_100g:2,proteins_serving:20}};
 const result=applyUsdaPortion(row,capture());assert.equal(result.serving_quantity,118);assert.equal(result.nutriments.proteins_100g,2);assert.equal(result.nutriments.proteins_serving,undefined);
 assert.equal(applyUsdaPortion({...row,product_name:'Banana, cooked'},capture()).serving_quantity,100);
});
test('portion capture identity and scaling stay pure',()=>{
 const e=capture();assert.equal(readUsdaPortions(e,'999').length,0);assert.equal(portionGrams(e.portions[0],2),236);
 const facts={calories:89,protein:1,carbs:23,fat:.3,fiber:null},before=structuredClone(facts);assert.equal(nutritionForGrams(facts,118).calories,105.02);assert.deepEqual(facts,before);
});
test('helper copy is exactly the independently reviewed shared helper',()=>{
 const source=readFileSync(new URL("../../../client/supabase/functions/_shared/foodPortions.mjs",import.meta.url).pathname);
 const copy=readFileSync(new URL('../supabase/functions/_shared/foodPortions.mjs',import.meta.url));assert.deepEqual(copy,source);
 assert.equal(createHash('sha256').update(copy).digest('hex'),readFileSync(new URL('../foodPortions.sha256',import.meta.url),'utf8').trim());
});
