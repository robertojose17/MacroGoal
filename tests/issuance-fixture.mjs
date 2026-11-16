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

export {fixture,actor,hash,now,proposalId,policy};
