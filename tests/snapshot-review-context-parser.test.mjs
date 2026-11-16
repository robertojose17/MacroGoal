/** Smart Macro fail-closed expectations prepared, NOT EXECUTED: runner remains blocked. */
import {estimateFromSources,normalizedDatedWeights} from '../supabase/functions/observed-snapshot-release/functions/dynamic-tdee/data.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSnapshotReviewContext,prepareSnapshotMacroContextRequest,diagnoseSnapshotRateReview} from '../release-candidates/tdee-adaptive-review/snapshotReviewContextParser.ts';
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

test('independent server evidence binds exact snapshot and yields non-actionable context',()=>{
 const v=withPreset(fixture()),e=macroEvidence(v),before=structuredClone({v,e});
 const parsed=parseSnapshotReviewContext(v,actor,actor,now,e);assert.equal(parsed.kind,'prepared_context');
 assert.equal(parsed.actionable,false);assert.equal(parsed.input.macroContext.review.ageYears,36);
 parsed.input.macroContext.limits.proteinMinG=1;assert.deepEqual({v,e},before);
});
test('raw evidence ignored and request preparation preserves previous gates',()=>{
 const v=withPreset(fixture());v.macroEvidence=macroEvidence(v);
 assert.equal(parseSnapshotReviewContext(v,actor,actor,now).reason,'macro_context_required');
 for(const item of v.observation.sources.items)item.calories=1150;
 assert.equal(prepareSnapshotMacroContextRequest(v,actor,actor,now).reason,'individual_deficit_review_required');
});
test('every outer binding and age mismatch is rejected after port load',()=>{
 for(const key of ['sourceCapturedAt','profileUpdatedAt','profileBinding','journeyBinding','today','ageYears']){
 const v=withPreset(fixture()),e=macroEvidence(v);e.request[key]='other';
 assert.equal(parseSnapshotReviewContext(v,actor,actor,now,e).reason,'macro_evidence_binding_mismatch');
 }
 const v=withPreset(fixture()),e=macroEvidence(v);e.review.review.ageYears=35;
 assert.equal(parseSnapshotReviewContext(v,actor,actor,now,e).reason,'macro_evidence_invalid');
 assert.equal(parseSnapshotReviewContext(v,actor,actor,now+30000,e).reason,'source_expired');
});
test('review cannot smuggle custom consent; preserve-percent cannot silently become Smart',()=>{
 const v=withPreset(fixture(),'custom'),e=macroEvidence(v);
 const consent={mode:'smart',binding:structuredClone(e.request.binding),consentId:'synthetic-consent',acceptedAt:now-1};
 e.review.customChoice=consent;
 assert.equal(parseSnapshotReviewContext(v,actor,actor,now,e).reason,'macro_evidence_invalid');
 delete e.review.customChoice;
 assert.equal(parseSnapshotReviewContext(v,actor,actor,now,e).reason,'custom_macro_consent_required');
 e.consent=consent;assert.equal(parseSnapshotReviewContext(v,actor,actor,now,e).kind,'prepared_context');
 e.consent.mode='preserve_percent';
 // Missing persisted split/version is invalid; never interpret it as Smart.
 assert.equal(parseSnapshotReviewContext(v,actor,actor,now,e).reason,'manual_percentage_choice_invalid');
});

test('snapshot diagnostic reads bound sources but grants no confidence or proposal',()=>{
 const v=fixture();v.currentGoal.loss_rate_lbs_per_week=1;v.observation.context.currentGoal.loss_rate_lbs_per_week=1;v.policy=null;v.anchor=null;v.eligibility=null;
 const before=structuredClone(v),r=diagnoseSnapshotRateReview(v,actor,now);
 assert.equal(r.kind,'rate_diagnostic');assert.equal(r.window.startDate,'2026-10-31');assert.equal(r.window.weightDays,14);
 assert.equal(r.observedRateKgPerWeek,0);assert.equal(r.targetRateKgPerWeek,-0.45359237);
 assert.equal(r.reliableInterval,false);assert.equal(r.recommendation,null);assert.equal(r.sourceFingerprint,hash);
 assert.equal(r.goalRevision,v.currentGoal.updated_at);assert.deepEqual(v,before);
});
test('snapshot diagnostic rejects cross-actor stale disabled and expired sources',()=>{
 for(const mutate of [v=>v.actor='other',v=>v.currentGoal.user_id='other',v=>v.profile.timezone='America/New_York',
 v=>v.observation.context.enabled=false,v=>v.observation.context.accessValidUntil=now,
 v=>v.observation.sources.dateOfBirth='2020-01-01']){
 const v=fixture();mutate(v);assert.equal(diagnoseSnapshotRateReview(v,actor,now).kind,'blocked');
 }
 assert.equal(diagnoseSnapshotRateReview(fixture(),actor,now+30000).reason,'source_expired');
});
test('shared normalization honors explicit pounds and rejects cross-source conflict',()=>{
 const v=fixture(),s=v.observation.sources;
 s.trackers=[{id:'tracker',unit:'lb'}];s.trackerWeights=[{id:'tw',tracker_id:'tracker',date:'2026-11-13',value:80*2.2046226218,created_at:'2026-11-13T09:00:00Z'}];
 v.observation.counts.trackers=1;v.observation.counts.trackerWeights=1;
 assert.equal(diagnoseSnapshotRateReview(v,actor,now).kind,'rate_diagnostic');
 s.trackerWeights[0].value=90*2.2046226218;assert.equal(diagnoseSnapshotRateReview(v,actor,now).reason,'rate_weight_source_conflict');
 s.trackers[0].unit='unknown';assert.equal(diagnoseSnapshotRateReview(v,actor,now).reason,'rate_weight_source_conflict');
});
test('restart excludes older weights and does not fill fourteen days',()=>{
 const v=fixture();v.profile.journeyStartDate='2026-11-10';v.observation.sources.journeyStartDate='2026-11-10';
 const r=diagnoseSnapshotRateReview(v,actor,now);
 assert.equal(r.window.weightDays,4);assert.equal(r.observedRateKgPerWeek,null);
 assert.equal(r.reason,'insufficient_pair_span');assert.equal(r.recommendation,null);
});

test('shared normalizer keeps flat expenditure and original intake rejection semantics',()=>{
 const s=fixture().observation.sources;
 const original=structuredClone(s);
 const result=estimateFromSources(s,new Date(now));
 assert.equal(result.status,'estimated');assert.equal(result.kcalPerDay,2500);
 assert.deepEqual(s,original);
 s.items[0].calories=0;assert.equal(estimateFromSources(s,new Date(now)).reason,'unknown_calorie_provenance');
});
test('normalizer preserves latest dated reading and existing conflict ordering',()=>{
 const s=fixture().observation.sources,day='2026-11-13';
 s.checkIns.push({id:'latest',date:day,weight:81,updated_at:day+'T10:00:00Z',created_at:day+'T09:00:00Z'});
 assert.equal(normalizedDatedWeights(s,'2026-11-14','2026-10-16').find(w=>w.date===day).kg,81);
 s.checkIns.push({id:'conflict',date:day,weight:82,updated_at:day+'T10:00:00Z',created_at:day+'T09:00:00Z'});
 assert.equal(normalizedDatedWeights(s,'2026-11-14','2026-10-16'),null);
 assert.equal(estimateFromSources(s,new Date(now)).reason,'invalid_data');
});

test('diagnostic counts explicit server-bound day confirmations without granting confidence',()=>{
 const v=fixture(),r=diagnoseSnapshotRateReview(v,actor,now);
 assert.deepEqual(r.loggingCoverage,{status:'explicit_self_report',windowDays:14,confirmedDays:14,unconfirmedDays:0,unavailableDays:0,allDaysExplicitlyConfirmed:true});
 assert.equal(r.reliableInterval,false);assert.equal(r.recommendation,null);
});
test('edited revoked empty and missing days cannot silently count as complete',()=>{
 const v=fixture();
 // These states are emitted by the SQL read_state after content hash/journey checks.
 v.readiness.days.at(-1).confirmed=false;
 v.readiness.days.at(-2).confirmed=false;v.readiness.days.at(-2).confirmable=false;
 v.readiness.days.splice(-3,1);
 const r=diagnoseSnapshotRateReview(v,actor,now);
 assert.equal(r.loggingCoverage.confirmedDays,11);assert.equal(r.loggingCoverage.unconfirmedDays,1);
 assert.equal(r.loggingCoverage.unavailableDays,2);assert.equal(r.loggingCoverage.allDaysExplicitlyConfirmed,false);
 assert.equal(r.recommendation,null);
});
test('foreign stale malformed and mixed-day readiness stays unverified',()=>{
 for(const mutate of [v=>v.readiness.ownerId='other',v=>v.readiness.timezone='America/New_York',
 v=>v.readiness.today='2026-11-13',v=>v.readiness.capturedAt='2026-11-13T12:00:00Z',
 v=>v.readiness.journeyBinding='invalid',v=>v.readiness.days.push(v.readiness.days[0]),
 v=>v.readiness.days.at(-1).confirmable=false,v=>v.readiness=null]){
 const v=fixture();mutate(v);const r=diagnoseSnapshotRateReview(v,actor,now);
 assert.equal(r.loggingCoverage.status,'unverified');assert.equal(r.loggingCoverage.confirmedDays,null);
 assert.equal(r.recommendation,null);assert.equal(r.reliableInterval,false);
 }
});

test('confirmed-day calorie mean excludes partial days without treating them as zero',()=>{
 const v=fixture();const recent=v.readiness.days.filter(d=>d.date>='2026-10-31');
 recent.slice(0,4).forEach(d=>{d.confirmed=false;});
 const r=diagnoseSnapshotRateReview(v,actor,now);
 assert.equal(r.loggedIntake.confirmedDayCount,10);
 assert.equal(r.loggedIntake.averageLoggedCaloriesOnConfirmedDays,2500);
 assert.equal(r.loggedIntake.imputedDays,0);
 for(const k of ['proteinG','carbsG','fatsG','fiberG'])assert.equal(r.loggedIntake[k],null);
 assert.equal(r.loggedIntake.macroStatus,'not_in_snapshot');
});
test('unknown calories or empty confirmed day nulls mean rather than cherry-picking',()=>{
 for(const remove of [false,true]){
 const v=fixture(),mealIds=new Set(v.observation.sources.meals.filter(m=>m.date==='2026-11-13').map(m=>m.id));
 if(remove){v.observation.sources.items=v.observation.sources.items.filter(i=>!mealIds.has(i.meal_id));v.observation.counts.items=v.observation.sources.items.length;}
 else v.observation.sources.items.find(i=>mealIds.has(i.meal_id)).calories=0;
 const r=diagnoseSnapshotRateReview(v,actor,now);
 assert.equal(r.loggedIntake.averageLoggedCaloriesOnConfirmedDays,null);
 assert.equal(r.loggedIntake.unknownCalorieDayCount,1);
 }
});
test('unverified readiness yields unknown intake rather than meal-type inference',()=>{
 const v=fixture();v.readiness=null;
 const r=diagnoseSnapshotRateReview(v,actor,now);
 assert.equal(r.loggedIntake.status,'unverified');
 assert.equal(r.loggedIntake.averageLoggedCaloriesOnConfirmedDays,null);
});

function markedNutrition(){
 const v=fixture();v.observation.sources.nutritionFieldsVersion='logged-macros-v1';
 for(const i of v.observation.sources.items)Object.assign(i,{protein:20,carbs:30,fats:10,fiber:5});
 return v;
}
test('marked macro means use the same confirmed-day denominator without fabricated zero',()=>{
 const v=markedNutrition();const r=diagnoseSnapshotRateReview(v,actor,now);
 assert.equal(r.loggedIntake.proteinG,40);assert.equal(r.loggedIntake.carbsG,60);
 assert.equal(r.loggedIntake.fatsG,20);assert.equal(r.loggedIntake.fiberG,10);
 assert.equal(r.loggedIntake.macroStatus,'logged_values');
});
test('legacy default0 and null make affected nutrient unknown without discarding energy',()=>{
 for(const unknown of [0,null]){
 const v=markedNutrition();v.observation.sources.items.at(-1).fiber=unknown;
 const r=diagnoseSnapshotRateReview(v,actor,now);
 assert.equal(r.loggedIntake.fiberG,null);assert.equal(r.loggedIntake.proteinG,40);
 assert.equal(r.loggedIntake.averageLoggedCaloriesOnConfirmedDays,2500);
 assert.equal(r.loggedIntake.macroStatus,'unknown_values');
 }
});
test('unmarked fields do not become evidence and malformed marked fields block snapshot',()=>{
 const v=markedNutrition();delete v.observation.sources.nutritionFieldsVersion;
 assert.equal(diagnoseSnapshotRateReview(v,actor,now).loggedIntake.proteinG,null);
 for(const bad of [-1,'20',Infinity,undefined]){
 const x=markedNutrition();x.observation.sources.items.at(-1).protein=bad;
 assert.equal(diagnoseSnapshotRateReview(x,actor,now).reason,'observation_invalid');
 }
});

function explicitZeroNutrition(){
 const v=markedNutrition(),sources=v.observation.sources;
 sources.nutritionEvidenceVersion='user-entered-v1';
 sources.items.forEach((i,n)=>Object.assign(i,{id:'20000000-0000-4000-8000-'+String(n+1).padStart(12,'0'),
 nutrition_revision:null,nutrition_evidence:null}));
 const i=sources.items.at(-1);i.protein=0;i.nutrition_revision='30000000-0000-4000-8000-000000000001';
 i.nutrition_evidence={version:'user-entered-v1',ownerId:actor,itemId:i.id,revision:i.nutrition_revision,status:'active',
 declaredFields:['protein'],values:{calories:i.calories,protein:i.protein,carbs:i.carbs,fats:i.fats,fiber:i.fiber}};
 return v;
}
test('explicit current zero contributes to same confirmed-day denominator',()=>{
 const v=explicitZeroNutrition(),r=diagnoseSnapshotRateReview(v,actor,now);
 assert.equal(r.kind,'rate_diagnostic');assert.equal(r.loggedIntake.proteinG,540/14);
 assert.equal(r.recommendation,null);
});
test('evidence marker absent keeps zero unknown and stale evidence fails closed',()=>{
 const v=explicitZeroNutrition();delete v.observation.sources.nutritionEvidenceVersion;
 assert.equal(diagnoseSnapshotRateReview(v,actor,now).loggedIntake.proteinG,null);
 const x=explicitZeroNutrition();x.observation.sources.items.at(-1).nutrition_revision='30000000-0000-4000-8000-000000000002';
 assert.equal(diagnoseSnapshotRateReview(x,actor,now).reason,'observation_invalid');
});

