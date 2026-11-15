/** Execution pending: local runner blocked before test evaluation. Not live or E2E proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnapshotOrchestrationSupabasePorts,createSnapshotOrchestrationSupabaseRuntime,macroPreferenceEvidence} from '../release-candidates/tdee-adaptive-review/snapshotOrchestrationSupabaseAdapter.ts';
const binding=()=>({version:'reviewed-server-version',digest:'a'.repeat(64),engineVersion:'observed-v1/snapshot-adjustment-v1'});
function harness(){
 const clients=[],calls=[],fetches=[];let error=null,throws=false;
 const config={fetch:async()=>{fetches.push(true);throw Error('unexpected authority call');},url:'https://project.supabase.co',anonKey:'public-key',serviceKey:'private-key',createClient(url,key,options){
  clients.push({url,key,options});
  return {auth:{async getUser(token){calls.push({kind:'auth',key,token});if(throws)throw Error('secret');return {data:{user:{id:'actor'}},error};}},
   async rpc(name,args){calls.push({kind:'rpc',key,name,args});if(throws)throw Error('secret');return {data:{name,args},error};}};
 }};
 return {config,clients,calls,fetches,setError(v){error=v;},setThrow(){throws=true;}};
}
test('actual OFF orchestrator factory performs zero client creation and ignores enable flags',async()=>{
 const h=harness(),b=binding(),runtime=createSnapshotOrchestrationSupabaseRuntime(h.config,b);
 b.version='changed';h.config.createClient=()=>{throw Error('swapped');};
 assert.equal((await runtime({authorization:'Bearer token'})).reason,'safety_review_required');
 assert.equal((await runtime({authorization:'Bearer token',enabled:true})).reason,'invalid_request');
 assert.equal(h.clients.length,0);assert.equal(h.calls.length,0);assert.equal(h.fetches.length,0);
});
test('own authentication and context carry only user bearer and public key',async()=>{
 const h=harness(),p=createSnapshotOrchestrationSupabasePorts(h.config,binding());
 assert.equal(h.clients.length,0);assert.deepEqual(await p.verifyAccessToken('token'),{id:'actor'});
 await p.loadOwnContext('token');
 assert.equal(h.clients.length,3);
 for(const c of h.clients){assert.equal(c.key,'public-key');assert.equal(c.options.global.headers.Authorization,'Bearer token');assert.deepEqual(c.options.auth,{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false});}
 assert.equal(h.calls[1].name,'observed_get_dynamic_tdee_context_v1');assert.equal(h.calls[1].args,undefined);
 assert.equal(h.calls[2].name,'tdee_read_review_context_v1');assert.equal(h.calls[2].args,undefined);assert.equal(h.fetches.length,0);
});
test('fixed policy binding uses exact service RPC args; mismatch creates no client',async()=>{
 const h=harness(),b=binding(),p=createSnapshotOrchestrationSupabasePorts(h.config,b);
 await assert.rejects(()=>p.readPolicyExact({...b,digest:'b'.repeat(64)}),/source_error/);assert.equal(h.clients.length,0);
 await p.readPolicyExact(b);
 assert.deepEqual(h.calls[0].args,{p_version:b.version,p_digest:b.digest,p_engine_version:b.engineVersion});
 assert.equal(h.calls[0].name,'tdee_read_snapshot_policy_v1');assert.equal(h.clients[0].key,'private-key');assert.equal(h.clients[0].options.global,undefined);
});
test('bootstrap refresh and issuance map fixed names exact keys and reuse lazy service',async()=>{
 const h=harness(),p=createSnapshotOrchestrationSupabasePorts(h.config,binding()),r={ownerId:'actor',nested:{value:1}};
 await p.bootstrapAsService(r);await p.refreshAsService(r);
 const record={id:'proposal',ownerId:'actor',policyVersion:'v',anchorId:'anchor',expiresAt:'date',payload:{nested:{n:2}}};
 await p.issueAsService(record);
 assert.deepEqual(h.calls.map(c=>c.name),['tdee_bootstrap_snapshot_review_v1','tdee_refresh_snapshot_eligibility_v1','tdee_issue_snapshot_proposal_v1']);
 assert.deepEqual(h.calls[0].args,{p_record:r});assert.deepEqual(h.calls[1].args,{p_record:r});
 assert.deepEqual(h.calls[2].args,{p_id:'proposal',p_owner:'actor',p_policy:'v',p_anchor:'anchor',p_expires_at:'date',p_payload:record.payload});
 assert.equal(h.clients.length,1);assert.equal(h.clients[0].options.global,undefined);
 r.nested.value=99;record.payload.nested.n=99;
 assert.equal(h.calls[0].args.p_record.nested.value,1);assert.equal(h.calls[2].args.p_payload.nested.n,2);
});
test('external config binding and returned result mutations cannot swap authority or payload',async()=>{
 const h=harness(),b=binding(),saved=binding(),p=createSnapshotOrchestrationSupabasePorts(h.config,b);
 h.config.url='https://other.invalid';h.config.anonKey='other';h.config.serviceKey='other';h.config.createClient=()=>{throw Error('swapped');};b.version='other';
 const out=await p.readPolicyExact(saved);out.args.p_version='corrupted';
 assert.equal(h.calls[0].args.p_version,saved.version);assert.equal(h.clients[0].url,'https://project.supabase.co');assert.equal(h.clients[0].key,'private-key');
 await assert.rejects(()=>p.readPolicyExact(b),/source_error/);
 await p.verifyAccessToken('token');assert.equal(h.clients[1].key,'public-key');
});
test('RPC returned errors and thrown transport errors are sanitized without retry',async()=>{
 for(const mode of ['error','throw']){
  const h=harness(),p=createSnapshotOrchestrationSupabasePorts(h.config,binding());mode==='error'?h.setError({message:'secret'}):h.setThrow();
  assert.equal(await p.verifyAccessToken('token'),null);
  for(const call of [()=>p.loadOwnContext('token'),()=>p.readPolicyExact(binding()),()=>p.bootstrapAsService({}),()=>p.refreshAsService({}),()=>p.issueAsService({payload:{}})]){
   await assert.rejects(call,e=>e.message==='source_error');
  }
  assert.equal(h.calls.length,6);
 }
});
test('invalid server config and malformed bearer fail before any client exists',async()=>{
 const h=harness();
 for(const change of [{serviceKey:''},{createClient:null},{url:'http://plain.invalid'}])assert.throws(()=>createSnapshotOrchestrationSupabasePorts({...h.config,...change},binding()),/server_configuration_required/);
 const p=createSnapshotOrchestrationSupabasePorts(h.config,binding());
 assert.equal(await p.verifyAccessToken('bad token'),null);await assert.rejects(()=>p.loadOwnContext('bad token'),/source_error/);
 assert.equal(h.clients.length,0);
});

/** Scoped preflight regressions prepared, not executed: runner remains blocked. */
function managedHarness(result,{httpOk=true,throwFetch=false,managed=true}={}){
 const calls=[],fetches=[];
 const config={url:'https://project.supabase.co',anonKey:'public-key',serviceKey:'private-key',
 createClient(url,key,options){return {auth:{async getUser(){return {data:{user:{id:'actor'}},error:null};}},
 async rpc(name,args){calls.push({name,key,options,args});
 return {data:name==='observed_get_dynamic_tdee_context_v1'?{ownerId:'actor',...(managed?{accessValidUntil:null}:{})}:{actor:'actor',premium:false},error:null};}};},
 async fetch(url,options){fetches.push({url,options});if(throwFetch)throw Error('timeout');
 return {ok:httpOk,json:async()=>result};}};
 return {config,calls,fetches};
}
test('managed marker refreshes existing authority before fresh own context without service key',async()=>{
 const h=managedHarness({ownerId:'actor',access:'premium',validUntil:Date.now()+60000});
 const p=createSnapshotOrchestrationSupabasePorts(h.config,binding());
 h.config.fetch=()=>{throw Error('mutated fetch');};
 await p.loadOwnContext('token');
 assert.deepEqual(h.calls.map(x=>x.name),['observed_get_dynamic_tdee_context_v1','tdee_read_review_context_v1']);
 assert.equal(h.fetches.length,1);
 const {url,options}=h.fetches[0];assert.equal(url,'https://project.supabase.co/functions/v1/common-premium-authority');
 assert.equal(options.method,'GET');assert.deepEqual(options.headers,{Authorization:'Bearer token',apikey:'public-key'});
 assert.ok(options.signal instanceof AbortSignal);
 for(const c of h.calls){assert.equal(c.key,'public-key');assert.equal(c.options.global.headers.Authorization,'Bearer token');}
});
test('unmanaged accounts never refresh authority and denied access is not upgraded',async()=>{
 const h=managedHarness(null,{managed:false});const p=createSnapshotOrchestrationSupabasePorts(h.config,binding());
 await p.loadOwnContext('token');assert.equal(h.fetches.length,0);
 const denied=managedHarness({ownerId:'actor',access:'denied'});
 const data=await createSnapshotOrchestrationSupabasePorts(denied.config,binding()).loadOwnContext('token');
 assert.equal(data.premium,false);assert.equal(denied.fetches.length,1);
});
test('owner mismatch expired evidence HTTP failure and timeout stop before review-context read',async()=>{
 for(const [result,options]of [
 [{ownerId:'other',access:'premium',validUntil:Date.now()+60000},{}],
 [{ownerId:'actor',access:'premium',validUntil:0},{}],
 [{ownerId:'actor',access:'premium',validUntil:'future'},{}],
 [null,{}],[{}, {httpOk:false}],[{}, {throwFetch:true}]
 ]){
  const h=managedHarness(result,options);
  await assert.rejects(()=>createSnapshotOrchestrationSupabasePorts(h.config,binding()).loadOwnContext('token'),/^Error: source_error$/);
  assert.equal(h.calls.length,1);assert.equal(h.fetches.length,1);
 }
});

/** Preference-loading regression cases: prepared only, NOT RUN. Synthetic identities/data. */
const preferenceActor='11111111-1111-4111-8111-111111111111';
function preferenceFixture(now=Date.now()){
 const source=new Date(now-1000).toISOString(),revision=new Date(now-86400000).toISOString();
 const request={binding:{ownerId:preferenceActor,goalId:'22222222-2222-4222-8222-222222222222',goalRevision:revision,preset:'custom',sourceFingerprint:'c'.repeat(64),policyVersion:'v',policyDigest:'d'.repeat(64)},
 current:{calories:2000,proteinG:150,carbsG:200,fatsG:67,fiberG:28},sourceCapturedAt:source,profileUpdatedAt:revision,profileBinding:'e'.repeat(64),journeyBinding:'f'.repeat(64),today:'2026-11-15',ageYears:30};
 const choice={requestId:'33333333-3333-4333-8333-333333333333',choiceVersion:2,mode:'smart',splitBps:null,recordedAt:revision,goalUpdatedAt:revision,
 profileBinding:request.profileBinding,journeyBinding:request.journeyBinding,copyVersion:'macro-choice-v1',current:true};
 const state={version:'macro-choice-state-v1',ownerId:preferenceActor,capturedAt:new Date(now).toISOString(),copyVersion:'macro-choice-v1',
 goalId:request.binding.goalId,goalUpdatedAt:revision,bindingStatus:'available',profileBinding:request.profileBinding,journeyBinding:request.journeyBinding,choiceVersion:2,choice,actionable:false};
 return {request,state,now};
}
test('own preference becomes separate consent but never nutritional review; original date preserved',()=>{
 const {request,state,now}=preferenceFixture(),before=structuredClone({request,state});
 const out=macroPreferenceEvidence(preferenceActor,request,state,now);
 assert.equal(out.review,null);assert.equal(out.consent.mode,'smart');assert.equal(out.consent.consentId,state.choice.requestId);
 assert.equal(out.consent.acceptedAt,Date.parse(state.choice.recordedAt));assert.deepEqual(out.consent.binding,request.binding);
 out.request.binding.ownerId='changed';out.consent.binding.goalId='changed';
 assert.deepEqual({request,state},before);
});
test('absent stale revoked wrong owner or mismatched preference fails closed without review',()=>{
 const f=preferenceFixture();
 const changes=[s=>s.choice=null,s=>s.ownerId='other',s=>s.goalId='other',s=>s.goalUpdatedAt='invalid',
 s=>s.profileBinding='0'.repeat(64),s=>s.journeyBinding='0'.repeat(64),s=>s.bindingStatus='unavailable',
 s=>s.copyVersion='other',s=>s.choice.current='true',s=>s.choice.current=false,s=>s.choice.mode='revoked',
 s=>s.choice.mode='preserve_percent',s=>s.choice.splitBps={},s=>s.choiceVersion=3,s=>s.choiceVersion='2',
 s=>s.choice.profileBinding='0'.repeat(64),s=>s.choice.journeyBinding='0'.repeat(64),s=>s.choice.copyVersion='other',
 s=>s.choice.goalUpdatedAt='invalid',s=>s.choice.requestId='invalid',
 s=>s.choice.recordedAt=new Date(f.now+1).toISOString(),s=>s.capturedAt=new Date(f.now+1).toISOString(),
 s=>s.capturedAt=new Date(f.now-31000).toISOString()];
 for(const change of changes){const s=structuredClone(f.state);change(s);const out=macroPreferenceEvidence(preferenceActor,f.request,s,f.now);assert.equal(out.consent,null);assert.equal(out.review,null);}
 assert.equal(macroPreferenceEvidence(preferenceActor,f.request,null,f.now).consent,null);
});
test('revision formatting mismatch, source expiry and post-snapshot choice fail closed',()=>{
 const {request,state,now}=preferenceFixture();
 state.goalUpdatedAt=state.goalUpdatedAt.replace('Z','+00:00');state.choice.goalUpdatedAt=state.choice.goalUpdatedAt.replace('Z','+00:00');
 assert.equal(macroPreferenceEvidence(preferenceActor,request,state,now).consent,null);
 state.goalUpdatedAt=request.binding.goalRevision;state.choice.goalUpdatedAt=request.binding.goalRevision;
 assert.equal(macroPreferenceEvidence(preferenceActor,request,state,now+31000).consent,null);
 state.choice.recordedAt=new Date(now-500).toISOString();
 assert.equal(macroPreferenceEvidence(preferenceActor,request,state,now).consent,null);
});
test('macro port uses only own bearer fixed noarg RPC; no service or authority call',async()=>{
 const f=preferenceFixture(),calls=[];
 const config={url:'https://project.supabase.co',anonKey:'public-key',serviceKey:'private-key',
 createClient(url,key,options){calls.push({url,key,options});return {auth:{async getUser(){throw Error('unexpected');}},async rpc(name,args){calls.push({name,args});return {data:f.state,error:null};}};},
 fetch:async()=>{throw Error('unexpected');}};
 const ports=createSnapshotOrchestrationSupabasePorts(config,binding());
 const out=await ports.loadReviewedMacroContext(preferenceActor,f.request,'own-token');
 assert.equal(calls[0].key,'public-key');assert.equal(calls[0].options.global.headers.Authorization,'Bearer own-token');
 assert.deepEqual(calls[1],{name:'tdee_read_macro_choice_v1',args:undefined});assert.equal(calls.length,2);
 assert.equal(out.review,null);assert.equal(out.consent.mode,'smart');
 assert.ok(!JSON.stringify(out).includes('own-token'));
});
test('macro port rejects wrong actor before network and sanitizes read errors without retry',async()=>{
 const f=preferenceFixture(),h=harness(),ports=createSnapshotOrchestrationSupabasePorts(h.config,binding());
 await assert.rejects(()=>ports.loadReviewedMacroContext('other',f.request,'token'),/^Error: source_error$/);assert.equal(h.clients.length,0);
 h.setError({message:'sensitive'});await assert.rejects(()=>ports.loadReviewedMacroContext(preferenceActor,f.request,'token'),/^Error: source_error$/);
 assert.equal(h.calls.length,1);
});

test('verified manual choice retains exact basis points/version instead of being treated as absent',()=>{
 const {request,state,now}=preferenceFixture();
 request.binding.preset='balanced';
 state.choice.mode='preserve_percent';
 state.choice.splitBps={protein:3333,carbs:3333,fats:3334};
 const before=structuredClone(state);
 const out=macroPreferenceEvidence(preferenceActor,request,state,now);
 assert.equal(out.review,null);assert.equal(out.consent.mode,'preserve_percent');
 assert.equal(out.consent.choiceVersion,2);
 assert.deepEqual(out.consent.splitBps,before.choice.splitBps);
 state.choice.splitBps.protein=1;
 assert.deepEqual(out.consent.splitBps,before.choice.splitBps);
});
test('manual choice invalid percentages cannot become a valid consent context',()=>{
 for(const split of [null,{}, {protein:3333,carbs:3333,fats:3333},{protein:'3333',carbs:3333,fats:3334},{protein:3333,carbs:3333,fats:3334,extra:0}]){
  const {request,state,now}=preferenceFixture();
  state.choice.mode='preserve_percent';state.choice.splitBps=split;
  assert.equal(macroPreferenceEvidence(preferenceActor,request,state,now).consent,null);
 }
});
