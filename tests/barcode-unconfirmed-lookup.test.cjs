const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require(process.env.BARCODE_RECOVERY_NODE_MODULES+'/typescript');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
function callback(source,name){
 const ast=ts.createSourceFile('screen.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);let found;
 const walk=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)found=n.initializer;ts.forEachChild(n,walk);};walk(ast);
 assert.ok(found,name);if(ts.isCallExpression(found))found=found.arguments[0];return found.getText(ast);
}
function helper(file){const m={exports:{}};vm.runInNewContext(ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports});return m.exports;}
function fixture(screen,platform='ios',fetcher,overrides={}){
 const route=[],requests=[],adapters=[],writes=[],params={barcode:'012345678905',mode:'meal-plan',planId:'plan',meal:'lunch',date:'2026-11-06',context:'my_meals_builder',returnTo:'builder',mealId:'draft',itemId:'history',itemTable:'meal_items',offData:'UNTRUSTED',food_item_id:'unsigned-id',proposal:'unsigned',session:'not-signed',...overrides};
 const c=vm.createContext({console:{log(){},error(){}},AbortController,setTimeout(){return 1;},clearTimeout(){},...helper('utils/recoveryRouteContext.ts'),...helper('utils/packageBarcodeInput.ts'),
  Platform:{OS:platform},SUPABASE_PROJECT_URL:'https://fixture.invalid',params,barcode:params.barcode,mealType:params.meal,date:params.date,mode:params.mode,context:params.context,returnTo:params.returnTo,myMealId:params.mealId,planId:params.planId,es:false,LOOKUP_TIMEOUT_MS:10000,
  webGeneration:{current:0},webRequest:{current:null},isMountedRef:{current:true},isClosingRef:{current:false},hasScannedRef:{current:false},webBarcode:params.barcode,
  setWebBusy(){},setWebError(){},setLoading(){},setError(){},setNotFound(){},t:k=>k,
  supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'owner'},access_token:'fixture-token'}}})},from(){writes.push('from');throw Error('Unexpected database use');}},
  router:{push:p=>route.push({method:'push',...p}),replace:p=>route.push({method:'replace',...p}),back:()=>route.push({method:'back'})},
  buildSyntheticOffData:item=>{adapters.push(item);return {product_name:item.name,code:item.barcode,nutriments:{}};},
  fetch:async(url,options)=>{assert.match(url,/\/lookup-barcode$/);requests.push(JSON.parse(options.body));return fetcher?fetcher():{ok:true,json:async()=>({found:false})};},
 });
 const source=read(screen==='scanner'?'app/barcode-scanner.tsx':'app/barcode-lookup.tsx');
 for(const name of screen==='scanner'?['performLookupAndNavigate','handleBarCodeScanned','submitWebBarcode']:['performLookup']){
  vm.runInContext(ts.transpileModule('globalThis.'+name+' = '+callback(source,name)+';',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);
 }
 return {c,route,requests,adapters,writes,params,run:()=>screen==='scanner'?c.performLookupAndNavigate(params.barcode):c.performLookup()};
}
const flush=async()=>{for(let n=0;n<30;n++)await Promise.resolve();};
const proposal=()=>({found:true,persisted:false,requires_label_confirmation:true,source:'ai_unverified',item:{id:'MUST-NOT-FORWARD',name:'AI proposal',calories:999,ai_verified:false,proposal:'not-signed',session:'not-signed',_nutrition_provenance:{kind:'single_label_read'}}});
function assertRecovery(h){
 assert.equal(h.route.length,1);assert.equal(h.route[0].pathname,'/food-photo-capture');const p=h.route[0].params;
 for(const k of ['mode','planId','meal','date','context','returnTo','mealId','itemId','itemTable'])assert.equal(p[k],h.params[k],k);
 assert.equal(p.barcode,'012345678905');assert.equal(p.type,'new_product');
 for(const k of ['offData','food_item_id','item','name','brand','proposal','session','_nutrition_provenance'])assert.equal(p[k],undefined,k);
 assert.equal(h.adapters.length,0);assert.equal(h.writes.length,0);assert.deepEqual(plain(h.requests),[{barcode:'012345678905',review_capability:'label_confirmation_v1'}]);
}
for(const [screen,platform] of [['scanner','web'],['scanner','ios'],['lookup','ios']])test(`${screen}/${platform} flagged found ignores entire AI item and opens explicit evidence prompt`,async()=>{
 const response=proposal();Object.defineProperty(response,'item',{get(){throw Error('AI proposal was accessed');}});
 const h=fixture(screen,platform,async()=>({ok:true,json:async()=>response}));await h.run();await flush();assertRecovery(h);
});
for(const [screen,platform] of [['scanner','web'],['scanner','ios'],['lookup','ios']])test(`${screen}/${platform} present malformed flags fail closed without touching item`,async()=>{
 for(const malformed of ['true',1,{},null,[],undefined]){
  const response={...proposal(),requires_label_confirmation:malformed};Object.defineProperty(response,'item',{get(){throw Error('Malformed response item was accessed');}});
  const h=fixture(screen,platform,async()=>({ok:true,json:async()=>response}));await h.run();await flush();assertRecovery(h);
 }
});
for(const screen of ['scanner','lookup'])test(`${screen} ordinary found remains on existing details path`,async()=>{
 const h=fixture(screen,'ios',async()=>({ok:true,json:async()=>({found:true,persisted:true,requires_label_confirmation:false,item:{id:'known',name:'Canonical',barcode:'012345678905'}})}));await h.run();assert.equal(h.route[0].pathname,'/food-details');assert.equal(h.route[0].params.food_item_id,'known');assert.equal(h.adapters.length,1);assert.equal(h.requests.length,1);assert.equal(h.writes.length,0);
});
test('native repeated scan events make one lookup and one explicit-recovery route',async()=>{
 const h=fixture('scanner','ios',async()=>({ok:true,json:async()=>proposal()}));h.c.handleBarCodeScanned({type:'ean13',data:'012345678905'});h.c.handleBarCodeScanned({type:'ean13',data:'012345678905'});await flush();assertRecovery(h);
});
test('web repeated submits make one lookup and never start recovery automatically',async()=>{
 const h=fixture('scanner','web',async()=>({ok:true,json:async()=>proposal()}));h.c.submitWebBarcode();h.c.submitWebBarcode();await flush();assertRecovery(h);await flush();assert.equal(h.requests.length,1);
});
for(const screen of ['scanner','lookup'])test(`${screen} dismiss during late flagged JSON suppresses route and adaptation`,async()=>{
 let release;const body=new Promise(r=>release=r),h=fixture(screen,screen==='scanner'?'web':'ios',async()=>({ok:true,json:()=>body}));const work=h.run();await flush();h.c.isMountedRef.current=false;h.c.isClosingRef.current=true;h.c.webGeneration.current++;release(proposal());await work;assert.equal(h.route.length,0);assert.equal(h.adapters.length,0);assert.equal(h.writes.length,0);assert.equal(h.requests.length,1);
});
test('new-product route fails closed rather than rendering legacy capture when recovery is unavailable',()=>{
 const source=read('app/food-photo-capture.tsx');const branch=source.indexOf("if(params.type==='new_product')return <BarcodeRecoveryScreen");assert.ok(branch>0);assert.ok(branch<source.indexOf('return enabled?<BarcodeRecoveryScreen/>:<LegacyFoodPhotoCaptureScreen/>'));
 assert.match(source,/unknownEnabled=\{enabled===true&&unknownEnabled\}/);
});

for(const screen of ['scanner','lookup'])test(`${screen}: reserved identity cannot enter paid photo/manual recovery or consume a proposed food`,async()=>{
 for(const platform of ['web','ios']){
  const result={found:true,persisted:false,requires_label_confirmation:false,capture_status:'identity_reserved'};
  Object.defineProperty(result,'item',{get(){throw Error('Reserved food must not be used');}});
  const h=fixture(screen,platform,async()=>({ok:true,json:async()=>result}));await h.run();await flush();
  assert.equal(h.route.length,1);assert.equal(h.route[0].pathname,'/search-food-confirmation');assert.equal(h.route[0].params.reason,'catalog_ambiguous');
  for(const key of ['food_item_id','offData','item','session','proposal','barcode'])assert.equal(h.route[0].params[key],undefined);
  assert.equal(h.adapters.length,0);assert.equal(h.writes.length,0);assert.equal(h.requests.length,1);
 }
});
