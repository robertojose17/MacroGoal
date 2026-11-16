import test from 'node:test';import assert from 'node:assert/strict';
import {setup,actor,hash,now} from './rate-storage-fixture.mjs';
import {energyParityFixtures} from './rate-energy-parity-fixtures.mjs';
import {acceptedRateSource} from './accepted-rate-adjustment-fixture.mjs';
import {prepareAcceptedIntakeRateAnchor} from '../release-candidates/tdee-adaptive-review/acceptedIntakeRateAnchor.ts';
import {prepareCurrentAcceptedIntakeRateAdjustment,prepareAcceptedIntakeRateAdjustment} from '../release-candidates/tdee-adaptive-review/snapshotAdjustment.ts';
import {diagnoseSnapshotRateReview} from '../release-candidates/tdee-adaptive-review/snapshotReviewContextParser.ts';
import {rateReviewRequest} from '../release-candidates/tdee-adaptive-review/rateReviewEvidence.ts';
import {prepareRateProposalRecord,canonicalRateJson,decodeRateProposalRecord,rateAcceptanceRequest,decodeRejectedRateReceipt,RATE_PROPOSAL_RECORD_RELEASE} from '../release-candidates/tdee-adaptive-review/rateProposalRecord.ts';
const policy={version:'p1',digest:hash,engineVersion:'rate-review-14d-v1'},proposalId='33333333-3333-4333-8333-333333333333',requestId='44444444-4444-4444-8444-444444444444';
function fixture(){
 const legacy=energyParityFixtures()[0].input,source=acceptedRateSource(legacy),{anchor,observedExpenditure,...rest}=legacy;
 const built=prepareAcceptedIntakeRateAnchor(source,actor,now);assert.equal(built.kind,'rate_anchor_draft');
 const reference={ownerId:actor,version:1,sourceRequestId:built.anchor.sourceReceipt.requestId,sourceGoalId:built.anchor.initialGoalId};
 const head={kind:'rate_anchor_head',...reference,anchor:built.anchor};source.existingAnchor=head;
 const s=setup().s;s.currentGoal=structuredClone(source.currentGoal);s.observation.context.currentGoal=structuredClone(s.currentGoal);
 s.profile.updatedAt=source.currentProfile.updated_at;s.profile.journeyStartDate=source.currentProfile.journey_start_date;s.observation.sources.journeyStartDate=s.profile.journeyStartDate;
 const d=diagnoseSnapshotRateReview(s,actor,now);assert.notEqual(d.kind,'blocked');rest.rateReview.observedKgPerWeek=d.observedRateKgPerWeek;rest.rateReview.targetKgPerWeek=d.targetRateKgPerWeek;
 const prepared=prepareCurrentAcceptedIntakeRateAdjustment(source,actor,rest,reference);assert.equal(prepared.kind,'rate_input_prepared');
 const expected=rateReviewRequest(s,actor,policy,now);assert.ok(expected);
 const reviewRecord={version:'rate-review-record-v1',actionable:false,decision:'reviewed',reviewId:actor,reviewVersion:1,binding:expected,methodVersion:'synthetic-only',interval:{lowerKgPerWeek:-.8,upperKgPerWeek:-.6},conversion:{model:'approximate-energy-equivalent-v1',kcalPerKg:7700},reviewedAt:new Date(now-500).toISOString(),expiresAt:new Date(now+10000).toISOString(),recordedAt:new Date(now-100).toISOString(),capturedAt:new Date(now).toISOString(),provenance:{approvalRef:'synthetic-not-approved',approvalDigest:hash,approvalVersion:'test-only',verifiedBy:'synthetic-reviewer',verifiedAt:new Date(now-200).toISOString()}};
 return {input:prepared.input,source,rest,head,reference,s,reviewRecord};
}
const build=x=>prepareRateProposalRecord(x.input,x.s,x.reviewRecord,x.head,proposalId,policy);
test('separate immutable proposal uses actual stored owner/version/receipt/goal reference, no legacyanchorId',async()=>{
 const x=fixture(),result=await build(x);assert.equal(result.kind,'rate_record_prepared',JSON.stringify(result));
 assert.deepEqual(result.record.payload.anchorReference,x.reference);assert.equal(result.acceptanceAuthorized,false);assert.equal(result.issuanceAuthorized,false);assert.ok(Object.isFrozen(result.record.payload.target));
 assert.equal('anchorId'in result.record,false);assert.equal('anchorId'in result.record.payload,false);assert.doesNotMatch(JSON.stringify(result.record),/baseline_expenditure|observedExpenditure/);
 assert.equal(RATE_PROPOSAL_RECORD_RELEASE.enabled,false);
});
test('canonical serialization digest stable under key order and rejects mutation or wrong trusted digest',async()=>{
 const x=fixture(),a=await build(x),b=await build(x);assert.equal(a.record.digest,b.record.digest);
 const serialized=canonicalRateJson(a.record),expected={ownerId:actor,proposalId,digest:a.record.digest};
 assert.ok(await decodeRateProposalRecord(serialized,expected,now));
 const changed=JSON.parse(serialized);changed.payload.target.calories++;assert.equal(await decodeRateProposalRecord(canonicalRateJson(changed),expected,now),null);
 assert.equal(await decodeRateProposalRecord(serialized,{...expected,digest:'b'.repeat(64)},now),null);
 assert.equal(await decodeRateProposalRecord(serialized,expected,a.record.expiresAt),null);
 assert.equal(canonicalRateJson({b:2,a:1}),canonicalRateJson({a:1,b:2}));assert.throws(()=>canonicalRateJson({bad:NaN}));
});
test('stored-head source receipts version and provenance must all match current admission',async()=>{
 for(const mutate of [x=>x.head.version++,x=>x.head.sourceRequestId=requestId,x=>x.head.sourceGoalId=proposalId,x=>x.head.ownerId=requestId,x=>x.head.anchor.sourceReceipt.requestId=requestId]){
  const x=fixture();mutate(x);assert.notEqual((await build(x)).kind,'rate_record_prepared');
 }
 const x=fixture(),draftSource={...x.source,existingAnchor:null},initial=prepareAcceptedIntakeRateAdjustment(draftSource,actor,x.rest);assert.equal(initial.kind,'rate_input_prepared');x.input=initial.input;
 assert.equal((await build(x)).reason,'stored_rate_anchor_required');
});
test('changed source review policy goal or arithmetic cannot serialize a proposal',async()=>{
 for(const mutate of [x=>x.s.observation.sourceFingerprint='b'.repeat(64),x=>x.s.currentGoal.updated_at=new Date(now).toISOString(),x=>x.reviewRecord.interval.upperKgPerWeek=-.5,x=>x.reviewRecord.binding.policyDigest='b'.repeat(64),x=>x.reviewRecord.decision='revoked',x=>x.s.policy.increment_kcal=30,x=>x.input.rateReview.observedKgPerWeek=-.9,x=>x.input.rateReview.tolerance.absoluteLbPerWeek=.01]){
  const x=fixture();mutate(x);assert.notEqual((await build(x)).kind,'rate_record_prepared');
 }
});
test('current anchor preparation never pretends persisted head absent or resets changed profile',()=>{
 const x=fixture();assert.equal(prepareAcceptedIntakeRateAdjustment(x.source,actor,x.rest).kind,'blocked');
 for(const change of [{...x.reference,version:2},{...x.reference,sourceRequestId:requestId}])assert.equal(prepareCurrentAcceptedIntakeRateAdjustment(x.source,actor,x.rest,change).kind,'blocked');
 x.source.currentProfileFingerprint='b'.repeat(64);assert.equal(prepareCurrentAcceptedIntakeRateAdjustment(x.source,actor,x.rest,x.reference).kind,'blocked');
});
test('explicit acceptance request and rejected receipt bind entire exact immutable request',async()=>{
 const {record}=await build(fixture()),request=rateAcceptanceRequest(record,requestId),receipt={version:'rate-acceptance-receipt-v1',status:'rejected',reason:'rate_acceptance_contract_unavailable',request};
 assert.throws(()=>rateAcceptanceRequest(structuredClone(record),requestId),/invalid_rate_request/);assert.ok(Object.isFrozen(request.anchorReference));assert.ok(decodeRejectedRateReceipt(receipt,request));
 assert.equal(decodeRejectedRateReceipt({...receipt,request:{...request,rateProposalDigest:'b'.repeat(64)}},request),null);
 assert.equal(decodeRejectedRateReceipt({...receipt,status:'committed'},request),null);
});
