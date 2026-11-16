/** Separate server rate route. OFF; never legacy expenditure/anchor fallback. */
import {verifyRateAcceptanceChain} from './rateAcceptanceChain.ts';
import {prepareCurrentAcceptedIntakeRateAdjustment,prepareSubsequentAcceptedIntakeRateAdjustment,type SnapshotAdjustmentInput} from './snapshotAdjustment.ts';
import {prepareRateProposalRecord,decodeRateProposalRecord,canonicalRateJson,type RateProposalRecord} from './rateProposalRecord.ts';
import {rateReviewRequest,rateReviewEvidence} from './rateReviewEvidence.ts';
import {rateMacroRequest} from './rateReviewedContext.ts';
import {nutritionReviewExpected,nutritionReviewEvidence} from './nutritionReviewEvidence.ts';
import {macroPreferenceEvidence} from './snapshotOrchestrationSupabaseAdapter.ts';
import {diagnoseSnapshotRateReview} from './snapshotReviewContextParser.ts';
import {RATE_TOLERANCE} from './rateAdjustmentDecision.ts';
export const RATE_ISSUANCE_RELEASE=Object.freeze({enabled:false} as const);
export const RATE_ISSUANCE_RPC=Object.freeze({source:'tdee_internal_rate_source_v1',rate:'tdee_read_rate_review_v1',nutrition:'tdee_read_nutrition_review_v1',issue:'tdee_internal_issue_rate_proposal_v1'});
type Obj=Record<string,any>;const obj=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const blocked=(reason:string,mayHaveWritten=false)=>({reason,proposal:null,mayHaveWritten});
export type RateIssuancePorts={rpc(name:string,args:Record<string,unknown>):Promise<unknown>;now():number;newProposalId():string;expectedPolicy?:{version:string;digest:string;engineVersion:string}};
/** Review seam: trusted server ports only. Synthetic tests are not live issuance proof. */
export async function runRateIssuanceForReview(actor:string,ports:RateIssuancePorts){
 let writing=false;
 try{
  if(!uuid(actor))return blocked('authentication_required');
  const selected=ports.expectedPolicy;
  if(selected&&(selected.engineVersion!=='rate-review-14d-v1'||typeof selected.version!=='string'||!selected.version||typeof selected.digest!=='string'||!/^[a-f0-9]{64}$/.test(selected.digest)))return blocked('server_policy_required');
  const raw=await ports.rpc(RATE_ISSUANCE_RPC.source,{p_owner:actor,p_policy:selected?structuredClone(selected):null}),now=ports.now();
  if(!obj(raw)||raw.version!=='rate-issuance-source-v1'||raw.ownerId!==actor||!obj(raw.snapshot)||!obj(raw.chain)||!obj(raw.chain.anchorHead))return blocked('rate_source_unavailable');
  const verifiedChain=await verifyRateAcceptanceChain(raw.chain,now);
  if(verifiedChain.anchorReference.ownerId!==actor)return blocked('account_changed');
  const s=raw.snapshot,p=s.policy,h=raw.chain.anchorHead;
  if(!obj(p)||p.enabled!==true||p.reviewed!==true||p.snapshot_contract_reviewed!==true||p.engine_version!=='rate-review-14d-v1')return blocked('server_policy_required');
  const policy={version:p.version,digest:p.digest,engineVersion:p.engine_version};
  if(ports.expectedPolicy&&canonicalRateJson(policy)!==canonicalRateJson(ports.expectedPolicy))return blocked('policy_changed');
  const rr=rateReviewRequest(s,actor,policy,now),mr=rateMacroRequest(s,actor,policy,now),d=diagnoseSnapshotRateReview(s,actor,now);
  if(!rr||!mr||d.kind==='blocked')return blocked('rate_context_unavailable');
  const rateRaw=await ports.rpc(RATE_ISSUANCE_RPC.rate,{p_owner:actor,p_expected:rr});
  const review=rateReviewEvidence(rr,rateRaw,ports.now());if(!review)return blocked('rate_review_unavailable');
  const macro=macroPreferenceEvidence(actor,mr,raw.choice,ports.now());if(macro.preferenceStatus!=='current'||!macro.consent)return blocked('macro_choice_required');
  const nr=await ports.rpc(RATE_ISSUANCE_RPC.nutrition,{p_owner:actor,p_expected:nutritionReviewExpected(mr,policy.engineVersion)});
  macro.review=nutritionReviewEvidence(actor,mr,policy.engineVersion,nr,ports.now());if(!macro.review)return blocked('nutrition_review_required');
  const eligibility=s.readiness?.eligibility;
  if(eligibility?.current!==true||eligibility?.adult!==true||eligibility?.response!=='criteria_confirmed')return blocked('eligibility_required');
  const input:Omit<SnapshotAdjustmentInput,'anchor'|'observedExpenditure'|'rateReview'>&{rateReview:NonNullable<SnapshotAdjustmentInput['rateReview']>}={
   current:mr.current,now:ports.now(),policy:{reviewed:true,maxStepKcal:p.max_step_kcal,maxStepFraction:p.max_step_fraction,maxNetDeltaKcal:p.max_cumulative_delta_kcal,reviewIntervalDays:p.min_days_between_acceptances,incrementKcal:p.increment_kcal,minIntakeKcal:p.min_intake_kcal,maxIntakeKcal:p.max_intake_kcal},
   evidence:{eligible:true,modelReviewed:true,logging:'confirmed',capturedAt:review.sourceCapturedAt,fingerprint:review.sourceFingerprint,stability:'stable',goalDirectionValid:true},
   macroBinding:mr.binding,macroContext:{...macro.review,customChoice:macro.consent},
   rateReview:{version:'rate-review-14d-v1',sourceFingerprint:rr.sourceFingerprint,capturedAt:rr.sourceCapturedAt,coverageSufficient:d.initialCoverage.coverageSufficient,observedKgPerWeek:d.observedRateKgPerWeek!,targetKgPerWeek:d.targetRateKgPerWeek!,tolerance:RATE_TOLERANCE,uncertainty:{status:'reviewed',lowerKgPerWeek:review.uncertainty.lowerKgPerWeek,upperKgPerWeek:review.uncertainty.upperKgPerWeek},conversion:review.conversion}};
  const ref={ownerId:actor,version:h.version,sourceRequestId:h.sourceRequestId,sourceGoalId:h.sourceGoalId};
  const admitted=raw.chain.totalCount===0?prepareCurrentAcceptedIntakeRateAdjustment(raw.initialSource,actor,input,ref):await prepareSubsequentAcceptedIntakeRateAdjustment(raw.chain,actor,input,ref);
  if(admitted.kind!=='rate_input_prepared')return blocked(admitted.reason);
  const prepared=await prepareRateProposalRecord(admitted.input,s,rateRaw,h,ports.newProposalId(),policy);
  if(prepared.kind!=='rate_record_prepared')return blocked(prepared.reason);
  // No blind retry after uncertain insert; exact same generated ID/digest is returned
  // only after trusted persistence returns that very record, never a client echo.
  if(ports.now()>=prepared.record.expiresAt)return blocked('proposal_expired');
  writing=true;const saved=await ports.rpc(RATE_ISSUANCE_RPC.issue,{p_owner:actor,p_record:prepared.record});
  if(obj(saved)&&saved.status==='blocked'&&saved.actionable===false)return blocked(typeof saved.reason==='string'?saved.reason:'rate_issuance_unverified');
  if(obj(saved)&&saved.status==='already_prepared'&&saved.actionable===false)return blocked('already_prepared');
  if(!obj(saved)||saved.status!=='stored'||saved.ownerId!==actor||saved.digest!==prepared.record.digest||canonicalRateJson(saved.record)!==canonicalRateJson(prepared.record))return blocked('reconciliation_required',true);
  const verified=await decodeRateProposalRecord(canonicalRateJson(saved.record),{ownerId:actor,proposalId:prepared.record.id,digest:prepared.record.digest},ports.now());
  if(!verified)return blocked('reconciliation_required',true);
  return {reason:'review_available',proposal:verified as RateProposalRecord,mayHaveWritten:true};
 }catch{return blocked(writing?'reconciliation_required':'source_error',writing);}
}
/** Internal principal authenticated by existing worker gateway/key check. No user JWT. */
export function createInternalRateIssuance(ports:RateIssuancePorts){return async(actor:string)=>{
 if(!RATE_ISSUANCE_RELEASE.enabled)return blocked('safety_review_required');
 return runRateIssuanceForReview(actor,ports);
};}
