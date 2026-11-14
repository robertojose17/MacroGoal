/** Execution pending: local runner blocked before test evaluation. Not live or E2E proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSnapshotOrchestrationSupabasePorts,createSnapshotOrchestrationSupabaseRuntime} from '../release-candidates/tdee-adaptive-review/snapshotOrchestrationSupabaseAdapter.ts';
const binding=()=>({version:'reviewed-server-version',digest:'a'.repeat(64),engineVersion:'observed-v1/snapshot-adjustment-v1'});
function harness(){
 const clients=[],calls=[];let error=null,throws=false;
 const config={url:'https://project.supabase.co',anonKey:'public-key',serviceKey:'private-key',createClient(url,key,options){
  clients.push({url,key,options});
  return {auth:{async getUser(token){calls.push({kind:'auth',key,token});if(throws)throw Error('secret');return {data:{user:{id:'actor'}},error};}},
   async rpc(name,args){calls.push({kind:'rpc',key,name,args});if(throws)throw Error('secret');return {data:{name,args},error};}};
 }};
 return {config,clients,calls,setError(v){error=v;},setThrow(){throws=true;}};
}
test('actual OFF orchestrator factory performs zero client creation and ignores enable flags',async()=>{
 const h=harness(),b=binding(),runtime=createSnapshotOrchestrationSupabaseRuntime(h.config,b);
 b.version='changed';h.config.createClient=()=>{throw Error('swapped');};
 assert.equal((await runtime({authorization:'Bearer token'})).reason,'safety_review_required');
 assert.equal((await runtime({authorization:'Bearer token',enabled:true})).reason,'invalid_request');
 assert.equal(h.clients.length,0);assert.equal(h.calls.length,0);
});
test('own authentication and context carry only user bearer and public key',async()=>{
 const h=harness(),p=createSnapshotOrchestrationSupabasePorts(h.config,binding());
 assert.equal(h.clients.length,0);assert.deepEqual(await p.verifyAccessToken('token'),{id:'actor'});
 await p.loadOwnContext('token');
 assert.equal(h.clients.length,2);
 for(const c of h.clients){assert.equal(c.key,'public-key');assert.equal(c.options.global.headers.Authorization,'Bearer token');assert.deepEqual(c.options.auth,{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false});}
 assert.equal(h.calls[1].name,'tdee_read_review_context_v1');assert.equal(h.calls[1].args,undefined);
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
