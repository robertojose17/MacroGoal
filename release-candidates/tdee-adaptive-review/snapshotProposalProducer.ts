/** Inert trusted-server candidate. No application binding or release switch. */
import {draftSnapshotAdjustment, type SnapshotAdjustmentInput} from './snapshotAdjustment.ts';
import {ADAPTIVE_RELEASE_STATE} from './proposal.ts';
import {validatePersistedProposal, type ProposalRecord} from './proposalProducer.ts';
export type SnapshotBinding={
 ownerId:string;proposalId:string;anchorId:string;goalSnapshot:Record<string,unknown>;
 profileUpdatedAt:string;sourceDate:string;today:string;
 policyVersion:string;policyDigest:string;engineVersion:string;policyExpiresAt:string;
 eligibilityDigest:string;eligibilityFingerprint:string;eligibilityExpiresAt:string;
 offerExpiresAt:string;
};
type Prepared={kind:'prepared';actionable:false;record:ProposalRecord}|{kind:'blocked'|'no_change';reason:string};
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const instant=(v:unknown):number=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v)?Date.parse(v):NaN;
const day=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const block=(reason:string):Prepared=>({kind:'blocked',reason});
/** Evidence is supplied by a reviewed server loader, never manufactured here. */
export function prepareSnapshotProposal(input:SnapshotAdjustmentInput,b:SnapshotBinding):Prepared {
 if(!input||!input.current||!input.evidence||!b||!uuid(b.ownerId)||!uuid(b.proposalId)||!uuid(b.anchorId)||
  !hash(b.policyDigest)||!hash(b.eligibilityDigest)||!hash(b.eligibilityFingerprint)||
  (typeof b.policyVersion!=='string'||!b.policyVersion)||(typeof b.engineVersion!=='string'||!b.engineVersion)||!day(b.sourceDate)||!day(b.today)||b.sourceDate>=b.today||
  !Number.isFinite(instant(b.profileUpdatedAt))||instant(b.profileUpdatedAt)>input.now)
  return block('invalid_binding');
 const g=b.goalSnapshot,c=input.current;
 if(!g||typeof g!=='object'||Array.isArray(g)||!uuid(g.id)||g.user_id!==b.ownerId||g.is_active!==true||
  !Number.isFinite(instant(g.updated_at))||instant(g.updated_at)>input.now||
  g.daily_calories!==c.calories||g.protein_g!==c.proteinG||g.carbs_g!==c.carbsG||g.fats_g!==c.fatsG||g.fiber_g!==c.fiberG)
  return block('goal_binding_mismatch');
 if(b.eligibilityFingerprint!==input.evidence.fingerprint)return block('eligibility_binding_mismatch');
 const expiry=Math.min(instant(b.policyExpiresAt),instant(b.eligibilityExpiresAt),instant(b.offerExpiresAt));
 if(!Number.isFinite(expiry)||expiry<=input.now)return block('offer_expired');
 if(input.policy?.reviewed!==true||input.evidence.eligible!==true||input.evidence.modelReviewed!==true||input.anchor?.receiptsVerified!==true)return block('review_required');
 const draft=draftSnapshotAdjustment(input);
 if(draft.kind!=='draft')return draft;
 // Clone the entire exact database goal; never synthesize missing columns.
 return {kind:'prepared',actionable:false,record:{id:b.proposalId,ownerId:b.ownerId,policyVersion:b.policyVersion,anchorId:b.anchorId,
 expiresAt:new Date(expiry).toISOString(),payload:{
 goalId:g.id,goalUpdatedAt:g.updated_at,profileUpdatedAt:b.profileUpdatedAt,goalSnapshot:structuredClone(g),
 sourceFingerprint:draft.sourceFingerprint,sourceCapturedAt:new Date(draft.sourceCapturedAt).toISOString(),
 snapshotSemantics:draft.contract,eligibilityDigest:b.eligibilityDigest,policyDigest:b.policyDigest,engineVersion:b.engineVersion,
 today:b.today,sourceDate:b.sourceDate,current:structuredClone(c),target:structuredClone(draft.target),deltaKcal:draft.deltaKcal}}};
}
export {validatePersistedProposal as validatePersistedSnapshotProposal};
export interface SnapshotProducerDependencies{
 loadReviewedContext(actor:string):Promise<{input:SnapshotAdjustmentInput;binding:SnapshotBinding}|null>;
 persist(record:ProposalRecord):Promise<unknown>;
 now?:()=>number;
}
export function createSnapshotProposalProducer(deps:SnapshotProducerDependencies){
 return async(actor:string)=>{
  if(!uuid(actor))return {reason:'authentication_required',proposal:null};
  // Immutable release OFF. Neither a request parameter nor dependency can enable it.
  if(!ADAPTIVE_RELEASE_STATE.recommendationsEnabled)return {reason:'safety_review_required',proposal:null};
  const source=await deps.loadReviewedContext(actor);
  if(!source||source.binding?.ownerId!==actor)return {reason:'reviewed_context_unavailable',proposal:null};
  const now=(deps.now??Date.now)();
  const prepared=prepareSnapshotProposal({...source.input,now},source.binding);
  if(prepared.kind!=='prepared')return {reason:prepared.reason,proposal:null};
  const value=await deps.persist(structuredClone(prepared.record));
  return {reason:'review_available',proposal:validatePersistedProposal(prepared.record,value,(deps.now??Date.now)())};
 };
}
