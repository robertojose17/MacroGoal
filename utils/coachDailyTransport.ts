import type { DailyMealSlot } from './coachDailyAction';
type Body = { intent: 'today' | 'recommend'; meal_type?: DailyMealSlot };
type Store = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };
type Client = { auth: { getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }> }; functions: { invoke(name: string, options: { body: Record<string, unknown> }): Promise<{ data: any; error: any }> } };
const locks = new Set<string>();
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const response = (error: string, status = 503) => jsonResponse({ error, next_action: 'recover_existing_request' }, status);
const knownDenials = new Set(['budget_limit', 'limit', 'entitlement_unavailable', 'unauthorized', 'execution_admission_paused']);

// Existing v202 manual-entry contract. No new endpoint or provider call.
// A pending record is recovery-only, including after reload or uncertain dispatch.
export function createCoachDailyTransport(client: Client, store: Store, scope: string, day: () => string, timeZone: () => string, newId: () => string) {
  const owner = async () => { const auth = await client.auth.getUser(); return auth.error ? undefined : auth.data.user?.id; };
  async function send(body: Body, recoverOnly: boolean): Promise<Response> {
    let key: string | undefined;
    let locked = false;
    try {
      const account = await owner(); if (!account) return response('unauthorized', 401);
      const date = day(); const zone = timeZone();
      key = 'coach_daily_request_v1:' + JSON.stringify([scope, account, date, body.intent, body.meal_type ?? null]);
      if (locks.has(key)) return response('execution_active', 409);
      locks.add(key); locked = true;
      const current = async () => await owner() === account && day() === date && timeZone() === zone;
      const previous = await store.getItem(key);
      if (previous && !recoverOnly) return response('execution_unresolved', 409);
      if (!previous && recoverOnly) return response('no_pending_request', 404);
      const record = previous ? JSON.parse(previous) : { owner: account, date, envelope: { ...body, request_id: newId(), time_zone: zone } };
      const envelope = record?.envelope;
      if (record.owner !== account || record.date !== date || !envelope || !uuid(envelope.request_id) || envelope.intent !== body.intent || envelope.meal_type !== body.meal_type || envelope.time_zone !== zone || Object.keys(envelope).some(k => !['intent','meal_type','request_id','time_zone'].includes(k))) return response('journal_scope_mismatch', 409);
      if (!previous) await store.setItem(key, JSON.stringify(record));
      if (!await current()) return response('authorization_or_day_changed', 409);
      const sent = previous ? { intent: 'recover_daily', request_id: envelope.request_id } : envelope;
      const result = await client.functions.invoke('ai-coach', { body: sent });
      let res: Response;
      if (result.error) {
        const context = result.error.context;
        // Preserve actual function HTTP denials; network errors remain uncertain.
        if (!context || typeof context.clone !== 'function' || typeof context.status !== 'number') return response('dispatch_unknown');
        res = context;
      } else res = jsonResponse(result.data);
      const output = await res.clone().json();
      if (!await current()) return response('authorization_or_day_changed', 409);
      const receiptMatches = output?.owner === account && output?.date === date && (body.intent === 'today'
        ? output.status === 'ready' && output.coverage === 'logged_only'
        : output.schema === 'saved_meal_recommendations_v1' && output.meal_type === body.meal_type && ['options','no_options'].includes(output.status));
      const notAdmitted = !previous && !res.ok && output?.request_id === envelope.request_id && output.admission_state === 'not_admitted' && knownDenials.has(output.error);
      if (res.ok && !receiptMatches) return response('receipt_scope_mismatch', 409);
      if (res.ok && receiptMatches || notAdmitted) await store.removeItem(key);
      return res;
    } catch { return response('dispatch_or_recovery_unknown'); }
    finally { if (locked && key) locks.delete(key); }
  }
  return { owner, request: (body: Body) => send(body, false), recover: (body: Body) => send(body, true) };
}
