import {RATE_TOLERANCE} from './rateAdjustmentDecision.ts';
import {verifySnapshotReceiptChain} from './receiptChain.ts';
/** Source-only pure bridge. NOT an HTTP input, evidence loader, or release grant.
 * The caller must supply server-validated review records and a receipt-validated
 * context. Shape checks here do not authenticate reviewers or their conclusions.
 * No default interval, clinical limit, review identity or conversion is supplied.
 */
import {diagnoseSnapshotRateReview} from './snapshotReviewContextParser.ts';
import {prepareSnapshotProposal,type SnapshotBinding} from './snapshotProposalProducer.ts';
import type {SnapshotAdjustmentInput} from './snapshotAdjustment.ts';

export type FourteenDayReview={
 version:'fourteen-day-reviewed-input-v1';
 reviewId:string;methodVersion:string;reviewedAt:number;expiresAt:number;
 ownerId:string;goalId:string;goalRevision:string;profileUpdatedAt:string;journeyBinding:string;
 policyVersion:string;policyDigest:string;sourceFingerprint:string;sourceCapturedAt:number;
 windowStart:string;windowEndExclusive:string;
 uncertainty:{validated:true;stable:true;lowerKgPerWeek:number;upperKgPerWeek:number};
 conversion:{reviewed:true;model:'approximate-energy-equivalent-v1';kcalPerKg:7700};
};
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const hash=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const same=(a:unknown,b:unknown):boolean=>a===b||(obj(a)&&obj(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k])));
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const block=(reason:string)=>({kind:'blocked' as const,actionable:false as const,reason});
/**
 * Prepare only, never persist or apply. Re-evaluation is metadata, not a scheduler.
 * Does not relax the existing reduction suspension or receipt/cadence/macro gates.
 * No fallback to a legacy expenditure delta is possible in this entry point.
 */
export function prepareFourteenDayProposal(
 snapshot:unknown,actor:string,input:SnapshotAdjustmentInput,binding:SnapshotBinding,
 review:FourteenDayReview|null,
){
 if(!input||!binding||!Number.isSafeInteger(input.now))return block('invalid_input');
 const now=input.now,reevaluateAt=now+7*86400000;
 if(Math.abs(now)>8640000000000000||!Number.isSafeInteger(reevaluateAt)||Math.abs(reevaluateAt)>8640000000000000)return block('invalid_time');
 const hold=(reason:string)=>({kind:'no_change' as const,actionable:false as const,reason,reevaluateAt});
 const d=diagnoseSnapshotRateReview(snapshot,actor,now);
 if(d.kind==='blocked')return block(d.reason);
 const capturedAt=Date.parse(d.sourceCapturedAt);
 if(!d.initialCoverage.coverageSufficient)return hold(d.initialCoverage.reason);
 if(d.paceComparison.status!=='comparison')return hold(d.paceComparison.reason);
 if(!d.paceComparison.outsideProductTolerance)return hold('within_product_tolerance');
 // Pair extrema are descriptive only. Do not promote them to a reviewed interval.
 if(!review)return hold('rate_uncertainty_unverified');
 if(!obj(snapshot)||!obj(snapshot.profile)||!obj(snapshot.readiness)||!obj(snapshot.policy)||
  !obj(snapshot.readiness.eligibility)||snapshot.readiness.eligibility.current!==true||
  snapshot.readiness.eligibility.adult!==true||snapshot.readiness.eligibility.response!=='criteria_confirmed')
  return block('reviewed_context_unavailable');
 const p=snapshot.policy;
 if(binding.engineVersion!=='rate-review-14d-v1'||p.engine_version!==binding.engineVersion||
  p.version!==binding.policyVersion||p.digest!==binding.policyDigest||p.enabled!==true||p.reviewed!==true||p.snapshot_contract_reviewed!==true||
  p.expires_at!==binding.policyExpiresAt||binding.ownerId!==actor||
  !same(snapshot.currentGoal,binding.goalSnapshot)||snapshot.profile.updatedAt!==binding.profileUpdatedAt||
  snapshot.readinessFingerprint!==binding.readinessFingerprint||
  binding.today!==d.window.endDateExclusive||binding.sourceDate!==d.window.weights.at(-1)?.date||
  input.evidence?.fingerprint!==d.sourceFingerprint||input.evidence?.capturedAt!==capturedAt)
  return block('fourteen_day_context_binding_mismatch');
 if(!obj(snapshot.anchor)||!obj(snapshot.receiptChain)||snapshot.receiptChain.actor!==actor||
  !same(snapshot.receiptChain.anchor,snapshot.anchor)||!same(snapshot.receiptChain.currentGoal,snapshot.currentGoal)||
  snapshot.anchor.id!==binding.anchorId||snapshot.anchor.policy_version!==binding.policyVersion||
  snapshot.anchor.journey_binding!==snapshot.readiness.journeyBinding)return block('anchor_mismatch');
 let chain;
 try{chain=verifySnapshotReceiptChain(snapshot.receiptChain);}catch{return block('receipt_chain_unverified');}
 if(!input.anchor||input.anchor.baselineCapturedAt!==Date.parse(snapshot.anchor.baseline_captured_at as string)||
  input.anchor.intake!==snapshot.anchor.baseline_intake_kcal||input.anchor.expenditure!==snapshot.anchor.baseline_expenditure_kcal||
  !Object.entries(chain).every(([key,value])=>input.anchor[key as keyof typeof input.anchor]===value))return block('anchor_mismatch');
 // Require the numerical limits already read from the exact reviewed policy.
 if(!input.policy||![['maxStepKcal','max_step_kcal'],['maxStepFraction','max_step_fraction'],
  ['maxNetDeltaKcal','max_cumulative_delta_kcal'],['reviewIntervalDays','min_days_between_acceptances'],
  ['incrementKcal','increment_kcal'],['minIntakeKcal','min_intake_kcal'],['maxIntakeKcal','max_intake_kcal']]
  .every(([key,column])=>input.policy[key as keyof typeof input.policy]===p[column]))return block('rate_policy_binding_mismatch');
 if(review.version!=='fourteen-day-reviewed-input-v1'||typeof review.reviewId!=='string'||!review.reviewId.trim()||
  typeof review.methodVersion!=='string'||!review.methodVersion.trim()||
  !Number.isSafeInteger(review.reviewedAt)||!Number.isSafeInteger(review.expiresAt)||
  review.reviewedAt>now||review.reviewedAt<capturedAt||review.expiresAt<=now||review.expiresAt<=review.reviewedAt||
  review.ownerId!==actor||review.goalId!==d.goalId||review.goalRevision!==d.goalRevision||
  review.profileUpdatedAt!==binding.profileUpdatedAt||!hash(review.journeyBinding)||review.journeyBinding!==snapshot.readiness.journeyBinding||
  review.policyVersion!==binding.policyVersion||review.policyDigest!==binding.policyDigest||
  review.sourceFingerprint!==d.sourceFingerprint||review.sourceCapturedAt!==capturedAt||
  review.windowStart!==d.window.startDate||review.windowEndExclusive!==d.window.endDateExclusive)
  return block('rate_review_binding_mismatch');
 if(!review.uncertainty||review.uncertainty.validated!==true||review.uncertainty.stable!==true)return hold('rate_uncertainty_unverified');
 const {lowerKgPerWeek:lo,upperKgPerWeek:hi}=review.uncertainty;
 if(!finite(lo)||!finite(hi)||lo>hi||!finite(d.observedRateKgPerWeek)||!finite(d.targetRateKgPerWeek)||
  d.observedRateKgPerWeek<lo||d.observedRateKgPerWeek>hi)return block('rate_interval_invalid');
 if(!review.conversion||review.conversion.reviewed!==true||review.conversion.model!=='approximate-energy-equivalent-v1'||review.conversion.kcalPerKg!==7700)
  return block('rate_conversion_review_required');
 const offerExpiry=Date.parse(binding.offerExpiresAt);
 if(!finite(offerExpiry))return block('offer_expired');
 const result=prepareSnapshotProposal({...input,rateReview:{version:'rate-review-14d-v1',
  sourceFingerprint:d.sourceFingerprint,capturedAt:capturedAt,coverageSufficient:true,
  targetKgPerWeek:d.targetRateKgPerWeek,observedKgPerWeek:d.observedRateKgPerWeek,
  uncertainty:{status:'reviewed',lowerKgPerWeek:lo,upperKgPerWeek:hi},
  conversion:{model:review.conversion.model,kcalPerKg:review.conversion.kcalPerKg},
  tolerance:{...RATE_TOLERANCE}}},
  {...binding,offerExpiresAt:new Date(Math.min(offerExpiry,review.expiresAt)).toISOString()});
 if(result.kind!=='prepared')return result;
 // Private audit evidence for future acceptance-time revalidation. Existing SQL
 // does not yet validate this new contract: this artifact MUST NOT be issued live.
 result.record.payload.rateEvidence=structuredClone(review);
 return {...result,requiresAcceptance:true as const};
}
