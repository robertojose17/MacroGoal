const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpile(fs.readFileSync(f,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),f);
const root=process.env.COACH_SOURCE||path.join(__dirname,'../supabase/functions/ai-coach');
const {createMealExploreRoute}=require(path.join(root,'meal-explore-route.ts'));
const owner='3af0eabf-e742-4657-80c4-130dfa867502',source='33333333-3333-4333-8333-333333333333',id='22222222-2222-4222-8222-222222222222';
function setup(scenario='ok'){
 const now=Date.now(),day=new Date(now).toISOString().slice(0,10),calls=[],rows=new Map();let pending,provider=0;
 rows.set(source,{request_id:source,state:scenario==='unfinished'?'pending':'completed',request_payload:{journey:'meal_explore_v1'},result:{manual_handoff_v1:{body:{schema:'meal_explore_v1',owner:scenario==='wrongOwner'?'other':owner,date:scenario==='stale'?'2000-01-01':day,discovery_request:{food:'grilled chicken and rice',restaurant:'Not to be copied',area:'Not to be copied'},dietary_constraints:{exclusions:[],allergens:['peanuts'],dietary_preferences:scenario==='conflict'?['vegan']:[]}}}}});
 const db={auth:{getUser:async()=>({data:{user:scenario==='unauthorized'?null:{id:owner}}})},from:table=>({select:()=>({eq:()=>table==='subscriptions'?Promise.resolve({data:scenario==='free'?[]:[{entitlement_ids:['Macrogoal Pro'],status:'active',expiration_at:null}]}):{maybeSingle:async()=>({data:{permission_level:scenario==='permission'?0:1}})}})}),rpc:async(name,args)=>{calls.push(name);
 if(name==='coach_recover_requests_v1')return scenario==='lookupUncertain'&&args.p_request_id===id?{data:null,error:{message:'fixture unavailable'}}:{data:rows.has(args.p_request_id)?[rows.get(args.p_request_id)]:[]};
 if(name==='coach_web_pilot_enabled_v1')return {data:false};
 if(name==='coach_begin_execution_v2'){a.equal(args.p_reserve_web,false);if(scenario==='budget')return {data:{kind:'budget_limit',status:403}};pending={request_payload:args.p_request_payload};return {data:{kind:'reserved',attempt_id:id,execution_token:source,execution_deadline_at:new Date(now+90000).toISOString(),web_reserved:false}};}
 if(name==='coach_claim_commit_v2'){a.deepEqual(args.p_plan.memories,[]);a.equal(args.p_plan.action_payload,null);pending.result={...args.p_plan.result,execution_state:'completed'};return {data:{claimed:true}};}
 if(name==='coach_commit_execution_v2'){rows.set(args.p_request_id,{...pending,request_id:args.p_request_id,state:'completed'});return {data:pending.result};}
 throw Error('Unexpected RPC '+name);
 }};
 const forbidden=async()=>{provider++;throw Error('provider forbidden');};
 const route=createMealExploreRoute(db,forbidden,undefined,()=>now,forbidden,{key:()=>'',fetcher:forbidden});
 const send=async(extra={})=>route(new Request('https://example.invalid',{method:'POST',headers:{authorization:'Bearer fixture'},body:JSON.stringify({intent:'meal_choice',experience:'meal_v2',operation:'prepare_general_estimate',request_id:id,time_zone:'UTC',source_request_id:source,portion_label:'one bowl, 1 cup rice and one chicken breast',general_meal_acknowledged:true,...extra})}));
 return {send,calls,rows,provider:()=>provider};
}
test('actual route journals unpaid unknown general option, preserves constraints and replays without another admission',async()=>{
 const x=setup(),r=await x.send();a.equal(r.status,200);const b=await r.json(),o=b.options[0];a.equal(o.identity.kind,'general_meal');a.equal(o.provenance.kind,'estimate');a.equal(o.venue,undefined);a.equal(o.identity.entity,undefined);a.equal(o.physical_portion,undefined);a.ok(Object.values(o.nutrition.values).every(v=>v===null));a.deepEqual(o.dietary_constraints.allergens,['peanuts']);a.equal(b.server_auto_logging,false);a.equal(b.paid_capabilities.estimate,false);
 a.equal((await x.send()).status,200);a.equal(x.calls.filter(n=>n==='coach_begin_execution_v2').length,1);a.equal((await x.send({portion_label:'different bowl'})).status,409);a.equal(x.provider(),0);
});
test('source, entitlement, permission and budget failures never dispatch or log',async()=>{for(const s of ['wrongOwner','stale','unfinished','unauthorized','free','permission','budget','conflict']){const x=setup(s),r=await x.send();a.ok(r.status>=400,s+': '+r.status);a.equal(x.provider(),0);a.equal(x.calls.includes('log_food'),false);if(s!=='budget')a.equal(x.calls.includes('coach_begin_execution_v2'),false,s);}});
test('explicit confirmation, portion and allowlist reject injected source/nutrition',async()=>{for(const extra of [{general_meal_acknowledged:false},{portion_label:''},{portion_label:'https://evil.invalid'},{nutrition:{calories:123}},{venue:{name:'invented'}},{source_request_id:id}]){const x=setup(),r=await x.send(extra);a.ok(r.status>=400);a.equal(x.calls.includes('coach_begin_execution_v2'),false);a.equal(x.provider(),0);}});
test('portion-described allergens and private context reject before admission',async()=>{
 for(const portion_label of ['one bowl with peanut sauce','one bowl for my diabetes at 123 Main Street','one bowl, my diabetes','one bowl at 123 Main St','one bowl, send my password']){
  const x=setup(),r=await x.send({portion_label});a.equal(r.status,400,portion_label);a.equal(x.calls.includes('coach_begin_execution_v2'),false);a.equal(x.provider(),0);
 }
});
test('compound source retains components and preparation without exact restaurant matching',async()=>{
 for(const food of ['grilled chicken, rice and vegetables','pollo a la parrilla arroz y verduras']){
  const x=setup();x.rows.get(source).result.manual_handoff_v1.body.discovery_request.food=food;
  const r=await x.send();a.equal(r.status,200);a.equal((await r.json()).options[0].name,food);
 }
});
test('actual estimate route rejects unsafe override before paid admission',async()=>{
 for(const portion_label of ['one bowl with peanut sauce','one bowl for my diabetes at 123 Main Street']){
  const x=setup();a.equal((await x.send()).status,200);const count=x.calls.length;
  const r=await x.send({operation:'estimate',request_id:'44444444-4444-4444-8444-444444444444',source_request_id:id,option_id:'general-meal',portion_label,consent:true,general_meal_acknowledged:undefined});
  a.equal(r.status,400);a.equal(x.calls.slice(count).includes('coach_begin_execution_v2'),false);a.equal(x.provider(),0);
 }
});
test('estimator boundary rejects unsafe stored portions without fetching',async()=>{
 const {prepareGeneralMeal}=require(path.join(root,'general-meal.ts')),{estimateMeal}=require(path.join(root,'meal-auto-estimate.ts'));
 const x=setup(),origin=x.rows.get(source).result.manual_handoff_v1.body;
 for(const portion_label of ['one bowl with peanut sauce','one bowl for my diabetes at 123 Main Street']){
  const option=prepareGeneralMeal(origin,'one bowl');option.identity.portion_label=portion_label;let calls=0;
  await a.rejects(estimateMeal(option,{deadline:Date.now()+10000,record:()=>a.fail('record must not run')},'fixture',async()=>{calls++;throw Error('unexpected fetch');}));a.equal(calls,0);
 }
});
test('validation metadata proves absence, never mislabels existing or uncertain receipt',async()=>{
 const x=setup();let r=await x.send({portion_label:'one bowl with peanut sauce'}),b=await r.json();a.equal(b.request_id,id);a.equal(b.admission_state,'not_admitted');
 const uncertain=setup('lookupUncertain');b=await (await uncertain.send({portion_label:'one bowl with peanut sauce'})).json();a.equal(b.admission_state,undefined);a.equal(b.next_action,'recover_existing_request');
 a.equal((await x.send()).status,200);r=await x.send({portion_label:'one bowl with peanut sauce'});b=await r.json();a.equal(b.request_id,id);a.equal(b.admission_state,undefined);a.equal(b.next_action,'recover_existing_request');
 const y=setup();a.equal((await y.send()).status,200);r=await y.send({operation:'estimate',request_id:'44444444-4444-4444-8444-444444444444',source_request_id:id,option_id:'general-meal',portion_label:'one bowl with peanut sauce',consent:true,general_meal_acknowledged:undefined});b=await r.json();a.equal(b.admission_state,'not_admitted');a.equal(b.request_id,'44444444-4444-4444-8444-444444444444');
});
