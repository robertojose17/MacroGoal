/** Separate source-only rate contract. NEVER insert into legacy proposals/anchors. */
import {draftSnapshotAdjustment,preparedRateAnchorReference,preparedRateCurrentGoal,type AcceptedIntakeRateAdjustmentInput} from './snapshotAdjustment.ts';
import {rateReviewRequest,rateReviewEvidence} from './rateReviewEvidence.ts';
import {RATE_TOLERANCE} from './rateAdjustmentDecision.ts';
import {diagnoseSnapshotRateReview} from './snapshotReviewContextParser.ts';
import type {ServerPolicyBinding} from './snapshotReviewOrchestration.ts';
export const RATE_PROPOSAL_RECORD_RELEASE=Object.freeze({enabled:false} as const);
type Obj=Record<string,any>;
const obj=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[0-9a-f]{12}$/i.test(v);
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
/** Canonical sorted-key JSON, no implicit undefined/NaN normalization. */
export function canonicalRateJson(value:unknown):string{
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){if(!Number.isFinite(value))throw Error('non_json_number');return JSON.stringify(value);}
 if(Array.isArray(value))return '['+value.map(canonicalRateJson).join(',')+']';
 if(obj(value)&&Object.getPrototypeOf(value)===Object.prototype)return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalRateJson(value[k])).join(',')+'}';
 throw Error('non_json_value');
}
const same=(a:unknown,b:unknown)=>canonicalRateJson(a)===canonicalRateJson(b);
async function shaText(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function freeze<T>(v:T):T{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
const byteSize=(value:string)=>new TextEncoder().encode(value).byteLength;
const admittedRecords=new WeakSet<object>();
const block=(reason:string)=>({kind:'blocked' as const,reason,actionable:false as const});
export type RateAnchorReference={ownerId:string;version:number;sourceRequestId:string;sourceGoalId:string};
export type RateProposalRecord={version:'rate-proposal-record-v1';id:string;ownerId:string;digest:string;canonicalContent:string;expiresAt:number;payload:Obj};
/** All objects originate in trusted coherent server readers. Their shape does not
 * authenticate provenance. No HTTP wrapper, issuer port or persistence call. */
export async function prepareRateProposalRecord(input:AcceptedIntakeRateAdjustmentInput,snapshot:unknown,reviewRecord:unknown,
 anchorHead:unknown,proposalId:string,policy:ServerPolicyBinding){
 try{
  if(!input||!uuid(proposalId)||!obj(anchorHead)||anchorHead.kind!=='rate_anchor_head'||anchorHead.ownerId!==input.anchor.ownerId||
   !Number.isSafeInteger(anchorHead.version)||anchorHead.version<1||!same(anchorHead.anchor,input.anchor))return block('rate_anchor_head_mismatch');
  const reference=preparedRateAnchorReference(input);
  if(!reference||reference.ownerId!==anchorHead.ownerId||reference.version!==anchorHead.version||reference.sourceRequestId!==anchorHead.sourceRequestId||reference.sourceGoalId!==anchorHead.sourceGoalId||reference.sourceRequestId!==input.anchor.sourceReceipt.requestId||reference.sourceGoalId!==input.anchor.initialGoalId)return block('stored_rate_anchor_required');
  const actor=input.anchor.ownerId,request=rateReviewRequest(snapshot,actor,policy,input.now);
  if(!request||!obj(snapshot)||!obj(snapshot.profile)||!obj(snapshot.policy)||!obj(snapshot.readiness))return block('rate_context_unavailable');
  const review=rateReviewEvidence(request,reviewRecord,input.now);if(!review)return block('rate_review_unavailable');
  const d=diagnoseSnapshotRateReview(snapshot,actor,input.now);if(d.kind==='blocked')return block(d.reason);
  const a=input.anchor,r=input.rateReview,p=snapshot.policy,currentGoal=preparedRateCurrentGoal(input);
  if(!currentGoal)return block('stored_rate_current_goal_required');
  if(!same(snapshot.currentGoal,currentGoal)||snapshot.profile.updatedAt!==a.sourceReceipt.acceptedProfileUpdatedAt||
   request.profileBinding!==a.profileBinding||request.journeyBinding!==a.journeyBinding||
   request.goalId!==currentGoal.id||request.goalRevision!==currentGoal.updated_at||
   r.capturedAt!==request.sourceCapturedAt||r.sourceFingerprint!==request.sourceFingerprint||
   r.observedKgPerWeek!==d.observedRateKgPerWeek||r.targetKgPerWeek!==d.targetRateKgPerWeek||r.coverageSufficient!==true||!same(r.tolerance,RATE_TOLERANCE)||
   r.uncertainty.status!=='reviewed'||r.uncertainty.lowerKgPerWeek!==review.uncertainty.lowerKgPerWeek||r.uncertainty.upperKgPerWeek!==review.uncertainty.upperKgPerWeek||
   r.conversion.model!==review.conversion.model||r.conversion.kcalPerKg!==review.conversion.kcalPerKg)
   return block('rate_proposal_binding_mismatch');
  if(p.enabled!==true||p.reviewed!==true||p.snapshot_contract_reviewed!==true||
   ![['maxStepKcal','max_step_kcal'],['maxStepFraction','max_step_fraction'],['maxNetDeltaKcal','max_cumulative_delta_kcal'],['reviewIntervalDays','min_days_between_acceptances'],['incrementKcal','increment_kcal'],['minIntakeKcal','min_intake_kcal'],['maxIntakeKcal','max_intake_kcal']]
   .every(([key,column])=>input.policy[key as keyof typeof input.policy]===p[column]))return block('rate_policy_binding_mismatch');
  const draft=draftSnapshotAdjustment(input);if(draft.kind!=='draft')return draft;
  if(!input.macroBinding||!input.macroContext)return block('macro_context_required');
  const expiry=Math.min(input.evidence.capturedAt+30000,review.expiresAt,Date.parse(p.expires_at),input.macroContext.review?.expiresAt??NaN);
  if(!Number.isSafeInteger(expiry)||expiry<=input.now)return block('proposal_expired');
  const anchorReference:RateAnchorReference={ownerId:actor,version:anchorHead.version,sourceRequestId:a.sourceReceipt.requestId,sourceGoalId:a.initialGoalId};
  const payload={contract:'explicit-rate-acceptance-v1',engineVersion:'rate-review-14d-v1',anchorReference,
   anchorSnapshot:structuredClone(a),goalSnapshot:structuredClone(snapshot.currentGoal),profileUpdatedAt:snapshot.profile.updatedAt,
   profileBinding:request.profileBinding,journeyBinding:request.journeyBinding,sourceFingerprint:request.sourceFingerprint,sourceCapturedAt:request.sourceCapturedAt,
   windowStart:request.windowStart,windowEndExclusive:request.windowEndExclusive,policyBinding:structuredClone(policy),policySnapshot:structuredClone(p),
   reviewedRate:structuredClone(review),rateArithmetic:structuredClone(r),macroBinding:structuredClone(input.macroBinding),macroEvidence:structuredClone(input.macroContext),
   current:structuredClone(input.current),target:structuredClone(draft.target),allocationMode:draft.allocationMode,deltaKcal:draft.deltaKcal,netDeltaKcal:draft.netDeltaKcal,
   preparedAt:input.now,requiresExplicitAcceptance:true,actionable:false};
  const unsigned={version:'rate-proposal-record-v1' as const,id:proposalId,ownerId:actor,expiresAt:expiry,payload};
  const canonicalContent=canonicalRateJson(unsigned);
  const record:RateProposalRecord=freeze({...unsigned,canonicalContent,digest:await shaText(canonicalContent)});if(byteSize(canonicalRateJson(record))>65536)return block('rate_record_too_large');admittedRecords.add(record);
  return {kind:'rate_record_prepared' as const,actionable:false as const,issuanceAuthorized:false as const,acceptanceAuthorized:false as const,record:freeze(record)};
 }catch{return block('invalid_rate_proposal_input');}
}
/** Integrity-only decoding against a trusted stored digest, never revalidation. */
export async function decodeRateProposalRecord(serialized:string,expected:{ownerId:string;proposalId:string;digest:string},now:number,digestText:(value:string)=>Promise<string>=shaText):Promise<RateProposalRecord|null>{
 try{
  if(typeof serialized!=='string'||byteSize(serialized)>65536||!uuid(expected.ownerId)||!uuid(expected.proposalId)||!hash(expected.digest)||!Number.isSafeInteger(now))return null;
  const r=JSON.parse(serialized);if(!obj(r)||Object.keys(r).sort().join(',')!=='canonicalContent,digest,expiresAt,id,ownerId,payload,version'||r.version!=='rate-proposal-record-v1'||
   r.ownerId!==expected.ownerId||r.id!==expected.proposalId||r.digest!==expected.digest||!Number.isSafeInteger(r.expiresAt)||r.expiresAt<=now||
   !obj(r.payload)||r.payload.contract!=='explicit-rate-acceptance-v1'||r.payload.actionable!==false||r.payload.requiresExplicitAcceptance!==true||
   serialized!==canonicalRateJson(r))return null;
  const {digest,canonicalContent,...unsigned}=r;if(typeof canonicalContent!=='string'||byteSize(canonicalContent)>65536||canonicalContent!==canonicalRateJson(unsigned)||await digestText(canonicalContent)!==digest)return null;const record=freeze(r as RateProposalRecord);admittedRecords.add(record);return record;
 }catch{return null;}
}
export type RateAcceptanceRequest={version:'rate-acceptance-request-v1';ownerId:string;requestId:string;rateProposalId:string;rateProposalDigest:string;anchorReference:RateAnchorReference};
/** Request shape only, not sending, accepting or issuing. Caller presents explicit
 * user acceptance before any future writer can consume this immutable request. */
export function rateAcceptanceRequest(record:RateProposalRecord,requestId:string):RateAcceptanceRequest{
 if(!record||!admittedRecords.has(record)||!uuid(requestId)||record.version!=='rate-proposal-record-v1'||!hash(record.digest)||!obj(record.payload.anchorReference))throw Error('invalid_rate_request');
 return freeze({version:'rate-acceptance-request-v1',ownerId:record.ownerId,requestId,rateProposalId:record.id,rateProposalDigest:record.digest,anchorReference:structuredClone(record.payload.anchorReference)} as RateAcceptanceRequest);
}
/** Rejected receipts bind the entire exact request for idempotent negative replay.
 * Committed receipt/chain support is deliberately NOT invented before its writer. */
export function decodeRejectedRateReceipt(value:unknown,request:RateAcceptanceRequest){
 try{if(!obj(value)||Object.keys(value).sort().join(',')!=='reason,request,status,version'||value.version!=='rate-acceptance-receipt-v1'||value.status!=='rejected'||
 typeof value.reason!=='string'||!value.reason||value.reason.length>128||!same(value.request,request))return null;
 return freeze(structuredClone(value));}catch{return null;}
}
