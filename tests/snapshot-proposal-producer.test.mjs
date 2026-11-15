/** Reduction-suspension regression changes prepared, not executed: runner blocked. */
import {draftSnapshotAdjustment} from '../release-candidates/tdee-adaptive-review/snapshotAdjustment.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSnapshotProposal,createSnapshotProposalProducer,validatePersistedSnapshotProposal} from '../release-candidates/tdee-adaptive-review/snapshotProposalProducer.ts';
const actor='11111111-1111-4111-8111-111111111111',hash='a'.repeat(64),now=Date.parse('2026-11-14T12:00:00Z');
function syntheticMacro(input,preset='balanced',owner='11111111-1111-4111-8111-111111111111',revision='2026-11-01T00:00:00Z',policyVersion='reviewed',policyDigest='a'.repeat(64)){
 // Synthetic arithmetic evidence only, never a production review or policy.
 const binding={ownerId:owner,goalId:owner,goalRevision:revision,preset,sourceFingerprint:input.evidence.fingerprint,policyVersion,policyDigest};
 input.macroBinding=binding;
 input.macroContext={binding:{...binding},current:input.current,
 review:{status:'reviewed',reviewId:'synthetic-review',reviewedAt:input.now-1000,expiresAt:input.now+600000,ageYears:30,eligibility:'eligible'},
 limits:{proteinMinG:0,proteinMaxG:10000,carbsMinG:0,carbsMaxG:10000,fatsMinG:0,fatsMaxG:10000,fatMinFraction:0,fatMaxFraction:1}};
 return input;
}

function fixture(){
 const input={current:{calories:2000,proteinG:150,carbsG:215,fatsG:60,fiberG:30},anchor:{baselineCapturedAt:now-14*86400000,intake:2000,expenditure:2400,acceptedDelta:0,acceptedCount:0,receiptsVerified:true,lastAcceptedAt:null},observedExpenditure:2500,policy:{reviewed:true,maxStepKcal:200,maxStepFraction:0.1,maxNetDeltaKcal:400,reviewIntervalDays:14,incrementKcal:25,minIntakeKcal:1500,maxIntakeKcal:3000},evidence:{eligible:true,modelReviewed:true,logging:'confirmed',capturedAt:now-1000,fingerprint:hash,stability:'stable',goalDirectionValid:true},now};
 const binding={readinessFingerprint:hash,ownerId:actor,proposalId:actor,anchorId:actor,goalSnapshot:{id:actor,user_id:actor,is_active:true,updated_at:'2026-11-01T00:00:00Z',daily_calories:2000,protein_g:150,carbs_g:215,fats_g:60,fiber_g:30,extra:'preserved'},profileUpdatedAt:'2026-11-01T00:00:00Z',sourceDate:'2026-11-13',today:'2026-11-14',policyVersion:'reviewed',policyDigest:hash,engineVersion:'snapshot1',policyExpiresAt:'2026-11-15T00:00:00Z',eligibilityDigest:hash,eligibilityFingerprint:hash,eligibilityExpiresAt:'2026-11-15T00:00:00Z',offerExpiresAt:'2026-11-14T13:00:00Z'};
 syntheticMacro(input);binding.goalSnapshot.macro_preset='balanced';
 return {input,binding};
}
test('exact payload and independent offer expiry',()=>{const {input,binding}=fixture();const p=prepareSnapshotProposal(input,binding);assert.equal(p.kind,'prepared');assert.equal(p.actionable,false);assert.equal(p.record.payload.snapshotSemantics,'as-of-revalidated-v1');assert.equal(p.record.payload.sourceCapturedAt,new Date(now-1000).toISOString());assert.equal(p.record.payload.goalSnapshot.extra,'preserved');assert.equal(p.record.expiresAt,'2026-11-14T12:04:59.000Z');binding.goalSnapshot.extra='changed';assert.equal(p.record.payload.goalSnapshot.extra,'preserved');});
test('no inferred evidence',()=>{for(const key of ['eligible','modelReviewed']){const {input,binding}=fixture();input.evidence[key]=false;assert.equal(prepareSnapshotProposal(input,binding).kind,'blocked');}for(const logging of ['unknown','heuristic']){const {input,binding}=fixture();input.evidence.logging=logging;assert.equal(prepareSnapshotProposal(input,binding).kind,'blocked');}});
test('binding mismatch blocks',()=>{for(const key of ['user_id','daily_calories','updated_at']){const {input,binding}=fixture();binding.goalSnapshot[key]=null;assert.equal(prepareSnapshotProposal(input,binding).kind,'blocked');}const {input,binding}=fixture();binding.eligibilityFingerprint='b'.repeat(64);assert.equal(prepareSnapshotProposal(input,binding).kind,'blocked');});
test('freshness and expiry blocks',()=>{for(const capture of [now+1,now-30001]){const {input,binding}=fixture();input.evidence.capturedAt=capture;assert.equal(prepareSnapshotProposal(input,binding).kind,'blocked');}for(const key of ['policyExpiresAt','eligibilityExpiresAt','offerExpiresAt','profileUpdatedAt']){const {input,binding}=fixture();binding[key]='bad';assert.equal(prepareSnapshotProposal(input,binding).kind,'blocked');}});
test('producer cannot prepare negative draft without individual deficit review',()=>{const {input,binding}=fixture();input.observedExpenditure=2300;const before=structuredClone({input,binding});const p=prepareSnapshotProposal(input,binding);assert.equal(p.kind,'blocked');assert.equal(p.reason,'individual_deficit_review_required');assert.deepEqual({input,binding},before);});
test('malformed top-level blocks',()=>{assert.equal(prepareSnapshotProposal(null,null).kind,'blocked');const {input,binding}=fixture();binding.goalSnapshot=[];assert.equal(prepareSnapshotProposal(input,binding).kind,'blocked');});
test('OFF never invokes loader or persist',async()=>{let calls=0;const produce=createSnapshotProposalProducer({loadReviewedContext:async()=>{calls++;return fixture();},persist:async()=>{calls++;},now:()=>now});assert.equal((await produce(actor)).reason,'safety_review_required');assert.equal((await produce('bad')).reason,'authentication_required');assert.equal(calls,0);});
test('persisted envelope exact and expiry checked',()=>{const {input,binding}=fixture();const {record}=prepareSnapshotProposal(input,binding);const good={type:'persisted_reviewed_proposal',actionable:true,ownerId:actor,id:actor,digest:hash,policyVersion:record.policyVersion,engineVersion:record.payload.engineVersion,expiresAt:record.expiresAt,current:record.payload.current,target:record.payload.target,deltaKcal:record.payload.deltaKcal,sourceDate:record.payload.sourceDate};assert.equal(validatePersistedSnapshotProposal(record,good,now).id,actor);for(const v of [null,{}, {...good,target:{...good.target,calories:1}},{...good,type:'fake'},{...good,actionable:false}])assert.throws(()=>validatePersistedSnapshotProposal(record,v,now),/source_error/);assert.throws(()=>validatePersistedSnapshotProposal(record,good,Date.parse(record.expiresAt)),/source_error/);});

test('engine refuses truthy non-boolean authorization evidence',()=>{for(const [object,key] of [['policy','reviewed'],['evidence','eligible'],['evidence','modelReviewed'],['evidence','goalDirectionValid'],['anchor','receiptsVerified']])for(const value of ['true','false',1,{},[],null,undefined]){const {input}=fixture();input[object][key]=value;assert.equal(draftSnapshotAdjustment(input).kind,'blocked',object+'.'+key);}});
test('engine refuses coercible fingerprint objects',()=>{const {input}=fixture();input.evidence.fingerprint={toString:()=>hash};assert.equal(draftSnapshotAdjustment(input).kind,'blocked');});
test('SQL issuance lifetime is capture plus five minutes, not preparation plus five minutes',()=>{const {input,binding}=fixture();input.evidence.capturedAt=now-30000;const p=prepareSnapshotProposal(input,binding);assert.equal(p.kind,'prepared');assert.equal(Date.parse(p.record.expiresAt),input.evidence.capturedAt+300000);});
test('malformed timestamps rejected instead of JS calendar normalization',()=>{for(const stamp of ['2026-02-30T00:00:00Z','2026-11-01T24:00:00Z','2026-11-01T00:00:00','2026-11-01T00:00:00.1234567Z']){const {input,binding}=fixture();binding.profileUpdatedAt=stamp;assert.equal(prepareSnapshotProposal(input,binding).kind,'blocked',stamp);}});

test('readiness binding is explicit and preserved for acceptance revalidation',()=>{
 const {input,binding}=fixture();
 assert.equal(prepareSnapshotProposal(input,binding).record.payload.readinessFingerprint,hash);
 for(const value of [undefined,null,'',true,'x'.repeat(64)]){
 binding.readinessFingerprint=value;assert.equal(prepareSnapshotProposal(input,binding).kind,'blocked');
 }
});

test('persisted snapshot payload preserves accepted protein and fiber',()=>{
 for(const observed of [2500]){
 const {input,binding}=fixture();input.observedExpenditure=observed;const p=prepareSnapshotProposal(input,binding);
 assert.equal(p.kind,'prepared');assert.equal(p.record.payload.target.proteinG,150);assert.equal(p.record.payload.target.fiberG,30);
 assert.equal(p.record.payload.target.carbsG,240);
 assert.equal(p.record.payload.target.fatsG,60);
 }
});

test('producer independently binds macro review to real proposal owner and goal',()=>{
 for(const key of ['ownerId','goalId','goalRevision','preset','sourceFingerprint','policyVersion','policyDigest']){
 const {input,binding}=fixture();input.macroBinding[key]='different';input.macroContext.binding[key]='different';
 assert.equal(prepareSnapshotProposal(input,binding).reason,'macro_binding_mismatch');
 }
 const {input,binding}=fixture();delete input.macroBinding;delete input.macroContext;
 assert.equal(prepareSnapshotProposal(input,binding).reason,'macro_context_required');
});

test('offer cannot outlive reviewed macro context',()=>{
 const {input,binding}=fixture();input.macroContext.review.expiresAt=now+10000;
 const p=prepareSnapshotProposal(input,binding);assert.equal(Date.parse(p.record.expiresAt),now+10000);
 input.macroContext.review.expiresAt=NaN;assert.equal(prepareSnapshotProposal(input,binding).reason,'offer_expired');
});

/** Macro binding payload regressions PREPARED, NOT RUN: existing runner remains blocked. */
test('private payload preserves exact reviewed macro inputs independently of later mutation',()=>{
 const {input,binding}=fixture();
 const original=structuredClone(input.macroContext);
 const p=prepareSnapshotProposal(input,binding);
 assert.equal(p.kind,'prepared');
 const evidence=p.record.payload.macroEvidence;
 assert.deepEqual(evidence,{version:'snapshot-macro-context-v1',allocationMode:'smart-preserve-adequate-protein-v1',binding:input.macroBinding,review:original.review,limits:original.limits,choice:null});
 input.macroContext.review.reviewId='changed';
 input.macroContext.limits.proteinMinG=999;
 input.macroBinding.policyDigest='b'.repeat(64);
 assert.equal(evidence.review.reviewId,original.review.reviewId);
 assert.deepEqual(evidence.limits,original.limits);
 assert.equal(evidence.binding.policyDigest,binding.policyDigest);
});
test('custom Smart consent identity is preserved, not manufactured for acceptance',()=>{
 const {input,binding}=fixture();
 binding.goalSnapshot.macro_preset='custom';
 input.macroBinding.preset='custom';input.macroContext.binding.preset='custom';
 input.macroContext.customChoice={mode:'smart',binding:structuredClone(input.macroBinding),consentId:actor,acceptedAt:now-5000};
 const expected=structuredClone(input.macroContext.customChoice);
 const p=prepareSnapshotProposal(input,binding);
 assert.equal(p.kind,'prepared');
 assert.deepEqual(p.record.payload.macroEvidence.choice,expected);
 input.macroContext.customChoice.acceptedAt=now;
 assert.equal(p.record.payload.macroEvidence.choice.acceptedAt,now-5000);
});
test('missing nutritional review cannot become persisted evidence',()=>{
 const {input,binding}=fixture();
 input.macroContext.review=null;
 assert.notEqual(prepareSnapshotProposal(input,binding).kind,'prepared');
});
