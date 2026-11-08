import test from 'node:test';import assert from 'node:assert/strict';
import {validateSupplementalRead,reconcileSupplementalReads,readSupplementalLabel,persistSupplementalLabel} from '../../supabase/functions/vision-nutrition-extract/label-all-rows.mjs';
const anchor={header:'Per serving',basis:'per_serving',serving_line:'Serving size 1 unit (16 g)'};
const row=(label,amount,unit,dv)=>({row_label:label,column_header:anchor.header,amount_text:amount,unit,dv_text:dv,printed_text:[label,amount,unit,dv].filter(v=>v!==null).join(' ')});
const read=rows=>({schema:'label_rows_v1',declared_serving_line:anchor.serving_line,selected_column_header:anchor.header,selected_basis:anchor.basis,complete:true,rows});
test('preserves zero, qualified amounts, vitamin units and DV-only rows without deriving amounts',()=>{
 const raw=read([row('Sodium','0','mg','0%'),row('Total sugars','<1','g',null),row('Vitamin D','2','mcg','10%'),row('Iron',null,null,'4%')]);
 const out=reconcileSupplementalReads(raw,structuredClone(raw),anchor);
 assert.equal(out.complete,true);assert.equal(out.rows[0].amount,0);assert.equal(out.rows[1].amount_qualifier,'<');assert.equal(out.rows[2].unit,'mcg');assert.equal(out.rows[3].amount,null);assert.equal(out.rows[3].daily_value_percent,4);assert.equal(out.canonical_macros_changed,false);
});
test('rejects another column, serving line or basis',()=>{
 for(const change of [{selected_column_header:'Per 100g'},{selected_basis:'per_100g'},{declared_serving_line:'Serving size 2 units (32 g)'}])assert.throws(()=>validateSupplementalRead({...read([]),...change},anchor),/basis_mismatch/);
 assert.throws(()=>validateSupplementalRead(read([{...row('Sodium','2','mg',null),column_header:'Per100g'}]),anchor));
});
test('disagreement/missing rows stay raw evidence and cannot become agreed nutrients',()=>{
 const a=read([row('Sodium','2','mg',null),row('Iron',null,null,'4%')]);const b=read([row('Sodium','20','mg',null),row('Calcium','10','mg',null)]);
 const out=reconcileSupplementalReads(a,b,anchor);assert.equal(out.complete,false);assert.equal(out.rows.length,0);assert.equal(out.issues.length,3);assert.equal(out.readings[0].rows.length,2);
});
test('never accepts numeric strings outside evidence or adjacent amount as evidence',()=>{
 assert.throws(()=>validateSupplementalRead(read([{...row('Sodium','2','mg',null),printed_text:'Sodium 20 mg'}]),anchor),/evidence/);
 assert.throws(()=>validateSupplementalRead(read([{...row('Sodium','2','g',null),printed_text:'Sodium 2 mg'}]),anchor),/evidence/);
 assert.throws(()=>validateSupplementalRead(read([{...row('Iron',null,null,'4%'),dv_text:4}]),anchor));
});
test('duplicate, oversize, truncated and unreadable rows never imply complete capture',()=>{
 const r=row('Iron',null,null,'4%');assert.throws(()=>validateSupplementalRead(read([r,r]),anchor));assert.throws(()=>validateSupplementalRead(read(Array(65).fill(r)),anchor));
 const a={...read([r]),complete:false};assert.equal(reconcileSupplementalReads(a,read([r]),anchor).complete,false);
 const out=validateSupplementalRead(read([row('Biotin','trace',null,null)]),anchor);assert.equal(out.rows[0].amount,null);assert.equal(out.rows[0].amount_status,'unparsed');
});
test('two bounded independent reads; invalid first never spends second, timeout never throws',async()=>{
 let calls=0;const raw=read([row('Sodium','0','mg','0%')]);
 const good=await readSupplementalLabel(async()=>{calls++;return {result:raw,finishReason:'stop'}},anchor);
 assert.equal(calls,2);assert.equal(good.status,'two_read_agreement');
 calls=0;const bad=await readSupplementalLabel(async()=>{calls++;return {result:raw,finishReason:'length'}},anchor);assert.equal(calls,1);assert.equal(bad.status,'unavailable');
 const timed=await readSupplementalLabel(()=>new Promise(()=>{}),anchor,{timeoutMs:5});assert.equal(timed.reason,'timeout');
});
test('owner/submission/revision CAS preserves receipts and refuses stale or failed write',async()=>{
 const old={recovery_version:1,photo_attempts:1,provider_receipts:[{id:'keep'}]};let update,filters=[];
 const db={from(table){assert.equal(table,'food_submissions');return {select(){return this},eq(k,v){filters.push([k,v]);return this},update(v){update=v;return this},async maybeSingle(){return update?{data:{id:'s'}}:{data:{extracted_data:old}}}}}};
 assert.equal(await persistSupplementalLabel(db,'owner','s',2,{status:'unavailable'}),false);assert.equal(update,undefined);
 filters=[];assert.equal(await persistSupplementalLabel(db,'owner','s',1,{status:'unavailable'}),true);
 assert.deepEqual(update.extracted_data.provider_receipts,old.provider_receipts);assert(filters.some(([k,v])=>k==='submitted_by_user_id'&&v==='owner'));assert(filters.some(([k,v])=>k==='status'&&v==='pending'));assert(filters.some(([k,v])=>k==='extracted_data'&&v===JSON.stringify(old)));
});

test('real 17-row label including unitless calories and intercalated added sugars validates',async()=>{
 const fs=await import('node:fs');const raw=JSON.parse(fs.readFileSync(new URL('./label-rows-real-probe2.json',import.meta.url)));
 const a={header:raw.selected_column_header,basis:raw.selected_basis,serving_line:raw.declared_serving_line};
 const out=reconcileSupplementalReads(raw,structuredClone(raw),a);assert.equal(out.rows.length,17);assert.equal(out.complete,true);assert.equal(out.rows[0].unit,null);assert.equal(out.rows[0].amount_status,'unparsed');assert.equal(out.rows[11].amount,6);
 const bad=structuredClone(raw);bad.rows[11].printed_text='Includes/Incluye EXTRA 6g Added Sugars/Azúcares Añadidas 12%';assert.throws(()=>validateSupplementalRead(bad,a),/invalid_supplemental_row/);
 bad.rows[11].printed_text='Includes/Incluye 16g Added Sugars/Azúcares Añadidas 12%';assert.throws(()=>validateSupplementalRead(bad,a),/invalid_supplemental_row/);
});
test('actual independent provider reads replay to 17 agreed rows with corrected parser',async()=>{
 const fs=await import('node:fs');const capture=JSON.parse(fs.readFileSync(new URL('./label-rows-real-probe3-result.json',import.meta.url)));
 const result=capture.result;const a={header:result.selected_column_header,basis:result.basis,serving_line:result.declared_serving_line};
 const out=reconcileSupplementalReads(...result.readings,a);assert.equal(out.rows.length,17);assert.equal(out.status,'two_read_agreement');assert.equal(out.complete,true);assert.equal(out.rows.find(r=>r.row_label.includes('Iron')).amount,0.3);
});
