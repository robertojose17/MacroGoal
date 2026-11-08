const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require(process.env.BARCODE_RECOVERY_NODE_MODULES+'/typescript');
const root=path.resolve(__dirname,'..'),plain=v=>JSON.parse(JSON.stringify(v));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function load(file,mocks={},globals={}) {
 const source=read(file),output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,m={exports:{}};
 vm.runInNewContext(output,{module:m,exports:m.exports,require(id){
  if(Object.hasOwn(mocks,id))return mocks[id];
  if(id.endsWith('.mjs'))return require(path.resolve(root,path.dirname(file),id));
  const local=id.startsWith('@/')?id.slice(2):id.startsWith('.')?path.join(path.dirname(file),id):null;
  if(local)return load(local.endsWith('.ts')?local:local+'.ts',mocks,globals);
  throw Error('Unexpected dependency '+id);
 },console:{log(){},warn(){},error(){}},setTimeout,clearTimeout,AbortController,...globals});return m.exports;
}
const portions=require('../supabase/functions/_shared/foodPortions.mjs'),adapter=load('utils/openFoodFacts.ts'),synthetic=load('utils/servingParser.ts'),selection=load('utils/catalogSelection.ts');
const evidence=(list=[{amount:1,gramWeight:158,modifier:'cup'}])=>portions.captureUsdaPortions({fdcId:123,description:'Rice, cooked',foodPortions:list},123,'2026-11-06T00:00:00Z');
const food=(extra={})=>({code:'123',_usda_fdc_id:'123',product_name:'Rice, cooked',serving_quantity:100,serving_size:'100 g',nutriments:{'energy-kcal_100g':130,proteins_100g:3,carbohydrates_100g:28,fat_100g:0.3},...extra});
test('exact FDC/preparation match required; original objects remain unchanged',()=>{
 const e=evidence(),p=food(),before=structuredClone(p);assert.equal(adapter.normalizeUsdaProduct({...p,_portion_evidence:e}).serving_quantity,158);assert.deepEqual(p,before);
 assert.equal(adapter.normalizeUsdaProduct({...p,_usda_fdc_id:'124',_portion_evidence:e}).serving_quantity,100);
 assert.equal(adapter.normalizeUsdaProduct({...p,product_name:'Rice, raw',_portion_evidence:e}).serving_quantity,100);
});
test('multiple measures fall back100g but preserve each evidence-backed choice',()=>{
 const e=evidence([{amount:0.5,gramWeight:79,modifier:'cup'},{amount:1,gramWeight:15,modifier:'tablespoon'}]);
 assert.equal(adapter.normalizeUsdaProduct(food({_portion_evidence:e})).serving_quantity,100);assert.equal(portions.readUsdaPortions(e,'123').length,2);assert.equal(portions.portionGrams(e.portions[0],1),158);
});
test('portion units retain provider measurement and preparation text',()=>{
 const e=evidence([{amount:1,gramWeight:70,measureUnit:{name:'cup'},modifier:'chopped'}]);assert.equal(e.portions[0].description,'cup, chopped');
});
test('new nutrient math uses immutable per100 and exact fractional gram basis',()=>{
 const p=food({serving_size:'3 pieces (100 g)',serving_quantity:100,nutriments:{'energy-kcal_100g':300,'energy-kcal_serving':999}});
 const s=adapter.extractServingSize(p);assert.equal(s.grams,100/3);assert.equal(adapter.extractNutritionPerServing(p,s.grams).calories,100);
 const fractional=food({serving_size:'1 piece (33.333333333333336 g)',serving_quantity:100/3});assert.equal(adapter.extractServingSize(fractional).grams,100/3);
});
test('non-USDA barcode products preserve existing provider serving facts',()=>{
 const p=food({_usda_fdc_id:undefined,serving_size:'1 package (42.5 g)',serving_quantity:42.5});assert.equal(adapter.normalizeUsdaProduct(p),p);
});
test('confirmed lookup correction retains20g and60kcal despite USDA identifier',()=>{
 const row={id:'canonical',name:'Rice, cooked',barcode:'012345678905',usda_fdc_id:'123',calories:60,protein:2,carbs:10,fat:1,serving_size:20,serving_description:'serving',macros_per:'serving',ai_verified:true,ai_verified_source:'barcode_recovery:source_label',source:'user'};
 const p=synthetic.buildSyntheticOffData(row);assert.equal(p.serving_quantity,20);assert.equal(p._serving_authority,'confirmed_correction');assert.equal(adapter.normalizeUsdaProduct(p),p);assert.equal(adapter.extractNutritionPerServing(p,20).calories,60);
});
test('explicit recovery confirm preserves serving even without row marker',()=>{
 const p=synthetic.buildSyntheticOffData({name:'Rice, cooked',usda_fdc_id:'123',calories:60,serving_size:20,macros_per:'serving'},{preserveServing:true});assert.equal(p.serving_quantity,20);assert.equal(adapter.normalizeUsdaProduct(p).serving_quantity,20);
});
test('package identity rejects FDC/internal codes and preserves genuine zero-prefixed GTIN',()=>{
 for(const p of [{code:'123',_usda_fdc_id:'123'},{code:'12345678',_usda_fdc_id:'12345678'},{code:'usda_123'},{code:'11111111-1111-4111-8111-111111111111'}])assert.equal(selection.catalogPackageBarcode(p),null);
 assert.equal(selection.catalogPackageBarcode({code:'012345678905',_usda_fdc_id:'123'}),'012345678905');
});
test('numeric FDC is normalized safely; malformed/unsafe identifiers rejected',()=>{
 assert.equal(selection.exactFdcId(123),'123');assert.equal(adapter.normalizeUsdaProduct(food({_usda_fdc_id:123}))._usda_fdc_id,'123');
 for(const x of [NaN,Infinity,1.2,Number.MAX_SAFE_INTEGER+1,'abc','123.0'])assert.equal(selection.exactFdcId(x),null);
});
test('new saved portion roundtrip uses exact quantity and grams, never240g cup density',()=>{
 for(const [q,g] of [[1,158],[0.5,79],[3,100]]){
  const marker=selection.savedPortionSnapshot('cup',q,g),parsed=selection.readSavedPortion(marker,q,g);assert.equal(parsed.gramsPerUnit*q,g);
  assert.match(selection.portionDescription(parsed.description,q,g),/cup .*g/);assert.equal(selection.readSavedPortion(marker,q,g+1),null);
 }
 assert.equal(selection.readSavedPortion(null,1,158),null);
});
test('manual recovery canonical row and20g Add/edit basis stay60kcal',()=>{
 const {manualRecoveryProduct}=load('utils/manualRecoveryProduct.ts');const p=manualRecoveryProduct({name:'Manual',brand:'Brand',servingAmount:'20',servingUnit:'g',calories:'60',protein:'2',carbs:'6',fats:'3',fiber:'0'});
 const values={foodName:'Manual',brand:'Brand',servingAmount:'20',servingUnit:'g',calories:'60',protein:'2',carbs:'6',fats:'3',fiber:'0',recoveryProduct:p,user:{id:'owner'}};
 const source=read('app/my-foods-create.tsx'),start=source.indexOf('      const payload = {'),end=source.indexOf('\n\n',start);
 const code=source.slice(start,end).replace('const payload =','globalThis.payload =');vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,values);
 assert.equal(values.payload.serving_amount,100);assert.equal(values.payload.calories,300);assert.equal(p.serving_quantity,20);assert.equal(values.payload.calories*20/100,60);
 assert.equal(adapter.extractNutritionPerServing(p,20).calories,60);assert.equal(values.payload.user_created,true);assert.equal(values.payload.barcode,undefined);
});
function client(fetcher,cache=null){const writes=[],api=load('utils/foodSearchHybrid.ts',{'./foodSearchCache':{getLocalCache:async()=>cache,setLocalCache:async(q,p)=>writes.push([q,p])},'@/lib/supabase/client':{SUPABASE_PROJECT_URL:'https://fixture.invalid',supabasePublicKey:'fixture-public'}},{fetch:fetcher});return {api,writes};}
test('aborted search never calls fetch',async()=>{let calls=0;const f=client(async()=>{calls++;});const c=new AbortController();c.abort();await assert.rejects(f.api.fetchSearchResponse('rice',c.signal));assert.equal(calls,0);});
test('search deadline covers stalled response body',async()=>{const f=client(async()=>({ok:true,json:()=>new Promise(()=>{})}));await assert.rejects(f.api.fetchSearchResponse('rice',undefined,5),/SEARCH_TIMEOUT/);});
test('complete empty server response replaces cache and can cache empty result',async()=>{const f=client(async()=>({ok:true,json:async()=>({products:[],status:'complete',ranking_version:'food-v2'})}),[food()]);let local,server;await f.api.hybridSearch('rice',{onLocalCacheHit:p=>local=p,onSupabaseHit:p=>server=p});assert.equal(local.length,1);assert.deepEqual(plain(server),[]);assert.deepEqual(plain(f.writes),[['rice',[]]]);});
test('partial results are reported but never cached',async()=>{const f=client(async()=>({ok:true,json:async()=>({products:[food()],status:'partial',ranking_version:'food-v2'})}));let issue;await f.api.hybridSearch('rice',{onError:(_stage,e)=>issue=e.message});assert.equal(issue,'SEARCH_PARTIAL');assert.equal(f.writes.length,0);});
test('selected USDA capture requests canonical ID and uses returned exact UUID',async()=>{
 const fixtureSession={user:{id:'owner'},access_token:'header.'+Buffer.from(JSON.stringify({session_id:'22222222-2222-4222-8222-222222222222'})).toString('base64url')+'.signature'};
 const requests=[],api=load('utils/foodSearchUtils.ts',{'@/lib/supabase/client':{supabase:{auth:{getSession:async()=>({data:{session:fixtureSession},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},functions:{invoke:async(_name,p)=>{requests.push(p.body);return {data:{fdc_id:'123',food_item_id:'11111111-1111-4111-8111-111111111111'}};}}}}});
 const outcome=await api.persistUsdaSelection(food({_usda_fdc_id:123}));assert.equal(outcome.status,'persisted');assert.equal(outcome.foodItemId,'11111111-1111-4111-8111-111111111111');assert.deepEqual(plain(requests),[{operation:'usda_portions_v1',fdc_id:'123'}]);
 assert.equal((await api.persistUsdaSelection(food({_serving_authority:'confirmed_correction'}))).status,'not_applicable');assert.equal(requests.length,1);
});
test('cache namespace is versioned; expired/future/corrupt entries fail closed',async()=>{
 for(const entry of [{products:[food()],timestamp:0},{products:[food()],timestamp:Date.now()+1e9},{products:{},timestamp:Date.now()}]){
  const keys=[],api=load('utils/foodSearchCache.ts',{'@react-native-async-storage/async-storage':{getItem:async k=>{keys.push(k);return JSON.stringify(entry);},removeItem:async()=>{}}});assert.equal(await api.getLocalCache(' Rice '),null);assert.match(keys[0],/^@food_search_cache:v3-review:rice$/);
 }
});
test('actual source wires guards into save/favorite, exact custom row and recipe paths',()=>{
 const detail=read('components/FoodDetailsLayout.tsx'),add=read('app/add-food.tsx');
 assert.match(detail,/const foodBarcode = catalogPackageBarcode\(product\)/);assert.match(detail,/const barcode = catalogPackageBarcode\(prod\)/);assert.match(detail,/legacyFavorite \? 'barcode' : foodSource/);
 assert.match(detail,/eq\('id',product\._manual_food_id\)\.eq\('created_by',user.id\)/);assert.match(detail,/manualFoodId \? \{data:\{id:manualFoodId\}/);assert.match(detail,/off_data: saveOffData/);
 assert.match(detail,/mode!=='edit'&&!itemId&&product&&product\._serving_authority!=='confirmed_correction'/);assert.match(detail,/usdaPortionOptions\(readProductPracticalPortions\(product\)/);assert.match(detail,/setNumberOfServings\(String\(rawQuantity\)\)/);assert.match(detail,/grams: totalGrams,/);
 assert.match(add,/const selection = await persistUsdaSelection\(product\)/);assert.match(add,/selection.status === 'persisted' \? selection.foodItemId : undefined/);assert.match(add,/product\._db_id \|\| capturedFoodItemId/);assert.match(add,/barcode: packageBarcode/);
});
test('ordinary detail use cannot overwrite existing canonical catalog nutrition',()=>{
 const source=read('components/FoodDetailsLayout.tsx'),part=source.slice(source.indexOf('  const upsertFoodItem ='),source.indexOf('  const handleSave ='));
 assert.doesNotMatch(part,/\.update\(|\.upsert\(/);assert.match(part,/eq\('usda_fdc_id',prod\._usda_fdc_id\)/);assert.match(part,/if \(!barcode\) return null/);
});

