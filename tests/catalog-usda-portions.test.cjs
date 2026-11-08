const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require(process.env.BARCODE_RECOVERY_NODE_MODULES?process.env.BARCODE_RECOVERY_NODE_MODULES+'/typescript':'typescript');
const artifacts=process.env.NUTRITION_CLIENT_ARTIFACTS==='1';
const root=artifacts?__dirname:path.resolve(__dirname,'..');
function load(source,require,extra={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require,console,...extra});return m.exports;}
const shared=load(fs.readFileSync(path.join(root,artifacts?'foodPortions.github-ff43e511.mjs':'supabase/functions/_shared/foodPortions.mjs'),'utf8'),()=>{});
const id='0963bb3b-f75f-415e-ade5-49b7f5f16bdb';
const envelope=shared.captureUsdaPortions({fdcId:173944,description:'Bananas, raw',foodPortions:[{amount:1,gramWeight:118,modifier:'medium'}]},'173944','2026-11-08T00:00:00Z');
function harness(){let owner={userId:'a',epoch:'one'},respond=async body=>({data:{food_item_id:body.food_item_id,fdc_id:'173944',binding_verified:true,food_description:'Bananas, raw',portion_evidence:envelope}});const calls=[],timers=new Set();
 const api=load(fs.readFileSync(path.join(root,artifacts?'catalogUsdaPortions.cached-read-fix.ts':'utils/catalogUsdaPortions.ts'),'utf8'),name=>name.includes('foodPortions')?shared:{selectedNutritionScope:async()=>owner,invokeSelectedNutritionCapture:async(o,b)=>{calls.push(b);return respond(b);}}, {setTimeout:cb=>{timers.add(cb);return cb;},clearTimeout:cb=>timers.delete(cb)});
 return {...api,calls,owner:v=>owner=v,respond:v=>respond=v,expire:()=>{for(const f of [...timers])f();}};
}
test('UUID-only request uses exact server identity/evidence and coalesces concurrent opens',async()=>{const h=harness();const [a,b]=await Promise.all([h.resolveCatalogUsdaPortions(id),h.resolveCatalogUsdaPortions(id)]);assert.equal(a.fdcId,'173944');assert.equal(a.foodItemId,id);assert.equal(b.portionEvidence.portions[0].grams,118);assert.equal(h.calls.length,1);assert.deepEqual({...h.calls[0]},{operation:'usda_portions_v1',food_item_id:id});});
test('server binding, UUID, FDC, description and portion envelope mismatches all fail closed',async()=>{for(const patch of [{binding_verified:false},{food_item_id:'00000000-0000-4000-8000-000000000000'},{fdc_id:'171689'},{food_description:'Apples'},{portion_evidence:null}]){const h=harness();h.respond(async()=>({data:{food_item_id:id,fdc_id:'173944',binding_verified:true,food_description:'Bananas, raw',portion_evidence:envelope,...patch}}));assert.equal(await h.resolveCatalogUsdaPortions(id),null);}});
test('missing auth and invalid UUID never dispatch',async()=>{const h=harness();assert.equal(await h.resolveCatalogUsdaPortions('173944'),null);h.owner(null);assert.equal(await h.resolveCatalogUsdaPortions(id),null);assert.equal(h.calls.length,0);});
test('owner changes discard pending evidence',async()=>{const h=harness();let release;h.respond(()=>new Promise(r=>release=r));const p=h.resolveCatalogUsdaPortions(id);while(!release)await Promise.resolve();h.owner({userId:'b',epoch:'two'});release({data:{food_item_id:id,fdc_id:'173944',binding_verified:true,food_description:'Bananas, raw',portion_evidence:envelope}});assert.equal(await p,null);});
test('deadline keeps fallback and reserves uncertain request against reentry',async()=>{const h=harness();h.respond(()=>new Promise(()=>{}));const p=h.resolveCatalogUsdaPortions(id);while(!h.calls.length)await Promise.resolve();h.expire();assert.equal(await p,null);const again=h.resolveCatalogUsdaPortions(id);await Promise.resolve();h.expire();assert.equal(await again,null);assert.equal(h.calls.length,1);});
test('acknowledged success LRU permits more than128 distinct opens',async()=>{const h=harness();for(let n=1;n<=150;n++){const key='0963bb3b-f75f-415e-ade5-'+String(n).padStart(12,'0');assert.ok(await h.resolveCatalogUsdaPortions(key));}assert.equal(h.calls.length,150);});
test('uncertain ceiling stays bounded but new auth epoch has its own budget',async()=>{const h=harness();h.respond(async()=>{throw Error('lost')});for(let n=1;n<=129;n++)assert.equal(await h.resolveCatalogUsdaPortions('0963bb3b-f75f-415e-ade5-'+String(n).padStart(12,'0')),null);assert.equal(h.calls.filter(c=>c.operation==='usda_portions_v1').length,128);h.owner({userId:'b',epoch:'two'});await h.resolveCatalogUsdaPortions(id);assert.equal(h.calls.filter(c=>c.operation==='usda_portions_v1').length,129);});

test('real USDA source portion fixtures preserve banana and skinless-apple variant weights',()=>{
 const preferred=load(fs.readFileSync(path.join(root,artifacts?'preferredUsdaPortion.proposal.ts':'utils/preferredUsdaPortion.ts'),'utf8'),()=>shared).preferredUsdaPortion;
 // Exact fields from USDA detail173944 and171689 fetched2026-11-08. No inferred apple average.
 for(const food of [
  {fdcId:173944,description:'Bananas, raw',foodPortions:[{id:93515,amount:1,gramWeight:118,modifier:'medium (7" to 7-7/8" long)',measureUnit:{name:'undetermined'}}]},
  {fdcId:171689,description:'Apples, raw, without skin',foodPortions:[{id:89199,amount:1,gramWeight:161,modifier:'medium (3" dia)',measureUnit:{name:'undetermined'}}]}
 ]){const e=shared.captureUsdaPortions(food,String(food.fdcId),'2026-11-08T00:00:00Z');const p=preferred({_usda_fdc_id:String(food.fdcId),product_name:food.description,_portion_evidence:e},'view');assert.equal(p.gramsPerUnit,food.foodPortions[0].gramWeight);assert.match(p.description,/medium/);assert.equal(preferred({_usda_fdc_id:String(food.fdcId),product_name:'Different variant',_portion_evidence:e},'view'),null);}
});

test('expired initial wait retains original late success for later details without retransmission',async()=>{
 const h=harness();let release;h.respond(()=>new Promise(r=>release=r));const first=h.resolveCatalogUsdaPortions(id);while(!h.calls.length)await Promise.resolve();h.expire();assert.equal(await first,null);
 release({data:{food_item_id:id,fdc_id:'173944',binding_verified:true,food_description:'Bananas, raw',portion_evidence:envelope}});
 for(let i=0;i<20;i++)await Promise.resolve();const later=await h.resolveCatalogUsdaPortions(id);assert.equal(later.fdcId,'173944');assert.equal(later.portionEvidence.portions[0].grams,118);assert.equal(h.calls.length,1);
});
test('background and details share same original completion after initial deadline',async()=>{
 const h=harness();let release;h.respond(()=>new Promise(r=>release=r));const first=h.resolveCatalogUsdaPortions(id);while(!h.calls.length)await Promise.resolve();h.expire();assert.equal(await first,null);
 const background=h.resolveCatalogUsdaPortions(id,'background');release({data:{food_item_id:id,fdc_id:'173944',binding_verified:true,food_description:'Bananas, raw',portion_evidence:envelope}});assert.equal((await background).fdcId,'173944');assert.equal(h.calls.length,1);
});

test('completed lost original response recovers cached exact portion without provider replay',async()=>{
 const h=harness();h.respond(async b=>{if(b.operation==='usda_portions_v1')throw Error('lost after cachewrite');return {data:{food_item_id:id,fdc_id:'173944',binding_verified:true,food_description:'Bananas, raw',portion_evidence:envelope,cache_only:true,cached:true}};});
 const result=await h.resolveCatalogUsdaPortions(id);assert.equal(result.fdcId,'173944');assert.deepEqual(h.calls.map(x=>x.operation),['usda_portions_v1','usda_portions_cached_v1']);await h.resolveCatalogUsdaPortions(id);assert.equal(h.calls.length,2);
});
test('later explicit open may reread completed cache miss but never reissues original provider operation',async()=>{
 const h=harness();h.respond(async()=>({data:{cache_only:true,cached:false,portion_evidence:null}}));assert.equal(await h.resolveCatalogUsdaPortions(id),null);
 h.respond(async()=>({data:{food_item_id:id,fdc_id:'173944',binding_verified:true,food_description:'Bananas, raw',portion_evidence:envelope,cache_only:true,cached:true}}));assert.equal((await h.resolveCatalogUsdaPortions(id)).fdcId,'173944');assert.equal(h.calls.filter(x=>x.operation==='usda_portions_v1').length,1);assert.equal(h.calls.filter(x=>x.operation==='usda_portions_cached_v1').length,2);
});
test('read-only fallback requires explicit cache flags and the same binding validation',async()=>{
 for(const patch of [{cache_only:false},{cached:false},{food_item_id:'wrong'},{binding_verified:false},{fdc_id:'171689'}]){const h=harness();h.respond(async b=>b.operation==='usda_portions_v1'?{error:true}:{data:{food_item_id:id,fdc_id:'173944',binding_verified:true,food_description:'Bananas, raw',portion_evidence:envelope,cache_only:true,cached:true,...patch}});assert.equal(await h.resolveCatalogUsdaPortions(id),null);assert.equal(h.calls.filter(x=>x.operation==='usda_portions_v1').length,1);}
});
