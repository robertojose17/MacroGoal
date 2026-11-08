import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);const ts=require(process.env.BARCODE_RECOVERY_NODE_MODULES?process.env.BARCODE_RECOVERY_NODE_MODULES+'/typescript':'typescript');
const root=process.env.NUTRITION_CAPTURE_CANDIDATE_DIR?pathToFileURL(process.env.NUTRITION_CAPTURE_CANDIDATE_DIR+'/'):new URL('../supabase/functions/_shared/',import.meta.url);
let source=fs.readFileSync(new URL(process.env.NUTRITION_CAPTURE_CANDIDATE_DIR?'portionEndpoint.uuid.ts':'portionEndpoint.ts',root),'utf8').replace(/^import .*$/mg,'');
source=`const selectedSourceEnvelope=()=>({});const refreshCachedSelection=async()=>{throw Error('must not enrich UUID binding')};const readProviderJSON=async r=>r.json();const servicePortionCache=()=>({read:async()=>globalThis.fixtureEnvelope,write:async()=>{}});const resolvePortionsWithin=async(id,deps)=>({envelope:await deps.cache.read(id,new AbortController().signal),persisted:true});\n`+source;
const {handlePortionRequest}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64'));
const uuid='0963bb3b-f75f-415e-ade5-49b7f5f16bdb';
const snapshot={id:uuid,source:'usda',usda_fdc_id:'123',name:'Bananas, raw',macros_per:'100g',calories:89,protein:1,carbs:22,fat:0.3};
const envelope={version:1,provider:'usda',fdcId:'123',foodDescription:'Bananas, raw',portions:[{amount:1,grams:118,description:'medium banana'}]};
function admin(rows){let count=0;return {get count(){return count},auth:{getUser:async()=>({data:{user:{id:'owner'}}})},from(){throw Error('no catalog mutation or alternate lookup')},rpc(name,args){assert.equal(name,'read_food_search_snapshots_v1');assert.deepEqual(args.p_food_ids,[uuid]);const data=rows[Math.min(count++,rows.length-1)];return {abortSignal:async()=>({data})}}};}
const req=body=>new Request('https://example.invalid',{method:'POST',headers:{authorization:'Bearer test'},body:JSON.stringify({operation:'usda_portions_v1',...body})});
const safe=()=>[{id:uuid,snapshot:{...snapshot},protected:false}];
test('UUID-only exact unprotected snapshot returns correlated portions without provider or macros',async()=>{
 globalThis.fixtureEnvelope=envelope;globalThis.fetch=()=>{throw Error('must not fetch')};const a=admin([safe()]);const r=await handlePortionRequest(req({food_item_id:uuid}),a,{});const out=await r.json();assert.equal(r.status,200);assert.equal(out.food_item_id,uuid);assert.equal(out.fdc_id,'123');assert.equal(out.food_description,snapshot.name);assert.equal(out.binding_verified,true);assert.equal(out.portion_evidence.portions[0].grams,118);assert.equal(out.calories,undefined);assert.equal(a.count,2);
});
test('both IDs, malformed UUID and missing IDs rejected',async()=>{for(const body of [{food_item_id:uuid,fdc_id:'123'},{food_item_id:'bad'},{}])assert.equal((await handlePortionRequest(req(body),admin([safe()]),{})).status,400)});
test('protected/mismatching/multiple/non-USDA snapshot cannot start portion pipeline',async()=>{
 for(const rows of [[{...safe()[0],protected:true}],[{...safe()[0],id:'other'}],[safe()[0],safe()[0]],[{...safe()[0],snapshot:{...snapshot,source:'manual'}}]]){globalThis.fixtureEnvelope=envelope;const a=admin([rows]);const r=await handlePortionRequest(req({food_item_id:uuid}),a,{});assert.notEqual(r.status,200);assert.equal(a.count,1);assert.equal((await r.json()).portion_evidence,undefined);}
});
test('late correction or altered nutrition invalidates response',async()=>{
 for(const late of [[{...safe()[0],protected:true}],[{...safe()[0],snapshot:{...snapshot,calories:999}}]]){globalThis.fixtureEnvelope=envelope;const r=await handlePortionRequest(req({food_item_id:uuid}),admin([safe(),late]),{});assert.equal(r.status,409);assert.equal((await r.json()).portion_evidence,undefined);}
});
test('cached evidence for wrong FDC or description is not attached',async()=>{
 for(const wrong of [{...envelope,fdcId:'456'},{...envelope,foodDescription:'Banana chips'}]){globalThis.fixtureEnvelope=wrong;const r=await handlePortionRequest(req({food_item_id:uuid}),admin([safe()]),{});assert.equal(r.status,409);assert.equal((await r.json()).portion_evidence,undefined);}
});
