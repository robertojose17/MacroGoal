/** Versioned adaptive API candidate. Not imported by the live observation entrypoint. */
export type AdaptiveRequest = Readonly<{ ownerId: string; requestId: string; proposalId: string; proposalDigest: string }>;
export type AdaptiveTargets = Readonly<{ calories: number; proteinG: number; carbsG: number; fatsG: number; fiberG: number }>;
export type AdaptiveProposal = Readonly<{
  type: 'persisted_reviewed_proposal'; actionable: true; ownerId: string; id: string; digest: string;
  policyVersion: string; engineVersion: string; expiresAt: string;
  current: AdaptiveTargets; target: AdaptiveTargets; deltaKcal: number; sourceDate: string;
}>;
export type AdaptiveSafety = Readonly<{
  enabled: boolean; policyApproved: boolean; policyVersion: string; engineVersion: string;
  clinicalEligibility: 'verified' | 'unverified'; completeness: 'verified' | 'unverified';
  sourceWriteSerialization: 'verified' | 'unverified';
}>;
export type AdaptiveProgram = Readonly<{
  version: 'adaptive-review-v1'; ownerId: string; premium: boolean; enabled: boolean;
  safety: AdaptiveSafety; proposal: AdaptiveProposal | null; reason: string;
}>;
export type AdaptiveReceipt =
  { version: 'adaptive-receipt-v1'; status: 'not_found' } |
  { version: 'adaptive-receipt-v1'; status: 'rejected'; request: AdaptiveRequest; reason: string } |
  { version: 'adaptive-receipt-v1'; status: 'committed'; request: AdaptiveRequest;
    acceptedGoal: { id: string; updatedAt: string | null }; goalState: 'current' | 'superseded' };

export interface AdaptiveApiDependencies {
  authenticate(token: string): Promise<string | null>;
  program(authorization: string): Promise<AdaptiveProgram>;
  // Database RPCs derive owner from this JWT. No service-key acceptance.
  accept(authorization: string, request: AdaptiveRequest): Promise<AdaptiveReceipt>;
  receipt(authorization: string, request: AdaptiveRequest): Promise<AdaptiveReceipt>;
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function parseAdaptiveRequest(value: unknown, actor: string): AdaptiveRequest | null {
  if (!record(value) || Object.keys(value).sort().join(',') !== 'ownerId,proposalDigest,proposalId,requestId' ||
    value.ownerId !== actor || !uuid(actor) || !uuid(value.requestId) || !uuid(value.proposalId) ||
    typeof value.proposalDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.proposalDigest)) return null;
  return Object.freeze({ownerId:actor,requestId:value.requestId,proposalId:value.proposalId,proposalDigest:value.proposalDigest});
}
function same(a: AdaptiveRequest, b: unknown) {
  const parsed = parseAdaptiveRequest(b,a.ownerId);
  return parsed && Object.keys(a).every(k => a[k as keyof AdaptiveRequest] === parsed[k as keyof AdaptiveRequest]);
}
function validReceipt(value: unknown, request: AdaptiveRequest): value is AdaptiveReceipt {
  if (!record(value) || value.version !== 'adaptive-receipt-v1') return false;
  if (value.status === 'not_found') return Object.keys(value).length === 2;
  if (!same(request,value.request)) return false;
  if (value.status === 'rejected') return typeof value.reason === 'string' && /^[a-z][a-z0-9_]{0,99}$/.test(value.reason);
  if (value.status !== 'committed' || !record(value.acceptedGoal) || !uuid(value.acceptedGoal.id) ||
    !['current','superseded'].includes(String(value.goalState))) return false;
  const updated = value.acceptedGoal.updatedAt;
  return updated === null || (typeof updated === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(updated) && Number.isFinite(Date.parse(updated)));
}
const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Content-Type':'application/json','Cache-Control':'no-store'};
const reply = (status: number, value: unknown) => new Response(JSON.stringify(value),{status,headers});
const safeErrors = new Set(['authentication_required','account_changed','invalid_request','source_error','safety_review_required','request_mismatch']);
export function createAdaptiveApiHandler(deps: AdaptiveApiDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok',{headers});
    if (req.method !== 'POST') return reply(405,{error:'method_not_allowed'});
    const params = new URL(req.url).searchParams;
    if (params.getAll('mode').length !== 1 || params.get('mode') !== 'adaptive-review-v1' || [...params.keys()].some(k => k !== 'mode'))
      return reply(400,{error:'invalid_request'});
    const auth = req.headers.get('authorization') ?? '';
    if (!/^Bearer \S+$/i.test(auth)) return reply(401,{error:'authentication_required'});
    try {
      const actor = await deps.authenticate(auth.slice(7));
      if (!actor || !uuid(actor)) return reply(401,{error:'authentication_required'});
      const text = await req.text();
      if (text.length > 2048) return reply(400,{error:'invalid_request'});
      let body: unknown;
      try { body = JSON.parse(text); } catch { return reply(400,{error:'invalid_request'}); }
      if (!record(body)) return reply(400,{error:'invalid_request'});
      if (body.action === 'program' && Object.keys(body).length === 1) {
        const state = await deps.program(auth);
        if (state.version !== 'adaptive-review-v1' || state.ownerId !== actor ||
          (state.proposal && (!state.premium || !state.enabled || !state.safety.enabled || !state.safety.policyApproved ||
            state.safety.clinicalEligibility !== 'verified' || state.safety.completeness !== 'verified' ||
            state.safety.sourceWriteSerialization !== 'verified' || state.proposal.ownerId !== actor)))
          return reply(503,{error:'source_error'});
        return reply(200,state);
      }
      if (!['accept','receipt'].includes(String(body.action)) || Object.keys(body).sort().join(',') !== 'action,request')
        return reply(400,{error:'invalid_request'});
      const request = parseAdaptiveRequest(body.request,actor);
      if (!request) return reply(400,{error:'invalid_request'});
      // Receipt lookup stays available even when new accepts are disabled. The
      // database owns gate evaluation, idempotency and permanent rejection receipts.
      const result = await (body.action === 'accept' ? deps.accept(auth,request) : deps.receipt(auth,request));
      if (!validReceipt(result,request) ||
        (body.action === 'accept' && result.status === 'not_found')) return reply(503,{error:'source_error'});
      return reply(200,result);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const safe = safeErrors.has(message) ? message : 'source_error';
      return reply(safe === 'authentication_required' ? 401 : safe === 'account_changed' ? 403 :
        ['invalid_request','request_mismatch'].includes(safe) ? 400 : safe === 'safety_review_required' ? 409 : 503,{error:safe});
    }
  };
}
