/** Inert trusted-server candidate. No application binding or release switch. */
import {draftSnapshotAdjustment, type SnapshotAdjustmentInput} from './snapshotAdjustment.ts';
import {ADAPTIVE_RELEASE_STATE} from './proposal.ts';
import {validatePersistedProposal, type ProposalRecord} from './proposalProducer.ts';
export type SnapshotBinding={
 ownerId:string;proposalId:string;anchorId:string;goalSnapshot:Record<string,unknown>;
 profileUpdatedAt:string;sourceDate:string;today:string;
 policyVersion:string;policyDigest:string;engineVersion:string;policyExpiresAt:string;
 eligibilityDigest:string;eligibilityFingerprint:string;eligibilityExpiresAt:string;
 offerExpiresAt:string;readinessFingerprint:string;
};
type Prepared={kind:'prepared';actionable:false;record:ProposalRecord}|{kind:'blocked'|'no_change';reason:string};
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const instant=(v:unknown):number=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(v)&&day(v.slice(0,10))&&Number(v.slice(11,13))<24&&Number(v.slice(14,16))<60&&Number(v.slice(17,19))<60?Date.parse(v):NaN;
const day=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const block=(reason:string):Prepared=>({kind:'blocked',reason});
/** Evidence is supplied by a reviewed server loader, never manufactured here. */
export function prepareSnapshotProposal(input:SnapshotAdjustmentInput,b:SnapshotBinding):Prepared {
 if(!input||!input.current||!input.evidence||!b||!uuid(b.ownerId)||!uuid(b.proposalId)||!uuid(b.anchorId)||
  !hash(b.readinessFingerprint)||!hash(b.policyDigest)||!hash(b.eligibilityDigest)||!hash(b.eligibilityFingerprint)||
  (typeof b.policyVersion!=='string'||!b.policyVersion)||(typeof b.engineVersion!=='string'||!b.engineVersion)||!day(b.sourceDate)||!day(b.today)||b.sourceDate>=b.today||
  !Number.isFinite(instant(b.profileUpdatedAt))||instant(b.profileUpdatedAt)>input.now)
  return block('invalid_binding');
 const g=b.goalSnapshot,c=input.current;
 if(!g||typeof g!=='object'||Array.isArray(g)||!uuid(g.id)||g.user_id!==b.ownerId||g.is_active!==true||
  !Number.isFinite(instant(g.updated_at))||instant(g.updated_at)>input.now||
  g.daily_calories!==c.calories||g.protein_g!==c.proteinG||g.carbs_g!==c.carbsG||g.fats_g!==c.fatsG||g.fiber_g!==c.fiberG)
  return block('goal_binding_mismatch');
 if(b.eligibilityFingerprint!==input.evidence.fingerprint)return block('eligibility_binding_mismatch');
 const expiry=Math.min(input.evidence.capturedAt+300000,instant(b.policyExpiresAt),instant(b.eligibilityExpiresAt),instant(b.offerExpiresAt),input.macroContext?input.macroContext.review?.expiresAt??NaN:Infinity);
 if(!Number.isFinite(expiry)||expiry<=input.now)return block('offer_expired');
 if(input.policy?.reviewed!==true||input.evidence.eligible!==true||input.evidence.modelReviewed!==true||input.anchor?.receiptsVerified!==true)return block('review_required');
 if(input.macroBinding){
  const m=input.macroBinding;
  if(m.ownerId!==b.ownerId||m.goalId!==g.id||m.goalRevision!==g.updated_at||m.preset!==g.macro_preset||
   m.sourceFingerprint!==input.evidence.fingerprint||m.policyVersion!==b.policyVersion||m.policyDigest!==b.policyDigest)
   return block('macro_binding_mismatch');
 }
 const draft=draftSnapshotAdjustment(input);
 if(draft.kind!=='draft')return draft;
 // Persist the exact context that produced the displayed macros. This is a private
 // comparison snapshot, NOT proof of authority or a substitute for acceptance checks.
 // The current trusted loader has review:null and cannot reach this branch.
 if(!input.macroBinding||!input.macroContext)return block('macro_context_required');
 const mc=input.macroContext;
 const macroEvidence={
  version:'snapshot-macro-context-v1',
  binding:structuredClone(input.macroBinding),
  review:structuredClone(mc.review),
  limits:structuredClone(mc.limits),
  choice:mc.customChoice?structuredClone(mc.customChoice):null,
 };
 // Clone the entire exact database goal; never synthesize missing columns.
 return {kind:'prepared',actionable:false,record:{id:b.proposalId,ownerId:b.ownerId,policyVersion:b.policyVersion,anchorId:b.anchorId,
 expiresAt:new Date(expiry).toISOString(),payload:{
 goalId:g.id,goalUpdatedAt:g.updated_at,profileUpdatedAt:b.profileUpdatedAt,goalSnapshot:structuredClone(g),
 sourceFingerprint:draft.sourceFingerprint,sourceCapturedAt:new Date(draft.sourceCapturedAt).toISOString(),
 snapshotSemantics:draft.contract,readinessFingerprint:b.readinessFingerprint,eligibilityDigest:b.eligibilityDigest,policyDigest:b.policyDigest,engineVersion:b.engineVersion,
 macroEvidence,today:b.today,sourceDate:b.sourceDate,current:structuredClone(c),target:structuredClone(draft.target),deltaKcal:draft.deltaKcal}}};
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
