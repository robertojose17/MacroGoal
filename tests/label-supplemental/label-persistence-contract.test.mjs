import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {persistSupplementalLabel} from '../../supabase/functions/vision-nutrition-extract/label-all-rows.mjs';
const sql=fs.readFileSync(new URL('./confirm-barcode-live-label-review.sql',import.meta.url),'utf8');
const recovery=fs.readFileSync(new URL('../../supabase/functions/vision-nutrition-extract/recovery.ts',import.meta.url),'utf8');
test('live SQL confirmation links saved food and appends confirmation without replacing evidence',()=>{
 assert(sql.includes("set status='approved',food_item_id=saved.id"));
 assert(sql.includes("extracted_data=extracted_data||jsonb_build_object('confirmed_payload',p_payload,'confirmed_item',to_jsonb(saved),'confirmed_at',now())"));
 assert(sql.includes("(p_payload->>'revision')::integer is distinct from coalesce((s.extracted_data->>'photo_attempts')::integer,0)"));
 assert(sql.includes('submitted_by_user_id=p_owner for update'));
});
test('supplemental revision2 preserves revision1 and provider receipts before append-only confirmation',async()=>{
 let data={recovery_version:1,photo_attempts:2,provider_receipts:[{id:'kept'}],supplemental_label:{1:{rows:[{row_label:'Iron',amount:0.3}]}}};
 const db={from(){return {select(){return this},eq(){return this},update(v){this.next=v.extracted_data;return this},async maybeSingle(){if(this.next){data=this.next;return {data:{id:'s'}}}return {data:{extracted_data:data}}}}}};
 assert.equal(await persistSupplementalLabel(db,'o','s',2,{status:'unavailable'}),true);
 const appended={...data,confirmed_payload:{revision:2},confirmed_item:{id:'food'},confirmed_at:'time'};
 assert.equal(appended.supplemental_label[1].rows[0].amount,0.3);assert.equal(appended.supplemental_label[2].status,'unavailable');assert.equal(appended.provider_receipts[0].id,'kept');
});
test('recovery does not make macro review conditional on supplemental storage success',()=>{
 const start=recovery.indexOf('let supplementalStored=false;');const end=recovery.indexOf('photo={',start);assert(start>0&&end>start);
 const supplemental=recovery.slice(start,end);assert(supplemental.includes('try{supplementalStored=await persistSupplementalLabel'));assert(supplemental.includes('}catch{'));assert(!supplemental.includes('return '));
 assert(recovery.slice(end,end+1000).includes('validated:true'));
});
