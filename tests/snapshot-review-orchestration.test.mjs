/** Smart Macro regression changes prepared, NOT EXECUTED: runner remains blocked. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {beginSnapshotWorkflow,advanceSnapshotWorkflow,createSnapshotReviewOrchestrator} from '../release-candidates/tdee-adaptive-review/snapshotReviewOrchestration.ts';
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

const binding=()=>({version:'p1',digest:hash,engineVersion:'observed-v1/snapshot-adjustment-v1'});
const advance=(s,value)=>advanceSnapshotWorkflow(s,{ok:true,value},now);
function loaded(v=fixture()){
 let s=beginSnapshotWorkflow(actor,actor,binding());s=advance(s,fixture().policy);return advance(s,v);
}
const refreshResponse=()=>({version:'snapshot-eligibility-refresh-v1',status:'refreshed',ownerId:actor,anchorId:actor,eligibilityDigest:hash,actionable:false});
test('OFF invokes no auth policy context writers clock or IDs',async()=>{
 let calls=0;const nope=()=>{calls++;throw Error('not allowed')};
 const run=createSnapshotReviewOrchestrator({verifyAccessToken:nope,readPolicyExact:nope,loadOwnContext:nope,bootstrapAsService:nope,refreshAsService:nope,issueAsService:nope,now:nope,newProposalId:nope},binding());
 assert.deepEqual(await run({authorization:'Bearer token'}),{reason:'safety_review_required',proposal:null,mayHaveWritten:false});
 assert.equal((await run({authorization:'Bearer token',enabled:true})).reason,'invalid_request');
 assert.equal((await run({authorization:'Bearer token',ownerId:actor})).reason,'invalid_request');assert.equal(calls,0);
});
test('missing or mismatched explicit server policy fails before loading',()=>{
 for(const policy of [null,{}, {...fixture().policy,digest:'b'.repeat(64)},{...fixture().policy,reviewed:false}]){
 const s=advance(beginSnapshotWorkflow(actor,actor,binding()),policy);
 assert.equal(s.phase,'done');assert.equal(s.outcome.reason,'server_policy_required');
 }
 assert.equal(beginSnapshotWorkflow(actor,actor,{...binding(),version:''}).phase,'done');
});
test('existing revoked anchor never starts bootstrap or resets baseline',()=>{
 const v=fixture();v.anchor.revoked=true;v.receiptChain.anchor=structuredClone(v.anchor);
 const s=loaded(v);assert.equal(s.phase,'done');assert.equal(s.outcome.reason,'anchor_unavailable');
});
test('successful writer response alone cannot issue; reload is mandatory',()=>{
 const s=loaded();assert.equal(s.phase,'write_refresh');
 const next=advance(s,refreshResponse());assert.equal(next.phase,'reload_context');assert.equal(next.record,undefined);
 const missing=advanceSnapshotWorkflow(next,{ok:false},now);
 assert.equal(missing.phase,'done');assert.equal(missing.outcome.proposal,null);assert.equal(missing.outcome.mayHaveWritten,true);
});
test('uncertain writer result terminates without retries or hidden bootstrap',()=>{
 const s=advanceSnapshotWorkflow(loaded(),{ok:false},now);
 assert.equal(s.phase,'done');assert.equal(s.outcome.reason,'reconciliation_required');assert.equal(s.outcome.mayHaveWritten,true);
 assert.deepEqual(advance(s,refreshResponse()),s);
});
test('changed actor anchor goal profile policy or journey after reload stops issuance',()=>{
 for(const mutate of [v=>v.actor='other',v=>v.anchor.id='22222222-2222-4222-8222-222222222222',
 v=>v.currentGoal.daily_calories=1900,v=>v.profile.updatedAt='2026-11-14T11:59:00Z',
 v=>v.policy.digest='b'.repeat(64),v=>v.readiness.journeyBinding='b'.repeat(64)]){
 const v=fixture();mutate(v);const s=advance(advance(loaded(),refreshResponse()),v);
 assert.equal(s.phase,'done');assert.equal(s.outcome.proposal,null);assert.equal(s.outcome.mayHaveWritten,true);
 }
});
test('fresh reload without authoritative macro review stops before issuer',()=>{
 let s=advance(loaded(),refreshResponse());const v=fixture();
 v.capturedAt=new Date(now-500).toISOString();v.observation.capturedAt=v.capturedAt;v.readiness.capturedAt=v.capturedAt;
 s=advance(s,v);assert.equal(s.phase,'done');assert.equal(s.outcome.reason,'macro_context_required');
 assert.equal(s.outcome.proposal,null);assert.equal(s.outcome.mayHaveWritten,true);
 assert.equal(s.record,undefined);
 // A refresh may have written eligibility; no claim that nothing changed.
 assert.deepEqual(advance(s,{type:'persisted_reviewed_proposal'}),s);
});
test('new bootstrap reloads same baseline then ends calibration without issuing',()=>{
 const v=fixture();v.anchor=null;v.policy=null;v.eligibility=null;v.receiptChain.anchor=null;
 let s=loaded(v);assert.equal(s.phase,'write_bootstrap');const planned=structuredClone(s.plan);
 s=advance(s,{version:'snapshot-bootstrap-v1',status:'created',anchorId:actor,actionable:false});
 assert.equal(s.phase,'reload_context');
 const fresh=fixture();fresh.anchor.baseline_expenditure_kcal=planned.baseline.expenditureKcal;
 fresh.anchor.baseline_captured_at=planned.baseline.capturedAt;
 fresh.receiptChain.anchor=structuredClone(fresh.anchor);
 s=advance(s,fresh);assert.equal(s.phase,'done');assert.equal(s.outcome.reason,'calibration_required');assert.equal(s.outcome.proposal,null);
});
test('concurrent existing bootstrap with different baseline never resets or issues',()=>{
 const v=fixture();v.anchor=null;v.policy=null;v.eligibility=null;v.receiptChain.anchor=null;
 const s=advance(advance(loaded(v),{version:'snapshot-bootstrap-v1',status:'existing',anchorId:actor,actionable:false}),fixture());
 assert.equal(s.phase,'done');assert.equal(s.outcome.reason,'reload_baseline_changed');
});
test('no tokens or request credentials enter pure workflow state',()=>{
 const s=loaded();assert.equal(JSON.stringify(s).includes('Bearer'),false);assert.equal('authorization' in s,false);
 assert.equal('token' in s,false);assert.equal(s.actor,actor);
});
