/** Trusted snapshot-to-context mapper. No legacy expenditure estimator/defaults. */
import {rateReviewRequest,type StoredRateReview} from './rateReviewEvidence.ts';
import {diagnoseSnapshotRateReview} from './snapshotReviewContextParser.ts';
import {verifySnapshotReceiptChain} from './receiptChain.ts';
import type {ServerPolicyBinding} from './snapshotReviewOrchestration.ts';
import type {SnapshotMacroRequest,SnapshotMacroEvidence} from './snapshotReviewContextParser.ts';
import type {SnapshotAdjustmentInput} from './snapshotAdjustment.ts';
import type {SnapshotBinding} from './snapshotProposalProducer.ts';
import {prepareFourteenDayProposal} from './fourteenDayProposal.ts';
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
export function rateMacroRequest(snapshot:unknown,actor:string,policy:ServerPolicyBinding,now:number):SnapshotMacroRequest|null{
 const r=rateReviewRequest(snapshot,actor,policy,now);
 if(!r||!obj(snapshot)||!obj(snapshot.currentGoal)||!obj(snapshot.profile))return null;
 const g=snapshot.currentGoal,p=snapshot.profile;
 if(!['balanced','high_protein','low_carb','lean_body','custom'].includes(g.macro_preset as string)||typeof p.dateOfBirth!=='string'||!/^\d{4}-\d\d-\d\d$/.test(p.dateOfBirth)||!Number.isFinite(Date.parse(p.dateOfBirth))||new Date(p.dateOfBirth).toISOString().slice(0,10)!==p.dateOfBirth)return null;
 const today=r.windowEndExclusive,dob=p.dateOfBirth;
 const age=Number(today.slice(0,4))-Number(dob.slice(0,4))-(today.slice(5)<dob.slice(5)?1:0);
 if(!Number.isSafeInteger(age)||age<19||age>100)return null;
 const current={calories:g.daily_calories as number,proteinG:g.protein_g as number,carbsG:g.carbs_g as number,fatsG:g.fats_g as number,fiberG:g.fiber_g as number};
 if(!Object.values(current).every(finite))return null;
 return {binding:{ownerId:actor,goalId:r.goalId,goalRevision:r.goalRevision,preset:g.macro_preset as string,sourceFingerprint:r.sourceFingerprint,policyVersion:r.policyVersion,policyDigest:r.policyDigest},
 current,sourceCapturedAt:new Date(r.sourceCapturedAt).toISOString(),profileUpdatedAt:r.profileUpdatedAt,profileBinding:r.profileBinding,journeyBinding:r.journeyBinding,today,ageYears:age};
}
export function buildRateReviewedContext(snapshot:unknown,actor:string,proposalId:string,policy:ServerPolicyBinding,review:StoredRateReview,macro:SnapshotMacroEvidence,now:number){
 const request=rateMacroRequest(snapshot,actor,policy,now);
 if(!request||!obj(snapshot)||!obj(snapshot.policy)||!obj(snapshot.anchor)||!obj(snapshot.eligibility)||!obj(snapshot.readiness)||!obj(snapshot.readiness.eligibility)||!obj(snapshot.currentGoal))return null;
 const diagnostic=diagnoseSnapshotRateReview(snapshot,actor,now);
 if(diagnostic.kind==='blocked'||JSON.stringify(macro?.request)!==JSON.stringify(request))return null;
 const p=snapshot.policy,a=snapshot.anchor,e=snapshot.eligibility,r=snapshot.readiness.eligibility;
 if(p.enabled!==true||p.reviewed!==true||p.snapshot_contract_reviewed!==true||
 e.owner_id!==actor||e.policy_version!==policy.version||e.eligible!==true||e.complete_days_verified!==true||e.source_fingerprint!==request.binding.sourceFingerprint||
 r.current!==true||r.adult!==true||r.response!=='criteria_confirmed'||
 macro?.preferenceStatus!=='current'||!macro.review||!macro.consent||macro.review.review?.ageYears!==request.ageYears)return null;
 // No increment exists in current persisted policy. Missing means unavailable.
 const columns=['max_step_kcal','max_step_fraction','max_cumulative_delta_kcal','min_days_between_acceptances','increment_kcal','min_intake_kcal','max_intake_kcal'];
 if(!columns.every(k=>finite(p[k])&&(p[k] as number)>0))return null;
 let chain;try{chain=verifySnapshotReceiptChain(snapshot.receiptChain);}catch{return null;}
 if(!finite(a.baseline_expenditure_kcal)||a.baseline_expenditure_kcal<=0)return null;
 const input:SnapshotAdjustmentInput={current:request.current,
 anchor:{baselineCapturedAt:Date.parse(a.baseline_captured_at as string),intake:a.baseline_intake_kcal as number,expenditure:a.baseline_expenditure_kcal,...chain},
 // Compatibility slot only. Rate mode overrides the expenditure branch; this is
 // the persisted anchor, NOT a computed/claimed observed expenditure estimate.
 observedExpenditure:a.baseline_expenditure_kcal,
 policy:{reviewed:true,maxStepKcal:p.max_step_kcal as number,maxStepFraction:p.max_step_fraction as number,maxNetDeltaKcal:p.max_cumulative_delta_kcal as number,reviewIntervalDays:p.min_days_between_acceptances as number,incrementKcal:p.increment_kcal as number,minIntakeKcal:p.min_intake_kcal as number,maxIntakeKcal:p.max_intake_kcal as number},
 evidence:{eligible:true,modelReviewed:true,logging:'confirmed',capturedAt:review.sourceCapturedAt,fingerprint:review.sourceFingerprint,stability:'stable',goalDirectionValid:true},
 macroBinding:request.binding,macroContext:{...structuredClone(macro.review),customChoice:structuredClone(macro.consent)},now};
 const binding:SnapshotBinding={ownerId:actor,proposalId,anchorId:a.id as string,goalSnapshot:structuredClone(snapshot.currentGoal),profileUpdatedAt:request.profileUpdatedAt,sourceDate:diagnostic.window.weights.at(-1)!.date,today:request.today,policyVersion:policy.version,policyDigest:policy.digest,engineVersion:policy.engineVersion,policyExpiresAt:p.expires_at as string,eligibilityDigest:e.digest as string,eligibilityFingerprint:e.source_fingerprint as string,eligibilityExpiresAt:e.expires_at as string,offerExpiresAt:new Date(review.expiresAt).toISOString(),readinessFingerprint:snapshot.readinessFingerprint as string};
 // Full bridge revalidates source/goal/receipt/policy/macro binding. Never return
 // a derived context that cannot prepare through the same reviewed contract.
 const checked=prepareFourteenDayProposal(snapshot,actor,input,binding,review);
 return checked.kind==='prepared'?{input,binding,review:structuredClone(review)}:null;
}
