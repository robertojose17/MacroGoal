import {compareInitialRateToTarget} from './rateAdjustmentDecision.ts';
import {adjustSmartMacros, type SmartMacroBinding, type SmartMacroContext} from './smartMacroAdjustment.ts';
/**
 * Snapshot-as-of bidirectional engine. Pure, not an active application binding.
 * Thresholds are explicit policy inputs, not clinical assurances.
 */
export type SnapshotTarget={calories:number;proteinG:number;carbsG:number;fatsG:number;fiberG:number};
export type SnapshotAdjustmentInput={
 current:SnapshotTarget;
 /** Trusted loader only; coverage is not a substitute for uncertainty evidence. */
 rateReview?:{version:'rate-review-14d-v1';sourceFingerprint:string;capturedAt:number;
  coverageSufficient:boolean;targetKgPerWeek:number;observedKgPerWeek:number;
  uncertainty:{status:'unverified'}|{status:'reviewed';lowerKgPerWeek:number;upperKgPerWeek:number};
  conversion:{model:'approximate-energy-equivalent-v1';kcalPerKg:7700};
  tolerance:{absoluteLbPerWeek:number;relativeFraction:number}};
 macroBinding?:SmartMacroBinding;macroContext?:SmartMacroContext;
 anchor:{baselineCapturedAt:number;intake:number;expenditure:number;acceptedDelta:number;acceptedCount:number;receiptsVerified:boolean;lastAcceptedAt:number|null};
 observedExpenditure:number;
 policy:{reviewed:boolean;maxStepKcal:number;maxStepFraction:number;maxNetDeltaKcal:number;
  reviewIntervalDays:number;incrementKcal:number;minIntakeKcal:number;maxIntakeKcal:number};
 evidence:{eligible:boolean;modelReviewed:boolean;logging:'confirmed'|'heuristic'|'unknown';
  capturedAt:number;fingerprint:string;stability:'stable'|'uncertain';goalDirectionValid:boolean};
 now:number;
};
export type SnapshotAdjustmentResult={kind:'blocked'|'no_change';reason:string;reevaluateAt?:number}|
 {kind:'draft';actionable:false;target:SnapshotTarget;deltaKcal:number;netDeltaKcal:number;sourceFingerprint:string;sourceCapturedAt:number;contract:'as-of-revalidated-v1'};
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const positive=(n:unknown):n is number=>finite(n)&&n>0;
const blocked=(reason:string):SnapshotAdjustmentResult=>({kind:'blocked',reason});
export function draftSnapshotAdjustment(input:SnapshotAdjustmentInput):SnapshotAdjustmentResult {
 if(!input||!input.current||!input.anchor||!input.policy||!input.evidence||!finite(input.now))return blocked('invalid_input');
 const {current:g,anchor:a,policy:p,evidence:e,now}=input;
 if(p.reviewed!==true||e.eligible!==true||e.modelReviewed!==true)return blocked('review_required');
 if(e.logging!=='confirmed')return blocked('logging_confirmation_required');
 if(e.stability!=='stable'||e.goalDirectionValid!==true)return blocked('evidence_uncertain');
 if(!finite(e.capturedAt)||e.capturedAt>now||now-e.capturedAt>30000||typeof e.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(e.fingerprint))return blocked('source_expired_or_invalid');
 if(![p.maxStepKcal,p.maxStepFraction,p.reviewIntervalDays,p.incrementKcal,p.minIntakeKcal].every(positive)||
  !positive(p.maxNetDeltaKcal)||!positive(p.maxIntakeKcal)||
  p.maxStepKcal>200||p.maxStepFraction>1||!Number.isInteger(p.reviewIntervalDays)||p.reviewIntervalDays<14||!Number.isInteger(p.incrementKcal)||
  p.maxIntakeKcal<p.minIntakeKcal)return blocked('policy_invalid');
 if(!positive(g.calories)||![g.proteinG,g.carbsG,g.fatsG,g.fiberG].every(n=>finite(n)&&n>=0)||
  Math.abs(g.calories-4*g.proteinG-4*g.carbsG-9*g.fatsG)>10)return blocked('current_target_invalid');
 if(g.calories<p.minIntakeKcal||g.calories>p.maxIntakeKcal)return blocked('current_target_outside_policy');
 if(!positive(a.intake)||!positive(a.expenditure)||!positive(input.observedExpenditure)||!finite(a.acceptedDelta)||
  a.receiptsVerified!==true||!Number.isSafeInteger(a.acceptedCount)||a.acceptedCount<0||a.intake+a.acceptedDelta!==g.calories||Math.abs(a.acceptedDelta)>p.maxNetDeltaKcal)return blocked('anchor_mismatch');
 if(a.lastAcceptedAt!==null&&(!finite(a.lastAcceptedAt)||a.lastAcceptedAt>now))return blocked('acceptance_history_invalid');
 if((a.acceptedCount>0&&a.lastAcceptedAt===null)||(a.acceptedCount===0&&(a.acceptedDelta!==0||a.lastAcceptedAt!==null)))return blocked('acceptance_history_invalid');
 if(!finite(a.baselineCapturedAt)||a.baselineCapturedAt>now)return blocked('baseline_invalid');
 if(now-(a.lastAcceptedAt??a.baselineCapturedAt)<p.reviewIntervalDays*86400000)return blocked('review_cooldown');
 // Rate mode uses an explicitly bound 14-day review, never an additional
 // deficit on top of the accepted target. Legacy callers retain their contract.
 let difference:number;
 if(input.rateReview!==undefined){
  const r=input.rateReview;
  const reevaluateAt=now+7*86400000;
  if(!Number.isSafeInteger(now)||Math.abs(now)>8640000000000000||!Number.isSafeInteger(reevaluateAt)||Math.abs(reevaluateAt)>8640000000000000)return blocked('invalid_time');
  const hold=(reason:string):SnapshotAdjustmentResult=>({kind:'no_change',reason,reevaluateAt});
  if(!r||r.version!=='rate-review-14d-v1'||r.sourceFingerprint!==e.fingerprint||r.capturedAt!==e.capturedAt)
   return blocked('rate_review_binding_mismatch');
  const comparison=compareInitialRateToTarget(r.observedKgPerWeek,r.targetKgPerWeek,r.coverageSufficient,r.tolerance);
  if(comparison.status==='blocked')return blocked(comparison.reason);
  if(comparison.status==='hold')return hold(comparison.reason);
  if(!comparison.outsideProductTolerance)return hold('within_product_tolerance');
  if(!r.uncertainty||r.uncertainty.status!=='reviewed')return hold('rate_uncertainty_unverified');
  const lo=r.uncertainty.lowerKgPerWeek,hi=r.uncertainty.upperKgPerWeek;
  if(!finite(lo)||!finite(hi)||lo>hi||r.observedKgPerWeek<lo||r.observedKgPerWeek>hi)
   return blocked('rate_interval_invalid');
  // The closest supported edge must ALSO exceed both product tolerances.
  const nearest=r.targetKgPerWeek<lo?lo:r.targetKgPerWeek>hi?hi:r.targetKgPerWeek;
  const conservative=compareInitialRateToTarget(nearest,r.targetKgPerWeek,true,r.tolerance);
  if(conservative.status!=='comparison'||!conservative.outsideProductTolerance)
   return hold('rate_difference_uncertain');
  if(!r.conversion||r.conversion.model!=='approximate-energy-equivalent-v1'||r.conversion.kcalPerKg!==7700)
   return blocked('rate_conversion_contract_invalid');
  // Product approximation, not a dynamic physiological model or precision claim.
  difference=(r.targetKgPerWeek-nearest)*r.conversion.kcalPerKg/7;
  if(!finite(difference))return blocked('rate_numeric_range_invalid');
 }else{
  // Preserve the original accepted energy gap; never subtract another deficit.
  const desired=a.intake+(input.observedExpenditure-a.expenditure);
  difference=desired-g.calories;
 }
 if(difference===0)return {kind:'no_change',reason:input.rateReview?'same_rate_target':'same_anchored_target'};
 // No server-verified individual total-deficit review contract exists yet.
 // Temporarily suspend every reduction; extra input flags cannot override this.
 if(difference<0)return blocked('individual_deficit_review_required');
 const direction=Math.sign(difference);
 const remaining=direction>0?p.maxNetDeltaKcal-a.acceptedDelta:p.maxNetDeltaKcal+a.acceptedDelta;
 const intakeRoom=direction>0?(p.maxIntakeKcal-g.calories):g.calories-p.minIntakeKcal;
 const magnitude=Math.floor(Math.min(Math.abs(difference),p.maxStepKcal,g.calories*p.maxStepFraction,remaining,intakeRoom)/p.incrementKcal)*p.incrementKcal;
 if(!finite(magnitude)||magnitude<p.incrementKcal)return {kind:'no_change',reason:'policy_limit'};
 const delta=direction*magnitude,calories=g.calories+delta;
 // Reviewed macro context is required; never fall back to proportional C/F scaling.
 const allocation=adjustSmartMacros({current:g,newCalories:calories,now,sourceFingerprint:e.fingerprint,binding:input.macroBinding,context:input.macroContext});
 if(allocation.kind!=='candidate')return blocked(allocation.reason);
 const target=allocation.target;
 return {kind:'draft',actionable:false,target,deltaKcal:delta,netDeltaKcal:a.acceptedDelta+delta,
  sourceFingerprint:e.fingerprint,sourceCapturedAt:e.capturedAt,contract:'as-of-revalidated-v1'};
}
