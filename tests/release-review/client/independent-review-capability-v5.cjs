// Offline compatibility tests. Legacy sources are exact, pinned, read-only inputs.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const {root,read,compile,load,bind,closure,text}=require('./independent-off-search-harness.cjs');
const {harness}=require('./client-harness.cjs');
const ts=require(process.env.BARCODE_RECOVERY_NODE_MODULES+'/typescript');
const legacy='tests/release-review/fixtures/legacy609/';
const cached=[{code:'012345678905',product_name:'Cached cereal',brands:'Brand',_source:'openfoodfacts',serving_size:'250 ml',serving_quantity:250,nutriments:{'energy-kcal_100g':300,proteins_100g:2,carbohydrates_100g:20,fat_100g:4}}];
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function effect(file,contains){const src=read(file),ast=ts.createSourceFile(file,src,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);let found;function walk(n){if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0].getText(ast).includes(contains))found=n.arguments[0];ts.forEachChild(n,walk);}walk(ast);assert.ok(found,'actual effect '+contains);return found.getText(ast);}
function badResponse(status=409,code='SEARCH_REVIEW_UPDATE_REQUIRED'){return {ok:false,status,text:async()=>JSON.stringify({status:'update_required',error:code}),json:async()=>({status:'update_required',error:code})};}
function searchHarness(prefix,status=409,wait=null,language='en',cachedProducts=cached){
 const requests=[],cacheWrites=[],states={results:[],error:null},versions=[];
 const api=load(prefix+'utils/foodSearchHybrid.ts',{'./foodSearchCache':{getLocalCache:async()=>cachedProducts,setLocalCache:async(q,p)=>cacheWrites.push([q,p])},'@/lib/supabase/client':{SUPABASE_PROJECT_URL:'https://fixture.invalid',supabasePublicKey:'public'}},{fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});if(wait)await wait;return badResponse(status);}});
 const extra={AbortController,i18n:{language},abortControllerRef:{current:null},currentQueryRef:{current:''},resultsMapRef:{current:new Map()},searchAbortRef:{current:null},currentSearchQueryRef:{current:''},searchResultsMapRef:{current:new Map()},setResults:v=>{states.results=typeof v==='function'?v(states.results):v;versions.push(states.results);},setSearchResults:v=>{states.results=typeof v==='function'?v(states.results):v;versions.push(states.results);},setErrorMessage:v=>states.error=v,setSearchError:v=>states.error=v,setHasSearched:v=>states.hasSearched=v,setIsSearching:v=>states.searching=v,mergeProducts:(map,products)=>{for(const p of products)map.set(p.code,{product:p});return [...map.values()];},hybridSearch:(...args)=>{extra.pending=api.hybridSearch(...args);return extra.pending;}};
 const h=closure(extra);h.c.console.warn=()=>{};return {h,extra,api,requests,cacheWrites,states,versions};
}
test('all six pinned build609 files match their declared Git blobs and SHA256 hashes',()=>{const m=JSON.parse(read(legacy+'manifest.json'));assert.equal(m.commit,'4a1ca199f9a7ed6e8148047799d62e9e4d326eca');assert.equal(m.files.length,6);for(const entry of m.files){const data=fs.readFileSync(path.join(root,legacy,entry.path));assert.equal(crypto.createHash('sha256').update(data).digest('hex'),entry.sha256);assert.equal(crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+data.length+'\0'),data])).digest('hex'),entry.git_blob_sha1);}});
test('actual build609 scanner HTTP409 routes error to lookup whose actual mount effect makes no retry',async()=>{const h=harness('scanner','ios');h.c.fetch=async(url,options)=>{h.requests.push({url,body:JSON.parse(options.body)});return badResponse();};bind(h.c,legacy+'app/barcode-scanner.tsx','performLookupAndNavigate');bind(h.c,legacy+'app/barcode-scanner.tsx','handleBarCodeScanned');await h.submit();await h.flush();assert.equal(h.requests.length,1);assert.equal(h.requests[0].body.review_capability,undefined);assert.equal(h.adapters.length,0);assert.equal(h.routes.length,1);const routed=h.routes[0];assert.equal(routed.pathname,'/barcode-lookup');assert.equal(routed.params.error,'HTTP error: 409');h.c.errorParam=routed.params.error;bind(h.c,legacy+'app/barcode-lookup.tsx','performLookup');vm.runInContext(compile('globalThis.mountLookupEffect='+effect(legacy+'app/barcode-lookup.tsx','if (errorParam)')),h.c);h.c.mountLookupEffect();await h.flush();assert.equal(h.requests.length,1);assert.equal(h.states.Error,'HTTP error: 409');assert.equal(h.states.Loading,false);assert.equal(h.writes.length,0);});
test('actual build609 direct lookup HTTP409 stops with generic lookup error, no automatic fallback',async()=>{const h=harness('lookup','ios');h.c.fetch=async(url,options)=>{h.requests.push({url,body:JSON.parse(options.body)});return badResponse();};bind(h.c,legacy+'app/barcode-lookup.tsx','performLookup');await h.c.performLookup();await h.flush();assert.equal(h.requests.length,1);assert.equal(h.routes.length,0);assert.equal(h.adapters.length,0);assert.equal(h.writes.length,0);assert.equal(h.states.Error,'barcodeLookup.lookupFailed');assert.equal(h.states.Loading,false);});
for(const file of ['app/food-search.tsx','app/add-food.tsx'])test('actual build609 '+file+' has no provider retry but retains preexisting local results on HTTP409',async()=>{const s=searchHarness(legacy);bind(s.h.c,legacy+file,'performSearch');s.h.c.performSearch('cereal');await s.extra.pending;assert.equal(s.requests.length,1);assert.equal(s.requests[0].body.review_capability,undefined);assert.equal(s.cacheWrites.length,0);assert.equal(s.states.results.length,1);assert.equal(s.states.error,null);assert.equal(s.states.searching,false);});
module.exports={searchHarness,badResponse,defer};

for(const file of ['app/food-search.tsx','app/add-food.tsx'])test('actual build609 '+file+' without local cache stops at generic error after one HTTP409',async()=>{const s=searchHarness(legacy,409,null,'en',[]);bind(s.h.c,legacy+file,'performSearch');s.h.c.performSearch('cereal');await s.extra.pending;assert.equal(s.requests.length,1);assert.equal(s.cacheWrites.length,0);assert.equal(s.states.results.length,0);assert.match(s.states.error,/connectionIssue|connectionError/);assert.equal(s.states.searching,false);});

function confirmation(params,language='en') {
  const routes=[];
  const page=load('app/search-food-confirmation.tsx',{
    'expo-router':{useLocalSearchParams:()=>params,useRouter:()=>({replace:r=>routes.push(r),back:()=>routes.push('back')})},
    'react-i18next':{useTranslation:()=>({i18n:{language}})},
    'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
    '@/styles/commonStyles':{colors:{}}
  });
  const tree=page.default();
  function buttons(n){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(buttons);return [...(typeof n.props?.onPress==='function'?[n]:[]),...buttons(n.props?.children)];}
  return {tree,routes,buttons:buttons(tree)};
}
for(const kind of ['scanner','lookup'])for(const platform of ['web','ios'])test('current '+kind+' '+platform+' requests review capability and intercepts 409/426 without fallback',async()=>{
  for(const status of [409,426]) {
    const h=harness(kind,platform);
    h.c.fetch=async(url,options)=>{h.requests.push({url,body:JSON.parse(options.body)});return badResponse(status,'LOOKUP_REVIEW_UPDATE_REQUIRED');};
    await h.submit();await h.flush();
    assert.equal(h.requests.length,1);
    assert.deepEqual(h.requests[0].body,{barcode:'012345678905',review_capability:'label_confirmation_v1'});
    assert.equal(h.routes.length,1);
    assert.equal(h.routes[0].pathname,'/search-food-confirmation');
    assert.equal(h.routes[0].params.reason,'update_required');
    assert.equal(h.adapters.length,0);assert.equal(h.writes.length,0);
    for(const language of ['en','es']) {
      const ui=confirmation(h.routes[0].params,language);
      assert.match(text(ui.tree),language==='es'?/Actualiza MacroGoal/:/Update MacroGoal/);
      assert.doesNotMatch(text(ui.tree),/SEARCH_REVIEW_UPDATE_REQUIRED|LOOKUP_REVIEW_UPDATE_REQUIRED/);
      assert.equal(ui.buttons.length,1);ui.buttons[0].props.onPress();assert.deepEqual(ui.routes,['back']);
    }
  }
});
for(const file of ['app/food-search.tsx','app/add-food.tsx'])test('current '+file+' clears cached rows/maps and shows localized upgrade text after one409/426',async()=>{
  for(const status of [409,426])for(const language of ['en','es']){
    const s=searchHarness('',status,null,language);bind(s.h.c,file,'performSearch');s.h.c.performSearch('cereal');await s.extra.pending;
    assert.equal(s.requests.length,1);assert.deepEqual(s.requests[0].body,{query:'cereal',limit:30,review_capability:'label_confirmation_v1'});
    assert.equal(s.versions.some(v=>v.length===1),true);assert.equal(s.states.results.length,0);
    assert.equal(s.h.c[file.includes('add-food')?'searchResultsMapRef':'resultsMapRef'].current.size,0);
    assert.match(s.states.error,language==='es'?/Actualiza MacroGoal/:/Update MacroGoal/);
    assert.doesNotMatch(s.states.error,/SEARCH_REVIEW_UPDATE_REQUIRED/);assert.equal(s.states.searching,false);
    assert.equal(s.cacheWrites.length,1);assert.equal(s.cacheWrites[0][0],'cereal');assert.equal(s.cacheWrites[0][1].length,0);
  }
});
for(const kind of ['scanner','lookup'])for(const platform of ['web','ios'])test('current '+kind+' '+platform+' cancellation during compatibility error JSON cannot navigate',async()=>{
  const json=defer(),entered=defer(),h=harness(kind,platform);
  h.c.fetch=async(url,options)=>{h.requests.push({url,body:JSON.parse(options.body)});return {ok:false,status:409,json:async()=>{entered.resolve();await json.promise;return {status:'update_required',error:'LOOKUP_REVIEW_UPDATE_REQUIRED'};}};};
  const pending=h.submit();await entered.promise;h.cancel();json.resolve();await pending;await h.flush();
  assert.equal(h.routes.length,0);assert.equal(h.adapters.length,0);assert.equal(h.writes.length,0);assert.equal(h.requests.length,1);
});
for(const file of ['app/food-search.tsx','app/add-food.tsx'])test('current '+file+' cancelled upgrade response cannot replace later UI or cache',async()=>{
  const response=defer(),s=searchHarness('',409,response.promise);bind(s.h.c,file,'performSearch');s.h.c.performSearch('cereal');
  for(let i=0;i<10;i++)await Promise.resolve();
  s.h.c[file.includes('add-food')?'searchAbortRef':'abortControllerRef'].current.abort();
  s.states.results=[{product:{product_name:'Newer screen'}}];s.states.error='newer';response.resolve();await s.extra.pending;
  assert.equal(s.states.results[0].product.product_name,'Newer screen');assert.equal(s.states.error,'newer');assert.equal(s.cacheWrites.length,0);
});
test('current cache namespace ignores old609/v2 entries even offline without deleting their data',async()=>{
  const oldKey='@food_search_cache:v2:cereal',data=new Map([[oldKey,JSON.stringify({products:cached,timestamp:Date.now()})]]),reads=[];
  const cache=load('utils/foodSearchCache.ts',{'@react-native-async-storage/async-storage':{getItem:async k=>{reads.push(k);return data.get(k)||null;},multiSet:async pairs=>pairs.forEach(([k,v])=>data.set(k,v)),removeItem:async k=>data.delete(k),multiRemove:async ks=>ks.forEach(k=>data.delete(k))}});
  let requests=0,localHits=0,error;
  const api=load('utils/foodSearchHybrid.ts',{'./foodSearchCache':cache,'@/lib/supabase/client':{SUPABASE_PROJECT_URL:'https://fixture.invalid',supabasePublicKey:'public'}},{fetch:async()=>{requests++;throw Error('offline');}});
  await api.hybridSearch('cereal',{onLocalCacheHit:()=>localHits++,onError:(_stage,e)=>error=e.message});
  assert.equal(localHits,0);assert.equal(requests,1);assert.equal(error,'SEARCH_UNAVAILABLE');
  assert.ok(reads.every(k=>k.startsWith('@food_search_cache:v3-review:')));assert.equal(data.has(oldKey),true);
});
test('sanitized OFF label is only conservative volume guidance, never forwarded nutrition or mass proof',()=>{
  const safety=load('utils/searchSelectionSafety.ts');
  const p={_source:'openfoodfacts',code:'012345678905',product_name:'Liquid',requires_label_confirmation:true,unconfirmed_serving_label:'250ml'};
  assert.equal(safety.searchSelectionNeedsConfirmation(p),true);const r=safety.searchConfirmationRoute(p,{});assert.equal(r.params.reason,'volume_only');assert.equal(r.params.unconfirmed_serving_label,undefined);
  assert.equal(confirmation(r.params).buttons.length,1);
  assert.equal(safety.searchSelectionNeedsConfirmation({...p,unconfirmed_serving_label:'1 cup (30 g)'}),true);
  assert.equal(safety.searchConfirmationReason({...p,unconfirmed_serving_label:'30 g',nutrition_issue:'volume_basis_requires_confirmation'}),'volume_only');
});

for(const kind of ['scanner','lookup'])test('current '+kind+' does not adapt malformed compatibility responses and 426 always uses update guidance',async()=>{
  for(const platform of ['web','ios'])for(const status of [409,426]){
    const h=harness(kind,platform);
    h.c.fetch=async(url,options)=>{h.requests.push({url,body:JSON.parse(options.body)});return {ok:false,status,json:async()=>{throw Error('invalid response JSON');}};};
    await h.submit();await h.flush();assert.equal(h.requests.length,1);assert.equal(h.adapters.length,0);assert.equal(h.writes.length,0);
    assert.equal(h.routes.some(r=>r.pathname==='/food-details'||r.pathname==='/food-photo-capture'),false);
    if(status===426){assert.equal(h.routes.length,1);assert.equal(h.routes[0].params.reason,'update_required');}
    else if(kind==='scanner'){
      assert.equal(h.routes[0].pathname,'/barcode-lookup');h.c.errorParam=h.routes[0].params.error;
      bind(h.c,'app/barcode-lookup.tsx','performLookup');
      vm.runInContext(compile('globalThis.mountLookupEffect='+effect('app/barcode-lookup.tsx','if (errorParam)')),h.c);
      h.c.mountLookupEffect();await h.flush();assert.equal(h.requests.length,1);
    }else assert.equal(h.states.Error,'barcodeLookup.lookupFailed');
  }
});
test('actual current cache storage is overwritten empty after recognized compatibility409',async()=>{
  const key='@food_search_cache:v3-review:cereal',store=new Map([[key,JSON.stringify({products:cached,timestamp:Date.now()})]]);
  const cache=load('utils/foodSearchCache.ts',{'@react-native-async-storage/async-storage':{getItem:async k=>store.get(k)||null,multiSet:async pairs=>pairs.forEach(([k,v])=>store.set(k,v)),removeItem:async k=>store.delete(k),multiRemove:async ks=>ks.forEach(k=>store.delete(k))}});
  const events=[],api=load('utils/foodSearchHybrid.ts',{'./foodSearchCache':cache,'@/lib/supabase/client':{SUPABASE_PROJECT_URL:'https://fixture.invalid',supabasePublicKey:'public'}},{fetch:async()=>badResponse()});
  await api.hybridSearch('cereal',{onLocalCacheHit:p=>events.push(['local',p.length]),onSupabaseHit:p=>events.push(['server',p.length]),onError:(_s,e)=>events.push(['error',e.message])});
  for(let i=0;i<15;i++)await Promise.resolve();
  assert.deepEqual(events,[['local',1],['server',0],['error','SEARCH_REVIEW_UPDATE_REQUIRED']]);
  assert.equal(JSON.parse(store.get(key)).products.length,0);assert.equal((await cache.getLocalCache('cereal')).length,0);
});

for(const kind of ['scanner','lookup'])for(const platform of ['web','ios'])test('current '+kind+' '+platform+' alias collision overrides found/false confirmation without reading item',async()=>{
  for(const flag of [false,true,undefined]){
    const result={found:true,capture_status:'ambiguous_existing',requires_label_confirmation:flag,source:'supabase'};
    Object.defineProperty(result,'item',{get(){throw Error('Ambiguous catalog identity must not be read');},enumerable:true});
    const h=harness(kind,platform);h.responseQueue.push(result);await h.submit();await h.flush();
    assert.equal(h.requests.length,1);assert.equal(h.adapters.length,0);assert.equal(h.writes.length,0);assert.equal(h.routes.length,1);
    const route=h.routes[0];assert.equal(route.pathname,'/search-food-confirmation');assert.equal(route.params.reason,'catalog_ambiguous');
    for(const key of ['barcode','offData','food_item_id','item','session','proposal','name','source','photo_front_url'])assert.equal(Object.hasOwn(route.params,key),false,key);
    for(const key of ['mode','planId','meal','date','mealId','context','returnTo','itemId','itemTable'])assert.equal(route.params[key],h.c.params[key],key);
    for(const language of ['en','es']){
      const ui=confirmation(route.params,language);assert.equal(ui.routes.length,0);assert.equal(ui.buttons.length,1);
      assert.match(text(ui.tree),language==='es'?/Registros de catálogo en conflicto/:/Conflicting catalog records/);
      assert.match(text(ui.tree),language==='es'?/Una foto o el ingreso manual no pueden resolver/:/A photo or manual entry cannot safely resolve/);
      ui.buttons[0].props.onPress();assert.deepEqual(ui.routes,['back']);
    }
  }
});
for(const kind of ['scanner','lookup'])for(const platform of ['web','ios'])test('current '+kind+' '+platform+' dismissed alias collision cannot navigate after JSON resolves',async()=>{
  const json=defer(),h=harness(kind,platform,{jsonWait:json.promise});
  const response={found:true,capture_status:'ambiguous_existing',requires_label_confirmation:false,source:'supabase'};
  Object.defineProperty(response,'item',{get(){throw Error('late ambiguous item read');}});h.responseQueue.push(response);
  const pending=h.submit();await h.flush();h.cancel();json.resolve();await pending;await h.flush();
  assert.equal(h.requests.length,1);assert.equal(h.routes.length,0);assert.equal(h.adapters.length,0);assert.equal(h.writes.length,0);
});
