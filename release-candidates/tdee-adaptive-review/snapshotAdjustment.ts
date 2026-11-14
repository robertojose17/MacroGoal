/**
 * Snapshot-as-of bidirectional engine. Pure, not an active application binding.
 * Thresholds are explicit policy inputs, not clinical assurances.
 */
export type SnapshotTarget={calories:number;proteinG:number;carbsG:number;fatsG:number;fiberG:number};
export type SnapshotAdjustmentInput={
 current:SnapshotTarget;
 anchor:{baselineCapturedAt:number;intake:number;expenditure:number;acceptedDelta:number;acceptedCount:number;receiptsVerified:boolean;lastAcceptedAt:number|null};
 observedExpenditure:number;
 policy:{reviewed:boolean;maxStepKcal:number;maxStepFraction:number;maxNetDeltaKcal:number;
  reviewIntervalDays:number;incrementKcal:number;minIntakeKcal:number;maxIntakeKcal:number};
 evidence:{eligible:boolean;modelReviewed:boolean;logging:'confirmed'|'heuristic'|'unknown';
  capturedAt:number;fingerprint:string;stability:'stable'|'uncertain';goalDirectionValid:boolean};
 now:number;
};
export type SnapshotAdjustmentResult={kind:'blocked'|'no_change';reason:string}|
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
 // Preserve the original accepted energy gap; never subtract another deficit.
 const desired=a.intake+(input.observedExpenditure-a.expenditure);
 const difference=desired-g.calories;
 if(difference===0)return {kind:'no_change',reason:'same_anchored_target'};
 // No server-verified individual total-deficit review contract exists yet.
 // Temporarily suspend every reduction; extra input flags cannot override this.
 if(difference<0)return blocked('individual_deficit_review_required');
 const direction=Math.sign(difference);
 const remaining=direction>0?p.maxNetDeltaKcal-a.acceptedDelta:p.maxNetDeltaKcal+a.acceptedDelta;
 const intakeRoom=direction>0?(p.maxIntakeKcal-g.calories):g.calories-p.minIntakeKcal;
 const magnitude=Math.floor(Math.min(Math.abs(difference),p.maxStepKcal,g.calories*p.maxStepFraction,remaining,intakeRoom)/p.incrementKcal)*p.incrementKcal;
 if(!finite(magnitude)||magnitude<p.incrementKcal)return {kind:'no_change',reason:'policy_limit'};
 const delta=direction*magnitude,calories=g.calories+delta;
 // Preserve the accepted protein/fiber goals exactly. Only carbohydrate/fat
 // energy absorbs the adjustment, retaining their existing energy proportion.
 if(!Number.isInteger(g.proteinG)||!Number.isInteger(g.fiberG))return blocked('fixed_macros_invalid');
 const distributable=4*g.carbsG+9*g.fatsG,residual=calories-4*g.proteinG;
 if(!positive(distributable)||!positive(residual))return blocked('macro_energy_unavailable');
 const scale=residual/distributable;
 const target={calories,proteinG:g.proteinG,carbsG:Math.round(g.carbsG*scale),fatsG:Math.round(g.fatsG*scale),fiberG:g.fiberG};
 if(!Object.values(target).every(n=>Number.isInteger(n)&&n>=0)||Math.abs(calories-4*target.proteinG-4*target.carbsG-9*target.fatsG)>10)return blocked('macro_rounding_invalid');
 return {kind:'draft',actionable:false,target,deltaKcal:delta,netDeltaKcal:a.acceptedDelta+delta,
  sourceFingerprint:e.fingerprint,sourceCapturedAt:e.capturedAt,contract:'as-of-revalidated-v1'};
}
