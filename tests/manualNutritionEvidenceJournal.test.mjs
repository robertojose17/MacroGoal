import test from 'node:test';
import assert from 'node:assert/strict';
import {createManualNutritionEvidenceJournal} from '../utils/manualNutritionEvidenceJournal.ts';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const entry=(owner,rid)=>({version:'manual-evidence-journal-v1',ownerId:id(owner),itemId:id(2),request:{version:'user-entered-v1',kind:'register',itemId:id(2),requestId:id(rid),revision:id(6),expectedEvidenceVersion:0,declaredFields:['calories'],expected:{values:{calories:0,protein:0,carbs:0,fats:0,fiber:0},portion:{grams:1,quantity:1,serving_description:'1 g',serving_unit:null,food_id:id(4),food_item_id:null,food_name:'Manual',food_brand:null,meal_id:id(5),is_scheduled:false,logged_at:'2026-11-15T00:00:00Z'}}}});
function fixture(){const map=new Map();return {map,storage:{getItem:async k=>map.get(k)??null,setItem:async(k,v)=>{map.set(k,v);},getAllKeys:async()=>[...map.keys()],removeItem:async k=>{map.delete(k);}}};}
test('two requests on same item stay independent; actors stay isolated',async()=>{const f=fixture(),j=createManualNutritionEvidenceJournal(f.storage);await Promise.all([j.append(entry(1,3)),j.append(entry(1,4)),j.append(entry(9,5))]);assert.equal((await j.listPending(id(1),id(2))).length,2);assert.equal((await j.listPending(id(9),id(2))).length,1);});
test('existing request cannot be overwritten with changed payload',async()=>{const f=fixture(),j=createManualNutritionEvidenceJournal(f.storage),e=entry(1,3);await j.append(e);await assert.rejects(j.append({...e,request:{...e.request,extra:true}}));assert.deepEqual(await j.read(id(1),id(3)),e);});
test('clear only exact request payload; no other request removed',async()=>{const f=fixture(),j=createManualNutritionEvidenceJournal(f.storage),e=entry(1,3);await j.append(e);await j.append(entry(1,4));assert.equal(await j.clearExact(id(1),id(3),{...e,itemId:id(8)}),false);assert.equal(await j.clearExact(id(1),id(3),e),true);assert.ok(await j.read(id(1),id(4)));});
test('bad namespace and identities rejected; corrupted storage is not silently ignored',async()=>{const f=fixture();assert.throws(()=>createManualNutritionEvidenceJournal(f.storage,'../bad'));const j=createManualNutritionEvidenceJournal(f.storage);await assert.rejects(j.read('bad',id(3)));f.map.set(`macrogoal:manual-nutrition-evidence:v1:${id(1)}:${id(3)}`,'broken');await assert.rejects(j.listPending(id(1),id(2)));});
test('owner enumeration spans own items but never reads another owner payload',async()=>{
 const f=fixture(),reads=[];const oldGet=f.storage.getItem;f.storage.getItem=async k=>{reads.push(k);return oldGet(k);};
 const j=createManualNutritionEvidenceJournal(f.storage),a=entry(1,3),b=entry(1,4);b.itemId=id(8);b.request.itemId=id(8);
 await j.append(a);await j.append(b);await j.append(entry(9,5));
 f.map.set(`unrelated:${id(1)}:${id(6)}`,'broken');reads.length=0;
 const found=await j.listOwnerPending(id(1));assert.equal(found.length,2);
 assert.deepEqual(new Set(found.map(e=>e.itemId)),new Set([id(2),id(8)]));
 assert.ok(reads.every(k=>k.startsWith(`macrogoal:manual-nutrition-evidence:v1:${id(1)}:`)));
 found[0].request.declaredFields=[];assert.equal((await j.read(id(1),id(3))).request.declaredFields.length,1);
});
test('owner enumeration rejects invalid owner, malformed own key and corrupt own payload without partial result',async()=>{
 const f=fixture(),j=createManualNutritionEvidenceJournal(f.storage);await j.append(entry(1,3));
 await assert.rejects(j.listOwnerPending('invalid'));
 const prefix=`macrogoal:manual-nutrition-evidence:v1:${id(1)}:`;
 f.map.set(prefix+'not-a-uuid','{}');await assert.rejects(j.listOwnerPending(id(1)));f.map.delete(prefix+'not-a-uuid');
 f.map.set(prefix+id(4),'broken');await assert.rejects(j.listOwnerPending(id(1)));f.map.delete(prefix+id(4));
 const wrong=entry(9,4);f.map.set(prefix+id(4),JSON.stringify(wrong));await assert.rejects(j.listOwnerPending(id(1)));
});
test('inspection segregates own corrupt entries and reads no other owner payload',async()=>{
 const f=fixture(),reads=[];const original=f.storage.getItem;f.storage.getItem=async k=>{reads.push(k);return original(k);};
 const j=createManualNutritionEvidenceJournal(f.storage);await j.append(entry(1,3));await j.append(entry(9,5));
 const key=`macrogoal:manual-nutrition-evidence:v1:${id(1)}:${id(4)}`;f.map.set(key,'not-json');reads.length=0;
 const all=await j.inspectOwnerPending(id(1));assert.equal(all.length,2);assert.equal(all.filter(e=>e.kind==='valid').length,1);
 assert.deepEqual(all.find(e=>e.kind==='invalid'),{kind:'invalid',requestId:id(4),raw:'not-json'});
 assert.ok(reads.every(k=>k.startsWith(`macrogoal:manual-nutrition-evidence:v1:${id(1)}:`)));
 await assert.rejects(j.listOwnerPending(id(1)));
});
test('invalid exact discard refuses changed raw and valid replacement, deletes only original invalid key',async()=>{
 const f=fixture(),j=createManualNutritionEvidenceJournal(f.storage),key=`macrogoal:manual-nutrition-evidence:v1:${id(1)}:${id(3)}`;
 await j.append(entry(1,4));f.map.set(key,'bad');assert.equal(await j.discardInvalidExact(id(1),id(3),'old'),false);assert.equal(f.map.get(key),'bad');
 f.map.set(key,JSON.stringify(entry(1,3)));assert.equal(await j.discardInvalidExact(id(1),id(3),JSON.stringify(entry(1,3))),false);assert.ok(await j.read(id(1),id(3)));
 f.map.set(key,'bad');assert.equal(await j.discardInvalidExact(id(1),id(3),'bad'),true);assert.equal(f.map.has(key),false);assert.ok(await j.read(id(1),id(4)));
});
test('inspection segregates own malformed keys alongside valid entries',async()=>{
 const f=fixture(),reads=[];const original=f.storage.getItem;f.storage.getItem=async k=>{reads.push(k);return original(k);};
 const j=createManualNutritionEvidenceJournal(f.storage);await j.append(entry(1,3));
 const own=`macrogoal:manual-nutrition-evidence:v1:${id(1)}:not-uuid`,foreign=`macrogoal:manual-nutrition-evidence:v1:${id(9)}:bad`;
 f.map.set(own,'private');f.map.set(foreign,'other');reads.length=0;
 const all=await j.inspectOwnerPending(id(1));assert.equal(all.length,2);assert.equal(all.filter(x=>x.kind==='valid').length,1);
 assert.deepEqual(all.find(x=>x.kind==='invalid-key'),{kind:'invalid-key',storageKey:own,raw:'private'});assert.ok(!reads.includes(foreign));
 await assert.rejects(j.listOwnerPending(id(1)),/invalid_journal_key/);
});
test('invalid-key discard refuses foreign owner, valid UUID key and changed raw',async()=>{
 const f=fixture(),j=createManualNutritionEvidenceJournal(f.storage);await j.append(entry(1,3));
 const prefix=`macrogoal:manual-nutrition-evidence:v1:${id(1)}:`,bad=prefix+'broken',valid=prefix+id(3),foreign=`macrogoal:manual-nutrition-evidence:v1:${id(9)}:broken`;
 f.map.set(bad,'raw');f.map.set(foreign,'raw');
 assert.equal(await j.discardInvalidKeyExact(id(1),valid,f.map.get(valid)),false);
 assert.equal(await j.discardInvalidKeyExact(id(1),foreign,'raw'),false);
 assert.equal(await j.discardInvalidKeyExact(id(1),bad,'stale'),false);assert.equal(f.map.get(bad),'raw');
 assert.equal(await j.discardInvalidKeyExact(id(1),bad,'raw'),true);assert.ok(await j.read(id(1),id(3)));assert.equal(f.map.get(foreign),'raw');
});
