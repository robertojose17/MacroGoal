import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {captureOff100gV4} from '../supabase/functions/lookup-barcode/_shared/off100gV4.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/barcode/recent-products.json',import.meta.url)));
for(const id of ['0078742307305','0078742434032']){
 const product=rows.find(x=>x.source_id===id).product;
 test(id+' preserves original raw and accepts exact provider rounding',()=>{const copy=structuredClone(product);let out=captureOff100gV4(product,{expectedId:id});assert.deepEqual(out.snapshot.nutriments,copy.nutriments);assert.deepEqual(product,copy)});
 test(id+' rejects arbitrary serving adjustment',()=>{const p=structuredClone(product);p.nutriments.carbohydrates_serving+=.01;assert.throws(()=>captureOff100gV4(p,{expectedId:id}),/contradictory_serving/)});
 test(id+' rejects zero/nonzero contradiction',()=>{const p=structuredClone(product);p.nutriments.fat_serving=.0000001;assert.throws(()=>captureOff100gV4(p,{expectedId:id}),/contradictory_serving/)});
}
