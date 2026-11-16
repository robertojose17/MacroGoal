import test from 'node:test';import assert from 'node:assert/strict';
import {createInternalWorkerRuntime,runWorkerAssessmentForReview,workerAssessmentInput} from '../release-candidates/tdee-adaptive-review/internalWorkerRuntime.ts';
import {claimDailyAssessment,finishDailyAssessment} from '../release-candidates/tdee-adaptive-review/dailyAssessmentScheduler.ts';
const actor='11111111-1111-4111-8111-111111111111',hash='a'.repeat(64),now=Date.parse('2026-11-14T12:00:00Z');
function fixture(){
 const dates=Array.from({length:29},(_,i)=>new Date(Date.parse('2026-10-16T00:00:00Z')+i*86400000).toISOString().slice(0,10));
 const goal={id:actor,user_id:actor,is_active:true,updated_at:'2026-10-01T00:00:00Z',created_at:'2026-10-01T00:00:00Z',daily_calories:2000,protein_g:150,carbs_g:215,fats_g:60,fiber_g:30,goal_type:'lose',macro_preset:null};
 const anchor={id:actor,owner_id:actor,policy_version:'p1',active_goal_id:actor,journey_binding:hash,baseline_goal_snapshot:structuredClone(goal),baseline_intake_kcal:2000,baseline_expenditure_kcal:2400,baseline_captured_at:'2026-10-01T00:00:00Z',accepted_delta_kcal:0,last_accepted_at:null,revoked:false};
 const sources={timezone:'UTC',dateOfBirth:'1990-01-01',journeyStartDate:null,trackers:[],trackerWeights:[],checkIns:dates.map((date,i)=>({id:'w'+i,date,weight:80,updated_at:date+'T08:00:00Z',created_at:date+'T08:00:00Z'})),meals:dates.flatMap((date,i)=>[{id:'m'+i+'a',date,meal_type:'breakfast'},{id:'m'+i+'b',date,meal_type:'dinner'}]),items:dates.flatMap((date,i)=>[{id:'i'+i+'a',meal_id:'m'+i+'a',calories:1250,is_scheduled:false},{id:'i'+i+'b',meal_id:'m'+i+'b',calories:1250,is_scheduled:false}])};
 const capturedAt=new Date(now-1000).toISOString();
 const observation={version:'observed-snapshot-v1',ownerId:actor,capturedAt,sourceFingerprint:hash,context:{ownerId:actor,premium:true,enabled:true,reviewDay:0,today:'2026-11-14',nextReviewDate:'2026-11-15',reviewDue:false,currentGoal:{...goal},proposal:null,fingerprint:hash,safety:{enabled:false,eligibility:'unverified'}},sources,counts:{trackers:0,trackerWeights:0,checkIns:29,meals:58,items:58}};
 return {version:'snapshot-review-context-v1',actor,capturedAt,observation,profile:{id:actor,updatedAt:'2026-10-01T00:00:00Z',sex:'male',dateOfBirth:'1990-01-01',timezone:'UTC',journeyStartDate:null,journeyRestartCount:0},currentGoal:goal,
 readiness:{version:'tdee-readiness-v1',ownerId:actor,capturedAt,questionnaireVersion:'general-adult-v1',statementVersion:'complete-day-v1',profileBinding:hash,journeyBinding:hash,timezone:'UTC',today:'2026-11-14',eligibility:{current:true,adult:true,response:'criteria_confirmed'},days:dates.map(date=>({date,contentHash:hash,confirmable:true,confirmed:true}))},readinessFingerprint:hash,
 policy:{version:'p1',engine_version:'observed-v1/snapshot-adjustment-v1',digest:hash,enabled:true,reviewed:true,snapshot_contract_reviewed:true,expires_at:'2026-12-01T00:00:00Z',max_step_kcal:200,max_step_fraction:0.1,max_cumulative_delta_kcal:400,min_days_between_acceptances:14,min_intake_kcal:1500,max_intake_kcal:3000},
 anchor,eligibility:{owner_id:actor,policy_version:'p1',eligible:true,complete_days_verified:true,source_fingerprint:hash,digest:hash,expires_at:'2026-12-01T00:00:00Z'},
 receiptChain:{actor,anchor:structuredClone(anchor),currentGoal:structuredClone(goal),totalCount:0,rows:[]},actionable:false,evidenceStatus:'unverified'};
}
const selection={ownerId:actor,contextRevision:hash};
const proof={...selection,checkedAt:now,expiresAt:now+30000,active:true,revoked:false};
function setup(){
 const raw=fixture();raw.policy=null;raw.anchor=null;raw.eligibility=null;raw.receiptChain=null;
 let record=null,hold=null,calls=[],diagnostics=[];
 const ports={now:()=>now,newClaimId:()=> '22222222-2222-4222-8222-222222222222',
  revalidate:async(s,p)=>{calls.push('revalidate');assert.deepEqual(s,selection);return p;},
  loadContext:async owner=>{calls.push('context');assert.equal(owner,actor);return raw;},
  storage:{load:async()=>({record,hold}),
   claim:async(p,revision,id)=>{calls.push('claim');const next=claimDailyAssessment(p,record,revision,id);assert.equal(next.status,'claimed');record=next;return {status:'claimed',claimId:id};},
   complete:async(p,id,d)=>{calls.push('complete');diagnostics.push(d);record=finishDailyAssessment(record,id,now,'completed');if(d.kind==='uncertain'&&!hold)hold={assessedAt:now,reevaluateAt:now+604800000};},
   uncertain:async(p,id)=>{calls.push('uncertain');record=finishDailyAssessment(record,id,now,'uncertain');}},
 };
 return {ports,raw,calls,diagnostics,get record(){return record;},get hold(){return hold;}};
}
const run=(s)=>runWorkerAssessmentForReview(s.ports,selection,proof,now+5000,new AbortController().signal);
test('final runtime immutable OFF invokes no client factory key provider or clock callbacks',async()=>{
 let calls=0;const bad=()=>{calls++;throw Error('unexpected');};const handler=createInternalWorkerRuntime({serviceRoleKey:'TEST_ONLY'.repeat(8),createExistingServiceClient:bad,getExistingV2Key:bad,request:bad,now:bad});
 const result=await handler(new Request('https://example.test/worker',{method:'POST',body:JSON.stringify({ownerId:actor})}));
 assert.equal(result.status,503);assert.equal(calls,0);
});
test('synthetic integrated review core calls actual14d diagnostic and persists seven-day hold',async()=>{
 const s=setup();assert.equal(await run(s),'completed');assert.deepEqual(s.diagnostics,[{kind:'uncertain',reason:'journey_start_unverified'}]);assert.equal(s.hold.reevaluateAt,now+604800000);
 assert.deepEqual(s.calls,['revalidate','context','revalidate','revalidate','claim','revalidate','context','revalidate','revalidate','complete']);
 assert.equal(await run(s),'skipped');assert.equal(s.diagnostics.length,1);
});
test('cache or registry revalidation failure before context prevents claim',async()=>{
 const s=setup();s.ports.revalidate=async()=>{throw Error('authority_changed');};assert.equal(await run(s),'reconcile');assert.equal(s.record,null);assert.equal(s.diagnostics.length,0);
});
test('authority change during second context prevents completion and marks claim uncertain',async()=>{
 const s=setup();let count=0;s.ports.revalidate=async()=>{if(++count===5)throw Error('authority_changed');return proof;};
 assert.equal(await run(s),'reconcile');assert.equal(s.record.status,'uncertain');assert.equal(s.diagnostics.length,0);
});
test('unknown completion response never retries evaluation or invents completed receipt',async()=>{
 const s=setup();s.ports.storage.complete=async()=>{throw Error('network_lost');};assert.equal(await run(s),'reconcile');assert.equal(s.record.status,'uncertain');assert.equal(s.calls.filter(x=>x==='claim').length,1);
});
test('wrong owner stale context expired proof fail closed before storage claim',async()=>{
 for(const change of [v=>v.actor='other',v=>v.observation.context.ownerId='other',v=>{v.capturedAt='2020-01-01';v.observation.capturedAt=v.capturedAt;}]){
  const s=setup();change(s.raw);assert.equal(await run(s),'reconcile');assert.equal(s.record,null);
 }
 assert.throws(()=>workerAssessmentInput(setup().raw,selection,{...proof,expiresAt:now},now),/worker_context_unavailable/);
});
test('blocked actual diagnostic preserves hold rather than manufacturing review',async()=>{
 const s=setup();s.raw.currentGoal.user_id='other';assert.equal(await run(s),'completed');assert.equal(s.diagnostics[0].kind,'preserve');assert.equal(s.hold,null);
});
test('aborted run performs no context or storage I/O',async()=>{
 const s=setup(),abort=new AbortController();abort.abort();assert.equal(await runWorkerAssessmentForReview(s.ports,selection,proof,now+5000,abort.signal),'reconcile');assert.deepEqual(s.calls,[]);
});
