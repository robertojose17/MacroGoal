import test from 'node:test';
import assert from 'node:assert/strict';
import {captureUSDA,resolveMissing} from "../nutrition/src/provider.mjs";
const e=captureUSDA({fdcId:173944,description:'Bananas, raw',dataType:'SR Legacy',foodNutrients:[{nutrient:{id:1177,unitName:'UG'},amount:20}]},{capturedAt:'2026-11-06T12:00:00Z',expectedId:'173944'});
for(const container of ['nutriments','off_data'])for(const alias of ['folate_100g','vitamin_b9_100g','vitamin-b9_100g','folates_100g'])test(`preserve existing zero in ${container}.${alias}`,()=>{
 const f={provider:'usda',source_id:'173944',identity:e.identity,macros_per:'100g'};
 if(container==='off_data')f.off_data={nutriments:{[alias]:0}};else f.nutriments={[alias]:0};
 assert.deepEqual(resolveMissing(f,e).additions,{});
});
for(const extra of [{ingredients:'X'.repeat(4097)},{ingredients:'banana\nsugar'},{brandOwner:'X'.repeat(161)},{brandOwner:{name:'not-a-string'}}])test('malformed identity is not silently promoted to unbranded generic '+Object.keys(extra)[0]+':'+typeof Object.values(extra)[0],()=>{
 const raw={fdcId:173944,description:'Bananas, raw',dataType:'SR Legacy',foodNutrients:[{nutrient:{id:1162,unitName:'MG'},amount:20}],...extra};
 let e;try{e=captureUSDA(raw,{capturedAt:'2026-11-06T12:00:00Z',expectedId:'173944'});}catch{return;}
 const f={provider:'usda',source_id:'173944',identity:e.identity,macros_per:'100g'};
 assert.deepEqual(resolveMissing(f,e).additions,{});
});
