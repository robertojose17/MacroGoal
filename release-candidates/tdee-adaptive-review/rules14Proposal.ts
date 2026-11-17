import {canonicalRateJson} from './rateProposalRecord.ts';
import {decideRules14,type Rules14Policy,type Rules14History} from './rules14Decision.ts';
import {applyRules14Nutrition} from './rules14Nutrition.ts';
import {adjustRules14Macros} from './smartMacroAdjustment.ts';
export type Rules14Record={version:'rules14-proposal-record-v1';id:string;ownerId:string;expiresAt:number;digest:string;canonicalContent:string;payload:Record<string,any>};
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
export async function rules14Digest(text:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
/** Trusted SQL source only. No reviewedRate, reviewId, CI or clinician signature. */
export async function prepareRules14Proposal(source:unknown,actor:string,id:string,now:number){
 const blocked=(reason:string)=>({kind:'blocked' as const,reason,actionable:false as const});
 try{
  const raw=structuredClone(source) as any;
  if(!uuid(actor)||!uuid(id)||!raw||raw.version!=='rules14-source-v1'||raw.ownerId!==actor||!raw.snapshot||!raw.policy||!raw.history)return blocked('rules14_source_unavailable');
  const s=raw.snapshot,p=raw.policy as Rules14Policy,h=raw.history as Rules14History & {anchorSnapshot:Record<string,any>};
  if(canonicalRateJson(s.policy)!==canonicalRateJson(p))return blocked('rules14_policy_mismatch');
  const a=h.anchorSnapshot;
  if(!a||a.contract!=='accepted-intake-rate-anchor-v1'||a.ownerId!==actor||a.initialGoalId!==h.anchorReference?.sourceGoalId||a.sourceReceipt?.requestId!==h.anchorReference?.sourceRequestId||a.acceptedAt!==h.baselineAcceptedAt||a.baselineIntakeKcal!==h.baselineIntakeKcal||a.profileBinding!==s.readiness?.profileBinding||a.journeyBinding!==s.readiness?.journeyBinding)return blocked('rules14_anchor_mismatch');
  if(h.acceptedCount===0&&canonicalRateJson(a.baselineGoalSnapshot)!==canonicalRateJson(h.currentGoal))return blocked('rules14_initial_goal_mismatch');
  const decision=decideRules14(s,actor,h,p,now);if(decision.kind!=='rules14_candidate')return decision;
  const nutrition=applyRules14Nutrition(s,actor,p,raw.choice,now);if(nutrition.kind!=='nutrition_policy_applied')return blocked(nutrition.reason);
  const macro=adjustRules14Macros({current:nutrition.request.current,newCalories:decision.targetCalories,now,sourceFingerprint:decision.sourceFingerprint,binding:nutrition.request.binding,context:nutrition.context});
  if(macro.kind!=='candidate')return blocked(macro.reason);
  const expiresAt=Math.min(decision.sourceCapturedAt+30000,Date.parse(p.expires_at),nutrition.context.policyEvidence.expiresAt);
  if(!Number.isSafeInteger(expiresAt)||expiresAt<=now)return blocked('source_expired');
  const payload={contract:'explicit-rules14-acceptance-v2',engineVersion:'rules14-observed-v2',anchorReference:h.anchorReference,anchorSnapshot:h.anchorSnapshot,
   historyBinding:{acceptedCount:h.acceptedCount,acceptedDeltaKcal:h.acceptedDeltaKcal,lastAcceptedAt:h.lastAcceptedAt,lastReceiptDigest:h.lastReceiptDigest,baselineAcceptedAt:h.baselineAcceptedAt,baselineIntakeKcal:h.baselineIntakeKcal},
   goalSnapshot:s.currentGoal,profileUpdatedAt:s.profile.updatedAt,profileBinding:s.readiness.profileBinding,journeyBinding:s.readiness.journeyBinding,
   sourceFingerprint:decision.sourceFingerprint,sourceCapturedAt:decision.sourceCapturedAt,windowStart:decision.windowStart,windowEndExclusive:decision.windowEndExclusive,
   policyBinding:{version:p.version,revision:p.revision,digest:p.digest,engineVersion:'rules14-observed-v2'},policySnapshot:p,
   decision,profileSupport:s.profileSupport,nutritionEvidence:nutrition.context,nutritionReference:nutrition.reference,qualityNotes:nutrition.qualityNotes,
   current:nutrition.request.current,target:macro.target,allocationMode:macro.allocationMode,deltaKcal:decision.deltaKcal,netDeltaKcal:decision.netDeltaKcal,
   preparedAt:now,requiresExplicitAcceptance:true,actionable:false};
  const unsigned={version:'rules14-proposal-record-v1' as const,id,ownerId:actor,expiresAt,payload},canonicalContent=canonicalRateJson(unsigned);
  const record:Rules14Record={...unsigned,canonicalContent,digest:await rules14Digest(canonicalContent)};
  if(new TextEncoder().encode(canonicalRateJson(record)).byteLength>65536)return blocked('rules14_record_too_large');
  return {kind:'rules14_record_prepared' as const,record,actionable:false as const,acceptanceAuthorized:false as const};
 }catch{return blocked('rules14_input_invalid');}
}
export async function decodeRules14Record(value:unknown,owner:string,now:number,digestText=rules14Digest):Promise<Rules14Record|null>{
 try{
  const r=typeof value==='string'?JSON.parse(value):structuredClone(value);
  if(!r||Object.keys(r).sort().join(',')!=='canonicalContent,digest,expiresAt,id,ownerId,payload,version'||r.version!=='rules14-proposal-record-v1'||!uuid(r.id)||r.ownerId!==owner||!uuid(owner)||!Number.isSafeInteger(now)||!Number.isSafeInteger(r.expiresAt)||r.expiresAt<=now||
   !((r.payload?.contract==='explicit-rules14-acceptance-v1'&&r.payload.engineVersion==='rules14-v1')||(r.payload?.contract==='explicit-rules14-acceptance-v2'&&r.payload.engineVersion==='rules14-observed-v2'))||r.payload.actionable!==false||r.payload.requiresExplicitAcceptance!==true||typeof r.digest!=='string'||!/^[a-f0-9]{64}$/.test(r.digest)||typeof r.canonicalContent!=='string')return null;
  const {digest,canonicalContent,...unsigned}=r;
  if(new TextEncoder().encode(canonicalRateJson(r)).byteLength>65536||canonicalContent!==canonicalRateJson(unsigned)||await digestText(canonicalContent)!==digest)return null;
  return r;
 }catch{return null;}
}
export function rules14AcceptanceRequest(record:Rules14Record,requestId:string){
 if(!record||record.version!=='rules14-proposal-record-v1'||!uuid(requestId))throw Error('rules14_request_invalid');
 return {version:'rules14-acceptance-request-v1',ownerId:record.ownerId,requestId,rateProposalId:record.id,rateProposalDigest:record.digest,anchorReference:structuredClone(record.payload.anchorReference)};
}

