import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import fs from 'node:fs';import {createRequire} from 'node:module';
const root=process.env.NUTRITION_CAPTURE_CANDIDATE_DIR?pathToFileURL(process.env.NUTRITION_CAPTURE_CANDIDATE_DIR+'/'):new URL('../supabase/functions/_shared/',import.meta.url);
const {readCatalogPortionSource:read}=await import(new URL('catalogPortionEvidence.mjs',root));
const {attachCatalogPortionSources:attach}=await import(new URL('catalogPortionBatch.mjs',root));
const {decorateCatalogScanItem:scan}=await import(new URL('catalogPortionBatch.mjs',root));
const {SEARCH_SNAPSHOT_FIELDS}=await import(new URL('searchHydration.mjs',root));
const id='11111111-1111-4111-8111-111111111111';
const row={...Object.fromEntries(SEARCH_SNAPSHOT_FIELDS.map(k=>[k,null])),id,source:'openfoodfacts',barcode:'024126018312',name:'Bread',macros_per:'100g',serving_unit:'g',serving_size:28,calories:125,protein:10,carbs:30,fat:2};
const source={provider:'openfoodfacts',source_id:'0024126018312',retrieved_at:'2026-11-08T00:00:00Z',serving_source:{code:'0024126018312',product_name:'Bread',serving_size:'2 slices (56 g)',serving_quantity:56,serving_quantity_unit:'g'}};
const entry={id,snapshot:row,protected:false,food_revision:0,portion_source:source};
const map=(r,p)=>({_db_id:r.id,product_name:r.name,serving_quantity:r.serving_size,...(p?{_serving_authority:'confirmed_correction'}:{})});
function admin(rows){const calls=[];return {calls,rpc:(name,args)=>{calls.push({name,args});assert.equal(name,'read_catalog_portion_sources_v1');return {abortSignal:async()=>({data:rows})}}};}
test('OFF count and mass remain exact, without fabricating household serving',()=>{
 const p=read(row,source)._practical_portion_evidence.portions[0];assert.equal(p.amount,2);assert.equal(p.grams,56);assert.equal(p.description,'slices');
 for(const patch of [{serving_size:'28.0g'},{serving_size:'2 slices (30 g)'},{serving_quantity_unit:'ml'},{product_name:'Other Bread'},{preparation:'prepared'},{serving_size:'1 ml (56 g)'}])assert.equal(read(row,{...source,serving_source:{...source.serving_source,...patch}}),null);
 assert.equal(read({...row,barcode:'0024126018756'},source),null);
});
test('all UUID rows receive one batch read, including prior authority timeout rows',async()=>{
 const id2='22222222-2222-4222-8222-222222222222';const a=admin([entry,{...entry,id:id2,snapshot:{...row,id:id2}}]);
 const out=await attach([{_db_id:id},{_db_id:id2}],a,map);assert.equal(a.calls.length,1);assert.deepEqual(a.calls[0].args.p_food_ids,[id,id2]);assert.equal(out.filter(p=>p._practical_portion_evidence).length,2);assert.equal(out[0]._portion_source_revision,0);assert.equal(out[0]._practical_portion_evidence.food_revision,0);
});
test('explicit fraction/no-space household counts use label gram proof, not density',()=>{
 for(const [label,grams,count,description] of [['1/4 cup (31g)',31,.25,'cup'],['2tbsp (32g)',32,2,'tbsp'],['.5 cup, chopped (45 g)',45,.5,'cup, chopped']]){
  const p=read(row,{...source,serving_source:{...source.serving_source,serving_size:label,serving_quantity:grams,serving_quantity_unit:null}})._practical_portion_evidence.portions[0];assert.equal(p.amount,count);assert.equal(p.grams,grams);assert.equal(p.description,description);
 }
 for(const label of ['1/0 cup (56g)','0 cup (56g)','1/4 cup','1 cup (56ml)','1 cup (56g) or 2 tbsp (56g)','1 cup (56g) prepared'])assert.equal(read(row,{...source,serving_source:{...source.serving_source,serving_size:label,serving_quantity_unit:null}}),null);
});
test('current corrections are preserved without attaching stale provider portions',async()=>{
 const out=await attach([{_db_id:id}],admin([{...entry,protected:true,snapshot:{...row,serving_size:42}}]),map);assert.equal(out[0].serving_quantity,42);assert.equal(out[0]._serving_authority,'confirmed_correction');assert.equal(out[0]._practical_portion_evidence,undefined);
});
test('duplicate, malformed, absent source and wrong variant fail closed',async()=>{
 const original={_db_id:id};for(const rows of [[entry,entry],[{...entry,food_revision:null}],[{...entry,snapshot:{...row,id:'wrong'}}]])assert.equal((await attach([original],admin(rows),map))[0],original);
 for(const sourcePatch of [null,{...source,source_id:'0024126018756'}])assert.equal((await attach([original],admin([{...entry,portion_source:sourcePatch}]),map))[0]._practical_portion_evidence,undefined);
});
test('noncooperative batch cannot extend bounded wait or fetch providers',async()=>{
 const original={_db_id:id};let calls=0;const out=await attach([original],{rpc(){calls++;return {abortSignal:()=>new Promise(()=>{})}}},map,1);assert.equal(out[0],original);assert.equal(calls,1);
});
test('USDA exact FDC and name required, measured apple161g never legacy182',()=>{
 const apple={...row,source:'usda',usda_fdc_id:'171689',name:'Apples, raw, without skin',serving_size:182};const envelope={version:1,provider:'usda',fdcId:'171689',foodDescription:apple.name,retrievedAt:'2026-11-08T00:00:00Z',portions:[{amount:1,grams:161,description:'medium'}]};
 const s={provider:'usda',source_id:'171689',portion_evidence:envelope};assert.equal(read(apple,s)._portion_evidence.portions[0].grams,161);assert.equal(read(apple,{...s,source_id:'173944'}),null);assert.equal(read(apple,{...s,portion_evidence:{...envelope,foodDescription:'Apples with skin'}}),null);
});
test('scan preserves micros and immutable macros, attaching source only to same current tuple',async()=>{
 const item={...row,vitamin_d:4.2};const out=await scan(item,admin([entry]));assert.equal(out.vitamin_d,4.2);assert.equal(out.calories,item.calories);assert.equal(out._portion_source_revision,0);assert.equal(out._practical_portion_evidence.portions[0].amount,2);
 const changed=await scan(item,admin([{...entry,snapshot:{...row,calories:999}}]));assert.equal(changed._practical_portion_evidence,undefined);assert.equal(changed.calories,item.calories);
 const protectedOut=await scan(item,admin([{...entry,protected:true}]));assert.equal(protectedOut._serving_authority,'confirmed_correction');assert.equal(protectedOut._practical_portion_evidence,undefined);
});
test('actual search handler clears uncertain identity only after valid atomic batch and preserves correction gate',async()=>{
 const require=createRequire(import.meta.url),ts=require(process.env.BARCODE_RECOVERY_NODE_MODULES?process.env.BARCODE_RECOVERY_NODE_MODULES+'/typescript':'typescript');
 const candidate=!!process.env.NUTRITION_CAPTURE_CANDIDATE_DIR;
 const read=p=>fs.readFileSync(new URL(p,root),'utf8');
 const data=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
 const core=read(candidate?'search-type-contract-review/supabase/functions/search-foods/searchCore.ts':'../search-foods/searchCore.ts');
 let source=read(candidate?'search-foods.practical-batch.ts':'../search-foods/index.ts');
 source=source.replace(/import "jsr:[^"]+";/g,'').replace("import { createClient } from 'jsr:@supabase/supabase-js@2';",'const createClient=()=>globalThis.__catalogPortionTestAdmin;').replace("'./searchCore.ts'",JSON.stringify(data(core))).replace(/(['"])\.\.\/_shared\/([^'"]+)\1/g,(_,q,file)=>JSON.stringify(new URL(file,root).href));
 const previousDeno=globalThis.Deno,previousFetch=globalThis.fetch;
 try{
  globalThis.Deno={env:{get:()=>''},serve(){}};globalThis.fetch=()=>{throw Error('provider prohibited')};
  const {handleSearch}=await import(data(source));
  for(const mode of ['valid','malformed','protectedVolume']){
   const calls=[];globalThis.__catalogPortionTestAdmin={rpc(name,args){calls.push(name);return {abortSignal:async()=>({data:name==='search_food_catalog_v2'?[row]:name==='read_food_search_snapshots_v1'?[]:name==='read_catalog_portion_sources_v1'?[mode==='valid'?entry:mode==='malformed'?{...entry,food_revision:null}:{...entry,protected:true,snapshot:{...row,serving_unit:'ml'}}]:[]})}}};
   const r=await handleSearch(new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify({query:'Bread',review_capability:'label_confirmation_v1'})})),body=await r.json();assert.equal(r.status,200);assert.equal(body.products.length,1);const product=body.products[0];
   assert.equal(calls.filter(n=>n==='read_catalog_portion_sources_v1').length,1);
   if(mode==='valid'){assert.equal(product._practical_portion_evidence.food_revision,0);assert.equal(product._portion_source_revision,0);}
   else assert.equal(product._practical_portion_evidence,undefined);
   if(mode==='protectedVolume')assert.equal(product.requires_label_confirmation,true);
  }
 }finally{globalThis.Deno=previousDeno;globalThis.fetch=previousFetch;delete globalThis.__catalogPortionTestAdmin;}
});
