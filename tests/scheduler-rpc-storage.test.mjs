import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {schedulerRpcRequest as request,parseSchedulerRpc as parse,createSchedulerRpcStorage,SCHEDULER_RPC_RELEASE} from '../release-candidates/tdee-adaptive-review/schedulerRpcStorage.ts';
const owner='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',scope={ownerId:owner,contextRevision:'a'.repeat(64),timezone:'UTC'},now=Date.parse('2026-11-16T12:00:00Z');
const r={...scope,version:'daily-assessment-ledger-v1',localDate:'2026-11-16',key:JSON.stringify(['daily-assessment-v1',owner,scope.contextRevision,'2026-11-16']),revision:1,status:'claimed',claimId:id,claimedAt:now,finishedAt:null};
const valid={version:'scheduler-rpc-v1',status:'ok',record:r,hold:null};
test('pure mapper scopes request explicitly, never sends caller time or arbitrary authority',()=>{
 assert.deepEqual(request('load',scope),{action:'load',...scope});
 for(const extra of [{now},{actor:owner},{serviceRoleKey:'x'},{approved:true},{ownerId:owner}])assert.throws(()=>request('load',scope,extra),/invalid_rpc_fields/);
});
test('claim expected revision and identity required, no fractional bigint rounding',()=>{
 const args={expectedRevision:0,claimId:id,localDate:r.localDate,key:r.key};assert.equal(request('claim',scope,args).claimId,id);
 for(const expectedRevision of [-1,1.2,NaN,Number.MAX_SAFE_INTEGER])assert.throws(()=>request('claim',scope,{...args,expectedRevision}),/invalid_transition/);
});
test('reply parser validates scope identity type state key and revision',()=>{
 assert.deepEqual(parse(valid,scope),{record:r,hold:null});
 for(const change of [{ownerId:id},{contextRevision:'b'.repeat(64)},{key:'bad'},{revision:1.5},{claimedAt:NaN},{finishedAt:now},{status:'bogus'}])assert.throws(()=>parse({...valid,record:{...r,...change}},scope),/invalid_rpc_record/);
});
test('unknown empty blocked and malformed success never mistaken for persistence',()=>{
 for(const data of [null,{}, {version:'scheduler-rpc-v1',status:'blocked',reason:'safety_review_required'}, {version:'scheduler-rpc-v1',status:'ok'}])assert.throws(()=>parse(data,scope));
});
test('hold is bounded exact seven days and cannot exist without ledger',()=>{
 const hold={assessedAt:now,reevaluateAt:now+604800000};assert.deepEqual(parse({...valid,hold},scope).hold,hold);
 for(const h of [{},undefined,{...hold,reevaluateAt:now+1},{...hold,assessedAt:1.2}])assert.throws(()=>parse({...valid,hold:h},scope),/invalid_rpc_hold/);
 assert.throws(()=>parse({...valid,record:null,hold},scope),/orphan_hold/);
});
test('all RPC adapter paths remain OFF before network call',async()=>{
 let calls=0;const store=createSchedulerRpcStorage({rpc:async()=>{calls++;throw Error('unexpected');}});
 for(const action of [()=>store.load(scope),()=>store.claim({...scope,key:r.key,localDate:r.localDate},0,id),()=>store.complete(scope,id,{kind:'preserve',reason:'blocked'}),()=>store.uncertain(scope,id),()=>store.reconcile(scope,id)]){
  await assert.rejects(async()=>action(),/safety_review_required/);
 }
 assert.equal(calls,0);assert.equal(SCHEDULER_RPC_RELEASE.enabled,false);assert.ok(Object.isFrozen(SCHEDULER_RPC_RELEASE));
});
test('SQL contract constant OFF service-only wrapper has no table grants or cron',()=>{
 const sql=readFileSync(new URL('../release-candidates/tdee-adaptive-review/schedulerAtomicRpcCandidate.sql',import.meta.url),'utf8');
 assert.match(sql,/release_enabled constant boolean:=false/);assert.match(sql,/current_setting\('role',true\) is distinct from 'service_role'/);
 assert.match(sql,/grant execute on function public.tdee_scheduler_internal_v1\(jsonb\) to service_role/);
 assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/and revision=expected/);assert.match(sql,/rollback;\s*$/);
 assert.doesNotMatch(sql,/grant .* on (?:table|all tables)|cron\.schedule|set_config\('request\.jwt/i);
 assert.ok(sql.indexOf('if not release_enabled')<sql.indexOf('perform pg_advisory_xact_lock'));
});

test('RPC scheduler bridge OFF invokes no context evaluator id generator or service client',async()=>{
 const {createRpcDailySchedulerPorts}=await import('../release-candidates/tdee-adaptive-review/schedulerRpcStorage.ts');
 let calls=0;const bad=()=>{calls++;throw Error('unexpected');};const ports=createRpcDailySchedulerPorts({rpc:bad},{loadInput:bad,evaluateSnapshot:bad,newClaimId:bad});
 for(const action of [()=>ports.loadOwnContext(),()=>ports.claim({},0),()=>ports.evaluateReadOnly({},id),()=>ports.complete({},id,'completed'),()=>ports.complete({},id,'uncertain')])await assert.rejects(action,/safety_review_required/);
 assert.equal(calls,0);
});
