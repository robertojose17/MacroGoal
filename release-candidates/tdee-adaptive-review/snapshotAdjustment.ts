import {isInitialRateAnchorCurrent} from './rateAnchorPersistencePlan.ts';
import {prepareAcceptedIntakeRateAnchor,type AcceptedIntakeRateAnchor} from './acceptedIntakeRateAnchor.ts';
import {compareInitialRateToTarget} from './rateAdjustmentDecision.ts';
import {adjustSmartMacros, type MacroAllocationMode, type SmartMacroBinding, type SmartMacroContext} from './smartMacroAdjustment.ts';
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
/** Initial rate-anchor input is ephemeral server-prepared, not deserialized HTTP. */
export type AcceptedIntakeRateAdjustmentInput=Omit<SnapshotAdjustmentInput,'anchor'|'observedExpenditure'|'rateReview'>&{
 anchor:AcceptedIntakeRateAnchor;observedExpenditure?:never;rateReview:NonNullable<SnapshotAdjustmentInput['rateReview']>;
};
export type PersistedRateAnchorReference={ownerId:string;version:number;sourceRequestId:string;sourceGoalId:string};
const admittedRateInputs=new WeakMap<object,{anchor:string;reference?:PersistedRateAnchorReference}>();
/** Source must come from the coherent trusted SQL goal/receipt/profile loader.
 * No source is accepted from HTTP. An arbitrary tagged object is never admitted. */
export function prepareAcceptedIntakeRateAdjustment(source:unknown,actor:string,
 input:Omit<SnapshotAdjustmentInput,'anchor'|'observedExpenditure'|'rateReview'>&{rateReview:NonNullable<SnapshotAdjustmentInput['rateReview']>}){
 if(!input||input.rateReview===undefined)return {kind:'blocked' as const,reason:'rate_review_required'};
 const prepared=prepareAcceptedIntakeRateAnchor(source,actor,input.now);
 if(prepared.kind!=='rate_anchor_draft')return prepared;
 return admitAcceptedRateInput(prepared.anchor,actor,input);
}
function admitAcceptedRateInput(a:AcceptedIntakeRateAnchor,actor:string,input:Omit<SnapshotAdjustmentInput,'anchor'|'observedExpenditure'|'rateReview'>&{rateReview:NonNullable<SnapshotAdjustmentInput['rateReview']>},reference?:PersistedRateAnchorReference){
 const g=a.baselineGoalSnapshot;
 if(!input.current||input.current.calories!==g.daily_calories||input.current.proteinG!==g.protein_g||
 input.current.carbsG!==g.carbs_g||input.current.fatsG!==g.fats_g||input.current.fiberG!==g.fiber_g||
 input.macroBinding?.ownerId!==actor||input.macroBinding?.goalId!==a.initialGoalId||input.macroBinding?.goalRevision!==a.initialGoalRevision)
 return {kind:'blocked' as const,reason:'rate_anchor_binding_mismatch'};
 const value:AcceptedIntakeRateAdjustmentInput={...structuredClone(input),anchor:structuredClone(a)};
 // Copying/serializing a prepared input strips this local admission capability.
 admittedRateInputs.set(value,{anchor:JSON.stringify(value.anchor),reference:reference?structuredClone(reference):undefined});return {kind:'rate_input_prepared' as const,actionable:false as const,input:value};
}
/** Existing anchor verification is distinct from initial creation. No reset or
 * pretend absence: provenance is recomputed only for exact stored-head comparison. */
export function prepareCurrentAcceptedIntakeRateAdjustment(source:unknown,actor:string,
 input:Omit<SnapshotAdjustmentInput,'anchor'|'observedExpenditure'|'rateReview'>&{rateReview:NonNullable<SnapshotAdjustmentInput['rateReview']>},expected:PersistedRateAnchorReference){
 const s=source as {existingAnchor?:{kind?:string;ownerId?:string;version?:number;sourceRequestId?:string;sourceGoalId?:string;anchor?:AcceptedIntakeRateAnchor}}|null,h=s?.existingAnchor;
 if(!input||input.rateReview===undefined||!expected||!h||h.kind!=='rate_anchor_head'||h.ownerId!==actor||expected.ownerId!==actor||
 !Number.isSafeInteger(h.version)||h.version!<1||h.version!==expected.version||!h.anchor||
 h.sourceRequestId!==expected.sourceRequestId||h.sourceGoalId!==expected.sourceGoalId||h.anchor.sourceReceipt?.requestId!==expected.sourceRequestId||h.anchor.initialGoalId!==expected.sourceGoalId||
 !isInitialRateAnchorCurrent(h.anchor,source,actor,input.now))return {kind:'blocked' as const,reason:'stored_rate_anchor_unverified'};
 return admitAcceptedRateInput(h.anchor,actor,input,expected);
}
export function preparedRateAnchorReference(input:AcceptedIntakeRateAdjustmentInput):PersistedRateAnchorReference|null{
 const proof=admittedRateInputs.get(input);return proof?.reference&&proof.anchor===JSON.stringify(input.anchor)?structuredClone(proof.reference):null;
}
export type SnapshotAdjustmentResult={kind:'blocked'|'no_change';reason:string;reevaluateAt?:number}|
 {kind:'draft';actionable:false;allocationMode:MacroAllocationMode;target:SnapshotTarget;deltaKcal:number;netDeltaKcal:number;sourceFingerprint:string;sourceCapturedAt:number;contract:'as-of-revalidated-v1'};
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const positive=(n:unknown):n is number=>finite(n)&&n>0;
const blocked=(reason:string):SnapshotAdjustmentResult=>({kind:'blocked',reason});
export function draftSnapshotAdjustment(input:SnapshotAdjustmentInput|AcceptedIntakeRateAdjustmentInput):SnapshotAdjustmentResult {
 if(!input||!input.current||!input.anchor||!input.policy||!input.evidence||!finite(input.now))return blocked('invalid_input');
 const rateAnchor=typeof input.anchor==='object'&&'contract' in input.anchor&&input.anchor.contract==='accepted-intake-rate-anchor-v1';
 if(rateAnchor&&(admittedRateInputs.get(input)?.anchor!==JSON.stringify(input.anchor)||input.rateReview===undefined||Object.hasOwn(input,'observedExpenditure')))return blocked('rate_anchor_unverified');
 const {current:g,policy:p,evidence:e,now}=input;
 const original=input.anchor;
 const a=rateAnchor?{baselineCapturedAt:(original as AcceptedIntakeRateAnchor).acceptedAt,
 intake:(original as AcceptedIntakeRateAnchor).baselineIntakeKcal,expenditure:undefined,
 acceptedDelta:(original as AcceptedIntakeRateAnchor).acceptedDeltaKcal,acceptedCount:original.acceptedCount,
 receiptsVerified:true,lastAcceptedAt:original.lastAcceptedAt}:original as SnapshotAdjustmentInput['anchor'];
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
 if(!positive(a.intake)||(!rateAnchor&&(!positive(a.expenditure)||!positive(input.observedExpenditure)))||!finite(a.acceptedDelta)||
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
  const legacy=input as SnapshotAdjustmentInput;
  const desired=a.intake+(legacy.observedExpenditure-legacy.anchor.expenditure);
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
 return {kind:'draft',actionable:false,allocationMode:allocation.allocationMode,target,deltaKcal:delta,netDeltaKcal:a.acceptedDelta+delta,
  sourceFingerprint:e.fingerprint,sourceCapturedAt:e.capturedAt,contract:'as-of-revalidated-v1'};
}
