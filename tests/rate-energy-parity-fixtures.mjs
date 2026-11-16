/** Synthetic arithmetic only; never inserted as operational review/policy rows. */
import {admittedRateInput} from './accepted-rate-adjustment-fixture.mjs';
import {setup} from './rate-storage-fixture.mjs';
import {draftSnapshotAdjustment} from '../release-candidates/tdee-adaptive-review/snapshotAdjustment.ts';
export function energyParityFixtures(){
 const base=()=>{const {input}=setup();input.rateReview={version:'rate-review-14d-v1',sourceFingerprint:input.evidence.fingerprint,capturedAt:input.evidence.capturedAt,coverageSufficient:true,observedKgPerWeek:-.7,targetKgPerWeek:0,uncertainty:{status:'reviewed',lowerKgPerWeek:-.8,upperKgPerWeek:-.6},conversion:{model:'approximate-energy-equivalent-v1',kcalPerKg:7700},tolerance:{absoluteLbPerWeek:.25,relativeFraction:.2}};return input;};
 const definitions=[
 ['positive_capped_step',()=>{}],
 ['small_increment',x=>x.policy.incrementKcal=1],
 ['nondividing_increment',x=>x.policy.incrementKcal=30],
 ['step_cap',x=>x.policy.maxStepKcal=75],
 ['fraction_cap',x=>x.policy.maxStepFraction=.035],
 ['cumulative_cap',x=>x.policy.maxNetDeltaKcal=50],
 ['intake_cap',x=>x.policy.maxIntakeKcal=2050],
 ['below_increment',x=>x.policy.maxStepKcal=10],
 ['missing_increment',x=>delete x.policy.incrementKcal],
 ['null_increment',x=>x.policy.incrementKcal=null],
 ['fractional_increment',x=>x.policy.incrementKcal=2.5],
 ['unreviewed_policy',x=>x.policy.reviewed=false],
 ['unverified_receipts',x=>x.anchor.receiptsVerified=false],
 ['anchor_mismatch',x=>x.anchor.intake+=1],
 ['review_cooldown',x=>x.anchor.baselineCapturedAt=x.now-13*86400000],
 ['future_baseline',x=>x.anchor.baselineCapturedAt=x.now+1],
 ['source_expired',x=>x.now+=30001],
 ['fingerprint_mismatch',x=>x.rateReview.sourceFingerprint='b'.repeat(64)],
 ['coverage_hold',x=>x.rateReview.coverageSufficient=false],
 ['missing_target',x=>x.rateReview.targetKgPerWeek=null],
 ['within_tolerance',x=>{x.rateReview.observedKgPerWeek=-.1;x.rateReview.uncertainty={status:'reviewed',lowerKgPerWeek:-.15,upperKgPerWeek:-.05};}],
 ['absolute_boundary_equal',x=>x.rateReview.observedKgPerWeek=-.25*.45359237],
 ['relative_boundary_equal',x=>{x.rateReview.targetKgPerWeek=-1;x.rateReview.observedKgPerWeek=-1.2;}],
 ['uncertainty_missing',x=>x.rateReview.uncertainty={status:'unverified'}],
 ['interval_invalid',x=>x.rateReview.uncertainty.upperKgPerWeek=-.9],
 ['nearest_edge_uncertain',x=>x.rateReview.uncertainty.upperKgPerWeek=-.05],
 ['conversion_wrong',x=>x.rateReview.conversion.kcalPerKg=7600],
 ['reduction_blocked',x=>{x.rateReview.observedKgPerWeek=.7;x.rateReview.uncertainty={status:'reviewed',lowerKgPerWeek:.6,upperKgPerWeek:.8};}],
 ['tolerance_invalid',x=>x.rateReview.tolerance.relativeFraction=0],
 ];
 const cases=definitions.map(([name,mutate])=>{const input=base();mutate(input);const result=draftSnapshotAdjustment(input);
 const expected={status:result.kind==='draft'?'energy_validated':result.kind,reason:result.kind==='draft'?'rate_energy_matches':result.reason,actionable:false,acceptanceAuthorized:false};
 const proposal=result.kind==='draft'?{deltaKcal:result.deltaKcal,calories:result.target.calories,netDeltaKcal:result.netDeltaKcal}:{deltaKcal:0,calories:0,netDeltaKcal:0};
 if(result.kind==='draft')Object.assign(expected,proposal);else if(result.reevaluateAt!==undefined)expected.reevaluateAt=result.reevaluateAt;
 return {name,input,proposal,expected};});
 for(const [name,mutate] of [['intake_only_rate_anchor',()=>{}],['intake_only_cumulative_cap',x=>x.policy.maxNetDeltaKcal=50],['intake_only_cooldown',x=>x.policy.reviewIntervalDays=100],['intake_only_reduction',x=>{x.rateReview.observedKgPerWeek=.7;x.rateReview.uncertainty={status:'reviewed',lowerKgPerWeek:.6,upperKgPerWeek:.8};}]]){
  const input=admittedRateInput(base());mutate(input);const result=draftSnapshotAdjustment(input);
  const proposal=result.kind==='draft'?{deltaKcal:result.deltaKcal,calories:result.target.calories,netDeltaKcal:result.netDeltaKcal}:{deltaKcal:0,calories:0,netDeltaKcal:0};
  const expected={status:result.kind==='draft'?'energy_validated':result.kind,reason:result.kind==='draft'?'rate_energy_matches':result.reason,actionable:false,acceptanceAuthorized:false};
  if(result.kind==='draft')Object.assign(expected,proposal);else if(result.reevaluateAt!==undefined)expected.reevaluateAt=result.reevaluateAt;
  cases.push({name,input,proposal,expected});
 }
 for(const field of ['deltaKcal','calories','netDeltaKcal']){const c=structuredClone(cases[0]);c.name='tampered_'+field;c.proposal[field]++;c.expected={status:'blocked',reason:'rate_energy_mismatch',actionable:false,acceptanceAuthorized:false};cases.push(c);}
 return cases;
}
