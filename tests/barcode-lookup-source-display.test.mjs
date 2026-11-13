import test from 'node:test';
import assert from 'node:assert/strict';
import {offSourceDisplay} from '../supabase/functions/lookup-barcode/_shared/offSourceDisplay.mjs';
test('missing macros remain absent, explicit zero remains zero',()=>{const p=offSourceDisplay({code:'4099100102659',nutriments:{'energy-kcal_100g':300,proteins_100g:null,fat_100g:0}});assert.equal(p.nutriments.proteins_100g,null);assert.equal(p.nutriments.fat_100g,0);assert.equal(Object.hasOwn(p.nutriments,'carbohydrates_100g'),false);});
test('does not invent grams or convert volume',()=>{const p=offSourceDisplay({serving_size:'1 tbsp (15 ml)',serving_quantity:15,serving_quantity_unit:'ml',nutriments:{fat_100g:0}});assert.equal(p.serving_quantity_unit,'ml');assert.equal(p.serving_quantity,15);assert.equal(p.nutrition_data_per,null);});
test('source does not acquire canonical id or save authority',()=>{const p=offSourceDisplay({id:'not-authority',ai_verified:true,nutriments:{fat_100g:0}});assert.equal(p.id,undefined);assert.equal(p.ai_verified,undefined);});
test('qualified source values retain qualifier',()=>{const p=offSourceDisplay({nutriments:{fat_100g:0.5,fat_modifier:'<'}});assert.equal(p.nutriments.fat_modifier,'<');});
test('invalid values never become zero',()=>{const p=offSourceDisplay({nutriments:{fat_100g:-1,proteins_100g:Infinity,carbohydrates_100g:'unknown'}});assert.deepEqual(p.nutriments,{});});
test('ingredients are copied bounded, never inferred',()=>{assert.equal(offSourceDisplay({ingredients_text:'Yeast'}).ingredients_text,'Yeast');assert.equal(offSourceDisplay({}).ingredients_text,null);assert.equal(offSourceDisplay({ingredients_text:'x'.repeat(5000)}).ingredients_text.length,4096);});
