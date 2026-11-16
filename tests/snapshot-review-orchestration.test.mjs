/** Smart Macro regression changes prepared, NOT EXECUTED: runner remains blocked. */
import {prepareSnapshotMacroContextRequest} from '../release-candidates/tdee-adaptive-review/snapshotReviewContextParser.ts';
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
 const run=createSnapshotReviewOrchestrator({verifyAccessToken:nope,readPolicyExact:nope,loadOwnContext:nope,loadReviewedMacroContext:nope,bootstrapAsService:nope,refreshAsService:nope,issueAsService:nope,now:nope,newProposalId:nope},binding());
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

// Synthetic context for arithmetic tests only. Not persisted/reviewed clinical evidence.
function withPreset(v,preset='balanced'){
 v.currentGoal.macro_preset=preset;v.observation.context.currentGoal.macro_preset=preset;
 v.anchor.baseline_goal_snapshot.macro_preset=preset;
 v.receiptChain.currentGoal.macro_preset=preset;v.receiptChain.anchor=structuredClone(v.anchor);
 return v;
}
function macroEvidence(v){
 const result=prepareSnapshotMacroContextRequest(v,actor,actor,now);
 assert.equal(result.kind,'macro_request');const request=result.request;
 return {version:'snapshot-macro-evidence-v1',request:structuredClone(request),consent:null,
 review:{binding:structuredClone(request.binding),current:structuredClone(request.current),
 review:{status:'reviewed',reviewId:'synthetic-review',reviewedAt:now-1000,expiresAt:now+60000,ageYears:request.ageYears,eligibility:'eligible'},
 limits:{proteinMinG:140,proteinMaxG:160,carbsMinG:130,carbsMaxG:400,fatsMinG:40,fatsMaxG:90,fatMinFraction:.2,fatMaxFraction:.35}}};
}

function macroPhase(){
 const v=withPreset(fixture());let s=loaded(v);s=advance(s,refreshResponse());s=advance(s,v);
 assert.equal(s.phase,'load_macro');assert.equal(s.record,undefined);return {s,v};
}
test('separate macro load is required before issue; null and failed port retain write uncertainty',()=>{
 const {s}=macroPhase();let end=advance(s,null);
 assert.equal(end.phase,'done');assert.equal(end.outcome.reason,'macro_context_required');
 assert.equal(end.outcome.mayHaveWritten,true);assert.equal(end.record,undefined);
 end=advanceSnapshotWorkflow(s,{ok:false},now);assert.equal(end.outcome.reason,'source_error');assert.equal(end.outcome.mayHaveWritten,true);
 end=advanceSnapshotWorkflow(s,{ok:true,value:null},NaN);assert.equal(end.outcome.mayHaveWritten,true);
});
test('real parser receives separate synthetic evidence, then issuer phase only',()=>{
 const {s,v}=macroPhase();const next=advance(s,macroEvidence(v));
 assert.equal(next.phase,'issue');assert.equal(next.record.ownerId,actor);
 assert.equal(next.record.payload.target.proteinG,150);assert.equal(next.record.payload.target.fatsG,60);
 assert.equal(next.macroRaw,undefined);assert.equal(next.macroRequest,undefined);
});
test('source age and mutated actor or profile across macro await cannot issue',()=>{
 const {s,v}=macroPhase(),e=macroEvidence(v);
 const expired=advanceSnapshotWorkflow(s,{ok:true,value:e},now+30000);
 assert.equal(expired.outcome.reason,'source_expired');assert.equal(expired.outcome.mayHaveWritten,true);
 for(const mutate of [x=>x.macroRaw.actor='other',x=>x.macroRequest.profileUpdatedAt='other',x=>x.macroRequest.binding.goalId='other']){
  const changed=structuredClone(s);mutate(changed);const out=advance(changed,e);
  assert.equal(out.phase,'done');assert.equal(out.outcome.proposal,null);assert.equal(out.outcome.mayHaveWritten,true);
 }
});
test('macro port is only an additional pure phase, not a retry or implicit acceptance',()=>{
 const {s}=macroPhase();const out=advance(s,{reviewed:true,eligible:true});
 assert.equal(out.phase,'done');assert.equal(out.outcome.reason,'macro_evidence_binding_mismatch');
 assert.equal(out.outcome.mayHaveWritten,true);assert.deepEqual(advance(out,null),out);
});

function initial14Fixture(){
 const v=fixture();v.policy.engine_version='rate-review-14d-v1';
 v.currentGoal.loss_rate_lbs_per_week=1;v.observation.context.currentGoal.loss_rate_lbs_per_week=1;
 v.profile.journeyStartDate='2026-10-01';v.observation.sources.journeyStartDate='2026-10-01';
 // Synthetic source fixture only: no policy/review is persisted by this test.
 v.anchor=null;v.eligibility=null;v.receiptChain=null;
 return v;
}
function initial14(v=initial14Fixture()){
 const b={...binding(),engineVersion:'rate-review-14d-v1'};
 return advance(advance(beginSnapshotWorkflow(actor,actor,b),v.policy),v);
}
test('initial14 route does not bootstrap or require legacy21d when interval unavailable',()=>{
 const v=initial14Fixture(),cut='2026-10-31';
 v.observation.sources.checkIns=v.observation.sources.checkIns.filter(w=>w.date>=cut);
 v.observation.counts.checkIns=v.observation.sources.checkIns.length;
 const pending=initial14(v);assert.equal(pending.phase,'load_rate_review');
 const s=advance(pending,null);assert.equal(s.phase,'done');assert.equal(s.outcome.reason,'rate_reviewed_context_unavailable');
 assert.equal(s.outcome.mayHaveWritten,false);assert.equal(s.outcome.proposal,null);
 assert.equal(s.plan,undefined);assert.equal(s.record,undefined);
});
test('initial14 route rejects early journey and absent readiness without fallback',()=>{
 for(const mutate of [v=>{v.profile.journeyStartDate='2026-11-05';v.observation.sources.journeyStartDate='2026-11-05';v.readiness.days=v.readiness.days.filter(d=>d.date>='2026-11-05');},v=>{v.readiness=null;}]){
 const v=initial14Fixture();mutate(v);const s=initial14(v);
 assert.equal(s.phase,'done');assert.equal(s.outcome.mayHaveWritten,false);assert.equal(s.outcome.proposal,null);
 assert.notEqual(s.outcome.reason,'rate_uncertainty_unverified');assert.equal(s.plan,undefined);
 }
});
test('initial14 server selection cannot enable OFF or accept request version override',async()=>{
 let calls=0;const nope=()=>{calls++;throw Error('unexpected')};
 const run=createSnapshotReviewOrchestrator({verifyAccessToken:nope,readPolicyExact:nope,loadOwnContext:nope,
 bootstrapAsService:nope,refreshAsService:nope,issueAsService:nope}, {...binding(),engineVersion:'rate-review-14d-v1'});
 assert.equal((await run({authorization:'Bearer token'})).reason,'safety_review_required');
 assert.equal((await run({authorization:'Bearer token',engineVersion:'rate-review-14d-v1'})).reason,'invalid_request');
 assert.equal(calls,0);
});

