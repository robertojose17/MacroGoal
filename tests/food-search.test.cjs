const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const plain = value => JSON.parse(JSON.stringify(value));
function load(file, mocks = {}, globals = {}) {
  const source = fs.readFileSync(file,'utf8');
  const output = ts.transpileModule(source,{ compilerOptions: { module: ts.ModuleKind.CommonJS,target: ts.ScriptTarget.ES2022,esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(output,{ exports,module: { exports },require(id) {
    if (Object.hasOwn(mocks,id)) return mocks[id];
    throw new Error('Unexpected dependency: ' + id);
  },console: { log() {},warn() {},error() {} },setTimeout,clearTimeout,AbortController,Request,Response,...globals },{ filename: file });
  return exports;
}
const core = load('supabase/functions/search-foods/searchCore.ts');
const food = (name, extra = {}) => ({ product_name: name,brands: '',code: name,
  serving_size: '100 g',serving_quantity: '100',nutriments: { 'energy-kcal_100g': 100,'proteins_100g': 10,'carbohydrates_100g': 0,'fat_100g': 2 },...extra });
const raw = food('Chicken, breast, boneless, skinless, raw',{ _db_id: 'raw-chicken' });
const roasted = food('Chicken, broilers or fryers, breast, meat only, cooked, roasted');
const fried = food('Chicken, breast, fried');
const apple = food('Apples, raw, without skin');
const banana = food('Bananas, raw');
const pineapple = food('Pineapple, raw, all varieties');
for (const [query,product,expected] of [
  ['chicken breast',raw,true],['chicken breast raw',raw,true],['chicken breast cooked',roasted,true],
  ['chicken breast fried',fried,true],['chicken breast fried',raw,false],
  ['Tyson chicken breast',food('Chicken breast',{ brands: 'Tyson' }),true],
  ['Tyson chicken breast',raw,false],['apple',apple,true],['apple',pineapple,false],
  ['pineapple',pineapple,true],['banana',banana,true],['manzana',apple,true],
  ['manzana',food('Manzana roja'),true],['pechuga',raw,true],['pechuga de pollo',raw,true],
  ['pechuga',food('Pechuga de pollo cruda'),true],['piña',pineapple,true],
  ['special apple',food('Other display name',{ generic_name: 'Special apple' }),true],
  ['chicken breast',food('Alternate label',{ _db_row: { name: 'Chicken, breast' } }),true],
]) test('word matching: ' + query + ' / ' + product.product_name,() => assert.equal(core.matches(product,query),expected));

test('original language and normalized USDA intent are both retained',() => {
  assert.deepEqual(plain(core.queryVariants('Manzana')),['manzana','apple']);
  assert.deepEqual(plain(core.queryVariants('pechuga de pollo')),['pechuga de pollo','chicken breast']);
});
test('blank display names fall through and food-head identity rejects composites',() => {
  assert.equal(core.productName({ product_name: ' ',name: 'Bananas, raw' }),'Bananas, raw');
  for (const name of ['Muffins, apple','APPLEBEE’S, chili','Pineapple frozen novelty','Chicken, breast, stuffed','Bananas, powder']) {
    assert.equal(core.isBasic(food(name),name.includes('Chicken') ? 'chicken breast' : name.includes('Bananas') ? 'banana' : name.includes('Pineapple') ? 'pineapple' : 'apple'),false,name);
  }
  assert.equal(core.isBasic(raw,'chicken breast'),true);
  assert.equal(core.isBasic(fried,'chicken breast'),false);
  assert.equal(core.isBasic(food('Any alias',{ _db_row: { _search_basic: false } }),'any'),false);
});
test('negative or malformed core nutrition cannot satisfy the fast path',() => {
  assert.equal(core.hasNutrition(food('Chicken',{ nutriments: { 'energy-kcal_100g': 100,'carbohydrates_100g': -0.428 } })),false);
  assert.equal(core.hasNutrition(food('Chicken',{ nutriments: { 'energy-kcal_100g': 'NaN' } })),false);
});
function providers(db = [],usda = [],off = []) {
  const calls = [];
  return { calls,providers: Object.fromEntries(Object.entries({ db,usda,off }).map(([name,value]) => [name,async (query,signal) => { calls.push(name); return typeof value === 'function' ? value(query,signal) : value; }])) };
}
test('usable DB basics return without calling external providers',async () => {
  const p = providers([raw]); const result = await core.searchCatalog('chicken breast',30,p.providers);
  assert.deepEqual(p.calls,['db']); assert.equal(result.count,1); assert.equal(result.status,'complete');
});
test('30 branded or fried DB rows cannot truncate the plain USDA fallback',async () => {
  const db = Array.from({length:30},(_,i) => food('Chicken breast fried ' + i,{ brands: 'Brand ' + i,_db_id: 'db-' + i }));
  const p = providers(db,[raw]); const result = await core.searchCatalog('chicken breast',30,p.providers);
  assert.deepEqual(p.calls,['db','usda']); assert.equal(result.products[0].product_name,raw.product_name); assert.equal(result.count,30);
});
test('explicit brand and preparation intent can use DB directly',async () => {
  for (const [query,product] of [['Tyson chicken breast',food('Chicken breast',{brands:'Tyson'})],['chicken breast fried',fried]]) {
    const p = providers([product]); await core.searchCatalog(query,30,p.providers); assert.deepEqual(p.calls,['db']);
  }
});
test('OFF is never padding for short relevant results',async () => {
  const p = providers([], [apple],[food('Apple candy')]); await core.searchCatalog('apple',30,p.providers);
  assert.deepEqual(p.calls,['db','usda']);
});
test('OFF runs last only after both earlier sources lack usable matches',async () => {
  const p = providers([pineapple],[],[apple]); const r = await core.searchCatalog('apple',30,p.providers);
  assert.deepEqual(p.calls,['db','usda','off']); assert.equal(r.count,1);
});
test('whole provider operations time out even when their promise ignores abort',async () => {
  let signal; const p = providers((q,s) => {signal=s; return new Promise(() => {});},[],[apple]);
  const start = Date.now(); const r = await core.searchCatalog('apple',30,p.providers,{db:10,usda:10,off:10});
  assert.ok(Date.now()-start<500); assert.equal(signal.aborted,true); assert.equal(r.status,'partial'); assert.equal(r.count,1);
});
test('dedupe keeps preparation variants and explicit DB authority on shared FDC conflicts',() => {
  const db = food('Chicken raw',{_db_id:'db',_usda_fdc_id:'123',nutriments:{'energy-kcal_100g':106}});
  const usda = food('Chicken raw',{_source:'usda',_usda_fdc_id:'123',nutriments:{'energy-kcal_100g':999}});
  const r = core.mergeProducts([[db],[usda,roasted]],30);
  assert.equal(r.length,2); assert.equal(r[0]._db_id,'db'); assert.equal(r[0].nutriments['energy-kcal_100g'],106);
});
function edgeFixture(rows = []) {
  let args; let handler;
  const api = load('supabase/functions/search-foods/index.ts',{
    'jsr:@supabase/functions-js/edge-runtime.d.ts': {},'./searchCore.ts':core,
    'jsr:@supabase/supabase-js@2': { createClient: () => ({ rpc(name,values) { args={name,values}; return {abortSignal:async () => ({data:rows,error:null})}; } }) },
  },{ Deno:{ env:{get:()=> 'fixture'},serve:value=>{handler=value;} },fetch:async()=> {throw new Error('unexpected provider');} });
  return {api,get args(){return args;},run:body=>handler(new Request('https://fixture.invalid/search',{method:'POST',body:JSON.stringify(body)}))};
}
test('real Edge handler sends p_queries, preserves DB UUID/macros/serving and response contract',async () => {
  const row = { id:'0963bb3b-f75f-415e-ade5-49b7f5f16bdb',name:'Bananas, raw',product_name:'',brand:'',calories:89,protein:1.09,carbs:22.8,fat:0.33,fiber:2.6,macros_per:'100g',serving_size:118,serving_unit:'g',_search_basic:true };
  const f = edgeFixture([row]); const response = await f.run({query:'banana',limit:30}); const body = await response.json();
  assert.equal(response.status,200); assert.equal(f.args.name,'search_food_catalog_v2');
  assert.deepEqual(plain(f.args.values),{p_queries:['banana'],p_limit:30});
  assert.equal(body.count,1); assert.equal(body.products[0]._db_id,row.id);
  assert.equal(body.products[0].product_name,row.name); assert.equal(body.products[0].nutriments['energy-kcal_100g'],89);
  assert.equal(body.products[0].serving_size,'118 g'); assert.equal(body.ranking_version,'food-v2');
});
test('DB serving-based nutrition is normalized exactly once as in live v32',() => {
  const f=edgeFixture(); const p=f.api.mapDbRowToOff({id:'serving',name:'Food',macros_per:'serving',serving_size:50,calories:100,protein:5,carbs:10,fat:2},'food');
  assert.equal(p.nutriments['energy-kcal_100g'],200); assert.equal(p.nutriments.proteins_100g,10);
});
test('invalid request is rejected before catalog access',async () => {
  const f=edgeFixture(); assert.equal((await f.run({query:'a',limit:30})).status,400); assert.equal(f.args,undefined);
});
function clientFixture(fetcher,cache = null) {
  const writes=[];
  const api=load('utils/foodSearchHybrid.ts',{
    './foodSearchCache':{getLocalCache:async()=>cache,setLocalCache:async(q,p)=>writes.push([q,p])},
    '@/lib/supabase/client':{SUPABASE_PROJECT_URL:'https://fixture.invalid',supabasePublicKey:'fixture-public-key'},
  },{fetch:fetcher}); return {api,writes};
}
test('client timeout includes a stalled JSON body',async () => {
  const f=clientFixture(async()=>({ok:true,json:()=>new Promise(()=>{})}));
  await assert.rejects(f.api.fetchSearchResponse('apple',undefined,10),/SEARCH_TIMEOUT/);
});
test('already aborted client search makes no request',async () => {
  let requests=0;const f=clientFixture(async()=>{requests++;});const controller=new AbortController();controller.abort();
  await assert.rejects(f.api.fetchSearchResponse('apple',controller.signal),/SEARCH_ABORTED/);assert.equal(requests,0);
});
test('client distinguishes empty success, HTTP error and partial results',async () => {
  const empty=clientFixture(async()=>new Response(JSON.stringify({products:[],status:'complete',ranking_version:'food-v2'})));
  assert.deepEqual(plain(await empty.api.fetchSearchResponse('apple')),{products:[],partial:false,cacheable:true});
  const failed=clientFixture(async()=>new Response('{}',{status:503}));await assert.rejects(failed.api.fetchSearchResponse('apple'),/SEARCH_HTTP_503/);
  const partial=clientFixture(async()=>new Response(JSON.stringify({products:[apple],status:'partial',ranking_version:'food-v2'})));
  assert.equal((await partial.api.fetchSearchResponse('apple')).cacheable,false);
});
test('hybrid search completes once, reports partial and does not cache it',async () => {
  const f=clientFixture(async()=>new Response(JSON.stringify({products:[apple],status:'partial',ranking_version:'food-v2'})));
  let completed=0,errors=0,hits=0;await f.api.hybridSearch('apple',{onComplete(){completed++;},onError(){errors++;},onSupabaseHit(){hits++;}});
  assert.equal(completed,1);assert.equal(errors,1);assert.equal(hits,1);assert.equal(f.writes.length,0);
});
test('v2 cache does not read the old ranking namespace',async () => {
  const keys=[]; const cache=load('utils/foodSearchCache.ts',{'@react-native-async-storage/async-storage':{getItem:async key=>{keys.push(key);return null;}}});
  assert.equal(await cache.getLocalCache('Apple'),null);assert.equal(keys[0],'@food_search_cache:v2:apple');
});
