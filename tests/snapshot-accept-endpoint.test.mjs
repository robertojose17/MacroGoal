/** PREPARED, NOT RUN: existing runner restriction remains. No release flags are changed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnapshotAcceptRuntime,createSnapshotAcceptPorts,createSnapshotAcceptSupabaseRuntime,createSnapshotAcceptHttpHandler} from '../release-candidates/tdee-adaptive-review/snapshotAcceptEndpoint.ts';
import {createAdaptiveReviewDispatcher} from '../supabase/functions/observed-snapshot-release/functions/adaptive-review/dispatcher.ts';
const owner='11111111-1111-4111-8111-111111111111';
const identity={ownerId:owner,requestId:'22222222-2222-4222-8222-222222222222',proposalId:'33333333-3333-4333-8333-333333333333',proposalDigest:'a'.repeat(64)};
const origin='https://macro-goal.expo.app',url='https://project.supabase.co/functions/v1/progress-intelligence?mode=adaptive-accept-v1';
const request=(body=identity,suffix='',extra={})=>new Request(url+suffix,{method:'POST',headers:{Authorization:'Bearer token','Content-Type':'application/json',Origin:origin},body:JSON.stringify(body),...extra});
const committed=()=>({version:'adaptive-receipt-v1',status:'committed',request:identity,acceptedGoal:{id:identity.proposalId,updatedAt:'2026-11-15T12:00:00Z'},goalState:'current'});
test('real immutable OFF runtime creates zero clients including auth receipt and preflight',async()=>{
 let calls=0;
 const runtime=createSnapshotAcceptSupabaseRuntime({url:'https://project.supabase.co',anonKey:'public',createClient(){calls++;throw Error('unexpected');},fetch:async()=>{calls++;throw Error('unexpected');}});
 const handler=createSnapshotAcceptHttpHandler(runtime,[origin]),response=await handler(request());
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{reason:'safety_review_required',receipt:null,mayHaveWritten:false});assert.equal(calls,0);
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('Vary'),'Origin');
});
test('overposted body or runtime flags never bypass OFF and never call ports',async()=>{
 let calls=0;const port=async()=>{calls++;throw Error('unexpected');};
 const runtime=createSnapshotAcceptRuntime({authenticate:port,receipt:port,prepare:port,accept:port});
 for(const value of [{authorization:'Bearer token',request:{...identity,target:{calories:1000}}},{authorization:'Bearer token',request:identity,enabled:true}]){
  assert.equal((await runtime(value)).reason,'invalid_request');
 }assert.equal(calls,0);
});
test('HTTP returns only validated terminal receipt fields, not raw extras',async()=>{
 const receipt={...committed(),privateData:'secret'};
 const response=await createSnapshotAcceptHttpHandler(async()=>({reason:'receipt',receipt,mayHaveWritten:false}),[origin])(request());
 assert.equal(response.status,200);assert.deepEqual(await response.json(),committed());
 const rejected={version:'adaptive-receipt-v1',status:'rejected',request:identity,reason:'proposal_expired'};
 assert.deepEqual(await (await createSnapshotAcceptHttpHandler(async()=>({reason:'receipt',receipt:rejected,mayHaveWritten:false}),[origin])(request())).json(),rejected);
});
test('uncertain acceptance and invalid terminal receipt retain reconciliation requirement',async()=>{
 for(const runtime of [
 async()=>({reason:'reconciliation_required',receipt:null,mayHaveWritten:true}),
 async()=>{throw Error('secret');},
 async()=>({reason:'receipt',receipt:{...committed(),request:{...identity,requestId:identity.proposalId}},mayHaveWritten:false}),
 async()=>({reason:'receipt',receipt:{version:'adaptive-receipt-v1',status:'not_found'},mayHaveWritten:false})
 ]){
 const response=await createSnapshotAcceptHttpHandler(runtime,[origin])(request());
 assert.equal(response.status,409);assert.deepEqual(await response.json(),{reason:'reconciliation_required',receipt:null,mayHaveWritten:true});
 }
});
test('HTTP method origin query body size and identity errors never call runtime',async()=>{
 let calls=0;const handler=createSnapshotAcceptHttpHandler(async()=>{calls++;throw Error('unexpected');},[origin]);
 const bad=[
 request(identity,'',{method:'GET',body:undefined}),
 request(identity,'&mode=adaptive-review-v1'),
 request(identity,'&enabled=true'),
 request({action:'accept',request:identity}),
 request({...identity,proposalDigest:'bad'}),
 request(identity,'',{headers:{Origin:'https://evil.invalid'}}),
 request(identity,'',{body:' '.repeat(2049)}),
 request(identity,'',{headers:{Authorization:'Bearer token','Content-Type':'text/plain'}})
 ];
 for(const req of bad){const response=await handler(req);assert.ok([400,401,403,405].includes(response.status));assert.equal(response.headers.get('Cache-Control'),'private, no-store');}
 const preflight=await handler(new Request(url,{method:'OPTIONS',headers:{Origin:origin}}));assert.equal(preflight.status,204);
 assert.equal(calls,0);
});
function portHarness(managed=false,result={ownerId:owner,access:'denied'}){
 const calls=[],fetches=[];
 const config={url:'https://project.supabase.co',anonKey:'public',
 createClient(url,key,options){return {auth:{async getUser(token){calls.push({auth:token,key,options});return {data:{user:{id:owner}},error:null};}},
 async rpc(name,args){calls.push({name,args,key,options});return {data:name==='observed_get_dynamic_tdee_context_v1'?{ownerId:owner,...(managed?{accessValidUntil:null}:{})}:committed(),error:null};}};},
 async fetch(url,options){fetches.push({url,options});return {ok:true,json:async()=>result};}};
 return {config,calls,fetches};
}
test('own ports use fixed receipt and accept RPC args with no service key',async()=>{
 const h=portHarness(),ports=createSnapshotAcceptPorts(h.config);
 await ports.authenticate('token');await ports.receipt('token',identity);await ports.accept('token',identity);
 assert.equal(h.calls[1].name,'tdee_read_snapshot_receipt_v1');assert.equal(h.calls[2].name,'tdee_accept_snapshot_proposal_v1');
 for(const c of h.calls){assert.equal(c.key,'public');assert.equal(c.options.global.headers.Authorization,'Bearer token');}
 assert.deepEqual(h.calls[1].args,{p_request:identity});assert.deepEqual(h.calls[2].args,{p_request:identity});
 assert.equal(h.fetches.length,0);
});
test('scoped preflight never refreshes unmanaged and managed uses same bearer with timeout',async()=>{
 const unmanaged=portHarness();await createSnapshotAcceptPorts(unmanaged.config).prepare('token',owner);assert.equal(unmanaged.fetches.length,0);
 const h=portHarness(true,{ownerId:owner,access:'premium',validUntil:Date.now()+60000}),ports=createSnapshotAcceptPorts(h.config);
 h.config.fetch=()=>{throw Error('mutated');};await ports.prepare('token',owner);
 assert.equal(h.fetches.length,1);assert.equal(h.fetches[0].url,'https://project.supabase.co/functions/v1/common-premium-authority');
 assert.deepEqual(h.fetches[0].options.headers,{Authorization:'Bearer token',apikey:'public'});assert.equal(h.fetches[0].options.method,'GET');
 assert.ok(h.fetches[0].options.signal instanceof AbortSignal);
});
test('preflight rejects wrong owner expired authority and transport failure without accept calls',async()=>{
 for(const result of [{ownerId:'other',access:'denied'},{ownerId:owner,access:'premium',validUntil:0}]){
 const h=portHarness(true,result);await assert.rejects(()=>createSnapshotAcceptPorts(h.config).prepare('token',owner));assert.equal(h.calls.length,1);
 }
 const h=portHarness(true);await assert.rejects(()=>createSnapshotAcceptPorts(h.config).prepare('token','other'));assert.equal(h.fetches.length,0);
 const failed=portHarness(true);failed.config.fetch=async()=>{throw Error('timeout');};await assert.rejects(()=>createSnapshotAcceptPorts(failed.config).prepare('token',owner));
 assert.equal(failed.calls.length,1);
});
test('dispatcher selects accept only, rejects mixed modes and leaves legacy and review unchanged',async()=>{
 const calls=[];const dispatch=createAdaptiveReviewDispatcher(async()=>{calls.push('legacy');return new Response('legacy');},async()=>({
 handleAdaptiveReview:async()=>{calls.push('review');return new Response('review');},handleAdaptiveAccept:async()=>{calls.push('accept');return new Response('accept');}}));
 assert.equal(await (await dispatch(request())).text(),'accept');
 assert.equal(await (await dispatch(new Request(url.replace('adaptive-accept-v1','adaptive-review-v1'),{method:'POST'}))).text(),'review');
 assert.equal(await (await dispatch(new Request(url.replace('adaptive-accept-v1','observation-v1')))).text(),'legacy');
 assert.equal((await dispatch(request(identity,'&mode=adaptive-review-v1'))).status,400);
 assert.deepEqual(calls,['accept','review','legacy']);
});
test('dispatcher distinguishes module load failure from possible accepting-handler failure',async()=>{
 const loadfail=createAdaptiveReviewDispatcher(async()=>new Response('legacy'),async()=>{throw Error('secret');});
 assert.equal((await loadfail(request())).status,503);
 const uncertain=createAdaptiveReviewDispatcher(async()=>new Response('legacy'),async()=>({handleAdaptiveReview:async()=>new Response('review'),handleAdaptiveAccept:async()=>{throw Error('secret');}}));
 const response=await uncertain(request());assert.equal(response.status,409);assert.deepEqual(await response.json(),{reason:'reconciliation_required',receipt:null,mayHaveWritten:true});
});

test('both independent release gates protect acceptance source and selected wrapper',async()=>{
 // Static regression only: do not enable either release flag to execute a positive path.
 const {readFile}=await import('node:fs/promises');
 for(const path of ['release-candidates/tdee-adaptive-review/snapshotAcceptEndpoint.ts','supabase/functions/observed-snapshot-release/functions/adaptive-review/runtime.ts']){
  const source=await readFile(path,'utf8');
  assert.ok(source.includes('if(!ADAPTIVE_RELEASE_STATE.recommendationsEnabled||!ADAPTIVE_RELEASE_STATE.acceptanceEnabled)'));
 }
});
