// Restored from build609 (4a1ca199f9a7ed6e8148047799d62e9e4d326eca).
// Tests execute actual checkout source. See follow-on provenance and port review.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require(process.env.TYPESCRIPT_MODULE || 'typescript');
// Runtime inputs are always the current checkout, never archived build609 copies.
const root = path.resolve(__dirname, '..');
const shared = {
  '../_shared/searchNutritionCapture.mjs': require(path.join(root, 'supabase/functions/_shared/searchNutritionCapture.mjs')),
  '../_shared/searchHydration.mjs': require(path.join(root, 'supabase/functions/_shared/searchHydration.mjs')),
  '../_shared/nutritionProvider.mjs': require(path.join(root, 'supabase/functions/_shared/nutritionProvider.mjs')),
  '../_shared/portionCache.mjs': require(path.join(root, 'supabase/functions/_shared/portionCache.mjs')),
};
const plain = value => JSON.parse(JSON.stringify(value));
function load(file, mocks = {}, globals = {}) {
  const source = fs.readFileSync(path.join(root,file),'utf8');
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
function edgeFixture(rows = [], options = {}) {
  const calls = []; let handler;
  const snapshots = rows.map(row => ({ id: row.id, protected: false, snapshot: {
    ...Object.fromEntries(shared['../_shared/searchHydration.mjs'].SEARCH_SNAPSHOT_FIELDS.map(key => [key, null])),
    ...row,
  } }));
  const api = load('supabase/functions/search-foods/index.ts',{
    ...shared, 'jsr:@supabase/functions-js/edge-runtime.d.ts': {},'./searchCore.ts': options.core || core,
    'jsr:@supabase/supabase-js@2': { createClient: () => ({ rpc(name,values) {
      calls.push({name,values});
      assert.ok(['search_food_catalog_v2','read_food_search_snapshots_v1','read_usda_portions_v1'].includes(name), name);
      const data = name === 'search_food_catalog_v2' ? rows : name === 'read_food_search_snapshots_v1' ? snapshots : [];
      return {abortSignal:async () => ({data,error:null})};
    } }) },
  },{ Deno:{ env:{get:()=> 'fixture'},serve:value=>{handler=value;} },fetch:options.fetch || (async()=> {throw new Error('unexpected provider');}) });
  return {api,calls,get args(){return calls.find(call => call.name === 'search_food_catalog_v2');},run:body=>handler(new Request('https://fixture.invalid/search',{method:'POST',body:JSON.stringify(body)}))};
}
test('real Edge handler sends p_queries, preserves DB UUID/macros/serving and response contract',async () => {
  const row = { id:'0963bb3b-f75f-415e-ade5-49b7f5f16bdb',name:'Bananas, raw',product_name:'',brand:'',calories:89,protein:1.09,carbs:22.8,fat:0.33,fiber:2.6,macros_per:'100g',serving_size:118,serving_unit:'g',_search_basic:true };
  const f = edgeFixture([row]); const response = await f.run({query:'banana',limit:30}); const body = await response.json();
  assert.equal(response.status,200); assert.equal(f.args.name,'search_food_catalog_v2');
  assert.deepEqual(plain(f.args.values),{p_queries:['banana'],p_limit:30});
  assert.equal(body.count,1); assert.equal(body.products[0]._db_id,row.id);
  assert.equal(body.products[0].product_name,row.name); assert.equal(body.products[0].nutriments['energy-kcal_100g'],89);
  assert.equal(body.products[0].serving_size,'118 g'); assert.equal(body.ranking_version,'food-v2');
  assert.equal(body.status,'complete');
  assert.equal(Object.hasOwn(body.products[0],'_db_row'),false);
  assert.deepEqual(plain(f.calls.map(call => call.name)),['search_food_catalog_v2','read_food_search_snapshots_v1']);
  assert.deepEqual(plain(f.calls[1].values),{p_food_ids:[row.id]});
});
test('DB serving-based nutrition with explicit gram basis is normalized exactly once',() => {
  const f=edgeFixture(); const p=f.api.mapDbRowToOff({id:'serving',name:'Food',macros_per:'serving',serving_size:50,serving_unit:'g',calories:100,protein:5,carbs:10,fat:2},'food');
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
  const start=Date.now();
  await assert.rejects(f.api.fetchSearchResponse('apple',undefined,10),/SEARCH_TIMEOUT/);
  assert.ok(Date.now()-start<1000,'stalled JSON must respect the requested deadline');
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
test('review-aware cache does not read obsolete ranking namespaces',async () => {
  const keys=[]; const cache=load('utils/foodSearchCache.ts',{'@react-native-async-storage/async-storage':{getItem:async key=>{keys.push(key);return null;}}});
  assert.equal(await cache.getLocalCache('Apple'),null);assert.equal(keys[0],'@food_search_cache:v3-review:apple');
});

// Execute the actual screen callbacks with state/timer doubles, without mounting RN.
function screenHarness(file) {
  const source = fs.readFileSync(path.join(root,file), 'utf8');
  const tree = ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const inline = file.endsWith('add-food.tsx');
  const state = { results: [], error: null, searching: false, searched: false, query: '' };
  const calls = [];
  const timers = new Map();
  let timerId = 0;
  const ref = () => ({ current: null });
  const abort = ref(), debounce = ref(), map = { current: new Map() };
  const setter = key => value => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
  const context = {
    AbortController, Map, console: { log() {}, warn() {} }, t: key => key, i18n: {language:'en'},
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
  // AST extraction runs the current callback bodies and does not depend on the
  // old useCallback dependency arrays, whitespace, comments or brace strings.
  function unique(predicate, description) {
    const nodes = [];
    function visit(node) { if (predicate(node)) nodes.push(node); ts.forEachChild(node,visit); }
    visit(tree);
    assert.equal(nodes.length,1,`${file}: expected one ${description}, got ${nodes.length}`);
    return nodes[0];
  }
  function callback(name) {
    const node = unique(node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name, name);
    assert.ok(node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(tree) === 'useCallback', name);
    run(`const ${node.getText(tree)}; this.${name} = ${name};`);
  }
  callback('performSearch');
  let change;
  if (inline) {
    callback('handleSearchChange');
    change = text => context.handleSearchChange(text);
  } else {
    const input = unique(node => ts.isJsxAttribute(node) && node.name.getText(tree) === 'onChangeText'
      && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression
      && ts.isArrowFunction(node.initializer.expression)
      && node.initializer.expression.getText(tree).includes('abortControllerRef'), 'search input callback');
    run(`this.changeInput = ${input.initializer.expression.getText(tree)};`);
    const effect = unique(node => ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect'
      && node.arguments.length === 2 && ts.isArrayLiteralExpression(node.arguments[1])
      && node.arguments[1].elements.map(element => element.getText(tree)).join(',') === 'searchQuery,performSearch'
      && node.arguments[0].getText(tree).includes('debounceTimerRef'), 'search debounce effect');
    change = text => { context.changeInput(text); context.searchQuery = text; run(effect.getText(tree)); };
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
// The build609 SQL-only tests are not applicable to this test-only overlay.
// See README.md for the exact exclusions and outstanding SQL validation limit.

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
 const f = edgeFixture([{id:'0963bb3b-f75f-415e-ade5-49b7f5f16bdb',name:'Cheddar',brand:'Example',calories:100,protein:10,carbs:1,fat:2,macros_per:'100g',serving_size:100,serving_unit:'g'}], {
  core: isolated,
  fetch: async()=>{calls++;return new Response('secret provider body',{status:429});},
 });
 const response=await f.run({query:'cheddar',limit:30});
 const body=await response.json();assert.equal(response.status,200);assert.equal(body.status,'partial');
 assert.equal(body.providers.usda,'unavailable');assert.equal(calls,1);
 assert.equal(logs[0][1].stage,'usda');assert.equal(logs[0][1].code,'USDA_UNAVAILABLE');assert.equal(logs[0][1].http_status,429);
 assert.ok(!JSON.stringify(logs).includes('secret'));assert.ok(!JSON.stringify(logs).includes('cheddar'));
});


// Additional direct checks close gaps left by relying only on searchCatalog.
test('rankProducts applies intent, basic and brand tiers without mutating input', () => {
  const branded = food('Chicken breast', {brands:'Example',code:'brand'});
  const basic = food('Chicken breast', {code:'basic'});
  const variant = food('Chicken breast fried', {code:'variant'});
  const input = [variant,branded,basic]; const before = JSON.stringify(input);
  assert.deepEqual(plain(core.rankProducts(input,'chicken breast')).map(p=>p.code),['basic','brand','variant']);
  assert.equal(JSON.stringify(input),before);
  assert.equal(core.rankProducts([variant,basic],'chicken breast fried')[0].code,'variant');
});
test('rankProducts has deterministic exact-name, length, label and identity tie breakers', () => {
  const rows = [food('Banana zed',{code:'z'}),food('Banana abc',{code:'b'}),food('Banana abc',{code:'a'}),food('Banana',{code:'exact'})];
  assert.deepEqual(plain(core.rankProducts(rows,'banana')).map(p=>p.code),['exact','a','b','z']);
  assert.deepEqual(plain(core.rankProducts([...rows].reverse(),'banana')).map(p=>p.code),['exact','a','b','z']);
});
test('USDA fallback ranking honors generic-first order before final truncation', async () => {
  const p=providers([], [food('Chicken breast fried'),food('Chicken breast',{brands:'Example'}),raw]);
  const r=await core.searchCatalog('chicken breast',1,p.providers);
  assert.equal(r.products[0],raw); assert.equal(r.count,1); assert.deepEqual(p.calls,['db','usda']);
});
test('current review-only rows retain identity and suppress replacement fallback', async () => {
  const one={product_name:'Cheddar',brands:'Example',_db_id:'first',code:'first',requires_label_confirmation:true};
  const two={...one,_db_id:'second',code:'second'};
  const p=providers([one,two]);p.providers.skipFallback=()=>true;
  const r=await core.searchCatalog('cheddar',30,p.providers);
  assert.deepEqual(p.calls,['db']); assert.equal(r.count,2);
  assert.deepEqual(plain(r.products.map(p=>p._db_id)),['first','second']);
  assert.ok(r.products.every(p=>p.requires_label_confirmation===true && p.nutriments===undefined));
});
test('real Edge handler sends original Spanish and normalized English query variants', async () => {
  const f=edgeFixture([{id:'0963bb3b-f75f-415e-ade5-49b7f5f16bdb',name:'Apples, raw',calories:52,protein:0.3,carbs:14,fat:0.2,macros_per:'100g',serving_size:100,serving_unit:'g'}]);
  const response=await f.run({query:'Manzana',limit:5}); const body=await response.json();
  assert.equal(response.status,200); assert.equal(body.status,'complete'); assert.equal(body.count,1);
  assert.deepEqual(plain(f.args.values),{p_queries:['manzana','apple'],p_limit:5});
});
test('malformed, overlong and out-of-range search requests never access the catalog', async () => {
  const f=edgeFixture();
  for (const body of [null,{}, {query:5}, {query:'apple',limit:0}, {query:'apple',limit:101}, {query:'apple',limit:1.5}, {query:'x'.repeat(161)}, {query:Array.from({length:13},(_,i)=>'word'+i).join(' ')}]) {
    assert.equal((await f.run(body)).status,400,JSON.stringify(body));
  }
  assert.equal(f.calls.length,0);
});
test('client external abort cancels a non-cooperative stalled body immediately', async () => {
  let requestSignal;let decoding;
  const started=new Promise(resolve=>{decoding=resolve;});
  const f=clientFixture(async(_url,init)=>{requestSignal=init.signal;return {ok:true,json:()=>{decoding();return new Promise(()=>{});}};});
  const controller=new AbortController();const pending=f.api.fetchSearchResponse('apple',controller.signal,1000);
  await started;controller.abort();await assert.rejects(pending,/SEARCH_ABORTED/);assert.equal(requestSignal.aborted,true);
});
test('hybrid abort during cache read suppresses stale callbacks and request', async () => {
  let requests=0;let release;
  const f=clientFixture(async()=>{requests++;},new Promise(resolve=>{release=resolve;}));
  const seen=[];const controller=new AbortController();
  const pending=f.api.hybridSearch('apple',{onLocalCacheHit(){seen.push('cache');},onSupabaseHit(){seen.push('server');},onError(){seen.push('error');},onComplete(){seen.push('complete');}},controller.signal);
  controller.abort();release([apple]);await pending;
  assert.deepEqual(seen,['complete']); assert.equal(requests,0); assert.equal(f.writes.length,0);
});
test('invalid or absent ranking metadata cannot make client results cacheable', async () => {
  for(const body of [{products:[apple],status:'complete'}, {products:[apple],status:'complete',ranking_version:'food-v1'}]) {
    const f=clientFixture(async()=>new Response(JSON.stringify(body)));
    assert.equal((await f.api.fetchSearchResponse('apple')).cacheable,false);
  }
  for(const body of [null,{}, {products:null}]) {
    const f=clientFixture(async()=>new Response(JSON.stringify(body)));
    await assert.rejects(f.api.fetchSearchResponse('apple'),/SEARCH_INVALID_RESPONSE/);
  }
  const unavailable=clientFixture(async()=>new Response(JSON.stringify({products:[],status:'partial',ranking_version:'food-v2'})));
  await assert.rejects(unavailable.api.fetchSearchResponse('apple'),/SEARCH_UNAVAILABLE/);
});
test('sanitized provider diagnostics reject out-of-range status and unbounded messages', async () => {
  const logs=[];const isolated=load('supabase/functions/search-foods/searchCore.ts',{}, {console:{warn:(...args)=>logs.push(args)}});
  const p=providers(()=>{throw new isolated.ProviderHttpError('raw secret token and query',999);},[apple]);
  const result=await isolated.searchCatalog('apple',30,p.providers);
  assert.equal(result.status,'partial');assert.equal(logs.length,1);
  assert.equal(logs[0][1].code,'PROVIDER_FAILURE');assert.equal(logs[0][1].http_status,undefined);
  assert.ok(!JSON.stringify(logs).includes('secret')); assert.ok(!JSON.stringify(logs).includes('apple'));
});
