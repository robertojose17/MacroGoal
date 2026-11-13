/** Trusted-server producer candidate. No live entrypoint imports this module. */
import { ADAPTIVE_RELEASE_STATE, proposeForProfessionalReview, type DraftContext, type PolicyCandidate } from './proposal.ts';
import type { AdaptiveProposal } from './apiContract.ts';
export type PersistedContextBinding = {
  ownerId: string; proposalId: string; anchorId: string; sourceEpoch: string; sourceRevision: string;
  ownerRevisionDigest: string; goalSnapshot: Record<string, unknown>;
};
export type ProposalRecord = {
  id: string; ownerId: string; policyVersion: string; anchorId: string; expiresAt: string;
  payload: Record<string, unknown>;
};
type Preparation = {kind:'blocked'|'no_change';reason:string} | {kind:'prepared';record:ProposalRecord};
const uuid = (v:unknown):v is string => typeof v==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
/** Pure preparation does not grant reviewed status or make a proposal actionable. */
export function prepareProposalRecord(context: DraftContext, policy: PolicyCandidate, binding: PersistedContextBinding, nowMs: number): Preparation {
  if (!binding || binding.ownerId!==context?.ownerId || !uuid(binding.proposalId) || !uuid(binding.anchorId) || !uuid(binding.sourceEpoch) ||
    !/^(0|[1-9][0-9]*)$/.test(binding.sourceRevision) || BigInt(binding.sourceRevision)>9223372036854775807n ||
    binding.ownerRevisionDigest!==context?.source?.ownerRevision || !binding.goalSnapshot || typeof binding.goalSnapshot!=='object' || Array.isArray(binding.goalSnapshot))
    return {kind:'blocked',reason:'coherent_binding_required'};
  const g=binding.goalSnapshot,c=context.goal;
  if (g.id!==c.id || g.updated_at!==c.updatedAt || g.user_id!==context.ownerId || g.is_active!==true ||
      g.goal_type!==c.kind || g.daily_calories!==c.calories || g.protein_g!==c.proteinG || g.carbs_g!==c.carbsG || g.fats_g!==c.fatsG || g.fiber_g!==c.fiberG)
    return {kind:'blocked',reason:'goal_binding_mismatch'};
  if (policy.maxStepKcal>200) return {kind:'blocked',reason:'product_step_limit'};
  const draft=proposeForProfessionalReview(context,policy,nowMs);
  if(draft.kind!=='engineering_draft') return {kind:draft.kind,reason:draft.reason};
  const expires=Math.min(Date.parse(context.source.capturedAt)+policy.maxEvidenceAgeMs,Date.parse(context.eligibility.expiresAt));
  if(!Number.isFinite(expires)||expires<=nowMs) return {kind:'blocked',reason:'source_expired'};
  return {kind:'prepared',record:{id:binding.proposalId,ownerId:context.ownerId,policyVersion:policy.id,anchorId:binding.anchorId,
    expiresAt:new Date(expires).toISOString(),payload:{
      goalId:c.id,goalUpdatedAt:c.updatedAt,profileUpdatedAt:context.profileUpdatedAt,goalSnapshot:structuredClone(g),
      sourceEpoch:binding.sourceEpoch,sourceRevision:binding.sourceRevision,sourceFingerprint:context.source.fingerprint,
      eligibilityDigest:context.eligibility.digest,policyDigest:policy.digest,engineVersion:policy.modelRevision,
      today:context.source.today,current:{calories:c.calories,proteinG:c.proteinG,carbsG:c.carbsG,fatsG:c.fatsG,fiberG:c.fiberG},
      target:structuredClone(draft.target),deltaKcal:draft.deltaKcal,sourceDate:context.source.asOf,
      explanation:draft.explanation,completenessDigest:context.source.completenessDigest,
    }}};
}
export interface ProposalProducerDependencies {
  // This must be the authenticated actor, never the request body's user ID.
  loadReviewedContext(actor:string):Promise<{context:DraftContext;policy:PolicyCandidate;binding:PersistedContextBinding}|null>;
  // Persists privately and returns the database-issued digest. Must check policy,
  // source/anchor and authority again; no public client-supplied target RPC.
  persist(record:ProposalRecord):Promise<AdaptiveProposal>;
  now?:()=>number;
}
export function createProposalProducer(deps:ProposalProducerDependencies) {
  return async (actor:string):Promise<{reason:string;proposal:AdaptiveProposal|null}>=>{
    if(!uuid(actor)) return {reason:'authentication_required',proposal:null};
    // Deliberately immutable OFF. No request flag or mocked eligibility enables
    // live recommendations. Changing it is a separately reviewed release step.
    if(!ADAPTIVE_RELEASE_STATE.recommendationsEnabled) return {reason:'safety_review_required',proposal:null};
    const source=await deps.loadReviewedContext(actor);
    if(!source || source.context.ownerId!==actor) return {reason:'reviewed_context_unavailable',proposal:null};
    const prepared=prepareProposalRecord(source.context,source.policy,source.binding,(deps.now??Date.now)());
    if(prepared.kind!=='prepared') return {reason:prepared.reason,proposal:null};
    const proposal=await deps.persist(prepared.record);
    if(proposal.ownerId!==actor || proposal.id!==prepared.record.id || proposal.policyVersion!==prepared.record.policyVersion ||
      proposal.engineVersion!==source.policy.modelRevision || Date.parse(proposal.expiresAt)!==Date.parse(prepared.record.expiresAt) || !/^[a-f0-9]{64}$/.test(proposal.digest))
      throw new Error('source_error');
    return {reason:'review_available',proposal};
  };
}
