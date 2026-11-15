/** Smart Macro regression changes prepared, NOT EXECUTED: runner remains blocked. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSnapshotContextRecord,snapshotIssueArguments,createSnapshotServerRuntime,SNAPSHOT_SERVER_RPC} from '../release-candidates/tdee-adaptive-review/snapshotServerRuntime.ts';
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
test('real parser refuses old context without authoritative Smart Macro review',()=>{
 const v=fixture(),before=structuredClone(v);
 assert.deepEqual(prepareSnapshotContextRecord(v,actor,actor,now),{kind:'blocked',reason:'macro_context_required'});
 assert.deepEqual(v,before);
});
test('issuer argument serialization clones a synthetic record without granting review',()=>{
 const record={id:actor,ownerId:actor,policyVersion:'synthetic',anchorId:actor,expiresAt:'2026-11-14T12:04:59.000Z',
 payload:{goalSnapshot:{daily_calories:2000},deltaKcal:100,readinessFingerprint:hash}};
 const args=snapshotIssueArguments(record);
 assert.deepEqual(Object.keys(args).sort(),['p_id','p_owner','p_policy','p_anchor','p_expires_at','p_payload'].sort());
 assert.equal(args.p_owner,actor);assert.equal(args.p_payload.deltaKcal,100);
 args.p_payload.goalSnapshot.daily_calories=1;assert.equal(record.payload.goalSnapshot.daily_calories,2000);
});
test('unreviewed records and cross-account raw contexts cannot prepare',()=>{
 for(const mutate of [v=>v.policy=null,v=>v.anchor=null,v=>v.eligibility=null,v=>v.actor='other',v=>v.policy.reviewed='true',v=>v.readiness.days[0].confirmed=false]){
 const v=fixture();mutate(v);assert.equal(prepareSnapshotContextRecord(v,actor,actor,now).kind,'blocked');
 }
});
test('expired observation cannot prepare and caller proposal ID must be UUID',()=>{
 assert.equal(prepareSnapshotContextRecord(fixture(),actor,actor,now+30001).kind,'blocked');
 assert.equal(prepareSnapshotContextRecord(fixture(),actor,'caller-invalid',now).kind,'blocked');
});
test('OFF invokes zero auth, loader, clock, ID or issuer dependencies',async()=>{
 let calls=0;const fail=()=>{calls++;throw new Error('must not run')};
 const handler=createSnapshotServerRuntime({verifyAccessToken:fail,loadOwnContext:fail,issueAsService:fail,now:fail,newProposalId:fail,recommendationsEnabled:true});
 assert.deepEqual(await handler({authorization:'Bearer opaque-session'}),{reason:'safety_review_required',proposal:null});
 assert.equal(calls,0);
});
test('request body cannot supply actor, flags, or payload',async()=>{
 const handler=createSnapshotServerRuntime({});
 for(const request of [null,[],{},'Bearer x',{authorization:'Bearer x',ownerId:actor},{authorization:'Bearer x',enabled:true},{authorization:'Bearer x',body:{}},{authorization:'Bearer x',policy:{reviewed:true}},{authorization:'Bearer x\nsecret'},{authorization:'bearer x'}]){
 assert.equal((await handler(request)).reason,'invalid_request');
 }
});
test('RPC names are frozen exact wrappers; runtime has no bootstrap',()=>{
 assert.equal(SNAPSHOT_SERVER_RPC.read,'tdee_read_review_context_v1');
 assert.equal(SNAPSHOT_SERVER_RPC.issue,'tdee_issue_snapshot_proposal_v1');
 assert.equal(Object.isFrozen(SNAPSHOT_SERVER_RPC),true);
});
