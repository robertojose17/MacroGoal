import test from 'node:test';
import assert from 'node:assert/strict';
import {planSnapshotBootstrap} from '../release-candidates/tdee-adaptive-review/snapshotBootstrapPlanner.ts';
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

function bootstrapFixture(){const v=fixture(),policy=v.policy;v.anchor=null;v.policy=null;v.eligibility=null;v.receiptChain.anchor=null;return {v,policy};}
test('real evidence creates inert baseline at actual capture, not historical backdate',()=>{
 const {v,policy}=bootstrapFixture(),p=planSnapshotBootstrap(v,actor,policy,now);
 assert.equal(p.kind,'bootstrap_draft');assert.equal(p.actionable,false);
 assert.deepEqual(p.baseline,{intakeKcal:2000,expenditureKcal:2500,capturedAt:v.capturedAt});
 assert.equal(p.journeyBinding,hash);assert.equal(p.expectedGoalSnapshot.id,actor);
 assert.equal(p.eligibilityEvidence.windowStart,'2026-10-16');
 assert.equal(p.eligibilityEvidence.asOf,'2026-11-13');
 assert.equal(p.eligibilityEvidence.expiresAt,'2026-11-14T12:04:59.000Z');
 v.currentGoal.daily_calories=1;assert.equal(p.expectedGoalSnapshot.daily_calories,2000);
 assert.equal('eligible' in p.eligibilityEvidence,false);
});
test('no initial cooldown on creation, but no existing or revoked anchor replacement',()=>{
 const {v,policy}=bootstrapFixture();
 assert.equal(planSnapshotBootstrap(v,actor,policy,now).kind,'bootstrap_draft');
 for(const anchor of [{revoked:true},fixture().anchor,undefined]){
 v.anchor=anchor;assert.equal(planSnapshotBootstrap(v,actor,policy,now).kind,'blocked');
 }
});
test('no policy defaults or request flags can create review',()=>{
 for(const key of ['enabled','reviewed','snapshot_contract_reviewed']){
 for(const value of [false,'true',undefined]){
 const {v,policy}=bootstrapFixture();policy[key]=value;assert.equal(planSnapshotBootstrap(v,actor,policy,now).kind,'blocked');
 }}
 const {v}=bootstrapFixture();assert.equal(planSnapshotBootstrap(v,actor,null,now).kind,'blocked');
});
test('strict persisted policy limits and supported engine',()=>{
 for(const [key,value] of [['max_step_kcal',201],['min_days_between_acceptances',13],['max_step_fraction',NaN],['max_intake_kcal',100],['max_cumulative_delta_kcal','400'],['engine_version','unknown'],['expires_at','2026-11-14T11:00:00Z']]){
 const {v,policy}=bootstrapFixture();policy[key]=value;assert.equal(planSnapshotBootstrap(v,actor,policy,now).kind,'blocked');
 }
});
test('ownership, snapshot CAS and receipt partition mismatches block',()=>{
 for(const mutate of [v=>v.actor='other',v=>v.profile.id='other',v=>v.currentGoal.updated_at=null,v=>v.receiptChain.totalCount=1,v=>v.receiptChain.rows=[{}],v=>v.receiptChain.currentGoal.protein_g=1]){
 const {v,policy}=bootstrapFixture();mutate(v);assert.equal(planSnapshotBootstrap(v,actor,policy,now).kind,'blocked');
 }
});
test('real premium, enabled and adult self-confirmation required',()=>{
 for(const mutate of [v=>v.observation.context.premium=false,v=>v.observation.context.enabled=false,v=>v.readiness.eligibility.adult=false,v=>v.readiness.eligibility.current=false,v=>v.readiness.eligibility.response='unsure',v=>v.readiness.days[0].confirmed=false]){
 const {v,policy}=bootstrapFixture();mutate(v);assert.equal(planSnapshotBootstrap(v,actor,policy,now).kind,'blocked');
 }
});
test('unknown food provenance and stale capture cannot bootstrap',()=>{
 const {v,policy}=bootstrapFixture();v.observation.sources.items[0].calories=0;
 assert.equal(planSnapshotBootstrap(v,actor,policy,now).reason,'estimate_unknown_calorie_provenance');
 const x=bootstrapFixture();assert.equal(planSnapshotBootstrap(x.v,actor,x.policy,now+30001).reason,'source_expired');
});
test('goal direction mismatch never silently changes target',()=>{
 const {v,policy}=bootstrapFixture();v.currentGoal.goal_type='gain';v.observation.context.currentGoal.goal_type='gain';v.receiptChain.currentGoal.goal_type='gain';
 assert.equal(planSnapshotBootstrap(v,actor,policy,now).reason,'goal_direction_mismatch');
});
