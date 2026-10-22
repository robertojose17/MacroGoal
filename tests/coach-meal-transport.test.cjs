const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpile(fs.readFileSync(f,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),f);
const {createMealTransport}=require('../utils/coachMealTransport.ts'),{createMealServices}=require('../utils/coachMealServices.ts'),{editMealNutrition}=require('../utils/coachMealReview.ts');
const input={food_query:'chicken rice',mode:'cook',exclusions:[],allergens:[],preference:'preferred_food'};
const option=(estimated=false,restaurant=false)=>({id:restaurant?'menu-dish':'gallery-one',name:'Chicken and rice',ingredients:restaurant?[]:['chicken','rice'],instructions:restaurant?[]:['Cook chicken and rice.'],prep_minutes:null,provenance:restaurant?{kind:'official',source_url:'https://example.com/menu'}:{kind:'gallery',gallery_id:'gallery-one'},nutrition:{authority:'estimated',basis:{amount:1,unit:'serving',label:estimated?'1 bowl, approximately 350 g':'1 gallery entry; physical serving size unspecified'},values:{calories:500,protein:35,carbs:50,fats:17,fiber:estimated?4:null},assumptions:['Portion size is estimated.'],confidence:'low'},allergy_status:'requires_review',review_required:true});
function fixture(){
 const state={owner:'A',day:'2026-10-22',zone:'America/Puerto_Rico',access:{isPremium:true,premiumLoading:false,gated:false,busy:false},lose:false,deny:false,capabilities:true};
 const rows=new Map(),receipts=new Map(),calls=[],writes=[];let ids=0;
 const store={getItem:async k=>rows.get(k)??null,setItem:async(k,v)=>rows.set(k,v),removeItem:async k=>rows.delete(k)};
 const json=(extra={})=>({schema:'meal_explore_v1',owner:'A',date:'2026-10-22',status:'options',options:[option()],paid_capabilities:{discovery:state.capabilities,estimate:state.capabilities,reason:state.capabilities?null:'pilot_not_enabled',budget_checked:false},...extra});
 const deps={scope:'normal',owner:async()=>state.owner,today:()=>state.day,zone:()=>state.zone,newId:()=>`11111111-1111-4111-8111-${String(++ids).padStart(12,'0')}`,store,invoke:async body=>{
  calls.push(body);if(state.deny)return Response.json({error:'pilot_not_enabled',request_id:body.request_id,admission_state:'not_admitted'},{status:403});
  if(body.intent==='recover_daily'){assert.equal(body.journey,'meal_explore_v1');return Response.json(receipts.get(body.request_id));}
  if(body.operation==='discover'){if(state.lose)throw Error('connection lost');return new Response(`data: ${JSON.stringify({done:true,request_id:body.request_id,usage_status:'completed'})}\n\n`,{headers:{'Content-Type':'text/event-stream'}});}
  let response;
  if(body.operation==='explore')response=json(body.mode==='eat_out'?{status:'discovery_available',options:[],discovery_request:{mode:'restaurant',food:body.food_query,restaurant:body.restaurant}}:{});
  else if(body.operation==='estimate')response=json({options:[option(true,receipts.get(body.source_request_id)?.options?.[0]?.provenance.kind==='official')]});
  else if(body.operation==='import_discovery')response=json({options:[option(false,true)]});
  else if(body.operation==='review'){
   const original=receipts.get(body.source_request_id).options.find(o=>o.id===body.option_id);
   const values=Object.fromEntries(Object.entries(original.nutrition.values).map(([k,v])=>[k,body.edited_values?.[k]??(v===null?null:Math.round(v*body.servings*10)/10)]));
   response=json({status:'review',options:[],review:{option_id:original.id,name:original.name,servings:body.servings,values,authority:body.edited_values?'user_edited':original.nutrition.authority,original_source:original.provenance,original_nutrition:original.nutrition,assumptions:original.nutrition.assumptions,ready_for_explicit_confirmation:Object.values(values).every(v=>v!==null)&&body.estimate_acknowledged&&body.ingredient_review_acknowledged,logged:false}});
  }
  receipts.set(body.request_id,response);if(state.lose)throw Error('connection lost');return Response.json(response);
 }};
 const transport=createMealTransport(deps),services=createMealServices({transport,owner:deps.owner,today:deps.today,store,subscribeInvalidation:()=>()=>{},write:async body=>writes.push(body)});
 return {state,rows,receipts,calls,writes,deps,transport,services,access:()=>state.access,json};
}
test('gallery -> explicit automatic estimate -> review -> explicit log uses same app contract and preserves provenance',async()=>{
 const f=fixture();const found=await f.services.explore(f.access,input,'dinner');assert.equal(found.kind,'ready');assert.equal(found.options[0].nutrition.values.fiber,null);assert.equal(f.calls.length,1);assert.equal(f.calls[0].experience,'meal_v2');assert.equal(f.writes.length,0);
 const estimated=await f.services.estimate(f.access,found,found.options[0].id);assert.equal(f.calls[1].operation,'estimate');assert.equal(f.calls[1].consent,true);assert.equal(f.calls[1].source_request_id,found.requestId);assert.equal(estimated.options[0].nutrition.values.fiber,4);
 const session=f.services.review(estimated,estimated.options[0].id,f.access),edit={...editMealNutrition(session.context.option,1.5,{}),estimateAcknowledged:true,ingredientAcknowledged:true};
 const reviewed=await session.prepare(edit);assert.ok(reviewed);assert.equal(f.writes.length,0);assert.equal((await session.confirm(reviewed,true)).status,'complete');assert.equal(f.writes.length,1);assert.equal(f.writes[0].p_calories,750);assert.equal(f.writes[0].p_fiber,6);assert.equal(f.writes[0].p_meal_type,'dinner');assert.match(f.writes[0].p_serving_description,/ESTIMATE/);assert.equal(f.writes[0].p_food_id,null);assert.ok(f.writes[0].p_logged_at);
});
test('restaurant -> explicit discovery SSE -> import -> estimate -> in-app review -> explicit log, no recipe instructions required',async()=>{
 const f=fixture(),found=await f.services.explore(f.access,{...input,mode:'eat_out',restaurant:'Example restaurant'},'lunch');assert.equal(f.calls.length,1);assert.equal(found.options.length,0);
 const menu=await f.services.discover(f.access,found);assert.deepEqual(f.calls.slice(1).map(b=>b.operation),['discover','import_discovery']);assert.notEqual(f.calls[1].request_id,f.calls[2].request_id);assert.equal(menu.options[0].kind,'restaurant');assert.deepEqual(menu.options[0].instructions,[]);
 const estimate=await f.services.estimate(f.access,menu,menu.options[0].id),session=f.services.review(estimate,estimate.options[0].id,f.access);
 const review=await session.prepare({...editMealNutrition(session.context.option,1,{}),estimateAcknowledged:true,ingredientAcknowledged:true});assert.equal(f.writes.length,0);await session.confirm(review,true);assert.equal(f.writes.length,1);assert.equal(f.writes[0].p_meal_type,'lunch');
});
test('restart recovery retains custom explore inputs and ID and never resends an uncertain paid estimate',async()=>{
 const f=fixture();f.state.lose=true;assert.equal((await f.services.explore(f.access,input,'dinner')).kind,'pending');const original=f.calls[0];assert.equal((await f.services.explore(f.access,{...input,food_query:'salmon'},'dinner')).kind,'pending');assert.equal(f.calls.length,1);
 f.state.lose=false;const restarted=createMealTransport(f.deps),recovered=await restarted.recover(f.access);assert.equal(recovered.kind,'ready');assert.deepEqual(f.calls[1],{intent:'recover_daily',request_id:original.request_id,journey:'meal_explore_v1'});assert.equal([...f.rows.keys()].filter(k=>!k.endsWith(':completed')).length,0);assert.ok(await restarted.saved(f.access));
 const found=await f.services.explore(f.access,input,'dinner');f.state.lose=true;await f.services.estimate(f.access,found,found.options[0].id);const estimateId=f.calls.at(-1).request_id;f.state.lose=false;await restarted.recover(f.access);assert.equal(f.calls.at(-1).request_id,estimateId);assert.equal(f.calls.at(-1).intent,'recover_daily');assert.equal(f.calls.filter(b=>b.operation==='estimate').length,1);
});
test('uncertain modern discovery recovers with identical bridge, then imports once with new ID',async()=>{
 const f=fixture(),found=await f.services.explore(f.access,{...input,mode:'eat_out',restaurant:'Example'},'dinner');f.state.lose=true;await f.services.discover(f.access,found);const original=f.calls.at(-1);assert.equal(original.operation,'discover');f.state.lose=false;const result=await f.services.recover(f.access);assert.equal(result.kind,'ready');assert.deepEqual(f.calls.at(-2),original);assert.equal(f.calls.at(-1).operation,'import_discovery');assert.equal(f.calls.filter(b=>b.intent==='recover_daily').length,0);
});
test('paid eligibility false exposes no runnable operation and never auto-dispatches after empty gallery',async()=>{const f=fixture();f.state.capabilities=false;const found=await f.services.explore(f.access,{...input,mode:'eat_out',restaurant:'Example'},'dinner');assert.equal(found.capabilities.discovery,false);assert.equal((await f.services.discover(f.access,found)).kind,'blocked');assert.equal((await f.services.estimate(f.access,found,'unknown')).kind,'blocked');assert.equal(f.calls.length,1);});
test('free, loading, error, usage gates, revoked owner and midnight block transport and stale review',async()=>{for(const patch of [{isPremium:false},{premiumLoading:true},{premiumError:'offline'},{gated:true},{busy:true}]){const f=fixture();f.state.access={...f.state.access,...patch};assert.equal((await f.services.explore(f.access,input,'dinner')).kind,'blocked');assert.equal(f.calls.length,0);}for(const mutate of [f=>f.state.owner='B',f=>f.state.day='2026-10-23',f=>f.state.access.isPremium=false]){const f=fixture(),invoke=f.deps.invoke;f.deps.invoke=async b=>{const result=await invoke(b);mutate(f);return result};assert.equal((await f.services.explore(f.access,input,'dinner')).kind,'blocked');}});
test('denied discovery returns actual gate with no fallback and no second request',async()=>{const f=fixture(),found=await f.services.explore(f.access,{...input,mode:'eat_out',restaurant:'Example'},'dinner');f.state.deny=true;const result=await f.services.discover(f.access,found);assert.equal(result.kind,'blocked');assert.equal(result.reason,'pilot_not_enabled');assert.equal(f.calls.length,2);});
test('parallel calls do not unlock another running request; corrupted recovery envelope never dispatches',async()=>{const f=fixture(),invoke=f.deps.invoke;let release;f.deps.invoke=body=>new Promise(r=>release=()=>invoke(body).then(r));const first=f.services.explore(f.access,input,'dinner');while(!release)await new Promise(r=>setImmediate(r));await f.services.explore(f.access,input,'dinner');await f.services.explore(f.access,input,'dinner');assert.equal(f.calls.length,0);release();await first;f.state.lose=true;f.deps.invoke=invoke;await f.services.explore(f.access,input,'dinner');const [key,raw]=[...f.rows].find(([key])=>!key.endsWith(':completed')),row=JSON.parse(raw);row.envelope.unauthorized_extra='bad';f.rows.set(key,JSON.stringify(row));const count=f.calls.length;assert.equal((await f.transport.recover(f.access)).kind,'blocked');assert.equal(f.calls.length,count);});
test('review restart restores selected-portion total edits and uses recovered receipt without another prepare call',async()=>{
 const f=fixture(),found=await f.services.explore(f.access,input,'dinner'),session=f.services.review(found,found.options[0].id,f.access);
 f.state.lose=true;const edit={...editMealNutrition(session.context.option,2,{protein:'48',fiber:'7'}),estimateAcknowledged:true,ingredientAcknowledged:true};assert.equal(await session.prepare(edit),null);const original=f.calls.at(-1);f.state.lose=false;
 const recovered=await f.services.recover(f.access);assert.equal(recovered.kind,'recovered_review');assert.equal(recovered.session.initialEdit.multiplier,2);assert.equal(recovered.session.initialEdit.values.protein,48);const count=f.calls.length;
 const prepared=await recovered.session.prepare(recovered.session.initialEdit);assert.ok(prepared);assert.equal(f.calls.length,count);assert.equal(f.calls.at(-1).request_id,original.request_id);await recovered.session.confirm(prepared,true);assert.equal(f.writes[0].p_protein,48);assert.equal(f.writes[0].p_fiber,7);
});
test('completed receipt prevents duplicate Add even after reopening the same meal review',async()=>{
 const f=fixture(),found=await f.services.explore(f.access,input,'dinner');
 for(let i=0;i<2;i++){const session=f.services.review(found,found.options[0].id,f.access);const reviewed=await session.prepare({...editMealNutrition(session.context.option,1,{fiber:'4'}),estimateAcknowledged:true,ingredientAcknowledged:true});assert.equal((await session.confirm(reviewed,true)).status,'complete');}
 assert.equal(f.writes.length,1);
});
test('known refunded discovery is terminal without import or automatic retry; uncertainty stays recoverable',async()=>{
 for(const status of ['refunded','uncertain']){const f=fixture(),found=await f.services.explore(f.access,{...input,mode:'eat_out',restaurant:'Example'},'dinner');f.deps.invoke=async body=>new Response(`data: ${JSON.stringify({done:true,request_id:body.request_id,usage_status:status})}\n\n`,{headers:{'Content-Type':'text/event-stream'}});const result=await f.services.discover(f.access,found);assert.equal(result.kind,status==='refunded'?'blocked':'pending');assert.equal(f.rows.size,status==='refunded'?0:1);}
});

test('actual recovered service plus review component allows portion edit, ingredient re-acknowledgement and explicit Add',async()=>{
 const f=fixture(),found=await f.services.explore(f.access,input,'dinner'),estimated=await f.services.estimate(f.access,found,found.options[0].id),session=f.services.review(estimated,estimated.options[0].id,f.access);
 f.state.lose=true;assert.equal(await session.prepare({...editMealNutrition(session.context.option,1,{}),estimateAcknowledged:true,ingredientAcknowledged:true}),null);f.state.lose=false;
 const recovered=await f.services.recover(f.access);assert.equal(recovered.kind,'recovered_review');assert.equal(recovered.session.initialEdit.ingredientAcknowledged,true);
 const React=require('react'),Module=require('node:module'),path=require('node:path'),original=Module._load,states=[],refs=[];let cursor=0,ref=0;
 const fake={...React,useState(init){const i=cursor++;if(!(i in states))states[i]=i===0?true:typeof init==='function'?init():init;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useEffect(){},useRef(init){const i=ref++;return refs[i]??(refs[i]={current:init})}};
 const previousTSX=require.extensions['.tsx'];require.extensions['.tsx']=(m,p)=>m._compile(ts.transpile(fs.readFileSync(p,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}),p);
 Module._load=function(name,parent,isMain){if(name==='react')return fake;if(name==='react-native')return new Proxy({StyleSheet:{create:x=>x}},{get:(o,k)=>o[k]??String(k)});if(name==='react-i18next')return {useTranslation:()=>({i18n:{language:'en'}})};if(name.startsWith('@/'))return original.call(this,path.resolve(__dirname,'..',name.slice(2)),parent,isMain);return original.call(this,name,parent,isMain)};
 try{
  const file=require.resolve('../components/CoachMealReview.tsx');delete require.cache[file];const Component=require(file).default,render=()=>{cursor=ref=0;return Component({session:recovered.session,onCancel(){}})};
  const nodes=n=>!n||typeof n!=='object'?[]:[n,...React.Children.toArray(n.props?.children).flatMap(nodes)],text=n=>n==null?'':typeof n==='string'||typeof n==='number'?String(n):React.Children.toArray(n.props?.children).map(text).join(' ');
  const button=(tree,label)=>nodes(tree).find(n=>n.props?.accessibilityRole==='button'&&text(n)===label),ingredient=tree=>nodes(tree).find(n=>n.props?.accessibilityRole==='checkbox'&&text(n).includes('ingredient and allergy'));
  let tree=render();nodes(tree).find(n=>n.props?.accessibilityLabel==='Portion multiplier').props.onChangeText('1.5');tree=render();assert.match(text(tree),/750/);assert.equal(f.writes.length,0);
  const checkbox=ingredient(tree);assert.ok(checkbox,'ingredient acknowledgement remains visible after recovery and portion change');assert.equal(checkbox.props.accessibilityState.checked,false);checkbox.props.onPress();tree=render();nodes(tree).find(n=>n.props?.accessibilityRole==='checkbox'&&text(n).includes('Use these labeled estimates')).props.onPress();
  button(render(),'Review diary entry').props.onPress();await new Promise(r=>setImmediate(r));tree=render();assert.equal(f.calls.at(-1).ingredient_review_acknowledged,true);assert.equal(f.calls.at(-1).servings,1.5);assert.equal(f.writes.length,0);assert.equal(button(tree,'Add to diary').props.disabled,false);button(tree,'Add to diary').props.onPress();await new Promise(r=>setImmediate(r));assert.equal(f.writes.length,1);assert.equal(f.writes[0].p_calories,750);assert.match(text(render()),/Added to your diary/);
 }finally{Module._load=original;if(previousTSX)require.extensions['.tsx']=previousTSX;else delete require.extensions['.tsx'];}
});

test('restart retains only a scoped receipt reference; restoring is explicit read-only and refreshes capability',async()=>{
 const f=fixture();const found=await f.services.explore(f.access,input,'dinner');const persisted=[...f.rows.values()].map(JSON.parse);assert.equal(persisted.length,1);assert.deepEqual(Object.keys(persisted[0]).sort(),['date','meal','mode','owner','requestId','zone'].sort());assert.equal(JSON.stringify(persisted).includes('Chicken'),false);
 const restarted=createMealTransport(f.deps);assert.ok(await restarted.saved(f.access));assert.equal(f.calls.length,1);f.receipts.get(found.requestId).paid_capabilities={discovery:false,estimate:false,reason:'pilot_not_enabled'};
 const service=createMealServices({transport:restarted,owner:f.deps.owner,today:f.deps.today,store:f.deps.store,subscribeInvalidation:()=>()=>{},write:async p=>f.writes.push(p)});
 const restored=await service.restore(f.access);assert.equal(restored.kind,'ready');assert.equal(restored.capabilities.estimate,false);assert.equal(restored.meal,'dinner');assert.deepEqual(f.calls[1],{intent:'recover_daily',request_id:found.requestId,journey:'meal_explore_v1'});assert.equal(f.writes.length,0);
});
test('saved cards cannot restore across owner, local date, timezone, or free access',async()=>{const f=fixture();await f.services.explore(f.access,input,'dinner');for(const [key,value] of [['owner','B'],['day','2026-10-23'],['zone','UTC'],['access',{...f.state.access,isPremium:false}]]){const old=f.state[key];f.state[key]=value;assert.equal(await f.transport.saved(f.access),null);assert.equal((await f.transport.restore(f.access)).kind,'blocked');f.state[key]=old;}assert.equal(f.calls.length,1)});
test('saved cards never replay provider work and remain retryable after revoked access or malformed receipt',async()=>{const f=fixture();const found=await f.services.explore(f.access,input,'dinner');f.state.deny=true;assert.equal((await f.services.restore(f.access)).kind,'unavailable');assert.ok(await f.transport.saved(f.access));f.state.deny=false;f.receipts.get(found.requestId).owner='B';assert.equal((await f.services.restore(f.access)).kind,'unavailable');assert.ok(f.calls.slice(1).every(b=>b.intent==='recover_daily'));assert.equal(f.writes.length,0)});
test('saved-card restore fails closed after account switch while parsing receipt',async()=>{const f=fixture();await f.services.explore(f.access,input,'dinner');const actual=f.deps.invoke;f.deps.invoke=async b=>{const r=await actual(b);return {ok:true,json:async()=>{f.state.owner='B';return r.json()}}};assert.equal((await createMealTransport(f.deps).restore(f.access)).reason,'scope_changed');assert.equal(f.writes.length,0)});

test('confirmed dietary restrictions survive same-day restart and empty later model intake does not erase them',async()=>{const f=fixture();const {emptyConstraints,mergeConstraints}=require('../utils/coachDietaryConstraints');const c={...emptyConstraints(),allergens:['peanuts'],dietary_preferences:['vegan']};await f.services.confirmConstraints(c,'A','2026-10-22');assert.deepEqual(await f.services.confirmedConstraints(),c);assert.deepEqual(mergeConstraints(await f.services.confirmedConstraints(),emptyConstraints()),c);f.state.owner='B';assert.deepEqual(await f.services.confirmedConstraints(),emptyConstraints());f.state.owner='A';f.state.day='2026-10-23';assert.deepEqual(await f.services.confirmedConstraints(),emptyConstraints());await assert.rejects(f.services.confirmConstraints(c,'A','2026-10-22'),/scope_changed/);});
test('invalid dietary metadata cannot become measured or allergy-safe evidence',()=>{const {parseConstraints,mergeConstraints,emptyConstraints}=require('../utils/coachDietaryConstraints');assert.equal(parseConstraints({...emptyConstraints(),verification:'verified'}),null);assert.equal(parseConstraints({...emptyConstraints(),allergens:['']}),null);assert.equal(mergeConstraints({...emptyConstraints(),exclusions:Array.from({length:12},(_,i)=>String(i))},{...emptyConstraints(),exclusions:['extra']}),null);});

async function stoppedFixture(){
 const f=fixture(),found=await f.services.explore(f.access,{...input,mode:'eat_out',public_area:'Orlando, Florida'},'dinner');
 f.receipts.get(found.requestId).discovery_request.area='Orlando, Florida';
 const original=f.deps.invoke;let parentId;
 f.deps.invoke=async body=>{if(body.operation==='discover'){f.calls.push(body);parentId??=body.request_id;return Response.json({error:'execution_stopped',request_id:body.request_id,execution_state:'stopped',retry_eligible:true,successor_request_id:null},{status:409});}return original(body)};
 const offer=await f.services.discover(f.access,found);assert.equal(offer.kind,'retry_available');
 return {...f,found,offer,original,parentId};
}
test('verified stopped discovery offers original details without automatically creating a successor; reload rechecks same ID',async()=>{
 const f=await stoppedFixture();assert.equal(f.offer.publicRequest.food,'chicken rice');assert.equal(f.offer.publicRequest.area,'Orlando, Florida');
 assert.equal(f.calls.filter(b=>b.operation==='discover').length,1);const parent=await f.transport.pending(f.access);assert.equal(parent.envelope.request_id,f.parentId);
 const restarted=createMealTransport(f.deps);assert.equal((await restarted.retry(f.access,f.offer)).reason,'retry_confirmation_expired');
 const recovered=await restarted.recover(f.access);assert.equal(recovered.kind,'retry_available');assert.equal(recovered.requestId,f.parentId);
 assert.ok(f.calls.filter(b=>b.operation==='discover').every(b=>b.request_id===f.parentId));assert.equal(f.writes.length,0);
});
test('explicit successor is durable before dispatch, retains parent, and lost reply/restart uses exactly that ID',async()=>{
 const f=await stoppedFixture(),parent=await f.transport.pending(f.access),terminal=f.deps.invoke;let child;
 f.deps.invoke=async body=>{if(body.operation==='discover'&&body.retry_of_request_id){f.calls.push(body);child=body;assert.deepEqual((await f.transport.pending(f.access)).envelope,body);throw Error('lost reply')}return terminal(body)};
 assert.equal((await f.transport.retry(f.access,f.offer)).kind,'pending');assert.equal(child.retry_of_request_id,f.parentId);assert.notEqual(child.request_id,f.parentId);assert.equal(child.source_request_id,parent.envelope.source_request_id);assert.equal(child.time_zone,parent.envelope.time_zone);assert.equal(child.consent,true);
 const archived=[...f.rows].find(([k])=>k.endsWith(':stopped:'+f.parentId));assert.deepEqual(JSON.parse(archived[1]).envelope,parent.envelope);
 f.deps.invoke=f.original;const restarted=createMealTransport(f.deps);const result=await restarted.recover(f.access);assert.equal(result.kind,'ready');assert.deepEqual(f.calls.at(-1),child);assert.equal((await restarted.pending(f.access)).completed,true);assert.equal(f.writes.length,0);
});
test('unknown, active, mismatched or successor-claimed responses never authorize a fresh ID',async()=>{
 for(const patch of [{execution_state:'generating'},{execution_state:'committing'},{retry_eligible:false},{successor_request_id:'22222222-2222-4222-8222-222222222222'},{request_id:'22222222-2222-4222-8222-222222222222'},{execution_state:undefined}]){
  const f=fixture(),found=await f.services.explore(f.access,{...input,mode:'eat_out'},'dinner');f.deps.invoke=async b=>{f.calls.push(b);return Response.json({error:'execution_stopped',request_id:b.request_id,execution_state:'stopped',retry_eligible:true,successor_request_id:null,...patch},{status:409})};
  const result=await f.services.discover(f.access,found);assert.equal(result.kind,'pending');const before=await f.transport.pending(f.access);await f.transport.recover(f.access);assert.equal((await f.transport.pending(f.access)).envelope.request_id,before.envelope.request_id);assert.equal(f.calls.length,3);
 }
});
test('double confirmation cannot create two successors and scope changes or failed persistence dispatch none',async()=>{
 const f=await stoppedFixture(),invoke=f.deps.invoke;let release;f.deps.invoke=body=>new Promise(resolve=>{release=()=>invoke(body).then(resolve)});
 const first=f.transport.retry(f.access,f.offer);while(!release)await new Promise(r=>setImmediate(r));const second=await f.transport.retry(f.access,f.offer);assert.equal(second.reason,'execution_active');
 f.state.owner='B';release();assert.equal((await first).reason,'scope_changed');assert.equal(f.calls.filter(b=>b.retry_of_request_id).length,0);
 const g=await stoppedFixture();g.deps.store.setItem=async()=>{throw Error('disk full')};assert.equal((await g.transport.retry(g.access,g.offer)).kind,'pending');assert.equal(g.calls.filter(b=>b.retry_of_request_id).length,0);assert.equal((await g.transport.pending(g.access)).envelope.request_id,g.parentId);
 const h=await stoppedFixture();h.state.day='2026-10-23';assert.equal((await h.transport.retry(h.access,h.offer)).kind,'blocked');assert.equal(h.calls.filter(b=>b.retry_of_request_id).length,0);
});

test('real meal bridge accepts the client successor contract, preserves public query and existing retry guard',async()=>{
 const path=require('node:path'),root=path.join(__dirname,'../supabase/functions/ai-coach');
 const {createMealExploreRoute}=require(path.join(root,'meal-explore-route.ts')),{mealDiscoveryRetryCheck}=require(path.join(root,'meal-discovery-retry.ts')),{coachRequest}=require(path.join(root,'_shared/coach-access.ts'));
 const owner='3af0eabf-e742-4657-80c4-130dfa867502',sourceId='33333333-3333-4333-8333-333333333333',parentId='44444444-4444-4444-8444-444444444444';
 const source={owner,date:'2026-10-22',schema:'meal_explore_v1',status:'discovery_available',options:[],discovery_request:{food:'grilled chicken rice and vegetables',mode:'restaurant',area:'Orlando, Florida',preference:'high_protein'},paid_capabilities:{discovery:true,estimate:true,reason:null}};
 const db={auth:{getUser:async()=>({data:{user:{id:owner}}})},from:table=>({select:()=>({eq:()=>table==='subscriptions'?Promise.resolve({data:[{entitlement_ids:['Macrogoal Pro'],status:'active',expiration_at:null}]}):{maybeSingle:async()=>({data:{permission_level:1}})}})}),rpc:async(name)=>name==='coach_web_pilot_enabled_v1'?{data:true}:name==='coach_recover_requests_v1'?{data:[{request_id:sourceId,state:'completed',request_payload:{journey:'meal_explore_v1'},result:{manual_handoff_v1:{body:source}}}]}:{error:'unexpected_rpc'}};
 let parent,executions=0;const bridged=[];
 const route=createMealExploreRoute(db,async req=>{const body=await req.json();bridged.push(body);if(!body.retry_of_request_id){parent??={user_id:owner,request_id:body.request_id,request_payload:body,state:'uncertain',execution_state:'stopped',retry_eligible:true,successor_request_id:null};return Response.json({error:'execution_stopped',request_id:body.request_id,execution_state:'stopped',retry_eligible:true,successor_request_id:null},{status:409});}
  assert.equal(body.retry_consent,true);assert.equal(mealDiscoveryRetryCheck(parent,{owner,parentId:body.retry_of_request_id,requestId:body.request_id,fingerprint:coachRequest(body).fingerprintInput,confirmed:body.retry_consent}),null);executions++;return new Response(`data: ${JSON.stringify({done:true,request_id:body.request_id,usage_status:'completed'})}\n\n`,{headers:{'Content-Type':'text/event-stream'}});
 },undefined,()=>Date.parse('2026-10-22T12:00:00Z'));
 const rows=new Map(),access={isPremium:true,premiumLoading:false,gated:false,busy:false};let ids=0;
 const transport=createMealTransport({scope:'bridge-test',owner:async()=>owner,today:()=>source.date,zone:()=> 'UTC',newId:()=>++ids===1?parentId:'55555555-5555-4555-8555-555555555555',store:{getItem:async k=>rows.get(k)??null,setItem:async(k,v)=>rows.set(k,v),removeItem:async k=>rows.delete(k)},invoke:async body=>body.intent==='recover_daily'?Response.json(source):route(new Request('https://offline.invalid',{method:'POST',headers:{authorization:'Bearer offline'},body:JSON.stringify(body)}))});
 const offer=await transport.run(access,{operation:'discover',source_request_id:sourceId,consent:true},{meal:'dinner',mode:'eat_out'});assert.equal(offer.kind,'retry_available');assert.equal(executions,0);
 const response=await transport.retry(access,offer);assert.equal(response.kind,'ready');assert.equal(executions,1);assert.deepEqual(bridged[0].messages,bridged.at(-1).messages);assert.match(bridged.at(-1).messages[0].content,/grilled chicken rice and vegetables/);assert.match(bridged.at(-1).messages[0].content,/Orlando, Florida/);assert.equal(bridged.at(-1).meal_source_request_id,sourceId);assert.equal(bridged.at(-1).retry_of_request_id,parentId);
});

test('a claimed successor or revoked eligibility during confirmation preserves the parent and never starts another',async()=>{
 for(const patch of [{successor_request_id:'66666666-6666-4666-8666-666666666666'},{retry_eligible:false},{execution_state:'committing'}]){
  const f=await stoppedFixture();f.deps.invoke=async b=>{f.calls.push(b);return Response.json({error:'execution_stopped',request_id:b.request_id,execution_state:'stopped',retry_eligible:true,successor_request_id:null,...patch},{status:409})};
  assert.equal((await f.transport.retry(f.access,f.offer)).reason,'retry_state_changed');assert.equal((await f.transport.pending(f.access)).envelope.request_id,f.parentId);assert.equal(f.calls.filter(b=>b.retry_of_request_id).length,0);
 }
 const f=await stoppedFixture();const result=await f.transport.run(f.access,{operation:'discover',source_request_id:f.found.requestId,consent:true,retry_of_request_id:f.parentId,retry_consent:true},{meal:'dinner',mode:'eat_out'});assert.equal(result.reason,'retry_confirmation_required');
});
test('confirmed retry service imports completed options without a chat turn or diary write',async()=>{
 const f=await stoppedFixture(),terminal=f.deps.invoke;f.deps.invoke=b=>b.retry_of_request_id?f.original(b):terminal(b);
 const result=await f.services.retrySearch(f.access,f.offer);assert.equal(result.kind,'ready');assert.equal(result.options[0].kind,'restaurant');assert.equal(f.calls.filter(b=>b.retry_of_request_id).length,1);assert.equal(f.calls.at(-1).operation,'import_discovery');assert.equal(f.calls.some(b=>b.experience==='conversation_v1'),false);assert.equal(f.writes.length,0);
});

test('parent-ID replay or denial cannot complete or retire the saved child; restart retries only that exact child',async()=>{
 for(const outcome of ['completed_parent','parent_denial','retry_exists']){
  const f=await stoppedFixture(),terminal=f.deps.invoke;let child;
  f.deps.invoke=async body=>{if(!body.retry_of_request_id)return terminal(body);f.calls.push(body);child??=body;assert.deepEqual(body,child);
   if(outcome==='completed_parent')return new Response(`data: ${JSON.stringify({done:true,request_id:f.parentId,execution_state:'completed',usage_status:'completed'})}\n\n`,{headers:{'Content-Type':'text/event-stream'}});
   return Response.json({error:outcome==='retry_exists'?'retry_exists':'retry_not_eligible',request_id:f.parentId,execution_state:'stopped',retry_eligible:false,successor_request_id:outcome==='retry_exists'?child.request_id:null,admission_state:'not_admitted'},{status:409});
  };
  assert.equal((await f.transport.retry(f.access,f.offer)).kind,'pending');const saved=await f.transport.pending(f.access);assert.equal(saved.envelope.request_id,child.request_id);assert.notEqual(child.request_id,f.parentId);assert.equal(saved.completed,undefined);
  const restarted=createMealTransport(f.deps);assert.equal((await restarted.recover(f.access)).kind,'pending');assert.deepEqual((await restarted.pending(f.access)).envelope,child);assert.equal(f.calls.filter(b=>b.retry_of_request_id).length,2);assert.equal(f.calls.filter(b=>b.operation==='import_discovery').length,0);
  const calls=f.calls.length;assert.equal((await restarted.run(f.access,{operation:'explore',...input,food_query:'salmon'},{meal:'dinner',mode:'cook'})).kind,'pending');assert.equal(f.calls.length,calls);
 }
});
test('stale original source receipt cannot offer a cross-day retry or reconstruct details from conversation',async()=>{
 const f=await stoppedFixture();f.receipts.get(f.found.requestId).date='2026-10-21';const result=await f.transport.recover(f.access);assert.equal(result.reason,'retry_details_unavailable');assert.equal((await f.transport.pending(f.access)).envelope.request_id,f.parentId);assert.equal(f.calls.filter(b=>b.retry_of_request_id).length,0);
});
