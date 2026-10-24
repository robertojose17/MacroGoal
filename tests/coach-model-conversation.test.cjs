const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpile(fs.readFileSync(f,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}),f);
const {parseMealConversation,mealConversationInput}=require('../utils/coachMealConversation');const {mealEvidenceFromOption}=require('../utils/coachMealReviewAdapter');
const handoff=()=>({schema:'meal_conversation_v1',fields:{exclusions:[],allergens:[],dietary_preferences:[],provenance:'user_provided',verification:'unverified',mode:'eat_out',food_query:'meal',public_area:'San Juan',restaurant:null,preference:'high_protein'},status:'ready',question:null,requires_search_consent:true,constraints_review_required:true,options:[]});
test('model handoff retains area-first fields but never accepts food actions or fabricated sources',()=>{const h=parseMealConversation(handoff());assert.ok(h);assert.deepEqual(mealConversationInput(h,{exclusions:['onion'],allergens:['milk']}),{mode:'eat_out',food_query:'meal',public_area:'San Juan',preference:'high_protein',exclusions:['onion'],allergens:['milk'],dietary_preferences:[]});for(const patch of [{requires_search_consent:false},{options:[{calories:500}]},{source_url:'https://example.com'},{fields:{...h.fields,public_area:null}},{schema:'other'}])assert.equal(parseMealConversation({...h,...patch}),null);const clarify=parseMealConversation({...h,fields:{...h.fields,public_area:null},status:'clarify',question:{key:'public_area'}});assert.ok(clarify);assert.equal(mealConversationInput(clarify,{exclusions:[],allergens:[]}),null);});
test('venue address requires its own validated source and never gains invented images',()=>{const row={id:'one',name:'Bowl',provenance:{kind:'official',source_url:'https://example.com/menu'},nutrition:{authority:'estimated',basis:{amount:1,unit:'serving',label:'one bowl'},values:{calories:500,protein:30,carbs:50,fats:15,fiber:4},assumptions:[]},ingredients:[],instructions:[],allergy_status:'requires_review',review_required:true,venue:{name:'Restaurant',source_url:'https://example.com',address:'1 Main St'}};assert.equal(mealEvidenceFromOption(row,'eat_out').venue.address,undefined);row.venue.address_source_url='https://example.com/locations';assert.equal(mealEvidenceFromOption(row,'eat_out').venue.address,'1 Main St');row.venue.address_source_url='javascript:bad';assert.equal(mealEvidenceFromOption(row,'eat_out').venue.address,undefined);});
function harness(premium=true,language='en'){const React=require('react'),original=Module._load,states=[],refs=[],calls=[],effects=[];let cursor=0,ref=0;const fake={...React,useState(init){const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useEffect(fn){effects.push(fn)},useRef(init){const i=ref++;return refs[i]??(refs[i]={current:init})}};Module._load=function(n,parent,isMain){if(n==='react')return fake;if(n==='react-native')return new Proxy({StyleSheet:{create:x=>x},Linking:{openURL:x=>calls.push({url:x})}},{get:(o,k)=>o[k]??String(k)});if(n==='expo-router')return {useRouter:()=>({push:r=>calls.push({route:r})})};if(n==='react-i18next')return {useTranslation:()=>({i18n:{language}})};if(n.startsWith('@/'))return original.call(this,path.resolve(__dirname,'..',n.slice(2)),parent,isMain);return original.call(this,n,parent,isMain);};const option={id:'bowl',name:'Chicken bowl',kind:'restaurant',provenance:{kind:'official',label:'Menu',url:'https://example.com/menu'},nutrition:{authority:'estimated',basis:{amount:1,unit:'serving',label:'one bowl'},values:{calories:500,protein:30,carbs:50,fats:15,fiber:4},assumptions:[]},allergyStatus:'requires_review'};const source={kind:'ready',owner:'A',date:'2026-10-22',meal:'lunch',mode:'eat_out',requestId:'owned',options:[option],capabilities:{estimate:false,discovery:false,reason:null}};const service={owner:async()=> 'A',today:()=> '2026-10-22',pending:async()=>null,subscribeInvalidation:()=>()=>{},explore:async(_a,input)=>{calls.push({operation:'explore',input});return source},review:(src,id)=>{calls.push({operation:'review',meal:src.meal,id});return {invalidate(){}}}};const file=require.resolve('../components/CoachConversationActions.tsx');delete require.cache[file];const Component=require(file).default,props={service,handoff:{value:handoff(),owner:'A',date:'2026-10-22'},hasConversation:true,isPremium:premium,premiumLoading:false,gated:false,busy:false};const text=n=>n==null?'':typeof n==='string'||typeof n==='number'?String(n):React.Children.toArray(n.props?.children).map(text).join(' '),nodes=n=>!n||typeof n!=='object'?[]:[n,...React.Children.toArray(n.props?.children).flatMap(nodes)];return {calls,props,states,effects,render(){cursor=ref=0;effects.length=0;return Component(props)},button(tree,label){return nodes(tree).find(n=>n.props?.accessibilityRole==='button'&&text(n)===label)},text,restore(){Module._load=original}};}
test('actual model action component does not explore on receipt; Add to meal requires explicit meal choice and only opens review',async()=>{const h=harness();try{let tree=h.render();assert.equal(h.calls.length,0);h.button(tree,'Find meal options').props.onPress();await new Promise(r=>setImmediate(r));assert.equal(h.calls.length,1);assert.equal('restaurant' in h.calls[0].input,false);tree=h.render();assert.match(h.text(tree),/Chicken bowl/);h.button(tree,'Add to meal').props.onPress();assert.equal(h.calls.length,1);tree=h.render();h.button(tree,'Dinner').props.onPress();await new Promise(r=>setImmediate(r));assert.deepEqual(h.calls[1],{operation:'review',meal:'dinner',id:'bowl'});assert.equal(h.calls[2].route.pathname,'/recipe-finder-detail');assert.equal(h.calls.some(c=>c.operation==='log'),false);}finally{h.restore()}});
test('free and stale owner handoffs cannot trigger personalized exploration',async()=>{const free=harness(false);try{assert.equal(free.button(free.render(),'Find meal options').props.disabled,true);assert.equal(free.calls.length,0);}finally{free.restore()}const h=harness();try{h.props.handoff.owner='other';h.button(h.render(),'Find meal options').props.onPress();await new Promise(r=>setImmediate(r));assert.equal(h.calls.length,0);}finally{h.restore()}});

test('actual chat hook renders committed SSE with installed React Native Response lacking body, preserving text, handoff and owner isolation',async()=>{
 for(const changed of [false,true,'consumer_failure','unmounted']){
  const original=Module._load,NativeResponse=global.Response,states=[],refs=[],requests=[],journalRows=new Map(),restoreEffects=[];global.Response=require('whatwg-fetch').Response;assert.equal(new Response('committed').body,undefined);if(changed==='consumer_failure')global.Response=class extends require('whatwg-fetch').Response{text(){return Promise.reject(Error('consumer_read_failure'))}};let cursor=0,ref=0,unmount=()=>{};const fake={useState(init){const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useEffect(fn){if(fn.toString().includes('isMountedRef.current = true'))unmount=fn();if(fn.toString().includes('restoreAccepted'))restoreEffects.push(fn)},useCallback:f=>f,useRef(init){const i=ref++;return refs[i]??(refs[i]={current:init})}};
  Module._load=function(n,parent,isMain){if(n==='react')return fake;if(n==='@react-native-async-storage/async-storage')return {getItem:async k=>journalRows.get(k)??null,setItem:async(k,v)=>journalRows.set(k,v),removeItem:async k=>journalRows.delete(k)};if(n==='@/lib/supabase/client')return {SUPABASE_PROJECT_URL:'https://offline.invalid',supabase:{auth:{getSession:async()=>({data:{session:{access_token:'offline',user:{id:'A'}}}}),getUser:async()=>({data:{user:{id:changed===true&&requests.length?'B':'A'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>{throw Error('unexpected write')}}};if(n==='expo/fetch')return {fetch:async(_url,init)=>{requests.push(JSON.parse(init.body));if(changed==='unmounted')unmount();const data='data: '+JSON.stringify({token:'Podemos buscar opciones en San Juan.'})+'\n\ndata: '+JSON.stringify({done:true,corrected_text:'Podemos buscar opciones en San Juan.',request_id:requests.at(-1).request_id,meal_conversation:handoff()});return new NativeResponse(new ReadableStream({start(controller){const bytes=new TextEncoder().encode(data);controller.enqueue(bytes.slice(0,49));controller.enqueue(bytes.slice(49));controller.close();}}),{headers:{'content-type':'text/event-stream'}});}};if(n==='@/lib/i18n')return {__esModule:true,default:{language:'es',t:k=>k}};if(n.startsWith('@/'))return original.call(this,path.resolve(__dirname,'..',n.slice(2)),parent,isMain);return original.call(this,n,parent,isMain)};
  try{const file=require.resolve('../hooks/useAICoach.ts');delete require.cache[file];const hook=require(file).useAICoach({mealConversation:true});await hook.sendMessage([{role:'user',content:'restaurant nearby, lo que sea que tenga buenos macros',timestamp:Date.now()}]).catch(e=>{if(!changed)throw e});assert.equal(requests.length,1);assert.equal(requests[0].use_web,undefined);assert.equal(requests[0].experience,'conversation_v1');assert.equal(requests[0].language,'es');if(changed){assert.equal(states[3].some(m=>m.mealConversation),false);assert.equal(journalRows.size,1);continue;}const assistant=states[3].find(m=>m.role==='assistant');assert.equal(assistant.content,'Podemos buscar opciones en San Juan.');assert.equal(assistant.isStreaming,false);assert.equal(journalRows.size,1);assert.ok([...journalRows.keys()][0].endsWith(':accepted'));assert.equal(!!assistant.mealConversation,!changed);if(!changed){assert.deepEqual(assistant.mealConversation.value,handoff());assert.equal(assistant.mealConversation.requestId,requests[0].request_id);states.length=0;refs.length=0;cursor=ref=0;states[5]={conversationId:null,hasHistory:false};require(file).useAICoach({mealConversation:true});const cleanup=restoreEffects.at(-1)();await new Promise(r=>setImmediate(r));assert.equal(requests.length,1);assert.equal(states[3].find(m=>m.role==='assistant').content,'Podemos buscar opciones en San Juan.');assert.deepEqual(states[3].find(m=>m.role==='assistant').mealConversation.value,handoff());cleanup();}}finally{Module._load=original;global.Response=NativeResponse;}
 }
});

test('restarted history offers explicit saved options restore, not automatic search or Add',async()=>{const h=harness();try{h.props.handoff=undefined;h.render();h.states[6]=true;h.props.service.restore=async()=>{h.calls.push({operation:'restore'});return {kind:'unavailable',reason:'saved_options_unavailable'}};let tree=h.render();assert.equal(h.calls.length,0);h.button(tree,'Resume meal search').props.onPress();await new Promise(r=>setImmediate(r));assert.deepEqual(h.calls,[{operation:'restore'}]);tree=h.render();assert.ok(h.button(tree,'Resume meal search'));assert.equal(h.button(tree,'Add to meal'),undefined);}finally{h.restore()}});

test('draft allergen from negated user wording is removable before explicit confirmation, empty is not no allergies',async()=>{const h=harness();try{h.props.handoff.value.fields.allergens=['peanuts'];let tree=h.render();assert.doesNotMatch(h.text(tree),/preferences in mind|Check what I captured/);assert.equal(h.calls.length,0);h.button(tree,'Change preferences').props.onPress();tree=h.render();h.button(tree,'Remove: peanuts').props.onPress();tree=h.render();assert.doesNotMatch(h.text(tree),/no allergies|allergen.free/i);h.button(tree,'Find meal options').props.onPress();await new Promise(r=>setImmediate(r));assert.deepEqual(h.calls[0].input.allergens,[]);assert.deepEqual(h.calls[0].input.dietary_preferences,[]);}finally{h.restore()}});
test('older unsized restaurant card must resume before estimate and then owns the shared portion composer',async()=>{const h=harness();try{let composer;h.props.active=false;h.props.onResume=()=>h.props.active=true;h.props.onComposer=v=>composer=v;h.render();h.states[0]={kind:'ready',owner:'A',date:'2026-10-22',requestId:'owned',meal:'lunch',mode:'eat_out',options:[{id:'bowl',name:'Bowl',kind:'restaurant',provenance:{kind:'official',url:'https://example.com'},nutrition:{authority:'unknown',basis:{amount:1,unit:'serving',label:'Bowl'},values:{calories:null,protein:null,carbs:null,fats:null,fiber:null},assumptions:[]},allergyStatus:'requires_review'}],capabilities:{estimate:true,discovery:false,reason:null}};let tree=h.render();assert.equal(h.button(tree,'Estimate nutrition'),undefined);h.button(tree,'Resume these meal options').props.onPress();tree=h.render();h.button(tree,'Estimate nutrition').props.onPress();tree=h.render();h.effects[0]();assert.ok(composer);assert.equal(composer.submit('one regular bowl'),true);tree=h.render();h.props.service.estimate=async(_a,_r,_id,portion)=>{h.calls.push({operation:'estimate',portion});return {kind:'unavailable',reason:'offline'}};h.button(tree,'Confirm estimate').props.onPress();await new Promise(r=>setImmediate(r));assert.deepEqual(h.calls,[{operation:'estimate',portion:'one regular bowl'}]);}finally{h.restore()}});

test('actual hook reload merges remote and accepted turns once despite timestamp drift',async()=>{
 const original=Module._load,states=[],refs=[],effects=[],calls=[],store=new Map();let cursor=0,ref=0,owner='A';
 const now=Date.now(),date=require('../utils/dateUtils').toLocalDateString();
 const turns=[['Quiero ayuda para decidir qué cenar.','Of course, I can help with that.'],['Prefiero cocinar en casa.','Got it.'],['¿Qué preferencia te acabo de indicar?','You prefer to cook at home.'],['Recuérdamelo.','You prefer to cook at home.'],['Recuérdamelo.','You prefer to cook at home.'],['¿Algo más?','We can continue when you are ready.']];
 const accepted=turns.map(([user,reply],i)=>({owner:'A',date,requestId:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,user:{content:user,timestamp:now+i*120000},reply:{content:reply,timestamp:now+i*120000+1000,mealConversation:handoff()}}));
 const remote=accepted.slice(0,5).flatMap((r,i)=>[{id:`remote-user-${i}`,role:'user',content:r.user.content,created_at:new Date(r.user.timestamp+60000).toISOString()},{id:`remote-reply-${i}`,role:'assistant',content:r.reply.content,created_at:new Date(r.reply.timestamp+90000).toISOString()}]);
 const key=`coach_conversation_v1:${JSON.stringify(['https://offline.invalid','A',date])}:accepted`;store.set(key,JSON.stringify(accepted));
 const fake={useState(init){const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useEffect(fn){effects.push(fn)},useCallback:f=>f,useRef(init){const i=ref++;return refs[i]??(refs[i]={current:init})}};
 Module._load=function(n,parent,isMain){if(n==='react')return fake;if(n==='@react-native-async-storage/async-storage')return {getItem:async k=>store.get(k)??null,setItem:async(k,v)=>store.set(k,v),removeItem:async k=>store.delete(k)};if(n==='@/lib/supabase/client')return {SUPABASE_PROJECT_URL:'https://offline.invalid',supabase:{auth:{getSession:async()=>({data:{session:{access_token:'offline',user:{id:owner}}}}),getUser:async()=>({data:{user:{id:owner}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}}};if(n==='expo/fetch')return {fetch:async(url,init)=>{calls.push({url,method:init.method});assert.equal(init.method,'GET');return new Response(JSON.stringify(url.endsWith('/messages')?remote:[{id:'today',created_at:new Date().toISOString()}]),{headers:{'content-type':'application/json'}})}};if(n==='@/lib/i18n')return {__esModule:true,default:{language:'en',t:k=>k}};if(n.startsWith('@/'))return original.call(this,path.resolve(__dirname,'..',n.slice(2)),parent,isMain);return original.call(this,n,parent,isMain)};
 try{
  const file=require.resolve('../hooks/useAICoach.ts');delete require.cache[file];const useHook=require(file).useAICoach;
  const render=()=>{cursor=ref=0;effects.length=0;return useHook({mealConversation:true})};
  render();effects.find(f=>f.toString().includes('Initializing conversation history'))();await new Promise(r=>setImmediate(r));
  assert.equal(states[3].length,10);assert.equal(states[5].hasHistory,true);
  render();let cleanup=effects.find(f=>f.toString().includes('restoreAccepted'))();await new Promise(r=>setImmediate(r));
  assert.equal(states[3].length,12);assert.deepEqual(states[3].map(m=>m.content),turns.flat());
  for(let i=0;i<10;i++){assert.equal(states[3][i].id,remote[i].id);assert.equal(states[3][i].timestamp,Date.parse(remote[i].created_at));}
  assert.equal(states[3][11].timestamp,accepted[5].reply.timestamp);assert.ok(states[3][1].mealConversation);assert.equal(states[3][1].mealConversation.requestId,accepted[0].requestId);
  cleanup();render();cleanup=effects.find(f=>f.toString().includes('restoreAccepted'))();await new Promise(r=>setImmediate(r));assert.equal(states[3].length,12);cleanup();
  remote.splice(2,2); // A missing middle turn must also retain order without duplicate neighbors.
  states.length=refs.length=0;render();effects.find(f=>f.toString().includes('Initializing conversation history'))();await new Promise(r=>setImmediate(r));render();cleanup=effects.find(f=>f.toString().includes('restoreAccepted'))();await new Promise(r=>setImmediate(r));assert.equal(states[3].length,12);cleanup();
  const reload=async()=>{states.length=refs.length=0;render();effects.find(f=>f.toString().includes('Initializing conversation history'))();await new Promise(r=>setImmediate(r));render();const dispose=effects.find(f=>f.toString().includes('restoreAccepted'))();await new Promise(r=>setImmediate(r));dispose();};
  const orphan={id:'remote-orphan',role:'assistant',content:accepted[0].reply.content,created_at:new Date(now+90000).toISOString()};
  remote.splice(0,remote.length,orphan);store.set(key,JSON.stringify([accepted[0]]));await reload();
  assert.deepEqual(states[3].map(m=>m.content),turns[0]);assert.equal(states[3][1].id,orphan.id);assert.equal(states[3][1].timestamp,Date.parse(orphan.created_at));assert.ok(states[3][1].mealConversation);
  await reload();assert.equal(states[3].length,2);assert.equal(store.get(key),JSON.stringify([accepted[0]]));
  // Ambiguous identical replies are never silently discarded or reassigned.
  remote.push({...orphan,id:'another-orphan'});await reload();assert.equal(states[3].filter(m=>m.role==='assistant').length,3);assert.ok(states[3].some(m=>m.id===orphan.id));assert.ok(states[3].some(m=>m.id==='another-orphan'));
  remote.splice(1,1);store.set(key,JSON.stringify([accepted[0],{...accepted[1],reply:accepted[0].reply}]));await reload();assert.equal(states[3].filter(m=>m.role==='assistant').length,3);
  owner='B';states[3]=[];render();cleanup=effects.find(f=>f.toString().includes('restoreAccepted'))();await new Promise(r=>setImmediate(r));assert.deepEqual(states[3],[]);cleanup();
  assert.equal(calls.length,12);assert.ok(calls.every(c=>c.method==='GET'&&!c.url.endsWith('/ai-coach')));
 }finally{Module._load=original;}
});

test('specific food handoff survives client exploration input and search disclosure without generic substitution',()=>{
 const {mealSearchDisclosure}=require('../utils/coachMealCopy');
 for(const food of ['grilled chicken, rice and vegetables','pollo a la parrilla con arroz y vegetales']){
  const value=parseMealConversation({...handoff(),fields:{...handoff().fields,food_query:food,public_area:'Orlando, Florida'}});
  assert.ok(value);const input=mealConversationInput(value,{exclusions:[],allergens:[]});
  assert.equal(input.food_query,food);assert.equal(input.public_area,'Orlando, Florida');
  const request={food:input.food_query,area:input.public_area,preference:input.preference};
  for(const es of [false,true]){const lines=mealSearchDisclosure(request,es);assert.ok(lines.includes((es?'Buscar: ':'Look for: ')+food));assert.ok(lines.some(line=>line.includes('Orlando, Florida')));}
 }
});

test('terminal search retry shows original details and requires a separate explicit confirmation with no automatic execution',async()=>{
 const h=harness();try{
  const offer={kind:'retry_available',reason:'search_stopped',owner:'A',date:'2026-10-22',meal:'dinner',mode:'eat_out',requestId:'old-request',publicRequest:{food:'grilled chicken rice and vegetables',area:'Orlando, Florida',mode:'restaurant',preference:'high_protein'}};
  h.render();h.states[0]=offer;h.states[2]=true;h.props.service.retrySearch=async(_access,value)=>{h.calls.push({operation:'retrySearch',value});return {kind:'pending',reason:'unknown'}};
  let tree=h.render();assert.equal(h.calls.length,0);assert.match(h.text(tree),/grilled chicken rice and vegetables/);assert.match(h.text(tree),/Orlando, Florida/);assert.match(h.text(tree),/earlier attempt may still count/);assert.equal(h.button(tree,'Retry search'),undefined);
  h.button(tree,'Not now').props.onPress();tree=h.render();assert.equal(h.calls.length,0);assert.ok(h.button(tree,'Retry search'));
  h.states[0]=offer;tree=h.render();const submit=h.button(tree,'Confirm new search');submit.props.onPress();submit.props.onPress();await new Promise(r=>setImmediate(r));assert.equal(h.calls.length,1);assert.equal(h.calls[0].value,offer);
 }finally{h.restore()}
});

test('actual component + services + journal retain a rejected child and replace consumed consent with a visible failure across recovery',async()=>{
 for(const format of ['http','sse','conflict_recovery','final_owner_failure','day_change','unmounted']){
  const h=harness();let cleanup;
  try{
   const {createMealTransport}=require('../utils/coachMealTransport'),{createMealServices}=require('../utils/coachMealServices');
   const {stoppedCoachResult}=require('../supabase/functions/ai-coach/_shared/coach-execution');
   const {coachResponseSSEFrame}=require('../supabase/functions/ai-coach/_shared/coach-recommendation-contract');
   const parent='11111111-1111-4111-8111-111111111111',source='22222222-2222-4222-8222-222222222222',child='33333333-3333-4333-8333-333333333333';
   const date='2026-10-22',scope='outer-controller-'+format,key='coach_meal_v2:'+JSON.stringify([scope,'A',date]);
   const original={owner:'A',date,meal:'dinner',mode:'eat_out',recovery:'discovery',envelope:{intent:'meal_choice',experience:'meal_v2',operation:'discover',source_request_id:source,consent:true,request_id:parent,time_zone:'UTC'}};
   const rows=new Map([[key,JSON.stringify(original)]]),calls=[];let minted=0,remaining=Infinity,day=date,unmountedState,failOwnerOnce=true,childRequests=0;
   const owner=async()=>remaining-->0?'A':undefined,store={getItem:async k=>rows.get(k)??null,setItem:async(k,v)=>rows.set(k,v),removeItem:async k=>rows.delete(k)};
   const deps={scope,owner,today:()=>day,zone:()=> 'UTC',newId:()=>{minted++;return child},store,invoke:async body=>{
    calls.push(body);
    if(body.intent==='recover_daily')return Response.json({schema:'meal_explore_v1',owner:'A',date,status:'discovery_available',options:[],paid_capabilities:{discovery:true,estimate:false},discovery_request:{food:'grilled chicken rice and vegetables',area:'Orlando, Florida',mode:'restaurant'}});
    assert.equal(body.operation,'discover');
    if(body.request_id===child){assert.deepEqual(JSON.parse(rows.get(key)).envelope,body);assert.equal(body.retry_of_request_id,parent);if(format==='final_owner_failure'&&failOwnerOnce){remaining=1;failOwnerOnce=false;}if(format==='day_change')day='2026-10-23';if(format==='unmounted'){cleanup();cleanup=undefined;unmountedState=JSON.stringify(h.states);}}
    if(body.request_id===child&&++childRequests>1&&format==='conflict_recovery')return Response.json({error:'conflict'},{status:409});
    const stopped={error:'execution_stopped',request_id:body.request_id,execution_state:'stopped',retry_of_request_id:body.retry_of_request_id??null,retry_eligible:true,successor_request_id:null};
    // schema_complexity/HTTP400 is private provider diagnostics. The real server
    // publishes this bounded stopped result, not that internal diagnostic string.
    return format==='sse'&&body.request_id===child?new Response(coachResponseSSEFrame(stoppedCoachResult(stopped,'es','uncertain')),{headers:{'content-type':'text/event-stream'}}):Response.json(stopped,{status:409});
   }};
   const services=()=>createMealServices({transport:createMealTransport(deps),owner,today:()=>day,store,subscribeInvalidation:()=>()=>{},write:async()=>{throw Error('unexpected diary write')}});
   h.props.service=services();h.render();cleanup=h.effects.at(-1)();await new Promise(r=>setImmediate(r));
   let tree=h.render();h.button(tree,'Retry search').props.onPress();await new Promise(r=>setImmediate(r));tree=h.render();
   assert.match(h.text(tree),/grilled chicken rice and vegetables/);assert.match(h.text(tree),/Orlando, Florida/);assert.equal(minted,0);
   const confirm=h.button(tree,'Confirm new search');confirm.props.onPress();confirm.props.onPress();await new Promise(r=>setImmediate(r));tree=h.render();
   assert.equal(minted,1);assert.equal(calls.filter(c=>c.request_id===child).length,1);assert.equal(h.button(tree,'Confirm new search'),undefined);
   if(format==='unmounted'){assert.equal(JSON.stringify(h.states),unmountedState);assert.equal(JSON.parse(rows.get(key)).envelope.request_id,child);continue;}
   assert.match(h.text(tree),['final_owner_failure','day_change'].includes(format)?/session needs checking/:/I could not complete this search. Your choices are saved/);
   const persisted=rows.get(key);assert.equal(JSON.parse(persisted).envelope.request_id,child);assert.equal(rows.get(key+':stopped:'+parent),JSON.stringify(original));
   if(format==='day_change'){assert.equal(await h.props.service.pending(()=>h.props),null);assert.equal(rows.get(key),persisted);continue;}
   remaining=Infinity;cleanup();h.props.service=services();h.render();cleanup=h.effects.at(-1)();await new Promise(r=>setImmediate(r));
   tree=h.render();h.button(tree,'Retry search').props.onPress();await new Promise(r=>setImmediate(r));tree=h.render();
   assert.equal(minted,1);assert.equal(rows.get(key),persisted);assert.equal(calls.filter(c=>c.operation==='discover').at(-1).request_id,child);
   if(format==='conflict_recovery'){assert.equal(h.button(tree,'Confirm new search'),undefined);assert.equal(h.states[0].reason,'conflict');assert.match(h.text(tree),/I could not complete this search/);assert.equal(calls.filter(c=>c.intent==='recover_daily').length,1);continue;}
   assert.ok(h.button(tree,'Confirm new search'));
   assert.equal(h.states[0].requestId,child);assert.match(h.text(tree),/grilled chicken rice and vegetables/);assert.match(h.text(tree),/Orlando, Florida/);
   assert.equal(calls.filter(c=>c.intent==='recover_daily').length,2);assert.equal(calls.some(c=>c.operation==='import_discovery'),false);
  }finally{cleanup?.();h.restore();}
 }
});

test('retry confirmation with unavailable initial owner displays session failure without dispatch',async()=>{
 const h=harness();try{h.render();h.states[0]={kind:'retry_available',reason:'search_stopped',owner:'A',date:'2026-10-22',meal:'dinner',mode:'eat_out',requestId:'parent',publicRequest:{food:'chicken',area:'Orlando'}};h.props.service.owner=async()=>undefined;h.props.service.retrySearch=async()=>{throw Error('must not dispatch')};h.button(h.render(),'Confirm new search').props.onPress();await new Promise(r=>setImmediate(r));const tree=h.render();assert.equal(h.button(tree,'Confirm new search'),undefined);assert.match(h.text(tree),/session needs checking/);assert.equal(h.calls.length,0);}finally{h.restore();}
});

test('mounted scope resets clear busy and older completions cannot unlock a newer action',async()=>{
 for(const reset of ['invalidation','day','service','handoff']){
  const h=harness(),originalInterval=global.setInterval,originalClear=global.clearInterval;let cleanup,tick,invalidate,day='2026-10-22';
  global.setInterval=fn=>{tick=fn;return 1};global.clearInterval=()=>{};
  try{
   const deferred=[];h.props.service.today=()=>day;h.props.service.subscribeInvalidation=(_owner,fn)=>{invalidate=fn;return()=>{}};
   h.props.service.retrySearch=()=>new Promise(resolve=>deferred.push(resolve));
   h.render();cleanup=h.effects.at(-1)();await new Promise(r=>setImmediate(r));
   const offer=()=>({kind:'retry_available',reason:'search_stopped',owner:'A',date:day,meal:'dinner',mode:'eat_out',requestId:'parent',publicRequest:{food:'chicken',area:'Orlando'}});
   h.states[0]=offer();h.button(h.render(),'Confirm new search').props.onPress();await new Promise(r=>setImmediate(r));assert.equal(deferred.length,1);assert.equal(h.states[1],true);
   if(reset==='invalidation')invalidate();
   else if(reset==='day'){day='2026-10-23';tick();}
   else{cleanup();if(reset==='service')h.props.service={...h.props.service};else h.props.handoff={...h.props.handoff};h.render();cleanup=h.effects.at(-1)();await new Promise(r=>setImmediate(r));}
   assert.equal(h.states[1],false);
   if(['invalidation','day'].includes(reset))assert.match(h.text(h.render()),/session needs checking/);
   // The current instance can begin an explicit action after resetting. The old
   // promise must not release that newer action's lock or clear its spinner.
   h.states[0]=offer();const next=h.button(h.render(),'Confirm new search');next.props.onPress();await new Promise(r=>setImmediate(r));assert.equal(deferred.length,2);assert.equal(h.states[1],true);if(reset==='day'){tick();assert.equal(h.states[1],true);}
   deferred[0]({kind:'pending',reason:'old_failure'});await new Promise(r=>setImmediate(r));assert.equal(h.states[1],true);next.props.onPress();await new Promise(r=>setImmediate(r));assert.equal(deferred.length,2);
   deferred[1]({kind:'pending',reason:'search_stopped'});await new Promise(r=>setImmediate(r));assert.equal(h.states[1],false);assert.match(h.text(h.render()),/I could not complete this search/);
   cleanup();cleanup=undefined;const afterUnmount=JSON.stringify(h.states);invalidate();tick();assert.equal(JSON.stringify(h.states),afterUnmount);
  }finally{cleanup?.();global.setInterval=originalInterval;global.clearInterval=originalClear;h.restore();}
 }
});

test('late pending read cannot update an unmounted or invalidated component or disturb a newer action',async()=>{
 for(const reset of ['unmount','invalidation']){
  const h=harness();let cleanup,invalidate,resolvePending,resolveNew;
  try{
   h.props.service.subscribeInvalidation=(_owner,fn)=>{invalidate=fn;return()=>{}};
   h.render();cleanup=h.effects.at(-1)();await new Promise(r=>setImmediate(r));
   h.props.service.retrySearch=async()=>({kind:'pending',reason:'search_stopped'});
   h.props.service.pending=()=>new Promise(resolve=>{resolvePending=resolve;});
   const offer={kind:'retry_available',reason:'search_stopped',owner:'A',date:'2026-10-22',meal:'dinner',mode:'eat_out',requestId:'parent',publicRequest:{food:'chicken',area:'Orlando'}};
   h.states[0]=offer;h.button(h.render(),'Confirm new search').props.onPress();await new Promise(r=>setImmediate(r));assert.equal(typeof resolvePending,'function');
   if(reset==='unmount'){cleanup();cleanup=undefined;const snapshot=JSON.stringify(h.states);resolvePending({envelope:{request_id:'old-child'}});await new Promise(r=>setImmediate(r));assert.equal(JSON.stringify(h.states),snapshot);}
   else{
    invalidate();assert.equal(h.states[2],false);assert.equal(h.states[1],false);
    h.props.service.retrySearch=()=>new Promise(resolve=>{resolveNew=resolve;});h.states[0]=offer;const submit=h.button(h.render(),'Confirm new search');submit.props.onPress();await new Promise(r=>setImmediate(r));assert.equal(h.states[1],true);
    resolvePending({envelope:{request_id:'old-child'}});await new Promise(r=>setImmediate(r));assert.equal(h.states[2],false);assert.equal(h.states[1],true);
    h.props.service.pending=async()=>null;resolveNew({kind:'pending',reason:'search_stopped'});await new Promise(r=>setImmediate(r));assert.equal(h.states[1],false);assert.equal(h.states[2],false);
   }
  }finally{cleanup?.();h.restore();}
 }
});

test('no-results recovery preserves the requested meal and constraints; editing only prepares a separately consented search',async()=>{
 const h=harness();try{
  const input={mode:'eat_out',food_query:'grilled chicken rice and vegetables',public_area:'Orlando, Florida',preference:'high_protein',exclusions:['onion'],allergens:['milk'],dietary_preferences:[]};
  const source={kind:'ready',owner:'A',date:'2026-10-22',meal:'dinner',mode:'eat_out',requestId:'completed-import',options:[],noResults:{input},capabilities:{discovery:true,estimate:false,reason:null}};
  let composer;h.props.onComposer=v=>composer=v;h.render();h.states[0]=source;
  let tree=h.render();assert.match(h.text(tree),/couldn’t find usable meal details/);assert.match(h.text(tree),/grilled chicken rice and vegetables/);assert.match(h.text(tree),/Orlando, Florida/);assert.equal(h.button(tree,'Review updated search').props.disabled,true);assert.equal(h.calls.length,0);
  h.button(tree,'Change area').props.onPress();tree=h.render();h.effects[0]();assert.match(composer.placeholder,/city or area/);composer.submit('Winter Park, Florida');tree=h.render();assert.equal(h.calls.length,0);assert.match(h.text(tree),/Winter Park/);
  h.button(tree,'Change food').props.onPress();tree=h.render();const dispose=h.effects[0]();const staleComposer=composer;h.button(tree,'Cancel edit').props.onPress();dispose();tree=h.render();h.effects[0]();assert.equal(composer,null);staleComposer.submit('discarded edit');assert.match(h.text(h.render()),/grilled chicken rice and vegetables/);assert.equal(h.calls.length,0);
  h.button(tree,'Change area').props.onPress();tree=h.render();h.effects[0]();composer.submit('Maitland');tree=h.render();assert.match(h.text(tree),/Maitland/);h.button(tree,'Change area').props.onPress();tree=h.render();h.effects[0]();composer.submit('Winter Park, Florida');tree=h.render();assert.equal(h.calls.length,0);
  h.props.service.explore=async(_access,value,meal)=>{h.calls.push({operation:'explore',value,meal});return {...source,noResults:undefined,publicRequest:{food:value.food_query,area:value.public_area,preference:value.preference}}};
  h.button(tree,'Review updated search').props.onPress();await new Promise(r=>setImmediate(r));tree=h.render();assert.equal(h.calls.length,1);assert.deepEqual(h.calls[0],{operation:'explore',value:{...input,public_area:'Winter Park, Florida'},meal:'dinner'});assert.ok(h.button(tree,'Review web search'));assert.equal(h.button(tree,'Search these details'),undefined);
  h.button(tree,'Review web search').props.onPress();tree=h.render();assert.ok(h.button(tree,'Search these details'));assert.equal(h.calls.length,1);assert.match(h.text(tree),/OpenRouter/);
 }finally{h.restore()}
});

test('restored unpaid preparation requires fresh visible search consent and never auto-dispatches',async()=>{
 const h=harness();try{h.props.handoff=undefined;h.render();h.states[6]=true;h.props.service.restore=async()=>{h.calls.push({operation:'restore'});return {kind:'ready',owner:'A',date:'2026-10-22',meal:'dinner',mode:'eat_out',requestId:'saved',options:[],publicRequest:{food:'grilled chicken rice and vegetables',area:'Orlando'},capabilities:{discovery:true,estimate:false,reason:null}}};
 h.button(h.render(),'Resume meal search').props.onPress();await new Promise(r=>setImmediate(r));let tree=h.render();assert.deepEqual(h.calls,[{operation:'restore'}]);assert.ok(h.button(tree,'Review web search'));assert.equal(h.button(tree,'Search these details'),undefined);h.button(tree,'Review web search').props.onPress();tree=h.render();assert.ok(h.button(tree,'Search these details'));assert.match(h.text(tree),/grilled chicken rice and vegetables/);assert.match(h.text(tree),/Orlando/);assert.equal(h.calls.length,1);
 }finally{h.restore()}
});

test('actual chat hook preserves active handoff identity during same-owner auth events and clears on identity changes',async()=>{
 const original=Module._load,states=[],refs=[],effects=[],callbacks=[],writes=[];let cursor=0,ref=0,owner='A';
 const fake={useState(init){const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;writes.push(i)}]},useRef(init){const i=ref++;return refs[i]??(refs[i]={current:init})},useEffect:f=>effects.push(f),useCallback:f=>f};
 Module._load=function(n,parent,isMain){if(n==='react')return fake;if(n==='@react-native-async-storage/async-storage')return {getItem:async()=>null,setItem:async()=>{},removeItem:async()=>{}};if(n==='@/lib/supabase/client')return {SUPABASE_PROJECT_URL:'https://offline.invalid',supabase:{auth:{getSession:async()=>({data:{session:owner?{user:{id:owner},access_token:'offline'}:null}}),getUser:async()=>({data:{user:owner?{id:owner}:null}}),onAuthStateChange:fn=>{callbacks.push(fn);return {data:{subscription:{unsubscribe(){}}}}}}}};if(n==='expo/fetch')return {fetch:()=>{throw Error('auth events must not send a model request')}};if(n==='@/lib/i18n')return {__esModule:true,default:{language:'en',t:k=>k}};if(n.startsWith('@/'))return original.call(this,path.resolve(__dirname,'..',n.slice(2)),parent,isMain);return original.call(this,n,parent,isMain)};
 let cleanup;try{
  const file=require.resolve('../hooks/useAICoach.ts');delete require.cache[file];states[5]={conversationId:'existing',hasHistory:true};require(file).useAICoach({mealConversation:true});
  cleanup=effects.find(f=>f.toString().includes('restoreAccepted'))();await new Promise(r=>setImmediate(r));
  const card={value:handoff(),owner:'A',date:'2026-10-22'},message={id:'active-card',role:'assistant',content:'Here is the search.',mealConversation:card};states[3]=[message];states[0]=true;
  const before=states[3],count=writes.length,auth=callbacks.at(-1);
  for(const event of ['SIGNED_IN','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED']){auth(event,{user:{id:'A'}});await new Promise(r=>setImmediate(r));assert.equal(states[3],before);assert.equal(states[3][0],message);assert.equal(states[3][0].mealConversation,card);assert.equal(states[0],true);}
  assert.equal(writes.length,count);
  owner='B';auth('SIGNED_IN',{user:{id:'B'}});assert.deepEqual(states[3],[]);assert.equal(states[0],false);await new Promise(r=>setImmediate(r));assert.deepEqual(states[3],[]);
  states[3]=[{...message,id:'B-card',mealConversation:{...card,owner:'B'}}];const b=states[3];auth('SIGNED_IN',{user:{id:'B'}});assert.equal(states[3],b);
  owner=null;auth('SIGNED_OUT',null);assert.deepEqual(states[3],[]);cleanup();cleanup=undefined;const after=writes.length;auth('SIGNED_IN',{user:{id:'A'}});assert.equal(writes.length,after);
 }finally{cleanup?.();Module._load=original;}
});

test('active meal component keeps its in-flight action when same-account props retain the handoff identity',async()=>{
 const h=harness();try{let finish;h.props.service.explore=()=>new Promise(resolve=>finish=resolve);const identity=h.props.handoff;h.button(h.render(),'Find meal options').props.onPress();await new Promise(r=>setImmediate(r));assert.equal(h.states[1],true);
 Object.assign(h.props,{handoff:identity}); // Real hook regression above verifies this identity is retained.
 const working=h.render();assert.equal(h.button(working,'Find meal options').props.disabled,true);assert.equal(h.states[1],true);
 finish({kind:'ready',owner:'A',date:'2026-10-22',meal:'dinner',mode:'eat_out',requestId:'result',options:[],publicRequest:{food:'chicken',area:'Orlando'},capabilities:{discovery:true,estimate:false,reason:null}});await new Promise(r=>setImmediate(r));assert.equal(h.states[1],false);assert.ok(h.button(h.render(),'Review web search'));
 }finally{h.restore()}
});

test('general fallback actual component asks portion in composer, cancels safely and separates unpaid preparation from paid consent',async()=>{
 for(const enabled of [false,true]){const h=harness();try{let composer;h.props.onComposer=v=>composer=v;h.render();const source={kind:'ready',owner:'A',date:'2026-10-22',requestId:'owned',meal:'dinner',mode:'eat_out',options:[],capabilities:{estimate:enabled,discovery:false},noResults:{sourceRequestId:'source',input:{mode:'eat_out',food_query:'chicken and rice',public_area:'Orlando',preference:'high_protein',exclusions:[],allergens:[],dietary_preferences:[]}}};h.states[0]=source;
 const row=require('../supabase/functions/ai-coach/general-meal.ts').prepareGeneralMeal({discovery_request:{food:'chicken and rice'}},'one bowl');
 h.props.service.prepareGeneral=async(_a,s,p)=>{h.calls.push({operation:'prepare',source:s,portion:p});return {...source,noResults:undefined,requestId:'prepared',options:[mealEvidenceFromOption(row,'eat_out')]}};
 h.props.service.estimate=async()=>{h.calls.push({operation:'estimate'});return {kind:'unavailable',reason:'offline'}};
 let tree=h.render();h.button(tree,'Estimate this meal instead').props.onPress();tree=h.render();assert.equal(h.button(tree,'Change food'),undefined);h.effects[0]();assert.ok(composer);composer.submit('one bowl');tree=h.render();h.button(tree,'Cancel').props.onPress();assert.equal(h.calls.length,0);
 tree=h.render();h.button(tree,'Estimate this meal instead').props.onPress();h.render();h.effects[0]();composer.submit('one bowl');tree=h.render();const confirm=h.button(tree,'Confirm this portion');confirm.props.onPress();confirm.props.onPress();await new Promise(r=>setImmediate(r));assert.equal(h.calls.length,1);assert.equal(h.calls[0].operation,'prepare');tree=h.render();assert.match(h.text(tree),/not restaurant-specific/);assert.equal(h.button(tree,'Add to meal').props.disabled,true);
 if(enabled){assert.ok(h.button(tree,'Confirm estimate'));h.button(tree,'Confirm estimate').props.onPress();await new Promise(r=>setImmediate(r));assert.equal(h.calls[1].operation,'estimate');}else{assert.equal(h.button(tree,'Confirm estimate'),undefined);assert.match(h.text(tree),/unavailable right now/);}
 }finally{h.restore()}}
});

test('general portion validation stays visible and editable only after an explicit non-admission, never clears unknown pending',async()=>{
 for(const pending of [false,true]){const h=harness();try{let composer;h.props.onComposer=v=>composer=v;h.render();h.states[0]={kind:'ready',owner:'A',date:'2026-10-22',requestId:'owned',meal:'dinner',mode:'eat_out',options:[],capabilities:{estimate:true},noResults:{sourceRequestId:'source',input:{mode:'eat_out',food_query:'rice',public_area:'Orlando',preference:'balanced'}}};
 h.props.service.prepareGeneral=async()=>{h.calls.push({operation:'prepare'});return {kind:'pending',reason:'general_meal_conflicts_with_constraints'}};h.props.service.pending=async()=>pending?{envelope:{request_id:'unchanged'}}:null;
 h.button(h.render(),'Estimate this meal instead').props.onPress();h.render();h.effects[0]();composer.submit('https://example.com private');let t=h.render();assert.match(h.text(t),/Leave out links and personal details/);assert.equal(h.button(t,'Confirm this portion'),undefined);assert.equal(h.calls.length,0);h.effects[0]();composer.submit('one bowl with peanuts');t=h.render();h.button(t,'Confirm this portion').props.onPress();await new Promise(r=>setImmediate(r));t=h.render();assert.match(h.text(t),/conflicts with a restriction/);assert.equal(h.calls.length,1);if(!pending){h.effects[0]();assert.ok(composer);assert.ok(h.button(t,'Cancel'));}else assert.equal(h.button(t,'Confirm this portion'),undefined);
 }finally{h.restore()}}
});

test('related restaurant option stays visible with differences and retains official versus unknown nutrition',()=>{
 for(const authority of ['official','unknown']){const row={id:'related',name:'Chicken salad',identity:{kind:'restaurant',entity:'Source restaurant',portion_label:'one bowl'},provenance:{kind:authority==='official'?'official':'estimate',source_url:'https://example.com/menu'},match:{kind:'similar',requested_food:'chicken rice and vegetables',differences:['Requested rice is not established by this item description.']},nutrition:{authority,basis:{amount:1,unit:'serving',label:'one bowl'},values:authority==='official'?{calories:400,protein:30,carbs:20,fats:20,fiber:4}:{calories:null,protein:null,carbs:null,fats:null,fiber:null},assumptions:[]},ingredients:[],instructions:[],allergy_status:'requires_review',review_required:true};const option=mealEvidenceFromOption(row,'eat_out');assert.ok(option);assert.equal(option.match.kind,'similar');assert.deepEqual(option.match.differences,row.match.differences);assert.equal(option.nutrition.authority,authority);assert.equal(option.nutrition.values.calories,authority==='official'?400:null);
 const h=harness();try{h.render();h.states[0]={kind:'ready',owner:'A',date:'2026-10-22',meal:'dinner',mode:'eat_out',requestId:'owned',options:[option],capabilities:{estimate:false,discovery:false}};const t=h.render();assert.match(h.text(t),/Related option/);assert.match(h.text(t),/Requested rice is not established/);assert.ok(h.button(t,'Add to meal'));assert.equal(h.text(t).includes('Exact match'),false);}finally{h.restore()}
 assert.equal(mealEvidenceFromOption({...row,match:{...row.match,kind:'exact'}},'eat_out'),null);assert.equal(mealEvidenceFromOption({...row,match:{...row.match,differences:[]}},'eat_out'),null);assert.equal(mealEvidenceFromOption({...row,match:undefined},'eat_out').match,undefined);
 }
});

test('gallery no-match explanation uses app language and keeps web dispatch behind explicit consent',()=>{
 for(const language of ['en','es']){const h=harness(true,language);try{h.render();const source={kind:'ready',owner:'A',date:'2026-10-22',requestId:'owned',meal:'dinner',mode:'cook',options:[],galleryNoMatch:true,publicRequest:{mode:'recipe',food:'chicken and rice'},capabilities:{discovery:true,estimate:false}};h.states[0]=source;let t=h.render();assert.match(h.text(t),language==='es'?/No encontré coincidencias para lo que pediste/:/didn’t find a match for this request/);assert.equal(h.calls.length,0);assert.equal(h.button(t,language==='es'?'Buscar estos datos':'Search these details'),undefined);h.button(t,language==='es'?'Revisar búsqueda web':'Review web search').props.onPress();t=h.render();assert.ok(h.button(t,language==='es'?'Buscar estos datos':'Search these details'));assert.equal(h.calls.length,0);h.states[0]={...source,galleryNoMatch:undefined,mode:'eat_out'};assert.equal(h.text(h.render()).includes(language==='es'?'No encontré coincidencias':'didn’t find a match'),false);}finally{h.restore()}}
});

test('unknown recipe portion is explicit and editable before estimation; clarification and non-admission keep its label',async()=>{
 const h=harness();try{let composer;h.props.onComposer=v=>composer=v;h.render();const o={id:'recipe',name:'Chicken with rice',kind:'recipe',provenance:{kind:'publisher',url:'https://example.com/recipe'},nutrition:{authority:'unknown',basis:{amount:1,unit:'serving',label:'Serving size unspecified'},values:{calories:null,protein:null,carbs:null,fats:null,fiber:null},assumptions:[]},allergyStatus:'requires_review'};const source={kind:'ready',owner:'A',date:'2026-10-22',requestId:'owned',meal:'dinner',mode:'cook',options:[o],capabilities:{estimate:true,discovery:false}};h.states[0]=source;h.props.service.estimate=async(_a,_r,_id,portion)=>{h.calls.push({operation:'estimate',portion});return h.calls.length===1?{...source,question:'portion_label',options:[]}:{kind:'blocked',reason:'budget_limit'}};
 h.button(h.render(),'Estimate nutrition').props.onPress();let t=h.render();assert.equal(h.button(t,'Confirm estimate'),undefined);h.effects[0]();assert.ok(composer);composer.submit('one bowl with 1 cup rice and a chicken breast');t=h.render();assert.ok(h.button(t,'Edit portion'));assert.equal(h.calls.length,0);h.button(t,'Confirm estimate').props.onPress();await new Promise(r=>setImmediate(r));t=h.render();assert.match(h.text(t),/Current portion:.*one bowl/);h.effects[0]();composer.submit('half a bowl with half a cup rice');t=h.render();h.button(t,'Edit portion').props.onPress();t=h.render();assert.match(h.text(t),/Current portion:.*half a bowl/);h.effects[0]();composer.submit('half a bowl with half a cup rice');t=h.render();h.button(t,'Confirm estimate').props.onPress();await new Promise(r=>setImmediate(r));t=h.render();assert.match(h.text(t),/half a bowl with half a cup rice/);assert.match(h.text(t),/usage or budget limit/);assert.equal(h.calls.length,2);assert.equal(h.calls[1].portion,'half a bowl with half a cup rice');assert.match(h.text(t),/not official values/);
 }finally{h.restore()}
});

test('portion requirement trusts explicit identity or source basis, not a guessed recipe serving',()=>{
 const {estimateNeedsPortion}=require('../utils/coachMealServices.ts'),base={nutrition:{authority:'unknown'},kind:'recipe'};assert.equal(estimateNeedsPortion(base),true);assert.equal(estimateNeedsPortion({...base,kind:'gallery',nutrition:{authority:'estimated'}}),true);assert.equal(estimateNeedsPortion({...base,identity:{kind:'general_meal',portion_label:'one bowl'}}),false);assert.equal(estimateNeedsPortion({...base,physicalPortion:{authority:'source_reported',grams:200}}),false);assert.equal(estimateNeedsPortion({...base,nutrition:{authority:'publisher_reported'}}),true);assert.equal(estimateNeedsPortion({...base,kind:'restaurant',identity:{kind:'restaurant',variant:'regular'}}),true);assert.equal(estimateNeedsPortion({...base,physicalPortion:{authority:'source_reported',grams:0}}),true);assert.equal(estimateNeedsPortion({...base,nutrition:{authority:'estimated'},sourceNutrition:{authority:'unknown'}}),true);
});

test('source portion stays displayed but actual component service omits unchanged override and sends edited portion',async()=>{
 for(const changed of [false,true]){const h=harness();try{
  const {createMealServices}=require('../utils/coachMealServices.ts');let composer;const sent=[];
  h.props.onComposer=v=>composer=v;
  h.props.service=createMealServices({owner:async()=> 'A',today:()=> '2026-10-22',subscribeInvalidation:()=>()=>{},store:{getItem:async()=>null,setItem:async()=>{},removeItem:async()=>{}},write:async()=>{throw Error('no diary write')},transport:{pending:async()=>null,run:async(_a,payload)=>{sent.push(payload);return {kind:'blocked',reason:'budget_limit'}}}});
  h.render();const option={id:'known',name:'Chicken plate',kind:'restaurant',identity:{kind:'restaurant',portion_label:'one plate (250 g)'},provenance:{kind:'publisher',url:'https://example.com/menu'},nutrition:{authority:'unknown',basis:{amount:1,unit:'serving',label:'one plate (250 g)'},values:{calories:null,protein:null,carbs:null,fats:null,fiber:null},assumptions:[]},allergyStatus:'requires_review'};
  h.states[0]={kind:'ready',owner:'A',date:'2026-10-22',requestId:'owned',meal:'dinner',mode:'eat_out',options:[option],capabilities:{estimate:true,discovery:false}};
  h.button(h.render(),'Estimate nutrition').props.onPress();let tree=h.render();assert.match(h.text(tree),/one plate \(250 g\)/);assert.ok(h.button(tree,'Confirm estimate'));assert.equal(sent.length,0);
  if(changed){h.button(tree,'Edit portion').props.onPress();h.render();h.effects[0]();composer.submit('half a plate');tree=h.render();assert.match(h.text(tree),/half a plate/);}
  h.button(tree,'Confirm estimate').props.onPress();await new Promise(r=>setImmediate(r));assert.equal(sent.length,1);assert.equal(sent[0].operation,'estimate');assert.equal(sent[0].source_request_id,'owned');assert.equal(sent[0].consent,true);
  if(changed)assert.equal(sent[0].portion_label,'half a plate');else assert.equal(Object.hasOwn(sent[0],'portion_label'),false);
  assert.equal(option.identity.portion_label,'one plate (250 g)');assert.match(h.text(h.render()),changed?/half a plate/:/one plate \(250 g\)/);
 }finally{h.restore()}}
});

test('historical active card restores only its stable flow with explicit resume',async()=>{
 const h=harness();try{h.props.flowId='cook-chat';h.props.showRecovery=true;h.props.active=false;h.props.onResume=()=>h.props.active=true;
 h.props.service.saved=async(_a,id)=>{h.calls.push({operation:'saved',id});return {requestId:'cook-estimate'}};
 h.props.service.restore=async(_a,id)=>{h.calls.push({operation:'restore',id});return {kind:'unavailable',reason:'saved_options_unavailable'}};
 h.render();const cleanup=h.effects.find(f=>f.toString().includes('service.saved'))();await new Promise(r=>setImmediate(r));
 let tree=h.render();h.button(tree,'Resume these meal options').props.onPress();tree=h.render();
 assert.ok(h.button(tree,'Resume meal search'));assert.equal(h.calls.filter(x=>x.operation==='restore').length,0);
 h.button(tree,'Resume meal search').props.onPress();await new Promise(r=>setImmediate(r));
 assert.deepEqual(h.calls.filter(x=>x.operation==='restore'),[{operation:'restore',id:'cook-chat'}]);cleanup();
 const app=fs.readFileSync(path.join(__dirname,'../app/(tabs)/coach.tsx'),'utf8');
 assert.match(app,/flowId=\{message\.mealConversation\.requestId\?\?message\.id\}/);
 assert.match(app,/showRecovery=\{activeMealCard\?activeMealCard===message\.id:/);
 }finally{h.restore()}
});


test('source total time is independent of estimated nutrition and legacy prep minutes stay unknown',()=>{
 const url='https://example.com/recipe';
 const make=()=>({id:'recipe',name:'Chicken rice',identity:{kind:'recipe'},provenance:{kind:'estimate',source_url:url},nutrition:{authority:'unknown',basis:{amount:1,unit:'serving',label:'one plate'},values:{calories:null,protein:null,carbs:null,fats:null,fiber:null},assumptions:[]},ingredients:[],instructions:[],allergy_status:'requires_review',review_required:true});
 const {coachRecipeTimeLabel}=require('../utils/coachMealReviewAdapter');
 const valid={minutes:20,authority:'source_reported',source_url:url};
 const cases=[valid,undefined,null,{...valid,authority:'estimated'},{...valid,source_url:'https://other.com/recipe'},{...valid,minutes:0},{...valid,minutes:1441},{...valid,minutes:'20'}];
 for(const language of ['en','es'])for(const total of cases){const h=harness(true,language);try{const row={...make(),prep_minutes:20,active_minutes:20,total_time:total},option=mealEvidenceFromOption(row,'cook');assert.ok(option);assert.equal(option.nutrition.authority,'unknown');assert.equal(option.provenance.kind,'estimate');h.render();h.states[0]={kind:'ready',owner:'A',date:'2026-10-22',requestId:'receipt',meal:'lunch',mode:'cook',options:[option],capabilities:{estimate:false,discovery:false,reason:null}};const text=h.text(h.render());assert.ok(text.includes(total===valid?(language==='es'?'Tiempo total publicado: 20 min':'Published total time: 20 min'):(language==='es'?'Tiempo total desconocido':'Total time unknown')));assert.equal(h.calls.length,0);}finally{h.restore();}}
 const gallery=mealEvidenceFromOption({...make(),total_time:valid,provenance:{kind:'gallery',gallery_id:'saved'}},'cook');assert.match(coachRecipeTimeLabel(gallery,false),/unknown/);assert.equal(coachRecipeTimeLabel(mealEvidenceFromOption({...make(),total_time:valid},'eat_out'),false),null);
 const service=fs.readFileSync(path.join(__dirname,'../utils/coachMealServices.ts'),'utf8');assert.ok(service.includes('total_time:reviewSource?.total_time'));
 const review=fs.readFileSync(path.join(__dirname,'../components/CoachMealReview.tsx'),'utf8');assert.ok(review.includes('coachRecipeTimeLabel(source,es)'));
});

 test('legacy complete estimates offer explicit ingredient breakdown without inventing components or auto-estimating',()=>{const h=harness();try{h.render();h.states[0]={kind:'ready',owner:'A',date:'2026-10-22',requestId:'owned',meal:'lunch',mode:'cook',options:[{id:'bowl',name:'Bowl',kind:'recipe',identity:{kind:'recipe',portion_label:'one bowl'},provenance:{kind:'estimate',label:'Estimate',url:'https://example.com/recipe'},nutrition:{authority:'estimated',basis:{amount:1,unit:'serving',label:'one bowl'},values:{calories:500,protein:30,carbs:50,fats:20,fiber:3},assumptions:[]},allergyStatus:'requires_review'}],capabilities:{estimate:true,discovery:false,reason:null}};let tree=h.render();h.button(tree,'Estimate ingredient breakdown').props.onPress();tree=h.render();assert.equal(h.calls.length,0);assert.ok(h.button(tree,'Confirm estimate'));h.button(tree,'Cancel estimate').props.onPress();assert.equal(h.calls.length,0);assert.ok(h.button(h.render(),'Estimate ingredient breakdown'));}finally{h.restore()}});
