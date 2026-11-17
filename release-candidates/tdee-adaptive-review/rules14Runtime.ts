import {ensureRateAnchor,bootstrapRateAnchorForReview} from './rateAnchorBootstrap.ts';
import {prepareRules14Proposal,decodeRules14Record} from './rules14Proposal.ts';
import {canonicalRateJson} from './rateProposalRecord.ts';
export const RULES14_RELEASE=Object.freeze({enabled:true} as const);
export const RULES14_RPC=Object.freeze({source:'tdee_internal_rules14_source_v1',issue:'tdee_internal_issue_rules14_proposal_v1'});
export type Rules14Ports={rpc(name:string,args:Record<string,unknown>):Promise<unknown>;now():number;newProposalId():string;expectedPolicy?:{version:string;revision:number;digest:string;engineVersion:string}|null};
/** Server service ports only, not client-supplied source. Actual deterministic
 * proposal path, with no calls to human rate/nutrition review-version getters. */
export async function runRules14ForReview(actor:string,p:Rules14Ports){
 const stop=(reason:string,mayHaveWritten=false)=>({reason,proposal:null,mayHaveWritten,engineVersion:'rules14-observed-v2' as const});let writing=false;
 try{
  const raw=await p.rpc(RULES14_RPC.source,{p_owner:actor,p_policy:p.expectedPolicy??null}) as any;
  if(raw?.version==='rules14-source-unavailable-v1'&&raw.ownerId===actor&&raw.reason==='baseline_reconfirmation_required'&&raw.actionable===false&&Object.keys(raw).sort().join(',')==='actionable,ownerId,reason,version')return stop('baseline_reconfirmation_required');
  if(p.expectedPolicy&&(raw?.policy?.version!==p.expectedPolicy.version||raw?.policy?.revision!==p.expectedPolicy.revision||raw?.policy?.digest!==p.expectedPolicy.digest||p.expectedPolicy.engineVersion!=='rules14-observed-v2'))return stop('rules14_policy_changed');
  const r=await prepareRules14Proposal(raw,actor,p.newProposalId(),p.now());
  if(r.kind!=='rules14_record_prepared')return stop(r.reason);
  if(p.now()>=r.record.expiresAt)return stop('source_expired');
  writing=true;const result=await p.rpc(RULES14_RPC.issue,{p_owner:actor,p_record:r.record}) as any;
  if(result?.status==='blocked'&&result.actionable===false)return stop(result.reason??'rules14_not_ready');
  if(result?.status==='already_prepared'&&result.actionable===false)return stop('already_prepared');
  if(result?.status!=='stored'||result.ownerId!==actor||result.digest!==r.record.digest||canonicalRateJson(result.record)!==canonicalRateJson(r.record))return stop('reconciliation_required',true);
  const verified=await decodeRules14Record(result.record,actor,p.now());if(!verified)return stop('reconciliation_required',true);
  return {reason:'review_available',proposal:verified,mayHaveWritten:true,engineVersion:'rules14-observed-v2' as const};
 }catch{return stop(writing?'reconciliation_required':'source_error',writing);}
}
/** Shared production composition for own and service-selected scheduled routes.
 * Only genuine accepted-goal receipts can establish an anchor; bootstrap never
 * invents a historical acceptance or resets an existing accepted window. */
async function afterAnchor(actor:string,p:Rules14Ports,baseline:Awaited<ReturnType<typeof ensureRateAnchor>>){
 if(baseline.status==='blocked')return {reason:baseline.reason,proposal:null,mayHaveWritten:baseline.mayHaveWritten,engineVersion:'rules14-observed-v2' as const};
 if(baseline.status==='stored')return {reason:'calibration_required',proposal:null,mayHaveWritten:true,baselineStatus:'stored' as const,engineVersion:'rules14-observed-v2' as const};
 return runRules14ForReview(actor,p);
}
export async function runRules14WithAnchor(actor:string,p:Rules14Ports){
 return afterAnchor(actor,p,await ensureRateAnchor(actor,p));
}
/** Unmounted test/review seam invokes the real bootstrap with synthetic ports.
 * Runtime composition above keeps the immutable persistence release guard. */
export async function runRules14WithAnchorForReview(actor:string,p:Rules14Ports){
 return afterAnchor(actor,p,await bootstrapRateAnchorForReview(actor,p));
}
export function createInternalRules14Runtime(p:Rules14Ports){return async(owner:string)=>RULES14_RELEASE.enabled?runRules14WithAnchor(owner,p):{reason:'safety_review_required',proposal:null,mayHaveWritten:false};}


