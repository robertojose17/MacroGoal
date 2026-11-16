/** Synthetic arithmetic fixtures only. No production reviews, policy, access or writes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {adjustSmartMacros as adjust} from '../release-candidates/tdee-adaptive-review/smartMacroAdjustment.ts';
import {draftSnapshotAdjustment} from '../release-candidates/tdee-adaptive-review/snapshotAdjustment.ts';
import {prepareSnapshotProposal,createSnapshotProposalProducer} from '../release-candidates/tdee-adaptive-review/snapshotProposalProducer.ts';
const now=Date.parse('2026-11-14T12:00:00Z'),hash='a'.repeat(64),actor='11111111-1111-4111-8111-111111111111';
function fixture(preset='balanced'){
 const current={calories:2000,proteinG:150,carbsG:215,fatsG:60,fiberG:30};
 const binding={ownerId:actor,goalId:actor,goalRevision:'2026-11-01T00:00:00Z',preset,sourceFingerprint:hash,policyVersion:'synthetic-v1',policyDigest:hash};
 return {current,newCalories:2100,now,sourceFingerprint:hash,binding,context:{binding:{...binding},current:{...current},
 review:{status:'reviewed',reviewId:'synthetic-review',reviewedAt:now-1000,expiresAt:now+600000,ageYears:30,eligibility:'eligible'},
 limits:{proteinMinG:0,proteinMaxG:10000,carbsMinG:0,carbsMaxG:10000,fatsMinG:0,fatsMaxG:10000,fatMinFraction:0,fatMaxFraction:1},
 customChoice:{mode:'preserve_percent',binding:{...binding},consentId:actor,acceptedAt:now-2000,choiceVersion:2,splitBps:{protein:3000,carbs:4000,fats:3000}}}};
}
for(const preset of ['balanced','high_protein','low_carb','lean_body','custom'])test('exact percentages for '+preset,()=>{
 const x=fixture(preset),before=structuredClone(x),r=adjust(x);
 assert.deepEqual(r,{kind:'candidate',actionable:false,requiresAcceptance:true,allocationMode:'manual-percent-nearest-gram-v1',target:{calories:2100,proteinG:158,carbsG:210,fatsG:70,fiberG:30}});
 assert.deepEqual(x,before);assert.notEqual(r.target.proteinG,x.current.proteinG);
});
test('3333/3333/3334 stays exact in source, deterministic integer grams',()=>{
 const x=fixture();x.context.customChoice.splitBps={protein:3333,carbs:3333,fats:3334};const before=structuredClone(x);
 assert.deepEqual(adjust(x).target,{calories:2100,proteinG:175,carbsG:175,fatsG:78,fiberG:30});assert.deepEqual(x,before);
});
test('half grams use half-up and zero requires reviewed limits permitting zero',()=>{
 const x=fixture();x.newCalories=2001;x.context.customChoice.splitBps={protein:10000,carbs:0,fats:0};assert.equal(adjust(x).target.proteinG,500);
 x.newCalories=2002;assert.equal(adjust(x).target.proteinG,501);assert.equal(adjust(x).target.carbsG,0);
 x.context.limits.carbsMinG=1;assert.equal(adjust(x).reason,'manual_percentage_distribution_unavailable');
 x.context.limits.carbsMinG=0;x.context.limits.fatMinFraction=.01;assert.equal(adjust(x).reason,'manual_percentage_distribution_unavailable');
});
test('malformed exact split and persisted version reject',()=>{
 for(const split of [undefined,null,[],{}, {protein:3000,carbs:4000,fats:2999},{protein:3000.5,carbs:3999.5,fats:3000},{protein:-1,carbs:7001,fats:3000},{protein:'3000',carbs:4000,fats:3000},{protein:3000,carbs:4000,fats:3000,extra:0},{protein:NaN,carbs:4000,fats:3000},{protein:10001,carbs:0,fats:-1}]){
 const x=fixture();x.context.customChoice.splitBps=split;assert.equal(adjust(x).reason,'manual_percentage_choice_invalid');
 }
 for(const v of [undefined,0,-1,1.2,'2',NaN,Infinity]){const x=fixture();x.context.customChoice.choiceVersion=v;assert.equal(adjust(x).reason,'manual_percentage_choice_invalid');}
});
test('every supplied bound enforced without clamping, redistribution or Smart fallback',()=>{
 for(const [key,value] of [['proteinMinG',159],['proteinMaxG',157],['carbsMinG',211],['carbsMaxG',209],['fatsMinG',71],['fatsMaxG',69],['fatMinFraction',.301],['fatMaxFraction',.299]]){
 const x=fixture();x.context.limits[key]=value;const before=structuredClone(x);assert.equal(adjust(x).reason,'manual_percentage_distribution_unavailable',key);assert.deepEqual(x,before);
 }
});
test('derived manual protein checked, Smart still requires old protein adequate',()=>{
 const x=fixture();x.context.limits.proteinMinG=155;x.context.limits.proteinMaxG=160;
 assert.equal(adjust(x).kind,'candidate');x.context.customChoice.mode='smart';x.context.customChoice.splitBps=null;
 assert.equal(adjust(x).reason,'protein_review_required');
});
test('existing authentication evidence bindings and reviews cannot be bypassed by manual mode',()=>{
 for(const key of ['ownerId','goalId','goalRevision','preset','sourceFingerprint','policyVersion','policyDigest']){const x=fixture();x.context.customChoice.binding[key]='wrong';assert.equal(adjust(x).reason,'custom_macro_consent_required');}
 for(const patch of [{eligibility:'restricted'},{eligibility:'unknown'},{expiresAt:now},{reviewedAt:now+1},{status:true}]){const x=fixture();Object.assign(x.context.review,patch);assert.equal(adjust(x).reason,'macro_review_required');}
 for(const mode of ['revoked','unknown',undefined]){const x=fixture();x.context.customChoice.mode=mode;assert.equal(adjust(x).reason,'custom_macro_consent_required');}
});
test('bounded arithmetic grid: exact rational oracle, nonnegative integer outputs and energy error <=10',()=>{
 for(const calories of [1,2,17,999,1500,2001,2002,2100,9999,10000])for(let protein=0;protein<=10000;protein+=333)for(const carbs of [0,Math.floor((10000-protein)/2),10000-protein]){
 const x=fixture();x.newCalories=calories;const fats=10000-protein-carbs;x.context.customChoice.splitBps={protein,carbs,fats};const r=adjust(x);
 const round=(bp,den)=>Number((BigInt(calories)*BigInt(bp)+BigInt(den/2))/BigInt(den));
 if(9*round(fats,90000)>calories){assert.equal(r.reason,'manual_percentage_distribution_unavailable');continue;}
 assert.equal(r.kind,'candidate');
 assert.equal(r.target.proteinG,round(protein,40000));assert.equal(r.target.carbsG,round(carbs,40000));assert.equal(r.target.fatsG,round(fats,90000));
 assert.ok(Math.abs(calories-4*r.target.proteinG-4*r.target.carbsG-9*r.target.fatsG)<=10);
 }
});
function engineFixture(){
 const x=fixture();const input={current:x.current,macroBinding:x.binding,macroContext:x.context,
 anchor:{baselineCapturedAt:now-14*86400000,intake:2000,expenditure:2400,acceptedDelta:0,acceptedCount:0,receiptsVerified:true,lastAcceptedAt:null},observedExpenditure:2500,
 policy:{reviewed:true,maxStepKcal:200,maxStepFraction:.1,maxNetDeltaKcal:400,reviewIntervalDays:14,incrementKcal:25,minIntakeKcal:1500,maxIntakeKcal:3000},
 evidence:{eligible:true,modelReviewed:true,logging:'confirmed',capturedAt:now-1000,fingerprint:hash,stability:'stable',goalDirectionValid:true},now};
 const binding={readinessFingerprint:hash,ownerId:actor,proposalId:actor,anchorId:actor,goalSnapshot:{id:actor,user_id:actor,is_active:true,updated_at:x.binding.goalRevision,daily_calories:2000,protein_g:150,carbs_g:215,fats_g:60,fiber_g:30,macro_preset:'balanced'},profileUpdatedAt:x.binding.goalRevision,sourceDate:'2026-11-13',today:'2026-11-14',policyVersion:x.binding.policyVersion,policyDigest:hash,engineVersion:'synthetic-snapshot',policyExpiresAt:'2026-11-15T00:00:00Z',eligibilityDigest:hash,eligibilityFingerprint:hash,eligibilityExpiresAt:'2026-11-15T00:00:00Z',offerExpiresAt:'2026-11-14T13:00:00Z'};
 return {input,binding};
}
test('manual mode propagates draft and cloned proposal evidence, still non-actionable',()=>{
 const {input,binding}=engineFixture();const d=draftSnapshotAdjustment(input);assert.equal(d.kind,'draft');assert.equal(d.allocationMode,'manual-percent-nearest-gram-v1');assert.equal(d.actionable,false);
 const p=prepareSnapshotProposal(input,binding);assert.equal(p.kind,'prepared');assert.equal(p.actionable,false);assert.equal(p.record.payload.macroEvidence.allocationMode,d.allocationMode);assert.deepEqual(p.record.payload.target,d.target);
 assert.deepEqual(p.record.payload.macroEvidence.choice.splitBps,{protein:3000,carbs:4000,fats:3000});input.macroContext.customChoice.splitBps.protein=1;assert.equal(p.record.payload.macroEvidence.choice.splitBps.protein,3000);
});
test('manual preference does not remove reduction suspension or release OFF',async()=>{
 const {input,binding}=engineFixture();input.observedExpenditure=2300;assert.equal(prepareSnapshotProposal(input,binding).reason,'individual_deficit_review_required');
 let calls=0;const produce=createSnapshotProposalProducer({loadReviewedContext:async()=>{calls++;return {input,binding};},persist:async()=>{calls++;}});
 assert.equal((await produce(actor)).reason,'safety_review_required');assert.equal(calls,0);
});
