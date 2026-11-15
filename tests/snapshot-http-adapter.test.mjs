import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnapshotHttpHandler,dispatchSnapshotReview} from '../release-candidates/tdee-adaptive-review/snapshotHttpHandler.ts';
import {createSnapshotSupabasePorts,createSnapshotSupabaseRuntime} from '../release-candidates/tdee-adaptive-review/snapshotSupabaseAdapter.ts';
const url='https://example.invalid/observed?mode=adaptive-review-v1',origin='https://app.example.invalid';
const request=(suffix='',options={})=>new Request(url+suffix,{method:'POST',headers:{Authorization:'Bearer user-token',Origin:origin},...options});
function config(createClient){return {url:'https://project.supabase.co',anonKey:'public-key',serviceKey:'private-server-key',createClient};}
test('actual OFF runtime returns no-store503 without any client creation',async()=>{
 let calls=0;const runtime=createSnapshotSupabaseRuntime(config(()=>{calls++;throw Error('must-not-run')}));
 const handler=createSnapshotHttpHandler(runtime,[origin]);const response=await dispatchSnapshotReview(request(),handler);
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{reason:'safety_review_required',proposal:null});assert.equal(calls,0);
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
});
test('unknown legacy modes are not handled or mutated',async()=>{
 let calls=0;const handler=async()=>{calls++;return new Response('bad')};
 for(const u of ['https://example.invalid/observed','https://example.invalid/observed?mode=context','https://example.invalid/observed?mode=legacy']){
 assert.equal(await dispatchSnapshotReview(new Request(u),handler),null);
 }assert.equal(calls,0);
});
test('OPTIONS preflight does not authenticate or load',async()=>{
 let calls=0;const handler=createSnapshotHttpHandler(async()=>{calls++;throw Error('bad')},[origin]);
 const r=await handler(request('',{method:'OPTIONS',headers:{Origin:origin}}));
 assert.equal(r.status,204);assert.equal(await r.text(),'');assert.equal(calls,0);
 assert.equal(r.headers.get('Access-Control-Allow-Methods'),'POST, OPTIONS');
});
test('wrong methods, duplicate mode, query evidence and missing bearer rejected',async()=>{
 let calls=0;const handler=createSnapshotHttpHandler(async()=>{calls++;throw Error('bad')},[origin]);
 for(const method of ['GET','HEAD','PUT','PATCH','DELETE'])assert.equal((await handler(request('',{method}))).status,405);
 assert.equal((await handler(request('',{body:'{}'}))).status,400);
 for(const suffix of ['&ownerId=someone','&enabled=true','&targets=1','&mode=legacy'])assert.equal((await handler(request(suffix))).status,400);
 for(const authorization of ['', 'bearer token','Bearer one two']){
 assert.equal((await handler(request('',{headers:{Authorization:authorization,Origin:origin}}))).status,401);
 }assert.equal(calls,0);
});
test('unapproved origins blocked and errors never expose payloads',async()=>{
 const handler=createSnapshotHttpHandler(async()=>{throw new Error('secret bearer private database row')},[origin]);
 const cross=await handler(request('',{headers:{Origin:'https://evil.invalid',Authorization:'Bearer token'}}));
 assert.equal(cross.status,403);assert.equal(cross.headers.get('Access-Control-Allow-Origin'),null);
 const error=await handler(request());assert.equal(error.status,503);assert.deepEqual(await error.json(),{reason:'source_error',proposal:null});
 const arbitrary=createSnapshotHttpHandler(async()=>({reason:'secret row',proposal:{private:true}}),[origin]);
 assert.deepEqual(await (await arbitrary(request())).json(),{reason:'review_not_ready',proposal:null});
});
test('concrete auth and own reader carry only user bearer and no actor parameter',async()=>{
 const calls=[];const ports=createSnapshotSupabasePorts(config((u,key,options)=>({
 auth:{getUser:async token=>{calls.push({u,key,options,token});return {data:{user:{id:'actor'}},error:null}}},
 rpc:async(name,args)=>{calls.push({u,key,options,name,args});return {data:{actor:'actor'},error:null}}
 })));
 assert.deepEqual(await ports.verifyAccessToken('token-a'),{id:'actor'});
 await ports.loadOwnContext('token-b','tdee_read_review_context_v1');
 assert.equal(calls[0].key,'public-key');assert.equal(calls[0].options.global.headers.Authorization,'Bearer token-a');
 assert.equal(calls[1].key,'public-key');assert.equal(calls[1].options.global.headers.Authorization,'Bearer token-b');
 assert.equal(calls[1].args,undefined);assert.equal(calls[1].name,'tdee_read_review_context_v1');
 assert.equal(calls[0].options.auth.persistSession,false);
});
test('service issuer is closure-bound without user bearer and isolates mutations',async()=>{
 const calls=[];const ports=createSnapshotSupabasePorts(config((u,key,options)=>({
 auth:{getUser:async()=>{throw Error('unused')}},
 rpc:async(name,args)=>{calls.push({key,options,name});args.p_payload.target=999;return {data:{ok:true},error:null}}
 })));
 const args={p_id:'id',p_owner:'actor',p_policy:'policy',p_anchor:'anchor',p_expires_at:'future',p_payload:{target:1}};
 assert.deepEqual(await ports.issueAsService('tdee_issue_snapshot_proposal_v1',args),{ok:true});
 assert.equal(calls[0].key,'private-server-key');assert.equal(calls[0].options.global,undefined);assert.equal(args.p_payload.target,1);
 await assert.rejects(()=>ports.issueAsService('other-rpc',args),/source_error/);
});
test('invalid auth and RPC error fail without raw errors',async()=>{
 const ports=createSnapshotSupabasePorts(config(()=>({
 auth:{getUser:async()=>({data:{user:{id:'actor'}},error:{message:'secret'}})},
 rpc:async()=>({data:{secret:true},error:{message:'private'}})
 })));
 assert.equal(await ports.verifyAccessToken('token'),null);
 await assert.rejects(()=>ports.loadOwnContext('token','tdee_read_review_context_v1'),/^Error: source_error$/);
});

test('selected ambiguous modes fail400 while native requests need no Origin',async()=>{
 const handler=createSnapshotHttpHandler(createSnapshotSupabaseRuntime(config(()=>{throw Error('OFF')})),[origin]);
 assert.equal((await dispatchSnapshotReview(request('&mode=legacy'),handler)).status,400);
 const native=await handler(request('',{headers:{Authorization:'Bearer native-token'}}));
 assert.equal(native.status,503);assert.equal(native.headers.get('Access-Control-Allow-Origin'),null);
});

/** Prepared regression cases below are not yet executed: local runner is blocked. */
test('successful calibration returns202 without an offered proposal',async()=>{
 const handler=createSnapshotHttpHandler(async()=>({reason:'calibration_required',proposal:null,mayHaveWritten:true}),[origin]);
 const r=await handler(request());
 assert.equal(r.status,202);
 assert.deepEqual(await r.json(),{reason:'calibration_required',proposal:null,mayHaveWritten:true});
 assert.equal(r.headers.get('Cache-Control'),'private, no-store');
});
test('all uncertain writes map409 before auth errors and hide internal details',async()=>{
 for(const reason of ['reconciliation_required','account_changed','source_error','reload_binding_changed']){
  const handler=createSnapshotHttpHandler(async()=>({reason,proposal:{private:'not returned'},mayHaveWritten:true}),[origin]);
  const r=await handler(request());
  assert.equal(r.status,409);
  assert.deepEqual(await r.json(),{reason:'reconciliation_required',proposal:null,mayHaveWritten:true});
  assert.equal(r.headers.get('Cache-Control'),'private, no-store');assert.equal(r.headers.get('Vary'),'Origin');
 }
});
test('false or omitted write evidence preserves existing error response shape',async()=>{
 for(const mayHaveWritten of [false,undefined]){
  const handler=createSnapshotHttpHandler(async()=>({reason:'account_changed',proposal:null,mayHaveWritten}),[origin]);
  const r=await handler(request());assert.equal(r.status,401);
  assert.deepEqual(await r.json(),{reason:'account_changed',proposal:null});
 }
});
test('available proposal remains200 despite committed issuance evidence',async()=>{
 const proposal={id:'safe-proposal'};
 const handler=createSnapshotHttpHandler(async()=>({reason:'review_available',proposal,mayHaveWritten:true}),[origin]);
 const r=await handler(request());assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{reason:'review_available',proposal});
});

test('known no-change outcomes return200 only with no proposed targets',async()=>{
 for(const reason of ['same_anchored_target','policy_limit','same_rate_target','within_product_tolerance','coverage_insufficient','target_or_trend_unavailable','rate_uncertainty_unverified','rate_difference_uncertain']){
  for(const mayHaveWritten of [true,false,undefined]){
   const handler=createSnapshotHttpHandler(async()=>({reason,proposal:null,mayHaveWritten}),[origin]);
   const r=await handler(request());assert.equal(r.status,200);
   assert.deepEqual(await r.json(),{reason:'no_change',proposal:null,...(mayHaveWritten===true?{mayHaveWritten:true}:{})});
  }
 }
});
test('calibration requires write evidence and null proposal; malformed results remain sanitized',async()=>{
 for(const result of [
  {reason:'calibration_required',proposal:null,mayHaveWritten:false},
  {reason:'calibration_required',proposal:null},
  {reason:'calibration_required',proposal:{private:true},mayHaveWritten:true},
  {reason:'same_anchored_target',proposal:{private:true},mayHaveWritten:true},
  {reason:'policy_limit',proposal:{private:true},mayHaveWritten:false}
 ]){
  const handler=createSnapshotHttpHandler(async()=>result,[origin]);
  const r=await handler(request());
  assert.equal(r.status,result.mayHaveWritten===true?409:503);
  assert.deepEqual(await r.json(),result.mayHaveWritten===true?
   {reason:'reconciliation_required',proposal:null,mayHaveWritten:true}:
   {reason:'review_not_ready',proposal:null});
 }
});
