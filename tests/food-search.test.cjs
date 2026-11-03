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
    if(id==='../_shared/nutritionEvidence.mjs')return require('../supabase/functions/_shared/nutritionEvidence.mjs');
    if(id==='../_shared/portionCache.mjs')return require('../supabase/functions/_shared/portionCache.mjs');
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

// Execute the actual screen callbacks with state/timer doubles, without mounting RN.
function screenHarness(file) {
  const source = fs.readFileSync(file, 'utf8');
  const inline = file.endsWith('add-food.tsx');
  const state = { results: [], error: null, searching: false, searched: false, query: '' };
  const calls = [];
  const timers = new Map();
  let timerId = 0;
  const ref = () => ({ current: null });
  const abort = ref(), debounce = ref(), map = { current: new Map() };
  const setter = key => value => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
  const context = {
    AbortController, Map, console: { log() {}, warn() {} }, t: key => key,
    useCallback: fn => fn, useEffect: fn => fn(),
    setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id),
    hybridSearch: (query, callbacks, signal) => calls.push({ query, callbacks, signal }),
    mergeProducts: (target, products) => { for (const p of products) target.set(p.code, p); return [...target.values()]; },
    abortControllerRef: abort, searchAbortRef: abort,
    debounceTimerRef: debounce, searchDebounceRef: debounce,
    resultsMapRef: map, searchResultsMapRef: map,
    currentQueryRef: ref(), currentSearchQueryRef: ref(),
    setResults: setter('results'), setSearchResults: setter('results'),
    setErrorMessage: setter('error'), setSearchError: setter('error'),
    setIsSearching: setter('searching'), setHasSearched: setter('searched'),
    setSearchQuery: setter('query'), searchQuery: '',
  };
  vm.createContext(context);
  function run(code) {
    vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  }
  const performStart = source.indexOf('  const performSearch = useCallback(');
  const performEnd = source.indexOf(inline ? '  }, [t]);' : '  }, []);', performStart);
  run(source.slice(performStart, performEnd + (inline ? '  }, [t]);' : '  }, []);').length) + '\nthis.performSearch = performSearch;');
  let change;
  if (inline) {
    const start = source.indexOf('  const handleSearchChange = useCallback(');
    const end = source.indexOf('  }, [performSearch]);', start);
    run(source.slice(start, end + '  }, [performSearch]);'.length) + '\nthis.change = handleSearchChange;');
    change = text => context.change(text);
  } else {
    const inputStart = source.indexOf('onChangeText={(text) => {') + 'onChangeText={(text) => {'.length;
    const input = source.slice(inputStart, source.indexOf('}}', inputStart));
    const start = source.indexOf('  useEffect(() => {\n    if (debounceTimerRef.current)');
    const end = source.indexOf('  }, [searchQuery, performSearch]);', start);
    assert.ok(start >= 0 && end > start);
    const effect = source.slice(start, end + '  }, [searchQuery, performSearch]);'.length);
    change = text => { context.text = text; run(input); context.searchQuery = text; run(effect); };
  }
  return { state, calls, change, start: query => context.performSearch(query),
    flush() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); } };
}
for (const file of ['app/food-search.tsx', 'app/add-food.tsx']) {
  test(file + ': A cannot emit beneath B before debounce', () => {
    const h = screenHarness(file); h.start('apple'); const a = h.calls[0];
    h.change('banana'); assert.equal(a.signal.aborted, true);
    a.callbacks.onSupabaseHit([food('old apple')]); a.callbacks.onComplete();
    assert.equal(h.state.results.length, 0); assert.equal(h.state.searching, true);
    assert.equal(h.calls.length, 1); h.flush(); assert.equal(h.calls[1].query, 'banana');
  });
  test(file + ': one character aborts and resets', () => {
    const h = screenHarness(file); h.start('apple'); const a = h.calls[0];
    a.callbacks.onLocalCacheHit([food('cached apple')]); h.change('b');
    a.callbacks.onSupabaseHit([food('late apple')]); a.callbacks.onComplete(); h.flush();
    assert.equal(a.signal.aborted, true); assert.equal(h.state.results.length, 0);
    assert.equal(h.state.searching, false); assert.equal(h.state.searched, false); assert.equal(h.calls.length, 1);
  });
  test(file + ': authoritative changed and empty results replace cache', () => {
    const h = screenHarness(file); h.start('apple'); const cb = h.calls[0].callbacks;
    cb.onLocalCacheHit([food('cached')]); cb.onSupabaseHit([food('fresh')]);
    assert.deepEqual(plain(h.state.results).map(p => p.product_name), ['fresh']);
    cb.onSupabaseHit([]); cb.onComplete(); assert.equal(h.state.results.length, 0);
    assert.equal(h.state.error, null); assert.equal(h.state.searching, false);
  });
  test(file + ': completion preserves connection failure', () => {
    const h = screenHarness(file); h.start('apple'); const cb = h.calls[0].callbacks;
    cb.onError('supabase', new Error('SEARCH_UNAVAILABLE')); cb.onComplete();
    assert.ok(h.state.error); assert.equal(h.state.searching, false);
  });
}


test('generic food words inside a brand do not suppress USDA basic fallback', async () => {
  const p = providers([food('Chicken breast strips', {brands:'Chicken Kitchen'})], [raw]);
  const result = await core.searchCatalog('chicken breast',30,p.providers);
  assert.deepEqual(p.calls,['db','usda']);
  assert.equal(result.products[0].product_name,raw.product_name);
});
test('bounded typo retains original and corrected food intent', () => {
  assert.deepEqual(plain(core.queryVariants('chiken breast')),['chiken breast','chicken breast']);
  assert.equal(core.matches(raw,'chiken breast'),true);
});
test('provider diagnostic never exposes query or raw error text', async () => {
  const logs=[];
  const isolated=load('supabase/functions/search-foods/searchCore.ts',{}, {console:{warn:(...args)=>logs.push(args)}});
  const p=providers(()=>{throw new Error('secret raw failure');},[raw]);
  const result=await isolated.searchCatalog('chicken breast',30,p.providers);
  assert.equal(result.status,'partial');
  assert.equal(logs[0][1].stage,'db'); assert.equal(logs[0][1].code,'PROVIDER_FAILURE');
  assert.equal(logs[0][1].deadline_ms,1800);
  assert.ok(Number.isFinite(logs[0][1].elapsed_ms));
  assert.ok(!JSON.stringify(logs).includes('secret')); assert.ok(!JSON.stringify(logs).includes('chicken'));
});


test('unrequested meat substitutes cannot outrank actual chicken despite SQL basic hint', async () => {
  const substitute=food('Chicken, meatless',{_db_row:{_search_basic:true}});
  const real=food('Chicken, breast, raw',{_db_row:{_search_basic:true}});
  const p=providers([substitute,real]);
  const r=await core.searchCatalog('chicken',30,p.providers);
  assert.equal(r.products[0].product_name,real.product_name);
  assert.equal(core.isBasic(substitute,'chicken'),false);
  assert.equal(core.matches(substitute,'chicken meatless'),true);
  assert.equal(core.isBasic(substitute,'chicken meatless'),true);
});
test('full catalog response after old 1200ms deadline succeeds within total client budget', async () => {
  const rows=Array.from({length:30},(_,i)=>food('Chicken breast, raw '+i,{code:String(i),_db_row:{_search_basic:true}}));
  const p=providers(()=>new Promise(resolve=>setTimeout(()=>resolve(rows),1300)));
  const start=Date.now();const r=await core.searchCatalog('chicken breast',30,p.providers);
  assert.equal(r.providers.db,'ok');assert.equal(r.status,'complete');assert.equal(r.count,30);
  assert.deepEqual(p.calls,['db']);assert.ok(Date.now()-start<5000);
});

for (const [query,variant,basic] of [
 ['eggs','Eggs, Grade A, Large, egg yolk','Eggs, Grade A, Large, egg whole'],
 ['tuna','Fish, tuna salad','Fish, tuna, fresh, bluefin, raw'],
 ['salmon','Salmon, canned','Salmon, raw'],
 ['whey','Whey, acid, fluid','Whey protein isolate'],
]) test('unrequested variant follows requested basic: '+query, async()=>{
 const p=providers([food(variant),food(basic)]);
 const r=await core.searchCatalog(query,30,p.providers);
 assert.equal(r.products[0].product_name,basic);
 assert.equal(core.intentPenalty(food(variant),query),1);
 assert.equal(core.intentPenalty(food(variant),variant),0);
});

test('common Spanish foods preserve original and translated intent without guessing platano',()=>{
 for(const [q,english] of [['arroz','rice'],['avena','oats'],['huevos','eggs'],['claras','egg whites'],['atún','tuna'],['salmón','salmon'],['carne molida','ground beef'],['papa','potato'],['yogur griego','greek yogurt'],['proteína en polvo','protein powder']]) {
  assert.ok(core.queryVariants(q).includes(q)); assert.ok(core.queryVariants(q).includes(english),q);
 }
 assert.equal(core.normalizeQuery('plátano'),'platano');
});

test('generic fish outranks derived oil while explicit oils and supplements remain selectable',async()=>{
 const oil=food('Fish oil, salmon');const fish=food('Fish, salmon, chum, raw');
 const p=providers([oil,fish]);const r=await core.searchCatalog('salmon',30,p.providers);
 assert.equal(r.products[0].product_name,fish.product_name);
 assert.equal(core.intentPenalty(oil,'salmon'),1);
 assert.equal(core.intentPenalty(oil,'salmon oil'),0);
 assert.equal(core.matches(oil,'salmon oil'),true);
 assert.equal(core.intentPenalty(food('Fish oil capsules'),'fish'),1);
 assert.equal(core.intentPenalty(food('Fish oil capsules'),'fish oil capsules'),0);
 assert.equal(core.intentPenalty(food('Olive oil'),'olive oil'),0);
 assert.equal(core.matches(food('Olive oil'),'olive oil'),true);
});

test('general descriptor policy applies to new identities and respects explicit variants',async()=>{
 for(const identity of ['millet','barley','sorghum']) {
  const basic=food(identity+', raw');const derived=food(identity+' powder');
  const p=providers([derived,basic]);const r=await core.searchCatalog(identity,30,p.providers);
  assert.equal(r.products[0].product_name,basic.product_name);
  assert.equal(core.intentPenalty(derived,identity+' powder'),0);
 }
 assert.equal(core.intentPenalty(food('Yogurt, plain'),'yogurt'),0);
 assert.equal(core.intentPenalty(food('Protein powder'),'protein powder'),0);
});
test('SQL and final ranking share vocabulary and penalize variants before LIMIT',()=>{
 const sql=fs.readFileSync('supabase/review/food-search-v2/catalog-search.CANDIDATE.sql','utf8');
 for(const term of core.VARIANT_TERMS) assert.ok(sql.includes("'"+term+"'"),term);
 assert.ok(sql.indexOf('ORDER BY r.unrequested_variant ASC')<sql.indexOf('LIMIT p_limit'));
 assert.ok(sql.includes('r.basic_food DESC,r.brand_penalty ASC'));
 assert.ok(!sql.includes("'restaurant'"));
});


test('taxonomy head may introduce identity but composite ingredient may not',()=>{
 assert.equal(core.isBasic(food('Fish, salmon, raw'),'salmon'),true);
 assert.equal(core.isBasic(food('Muffins, apple'),'apple'),false);
});
test('held-out category identity smoke without category-specific rules',async()=>{
 for(const [query,name] of [['lentils','Lentils, raw'],['cheddar','Cheddar cheese'],['milk','Milk, whole'],['almonds','Almonds, raw'],['arepa','Arepa']]) {
  const item=food(name);const before=JSON.stringify(item);
  const p=providers([item]);const result=await core.searchCatalog(query,30,p.providers);
  assert.equal(result.products[0].product_name,name,query);
  assert.equal(JSON.stringify(item),before);
 }
});


test('generic unbranded category matches precede brands without food-name exceptions',async()=>{
 for(const [query,name,brandName,brand] of [['cheddar','Cheese, cheddar','Cheddar','Example'],['almonds','Nuts, almonds','Almond Breeze Calcio','Blue Diamond Almonds'],['flatbread','Restaurant, Regional, flatbread','Flatbread','Example']]) {
  const plainFood=food(name,{_db_id:'plain-'+query});const branded=food(brandName,{brands:brand});
  const original=JSON.stringify(plainFood);const p=providers([branded,plainFood]);
  const result=await core.searchCatalog(query,30,p.providers);
  assert.equal(result.products[0]._db_id,plainFood._db_id,query);
  assert.equal(JSON.stringify(plainFood),original);
 }
 assert.equal(core.intentPenalty(food('Restaurant, Regional, flatbread'),'flatbread'),0);
});
test('explicit brand remains preferred and a food word inside a brand is not brand intent',()=>{
 const p=food('Cheddar',{brands:'Example'});
 assert.equal(core.brandPenalty(p,'Example cheddar'),0);
 assert.equal(core.brandPenalty(p,'cheddar'),1);
 assert.equal(core.brandPenalty(food('Milk',{brands:'Milk Kitchen'}),'milk'),1);
 assert.equal(core.brandPenalty(food('Almond Breeze Calcio',{brands:'Blue Diamond Almonds'}),'almonds'),1);
 assert.equal(core.matches(p,'Example cheddar'),true);
 assert.equal(core.matches(food('Cheese, cheddar'),'Example cheddar'),false);
});
test('real provider HTTP rejection records only bounded status and retains partial contract',async()=>{
 const logs=[];let calls=0;
 const isolated=load('supabase/functions/search-foods/searchCore.ts',{}, {console:{warn:(...args)=>logs.push(args)}});
 let handler;load('supabase/functions/search-foods/index.ts',{
  'jsr:@supabase/functions-js/edge-runtime.d.ts':{},'./searchCore.ts':isolated,
  'jsr:@supabase/supabase-js@2':{createClient:()=>({rpc:()=>({abortSignal:async()=>({data:[{id:'brand',name:'Cheddar',brand:'Example',calories:100,protein:10,carbs:1,fat:2,macros_per:'100g',serving_size:100}],error:null})})})}
 },{Deno:{env:{get:()=> 'fixture'},serve:h=>{handler=h;}},fetch:async()=>{calls++;return new Response('secret provider body',{status:429});}});
 const response=await handler(new Request('https://fixture.invalid/search',{method:'POST',body:JSON.stringify({query:'cheddar',limit:30})}));
 const body=await response.json();assert.equal(response.status,200);assert.equal(body.status,'partial');
 assert.equal(body.providers.usda,'unavailable');assert.equal(calls,1);
 assert.equal(logs[0][1].stage,'usda');assert.equal(logs[0][1].code,'USDA_UNAVAILABLE');assert.equal(logs[0][1].http_status,429);
 assert.ok(!JSON.stringify(logs).includes('secret'));assert.ok(!JSON.stringify(logs).includes('cheddar'));
});


test('entire RPC migration rejects duplicate transactions and content after COMMIT',()=>{
 function validate(sql) {
  assert.equal((sql.match(/^CREATE OR REPLACE FUNCTION /gm)||[]).length,1);
  assert.equal((sql.match(/\$function\$/g)||[]).length,2);
  assert.equal((sql.match(/^BEGIN;/gm)||[]).length,1);
  const pieces=sql.split('$function$;');assert.equal(pieces.length,2);
  assert.match(pieces[1],/^\s*REVOKE ALL ON FUNCTION public\.search_food_catalog_v2\(text\[\],integer\) FROM PUBLIC,anon,authenticated;\s*GRANT EXECUTE ON FUNCTION public\.search_food_catalog_v2\(text\[\],integer\) TO service_role;\s*COMMIT;\s*$/);
 }
 const sql=fs.readFileSync('supabase/review/food-search-v2/catalog-search.CANDIDATE.sql','utf8');
 validate(sql);
 assert.throws(()=>validate(sql+String.fromCharCode(10)+'SELECT 1;'));
 assert.throws(()=>validate(sql+sql));
});

function scanPortionFixture(providerCode='012345678905'){
 let handler,saved=null,inserts=0;
 const client={from(table){assert.equal(table,'food_items');let inserting=false;
  const query={select(){return query;},in(){return query;},maybeSingle:async()=>({data:null,error:null}),insert(row){inserts++;saved=structuredClone(row);inserting=true;return query;},single:async()=>({data:inserting?{...saved,id:'fixture-catalog-id'}:null,error:null})};return query;}};
 load('supabase/functions/lookup-barcode/index.ts',{
  'jsr:@supabase/functions-js/edge-runtime.d.ts':{},
  'jsr:@supabase/supabase-js@2':{createClient:()=>client},
  './identity.mjs':require('../supabase/functions/lookup-barcode/identity.mjs')
 },{Deno:{env:{get:name=>name==='OPENROUTER_API_KEY'?'':'fixture'},serve:h=>{handler=h;}},
  fetch:async()=>Response.json({status:1,product:{code:providerCode,product_name:'Fixture cookies',brands:'Fixture',serving_size:'4 cookies (29 g)',serving_quantity:29,nutriments:{'energy-kcal_100g':400,proteins_100g:8,carbohydrates_100g:60,fat_100g:14}}})});
 return {request:()=>handler(new Request('https://fixture.invalid/lookup-barcode',{method:'POST',body:JSON.stringify({barcode:'012345678905'})})),get saved(){return saved;},get inserts(){return inserts;}};
}
test('actual barcode handler saves provider-labeled grams and count with insert-only provenance',async()=>{
 const f=scanPortionFixture();const response=await f.request(),body=await response.json();
 assert.equal(response.status,200);assert.equal(body.persisted,true);assert.equal(f.inserts,1);
 assert.equal(f.saved.serving_size,29);assert.equal(f.saved.serving_count,4);assert.equal(f.saved.serving_description,'cookies');
 assert.equal(f.saved.calories,400);assert.equal(f.saved.macros_per,'100g');
 assert.equal(f.saved.off_data.measure_provenance.verification,'provider_reported');
 assert.equal(f.saved.off_data.measure_provenance.gram_weight_explicit,true);
 assert.equal(body.item.id,'fixture-catalog-id');
 assert.equal(f.saved.off_data.nutrition_evidence.provider,'openfoodfacts');
 assert.equal(f.saved.off_data.nutrition_evidence.facts.proteins_100g.value,8);
});
test('barcode identity mismatch cannot persist another product or its portion',async()=>{
 const f=scanPortionFixture('737628064502');const response=await f.request();
 assert.equal(response.status,503);assert.equal(f.inserts,0);assert.equal(f.saved,null);
});

test('USDA Branded foodNutrients retain per100 basis independently of serving size',()=>{
 const {api:edge}=edgeFixture();
 const base={fdcId:123,description:'Fixture exact product',dataType:'Branded',servingSize:25,servingSizeUnit:'g',foodNutrients:[{nutrientName:'Energy',value:400},{nutrientName:'Protein',value:20},{nutrientName:'Carbohydrate',value:50},{nutrientName:'Total lipid (fat)',value:12}]};
 const mapped=edge.mapUsdaToOff(base);
 assert.equal(mapped.nutriments['energy-kcal_100g'],400);
 assert.equal(mapped.nutriments.proteins_100g,20);
 assert.equal(mapped.serving_quantity,'25');
 assert.equal(edge.mapUsdaToOff({...base,servingSize:50}).nutriments['energy-kcal_100g'],400);
});
test('normal detail persistence cannot overwrite corrections or enrich using the first name match',()=>{
 const source=fs.readFileSync('components/FoodDetailsLayout.tsx','utf8');
 const start=source.indexOf('  const upsertFoodItem ='),end=source.indexOf('  const handleSave =',start);
 const persistence=source.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.ok(!persistence.includes('.update('));
 assert.ok(!persistence.includes(".ilike('name'"));
 assert.ok(!source.includes('enrichWithUSDA('));
 assert.ok(persistence.includes(".eq('usda_fdc_id',prod._usda_fdc_id)"));
 assert.ok(persistence.includes(".eq('barcode', barcode)"));
});
