import test from 'node:test';import assert from 'node:assert/strict';
import {chainFixture} from './subsequent-chain-fixture.mjs';
import {setup,actor,hash,now as baseNow} from './rate-storage-fixture.mjs';
import {energyParityFixtures} from './rate-energy-parity-fixtures.mjs';
import {prepareSubsequentAcceptedIntakeRateAdjustment,draftSnapshotAdjustment} from '../release-candidates/tdee-adaptive-review/snapshotAdjustment.ts';
import {prepareRateProposalRecord} from '../release-candidates/tdee-adaptive-review/rateProposalRecord.ts';
import {diagnoseSnapshotRateReview} from '../release-candidates/tdee-adaptive-review/snapshotReviewContextParser.ts';
import {rateReviewRequest} from '../release-candidates/tdee-adaptive-review/rateReviewEvidence.ts';
const day=86400000,policy={version:'p1',digest:hash,engineVersion:'rate-review-14d-v1'};
async function fixture(){
 const {value}=await chainFixture(1),now=value.rows[0].receipt.acceptedAt+14*day,delta=now-baseNow;
 value.capturedAt=now;const g=value.currentGoal,a=value.anchorHead.anchor;
 const shift=v=>typeof v==='number'&&v>1e12?v+delta:typeof v==='string'&&/^\d{4}-\d\d-\d\d(T.*)?$/.test(v)?(v.length===10?new Date(Date.parse(v)+delta).toISOString().slice(0,10):new Date(Date.parse(v)+delta).toISOString()):Array.isArray(v)?v.map(shift):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,shift(x)])):v;
 const s=shift(setup().s),legacy=shift(energyParityFixtures()[0].input),{anchor,observedExpenditure,...input}=legacy;
 s.currentGoal=structuredClone(g);s.observation.context.currentGoal=structuredClone(g);s.profile.updatedAt=a.sourceReceipt.acceptedProfileUpdatedAt;s.profile.journeyStartDate=a.journeyStartDate;s.observation.sources.journeyStartDate=a.journeyStartDate;
 input.current={calories:g.daily_calories,proteinG:g.protein_g,carbsG:g.carbs_g,fatsG:g.fats_g,fiberG:g.fiber_g};
 input.macroBinding.goalId=g.id;input.macroBinding.goalRevision=g.updated_at;input.macroContext.binding=structuredClone(input.macroBinding);input.macroContext.current=structuredClone(input.current);
 const d=diagnoseSnapshotRateReview(s,actor,now);assert.notEqual(d.kind,'blocked',d.reason);input.rateReview.observedKgPerWeek=d.observedRateKgPerWeek;input.rateReview.targetKgPerWeek=d.targetRateKgPerWeek;
 const binding=rateReviewRequest(s,actor,policy,now);assert.ok(binding);
 const review={version:'rate-review-record-v1',actionable:false,decision:'reviewed',reviewId:actor,reviewVersion:1,binding,methodVersion:'synthetic-only',interval:{lowerKgPerWeek:-.8,upperKgPerWeek:-.6},conversion:{model:'approximate-energy-equivalent-v1',kcalPerKg:7700},reviewedAt:new Date(now-500).toISOString(),expiresAt:new Date(now+10000).toISOString(),recordedAt:new Date(now-100).toISOString(),capturedAt:new Date(now).toISOString(),provenance:{approvalRef:'synthetic-not-approved',approvalDigest:hash,approvalVersion:'test-only',verifiedBy:'synthetic-reviewer',verifiedAt:new Date(now-200).toISOString()}};
 const {kind,...reference}=value.anchorHead;delete reference.anchor;return {value,input,s,review,reference,now};
}
const prepare=x=>prepareSubsequentAcceptedIntakeRateAdjustment(x.value,actor,x.input,x.reference);
test('second proposal preserves original anchor and uses verified prior accepted delta',async()=>{const x=await fixture(),p=await prepare(x);assert.equal(p.kind,'rate_input_prepared',p.reason);const d=draftSnapshotAdjustment(p.input);assert.equal(d.kind,'draft',d.reason);assert.equal(d.netDeltaKcal,400);assert.equal(p.input.anchor.acceptedCount,0);const result=await prepareRateProposalRecord(p.input,x.s,x.review,x.value.anchorHead,'99999999-9999-4999-8999-999999999999',policy);assert.equal(result.kind,'rate_record_prepared',result.reason);assert.equal(result.record.payload.goalSnapshot.id,x.value.currentGoal.id);assert.equal(result.record.payload.anchorSnapshot.initialGoalId,x.value.anchorHead.anchor.initialGoalId);});
test('tampered chain, empty fake history, stale source and wrong expected version reject',async()=>{for(const change of [x=>x.value.rows[0].receipt.netDeltaKcal++,x=>{x.value.rows=[];x.value.totalCount=0;},x=>x.value.capturedAt-=30001,x=>x.reference.version++]){const x=await fixture();change(x);assert.equal((await prepare(x)).kind,'blocked');}});
test('subsequent cadence uses last real acceptance, not original anchor age',async()=>{const x=await fixture();x.input.now-=day;x.value.capturedAt=x.input.now;x.input.evidence.capturedAt=x.input.now-1000;x.input.rateReview.capturedAt=x.input.now-1000;const p=await prepare(x);assert.equal(p.kind,'rate_input_prepared');assert.equal(draftSnapshotAdjustment(p.input).reason,'review_cooldown');});
test('serialized admission and mutated current snapshot cannot prepare subsequent proposal',async()=>{const x=await fixture(),p=await prepare(x);assert.equal(draftSnapshotAdjustment(structuredClone(p.input)).reason,'rate_anchor_unverified');x.s.currentGoal.protein_g++;assert.notEqual((await prepareRateProposalRecord(p.input,x.s,x.review,x.value.anchorHead,'99999999-9999-4999-8999-999999999999',policy)).kind,'rate_record_prepared');});
test('cached chain admission cannot extend source freshness when calculation time changes',async()=>{const x=await fixture(),p=await prepare(x);p.input.now+=30001;p.input.evidence.capturedAt=p.input.now;p.input.rateReview.capturedAt=p.input.now;assert.equal(draftSnapshotAdjustment(p.input).reason,'rate_chain_source_expired');});
