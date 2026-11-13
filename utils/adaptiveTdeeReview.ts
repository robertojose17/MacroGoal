import type { AdaptiveProgram, AdaptiveReceipt, AdaptiveRequest, AdaptiveTargets } from '../release-candidates/tdee-adaptive-review/apiContract';

export const adaptiveReviewRolloutEnabled = () => process.env.EXPO_PUBLIC_TDEE_REVIEW_MODE === 'adaptive-review-v1';
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200;
const timestamp = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)) &&
  new Date(v.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10) === v.slice(0,10);
function targets(v: unknown): AdaptiveTargets {
  if (!record(v) || !['calories','proteinG','carbsG','fatsG','fiberG'].every(k => typeof v[k] === 'number' && Number.isFinite(v[k]) && (v[k] as number) >= 0) ||
      (v.calories as number) <= 0) throw Error('invalid_adaptive_response');
  return {calories:v.calories as number,proteinG:v.proteinG as number,carbsG:v.carbsG as number,fatsG:v.fatsG as number,fiberG:v.fiberG as number};
}
export function parseAdaptiveProgram(value: unknown, owner: string, now = Date.now()): AdaptiveProgram {
  if (!record(value) || value.version !== 'adaptive-review-v1' || value.ownerId !== owner || !uuid(owner) ||
      typeof value.premium !== 'boolean' || typeof value.enabled !== 'boolean' || !text(value.reason) || !record(value.safety)) throw Error('invalid_adaptive_response');
  const s = value.safety;
  if (typeof s.enabled !== 'boolean' || typeof s.policyApproved !== 'boolean' || typeof s.policyVersion !== 'string' || typeof s.engineVersion !== 'string' ||
      !['clinicalEligibility','completeness','sourceWriteSerialization'].every(k => s[k] === 'verified' || s[k] === 'unverified')) throw Error('invalid_adaptive_response');
  let proposal: AdaptiveProgram['proposal'] = null;
  if (value.proposal !== null) {
    const p = value.proposal;
    if (!record(p) || !value.premium || !value.enabled || !s.enabled || !s.policyApproved ||
        s.clinicalEligibility !== 'verified' || s.completeness !== 'verified' || s.sourceWriteSerialization !== 'verified' ||
        p.type !== 'persisted_reviewed_proposal' || p.actionable !== true || p.ownerId !== owner || !uuid(p.id) ||
        typeof p.digest !== 'string' || !/^[a-f0-9]{64}$/.test(p.digest) || !text(p.policyVersion) || !text(p.engineVersion) ||
        p.policyVersion !== s.policyVersion || p.engineVersion !== s.engineVersion || !timestamp(p.expiresAt) ||
        !Number.isFinite(now) || Date.parse(p.expiresAt) <= now || typeof p.sourceDate !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(p.sourceDate) || !timestamp(p.sourceDate+'T00:00:00Z') ||
        typeof p.deltaKcal !== 'number' || !Number.isFinite(p.deltaKcal) || Math.abs(p.deltaKcal) > 200) throw Error('invalid_adaptive_response');
    const current = targets(p.current), target = targets(p.target);
    if (Math.abs((target.calories-current.calories)-p.deltaKcal) > 0.001) throw Error('invalid_adaptive_response');
    proposal = {type:'persisted_reviewed_proposal',actionable:true,ownerId:owner,id:p.id,digest:p.digest,policyVersion:p.policyVersion,
      engineVersion:p.engineVersion,expiresAt:p.expiresAt,current,target,deltaKcal:p.deltaKcal,sourceDate:p.sourceDate};
  }
  return {version:'adaptive-review-v1',ownerId:owner,premium:value.premium,enabled:value.enabled,reason:value.reason,
    safety:{enabled:s.enabled,policyApproved:s.policyApproved,policyVersion:s.policyVersion,engineVersion:s.engineVersion,
      clinicalEligibility:s.clinicalEligibility as 'verified'|'unverified',completeness:s.completeness as 'verified'|'unverified',
      sourceWriteSerialization:s.sourceWriteSerialization as 'verified'|'unverified'},proposal};
}
export function parseAdaptiveReceipt(value: unknown, request: AdaptiveRequest, accepting = false): AdaptiveReceipt {
  if (!record(value) || value.version !== 'adaptive-receipt-v1') throw Error('invalid_adaptive_response');
  if (value.status === 'not_found' && !accepting && Object.keys(value).length === 2) return {version:'adaptive-receipt-v1',status:'not_found'};
  if (!record(value.request) || Object.keys(value.request).length !== 4 || !Object.keys(request).every(k => value.request && (value.request as Record<string,unknown>)[k] === request[k as keyof AdaptiveRequest])) throw Error('adaptive_receipt_mismatch');
  if (value.status === 'rejected' && text(value.reason)) return {version:'adaptive-receipt-v1',status:'rejected',request,reason:value.reason};
  if (value.status !== 'committed' || !record(value.acceptedGoal) || !uuid(value.acceptedGoal.id) ||
      !(value.acceptedGoal.updatedAt === null || timestamp(value.acceptedGoal.updatedAt)) ||
      (value.goalState !== 'current' && value.goalState !== 'superseded')) throw Error('invalid_adaptive_response');
  return {version:'adaptive-receipt-v1',status:'committed',request,acceptedGoal:{id:value.acceptedGoal.id,updatedAt:value.acceptedGoal.updatedAt},goalState:value.goalState};
}
export async function requestAdaptiveReview(input: {
  endpoint: string; apiKey: string; session: {access_token:string;user:{id:string}}; expectedOwner: string;
  action: 'program'|'accept'|'receipt'; request?: AdaptiveRequest;
  signal: AbortSignal; isCurrent: () => boolean; enabled: boolean; fetcher?: typeof fetch;
}): Promise<unknown> {
  if (input.action !== 'receipt' && !input.enabled) throw Error('adaptive_unavailable');
  if (input.signal.aborted || !input.isCurrent() || input.session.user.id !== input.expectedOwner ||
      (input.request && input.request.ownerId !== input.expectedOwner)) throw Error('account_changed');
  if ((input.action === 'program') !== (input.request === undefined)) throw Error('invalid_adaptive_request');
  if (input.request && (!uuid(input.request.ownerId) || !uuid(input.request.requestId) || !uuid(input.request.proposalId) ||
      !/^[a-f0-9]{64}$/.test(input.request.proposalDigest))) throw Error('invalid_adaptive_request');
  const identity = input.request ? {ownerId:input.request.ownerId,requestId:input.request.requestId,
    proposalId:input.request.proposalId,proposalDigest:input.request.proposalDigest} : undefined;
  const response = await (input.fetcher ?? fetch)(input.endpoint+'?mode=adaptive-review-v1',{
    method:'POST',cache:'no-store',signal:input.signal,
    headers:{Authorization:'Bearer '+input.session.access_token,apikey:input.apiKey,'Content-Type':'application/json'},
    body:JSON.stringify({action:input.action,...(identity ? {request:identity} : {})}),
  });
  if (input.signal.aborted || !input.isCurrent()) throw Error('account_changed');
  if (!response.ok) throw Error(response.status === 409 ? 'safety_review_required' : 'adaptive_request_failed');
  const result: unknown = await response.json();
  if (input.signal.aborted || !input.isCurrent()) throw Error('account_changed');
  return result;
}
