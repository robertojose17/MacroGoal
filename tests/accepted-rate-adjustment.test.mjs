import test from 'node:test';import assert from 'node:assert/strict';
import {energyParityFixtures} from './rate-energy-parity-fixtures.mjs';
import {acceptedRateSource,admittedRateInput} from './accepted-rate-adjustment-fixture.mjs';
import {draftSnapshotAdjustment as draft,prepareAcceptedIntakeRateAdjustment as prepare} from '../release-candidates/tdee-adaptive-review/snapshotAdjustment.ts';
const base=()=>energyParityFixtures()[0].input;
test('server-prepared tagged rate anchor works without either expenditure field',()=>{
 const input=admittedRateInput(base());assert.equal('expenditure'in input.anchor,false);assert.equal('observedExpenditure'in input,false);
 const r=draft(input);assert.equal(r.kind,'draft');assert.equal(r.deltaKcal,200);
});
test('arbitrary or serialized tagged objects do not gain ephemeral preparation authority',()=>{
 const input=admittedRateInput(base());assert.equal(draft(structuredClone(input)).reason,'rate_anchor_unverified');
 input.anchor.baselineIntakeKcal+=1;assert.equal(draft(input).reason,'rate_anchor_unverified');
});
test('tagged input cannot enter legacy branch or smuggle an expenditure estimate',()=>{
 const input=admittedRateInput(base());delete input.rateReview;assert.equal(draft(input).reason,'rate_anchor_unverified');
 const other=admittedRateInput(base());other.observedExpenditure=2400;assert.equal(draft(other).reason,'rate_anchor_unverified');
});
test('untagged legacy expenditure checks unchanged even when a rateReview exists',()=>{
 for(const value of [undefined,null,0,-1,NaN])for(const withRate of [false,true]){
  const input=base();if(!withRate)delete input.rateReview;input.anchor.expenditure=value;assert.equal(draft(input).reason,'anchor_mismatch');
  const second=base();if(!withRate)delete second.rateReview;second.observedExpenditure=value;assert.equal(draft(second).reason,'anchor_mismatch');
 }
});
test('genuine receipt and original accepted goal provenance cannot be replaced',()=>{
 const input=base(),{anchor,observedExpenditure,...rest}=input;
 for(const mutate of [s=>s.receipt.goal_snapshot.daily_calories++,s=>s.receipt.profile_fingerprint='b'.repeat(64),s=>s.existingAnchor={contract:'legacy'},s=>s.receipt.payload.operation='adaptive']){
  const source=acceptedRateSource(input);mutate(source);assert.equal(prepare(source,input.macroBinding.ownerId,rest).kind,'blocked');
 }
});
test('initial cadence cumulative cap and reduction suspension still apply',()=>{
 const input=admittedRateInput(base());input.policy.reviewIntervalDays=100;assert.equal(draft(input).reason,'review_cooldown');
 const capped=admittedRateInput(base());capped.policy.maxNetDeltaKcal=50;assert.equal(draft(capped).deltaKcal,50);
 const reduction=admittedRateInput(base());reduction.rateReview.observedKgPerWeek=.7;reduction.rateReview.uncertainty={status:'reviewed',lowerKgPerWeek:.6,upperKgPerWeek:.8};assert.equal(draft(reduction).reason,'individual_deficit_review_required');
 const modified=admittedRateInput(base());modified.anchor.acceptedCount=1;modified.anchor.acceptedDeltaKcal=25;assert.equal(draft(modified).reason,'rate_anchor_unverified');
});
