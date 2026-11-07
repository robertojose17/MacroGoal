import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createManualRecoverySave} from '../utils/manualRecoverySave.ts';
import {readFileSync} from 'node:fs';
const payload={name:'Fixture',brand:null,serving_amount:20,serving_unit:'g',calories:60,protein:0,carbs:4,fats:4.5,fiber:0,user_created:true,created_by:'owner'};
test('simultaneous saves coalesce and successful retry never inserts again',async()=>{
 const save=createManualRecoverySave();let resolve,calls=0;const services={insert:row=>{calls++;return new Promise(r=>resolve=()=>r({data:row}));},read:async()=>{throw Error('unexpected');}};
 const a=save('owner',payload,services),b=save('owner',payload,services);assert.equal(a,b);resolve();const result=await a;assert.equal(calls,1);assert.equal(await save('owner',payload,services),result);assert.equal(calls,1);
});
test('lost insert response reads only own stable ID and accepts exact committed row',async()=>{
 const save=createManualRecoverySave();let stored,reads=0;
 const result=await save('owner',payload,{insert:async row=>{stored=row;throw Error('lost');},read:async(id,owner)=>{reads++;assert.equal(id,stored.id);assert.equal(owner,'owner');return {data:stored};}});
 assert.equal(result,stored);assert.equal(reads,1);
});
test('lost insert and read response retry uses same ID and never creates another row',async()=>{
 const save=createManualRecoverySave(),rows=new Map();let calls=0,ids=[];
 const insert=async row=>{calls++;ids.push(row.id);if(rows.has(row.id))return {data:null,error:'duplicate key'};rows.set(row.id,row);throw Error('lost');};
 await assert.rejects(save('owner',payload,{insert,read:async()=>{throw Error('offline');}}),/manual_save_unknown/);
 const result=await save('owner',payload,{insert,read:async id=>({data:rows.get(id)})});assert.equal(rows.size,1);assert.equal(ids[0],ids[1]);assert.equal(result.id,ids[0]);assert.equal(calls,2);
});
test('uncertain edits and owner changes never write/read another row',async()=>{
 const save=createManualRecoverySave();let calls=0;
 const services={insert:async()=>{calls++;throw Error('lost');},read:async()=>({data:null})};
 await assert.rejects(save('owner',payload,services),/manual_save_unknown/);
 await assert.rejects(save('owner',{...payload,calories:70},services),/manual_payload_changed/);
 await assert.rejects(save('other',{...payload,created_by:'other'},services),/manual_owner_changed/);assert.equal(calls,1);
});
test('wrong returned row or mismatched stored fields cannot masquerade as success',async()=>{
 for(const mutate of [row=>({...row,created_by:'other'}),row=>({...row,calories:999}),row=>({...row,id:'other'})]){
 const save=createManualRecoverySave();let sent;
 await assert.rejects(save('owner',payload,{insert:async row=>{sent=row;return {data:mutate(row)};},read:async()=>({data:mutate(sent)})}),/manual_save_unknown/);
 }
});
test('new form has new ID; memory-only guarantee does not claim restart deduplication',async()=>{
 const ids=[];const services={insert:async row=>{ids.push(row.id);return {data:row};},read:async()=>({data:null})};
 await createManualRecoverySave()('owner',payload,services);await createManualRecoverySave()('owner',payload,services);assert.notEqual(ids[0],ids[1]);
});
test('actual form keeps legacy insert and uses owned readback only in opt-in branch',()=>{
 const source=readFileSync(new URL('../app/my-foods-create.tsx',import.meta.url),'utf8');
 assert.match(source,/recoveryManual\s*\? \{data:await recoverySave.current/);assert.match(source,/: await supabase\s*\.from\('foods'\)\s*\.insert\(payload\)/);
 assert.match(source,/\.eq\('id',id\)\.eq\('created_by',owner\)/);assert.match(source,/current\?\.id!==user.id/);assert.doesNotMatch(source,/\.upsert\(/);
});
