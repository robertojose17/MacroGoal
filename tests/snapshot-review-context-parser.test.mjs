/** Smart Macro fail-closed expectations prepared, NOT EXECUTED: runner remains blocked. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSnapshotReviewContext} from '../release-candidates/tdee-adaptive-review/snapshotReviewContextParser.ts';
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
test('real estimator and old attestations do not manufacture Smart Macro review',()=>{
 const v=fixture(),before=structuredClone(v);
 assert.deepEqual(parseSnapshotReviewContext(v,actor,actor,now),{kind:'blocked',reason:'macro_context_required'});
 assert.deepEqual(v,before);
});
test('missing records cannot manufacture review',()=>{for(const key of ['policy','anchor','eligibility']){const v=fixture();v[key]=null;assert.equal(parseSnapshotReviewContext(v,actor,actor,now).kind,'blocked');}});
test('owner and goal/policy mismatches fail closed',()=>{for(const mutate of [v=>v.profile.id='other',v=>v.currentGoal.user_id='other',v=>v.anchor.owner_id='other',v=>v.eligibility.owner_id='other',v=>v.policy.digest='bad',v=>v.anchor.policy_version='other',v=>v.currentGoal.updated_at=null,v=>v.policy.engine_version='unknown']){const v=fixture();mutate(v);assert.equal(parseSnapshotReviewContext(v,actor,actor,now).kind,'blocked');}});
test('policy review requires strict boolean',()=>{for(const key of ['enabled','reviewed','snapshot_contract_reviewed'])for(const value of [false,'true',null]){const v=fixture();v.policy[key]=value;assert.equal(parseSnapshotReviewContext(v,actor,actor,now).kind,'blocked');}});
test('all interval days confirmed, last weight day excluded',()=>{const v=fixture();v.readiness.days[0].confirmed=false;assert.equal(parseSnapshotReviewContext(v,actor,actor,now).reason,'complete_days_required');const x=fixture();x.readiness.days.at(-1).confirmed=false;assert.equal(parseSnapshotReviewContext(x,actor,actor,now).reason,'macro_context_required');});
test('revoked selfreport, duplicate days and receipt mismatch block',()=>{for(const mutate of [v=>v.readiness.eligibility.current=false,v=>v.readiness.eligibility.response='unsure',v=>v.readiness.days.push(v.readiness.days[0]),v=>v.receiptChain.totalCount=1,v=>v.receiptChain.anchor.accepted_delta_kcal=100]){const v=fixture();mutate(v);assert.equal(parseSnapshotReviewContext(v,actor,actor,now).kind,'blocked');}});
test('baseline provenance and direction required',()=>{for(const mutate of [v=>v.anchor.baseline_captured_at=null,v=>v.anchor.baseline_captured_at='2026-11-13T00:00:00Z',v=>v.anchor.baseline_expenditure_kcal=1900]){const v=fixture();mutate(v);v.receiptChain.anchor=structuredClone(v.anchor);assert.equal(parseSnapshotReviewContext(v,actor,actor,now).kind,'blocked');}});
test('estimator gates never bypassed by confirmations',()=>{const v=fixture();v.observation.sources.items[0].calories=0;assert.equal(parseSnapshotReviewContext(v,actor,actor,now).reason,'estimate_unknown_calorie_provenance');});

test('changed journey or baseline goal cannot reuse calibration',()=>{for(const mutate of [v=>v.anchor.journey_binding='b'.repeat(64),v=>v.anchor.baseline_goal_snapshot.protein_g+=1]){const v=fixture();mutate(v);v.receiptChain.anchor=structuredClone(v.anchor);assert.equal(parseSnapshotReviewContext(v,actor,actor,now).kind,'blocked');}});

test('required caps reject null or invalid values without defaults or source mutation',()=>{
 for(const value of [null,undefined,0,-1,NaN,Infinity,'none'])for(const key of ['max_cumulative_delta_kcal','max_intake_kcal']){
  const v=fixture();v.policy[key]=value;const before=structuredClone(v);
  assert.equal(parseSnapshotReviewContext(v,actor,actor,now).kind,'blocked');assert.deepEqual(v,before);
 }
});

/** Prepared, not executed: parser must not fabricate individual review evidence. */
test('real estimator lower expenditure blocks reduction despite synthetic review flags',()=>{
 const v=fixture();for(const item of v.observation.sources.items)item.calories=1150;
 v.individualDeficitReview={reviewed:true,maxTotalDeficitKcal:100000};
 const before=structuredClone(v);
 const r=parseSnapshotReviewContext(v,actor,actor,now);
 assert.equal(r.kind,'blocked');assert.equal(r.reason,'individual_deficit_review_required');
 assert.deepEqual(v,before);
});

// Untrusted additions must not become reviewed macro inputs in the current loader.
test('raw macro flags cannot bypass the missing authoritative context',()=>{
 const v=fixture();v.macroContext={status:'reviewed',eligible:true,proteinAdequate:true};
 v.macroBinding={ownerId:actor,sourceFingerprint:hash};
 assert.deepEqual(parseSnapshotReviewContext(v,actor,actor,now),{kind:'blocked',reason:'macro_context_required'});
});
