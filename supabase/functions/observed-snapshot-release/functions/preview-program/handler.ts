import { estimateFromSources, todayInZone, type DataSources } from '../dynamic-tdee/data.ts';
import { emptyTdee, type DynamicTdeeResult } from '../_shared/dynamic-tdee.ts';
import { previewHeaders } from '../progress-intelligence/dispatcher.ts';

export interface PreviewGoal {
  id: string; daily_calories: number; protein_g: number; carbs_g: number; fats_g: number; fiber_g: number;
  macro_preset: string | null; goal_type?: string; loss_rate_lbs_per_week?: number | null;
}
export interface PreviewContext {
  ownerId: string; premium: boolean; enabled: boolean; reviewDay: number; today: string;
  nextReviewDate: string; reviewDue: boolean; currentGoal: PreviewGoal | null;
  fingerprint: string; proposal: null; safety: { enabled: false; eligibility: 'unverified' };
}
export interface PreviewDependencies {
  authenticate: (token: string) => Promise<string | null>;
  context: (authorization: string) => Promise<PreviewContext>;
  read: (owner: string, authorization: string, now: Date) => Promise<DataSources>;
  settings: (authorization: string, enabled: boolean, day: number) => Promise<PreviewContext>;
  now?: () => Date;
}
const knownErrors = new Set(['authentication_required','preview_access_denied','premium_required','invalid_request','profile_unavailable']);
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: previewHeaders });
const markedEstimate = (estimate: DynamicTdeeResult) => ({ ...estimate, previewOnly: true, previewVersion: 'private-qa-v1' });
function view(context: PreviewContext, estimate: DynamicTdeeResult | null) {
  return {
    version: 'dynamic-program-v1', previewOnly: true, previewVersion: 'private-qa-v1', premium: context.premium, enabled: context.enabled,
    reviewDay: context.reviewDay, today: context.today, nextReviewDate: context.nextReviewDate,
    reviewDue: false, currentGoal: context.currentGoal, estimate: estimate ? markedEstimate(estimate) : null,
    reason: !context.premium ? 'premium_required' : !context.enabled ? 'disabled' : 'safety_review_required',
    proposal: null, reviewPeriod: null,
  };
}
function assertOwner(context: PreviewContext, owner: string) {
  if (!context || context.ownerId !== owner || context.safety?.enabled !== false ||
      context.safety?.eligibility !== 'unverified' || context.proposal !== null) throw new Error('preview_access_denied');
}
export function createPreviewHandler(deps: PreviewDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: previewHeaders });
    if (!['GET','POST'].includes(req.method)) return reply(405, { error: 'method_not_allowed' });
    const params = new URL(req.url).searchParams;
    const requestedView = params.get('view') ?? 'program';
    if (params.getAll('view').length > 1 || !['program','estimate'].includes(requestedView) ||
      [...params.keys()].some(k => !['mode','view'].includes(k))) return reply(400, { error: 'invalid_request' });
    if (req.method === 'POST' && requestedView === 'estimate') return reply(405, { error: 'method_not_allowed' });
    const authorization = req.headers.get('authorization') ?? '';
    if (!/^Bearer \S+$/i.test(authorization)) return reply(401, { error: 'authentication_required' });
    try {
      const owner = await deps.authenticate(authorization.slice(7));
      if (!owner) return reply(401, { error: 'authentication_required' });
      let context = await deps.context(authorization);
      assertOwner(context, owner);
      if (req.method === 'POST') {
        const text = await req.text();
        if (text.length > 2048) return reply(400, { error: 'invalid_request' });
        let body: Record<string, unknown>;
        try { body = JSON.parse(text); } catch { return reply(400, { error: 'invalid_request' }); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'invalid_request' });
        // Recommendations and goal mutations are unconditionally unavailable, even if a
        // malicious client supplies a review ID, target numbers, or safety override.
        if (['dynamic_review','dynamic_accept','dynamic_reject'].includes(String(body.action)))
          return reply(409, { error: 'safety_review_required' });
        if (body.action !== 'dynamic_settings' || Object.keys(body).some(k => !['action','enabled','reviewDay'].includes(k)) ||
          typeof body.enabled !== 'boolean' || !Number.isInteger(body.reviewDay) || Number(body.reviewDay)<0 || Number(body.reviewDay)>6)
          return reply(400, { error: 'invalid_request' });
        context = await deps.settings(authorization, body.enabled, Number(body.reviewDay));
        assertOwner(context, owner);
        // A successful private settings mutation is not masked by a later source read.
        return reply(200, view(context, null));
      }
      let estimate: DynamicTdeeResult | null = null;
      if (context.premium && context.enabled) {
        const now = deps.now?.() ?? new Date();
        const fingerprint = context.fingerprint;
        const sources = await deps.read(owner, authorization, now);
        if (todayInZone(now, sources.timezone) !== context.today) return reply(409, { error: 'context_changed' });
        estimate = estimateFromSources(sources, now);
        context = await deps.context(authorization);
        assertOwner(context, owner);
        if (context.fingerprint !== fingerprint || !context.premium || !context.enabled)
          return reply(409, { error: 'context_changed' });
      }
      return reply(200, requestedView === 'estimate' ? markedEstimate(estimate ?? emptyTdee()) : view(context, estimate));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const safe = knownErrors.has(message) ? message : 'source_error';
      return reply(safe === 'authentication_required' ? 401 : ['preview_access_denied','premium_required'].includes(safe) ? 403 : safe === 'invalid_request' ? 400 : 503, { error: safe });
    }
  };
}
