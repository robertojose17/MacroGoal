import test from 'node:test';
import assert from 'node:assert/strict';
import {captureUsdaPortions,readUsdaPortions,defaultUsdaPortion,portionGrams,nutritionForGrams} from '../supabase/functions/_shared/foodPortions.mjs';
const date='2026-11-03T00:00:00Z';
const food=(portions)=>({fdcId:123,description:'Fixture food, cooked',dataType:'Foundation',foodPortions:portions});
const p=(amount=1,gramWeight=118,modifier='medium')=>({id:456,amount,gramWeight,modifier});
test('exact FDC identity required; descriptions never resolve another preparation',()=>{
 assert.equal(captureUsdaPortions(food([p()]),124,date),null);
 const e=captureUsdaPortions(food([p()]),123,date);
 assert.deepEqual(readUsdaPortions(e,124),[]);
 assert.equal(e.foodDescription,'Fixture food, cooked');
 assert.equal(e.provider,'usda'); assert.equal(e.portions[0].sourcePortionId,'456');
});
test('captured grams scale immutable per100 basis without rounding or mutation',()=>{
 const original={calories:89,protein:1.09,carbs:22.8,fat:0.33,fiber:null};
 const saved=structuredClone(original);
 const e=captureUsdaPortions(food([p()]),123,date);
 const grams=portionGrams(defaultUsdaPortion(e,123),1);
 assert.equal(grams,118); assert.equal(nutritionForGrams(original,grams).calories,105.02);
 assert.deepEqual(original,saved);
});
test('fractional measures retain exact quantity and weight',()=>{
 const e=captureUsdaPortions(food([p(0.5,80,'cup')]),123,date);
 assert.equal(portionGrams(e.portions[0],0.5),80);
 assert.equal(portionGrams(e.portions[0],1),160);
});
test('multiple measures are preserved; no arbitrary first default',()=>{
 const e=captureUsdaPortions(food([p(),p(1,140,'large')]),123,date);
 assert.equal(readUsdaPortions(e,123).length,2);
 assert.equal(defaultUsdaPortion(e,123).grams,100);
});
test('missing or malformed measures fall back without invented food weights',()=>{
 for(const portions of [[],[p(0)],[p(1,0)],[p(1,NaN)],[p(1,100,'')]]){
  assert.equal(captureUsdaPortions(food(portions),123,date),null);
 }
 assert.equal(defaultUsdaPortion(null,123).grams,100);
 assert.equal(portionGrams(p(),1),null);
});
test('ambiguous or unsafe cache envelope is rejected as a whole',()=>{
 const e=captureUsdaPortions(food([p()]),123,date);
 assert.deepEqual(readUsdaPortions({...e,provider:'client'},123),[]);
 assert.deepEqual(readUsdaPortions({...e,portions:[{...e.portions[0],grams:-1}]},123),[]);
 assert.equal(captureUsdaPortions(food([p()]),123,'invalid'),null);
});
test('dedupe only identical measures; preserve different weights',()=>{
 const e=captureUsdaPortions(food([p(),p(),p(1,120)]),123,date);
 assert.equal(e.portions.length,2);
});
test('nutrient validation preserves unknowns and rejects negative values',()=>{
 assert.equal(nutritionForGrams({calories:-1},100),null);
 assert.equal(nutritionForGrams({calories:10},100).protein,null);
 assert.equal(nutritionForGrams({calories:10},0),null);
});

import {resolveExactPortions,resolvePortionsWithin,servicePortionCache} from '../supabase/functions/_shared/portionCache.mjs';
const dependencies=(overrides={})=>({now:()=>date,cache:{read:async()=>null,write:async()=>{}},fetchExactFood:async()=>food([p()]),...overrides});
test('cache hit bypasses provider; cache identity mismatch cannot leak another portion',async()=>{
 const e=captureUsdaPortions(food([p()]),123,date); let fetches=0;
 const dep=dependencies({cache:{read:async()=>e,write:async()=>{}},fetchExactFood:async()=>{fetches++;return food([p()]);}});
 assert.equal((await resolveExactPortions('123',dep)).persisted,true); assert.equal(fetches,0);
 assert.equal((await resolveExactPortions('124',dep)).envelope,null); assert.equal(fetches,1);
});
test('provider result is persisted with exact identity and retrieval provenance',async()=>{
 let saved;
 const dep=dependencies({cache:{read:async()=>null,write:async(key,value)=>{saved={key,value};}}});
 const result=await resolveExactPortions('123',dep);
 assert.equal(result.persisted,true); assert.equal(saved.key,'123'); assert.equal(saved.value.retrievedAt,new Date(date).toISOString());
});
test('write failure retains fetched evidence but never reports persisted',async()=>{
 const dep=dependencies({cache:{read:async()=>null,write:async()=>{throw Error('fixture');}}});
 const result=await resolveExactPortions('123',dep);
 assert.ok(result.envelope); assert.equal(result.persisted,false);
});
test('provider failure and wrong preparation ID never write cache',async()=>{
 let writes=0; const cache={read:async()=>null,write:async()=>{writes++;}};
 for(const fetchExactFood of [async()=>{throw Error('fixture');},async()=>({...food([p()]),fdcId:456})]){
  assert.equal((await resolveExactPortions('123',dependencies({cache,fetchExactFood}))).envelope,null);
 }
 assert.equal(writes,0);
});
test('whole operation timeout covers hung cache before provider call',async()=>{
 let fetches=0; const dep=dependencies({cache:{read:()=>new Promise(()=>{}),write:async()=>{}},fetchExactFood:async()=>{fetches++;return food([p()]);}});
 const result=await resolvePortionsWithin('123',dep,10);
 assert.equal(result.envelope,null); assert.equal(fetches,0);
});
test('aborted request cannot fetch or persist',async()=>{
 let reads=0; const controller=new AbortController(); controller.abort();
 const dep=dependencies({cache:{read:async()=>{reads++;},write:async()=>{throw Error('must not write');}}});
 assert.equal((await resolveExactPortions('123',dep,controller.signal)).persisted,false); assert.equal(reads,0);
});
test('service cache RPC error propagates instead of false persistence success',async()=>{
 const admin={rpc:()=>Promise.resolve({error:{message:'fixture'},data:null})};
 const cache=servicePortionCache(admin);
 await assert.rejects(()=>cache.write('123',captureUsdaPortions(food([p()]),123,date)),/PORTION_CACHE_WRITE/);
});
