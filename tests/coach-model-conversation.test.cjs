const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpile(fs.readFileSync(f,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}),f);
const {parseMealConversation,mealConversationInput}=require('../utils/coachMealConversation');const {mealEvidenceFromOption}=require('../utils/coachMealReviewAdapter');
const handoff=()=>({schema:'meal_conversation_v1',fields:{exclusions:[],allergens:[],dietary_preferences:[],provenance:'user_provided',verification:'unverified',mode:'eat_out',food_query:'meal',public_area:'San Juan',restaurant:null,preference:'high_protein'},status:'ready',question:null,requires_search_consent:true,constraints_review_required:true,options:[]});
test('model handoff retains area-first fields but never accepts food actions or fabricated sources',()=>{const h=parseMealConversation(handoff());assert.ok(h);assert.deepEqual(mealConversationInput(h,{exclusions:['onion'],allergens:['milk']}),{mode:'eat_out',food_query:'meal',public_area:'San Juan',preference:'high_protein',exclusions:['onion'],allergens:['milk'],dietary_preferences:[]});for(const patch of [{requires_search_consent:false},{options:[{calories:500}]},{source_url:'https://example.com'},{fields:{...h.fields,public_area:null}},{schema:'other'}])assert.equal(parseMealConversation({...h,...patch}),null);const clarify=parseMealConversation({...h,fields:{...h.fields,public_area:null},status:'clarify',question:{key:'public_area'}});assert.ok(clarify);assert.equal(mealConversationInput(clarify,{exclusions:[],allergens:[]}),null);});
test('venue address requires its own validated source and never gains invented images',()=>{const row={id:'one',name:'Bowl',provenance:{kind:'official',source_url:'https://example.com/menu'},nutrition:{authority:'estimated',basis:{amount:1,unit:'serving',label:'one bowl'},values:{calories:500,protein:30,carbs:50,fats:15,fiber:4},assumptions:[]},ingredients:[],instructions:[],allergy_status:'requires_review',review_required:true,venue:{name:'Restaurant',source_url:'https://example.com',address:'1 Main St'}};assert.equal(mealEvidenceFromOption(row,'eat_out').venue.address,undefined);row.venue.address_source_url='https://example.com/locations';assert.equal(mealEvidenceFromOption(row,'eat_out').venue.address,'1 Main St');row.venue.address_source_url='javascript:bad';assert.equal(mealEvidenceFromOption(row,'eat_out').venue.address,undefined);});
function harness(premium=true){const React=require('react'),original=Module._load,states=[],refs=[],calls=[],effects=[];let cursor=0,ref=0;const fake={...React,useState(init){const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useEffect(fn){effects.push(fn)},useRef(init){const i=ref++;return refs[i]??(refs[i]={current:init})}};Module._load=function(n,parent,isMain){if(n==='react')return fake;if(n==='react-native')return new Proxy({StyleSheet:{create:x=>x},Linking:{openURL:x=>calls.push({url:x})}},{get:(o,k)=>o[k]??String(k)});if(n==='expo-router')return {useRouter:()=>({push:r=>calls.push({route:r})})};if(n==='react-i18next')return {useTranslation:()=>({i18n:{language:'en'}})};if(n.startsWith('@/'))return original.call(this,path.resolve(__dirname,'..',n.slice(2)),parent,isMain);return original.call(this,n,parent,isMain);};const option={id:'bowl',name:'Chicken bowl',kind:'restaurant',provenance:{kind:'official',label:'Menu',url:'https://example.com/menu'},nutrition:{authority:'estimated',basis:{amount:1,unit:'serving',label:'one bowl'},values:{calories:500,protein:30,carbs:50,fats:15,fiber:4},assumptions:[]},allergyStatus:'requires_review'};const source={kind:'ready',owner:'A',date:'2026-10-22',meal:'lunch',mode:'eat_out',requestId:'owned',options:[option],capabilities:{estimate:false,discovery:false,reason:null}};const service={owner:async()=> 'A',today:()=> '2026-10-22',pending:async()=>null,subscribeInvalidation:()=>()=>{},explore:async(_a,input)=>{calls.push({operation:'explore',input});return source},review:(src,id)=>{calls.push({operation:'review',meal:src.meal,id});return {invalidate(){}}}};const file=require.resolve('../components/CoachConversationActions.tsx');delete require.cache[file];const Component=require(file).default,props={service,handoff:{value:handoff(),owner:'A',date:'2026-10-22'},hasConversation:true,isPremium:premium,premiumLoading:false,gated:false,busy:false};const text=n=>n==null?'':typeof n==='string'||typeof n==='number'?String(n):React.Children.toArray(n.props?.children).map(text).join(' '),nodes=n=>!n||typeof n!=='object'?[]:[n,...React.Children.toArray(n.props?.children).flatMap(nodes)];return {calls,props,states,effects,render(){cursor=ref=0;effects.length=0;return Component(props)},button(tree,label){return nodes(tree).find(n=>n.props?.accessibilityRole==='button'&&text(n)===label)},text,restore(){Module._load=original}};}
test('actual model action component does not explore on receipt; Add to meal requires explicit meal choice and only opens review',async()=>{const h=harness();try{let tree=h.render();assert.equal(h.calls.length,0);h.button(tree,'Confirm preferences and find meals').props.onPress();await new Promise(r=>setImmediate(r));assert.equal(h.calls.length,1);assert.equal('restaurant' in h.calls[0].input,false);tree=h.render();assert.match(h.text(tree),/Chicken bowl/);h.button(tree,'Add to meal').props.onPress();assert.equal(h.calls.length,1);tree=h.render();h.button(tree,'Dinner').props.onPress();await new Promise(r=>setImmediate(r));assert.deepEqual(h.calls[1],{operation:'review',meal:'dinner',id:'bowl'});assert.equal(h.calls[2].route.pathname,'/recipe-finder-detail');assert.equal(h.calls.some(c=>c.operation==='log'),false);}finally{h.restore()}});
test('free and stale owner handoffs cannot trigger personalized exploration',async()=>{const free=harness(false);try{assert.equal(free.button(free.render(),'Confirm preferences and find meals').props.disabled,true);assert.equal(free.calls.length,0);}finally{free.restore()}const h=harness();try{h.props.handoff.owner='other';h.button(h.render(),'Confirm preferences and find meals').props.onPress();await new Promise(r=>setImmediate(r));assert.equal(h.calls.length,0);}finally{h.restore()}});

test('actual chat hook renders committed SSE with installed React Native Response lacking body, preserving text, handoff and owner isolation',async()=>{
 for(const changed of [false,true,'consumer_failure','unmounted']){
  const original=Module._load,NativeResponse=global.Response,states=[],refs=[],requests=[],journalRows=new Map(),restoreEffects=[];global.Response=require('whatwg-fetch').Response;assert.equal(new Response('committed').body,undefined);if(changed==='consumer_failure')global.Response=class extends require('whatwg-fetch').Response{text(){return Promise.reject(Error('consumer_read_failure'))}};let cursor=0,ref=0,unmount=()=>{};const fake={useState(init){const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useEffect(fn){if(fn.toString().includes('isMountedRef.current = true'))unmount=fn();if(fn.toString().includes('restoreAccepted'))restoreEffects.push(fn)},useCallback:f=>f,useRef(init){const i=ref++;return refs[i]??(refs[i]={current:init})}};
  Module._load=function(n,parent,isMain){if(n==='react')return fake;if(n==='@react-native-async-storage/async-storage')return {getItem:async k=>journalRows.get(k)??null,setItem:async(k,v)=>journalRows.set(k,v),removeItem:async k=>journalRows.delete(k)};if(n==='@/lib/supabase/client')return {SUPABASE_PROJECT_URL:'https://offline.invalid',supabase:{auth:{getSession:async()=>({data:{session:{access_token:'offline',user:{id:'A'}}}}),getUser:async()=>({data:{user:{id:changed===true&&requests.length?'B':'A'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>{throw Error('unexpected write')}}};if(n==='expo/fetch')return {fetch:async(_url,init)=>{requests.push(JSON.parse(init.body));if(changed==='unmounted')unmount();const data='data: '+JSON.stringify({token:'Podemos buscar opciones en San Juan.'})+'\n\ndata: '+JSON.stringify({done:true,corrected_text:'Podemos buscar opciones en San Juan.',request_id:requests.at(-1).request_id,meal_conversation:handoff()});return new NativeResponse(new ReadableStream({start(controller){const bytes=new TextEncoder().encode(data);controller.enqueue(bytes.slice(0,49));controller.enqueue(bytes.slice(49));controller.close();}}),{headers:{'content-type':'text/event-stream'}});}};if(n==='@/lib/i18n')return {__esModule:true,default:{language:'es',t:k=>k}};if(n.startsWith('@/'))return original.call(this,path.resolve(__dirname,'..',n.slice(2)),parent,isMain);return original.call(this,n,parent,isMain)};
  try{const file=require.resolve('../hooks/useAICoach.ts');delete require.cache[file];const hook=require(file).useAICoach({mealConversation:true});await hook.sendMessage([{role:'user',content:'restaurant nearby, lo que sea que tenga buenos macros',timestamp:Date.now()}]).catch(e=>{if(!changed)throw e});assert.equal(requests.length,1);assert.equal(requests[0].use_web,undefined);assert.equal(requests[0].experience,'conversation_v1');assert.equal(requests[0].language,'es');if(changed){assert.equal(states[3].some(m=>m.mealConversation),false);assert.equal(journalRows.size,1);continue;}const assistant=states[3].find(m=>m.role==='assistant');assert.equal(assistant.content,'Podemos buscar opciones en San Juan.');assert.equal(assistant.isStreaming,false);assert.equal(journalRows.size,1);assert.ok([...journalRows.keys()][0].endsWith(':accepted'));assert.equal(!!assistant.mealConversation,!changed);if(!changed){assert.deepEqual(assistant.mealConversation.value,handoff());states.length=0;refs.length=0;cursor=ref=0;states[5]={conversationId:null,hasHistory:false};require(file).useAICoach({mealConversation:true});const cleanup=restoreEffects.at(-1)();await new Promise(r=>setImmediate(r));assert.equal(requests.length,1);assert.equal(states[3].find(m=>m.role==='assistant').content,'Podemos buscar opciones en San Juan.');assert.deepEqual(states[3].find(m=>m.role==='assistant').mealConversation.value,handoff());cleanup();}}finally{Module._load=original;global.Response=NativeResponse;}
 }
});

test('restarted history offers explicit saved options restore, not automatic search or Add',async()=>{const h=harness();try{h.props.handoff=undefined;h.render();h.states[6]=true;h.props.service.restore=async()=>{h.calls.push({operation:'restore'});return {kind:'unavailable',reason:'saved_options_unavailable'}};let tree=h.render();assert.equal(h.calls.length,0);h.button(tree,'Resume meal search').props.onPress();await new Promise(r=>setImmediate(r));assert.deepEqual(h.calls,[{operation:'restore'}]);tree=h.render();assert.ok(h.button(tree,'Resume meal search'));assert.equal(h.button(tree,'Add to meal'),undefined);}finally{h.restore()}});

test('draft allergen from negated user wording is removable before explicit confirmation, empty is not no allergies',async()=>{const h=harness();try{h.props.handoff.value.fields.allergens=['peanuts'];let tree=h.render();assert.match(h.text(tree),/Check what I captured/);assert.equal(h.calls.length,0);h.button(tree,'Remove: peanuts').props.onPress();tree=h.render();assert.match(h.text(tree),/Declared allergies: Not collected/);h.button(tree,'Confirm preferences and find meals').props.onPress();await new Promise(r=>setImmediate(r));assert.deepEqual(h.calls[0].input.allergens,[]);assert.deepEqual(h.calls[0].input.dietary_preferences,[]);}finally{h.restore()}});
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
  assert.equal(states[3][11].timestamp,accepted[5].reply.timestamp);assert.ok(states[3][1].mealConversation);
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
